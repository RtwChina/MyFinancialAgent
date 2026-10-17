import { test, expect } from '@playwright/test';
import { queryLocalSql } from '../helpers/market-review-local.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const EXPORT_DATE = '2026-02-20';
const EMPTY_EXPORT_DATE = '2026-02-19';

if (executablePath) test.use({ launchOptions: { executablePath } });
test.describe.configure({ timeout: 120_000 });

// Same isolated local test D1 the 8787 Worker reads; rows keep wrangler's pretty JSON for text assertions.
function d1(command) {
  return JSON.stringify(queryLocalSql(command), null, 2);
}

function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

// Existing rows (e.g. migration-seeded MSFT) are shared with other suites; only ensure availability.
function trackedSymbolUpsertSql(symbol, displayName = symbol) {
  return `INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order, created_at, updated_at)
      VALUES (${sqlQuote(symbol)}, ${sqlQuote(symbol)}, ${sqlQuote(displayName)}, 'stock', ${sqlQuote(JSON.stringify([symbol, displayName]))}, 1, 8120, datetime('now'), datetime('now'))
      ON CONFLICT(symbol) DO UPDATE SET is_active=1;`;
}

function seedTrackedSymbols(items) {
  d1(items.map(([symbol, displayName]) => trackedSymbolUpsertSql(symbol, displayName)).join('\n'));
}

function seedTrackedSymbol(symbol, displayName = symbol) {
  seedTrackedSymbols([[symbol, displayName]]);
}

async function filterReviewsByDate(page, date) {
  const form = page.locator('#filtersForm');
  await form.locator('input[name="from"]').fill(date);
  await form.locator('input[name="to"]').fill(date);
  await form.getByRole('button', { name: '查询' }).click();
}

