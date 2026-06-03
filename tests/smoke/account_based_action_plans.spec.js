import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';
const ACCOUNT_PLAN_DATE = '2026-03-16';

test.describe.configure({ mode: 'serial' });

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

test('account API and account-grouped action plans support same symbol across accounts', async ({ request }) => {
  seedTrackedSymbol('ACCT');
  const accountsResponse = await request.get(`${BASE_URL}/api/investment-accounts`);
  expect(accountsResponse.ok()).toBeTruthy();
  const accountsJson = await accountsResponse.json();
  const tiger = accountsJson.items.find((item) => item.name === '老虎-美股');
  const eastmoney = accountsJson.items.find((item) => item.name === '东方财富-国内');
  expect(tiger).toBeTruthy();
  expect(eastmoney).toBeTruthy();

  const saveResponse = await request.post(`${BASE_URL}/api/reviews/${ACCOUNT_PLAN_DATE}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '账户化操作计划：新闻总结。',
      marketSentiment: '账户化操作计划：大盘盘点。',
      sectorRotation: '账户化操作计划：板块轮动。',
      tradingSummary: '',
      actionPlans: [
        { accountId: tiger.id, symbol: 'ACCT', actionType: '持仓观察', currentPosition: '0-5%', marketType: '美股' },
        { accountId: eastmoney.id, symbol: 'ACCT', actionType: '准备开仓', currentPosition: '0%', marketType: '大A' },
      ],
    },
  });
  expect(saveResponse.ok()).toBeTruthy();

  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${ACCOUNT_PLAN_DATE}/bootstrap`);
  const json = await bootstrap.json();
  expect(json.investmentAccounts.length).toBeGreaterThanOrEqual(3);
  expect(json.actionPlans).toEqual(expect.arrayContaining([
    expect.objectContaining({ accountId: tiger.id, accountName: '老虎-美股', symbol: 'ACCT' }),
    expect.objectContaining({ accountId: eastmoney.id, accountName: '东方财富-国内', symbol: 'ACCT' }),
  ]));
});

test('account page and review drawer render account groups', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.locator('.nav-chip[data-view="accounts"]').click();
  await expect(page.locator('#accountsView')).toHaveClass(/active/);
  await expect(page.locator('#accountLivePlans')).toContainText('老虎-美股');
  await expect(page.locator('#accountLivePlans')).toContainText('USD');
<<<<<<< Updated upstream
=======
  await expect(page.locator('#accountLivePlans .action-plan-account-impact')).toHaveCount(0);
>>>>>>> Stashed changes

  await page.locator('.nav-chip[data-view="reviews"]').click();
  await page.locator('#filtersForm input[name="from"]').fill(ACCOUNT_PLAN_DATE);
  await page.locator('#filtersForm input[name="to"]').fill(ACCOUNT_PLAN_DATE);
  await page.locator('#filtersForm').getByRole('button', { name: '查询' }).click();
  const row = page.locator('#reviewsList tr', { hasText: ACCOUNT_PLAN_DATE }).first();
  await expect(row).toBeVisible();
<<<<<<< Updated upstream
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看|编辑草稿/ }).click();
  await page.getByText('个股操作', { exact: true }).click();
  const drawerPlans = page.locator('#actionPlanAccountGroups');
  await expect(drawerPlans.locator('.action-plan-group-label', { hasText: '老虎-美股' })).toBeVisible();
  await expect(drawerPlans.locator('.action-plan-account-funds').first()).toContainText('可用');
=======
  await row.getByRole('button', { name: /开始复盘|编辑草稿|查看/ }).click();
  await page.getByText('4. 操作计划', { exact: true }).click();
  const reviewPlans = page.locator('#actionPlanAccountGroups');
  await expect(reviewPlans.locator('.action-plan-group-label', { hasText: '老虎-美股' })).toBeVisible();
  await expect(reviewPlans.locator('.action-plan-account-funds').first()).toContainText('可用');
>>>>>>> Stashed changes
  await expect(page.locator('#actionPlanRowsUs tr', { hasText: 'ACCT' })).toBeVisible();
  await page.locator('#actionPlanRowsUs tr', { hasText: 'ACCT' }).click();
  await expect(page.locator('#actionPlanAccountSelect')).toBeVisible();
});

test('custom accounts can be deleted when unused', async ({ page, request }) => {
  const name = `删除测试账户-${Date.now()}`;
  const createResponse = await request.post(`${BASE_URL}/api/investment-accounts`, {
    data: {
      name,
      broker: '测试',
      accountType: 'stock',
      region: 'CN',
      currency: 'CNY',
      totalAssets: 10000,
      availableCash: 1000,
      enabled: true,
      sortOrder: 8800,
    },
  });
  expect(createResponse.ok()).toBeTruthy();

  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.locator('.nav-chip[data-view="accounts"]').click();
<<<<<<< Updated upstream
  const accountRow = page.locator('#accountLivePlans .action-plan-group', { hasText: name }).first();
  await expect(accountRow).toBeVisible();
  await accountRow.getByRole('button', { name: '编辑' }).click();
  await expect(page.locator('#accountForm')).toBeVisible();
  await expect(page.locator('#accountFormDeleteBtn')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#accountFormDeleteBtn').click();
=======
  const accountCard = page.locator('#accountLivePlans .action-plan-group', { hasText: name }).first();
  await expect(accountCard).toBeVisible();
  await accountCard.getByRole('button', { name: '编辑' }).click();
  const deleteButton = page.locator('#accountFormDeleteBtn');
  await expect(deleteButton).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await deleteButton.click();
>>>>>>> Stashed changes
  await expect(page.locator('#accountLivePlans .action-plan-group', { hasText: name })).toHaveCount(0);

  const accountsResponse = await request.get(`${BASE_URL}/api/investment-accounts`);
  const accountsJson = await accountsResponse.json();
  expect(accountsJson.items.some((item) => item.name === name)).toBeFalsy();
});

test('account asset inputs are entered in ten-thousand units', async ({ page, request }) => {
  const name = `万元单位账户-${Date.now()}`;

  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.locator('.nav-chip[data-view="accounts"]').click();
  await page.getByRole('button', { name: '新增账户' }).click();

  const form = page.locator('#accountForm');
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="broker"]').fill('测试');
  await form.locator('[name="currency"]').fill('USD');
  await form.locator('[name="totalAssets"]').fill('2');
  await form.locator('[name="availableCash"]').fill('0.5');
  await form.locator('[name="sortOrder"]').fill('9901');
  await form.getByRole('button', { name: '新增账户' }).click();

  const accountRow = page.locator('#accountLivePlans .action-plan-group', { hasText: name }).first();
  await expect(accountRow).toBeVisible();
  await expect(accountRow).toContainText('$2万');
  await expect(accountRow).toContainText('可用 $0.5万');
  await expect(accountRow).not.toContainText('$0万');

  const accountsResponse = await request.get(`${BASE_URL}/api/investment-accounts`);
  const accountsJson = await accountsResponse.json();
  const created = accountsJson.items.find((item) => item.name === name);
  expect(created?.totalAssets).toBe(20000);
  expect(created?.availableCash).toBe(5000);

  if (created?.id) {
    await request.delete(`${BASE_URL}/api/investment-accounts/${created.id}`);
  }
});
