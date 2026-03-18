import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:8787';
const REVIEW_DATE = '2026-03-11';

test('review workspace renders analysis, grouped prices, and reusable news detail modal', async ({ page, request }) => {
  await request.post(`${BASE_URL}/api/reviews/${REVIEW_DATE}/initialize`);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: '全量复盘列表' })).toBeVisible();

  const targetRow = page.locator('#reviewsList tr', { hasText: REVIEW_DATE }).first();
  await expect(targetRow).toBeVisible();
  await targetRow.getByRole('button', { name: /开始复盘|进入复盘|继续编辑|查看复盘/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await expect(page.locator('#editorTitle')).toContainText('当日复盘');
  await expect(page.locator('#archiveDateLabel')).toContainText(REVIEW_DATE);
  await expect(page.getByRole('heading', { name: '当日价格' })).toBeVisible();
  await expect(page.locator('#analysisBox')).toContainText('每日新闻总结');
  await expect(page.locator('#analysisBox')).toContainText('市场影响');
  await expect(page.locator('#analysisBox')).toContainText('逻辑链');
  await expect(page.locator('#analysisBox .ai-badge')).toHaveCount(3);

  await expect(page.locator('#pricesBox details').first()).toBeVisible();
  await expect(page.locator('#newsPicker')).toContainText('大盘新闻');
  await expect(page.locator('#newsPicker')).toContainText('个股新闻');
  await expect(page.locator('textarea[name="reviewerNewsNotes"]')).toBeVisible();
  await expect(page.locator('#nextStepBtn')).toHaveText('下一步');

  await page.locator('#newsPicker details').evaluateAll((nodes) => {
    nodes.forEach((node) => {
      node.open = true;
    });
  });
  await page.locator('#newsPicker .review-news-item button', { hasText: '查看新闻' }).first().click();
  await expect(page.locator('#newsDetailModal')).toBeVisible();
  await expect(page.locator('#newsDetailTitle')).not.toHaveText('');
});
