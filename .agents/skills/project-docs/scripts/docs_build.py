"""docs の目次（docs/目次.md）・コマンド一覧・人間向けの HTML（docs/閲覧用HTML/）を作る（project-docs スキルの参照実装）。

  python scripts/docs_build.py --title "<PJ名> ドキュメント"            書き出す
  python scripts/docs_build.py --title "<PJ名> ドキュメント" --check    書き出さずに、生成物が最新かだけを確かめる
  python scripts/docs_build.py ... --argparse <pkg>.cli:build_parser    コマンド一覧も argparse の定義から作る
  python scripts/docs_build.py ... --order "02_アーキテクチャ=システム構成.md,処理の流れ.md"

依存: markdown-it-py。PJ の scripts/ にコピーして使う。既定値（ROOT・DOCS_DIR 等）は PJ に合わせて書き換えてよい。

md がエージェントと人の両方が読む正本で、HTML はそこから作る派生物なので手で編集しない。
入力は番号付きフォルダ（01_〜）の md。レイアウトは 3 列（左: フォルダとページ、中央: 本文、右: このページの内容）で、
外部の CSS・JS・フォントは読まない。パスはすべて docs からの相対パス（/ 区切り）で扱う。
生成の計算（build_site）は純粋関数にし、ファイルの読み書きは main だけで行う。
"""

from __future__ import annotations

import argparse
import importlib
import posixpath
import re
import sys
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from html import escape
from pathlib import Path
from typing import Final
from urllib.parse import quote, unquote

from markdown_it import MarkdownIt
from markdown_it.token import Token

ROOT: Final = Path(__file__).resolve().parent.parent
DOCS_DIR: Final = ROOT / "docs"
SITE_DIR: Final = "閲覧用HTML"
INDEX_MD: Final = "目次.md"
COMMANDS_MD: Final = "05_運用マニュアル/コマンド一覧.md"
FOLDER: Final = re.compile(r"^\d{2}_")
HTML_COMMENT: Final = re.compile(r"^<!--.*-->[ \t]*\n?", flags=re.MULTILINE)


@dataclass(frozen=True)
class Config:
    title: str = "ドキュメント"
    build_command: str = "python scripts/docs_build.py"
    # フォルダの中の並び順。載っていないページはその後ろにファイル名の順で並べる
    order: tuple[tuple[str, tuple[str, ...]], ...] = ()

    @property
    def mark(self) -> str:
        return f"<!-- 自動生成: `{self.build_command}` で作る。手で編集しない -->"


@dataclass(frozen=True)
class SourceDoc:
    path: str  # docs からの相対パス
    text: str


@dataclass(frozen=True)
class Heading:
    level: int  # 2 か 3
    text: str
    anchor: str


@dataclass(frozen=True)
class Page:
    source: str  # 元の md のパス
    file: str  # 書き出す HTML のパス
    title: str
    body: str  # 本文の HTML（エスケープ済み）
    headings: tuple[Heading, ...]


# ---------------------------------------------------------------- パスとリンク

def is_source(path: str) -> bool:
    """HTML にする md か。番号付きフォルダの中の md だけ（閲覧用HTML/ などは対象外）"""
    folder, _, rest = path.partition("/")
    return bool(rest) and bool(FOLDER.match(folder)) and path.endswith(".md")


def folder_title(folder: str) -> str:
    """01_仕様 → 01 仕様"""
    return folder.replace("_", " ")


def page_label(path: str) -> str:
    """ナビ・目次に出す名前。ファイル名から作る（文字起こしの判定ロジック.md → 文字起こしの判定ロジック）"""
    return posixpath.basename(path).removesuffix(".md").replace("_", " ")


def html_path(md_path: str) -> str:
    if md_path == INDEX_MD:
        return f"{SITE_DIR}/index.html"
    return f"{SITE_DIR}/{md_path.removesuffix('.md')}.html"


def relative_href(from_file: str, to_file: str, fragment: str = "") -> str:
    href = quote(posixpath.relpath(to_file, posixpath.dirname(from_file) or "."))
    return href + (f"#{quote(fragment)}" if fragment else "")


