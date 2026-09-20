#!/usr/bin/env node

// PreToolUseの安全guard。denyするのは「秘密情報への到達」と「不可逆な破壊」だけに絞る。
// 復旧可能だが影響の大きい操作（rmやchmod、curl等）はここでは止めず、
// Claudeのpermissions.ask / Codexのexecpolicy(prompt)で人が判断する。

import process from 'node:process';
import { pathToFileURL } from 'node:url';

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const normalizePath = value => value.replaceAll('\\', '/');

const sensitivePatterns = [
  new RegExp(`(^|[\\s'"/])\\.${'env'}(?:\\.(?!example(?:[\\s'"/]|$))[^\\s'"/]*)?(?=[\\s'"/]|$)`, 'i'),
  new RegExp(`(^|[\\s'"/])${'credentials'}.json(?=[\\s'"/]|$)`, 'i'),
  new RegExp(`(^|[\\s'"/])id_(?:${'rsa'}|${'ed25519'})(?=[\\s'"/]|$)`, 'i'),
  new RegExp(`\\.(?:${'key'}|${'pem'}|${'p12'}|${'pfx'})(?=[\\s'"/]|$)`, 'i'),
];

const isSensitiveReference = value => {
  const normalized = normalizePath(value);
  return sensitivePatterns.some(pattern => pattern.test(normalized));
};

const collectValuesForKeys = (value, acceptedKeys, currentKey = '') => {
  if (typeof value === 'string') {
    return acceptedKeys.has(currentKey) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(item => collectValuesForKeys(item, acceptedKeys, currentKey));
  }
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, child]) =>
    collectValuesForKeys(child, acceptedKeys, key),
  );
};

const extractPatchPaths = patch => {
  if (typeof patch !== 'string') return [];
  return patch
    .split('\n')
    .map(line => line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/)?.[1])
    .filter(Boolean);
};

const isDocumentationCommand = command => {
  const trimmed = command.trim();
  return /^(?:echo|printf)\b/.test(trimmed) && !/[|;`]|\$\(/.test(trimmed);
};

const commandBodies = (command, executable) => {
  const escaped = executable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[\\s;&|'\"])(?:[^\\s;&|]*/)?${escaped}\\b([^\\n;&|]*)`, 'gi');
  return [...command.matchAll(pattern)].map(match => match[1]);
};

const shellWords = value => value.match(/(?:"[^"]*"|'[^']*'|[^\s]+)/g)?.map(word =>
  word.replace(/^(?:"(.*)"|'(.*)')$/, '$1$2'),
) ?? [];

const hasRecursiveFlag = words =>
  words.some(word => word === '--recursive' || word === '--dereference-recursive' || /^-[^-]*[rR]/.test(word));

const positionalArgs = words => words.filter(word => !word.startsWith('-'));

const gitInvocationIsDangerous = body => {
  const words = shellWords(body);
  let index = 0;
  while (index < words.length && words[index].startsWith('-')) {
    if (['-C', '-c', '--git-dir', '--work-tree'].includes(words[index])) index += 2;
    else index += 1;
  }
  const subcommand = words[index];
  const args = words.slice(index + 1);
  if (subcommand === 'reset') return args.includes('--hard');
  if (subcommand === 'clean') return args.some(arg => /^-[^-]*f/i.test(arg) || arg === '--force');
  if (subcommand === 'branch') return args.includes('-D');
  if (['checkout', 'restore'].includes(subcommand)) return args.includes('--');
  if (subcommand !== 'push') return false;
  return args.some(arg =>
    arg === '-f' || arg === '--delete' || arg.startsWith('--force') || /^(?:\+|:)|:$/.test(arg),
  );
};

// 再帰削除のうち、作業ツリー全体・ホーム・ルート・.gitを対象にするものだけを不可逆とみなす。
// build成果物やnode_modulesの削除は再生成できるため、permissionsのaskに委ねる。
const isCriticalRemoval = body => {
  const words = shellWords(body);
  if (!hasRecursiveFlag(words)) return false;
  return positionalArgs(words).some(target => {
    const normalized = normalizePath(target).replace(/\/+$/, '');
    return ['', '/', '~', '$HOME', '.', '..', '*', '.git'].includes(normalized) ||
      /^\/[^/]+$/.test(normalized) ||
      /^(?:~|\$HOME)$/.test(normalized) ||
      /(?:^|\/)\.git$/.test(normalized);
  });
};

const isWorldWritableRecursiveChmod = body => {
  const words = shellWords(body);
  return hasRecursiveFlag(words) && words.some(word => /^[0-7]?777$/.test(word));
};

const isPipeToShell = command =>
  ['curl', 'wget'].some(executable =>
    commandBodies(command, executable).length > 0,
  ) && /\|\s*(?:sudo\s+)?(?:[^\s;&|]*\/)?(?:ba|z|da)?sh\b/.test(command);

const isInfrastructureTeardown = command =>
  commandBodies(command, 'terraform').some(body => /(?:^|\s)destroy\b/.test(body)) ||
  commandBodies(command, 'kubectl').some(body => /(?:^|\s)delete\s+(?:namespace|ns)\b/.test(body));

