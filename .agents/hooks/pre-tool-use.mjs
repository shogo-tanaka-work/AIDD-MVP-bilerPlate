#!/usr/bin/env node

import process from 'node:process';

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const collectStrings = value => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectStrings);
  return [];
};

const normalizePath = value => value.replaceAll('\\\\', '/');
const isSensitiveReference = value => {
  const normalized = normalizePath(value);
  return [
    /(^|[\s'"/])\.env(?:\.(?!example(?:[\s'"/]|$))[^\s'"/]*)?(?=[\s'"/]|$)/i,
    /(^|[\s'"/])credentials\.json(?=[\s'"/]|$)/i,
    /(^|[\s'"/])id_(?:rsa|ed25519)(?=[\s'"/]|$)/i,
    /\.(?:key|pem|p12|pfx)(?=[\s'"/]|$)/i
  ].some(pattern => pattern.test(normalized));
};

const deny = reason => {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
};

try {
  const raw = await readStdin();
  const input = raw.trim() ? JSON.parse(raw) : {};
  const values = collectStrings(input.tool_input ?? input.toolInput ?? input);
  if (values.some(isSensitiveReference)) {
    deny('秘密情報ファイルへのアクセスまたは変更をブロックしました。.env.exampleや変数名だけを参照してください。');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  deny(`Hook入力を安全に検証できなかったため処理をブロックしました: ${message}`);
}