def rewrite_link(href: str, source_md: str, md_paths: frozenset[str]) -> str:
    """md の中の相対リンクを、HTML の置き場所から見たリンクにする。md へのリンクは HTML 版へ張り替える"""
    if href.startswith("#") or re.match(r"^[a-z][a-z0-9+.-]*:", href):
        return href
    path, _, fragment = href.partition("#")
    target = posixpath.normpath(posixpath.join(posixpath.dirname(source_md), unquote(path)))
    to_file = html_path(target) if target in md_paths else target  # それ以外（docs の外も含む）は元のファイルを指す
    return relative_href(html_path(source_md), to_file, unquote(fragment))


def sort_key(path: str, config: Config) -> tuple[str, int, str]:
    folder, _, name = path.partition("/")
    order = dict(config.order).get(folder, ())
    return (folder, order.index(name) if name in order else len(order), name)


# ---------------------------------------------------------------- md → HTML

def _slug(text: str, used: set[str]) -> str:
    """GitHub と同じ規則のアンカー。md の [..](#..) が GitHub でも閲覧用HTML でも同じ節を指すようにする"""
    base = re.sub(r"[^\w\- ]", "", text.strip().lower()).replace(" ", "-")
    anchor, n = base, 1
    while anchor in used:
        anchor, n = f"{base}-{n}", n + 1
    used.add(anchor)
    return anchor


def _inline_text(token: Token) -> str:
    return "".join(child.content for child in token.children or [] if child.type in {"text", "code_inline"})


def _is_wide(char: str) -> bool:
    return bool(char) and ord(char) > 0x2E7F  # CJK の記号・かな・漢字・全角形


def _softbreak(self: object, tokens: Sequence[Token], idx: int, options: object, env: object) -> str:
    """md の改行は、日本語の文どうしなら詰める。英語の語の間ならスペースにする"""
    before = tokens[idx - 1].content[-1:] if idx > 0 else ""
    after = tokens[idx + 1].content[:1] if idx + 1 < len(tokens) else ""
    return "" if _is_wide(before) or _is_wide(after) else "\n"


def markdown_page(doc: SourceDoc, md_paths: frozenset[str]) -> Page:
    """md を本文の HTML にする。生の HTML は通さない。h2・h3 に id を付け、相対リンクを張り替える"""
    parser = MarkdownIt("commonmark", {"html": False}).enable("table")
    parser.add_render_rule("softbreak", _softbreak)
    tokens = parser.parse(HTML_COMMENT.sub("", doc.text))
    used: set[str] = set()
    headings: list[Heading] = []
    for index, token in enumerate(tokens):
        if token.type == "heading_open" and token.tag in {"h2", "h3"}:
            text = _inline_text(tokens[index + 1])
            anchor = _slug(text, used)
            token.attrSet("id", anchor)
            headings.append(Heading(int(token.tag[1]), text, anchor))
        for child in token.children or []:
            href = child.attrGet("href") if child.type == "link_open" else None
            if isinstance(href, str):
                child.attrSet("href", rewrite_link(href, doc.path, md_paths))
    body = parser.renderer.render(tokens, parser.options, {})
    return Page(doc.path, html_path(doc.path), page_label(doc.path), body, tuple(headings))


# ---------------------------------------------------------------- 自動生成する md

def index_markdown(docs: Sequence[SourceDoc], config: Config) -> str:
    """目次.md。フォルダごとにページを並べる（エージェントの入口にもなる）"""
    lines = [config.mark, "", "# 目次", "",
             "docs の全ドキュメント。人が読むときは `閲覧用HTML/index.html` をブラウザで開く。", ""]
    for folder in sorted({doc.path.split("/", 1)[0] for doc in docs}):
        lines += [f"## {folder_title(folder)}", ""]
        lines += [f"- [{page_label(doc.path)}]({quote(doc.path)})" for doc in docs if doc.path.startswith(f"{folder}/")]
        lines.append("")
    return "\n".join(lines)


def _option_rows(parser: argparse.ArgumentParser) -> list[str]:
    rows = []
    for action in parser._actions:  # argparse に公開の一覧 API がないため
        if isinstance(action, (argparse._HelpAction, argparse._SubParsersAction)):
            continue
        names = ", ".join(f"`{s}`" for s in action.option_strings) or f"`{action.dest}`（位置引数）"
        if action.choices:
            names += "<br>" + " / ".join(f"`{c}`" for c in action.choices)
        help_text = (action.help or "").replace("|", "\\|").replace("\n", " ")
        rows.append(f"| {names} | {help_text} |")
    return rows


