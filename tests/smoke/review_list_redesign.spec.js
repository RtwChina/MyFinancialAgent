import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8788';
const REVIEWED_DATE = '2026-05-08';
const PENDING_DATE = '2026-05-10';

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
  await expect(reviewedRow).toContainText('0~1%');
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
