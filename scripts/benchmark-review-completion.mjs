import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function captureBaseline() {
  const destination = path.join(root, '.tests/review-completion/baseline');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.mkdir(destination); // Never overwrite a captured baseline.
  const inputs = ['cloudflare/worker/src', 'cloudflare/web', 'cloudflare/migrations',
    'package.json', 'package-lock.json', 'tests/testdata/config/wrangler.test.toml'];
  for (const input of inputs) {
    await fs.mkdir(path.dirname(path.join(destination, input)), { recursive: true });
    await fs.cp(path.join(root, input), path.join(destination, input), { recursive: true });
  }
  const hashes = {};
  async function scan(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await scan(file);
      else hashes[path.relative(destination, file)] = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
    }
  }
  await scan(destination);
  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ capturedAt: new Date().toISOString(), hashes }, null, 2));
  return destination;
}

export function assertTestUrl(value, allowed = []) {
  const url = new URL(value);
  const production = 'my-financial-agent.rtw1994.workers.dev';
  if (url.hostname === production || url.username || url.password ||
      !['http:', 'https:'].includes(url.protocol)) throw new Error('Unsafe benchmark target');
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) && !allowed.includes(url.origin)) throw new Error('Unregistered isolated target');
  return url.origin;
}
export function summarize(samples) {
  const values = samples.slice().sort((a,b)=>a-b);
  if (!values.length) throw new Error('No samples');
  const m=Math.floor(values.length/2);
  return {count:values.length,median:values.length%2?values[m]:(values[m-1]+values[m])/2,p95:values[Math.ceil(values.length*.95)-1]};
}
export async function benchmarkLocal({pairs=30, fixtures=['normal','large'], baselineSelf=false, output='test-results/review-completion'}={}) {
 const {chromium}=await import('@playwright/test');
 const {mountReview}=await import('../tests/helpers/review-completion-browser.mjs');
 const {workloads}=await import('../tests/helpers/review-completion-fixtures.mjs');
 const {assertEquivalent}=await import('../tests/helpers/review-completion-compare.mjs');
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 const samples=[];const comparisons=[];
 try {
  for(const fixture of fixtures){
   if(!workloads[fixture])throw new Error('Unknown fixture');
   for(let pair=0;pair<pairs;pair++){
    const snapshots={};
    for(const variant of (pair%2?['candidate','baseline']:['baseline','candidate'])){
     const context=await browser.newContext();const page=await context.newPage();let mounted;
     try {
      mounted=await mountReview(page,{baseline:variant==='baseline'||baselineSelf,fixture:workloads[fixture]});
      await page.evaluate(() => {
       const drawer = document.querySelector('#reviewDrawer');
       window.__reviewMeasurement = {};
       document.addEventListener('click', event => {
        if (event.target.closest('button')?.textContent.trim() === '完成复盘') {
         window.__reviewMeasurement.start = performance.now();
        }
       }, {capture: true});
       const observer = new MutationObserver(() => {
        if (drawer.classList.contains('hidden') && window.__reviewMeasurement.start != null) {
         window.__reviewMeasurement.durationMs = performance.now() - window.__reviewMeasurement.start;
         observer.disconnect();
        }
       });
       observer.observe(drawer, {attributes: true, attributeFilter: ['class']});
      });
      const stages=[];
      page.on('requestfinished',request=>{if(request.url().includes('/api/')){const t=request.timing();stages.push({path:new URL(request.url()).pathname,durationMs:t.responseEnd});}});
      const start=performance.now();await page.getByRole('button',{name:'完成复盘',exact:true}).click();
      await page.locator('#reviewDrawer').waitFor({state:'hidden'});
      const durationMs = await page.evaluate(() => window.__reviewMeasurement.durationMs);
      if (!Number.isFinite(durationMs)) throw new Error('Completion click measurement missing');
      samples.push({fixture,pair,variant,first:pair===0,durationMs,driverDurationMs:performance.now()-start,stages,stats:mounted.h.stats(),success:true});
      snapshots[variant]=mounted.h.snapshot();
     } finally {await context.close();mounted?.h.close();}
    }
    assertEquivalent(snapshots.baseline,snapshots.candidate);comparisons.push({fixture,pair,equivalent:true});
   }
  }
 } finally {await browser.close();}
 const summary={measurement:'local browser + Node SQLite D1 adapter; NOT remote D1 latency',baselineSelf,pairs,fixtures:{},businessEquivalent:true,remoteAcceptance:'NOT RUN'};
 for(const fixture of fixtures){const baseline=summarize(samples.filter(x=>x.fixture===fixture&&x.variant==='baseline').map(x=>x.durationMs));const candidate=summarize(samples.filter(x=>x.fixture===fixture&&x.variant==='candidate').map(x=>x.durationMs));summary.fixtures[fixture]={baseline,candidate,medianReduction:1-candidate.median/baseline.median,p95Reduction:1-candidate.p95/baseline.p95};}
 await fs.mkdir(path.resolve(root,output),{recursive:true});
 for(const [name,data] of Object.entries({samples,summary,comparisons}))await fs.writeFile(path.resolve(root,output,`${name}.json`),JSON.stringify(data,null,2));
 return summary;
}

