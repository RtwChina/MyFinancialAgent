import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8787';
const INITIALIZED_DATE = '2026-03-12';

test('news view defaults to major events and initialized reviews can start cleanly', async ({ page, request }) => {
  await request.post(`${BASE_URL}/api/reviews/${INITIALIZED_DATE}/initialize`);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await expect(page.locator('select[name="type"]')).toHaveValue('major');
  await expect(page.locator('input[name="stars"][value="3"]')).toBeChecked();
  await expect(page.locator('input[name="stars"][value="4"]')).toBeChecked();
  await expect(page.locator('input[name="stars"][value="5"]')).toBeChecked();
  await expect(page.locator('#newsDetailModal')).toBeHidden();

  const firstNewsRow = page.locator('.news-table tbody tr').first();
  await expect(firstNewsRow).toBeVisible();
  await expect(firstNewsRow.locator('td').nth(1).locator('strong')).not.toHaveText('无标题');
  await expect(firstNewsRow.locator('td').nth(1).locator('p')).not.toHaveText('');
  await firstNewsRow.getByRole('button', { name: '查看详情' }).click();
  await expect(page.locator('#newsDetailModal')).toBeVisible();
  await expect(page.locator('#newsDetailTitle')).not.toHaveText('无标题');
  await page.screenshot({
    path: '/Users/rtw/Project/PythonProject/MyFinancialAgent/output/news_cycle_check.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.locator('#newsDetailModal')).toBeHidden();

  await page.getByRole('button', { name: /review workspace/i }).click();
  await page.locator('#filtersForm select[name="status"]').selectOption('initialized');
  await page.locator('#filtersForm').getByRole('button', { name: '查询' }).click();
  await page.getByRole('button', { name: '开始复盘' }).first().click();

  await expect(page.locator('#reviewStatusBadge')).toContainText('待开始');
  await expect(page.locator('#initializeBtn')).toBeDisabled();
  await expect(page.locator('#marketSentimentBlockEditor')).toBeVisible();
  await expect(page.locator('#marketSentimentBlockEditor')).not.toHaveClass(/is-readonly/);
  await page.locator('.review-modal-panel').screenshot({
    path: '/Users/rtw/Project/PythonProject/MyFinancialAgent/output/review_initialized_check.png',
  });
});
