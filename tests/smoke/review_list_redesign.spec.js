import { test, expect } from '@playwright/test';
import { queryLocalSql } from '../helpers/market-review-local.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';
const REVIEWED_DATE = '2026-05-08';
const PENDING_DATE = '2026-05-10';
const IMPACT_PREVIOUS_DATE = '2026-05-11';
const IMPACT_DATE = '2026-05-12';

// Same isolated local test D1 the 8787 Worker reads; rows keep wrangler's pretty JSON for text assertions.
function d1(command) {
  return JSON.stringify(queryLocalSql(command), null, 2);
}

function seedTrackedSymbol(symbol) {
  d1(`INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order, created_at, updated_at)
      VALUES ('${symbol}', '${symbol}', '${symbol}', 'stock', '["${symbol}"]', 1, 7600, datetime('now'), datetime('now'))
      ON CONFLICT(symbol) DO UPDATE SET is_active=1, updated_at=datetime('now');`);
}

// The shared test DB holds many newer fixture days, so locate days by filtering rather than by list position.
async function showReviewDates(page, from, to = from) {
  await page.locator('#filtersForm input[name="from"]').fill(from);
  await page.locator('#filtersForm input[name="to"]').fill(to);
  await page.locator('#filtersForm').getByRole('button', { name: '查询' }).click();
  await expect(page.locator('#reviewsList tr', { hasText: from }).first()).toBeVisible();
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

  await expect(page.locator('#reviewsPageSizeSelect')).toHaveValue('5');
  expect(await page.locator('#reviewsList tr').count()).toBeLessThanOrEqual(5);
  await expect(page.locator('.review-table th .review-date-head')).toHaveText('复盘日');
  await expect(page.locator('.review-table th').filter({ hasText: '账户估算影响' })).toBeVisible();
  await expect(page.locator('.review-table th').filter({ hasText: '当日主线' })).toBeVisible();
  await expect(page.locator('.review-table th').filter({ hasText: '操作' })).toBeVisible();
  await expect(page.locator('.review-table')).not.toContainText('北京时间 05/15 21:30 - 05/16 04:00');
  await expect(page.locator('.review-table th', { hasText: '状态' })).toHaveCount(0);

  await showReviewDates(page, REVIEWED_DATE, PENDING_DATE);
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

test('review drawer opens immediately while bootstrap loads and defers optional requests', async ({ page }) => {
  let releaseBootstrap;
  const bootstrapGate = new Promise((resolve) => { releaseBootstrap = resolve; });
  let symbolCatalogRequests = 0;
  let previewRequests = 0;

  await page.route(`**/api/reviews/${REVIEWED_DATE}/bootstrap`, async (route) => {
    await bootstrapGate;
    await route.continue();
  });
  page.on('request', (request) => {
    if (request.url().includes(`/api/reviews/${REVIEWED_DATE}/action-plan-symbols`)) {
      symbolCatalogRequests += 1;
    }
    if (request.url().includes(`/api/reviews/${REVIEWED_DATE}/account-impact/preview`)) {
      previewRequests += 1;
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'load' });
  await showReviewDates(page, REVIEWED_DATE);
  const reviewedRow = page.locator('#reviewsList tr', { hasText: REVIEWED_DATE });
  await expect(reviewedRow).toBeVisible();
  await reviewedRow.getByRole('button', { name: '查看' }).click();

  const drawer = page.locator('#reviewDrawer');
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveClass(/review-loading/);
  await expect(page.locator('#reviewLoadingTitle')).toHaveText('正在读取复盘数据');
  expect(symbolCatalogRequests).toBe(0);
  expect(previewRequests).toBe(0);

  releaseBootstrap();
  await expect(drawer).not.toHaveClass(/review-loading/);
  await expect(page.locator('#archiveDateLabel')).toContainText(REVIEWED_DATE);
  await page.waitForTimeout(400);
  expect(symbolCatalogRequests).toBe(0);
  expect(previewRequests).toBe(0);
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
  await showReviewDates(page, IMPACT_DATE);
  await page.locator('#reviewsList tr', { hasText: IMPACT_DATE }).getByRole('button', { name: '查看' }).click();
  await page.getByText('个股操作', { exact: true }).click();
  const tigerGroup = page.locator('.action-plan-group', { hasText: '老虎-美股' });
  await expect(tigerGroup.locator('.action-plan-account-impact')).toContainText('账户影响');
  await expect(tigerGroup.locator('.action-plan-account-impact .impact-meter-cut')).toBeVisible();
  await expect(tigerGroup.locator('.action-plan-account-impact')).not.toContainText('0~1%');
  await page.getByText('新闻总结', { exact: true }).click();
  await expect(page.locator('#reviewDrawer')).not.toContainText('账户每日快照');
});
