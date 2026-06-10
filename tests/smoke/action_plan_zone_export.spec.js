import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';
const EXPORT_DATE = '2026-02-20';
const EMPTY_EXPORT_DATE = '2026-02-19';

function d1(command) {
  return execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'my-financial-agent', '--local', '--command', command],
    { cwd: `${process.cwd()}/cloudflare`, encoding: 'utf8' },
  );
}

function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function seedTrackedSymbol(symbol, displayName = symbol) {
  d1(`INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order, created_at, updated_at)
      VALUES (${sqlQuote(symbol)}, ${sqlQuote(symbol)}, ${sqlQuote(displayName)}, 'stock', ${sqlQuote(JSON.stringify([symbol, displayName]))}, 1, 8120, datetime('now'), datetime('now'))
      ON CONFLICT(symbol) DO UPDATE SET
        yahoo_symbol=excluded.yahoo_symbol,
        display_name=excluded.display_name,
        symbol_type=excluded.symbol_type,
        aliases=excluded.aliases,
        is_active=1,
      updated_at=datetime('now');`);
}

async function filterReviewsByDate(page, date) {
  const form = page.locator('#filtersForm');
  await form.locator('input[name="from"]').fill(date);
  await form.locator('input[name="to"]').fill(date);
  await form.getByRole('button', { name: '查询' }).click();
}

test('action plan zone export previews draw_zone commands', async ({ page, request }) => {
  seedTrackedSymbol('MSFT', '微软');
  seedTrackedSymbol('AVGO', '博通');
  d1(`DELETE FROM daily_review_action_plans WHERE archive_date=${sqlQuote(EXPORT_DATE)};
      DELETE FROM daily_review_archive WHERE archive_date=${sqlQuote(EXPORT_DATE)};`);

  const accountsJson = await (await request.get(`${BASE_URL}/api/investment-accounts`)).json();
  const tiger = accountsJson.items.find((item) => item.name === '老虎-美股');
  expect(tiger).toBeTruthy();

  const saveResponse = await request.post(`${BASE_URL}/api/reviews/${EXPORT_DATE}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '导出测试：新闻总结。',
      marketSentiment: '导出测试：大盘盘点。',
      sectorRotation: '导出测试：板块轮动。',
      tradingSummary: '',
      actionPlans: [
        {
          accountId: tiger.id,
          symbol: 'MSFT',
          actionType: '持仓观察',
          currentPosition: '0-5%',
          marketType: '美股',
          supportLevels: '381 – 392（中） 长线\n无法解析这一行\n360-375（强）',
          resistanceLevels: '397-430（超强） 突破右侧',
        },
        {
          accountId: tiger.id,
          symbol: 'AVGO',
          actionType: '准备开仓',
          currentPosition: '0%',
          marketType: '美股',
          supportLevels: '433.5-392.25 反向小数区间',
          resistanceLevels: '',
        },
      ],
    },
  });
  expect(saveResponse.ok()).toBeTruthy();

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await filterReviewsByDate(page, EXPORT_DATE);
  const row = page.locator('#reviewsList tr', { hasText: EXPORT_DATE }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看|编辑草稿/ }).click();
  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('个股操作', { exact: true }).click();

  await page.getByRole('button', { name: '导出画线' }).click();
  const modal = page.locator('#actionPlanZoneExportModal');
  await expect(modal).toBeVisible();
  const output = modal.locator('#actionPlanZoneExportOutput');
  await expect(output).toHaveValue([
    "draw_zone('MSFT', 381, 392, '支撑: 381-392 (中) 长线')",
    "draw_zone('MSFT', 360, 375, '支撑: 360-375 (强)')",
    "draw_zone('MSFT', 397, 430, '压力: 397-430 (超强) 突破右侧')",
    "draw_zone('AVGO', 392.25, 433.5, '支撑: 392.25-433.5 反向小数区间')",
  ].join('\n'));
  await expect(output).not.toHaveValue(/无法解析/);
  await expect(modal.getByRole('button', { name: '复制' })).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await page.evaluate(() => {
    const panel = document.querySelector('.action-plan-zone-export-panel');
    const outputBox = document.querySelector('#actionPlanZoneExportOutput');
    const panelRect = panel.getBoundingClientRect();
    const outputRect = outputBox.getBoundingClientRect();
    return {
      panelLeft: panelRect.left,
      panelRight: panelRect.right,
      outputLeft: outputRect.left,
      outputRight: outputRect.right,
      viewportWidth: window.innerWidth,
    };
  });
  expect(mobileLayout.panelLeft).toBeGreaterThanOrEqual(0);
  expect(mobileLayout.panelRight).toBeLessThanOrEqual(mobileLayout.viewportWidth);
  expect(mobileLayout.outputLeft).toBeGreaterThanOrEqual(mobileLayout.panelLeft);
  expect(mobileLayout.outputRight).toBeLessThanOrEqual(mobileLayout.panelRight);
});

test('action plan zone export shows an empty state when no range can be parsed', async ({ page, request }) => {
  seedTrackedSymbol('MSFT', '微软');
  d1(`DELETE FROM daily_review_action_plans WHERE archive_date=${sqlQuote(EMPTY_EXPORT_DATE)};
      DELETE FROM daily_review_archive WHERE archive_date=${sqlQuote(EMPTY_EXPORT_DATE)};`);

  const accountsJson = await (await request.get(`${BASE_URL}/api/investment-accounts`)).json();
  const tiger = accountsJson.items.find((item) => item.name === '老虎-美股');
  expect(tiger).toBeTruthy();

  const saveResponse = await request.post(`${BASE_URL}/api/reviews/${EMPTY_EXPORT_DATE}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '空导出测试。',
      marketSentiment: '空导出测试。',
      sectorRotation: '空导出测试。',
      tradingSummary: '',
      actionPlans: [{
        accountId: tiger.id,
        symbol: 'MSFT',
        actionType: '持仓观察',
        currentPosition: '0-5%',
        marketType: '美股',
        supportLevels: '等待结构确认',
        resistanceLevels: '',
      }],
    },
  });
  expect(saveResponse.ok()).toBeTruthy();

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await filterReviewsByDate(page, EMPTY_EXPORT_DATE);
  const row = page.locator('#reviewsList tr', { hasText: EMPTY_EXPORT_DATE }).first();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看|编辑草稿/ }).click();
  await page.getByText('个股操作', { exact: true }).click();
  await page.getByRole('button', { name: '导出画线' }).click();

  const modal = page.locator('#actionPlanZoneExportModal');
  await expect(modal.locator('#actionPlanZoneExportEmpty')).toBeVisible();
  await expect(modal.locator('#actionPlanZoneExportOutput')).toBeHidden();
  await expect(modal.getByRole('button', { name: '复制' })).toBeDisabled();
});

