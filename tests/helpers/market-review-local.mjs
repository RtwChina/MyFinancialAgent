#!/usr/bin/env node
// 仅使用既有测试配置、已安装 Wrangler 和 tests 内的独立本地 D1 state。
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { marketReviewSeedSql } from './market-review-fixtures.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const localD1 = Object.freeze({
  config: 'tests/testdata/config/wrangler.test.toml',
  database: 'my-financial-agent-test',
  persistTo: 'tests/.wrangler-state/market-review',
});
const configPath = path.join(root, localD1.config);
const wranglerPath = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
const require = createRequire(import.meta.url);

export function validateTestConfig(config) {
  const database = config.d1_databases?.[0];
  if (config.vars?.APP_ENV !== 'test' || config.d1_databases?.length !== 1 ||
      database?.binding !== 'DB' || database.database_name !== localD1.database ||
      typeof database.database_id !== 'string' || !database.database_id.trim() ||
      database.remote === true || config.dev?.remote === true || config.remote === true ||
      config.assets?.binding !== 'ASSETS') {
    throw new Error('拒绝非 APP_ENV=test、单一本地测试 DB/ASSETS 配置');
  }
  function existingPath(value, expected, directory) {
    if (typeof value !== 'string') throw new Error(`测试配置缺少路径：${expected}`);
    const resolved = fs.realpathSync(path.resolve(path.dirname(configPath), value));
    if (resolved !== fs.realpathSync(path.join(root, expected)) ||
        fs.statSync(resolved).isDirectory() !== directory) {
      throw new Error(`拒绝测试配置路径变更：${expected}`);
    }
    return resolved;
  }
  return Object.freeze({
    ...localD1,
    appEnv: config.vars.APP_ENV,
    database: database.database_name,
    databaseId: database.database_id,
    main: existingPath(config.main, 'cloudflare/worker/src/index.js', false),
    assets: existingPath(config.assets.directory, 'cloudflare/web', true),
    migrations: existingPath(database.migrations_dir, 'cloudflare/migrations', true),
  });
}

export function readLocalConfig() {
  // Wrangler 自带 TOML 解析器；指定绝对路径，不搜索/重定向到其他配置。
  const { experimental_readRawConfig } = require(path.join(root, 'node_modules/wrangler'));
  const result = experimental_readRawConfig({ config: configPath }, { useRedirectIfAvailable: false });
  if (result.redirected || result.configPath !== configPath) throw new Error('拒绝 Wrangler 配置重定向');
  return validateTestConfig(result.rawConfig);
}

export function localWranglerCommand(operation, value) {
  const config = readLocalConfig();
  if (!fs.existsSync(wranglerPath)) throw new Error('本地 Wrangler 未安装；不会下载依赖');
  let args;
  if (operation === 'migrate') {
    args = ['d1', 'migrations', 'apply', config.database];
  } else if (operation === 'query' && typeof value === 'string') {
    args = ['d1', 'execute', config.database, '--json', `--command=${value}`];
  } else if (operation === 'execute' && typeof value === 'string') {
    const file = path.resolve(root, value);
    if (path.dirname(file) !== path.join(root, config.persistTo) || !file.endsWith('.sql')) {
      throw new Error('SQL 文件必须位于固定的本地测试 state 目录');
    }
    args = ['d1', 'execute', config.database, '--file', file];
  } else {
    throw new Error(`不支持的本地 Wrangler 操作：${operation}`);
  }
  // Electron 的 Node 模式仍带 versions.electron；yargs 否则把脚本路径误作命令。
  // 只校正子进程运行时标识，既有 Wrangler 包装器及其子进程都沿用此 preload。
  const runtimeArgs = process.versions.electron ? ['--import', 'data:text/javascript,process.defaultApp=true'] : [];
  return {
    executable: process.execPath,
    args: [...runtimeArgs, wranglerPath, ...args, '--local', '--config', configPath, '--persist-to', path.join(root, config.persistTo)],
  };
}

function wrangler(operation, value) {
  const command = localWranglerCommand(operation, value);
  const env = { ...process.env, CI: '1', APP_ENV: 'test', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(root, localD1.persistTo, 'logs') };
  // 本地命令不携带线上 Cloudflare 凭证，也不继承 Wrangler 配置重定向。
  for (const key of Object.keys(env)) {
    if (/^(CLOUDFLARE_|CF_)/.test(key) || key === 'WRANGLER_CONFIG') delete env[key];
  }
  return execFileSync(command.executable, command.args, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function assertLocalApi(apiBase) {
  const url = new URL(apiBase);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`拒绝非本机 HTTP、带凭证或非根路径 API 地址：${apiBase}`);
  }
  return url;
}

export async function assertTestEnvironment(apiBase) {
  const base = assertLocalApi(apiBase);
  const response = await fetch(new URL('/api/health', base), {
    redirect: 'manual',
    credentials: 'omit',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`本地 health 状态错误：${response.status}（不跟随重定向）`);
  }
  const body = await response.json();
  if (body?.ok !== true || body.env !== 'test') throw new Error(`本地 Worker health 不是 ok/test：${JSON.stringify(body)}`);
}

export function applyLocalMigrations() {
  return wrangler('migrate');
}

export function executeLocalSql(sql) {
  readLocalConfig();
  const dir = path.join(root, localD1.persistTo);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `seed-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(file, sql, { flag: 'wx' });
  try {
    return wrangler('execute', file);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

export function queryLocalSql(sql) {
  const output = wrangler('query', sql);
  const parsed = JSON.parse(output.slice(output.indexOf('[')));
  if (!Array.isArray(parsed) || parsed.some((item) => item.success === false)) throw new Error('本地 D1 查询失败');
  return parsed[0]?.results || [];
}

export async function seedLocalMarketReview(apiBase = 'http://127.0.0.1:8787') {
  readLocalConfig();
  await assertTestEnvironment(apiBase);
  executeLocalSql(marketReviewSeedSql());
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  let apiBase = 'http://127.0.0.1:8787';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api' && args[i + 1]) apiBase = args[++i];
    else if (!['--seed', '--migrate'].includes(args[i])) throw new Error(`不支持的参数：${args[i]}`);
  }
  assertLocalApi(apiBase);
  if (args.includes('--migrate')) process.stdout.write(applyLocalMigrations());
  if (args.includes('--seed')) {
    await seedLocalMarketReview(apiBase);
    console.log(`本地测试库已加载市场与板块夹具（${localD1.persistTo}）`);
  }
}
