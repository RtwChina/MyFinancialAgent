import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8788';
const REVIEWED_DATE = '2026-05-08';
const PENDING_DATE = '2026-05-10';
const IMPACT_PREVIOUS_DATE = '2026-05-11';
const IMPACT_DATE = '2026-05-12';

function d1(command) {
  return execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'my-financial-agent', '--local', '--command', command],
    { cwd: `${process.cwd()}/cloudflare`, encoding: 'utf8' },
  );
}

function seedTrackedSymbol(symbol) {
  d1(`INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order, created_at, updated_at)
      VALUES ('${symbol}', '${symbol}', '${symbol}', 'stock', '["${symbol}"]', 1, 7600, datetime('now'), datetime('now'))
      ON CONFLICT(symbol) DO UPDATE SET is_active=1, updated_at=datetime('now');`);
}

function ensureAccountSnapshotTable() {
  d1(`CREATE TABLE IF NOT EXISTS review_account_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_date TEXT NOT NULL UNIQUE,
        accounts_snapshot TEXT NOT NULL,
        snapshot_source TEXT NOT NULL DEFAULT 'manual_review',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_review_account_snapshots_date
        ON review_account_snapshots(archive_date);`);
}

test.beforeEach(async ({ request }) => {
  await request.post(`${BASE_URL}/api/reviews/${REVIEWED_DATE}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '主线来自测试新闻。',
      marketSentiment: '大盘变量稳定。',
      sectorRotation: '半导体偏强。',
      tradingSummary: '测试交易主线。',
      actionPlans: [],
    },
  });
  await request.post(`${BASE_URL}/api/reviews/${REVIEWED_DATE}/complete`, {
    data: {
      accountSnapshot: {
        accounts: [
          {
            accountId: 1,
            accountName: '老虎-美股',
            currency: 'USD',
            totalAssets: 32000,
            availableCash: 8000,
            dailyPnlPercent: 0.8,
          },
        ],
      },
    },
  });
  await request.post(`${BASE_URL}/api/reviews/${PENDING_DATE}/initialize`);
});

test('review list uses trading-desk columns and primary edit action', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto(BASE_URL, { waitUntil: 'load' });

  await expect(page.locator('.review-table th')).toHaveText(['复盘日', '账户估算影响', '当日主线', '操作']);
  await expect(page.locator('.review-table')).not.toContainText('北京时间 05/15 21:30 - 05/16 04:00');
  await expect(page.locator('.review-table th', { hasText: '状态' })).toHaveCount(0);

  const reviewedRow = page.locator('#reviewsList tr', { hasText: REVIEWED_DATE });
  await expect(reviewedRow).toContainText('老虎-美股');
  await expect(reviewedRow).toContainText('已记录');
  await expect(reviewedRow).not.toContainText('已复盘');
  await expect(reviewedRow.getByRole('button', { name: '查看' })).toBeVisible();
  await expect(reviewedRow.getByRole('button', { name: '编辑' })).toBeVisible();

  const pendingRow = page.locator('#reviewsList tr', { hasText: PENDING_DATE });
  await expect(pendingRow).toContainText('未复盘');

  const layout = await page.evaluate(() => {
    const wrap = document.querySelector('.review-table-wrap');
    const table = document.querySelector('.review-table');
    const actionCell = document.querySelector('#reviewsList tr td:last-child');
    return {
      desktopHasOverflow: wrap.scrollWidth > wrap.clientWidth,
      rightClipped: table.getBoundingClientRect().right > wrap.getBoundingClientRect().right + 2,
      actionCellWidth: actionCell.getBoundingClientRect().width,
    };
  });
  expect(layout.desktopHasOverflow).toBeFalsy();
  expect(layout.rightClipped).toBeFalsy();
  expect(layout.actionCellWidth).toBeGreaterThan(120);
});

test('review list keeps right actions reachable on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(BASE_URL, { waitUntil: 'load' });

  const layout = await page.evaluate(() => {
    const wrap = document.querySelector('.review-table-wrap');
    const firstRow = document.querySelector('#reviewsList tr');
    const actionCell = firstRow?.querySelector('td:last-child');
    return {
      hasHorizontalScroll: wrap.scrollWidth > wrap.clientWidth
        || document.documentElement.scrollWidth > document.documentElement.clientWidth,
      actionCellRight: actionCell?.getBoundingClientRect().right || 0,
      scrollWidth: Math.max(wrap.scrollWidth, document.documentElement.scrollWidth),
      clientWidth: Math.min(wrap.clientWidth, document.documentElement.clientWidth),
    };
  });
  expect(layout.hasHorizontalScroll).toBeTruthy();
  expect(layout.scrollWidth).toBeGreaterThan(layout.clientWidth);
  expect(layout.actionCellRight).toBeGreaterThan(0);
});

test('review detail previews account impact and completed review reads frozen snapshot impact', async ({ page, request }) => {
  ensureAccountSnapshotTable();
  seedTrackedSymbol('IMPACT');
  seedTrackedSymbol('NEWIMP');
  d1(`DELETE FROM daily_review_action_plans WHERE archive_date IN ('${IMPACT_PREVIOUS_DATE}','${IMPACT_DATE}');
      DELETE FROM review_account_snapshots WHERE archive_date IN ('${IMPACT_PREVIOUS_DATE}','${IMPACT_DATE}');
      DELETE FROM daily_review_archive WHERE archive_date IN ('${IMPACT_PREVIOUS_DATE}','${IMPACT_DATE}');
      DELETE FROM stock_raw WHERE symbol IN ('IMPACT','NEWIMP');
      INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('${IMPACT_DATE}', '影响测试', 'IMPACT', 'IMPACT', 10, 4, 100, datetime('now'));
      INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('${IMPACT_DATE}', '新增测试', 'NEWIMP', 'NEWIMP', 10, 5, 100, datetime('now'));`);

  const accountsJson = await (await request.get(`${BASE_URL}/api/investment-accounts`)).json();
  const tiger = accountsJson.items.find((item) => item.name === '老虎-美股');
  expect(tiger).toBeTruthy();

  await request.post(`${BASE_URL}/api/reviews/${IMPACT_PREVIOUS_DATE}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '前一复盘日。',
      marketSentiment: '前一复盘日。',
      sectorRotation: '前一复盘日。',
      actionPlans: [
        { accountId: tiger.id, symbol: 'IMPACT', actionType: '持仓观察', currentPosition: '15%-20%', marketType: '美股' },
      ],
    },
  });
  await request.post(`${BASE_URL}/api/reviews/${IMPACT_PREVIOUS_DATE}/complete`, {
    data: { accountSnapshot: { accounts: [{ accountId: tiger.id, accountName: tiger.name, currency: tiger.currency }] } },
  });

  const currentPlans = [
    { accountId: tiger.id, symbol: 'IMPACT', actionType: '持仓观察', currentPosition: '15%-20%', marketType: '美股' },
    { accountId: tiger.id, symbol: 'NEWIMP', actionType: '持仓观察', currentPosition: '10%-15%', marketType: '美股' },
  ];
  await request.post(`${BASE_URL}/api/reviews/${IMPACT_DATE}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '账户影响复盘。',
      marketSentiment: '账户影响复盘。',
      sectorRotation: '账户影响复盘。',
      actionPlans: currentPlans,
    },
  });

  const preview = await request.post(`${BASE_URL}/api/reviews/${IMPACT_DATE}/account-impact/preview`, {
    data: { actionPlans: currentPlans },
  });
  expect(preview.ok()).toBeTruthy();
  const previewJson = await preview.json();
  const previewAccount = previewJson.accounts.find((item) => item.accountId === tiger.id);
  expect(previewAccount).toEqual(expect.objectContaining({
    label: '账户估算影响',
    rangeLabel: '0~1%',
    contributors: 1,
    skippedReasons: ['新增标的，当日不计入'],
  }));
  expect(previewAccount.valuePercent).toBeCloseTo(0.7);

  const complete = await request.post(`${BASE_URL}/api/reviews/${IMPACT_DATE}/complete`, {
    data: { accountSnapshot: { accounts: [{ accountId: tiger.id, accountName: tiger.name, currency: tiger.currency }] } },
  });
  expect(complete.ok()).toBeTruthy();

  const bootstrap = await (await request.get(`${BASE_URL}/api/reviews/${IMPACT_DATE}/bootstrap`)).json();
  const saved = bootstrap.accountSnapshot.accounts.find((item) => item.accountId === tiger.id);
  expect(saved.impact).toEqual(expect.objectContaining({
    source: 'estimated_action_plan',
    rangeLabel: '0~1%',
    direction: 'gain',
    contributors: 1,
    skippedReasons: ['新增标的，当日不计入'],
  }));

  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.locator('#reviewsList tr', { hasText: IMPACT_DATE }).getByRole('button', { name: '查看' }).click();
  await page.getByText('4. 操作计划', { exact: true }).click();
  const tigerGroup = page.locator('.action-plan-group', { hasText: '老虎-美股' });
  await expect(tigerGroup.locator('.action-plan-account-impact')).toContainText('账户影响');
  await expect(tigerGroup.locator('.action-plan-account-impact .impact-meter-cut')).toBeVisible();
  await expect(tigerGroup.locator('.action-plan-account-impact')).not.toContainText('0~1%');
  await page.getByText('5. 深度总结', { exact: true }).click();
  await expect(page.locator('#reviewDrawer')).not.toContainText('账户每日快照');
});
