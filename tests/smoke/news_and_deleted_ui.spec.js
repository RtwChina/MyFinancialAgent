import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:8787';
const INITIALIZED_DATE = '2026-03-12';

test('news search and initialized review entry stay usable on the current UI', async ({ page, request }) => {
  await request.post(`${BASE_URL}/api/reviews/${INITIALIZED_DATE}/initialize`);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: '新闻检索' }).click();
  await expect(page.getByRole('heading', { name: '新闻检索台' })).toBeVisible();
  await expect(page.locator('select[name="type"]')).toHaveValue('');
  await expect(page.locator('select[name="starsMin"]')).toHaveValue('3');
  await expect(page.locator('#newsSummary')).toContainText('当前结果');

  const firstNewsRow = page.locator('#newsList tr').first();
  await expect(firstNewsRow).toBeVisible();
  await firstNewsRow.getByRole('button', { name: '查看详情' }).click();

  await expect(page.locator('#newsDetailModal')).toBeVisible();
  await expect(page.getByRole('heading', { name: '新闻详情' })).toBeVisible();
  await expect(page.locator('#newsDetailTitle')).not.toHaveText('');
  await expect(page.locator('#newsDetailTags .tag').first()).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.locator('#newsDetailModal')).toBeHidden();

  await page.getByRole('button', { name: '复盘工作台' }).click();
  await expect(page.getByRole('heading', { name: '全量复盘列表' })).toBeVisible();
  await page.locator('#filtersForm select[name="status"]').selectOption('initialized');
  await page.locator('#filtersForm').getByRole('button', { name: '查询' }).click();

  const targetRow = page.locator('#reviewsList tr', { hasText: INITIALIZED_DATE }).first();
  await expect(targetRow).toBeVisible();
  await targetRow.getByRole('button', { name: /开始复盘|进入复盘|继续编辑|查看复盘/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await expect(page.locator('#reviewStatusBadge')).toContainText('待开始');
  await expect(page.locator('#initializeBtn')).toBeDisabled();
  await expect(page.locator('textarea[name="reviewerNewsNotes"]')).toHaveJSProperty('readOnly', false);
});
