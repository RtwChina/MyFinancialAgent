import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './helpers/review-completion-harness.mjs';
import {assertEquivalent} from './helpers/review-completion-compare.mjs';
import {reviewDate} from './helpers/review-completion-fixtures.mjs';
for(const fixture of [{},{news:200,plans:40},{news:0,plans:0},{news:5,plans:3,sourceIds:true},{historical:true}]){
 test(`successful review preserves persisted content ${JSON.stringify(fixture)}`,async()=>{
  const a=await createHarness({baseline:true,fixture}),b=await createHarness({fixture});
  try{const ra=await a.complete(),rb=await b.complete();assert.equal(ra.status,200);assertEquivalent(ra,rb);assertEquivalent(a.snapshot(),b.snapshot());
   for(const suffix of ['', '/bootstrap'])assertEquivalent(await a.request(`/api/reviews/${reviewDate}${suffix}`),await b.request(`/api/reviews/${reviewDate}${suffix}`));
  }finally{a.close();b.close();}
 });
}

for(const scenario of ['explicit empty notes','missing symbol','missing account','same symbol two accounts','no prices','duplicate news hash','snake aliases','batch autofill'])test(`compatibility: ${scenario}`,async()=>{
 const a=await createHarness({baseline:true,fixture:{news:4,plans:2,historical:true}}),b=await createHarness({fixture:{news:4,plans:2,historical:true}});
 try{
  for(const h of [a,b]){
   if(scenario==='explicit empty notes'){h.payload.marketSentimentBlocks=[];h.payload.sectorRotationBlocks=[];}
   if(scenario==='missing symbol')h.payload.actionPlans[0].symbol='UNKNOWN';
   if(scenario==='missing account')h.payload.actionPlans[0].accountId=999;
   if(scenario==='same symbol two accounts')h.payload.actionPlans[1].symbol=h.payload.actionPlans[0].symbol;
   if(scenario==='no prices')h.sqlite.exec('DELETE FROM stock_raw');
   if(scenario==='duplicate news hash')h.sqlite.exec("UPDATE daily_news_ai_analysis SET source_news_ids='[1,1,2,999]'");
   if(scenario==='snake aliases'){h.payload.market_sentiment_blocks=h.payload.marketSentimentBlocks;delete h.payload.marketSentimentBlocks;h.payload.sector_rotation_blocks=h.payload.sectorRotationBlocks;delete h.payload.sectorRotationBlocks;}
  }
  const body=scenario==='batch autofill'?{onlyIfPending:true,completionSource:'batch',autoFill:{reviewerNewsNotes:'AI fallback',marketSentimentBlocks:[],sectorRotationBlocks:[]}}:{};
  assertEquivalent(await a.complete(body),await b.complete(body));assertEquivalent(a.snapshot(),b.snapshot());
  for(const url of ['/api/reviews?page=1','/api/reviews/pending?limit=all'])assertEquivalent(await a.request(url),await b.request(url));
  assertEquivalent(await a.request(`/api/reviews/${reviewDate}/complete`,{onlyIfPending:true}),await b.request(`/api/reviews/${reviewDate}/complete`,{onlyIfPending:true}));
 }finally{a.close();b.close();}
});

test('manual repeated completion and snake account snapshot preserve results',async()=>{
 const a=await createHarness({baseline:true}),b=await createHarness();try{
  assertEquivalent(await a.complete(),await b.complete());
  const input={account_snapshot:{accounts:[],notes:'重复完成'}};
  assertEquivalent(await a.request(`/api/reviews/${reviewDate}/complete`,input),await b.request(`/api/reviews/${reviewDate}/complete`,input));assertEquivalent(a.snapshot(),b.snapshot());
 }finally{a.close();b.close();}
});
