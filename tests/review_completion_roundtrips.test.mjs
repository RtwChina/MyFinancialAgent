import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './helpers/review-completion-harness.mjs';

// 远程 D1 的成本几乎全在网络往返上，语句条数和 prepare 次数都不代表耗时。
async function roundTrips(fixture){
 const harness=await createHarness({fixture});
 try{
  const result=await harness.complete();
  assert.equal(result.status,200);
  return harness.stats().roundTrips;
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