def command_reference_markdown(parser: argparse.ArgumentParser, config: Config, source: str) -> str:
    """コマンド一覧.md。コマンドの説明とオプションはコード（argparse の定義）が正本なので、そこから作る"""
    lines = [f"<!-- 自動生成: `{config.build_command}` で作る。手で編集しない。正本は {source} -->", "",
             "# コマンド一覧", "",
             f"`{parser.prog}` のコマンドとオプション。", ""]
    sub_actions = [a for a in parser._actions if isinstance(a, argparse._SubParsersAction)]
    if not sub_actions:  # サブコマンドのない CLI
        lines += ["| オプション | 説明 |", "|---|---|", *_option_rows(parser), ""]
    for sub in sub_actions:
        helps = {choice.dest: choice.help for choice in sub._choices_actions}
        for name, subparser in sub.choices.items():
            lines += [f"## {parser.prog} {name}", "", helps.get(name) or subparser.description or "", "",
                      "| オプション | 説明 |", "|---|---|", *_option_rows(subparser), ""]
    return "\n".join(lines)


# ---------------------------------------------------------------- 組み立て

def _nav(pages: Sequence[Page], current: Page) -> str:
    groups: dict[str, list[str]] = {}
    for page in pages:
        if page.source == INDEX_MD:
            continue
        folder = page.source.split("/", 1)[0]
        active = page.file == current.file
        sub = ""
        if active:  # 開いているページだけ、h2 をナビに並べる
            links = (f"<li><a href='{escape(relative_href(current.file, page.file, h.anchor))}'>{escape(h.text)}</a></li>"
                     for h in page.headings if h.level == 2)
            sub = f"<ul>{''.join(links)}</ul>"
        current_attr = " aria-current='page'" if active else ""
        groups.setdefault(folder, []).append(
            f"<li><a class='nav-page' href='{escape(relative_href(current.file, page.file))}'{current_attr}>"
            f"{escape(page.title)}</a>{sub}</li>")
    return "\n".join(
        f"<section class='nav-group'><p class='nav-folder'>{escape(folder_title(folder))}</p>"
        f"<ul class='nav-pages'>{''.join(items)}</ul></section>"
        for folder, items in sorted(groups.items()))


def _toc(page: Page) -> str:
    items = "".join(f"<li class='toc-l{h.level}'><a href='#{escape(quote(h.anchor))}'>{escape(h.text)}</a></li>"
                    for h in page.headings)
    return f"<p class='toc-title'>このページの内容</p><ul>{items}</ul>"


def _crumb(page: Page) -> str:
    if page.source == INDEX_MD:
        return "目次"
    return f"{folder_title(page.source.split('/', 1)[0])} / {page.title}"


def render(pages: Sequence[Page], current: Page, config: Config) -> str:
    return TEMPLATE.format(
        title=escape(f"{current.title} | {config.title}"), site=escape(config.title),
        home=escape(relative_href(current.file, html_path(INDEX_MD))), crumb=escape(_crumb(current)),
        nav=_nav(pages, current), body=current.body, toc=_toc(current), css=CSS, js=JS, mark=config.mark)


def build_site(docs: Sequence[SourceDoc], generated: dict[str, str], config: Config = Config()) -> dict[str, str]:
    """書き出すファイル（docs からの相対パス → 中身）。generated は自動生成の md（コマンド一覧など）"""
    all_docs = [d for d in docs if d.path not in generated] + [SourceDoc(p, t) for p, t in generated.items()]
    sources = sorted((d for d in all_docs if is_source(d.path)), key=lambda d: sort_key(d.path, config))
    md_paths = frozenset({d.path for d in sources} | {INDEX_MD})
    index = index_markdown(sources, config)
    pages = [markdown_page(SourceDoc(INDEX_MD, index), md_paths)]
    pages += [markdown_page(d, md_paths) for d in sources]
    return {INDEX_MD: index, **generated} | {page.file: render(pages, page, config) for page in pages}


# ---------------------------------------------------------------- 入出力（境界）

def _nfc(path: Path) -> str:
    return unicodedata.normalize("NFC", path.relative_to(DOCS_DIR).as_posix())  # macOS のファイル名は NFD のことがある


