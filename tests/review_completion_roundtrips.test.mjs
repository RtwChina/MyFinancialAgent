import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './helpers/review-completion-harness.mjs';
import {reviewDate} from './helpers/review-completion-fixtures.mjs';

// 远程 D1 的成本几乎全在网络往返上，语句条数和 prepare 次数都不代表耗时。
async function roundTrips(fixture){
 const harness=await createHarness({fixture:{...fixture,market:true}});
 try{
  const result=await harness.complete();
  assert.equal(result.status,200);
  // 守门必须量到真实写入，否则往返少可能只是什么都没写。
  const symbols=fixture.plans+1;
  assert.equal(harness.sqlite.prepare('SELECT count(*) n FROM daily_review_symbol_levels WHERE archive_date=?').get(reviewDate).n,symbols);
  assert.equal(harness.sqlite.prepare("SELECT count(*) n FROM account_live_action_plans WHERE support_levels LIKE '当日%'").get().n,fixture.plans);
  assert.equal(JSON.parse(harness.sqlite.prepare('SELECT market_review_json j FROM daily_review_archive WHERE archive_date=?').get(reviewDate).j).blocks.length,symbols);
  return harness.stats().roundTrips;
 }finally{harness.close();}
}

async function firstLiveMaterialization(fixture){
 const harness=await createHarness({fixture:{...fixture,market:true}});
 try{
  const id=harness.sqlite.prepare("SELECT id FROM account_live_action_plans WHERE symbol='TEST0'").get().id;
  const before=harness.stats().roundTrips;
  const result=await harness.request(`/api/account-live-action-plans/${id}`,{supportLevels:'实时改 520'},{method:'PUT'});
  assert.equal(result.status,200);
  assert.notEqual(harness.sqlite.prepare('SELECT market_review_json j FROM daily_review_archive WHERE archive_date=?').get(reviewDate).j,null);
  return harness.stats().roundTrips-before;
 }finally{harness.close();}
}

test('完成复盘的 D1 往返次数不随复盘条目数线性增长',async()=>{
 const normal=await roundTrips({news:50,plans:20});
 const large=await roundTrips({news:200,plans:40});

 assert.ok(normal<=7,`normal 应不超过 7 次往返，实际 ${normal}`);
 assert.ok(large<=9,`large 应不超过 9 次往返，实际 ${large}`);
 // large 的写入条目是 normal 的约 4 倍；往返数只允许因分块产生个位数增长。
 assert.ok(large-normal<=4,`large 相对 normal 的往返增量应不超过 4，实际 ${large-normal}（normal ${normal}，large ${large}）`);
});

test('最新日首次实时改价位的物化往返数与计划规模无关',async()=>{
 const normal=await firstLiveMaterialization({news:50,plans:20});
 const large=await firstLiveMaterialization({news:200,plans:40});
 assert.ok(normal<=2,`normal 首次物化应不超过 2 次往返，实际 ${normal}`);
 assert.equal(large,normal,`首次物化往返不应随计划数增长（normal ${normal}，large ${large}）`);
});
