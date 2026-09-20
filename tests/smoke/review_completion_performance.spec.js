import {test,expect} from '@playwright/test';
import {mountReview} from '../helpers/review-completion-browser.mjs';
if(process.env.PLAYWRIGHT_EXECUTABLE_PATH)test.use({launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}});
test('completion uses one final list refresh without save-triggered impact preview',async({page})=>{
 const fixture=await mountReview(page,{baseline:process.env.REVIEW_BASELINE==='1'});
 try{
  const start=performance.now();await page.getByRole('button',{name:'完成复盘',exact:true}).click();
  await expect(page.locator('#reviewDrawer')).toBeHidden();
  const elapsed=performance.now()-start;
  expect(fixture.requests.filter(x=>x.path==='/api/reviews')).toHaveLength(1);
  expect(fixture.requests.filter(x=>x.path.endsWith('/account-impact/preview'))).toHaveLength(0);
  expect(fixture.requests.filter(x=>x.body).map(x=>x.path)).toEqual(['/api/reviews/2026-09-16','/api/reviews/2026-09-16/complete']);
  expect(fixture.h.snapshot().daily_review_archive.find(x=>x.archive_date==='2026-09-16').review_status).toBe('reviewed');
  test.info().annotations.push({type:'local-sqlite-elapsed-ms',description:String(elapsed)});
 }finally{fixture.h.close();}
});
