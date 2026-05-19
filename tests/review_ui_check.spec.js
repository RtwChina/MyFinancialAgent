import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8787';

test('review workspace renders table and step modal', async ({ page, request }) => {
  await request.post(`${BASE_URL}/api/reviews/2026-03-13/initialize`);
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /review workspace/i }).click();
  await expect(page.getByRole('heading', { name: '待复盘日期' })).toBeVisible();
  await page.screenshot({
    path: '/Users/rtw/Project/PythonProject/MyFinancialAgent/output/review_cycle_check_list.png',
    fullPage: true,
  });

  const startButton = page.getByRole('button', { name: /开始复盘|进入复盘|继续编辑|查看复盘/ }).first();
  await expect(startButton).toBeVisible();
  await startButton.click();

  await expect(page.getByRole('heading', { name: '当日复盘' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '当日价格' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '新闻汇总' })).toBeVisible();
  await expect(page.getByRole('button', { name: /2\. 大盘盘点/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /3\. 板块轮动/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /4\. 操作计划/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /5\. 深度总结/ })).toBeVisible();
  await expect(page.locator('#marketSentimentBlockEditor')).toBeHidden();
  await expect(page.locator('.review-news-section').first()).toBeVisible();

  await page.locator('.review-modal-panel').screenshot({
    path: '/Users/rtw/Project/PythonProject/MyFinancialAgent/output/review_cycle_check_drawer.png',
  });
  await page.locator('textarea[name="newsBrief"]').fill('市场主线是谷歌 AI 搜索商业化推进，广告变现预期改善。');
  await page.locator('#nextStepBtn').click();
  await expect(page.locator('textarea[name="newsBrief"]')).toBeHidden();
  await expect(page.locator('#marketSentimentBlockEditor')).toBeVisible();
  await page.locator('[data-note-add-section="marketSentiment"]').click();
  await page.locator('#marketSentimentBlockEditor .structured-note-section input').first().fill('美元和利率');
  await page.locator('#marketSentimentBlockEditor .structured-note-subsection textarea').first().fill('美元和利率相对稳定，风险偏好仍偏向 AI 主线。');
  await page.locator('#nextStepBtn').click();
  await page.locator('[data-note-add-section="sectorRotation"]').click();
  await page.locator('#sectorRotationBlockEditor .structured-note-section input').first().fill('通信设备');
  await page.locator('#sectorRotationBlockEditor .structured-note-subsection textarea').first().fill('通信设备和 AI 基建链更强，防御资产偏弱。');
  await page.locator('#nextStepBtn').click();
  await page.locator('textarea[name="assetPlan"]').fill('继续关注 GOOGL 和 LITE，等待回踩后的右侧加仓机会。');
  await page.locator('#nextStepBtn').click();
  await expect(page.getByText('深度思考与交易总结（可选）')).toBeVisible();
  await expect(page.locator('#nextStepBtn')).toHaveText('完成复盘');
  await page.locator('#reviewForm').screenshot({
    path: '/Users/rtw/Project/PythonProject/MyFinancialAgent/output/review_cycle_check_form.png',
  });
});