def read_docs(docs_dir: Path = DOCS_DIR) -> list[SourceDoc]:
    return [SourceDoc(_nfc(p), p.read_text(encoding="utf-8")) for p in sorted(docs_dir.rglob("*.md"))
            if SITE_DIR not in p.relative_to(docs_dir).parts]


def argparse_generated(target: str, config: Config) -> dict[str, str]:
    """`pkg.module:function` が返す ArgumentParser からコマンド一覧を作る"""
    module_name, _, func_name = target.partition(":")
    sys.path.insert(0, str(ROOT))
    parser = getattr(importlib.import_module(module_name), func_name)()
    return {COMMANDS_MD: command_reference_markdown(parser, config, module_name.replace(".", "/") + ".py")}


def _parse_order(values: Sequence[str]) -> tuple[tuple[str, tuple[str, ...]], ...]:
    pairs = (v.split("=", 1) for v in values if "=" in v)
    return tuple((folder, tuple(n.strip() for n in names.split(",") if n.strip())) for folder, names in pairs)


def stale_files(outputs: dict[str, str], docs_dir: Path = DOCS_DIR) -> list[str]:
    """内容が違う・無いファイルと、生成物の置き場に残った古い HTML"""
    stale = [p for p, text in outputs.items() if not (docs_dir / p).is_file()
             or (docs_dir / p).read_text(encoding="utf-8") != text]
    site = docs_dir / SITE_DIR
    leftovers = [_nfc(p) for p in site.rglob("*.html")] if site.is_dir() else []
    return stale + [p for p in leftovers if p not in outputs]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="docs の目次・コマンド一覧・閲覧用HTML を作る")
    ap.add_argument("--check", action="store_true", help="書き出さずに、生成物が最新かだけを確かめる")
    ap.add_argument("--title", default=Config.title, help="サイトの名前（例: 〇〇 ドキュメント）")
    ap.add_argument("--build-command", default=Config.build_command, help="生成物に書く、作り直すときのコマンド")
    ap.add_argument("--argparse", default=None, metavar="MODULE:FUNC",
                    help=f"ArgumentParser を返す関数。指定すると {COMMANDS_MD} を作る")
    ap.add_argument("--order", action="append", default=[], metavar="FOLDER=a.md,b.md",
                    help="フォルダの中のページの並び順（複数指定可）")
    a = ap.parse_args(argv)
    config = Config(a.title, a.build_command, _parse_order(a.order))
    generated = argparse_generated(a.argparse, config) if a.argparse else {}
    outputs = build_site(read_docs(), generated, config)
    stale = stale_files(outputs)
    if a.check:
        if stale:
            print(f"docs の生成物が古くなっています。`{config.build_command}` を実行してください:", *stale, sep="\n  ")
            return 1
        print("docs の生成物は最新です")
        return 0
    for path in stale:
        target = DOCS_DIR / path
        if path in outputs:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(outputs[path], encoding="utf-8")
        else:
            target.unlink()  # md を消したり名前を変えたりして、元がなくなった HTML
    print(f"docs を書き出しました（更新 {len(stale)} 件）")
    return 0


TEMPLATE: Final = """<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy"
 content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
{mark}
<title>{title}</title>
<style>{css}</style>
</head>
<body>
<header class="topbar">
<button class="menu" type="button" aria-label="ナビを開く" aria-expanded="false">☰</button>
<a class="site" href="{home}">{site}</a>
</header>
<div class="layout">
<nav class="sidebar" aria-label="ドキュメント">
<input class="filter" type="search" placeholder="絞り込み" aria-label="ナビを絞り込む">
{nav}
</nav>
<main class="content">
<p class="crumb">{crumb}</p>
<article>
{body}
</article>
</main>
<aside class="toc" aria-label="このページの内容">{toc}</aside>
</div>
<script>{js}</script>
</body>
</html>
"""

