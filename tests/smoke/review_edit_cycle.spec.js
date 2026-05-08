import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:8787';
const REVIEW_DATE = '2026-03-13';

test('review can be completed, reopened, edited, and saved again', async ({ page, request }) => {
  await request.post(`${BASE_URL}/api/reviews/${REVIEW_DATE}/initialize`);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const row = page.locator('#reviewsList tr', { hasText: REVIEW_DATE }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.locator('textarea[name="reviewerNewsNotes"]').fill('本地冒烟：先完成一轮复盘。');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('textarea[name="marketSentiment"]').fill('本地冒烟：大盘变量已记录。');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('textarea[name="sectorRotation"]').fill('本地冒烟：板块轮动已记录。');
  await page.getByRole('button', { name: '下一步' }).click();
  if (await page.locator('#emptyActionPlanState').isVisible()) {
    await page.locator('#addActionPlanBtn').click();
  }
  await page.locator('#actionPlanSymbolInput').fill('MU');
  await page.locator('#actionPlanActionSelect').selectOption('持仓观察');
  await page.locator('#actionPlanPositionSelect').selectOption('0-10%');
  await page.locator('#actionPlanEntryInput').fill('本地冒烟：回踩支撑区再观察。');
  await page.locator('#actionPlanTakeProfitInput').fill('本地冒烟：突破压力位后分批止盈。');
  await page.locator('#actionPlanStopLossInput').fill('本地冒烟：跌破支撑位降低仓位。');
  await page.locator('#actionPlanKeyLevelsInput').fill('支撑位 (Support):\n82-88（中）\n\n压力位:\n95-102（中）');
  await page.locator('#actionPlanThinkingInput').fill('本地冒烟：结构化计划保存验证。');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '完成复盘' }).click();

  await expect(page.locator('#reviewDrawer')).toBeHidden();
  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${REVIEW_DATE}/bootstrap`);
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.actionPlans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        symbol: 'MU',
        actionType: '持仓观察',
        currentPosition: '0-10%',
      }),
    ]),
  );

  await page.locator('#filtersForm select[name="status"]').selectOption('reviewed');
  await page.locator('#filtersForm').getByRole('button', { name: '查询' }).click();
  const reviewedRow = page.locator('#reviewsList tr', { hasText: REVIEW_DATE }).first();
  await expect(reviewedRow).toBeVisible();
  await reviewedRow.getByRole('button', { name: /查看|继续复盘|开始复盘/ }).click();

  await expect(page.locator('#reviewStatusBadge')).toContainText('已复盘');
  await expect(page.locator('#initializeBtn')).toHaveText('编辑');
  await expect(page.locator('textarea[name="reviewerNewsNotes"]')).toHaveJSProperty('readOnly', true);

  await page.locator('#initializeBtn').click();
  await expect(page.locator('#initializeBtn')).toHaveText('编辑中');
  await expect(page.locator('textarea[name="reviewerNewsNotes"]')).toHaveJSProperty('readOnly', false);
  await page.locator('textarea[name="reviewerNewsNotes"]').fill('本地冒烟：已复盘后再次编辑并保存。');
  await page.locator('#saveDraftBtn').click();

  await expect(page.locator('#initializeBtn')).toHaveText('编辑');
  await expect(page.locator('textarea[name="reviewerNewsNotes"]')).toHaveJSProperty('readOnly', true);
  await expect(page.locator('textarea[name="reviewerNewsNotes"]')).toHaveValue('本地冒烟：已复盘后再次编辑并保存。');
});
