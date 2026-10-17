import {test,expect} from '@playwright/test';
import {mountReview} from '../helpers/review-completion-browser.mjs';
import {assertConverged} from '../helpers/review-completion-compare.mjs';
if(process.env.PLAYWRIGHT_EXECUTABLE_PATH)test.use({launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}});
test('standalone save still refreshes the list and impact preview without completing',async({page})=>{
 const f=await mountReview(page);try{
  const preview=page.waitForResponse(r=>r.url().endsWith('/account-impact/preview'));
  const list=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/reviews');
  await page.locator('#saveDraftBtn').click();await Promise.all([preview,list]);
  expect(f.requests.filter(x=>x.path==='/api/reviews')).toHaveLength(1);
  expect(f.requests.filter(x=>x.path.endsWith('/complete'))).toHaveLength(0);
  await expect(page.locator('#reviewDrawer')).toBeVisible();
 }finally{f.h.close();}
});
test('historical manual completion does not sync its daily plans into live plans',async({page})=>{
 const f=await mountReview(page,{fixture:{historical:true}});try{
  const before=f.h.snapshot().account_live_action_plans;
  await page.getByRole('button',{name:'完成复盘',exact:true}).click();await expect(page.locator('#reviewDrawer')).toBeHidden();
  expect(f.h.snapshot().account_live_action_plans).toEqual(before);
 }finally{f.h.close();}
});

// The pre-merge baseline stores market notes in retired columns, so the oracle is explicit:
// editing a completed review changes only the edited field.
test('editing an already completed review changes only the edited field',async({page})=>{
 const f=await mountReview(page);
 try{
  await page.getByRole('button',{name:'完成复盘',exact:true}).click();
  await expect(page.locator('#reviewDrawer')).toBeHidden();
  const completed=f.h.snapshot();
  await page.locator('#reviewsList tr').filter({hasText:'2026-09-16'}).getByRole('button',{name:'编辑',exact:true}).click();
  await page.locator('#reviewDrawer:not(.review-loading)').waitFor();
  // The list's edit entry opens a completed review on the plan step.
  await page.locator('#reviewOutline').getByRole('button',{name:'新闻总结',exact:true}).click();
  await page.locator('#reviewerNewsNotesInput').fill('完成后的编辑内容');
  await page.locator('#saveDraftBtn').click();
  await expect(page.locator('#reviewFooterMessage')).toContainText('复盘已保存');
  await expect(page.locator('#nextStepBtn')).toHaveText('已复盘');
  const expected=structuredClone(completed);
  const row=expected.daily_review_archive.find(x=>x.archive_date==='2026-09-16');
  row.reviewer_news_notes='完成后的编辑内容';row.updated_at='2026-10-01 00:00:00';
  const edited=f.h.snapshot();
  const editedRow=edited.daily_review_archive.find(x=>x.archive_date==='2026-09-16');
  expect(editedRow.review_status).toBe('reviewed');
  editedRow.updated_at='2026-10-01 00:00:00';
  assertConverged(expected,edited);
 }finally{f.h.close();}
});
