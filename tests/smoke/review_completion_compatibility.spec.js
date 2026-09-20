import {test,expect} from '@playwright/test';
import {mountReview} from '../helpers/review-completion-browser.mjs';
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

test('editing an already completed review preserves baseline save behavior',async({browser})=>{
 const {assertEquivalent}=await import('../helpers/review-completion-compare.mjs');
 const outcomes=[];
 for(const baseline of [true,false]){
  const context=await browser.newContext();const page=await context.newPage();let f;
  try{
   f=await mountReview(page,{baseline});
   await page.getByRole('button',{name:'完成复盘',exact:true}).click();
   await expect(page.locator('#reviewDrawer')).toBeHidden();
   await page.locator('#reviewsList tr').filter({hasText:'2026-09-16'}).getByRole('button',{name:'编辑',exact:true}).click();
   await page.locator('#reviewDrawer:not(.review-loading)').waitFor();
   await page.locator('#reviewerNewsNotesInput').fill('完成后的编辑内容');
   await page.locator('#saveDraftBtn').click();
   await expect(page.locator('#nextStepBtn')).toHaveText('已复盘');
   outcomes.push(f.h.snapshot());
  }finally{await context.close();f?.h.close();}
 }
 assertEquivalent(outcomes[0],outcomes[1]);
});
