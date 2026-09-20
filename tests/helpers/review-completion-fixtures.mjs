export const reviewDate = '2026-09-16';
export const previousDate = '2026-09-15';
export function seedReview(db, { news = 50, plans = 20, sourceIds = false, historical = false } = {}) {
  db.exec("DELETE FROM investment_accounts WHERE name = '未分配账户'; UPDATE investment_accounts SET total_assets=100000, available_cash=25000, created_at='2026-01-01 00:00:00', updated_at='2026-01-01 00:00:00'");
  const notes = JSON.stringify([{ id: 'market-1', title: '市场', children: [{ id: 'child-1', title: '判断', body: '维持观察' }] }]);
  for (const date of [previousDate, reviewDate, ...(historical ? ['2026-09-17'] : [])]) {
    db.prepare('INSERT INTO daily_review_archive (archive_date,review_status,reviewer_news_notes,market_sentiment_blocks_json,sector_rotation_blocks_json,updated_at) VALUES (?,?,?,?,?,?)').run(date,date===previousDate?'reviewed':'initialized','已有总结',notes,notes,'2026-01-01 00:00:00');
  }
  for (let i=0;i<=plans;i++) {
    const symbol=i===plans?'GSPC':`TEST${i}`;
    db.prepare("INSERT OR IGNORE INTO tracked_symbols (symbol,display_name,symbol_type,is_active) VALUES (?,?,'stock',1)").run(symbol,symbol);
    for (const date of [previousDate,reviewDate]) db.prepare('INSERT INTO stock_raw (symbol,k_date,current_price,change_percent) VALUES (?,?,100,2)').run(symbol,date);
    if(i<plans) db.prepare("INSERT INTO daily_review_action_plans (archive_date,account_id,symbol,current_position) VALUES (?,?,?,'5%-10%')").run(previousDate,i%3+1,symbol);
  }
  for(let i=0;i<news;i++) db.prepare("INSERT INTO news_raw_data (pub_date,title,content,type,rule_passed,processing_status,ai_summary,importance_stars,news_hash) VALUES (?,?,?,'index',1,'llm_processed',?,4,?)").run('2026-09-16 10:00:00',`新闻${i}`,'合成内容','合成分析',`hash-${i}`);
  db.prepare('INSERT INTO daily_news_ai_analysis (analysis_date,daily_major_events,source_news_ids) VALUES (?,?,?)').run(reviewDate,'[大盘] 当日分析',JSON.stringify(sourceIds?Array.from({length:news},(_,i)=>i+1):[]));
  return { reviewStatus:'initialized',reviewerNewsNotes:'最新新闻点评',marketSentimentBlocks:JSON.parse(notes),sectorRotationBlocks:JSON.parse(notes),tradingSummary:'最新深度总结',actionPlans:Array.from({length:plans},(_,i)=>({accountId:i%3+1,symbol:`TEST${i}`,actionType:'持仓观察',currentPosition:'5%-10%',entryPlan:'等待',marketType:'美股',thinking:'合成计划'})) };
}
export const workloads={ normal:{news:50,plans:20},large:{news:200,plans:40} };
