import fs from 'node:fs/promises';
import path from 'node:path';
import {createHarness,root,baselineRoot} from './review-completion-harness.mjs';
import {reviewDate} from './review-completion-fixtures.mjs';
export async function mountReview(page,{baseline=false,fixture={},failComplete=false,failSave=false,harness=null}={}){
 const h=harness || await createHarness({baseline,fixture});
 await h.request(`/api/reviews/${reviewDate}`,h.payload);
 const requests=[];let completionFailure=failComplete;let saveFailure=failSave;
 await page.route('http://review.test/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/api/')){
   const body=route.request().method()==='POST'?route.request().postDataJSON():undefined;
   requests.push({path:url.pathname,body});
   if((completionFailure&&url.pathname.endsWith('/complete'))||(saveFailure&&body&&!url.pathname.endsWith('/preview'))){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'injected failure'})});return;}
   const result=await h.request(url.pathname+url.search,body);
   await route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.body)});return;
  }
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  const file=path.resolve(baseline?baselineRoot:root,'cloudflare/web',name);
  if(!file.startsWith(path.join(baseline?baselineRoot:root,'cloudflare/web')+path.sep)){await route.abort();return;}
  try{await route.fulfill({body:await fs.readFile(file),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/html'});}catch{await route.fulfill({status:404,body:''});}
 });
 page.on('dialog',dialog=>dialog.accept());
 await page.goto('http://review.test/');
 await page.locator("#reviewsList tr").filter({hasText:reviewDate}).locator("[data-review-open]").first().click();
 await page.locator('#reviewDrawer:not(.review-loading)').waitFor();
 // Follow the actual wizard without injecting application state; the pre-merge baseline still has a separate rotation step.
 for(let i=0;i<(baseline?4:3);i++) await page.getByRole('button',{name:'下一步',exact:true}).click();
 await page.getByRole('button',{name:'完成复盘',exact:true}).waitFor();
 // Drain initial bootstrap/preview before measuring the click.
 await page.waitForLoadState('networkidle');requests.length=0;
 return {h,requests,allowRequests(){completionFailure=false;saveFailure=false;}};
}

// Reference outcome: one clean single-page completion of the current code on a fresh database.
export async function completeOnce(browser,options={}){
 const context=await browser.newContext();const page=await context.newPage();let f;
 try{
  f=await mountReview(page,options);
  await page.getByRole('button',{name:'完成复盘',exact:true}).click();
  await page.locator('#reviewDrawer').waitFor({state:'hidden'});
  return f.h.snapshot();
 }finally{await context.close();f?.h.close();}
}