test('review header zone export merges market and action-plan ranges pressure first', async ({ page, request }) => {
  seedTrackedSymbols([
    ['MSFT', '微软'],
    ['AVGO', '博通'],
    ['QQQ', '纳斯达克100ETF'],
  ]);
  // GSPC comes from the migrations; upserting it here would rewrite its index type and Yahoo code for other suites.
  d1(`DELETE FROM daily_review_action_plans WHERE archive_date=${sqlQuote(EXPORT_DATE)};
      DELETE FROM daily_review_symbol_levels WHERE archive_date=${sqlQuote(EXPORT_DATE)};
      DELETE FROM daily_review_archive WHERE archive_date=${sqlQuote(EXPORT_DATE)};`);

  const accountsJson = await (await request.get(`${BASE_URL}/api/investment-accounts`)).json();
  const tiger = accountsJson.items.find((item) => item.name === '老虎-美股');
  expect(tiger).toBeTruthy();

  const levelChildren = (symbol) => [
    { id: `${symbol}-support`, kind: 'support', title: '支撑位' },
    { id: `${symbol}-resistance`, kind: 'resistance', title: '压力位' },
  ];
  const saveResponse = await request.post(`${BASE_URL}/api/reviews/${EXPORT_DATE}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '导出测试：新闻总结。',
      marketReview: {
        blocks: [
          { id: 'export-gspc', type: 'symbol', symbol: 'GSPC', children: [
            ...levelChildren('GSPC'),
            { id: 'GSPC-cta', kind: 'cta', title: 'CTA 流动性', body: '横盘：buy\n加速卖出触发：跌破 7620 / 7356 / 6884' },
            { id: 'GSPC-gamma', kind: 'custom', title: '负伽马', body: '6475（破了该点位后就会出现较大的抛压）' },
            { id: 'GSPC-view', kind: 'custom', title: '判断', body: '7000-7100（不应导出）' },
          ] },
          { id: 'export-qqq', type: 'symbol', symbol: 'QQQ', children: [
            ...levelChildren('QQQ'),
            { id: 'QQQ-metric', kind: 'custom', title: '关键指标', body: '600-620（不应导出）' },
          ] },
        ],
        levels: [
          { symbol: 'GSPC', supportLevels: '7310-7350（小）\n7200–7250（强） 防守', resistanceLevels: '7500-7550（不应从大盘导出）' },
          { symbol: 'QQQ', supportLevels: '671–681（小）', resistanceLevels: '734–744（小）\n693–724（强）注意反弹承压' },
          // Plan prices are shared per symbol and must travel in levels, exactly like the browser client sends them.
          { symbol: 'MSFT', supportLevels: '381 – 392（中） 长线\n无法解析这一行\n360-375（强）', resistanceLevels: '397-430（超强） 突破右侧' },
          { symbol: 'AVGO', supportLevels: '433.5-392.25 反向小数区间', resistanceLevels: '' },
        ],
      },
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

  const exportButton = page.locator('#exportActionPlanZonesBtn');
  await expect(exportButton).toBeVisible();
  const exportComesBeforeEdit = await page.evaluate(() => {
    const exportNode = document.querySelector('#exportActionPlanZonesBtn');
    const editNode = document.querySelector('#initializeBtn');
    return Boolean(exportNode?.compareDocumentPosition(editNode) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(exportComesBeforeEdit).toBe(true);
  await exportButton.click();
  const modal = page.locator('#actionPlanZoneExportModal');
  await expect(modal).toBeVisible();
  const output = modal.locator('#actionPlanZoneExportOutput');
  await expect(output).toHaveValue([
    "// --- 标普500 ---",
    "",
    "// 支撑位",
    "draw_zone('SPX,ES1!,ES', 7350, 7310, '支撑: 7310-7350 (小)')",
    "draw_zone('SPX,ES1!,ES', 7250, 7200, '支撑: 7200-7250 (强) 防守')",
    "",
    "// 负伽马位 (关键破位点)",
    "// 给它稍微加了2个点的厚度，并在图表上强制显示为醒目的红色",
    "draw_zone('SPX,ES1!,ES', 6476, 6474, '负伽马: 6475 (破位大抛压)', color.new(color.red, 50), color.red)",
    "",
    "// 加速下跌位 (关键破位点)",
    "// 给它稍微加了2个点的厚度，并在图表上强制显示为醒目的红色",
    "draw_zone('SPX,ES1!,ES', 7621, 7619, '加速下跌: 7620 (跌破加速卖出)', color.new(color.red, 50), color.red)",
    "draw_zone('SPX,ES1!,ES', 7357, 7355, '加速下跌: 7356 (跌破加速卖出)', color.new(color.red, 50), color.red)",
    "draw_zone('SPX,ES1!,ES', 6885, 6883, '加速下跌: 6884 (跌破加速卖出)', color.new(color.red, 50), color.red)",
    "",
    "// QQQ 的压力支持",
    "draw_zone('QQQ', 734, 744, '压力: 734-744 (小)')",
    "draw_zone('QQQ', 693, 724, '压力: 693-724 (强) 注意反弹承压')",
    "draw_zone('QQQ', 671, 681, '支撑: 671-681 (小)')",
    "",
    "// MSFT 的压力支持",
    "draw_zone('MSFT', 397, 430, '压力: 397-430 (超强) 突破右侧')",
    "draw_zone('MSFT', 381, 392, '支撑: 381-392 (中) 长线')",
    "draw_zone('MSFT', 360, 375, '支撑: 360-375 (强)')",
    "",
    "// AVGO 的压力支持",
    "draw_zone('AVGO', 392.25, 433.5, '支撑: 392.25-433.5 反向小数区间')",
  ].join('\n'));
  await expect(output).not.toHaveValue(/无法解析/);
  await expect(output).not.toHaveValue(/600-620/);
  await expect(output).not.toHaveValue(/7500-7550/);
  await expect(output).not.toHaveValue(/7000-7100/);
  await expect(modal.locator('#actionPlanZoneExportSummary')).toContainText('4 个标的、13 个区间');
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
      DELETE FROM daily_review_symbol_levels WHERE archive_date=${sqlQuote(EMPTY_EXPORT_DATE)};
      DELETE FROM daily_review_archive WHERE archive_date=${sqlQuote(EMPTY_EXPORT_DATE)};`);

  const accountsJson = await (await request.get(`${BASE_URL}/api/investment-accounts`)).json();
  const tiger = accountsJson.items.find((item) => item.name === '老虎-美股');
  expect(tiger).toBeTruthy();

  const saveResponse = await request.post(`${BASE_URL}/api/reviews/${EMPTY_EXPORT_DATE}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '空导出测试。',
      marketReview: { blocks: [], levels: [{ symbol: 'MSFT', supportLevels: '等待结构确认', resistanceLevels: '' }] },
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
  await page.locator('#exportActionPlanZonesBtn').click();

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
      /\/\/ LIVEZONE 的压力支持\ndraw_zone\('LIVEZONE', 100, 110, '支撑: 100-110 \(中\) 观察'\)/,
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