const databaseClients = ['psql', 'mysql', 'mariadb', 'sqlite3', 'wrangler', 'prisma', 'supabase'];
const destructiveSql = /\bDROP\s+(?:DATABASE|SCHEMA)\b|\bTRUNCATE\s+(?:TABLE\s+)?[A-Za-z0-9_."]+/i;
const isDestructiveDatabaseCommand = command =>
  databaseClients.some(client => commandBodies(command, client).some(body => destructiveSql.test(body)));

const isDangerousCommand = command => {
  if (isDocumentationCommand(command)) return false;
  if (isPipeToShell(command)) return true;
  if (isInfrastructureTeardown(command)) return true;
  if (isDestructiveDatabaseCommand(command)) return true;
  if (commandBodies(command, 'chmod').some(isWorldWritableRecursiveChmod)) return true;
  if (commandBodies(command, 'rm').some(isCriticalRemoval)) return true;
  if (commandBodies(command, 'git').some(gitInvocationIsDangerous)) return true;
  if (commandBodies(command, 'find').some(body =>
    /(?:^|\s)-delete\b/.test(body) || /(?:^|\s)-exec(?:dir)?\s+(?:\S*\/)?rm\b/.test(body),
  )) return true;
  // inline scriptは引用符内の ; で本文が切れるため、-c の有無だけ本文で見て削除APIはコマンド全体で探す。
  return commandBodies(command, 'python').concat(commandBodies(command, 'python3'))
    .some(body => /\s-c(?:\s|$)/.test(body)) && /(?:rmtree|unlink|os\.remove)/.test(command);
};

// 秘密情報を含み得る本文検索だけを止める。grepは再帰かつ広い対象のとき、
// rgは.gitignoreを無視する指定があるときに限る（rg / Grepツールは既定で.gitignoreを尊重する）。
const isBroadGrepTarget = words => {
  const paths = positionalArgs(words).slice(1);
  return paths.length === 0 || paths.some(target => {
    const normalized = normalizePath(target).replace(/\/+$/, '');
    return ['', '.', '..', '/', '~', '$HOME', '*'].includes(normalized) || /^(?:~|\$HOME)\//.test(normalized);
  });
};

const ignoresVcsIgnoreFiles = words =>
  words.some(word => /^--no-ignore/.test(word) || word === '--unrestricted' || /^-[^-]*u/.test(word));

const isBroadShellContentSearch = command =>
  !isDocumentationCommand(command) && (
    commandBodies(command, 'grep').some(body => {
      const words = shellWords(body);
      return hasRecursiveFlag(words) && isBroadGrepTarget(words);
    }) ||
    commandBodies(command, 'rg').some(body => {
      const words = shellWords(body);
      return ignoresVcsIgnoreFiles(words) && !words.includes('--files');
    })
  );

// globはbrace展開 {a,b} の内側も対象にする。
const isSensitiveGlob = value => {
  const normalized = normalizePath(value);
  return isSensitiveReference(normalized) ||
    /(?:^|[/{,])\.env(?:[.*?{,}]|\/|$)/i.test(normalized) ||
    /(?:^|[/{,])(?:credentials\.json|id_(?:rsa|ed25519)|[^/{,]+\.(?:key|pem|p12|pfx))(?:$|[,*?}])/i.test(normalized);
};

const result = (decision, reason = '') => ({ decision, reason });

export const evaluateHookInput = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return result('deny', 'Hook入力がobjectではありません。');
  }

  const toolName = String(input.tool_name ?? input.toolName ?? '');
  const toolInput = input.tool_input ?? input.toolInput ?? input;

  if (toolName === 'Bash' || toolName === 'exec_command') {
    const commands = collectValuesForKeys(toolInput, new Set(['command', 'cmd']));
    if (commands.some(isSensitiveReference)) {
      return result('deny', '秘密情報ファイルへのshellアクセスをブロックしました。');
    }
    if (commands.some(isBroadShellContentSearch)) {
      return result('deny', '秘密情報を除外できないshell本文検索をブロックしました。対象pathを絞るか、.gitignoreを尊重するrgを使ってください。');
    }
    if (commands.some(isDangerousCommand)) {
      return result('deny', '不可逆な破壊操作をブロックしました。');
    }
    return result('allow');
  }

  if (toolName === 'apply_patch') {
    const patches = collectValuesForKeys(toolInput, new Set(['patch', 'input']));
    const paths = patches.flatMap(extractPatchPaths);
    return paths.some(isSensitiveReference)
      ? result('deny', '秘密情報ファイルを対象とするpatchをブロックしました。')
      : result('allow');
  }

  if (toolName === 'Glob') {
    const patterns = collectValuesForKeys(toolInput, new Set(['pattern', 'glob']));
    return patterns.some(isSensitiveGlob)
      ? result('deny', '秘密情報ファイルを対象とするGlobをブロックしました。')
      : result('allow');
  }

  if (toolName === 'Grep') {
    const paths = collectValuesForKeys(toolInput, new Set(['path', 'paths']));
    const globs = collectValuesForKeys(toolInput, new Set(['glob', 'include']));
    // Grepツールはripgrepで.gitignoreを尊重するため、秘密ファイルを名指ししない限り許可する。
    return paths.some(isSensitiveReference) || globs.some(isSensitiveGlob)
      ? result('deny', '秘密情報ファイルを対象とするGrepをブロックしました。')
      : result('allow');
  }

  const pathKeys = new Set([
    'file_path',
    'filePath',
    'path',
    'paths',
    'directory',
    'cwd',
  ]);
  const paths = collectValuesForKeys(toolInput, pathKeys);
  return paths.some(isSensitiveReference)
    ? result('deny', '秘密情報ファイルへのアクセスまたは変更をブロックしました。')
    : result('allow');
};

const deny = reason => {
  process.stderr.write(`${reason}\n`);
  process.exitCode = 2;
};

const run = async () => {
  try {
    const raw = await readStdin();
    const input = raw.trim() ? JSON.parse(raw) : {};
    const evaluation = evaluateHookInput(input);
    if (evaluation.decision === 'deny') deny(evaluation.reason);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deny(`Hook入力を安全に検証できなかったため処理をブロックしました: ${message}`);
  }
};

const isMain = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isMain) await run();
