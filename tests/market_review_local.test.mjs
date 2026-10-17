import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import * as local from './helpers/market-review-local.mjs';

const root = path.resolve(import.meta.dirname, '..');
const configPath = path.join(root, 'tests/testdata/config/wrangler.test.toml');
const require = createRequire(import.meta.url);
const { experimental_readRawConfig } = require(path.join(root, 'node_modules/wrangler'));
const rawConfig = () => experimental_readRawConfig({ config: configPath }).rawConfig;

async function withHealth(handler, action) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await action(base); }
  finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const jsonHealth = (status, body) => (req, res) => {
  assert.equal(req.url, '/api/health');
  assert.equal(req.headers.authorization, undefined);
  assert.equal(req.headers.cookie, undefined);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

test('本机 API 只接受 HTTP、无凭证且保留端口', () => {
  for (const base of ['http://127.0.0.1:8787', 'http://localhost:8787']) {
    assert.doesNotThrow(() => local.assertLocalApi(base));
  }
  for (const base of [
    'https://localhost:8787', 'ftp://127.0.0.1:8787',
    'http://user:secret@127.0.0.1:8787', 'http://localhost:8787/?token=secret',
    'http://localhost:8787/#secret', 'http://localhost:8787/path',
    'http://example.com', 'http://localhost.example.com', 'http://127.0.0.1.example.com',
    'http://localhost@production.example',
  ]) assert.throws(() => local.assertLocalApi(base), undefined, base);
});

test('health 必须 HTTP 2xx 且 ok=true/env=test', async (t) => {
  await t.test('真实本机成功响应', () => withHealth(jsonHealth(200, { ok: true, env: 'test' }), local.assertTestEnvironment));
  for (const [status, body] of [
    [503, { ok: true, env: 'test' }], [401, { ok: true, env: 'test' }],
    [200, { ok: false, env: 'test' }], [200, { env: 'test' }],
    [200, { ok: 'true', env: 'test' }], [200, { ok: true, env: 'production' }],
    [200, null],
  ]) await t.test(`${status}/${JSON.stringify(body)}`, () => withHealth(jsonHealth(status, body), async (base) => {
    await assert.rejects(local.assertTestEnvironment(base));
  }));
  await t.test('非 JSON 拒绝', () => withHealth((req, res) => res.end('not json'), async (base) => {
    await assert.rejects(local.assertTestEnvironment(base));
  }));
});

test('health 不跟随重定向，连本机第二跳也不得请求', async () => {
  let redirectedRequests = 0;
  await withHealth((req, res) => {
    redirectedRequests++;
    res.end(JSON.stringify({ ok: true, env: 'test' }));
  }, (target) => withHealth((req, res) => {
    res.writeHead(302, { location: target });
    res.end();
  }, async (base) => {
    await assert.rejects(local.assertTestEnvironment(base));
    assert.equal(redirectedRequests, 0);
  }));
  // 远程地址仅出现在 Location 中；测试不能访问该地址。
  await withHealth((req, res) => {
    res.writeHead(307, { location: 'https://production.invalid/api/health' });
    res.end();
  }, (base) => assert.rejects(local.assertTestEnvironment(base)));
});

test('从实际 TOML 读取环境/测试库/现有源码、资源和迁移路径', () => {
  assert.equal(typeof local.readLocalConfig, 'function', '缺少实际配置读取入口');
  const config = local.readLocalConfig();
  const raw = rawConfig();
  assert.equal(config.appEnv, raw.vars.APP_ENV);
  assert.equal(config.database, raw.d1_databases[0].database_name);
  assert.equal(config.databaseId, raw.d1_databases[0].database_id);
  for (const [key, relative] of [
    ['main', raw.main], ['assets', raw.assets.directory], ['migrations', raw.d1_databases[0].migrations_dir],
  ]) {
    assert.equal(config[key], fs.realpathSync(path.resolve(path.dirname(configPath), relative)));
  }
  assert.equal(config.config, 'tests/testdata/config/wrangler.test.toml');
  assert.equal(config.persistTo, 'tests/.wrangler-state/market-review');
  assert.ok(Object.isFrozen(local.localD1));
});

test('配置错误必须拒绝，不写或修改实际配置文件', () => {
  assert.equal(typeof local.validateTestConfig, 'function', '缺少配置安全校验');
  assert.doesNotThrow(() => local.validateTestConfig(rawConfig()));
  const badConfigs = [
    (c) => { c.vars.APP_ENV = 'production'; },
    (c) => { delete c.vars.APP_ENV; },
    (c) => { c.d1_databases[0].database_name = 'my-financial-agent'; },
    (c) => { c.d1_databases[0].binding = 'OTHER'; },
    (c) => { delete c.d1_databases[0].database_id; },
    (c) => { c.d1_databases[0].remote = true; },
    (c) => { c.d1_databases.push({ ...c.d1_databases[0], binding: 'SECOND' }); },
    (c) => { c.main = '../../../cloudflare/web/app.js'; },
    (c) => { c.assets.directory = '../../../cloudflare'; },
    (c) => { c.assets.binding = 'OTHER'; },
    (c) => { c.d1_databases[0].migrations_dir = '../../../tests'; },
    (c) => { c.d1_databases[0].migrations_dir = './missing'; },
    (c) => { c.dev = { remote: true }; },
  ];
  for (const mutate of badConfigs) {
    const config = rawConfig();
    mutate(config);
    assert.throws(() => local.validateTestConfig(config));
  }
});

test('本地命令使用已安装 Wrangler，不调用 npx，local/config/state 固定', () => {
  assert.equal(typeof local.localWranglerCommand, 'function', '缺少可检查的本地命令构造');
  for (const [operation, value, prefix] of [
    ['migrate', undefined, ['d1', 'migrations', 'apply']],
    ['query', 'SELECT 1', ['d1', 'execute']],
    ['execute', 'tests/.wrangler-state/market-review/seed.sql', ['d1', 'execute']],
  ]) {
    const command = local.localWranglerCommand(operation, value);
    assert.equal(command.executable, process.execPath);
    const entry = command.args.indexOf(path.join(root, 'node_modules/wrangler/bin/wrangler.js'));
    assert.equal(entry, process.versions.electron ? 2 : 0);
    assert.deepEqual(command.args.slice(entry + 1, entry + 1 + prefix.length), prefix);
    assert.ok(command.args.includes('my-financial-agent-test'));
    assert.ok(command.args.includes('--local'));
    assert.equal(command.args[command.args.indexOf('--config') + 1], configPath);
    assert.equal(command.args[command.args.indexOf('--persist-to') + 1], path.join(root, local.localD1.persistTo));
    assert.ok(!command.args.includes('--remote'));
    assert.ok(!command.args.includes('npx'));
  }
  assert.throws(() => local.localWranglerCommand('deploy'));
  assert.throws(() => local.localWranglerCommand('execute', '../seed.sql'));
  const comment = local.localWranglerCommand('query', '--remote\nSELECT 1');
  assert.ok(comment.args.includes('--command=--remote\nSELECT 1'));
  assert.ok(!comment.args.includes('--remote'), 'SQL 文本不能变成 Wrangler 选项');
});

test('真实本地 D1 正式迁移、同源 SQL、重复加载全表幂等', {
  skip: process.env.MARKET_REVIEW_LOCAL_D1 !== '1' && '设置 MARKET_REVIEW_LOCAL_D1=1 执行真实本地 D1',
  timeout: 120000,
}, async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { seedMarketReviewFixture } = await import('./helpers/market-review-fixtures.mjs');
  const sqlite = new DatabaseSync(':memory:');
  const migrations = path.join(root, 'cloudflare/migrations');
  for (const file of fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(migrations, file), 'utf8'));
  }
  try {
    local.applyLocalMigrations();
    await withHealth(jsonHealth(200, { ok: true, env: 'test' }), local.seedLocalMarketReview);
    const names = ['tracked_symbols', 'daily_review_archive', 'daily_review_action_plans', 'account_live_action_plans', 'stock_raw', 'daily_review_symbol_levels', 'sqlite_sequence'];
    const snapshot = () => Object.fromEntries(names.map((name) => [name, local.queryLocalSql(`SELECT * FROM ${name} ORDER BY rowid`)]));
    const before = snapshot();
    await withHealth(jsonHealth(503, { ok: true, env: 'test' }), (base) => assert.rejects(local.seedLocalMarketReview(base)));
    assert.deepEqual(snapshot(), before, '不健康环境不得写本地 D1');
    await withHealth(jsonHealth(200, { ok: true, env: 'test' }), local.seedLocalMarketReview);
    assert.deepEqual(snapshot(), before);
    seedMarketReviewFixture(sqlite);
    // 所有夹具行逐字段与 SQLite 同源结果相同，迁移自身的时间戳不参与比较。
    for (const name of names.filter((n) => n !== 'sqlite_sequence')) {
      const rows = sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all();
      const actual = before[name];
      for (const row of rows) {
        const match = actual.find((r) => name === 'daily_review_archive' ? r.archive_date === row.archive_date :
          name === 'daily_review_symbol_levels' ? r.archive_date === row.archive_date && r.symbol === row.symbol : r.id === row.id);
        assert.ok(match, `${name} 缺少 ${JSON.stringify(row)}`);
        const keys = Object.keys(row).filter((k) => !['created_at', 'updated_at'].includes(k));
        assert.deepEqual(Object.fromEntries(keys.map((k) => [k, match[k]])), Object.fromEntries(keys.map((k) => [k, row[k]])));
      }
    }
  } finally { sqlite.close(); }
});
