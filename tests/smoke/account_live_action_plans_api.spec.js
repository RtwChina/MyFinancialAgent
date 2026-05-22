import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';
const TEST_SYMBOL = 'APLRT';
const INACTIVE_SYMBOL = 'APLRT_OLD';
const LATEST_DATE = '2099-01-03';
const INIT_DATE = '2099-01-04';
const HISTORY_DATE = '2099-01-02';

test.describe.configure({ mode: 'serial' });

function sqlQuote(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function d1(command) {
  const output = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'my-financial-agent', '--config', 'wrangler.toml', '--local', '--command', command],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  const clean = output.replace(/\u001b\[[0-9;]*m/g, '');
  const start = clean.lastIndexOf('\n[');
  const jsonText = start >= 0 ? clean.slice(start + 1) : clean.slice(clean.indexOf('['));
  if (!jsonText.trim().startsWith('[')) return [];
  return JSON.parse(jsonText)[0]?.results || [];
}

function liveInsertSql(row) {
  return `INSERT INTO account_live_action_plans (
    id, account_id, symbol, action_type, entry_plan, take_profit_plan,
    stop_loss_plan, key_levels, support_levels, resistance_levels,
    current_position, thinking, sort_order, market_type, created_at, updated_at
  ) VALUES (
    ${Number(row.id)}, ${Number(row.account_id)}, ${sqlQuote(row.symbol)}, ${sqlQuote(row.action_type)},
    ${sqlQuote(row.entry_plan)}, ${sqlQuote(row.take_profit_plan)}, ${sqlQuote(row.stop_loss_plan)},
    ${sqlQuote(row.key_levels)}, ${sqlQuote(row.support_levels)}, ${sqlQuote(row.resistance_levels)},
    ${sqlQuote(row.current_position)}, ${sqlQuote(row.thinking)}, ${Number(row.sort_order || 0)},
    ${sqlQuote(row.market_type)}, ${sqlQuote(row.created_at)}, ${sqlQuote(row.updated_at)}
  );`;
}

async function getEnabledAccount(request) {
  const response = await request.get(`${BASE_URL}/api/investment-accounts`);
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  const account = json.items.find((item) => item.enabled !== false && Number(item.enabled ?? 1) !== 0);
  expect(account).toBeTruthy();
  return account;
}

async function seedBase({ request }) {
  const account = await getEnabledAccount(request);
  d1(`
    INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order, created_at, updated_at)
    VALUES (${sqlQuote(TEST_SYMBOL)}, ${sqlQuote(TEST_SYMBOL)}, ${sqlQuote(TEST_SYMBOL)}, 'stock', ${sqlQuote(`["${TEST_SYMBOL}"]`)}, 1, 9910, datetime('now'), datetime('now'))
    ON CONFLICT(symbol) DO UPDATE SET is_active = 1, updated_at = datetime('now');
    DELETE FROM daily_review_action_plans WHERE archive_date IN (${sqlQuote(HISTORY_DATE)}, ${sqlQuote(LATEST_DATE)}, ${sqlQuote(INIT_DATE)});
    DELETE FROM daily_review_archive WHERE archive_date IN (${sqlQuote(HISTORY_DATE)}, ${sqlQuote(LATEST_DATE)}, ${sqlQuote(INIT_DATE)});
    DELETE FROM account_live_action_plans WHERE symbol IN (${sqlQuote(TEST_SYMBOL)}, ${sqlQuote(INACTIVE_SYMBOL)});
    INSERT INTO daily_review_archive (archive_date, review_status, updated_at)
    VALUES (${sqlQuote(HISTORY_DATE)}, 'reviewed', datetime('now')),
           (${sqlQuote(LATEST_DATE)}, 'initialized', datetime('now'));
  `);
  return account;
}

test.beforeAll(() => {
  const rows = d1('SELECT * FROM account_live_action_plans ORDER BY id;');
  globalThis.__accountLivePlanSnapshot = rows;
});

test.afterAll(() => {
  const snapshot = globalThis.__accountLivePlanSnapshot || [];
  d1(`
    DELETE FROM daily_review_action_plans WHERE archive_date IN (${sqlQuote(HISTORY_DATE)}, ${sqlQuote(LATEST_DATE)}, ${sqlQuote(INIT_DATE)});
    DELETE FROM daily_review_archive WHERE archive_date IN (${sqlQuote(HISTORY_DATE)}, ${sqlQuote(LATEST_DATE)}, ${sqlQuote(INIT_DATE)});
    DELETE FROM account_live_action_plans;
    ${snapshot.map(liveInsertSql).join('\n')}
    DELETE FROM tracked_symbols WHERE symbol IN (${sqlQuote(TEST_SYMBOL)}, ${sqlQuote(INACTIVE_SYMBOL)});
  `);
});

test('live CRUD routes mirror writes to latest daily plans and reject duplicate symbols', async ({ request }) => {
  const account = await seedBase({ request });

  const symbols = await request.get(`${BASE_URL}/api/account-live-action-plans/symbols`);
  expect(symbols.ok()).toBeTruthy();
  await expect(async () => {
    const json = await symbols.json();
    expect(json.items.some((item) => item.symbol === TEST_SYMBOL)).toBeTruthy();
  }).not.toThrow();

  const create = await request.post(`${BASE_URL}/api/account-live-action-plans`, {
    data: {
      accountId: account.id,
      symbol: TEST_SYMBOL,
      actionType: '准备开仓',
      currentPosition: '0%',
      entryPlan: 'route create',
      takeProfitPlan: 'route target',
      stopLossPlan: 'route stop',
      supportLevels: '10',
      resistanceLevels: '20',
      thinking: 'route thinking',
    },
  });
  expect(create.ok()).toBeTruthy();
  const created = (await create.json()).item;
  expect(created.id).toBeTruthy();
  expect(d1(`SELECT COUNT(*) AS n FROM daily_review_action_plans WHERE archive_date=${sqlQuote(LATEST_DATE)} AND symbol=${sqlQuote(TEST_SYMBOL)};`)[0].n).toBe(1);

  const duplicate = await request.post(`${BASE_URL}/api/account-live-action-plans`, {
    data: { accountId: account.id, symbol: TEST_SYMBOL },
  });
  expect(duplicate.status()).toBe(409);

  const update = await request.put(`${BASE_URL}/api/account-live-action-plans/${created.id}`, {
    data: { ...created, takeProfitPlan: 'route updated target' },
  });
  expect(update.ok()).toBeTruthy();
  expect(d1(`SELECT take_profit_plan FROM daily_review_action_plans WHERE archive_date=${sqlQuote(LATEST_DATE)} AND symbol=${sqlQuote(TEST_SYMBOL)};`)[0].take_profit_plan).toBe('route updated target');

  const remove = await request.delete(`${BASE_URL}/api/account-live-action-plans/${created.id}`);
  expect(remove.ok()).toBeTruthy();
  expect(d1(`SELECT COUNT(*) AS n FROM account_live_action_plans WHERE id=${Number(created.id)};`)[0].n).toBe(0);
  expect(d1(`SELECT COUNT(*) AS n FROM daily_review_action_plans WHERE archive_date=${sqlQuote(LATEST_DATE)} AND symbol=${sqlQuote(TEST_SYMBOL)};`)[0].n).toBe(0);
});

test('initialize copies live plans only when daily plans are empty', async ({ request }) => {
  const account = await seedBase({ request });
  d1(`
    INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order, created_at, updated_at)
    VALUES (${sqlQuote(INACTIVE_SYMBOL)}, ${sqlQuote(INACTIVE_SYMBOL)}, ${sqlQuote(INACTIVE_SYMBOL)}, 'stock', ${sqlQuote(`["${INACTIVE_SYMBOL}"]`)}, 0, 9911, datetime('now'), datetime('now'))
    ON CONFLICT(symbol) DO UPDATE SET is_active = 0, updated_at = datetime('now');
    INSERT INTO account_live_action_plans (account_id, symbol, action_type, entry_plan, current_position, sort_order, market_type, created_at, updated_at)
    VALUES (${Number(account.id)}, ${sqlQuote(TEST_SYMBOL)}, '持仓观察', 'copy from live', '0-5%', 0, '美股', datetime('now'), datetime('now'));
    INSERT INTO account_live_action_plans (account_id, symbol, action_type, entry_plan, current_position, sort_order, market_type, created_at, updated_at)
    VALUES (${Number(account.id)}, ${sqlQuote(INACTIVE_SYMBOL)}, '持仓观察', 'skip inactive live', '0-5%', 1, '美股', datetime('now'), datetime('now'));
  `);

  const first = await request.post(`${BASE_URL}/api/reviews/${INIT_DATE}/initialize`);
  expect(first.ok()).toBeTruthy();
  const firstJson = await first.json();
  expect(firstJson.liveCopied).toBeGreaterThanOrEqual(1);
  expect(firstJson.liveSkippedSymbols).toContain(INACTIVE_SYMBOL);
  const firstCount = d1(`SELECT COUNT(*) AS n FROM daily_review_action_plans WHERE archive_date=${sqlQuote(INIT_DATE)} AND symbol=${sqlQuote(TEST_SYMBOL)};`)[0].n;
  expect(firstCount).toBe(1);
  expect(d1(`SELECT COUNT(*) AS n FROM daily_review_action_plans WHERE archive_date=${sqlQuote(INIT_DATE)} AND symbol=${sqlQuote(INACTIVE_SYMBOL)};`)[0].n).toBe(0);

  const second = await request.post(`${BASE_URL}/api/reviews/${INIT_DATE}/initialize`);
  expect(second.ok()).toBeTruthy();
  const secondCount = d1(`SELECT COUNT(*) AS n FROM daily_review_action_plans WHERE archive_date=${sqlQuote(INIT_DATE)} AND symbol=${sqlQuote(TEST_SYMBOL)};`)[0].n;
  expect(secondCount).toBe(1);
});

test('review save updates live only for the latest archive date', async ({ request }) => {
  const account = await seedBase({ request });

  const historical = await request.post(`${BASE_URL}/api/reviews/${HISTORY_DATE}`, {
    data: {
      reviewStatus: 'draft',
      actionPlans: [{ accountId: account.id, symbol: TEST_SYMBOL, actionType: '准备开仓', currentPosition: '0%', entryPlan: 'history only' }],
    },
  });
  expect(historical.ok()).toBeTruthy();
  expect((await historical.json()).syncedToLive).toBe(false);
  expect(d1(`SELECT COUNT(*) AS n FROM account_live_action_plans WHERE symbol=${sqlQuote(TEST_SYMBOL)};`)[0].n).toBe(0);

  const latest = await request.post(`${BASE_URL}/api/reviews/${LATEST_DATE}`, {
    data: {
      reviewStatus: 'draft',
      actionPlans: [{ accountId: account.id, symbol: TEST_SYMBOL, actionType: '持仓观察', currentPosition: '0-5%', entryPlan: 'latest syncs live' }],
    },
  });
  expect(latest.ok()).toBeTruthy();
  expect((await latest.json()).syncedToLive).toBe(true);
  expect(d1(`SELECT entry_plan FROM account_live_action_plans WHERE symbol=${sqlQuote(TEST_SYMBOL)};`)[0].entry_plan).toBe('latest syncs live');
});

test('account deletion is rejected when live plans reference it', async ({ request }) => {
  const accountName = `live-ref-delete-${Date.now()}`;
  const createAccount = await request.post(`${BASE_URL}/api/investment-accounts`, {
    data: {
      name: accountName,
      broker: 'route-test',
      accountType: 'stock',
      region: 'US',
      currency: 'USD',
      enabled: true,
      sortOrder: 9999,
    },
  });
  expect(createAccount.ok()).toBeTruthy();
  const account = (await createAccount.json()).item;
  d1(`
    INSERT INTO account_live_action_plans (account_id, symbol, action_type, entry_plan, current_position, sort_order, market_type, created_at, updated_at)
    VALUES (${Number(account.id)}, ${sqlQuote(TEST_SYMBOL)}, '持仓观察', 'blocks delete', '0-5%', 0, '美股', datetime('now'), datetime('now'));
  `);

  const removeAccount = await request.delete(`${BASE_URL}/api/investment-accounts/${account.id}`);
  expect(removeAccount.status()).toBe(409);
  const body = await removeAccount.json();
  expect(body.error).toContain('活态操作计划');

  d1(`DELETE FROM account_live_action_plans WHERE account_id=${Number(account.id)};`);
  const cleanupAccount = await request.delete(`${BASE_URL}/api/investment-accounts/${account.id}`);
  expect(cleanupAccount.ok()).toBeTruthy();
});