async function installPageMeasurement(page) {
 await page.evaluate(() => {
  const drawer = document.querySelector('#reviewDrawer');
  window.__reviewMeasurement = {};
  document.addEventListener('click', event => {
   if (event.target.closest('button')?.textContent.trim() === '完成复盘') {
    window.__reviewMeasurement.start = performance.now();
   }
  }, {capture: true});
  const observer = new MutationObserver(() => {
   if (drawer.classList.contains('hidden') && window.__reviewMeasurement.start != null) {
    window.__reviewMeasurement.durationMs = performance.now() - window.__reviewMeasurement.start;
    observer.disconnect();
   }
  });
  observer.observe(drawer, {attributes: true, attributeFilter: ['class']});
 });
}

function trackApiIdle(page,quietMs=600){
 let pending=0;let lastActivity=Date.now();
 const relevant=request=>request.url().includes('/api/');
 page.on('request',request=>{if(relevant(request)){pending+=1;lastActivity=Date.now();}});
 const finish=request=>{if(relevant(request)){pending=Math.max(0,pending-1);lastActivity=Date.now();}};
 page.on('requestfinished',finish);page.on('requestfailed',finish);
 return {
  mark(){lastActivity=Date.now();},
  async wait(timeoutMs=15000){
   const deadline=Date.now()+timeoutMs;
   while(pending>0||Date.now()-lastActivity<quietMs){
    if(Date.now()>deadline)throw new Error(`API did not become idle (${pending} pending)`);
    await new Promise(resolve=>setTimeout(resolve,50));
   }
  },
 };
}

// 本机代理对长连接偶发中断；reset/seed/snapshot 都是幂等且不在被测量的点击链路上，
// 因此在这里重试是安全的，不会影响耗时测量。
async function withRetry(label, operation, attempts = 3) {
 let lastError;
 for (let attempt = 1; attempt <= attempts; attempt++) {
  try { return await operation(); }
  catch (error) {
   lastError = error;
   if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
  }
 }
 throw new Error(`${label} failed after ${attempts} attempts: ${lastError?.message || lastError}`);
}

async function prepareRemoteSample(api, url, token, fixture) {
 const headers={'x-review-perf-token':token};
 const seeded=await withRetry(`Remote reset ${url}`, async () => {
  const reset=await api.post(`${url}/__review-perf/reset`,{headers,data:{fixture}});
  if(!reset.ok())throw new Error(`status ${reset.status()} ${await reset.text()}`);
  return reset.json();
 });
 await withRetry(`Remote seed save ${url}`, async () => {
  const saved=await api.post(`${url}/api/reviews/${seeded.reviewDate}`,{data:seeded.payload});
  if(!saved.ok())throw new Error(`status ${saved.status()} ${await saved.text()}`);
 });
 return seeded.reviewDate;
}

async function remoteSnapshot(api,url,token){
 return withRetry(`Remote snapshot ${url}`, async () => {
  const response=await api.get(`${url}/__review-perf/snapshot`,{headers:{'x-review-perf-token':token}});
  if(!response.ok())throw new Error(`status ${response.status()} ${await response.text()}`);
  return response.json();
 });
}