CSS: Final = """
:root{--bg:#fff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--soft:#f6f8fa;--accent:#c15f3c;--code:#eff2f5;}
@media (prefers-color-scheme: dark){
  :root{--bg:#16181d;--fg:#e6e8eb;--muted:#9aa4af;--line:#30363d;--soft:#1e2128;--accent:#e08a63;--code:#262a31;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:15px/1.75 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em;background:var(--code);
  padding:.1em .35em;border-radius:4px}
pre{background:var(--code);padding:12px 14px;border-radius:8px;overflow-x:auto;line-height:1.5}
pre code{padding:0;background:none}
.topbar{position:sticky;top:0;z-index:10;height:56px;display:flex;align-items:center;gap:12px;padding:0 20px;
  border-bottom:1px solid var(--line);background:var(--bg)}
.site{font-weight:700;color:var(--fg)}
.menu{display:none;background:none;border:1px solid var(--line);color:var(--fg);border-radius:6px;
  padding:2px 8px;font-size:18px}
.layout{display:grid;grid-template-columns:260px minmax(0,1fr) 220px;max-width:1440px;margin:0 auto}
.sidebar,.toc{position:sticky;top:56px;height:calc(100vh - 56px);overflow-y:auto;padding:20px 16px}
.sidebar{border-right:1px solid var(--line)}
.filter{width:100%;padding:6px 10px;margin-bottom:12px;border:1px solid var(--line);border-radius:6px;
  background:var(--soft);color:var(--fg)}
.nav-group{margin-bottom:18px}
.nav-folder{margin:0 0 4px;padding:0 8px;font-size:12px;font-weight:700;color:var(--muted);letter-spacing:.04em}
.nav-pages{list-style:none;margin:0;padding:0}
.nav-page{display:block;padding:4px 8px;border-radius:6px;color:var(--fg);font-size:14px;line-height:1.5}
.nav-page[aria-current=page]{background:var(--soft);color:var(--accent);font-weight:600}
.nav-pages ul{list-style:none;margin:2px 0 6px 10px;padding:0 0 0 8px;border-left:1px solid var(--line)}
.nav-pages ul a{display:block;padding:2px 8px;color:var(--muted);font-size:13px;line-height:1.5}
.nav-pages ul a:hover{color:var(--fg)}
.content{padding:28px 48px 80px;min-width:0}
article{max-width:820px}
.crumb{margin:0 0 8px;color:var(--muted);font-size:13px}
h1{font-size:30px;line-height:1.3;margin:0 0 16px}
h2{font-size:22px;margin:40px 0 12px;padding-top:8px;border-top:1px solid var(--line);scroll-margin-top:72px}
h3{font-size:17px;margin:28px 0 8px;scroll-margin-top:72px}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
th{background:var(--soft)}
.toc{font-size:13px}
.toc-title{margin:0 0 8px;font-weight:600;color:var(--fg)}
.toc ul{list-style:none;margin:0;padding:0;border-left:1px solid var(--line)}
.toc li a{display:block;padding:3px 10px;color:var(--muted);border-left:2px solid transparent;margin-left:-1px}
.toc li.toc-l3 a{padding-left:22px}
.toc li a.active{color:var(--accent);border-left-color:var(--accent)}
@media (max-width:1180px){.layout{grid-template-columns:240px minmax(0,1fr)}.toc{display:none}}
@media (max-width:800px){.layout{display:block}.menu{display:inline-block}
.sidebar{display:none;position:fixed;top:56px;left:0;width:100%;height:calc(100vh - 56px);background:var(--bg);
  z-index:9;border-right:none}
body.nav-open .sidebar{display:block}.content{padding:20px 16px 60px}}
"""

JS: Final = """
(()=>{
const body=document.body,menu=document.querySelector('.menu');
menu.addEventListener('click',()=>{const open=body.classList.toggle('nav-open');menu.setAttribute('aria-expanded',open)});
document.querySelectorAll('.sidebar a').forEach(a=>a.addEventListener('click',()=>body.classList.remove('nav-open')));
const filter=document.querySelector('.filter');
filter.addEventListener('input',()=>{const q=filter.value.trim().toLowerCase();
document.querySelectorAll('.nav-group').forEach(group=>{let shown=0;
group.querySelectorAll('.nav-pages > li').forEach(li=>{const hit=!q||li.textContent.toLowerCase().includes(q);
li.style.display=hit?'':'none';if(hit)shown++});group.style.display=shown?'':'none'})});
const links=[...document.querySelectorAll('.toc a')];
const targets=links.map(a=>document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
const mark=()=>{let current=targets[0];for(const t of targets){if(t.getBoundingClientRect().top<120)current=t}
links.forEach(a=>a.classList.toggle('active',current&&decodeURIComponent(a.hash.slice(1))===current.id))};
document.addEventListener('scroll',mark,{passive:true});mark();
})();
"""


if __name__ == "__main__":
    sys.exit(main())