test('account management exposes zone export for live action plans', async ({ page, request }) => {
  const symbol = 'LIVEZONE';
  seedTrackedSymbol(symbol, '实时导出测试');

  const accountsJson = await (await request.get(`${BASE_URL}/api/investment-accounts`)).json();
  const tiger = accountsJson.items.find((item) => item.name === '老虎-美股');
  expect(tiger).toBeTruthy();

  d1(`DELETE FROM account_live_action_plans WHERE symbol=${sqlQuote(symbol)};`);
  const createResponse = await request.post(`${BASE_URL}/api/account-live-action-plans`, {
    data: {
      accountId: tiger.id,
      symbol,
      actionType: '持仓观察',
      currentPosition: '0-5%',
      supportLevels: '100-110（中） 观察',
      resistanceLevels: '',
    },
  });
  expect(createResponse.ok()).toBeTruthy();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.locator('.nav-chip[data-view="accounts"]').click();
    const exportButton = page.locator('#accountsView').getByRole('button', { name: '导出画线' });
    await expect(exportButton).toBeVisible();
    await exportButton.click();

    await expect(page.locator('#actionPlanZoneExportModal')).toBeVisible();
    await expect(page.locator('#actionPlanZoneExportOutput')).toHaveValue(
      /draw_zone\('LIVEZONE', 100, 110, '支撑: 100-110 \(中\) 观察'\)/,
    );
  } finally {
    d1(`DELETE FROM account_live_action_plans WHERE symbol=${sqlQuote(symbol)};`);
  }
});

test('closed action plans stay out of the active account table', async ({ page, request }) => {
  const activeSymbol = 'LIVEOPEN';
  const closedSymbol = 'LIVECLOSED';
  seedTrackedSymbol(activeSymbol, '当前持仓测试');
  seedTrackedSymbol(closedSymbol, '已清仓测试');

  const accountsJson = await (await request.get(`${BASE_URL}/api/investment-accounts`)).json();
  const tiger = accountsJson.items.find((item) => item.name === '老虎-美股');
  expect(tiger).toBeTruthy();

  d1(`DELETE FROM account_live_action_plans WHERE symbol IN (${sqlQuote(activeSymbol)}, ${sqlQuote(closedSymbol)});`);
  const activeResponse = await request.post(`${BASE_URL}/api/account-live-action-plans`, {
    data: {
      accountId: tiger.id,
      symbol: activeSymbol,
      actionType: '持仓观察',
      currentPosition: '0-5%',
    },
  });
  const closedResponse = await request.post(`${BASE_URL}/api/account-live-action-plans`, {
    data: {
      accountId: tiger.id,
      symbol: closedSymbol,
      actionType: '已清仓复盘',
      currentPosition: '0%',
    },
  });
  expect(activeResponse.ok()).toBeTruthy();
  expect(closedResponse.ok()).toBeTruthy();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.locator('.nav-chip[data-view="accounts"]').click();
    const tigerGroup = page.locator('#accountLivePlans .action-plan-group', { hasText: '老虎-美股' }).first();
    const activeTable = tigerGroup.locator('.action-plan-table').first();
    await expect(activeTable).toContainText(activeSymbol);
    await expect(activeTable).not.toContainText(closedSymbol);

    const closedSection = tigerGroup.locator('[data-action-plan-closed-section]');
    await expect(closedSection).toBeVisible();
    await expect(closedSection).not.toHaveAttribute('open', '');
    await expect(closedSection.locator('tbody')).toContainText(closedSymbol);
  } finally {
    d1(`DELETE FROM account_live_action_plans WHERE symbol IN (${sqlQuote(activeSymbol)}, ${sqlQuote(closedSymbol)});`);
  }
});