export async function benchmarkRemote({baselineUrl,candidateUrl,token,pairs=30,fixtures=['normal','large'],allowedOrigins=[],output='test-results/review-completion/remote'}={}){
 if(!token)throw new Error('Remote benchmark token is required');
 const targets={
  baseline:(Array.isArray(baselineUrl)?baselineUrl:[baselineUrl]).map(url=>assertTestUrl(url,allowedOrigins)),
  candidate:(Array.isArray(candidateUrl)?candidateUrl:[candidateUrl]).map(url=>assertTestUrl(url,allowedOrigins)),
 };
 if(targets.baseline.length!==targets.candidate.length)throw new Error('Baseline and candidate target counts must match');
 if(targets.baseline.some(url=>targets.candidate.includes(url)))throw new Error('Baseline and candidate remote targets must differ');
 const {chromium,request}=await import('@playwright/test');
 const {assertEquivalent}=await import('../tests/helpers/review-completion-compare.mjs');
 const proxy=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
 const browser=await chromium.launch({
  executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  ...(proxy?{proxy:{server:proxy}}:{}),
 });
 const api=await request.newContext(proxy?{proxy:{server:proxy}}:{});
 const samples=[];const comparisons=[];
 const contexts={};
 for(const variant of ['baseline','candidate'])for(let bank=0;bank<targets[variant].length;bank++)contexts[`${variant}:${bank}`]=await browser.newContext();
 const outputDirectory=path.resolve(root,output);
 await fs.mkdir(outputDirectory,{recursive:true});
 try{
  for(const fixture of fixtures){
   for(let pair=0;pair<pairs;pair++){
    const snapshots={};
    const bank=pair%targets.baseline.length;
    for(const variant of (pair%2?['candidate','baseline']:['baseline','candidate'])){
     const url=targets[variant][bank];
     const reviewDate=await prepareRemoteSample(api,url,token,fixture);
     const page=await contexts[`${variant}:${bank}`].newPage();
     const apiIdle=trackApiIdle(page);
     const stages=[];
     page.on('requestfinished',request=>{if(request.url().includes('/api/')){const timing=request.timing();stages.push({path:new URL(request.url()).pathname,durationMs:timing.responseEnd});}});
     try{
      await page.goto(url,{waitUntil:'load'});
      await page.locator('#reviewsList tr').filter({hasText:reviewDate}).locator('[data-review-open]').first().click();
      await page.locator('#reviewDrawer:not(.review-loading)').waitFor();
      apiIdle.mark();
      for(let index=0;index<4;index++)await page.getByRole('button',{name:'下一步',exact:true}).click();
      await page.getByRole('button',{name:'完成复盘',exact:true}).waitFor();
      await apiIdle.wait();
      stages.length=0;
      await installPageMeasurement(page);
      await page.getByRole('button',{name:'完成复盘',exact:true}).click();
      // 远程 large 工作量下基线单次完成可达 15 秒，默认 30 秒上限会偶发中断整轮采样。
      await page.locator('#reviewDrawer').waitFor({state:'hidden',timeout:120000});
      const durationMs=await page.evaluate(()=>window.__reviewMeasurement.durationMs);
      if(!Number.isFinite(durationMs))throw new Error('Remote click measurement missing');
      samples.push({fixture,pair,bank,variant,first:!samples.some(sample=>sample.variant===variant&&sample.bank===bank),durationMs,stages,success:true});
      snapshots[variant]=await remoteSnapshot(api,url,token);
     }finally{await page.close();}
    }
    assertEquivalent(snapshots.baseline,snapshots.candidate);
    comparisons.push({fixture,pair,equivalent:true});
    await fs.writeFile(path.join(outputDirectory,'samples.partial.json'),JSON.stringify(samples,null,2));
    await fs.writeFile(path.join(outputDirectory,'comparisons.partial.json'),JSON.stringify(comparisons,null,2));
    console.error(`[remote benchmark] ${fixture} pair ${pair+1}/${pairs} complete`);
   }
  }
 }finally{
  await Promise.all(Object.values(contexts).map(context=>context.close()));
  await api.dispose();await browser.close();
 }
 const summary={measurement:'remote Cloudflare Workers + isolated D1; browser click to final UI update',pairs,fixtures:{},businessEquivalent:true,remoteAcceptance:'RUN'};
 for(const fixture of fixtures){
  const baseline=summarize(samples.filter(x=>x.fixture===fixture&&x.variant==='baseline').map(x=>x.durationMs));
  const candidate=summarize(samples.filter(x=>x.fixture===fixture&&x.variant==='candidate').map(x=>x.durationMs));
  summary.fixtures[fixture]={baseline,candidate,medianReduction:1-candidate.median/baseline.median,p95Reduction:1-candidate.p95/baseline.p95};
 }
 for(const [name,data] of Object.entries({samples,summary,comparisons}))await fs.writeFile(path.join(outputDirectory,`${name}.json`),JSON.stringify(data,null,2));
 return summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 if(process.argv.includes('--capture-baseline')) console.log(await captureBaseline());
 else if(process.argv.includes('--local-sqlite')) {
  const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
  const pairs=Number(arg('--pairs','30'));if(!Number.isInteger(pairs)||pairs<1)throw new Error('Invalid pairs');
  console.log(JSON.stringify(await benchmarkLocal({pairs,baselineSelf:process.argv.includes('--baseline-self'),fixtures:arg('--fixtures','normal,large').split(','),output:arg('--output','test-results/review-completion')}),null,2));
 } else if(process.argv.includes('--remote')){
  const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
  const values=name=>process.argv.flatMap((value,index)=>value===name?[process.argv[index+1]]:[]).filter(Boolean);
  const pairs=Number(arg('--pairs','30'));if(!Number.isInteger(pairs)||pairs<1)throw new Error('Invalid pairs');
  const tokenFile=arg('--token-file','');if(!tokenFile)throw new Error('--token-file is required');
  console.log(JSON.stringify(await benchmarkRemote({
   baselineUrl:values('--baseline-url'),candidateUrl:values('--candidate-url'),
   token:(await fs.readFile(path.resolve(root,tokenFile),'utf8')).trim(),pairs,
   fixtures:arg('--fixtures','normal,large').split(','),allowedOrigins:values('--allow-origin'),
   output:arg('--output','test-results/review-completion/remote'),
  }),null,2));
 } else throw new Error('Choose --local-sqlite or --remote with explicitly allowed isolated targets.');
}
