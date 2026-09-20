const REVIEW_DATE = "2026-09-16";
const PREVIOUS_DATE = "2026-09-15";
const TABLES = [
  "review_account_snapshots",
  "account_live_action_plans",
  "daily_review_archive_news",
  "daily_review_action_plans",
  "daily_review_snapshots",
  "daily_news_ai_analysis_snapshots",
  "daily_review_archive",
  "daily_news_ai_analysis",
  "news_raw_data",
  "stock_raw",
  "tracked_symbols",
  "investment_accounts",
];

function authorized(request, env) {
  const supplied = request.headers.get("x-review-perf-token") || "";
  return env.PERF_TOKEN && supplied === env.PERF_TOKEN;
}

async function runBatches(db, statements, size = 50) {
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
}

async function resetDatabase(env, fixture) {
  const workload = fixture === "large"
    ? { news: 200, plans: 40 }
    : fixture === "normal"
      ? { news: 50, plans: 20 }
      : null;
  if (!workload) throw new Error("Unknown fixture");

  await runBatches(env.DB, TABLES.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
  await env.DB.prepare("DELETE FROM sqlite_sequence").run();

  const notes = JSON.stringify([
    { id: "market-1", title: "市场", children: [{ id: "child-1", title: "判断", body: "维持观察" }] },
  ]);
  const statements = [];
  const accountNames = ["老虎-美股", "东方财富-国内", "天天基金-国内"];
  for (let index = 0; index < accountNames.length; index += 1) {
    statements.push(env.DB.prepare(
      `INSERT INTO investment_accounts (
        id, name, account_type, currency, total_assets, available_cash, enabled,
        sort_order, created_at, updated_at
      ) VALUES (?, ?, 'stock', 'USD', 100000, 25000, 1, ?, ?, ?)`,
    ).bind(index + 1, accountNames[index], (index + 1) * 10, "2026-01-01 00:00:00", "2026-01-01 00:00:00"));
  }
  for (const [date, status] of [[PREVIOUS_DATE, "reviewed"], [REVIEW_DATE, "initialized"]]) {
    statements.push(env.DB.prepare(
      `INSERT INTO daily_review_archive (
        archive_date, review_status, reviewer_news_notes,
        market_sentiment_blocks_json, sector_rotation_blocks_json, updated_at
      ) VALUES (?, ?, '已有总结', ?, ?, '2026-01-01 00:00:00')`,
    ).bind(date, status, notes, notes));
  }
  for (let index = 0; index <= workload.plans; index += 1) {
    const symbol = index === workload.plans ? "GSPC" : `TEST${index}`;
    statements.push(env.DB.prepare(
      "INSERT INTO tracked_symbols (symbol, display_name, symbol_type, market_type, is_active) VALUES (?, ?, 'stock', '美股', 1)",
    ).bind(symbol, symbol));
    for (const date of [PREVIOUS_DATE, REVIEW_DATE]) {
      statements.push(env.DB.prepare(
        "INSERT INTO stock_raw (symbol, k_date, current_price, change_percent) VALUES (?, ?, 100, 2)",
      ).bind(symbol, date));
    }
    if (index < workload.plans) {
      statements.push(env.DB.prepare(
        `INSERT INTO daily_review_action_plans (
          archive_date, account_id, symbol, current_position, market_type, sort_order
        ) VALUES (?, ?, ?, '5%-10%', '美股', ?)`,
      ).bind(PREVIOUS_DATE, index % 3 + 1, symbol, index));
    }
  }
  for (let index = 0; index < workload.news; index += 1) {
    statements.push(env.DB.prepare(
      `INSERT INTO news_raw_data (
        id, pub_date, title, content, type, rule_passed, processing_status,
        ai_summary, importance_stars, news_hash
      ) VALUES (?, '2026-09-16 10:00:00', ?, '合成内容', 'index', 1,
        'llm_processed', '合成分析', 4, ?)`,
    ).bind(index + 1, `新闻${index}`, `hash-${index}`));
  }
  statements.push(env.DB.prepare(
    `INSERT INTO daily_news_ai_analysis (
      analysis_date, daily_major_events, source_news_ids
    ) VALUES (?, '[大盘] 当日分析', '[]')`,
  ).bind(REVIEW_DATE));
  await runBatches(env.DB, statements);

  return {
    reviewDate: REVIEW_DATE,
    payload: {
      reviewStatus: "initialized",
      reviewerNewsNotes: "最新新闻点评",
      marketSentimentBlocks: JSON.parse(notes),
      sectorRotationBlocks: JSON.parse(notes),
      tradingSummary: "最新深度总结",
      actionPlans: Array.from({ length: workload.plans }, (_, index) => ({
        accountId: index % 3 + 1,
        symbol: `TEST${index}`,
        actionType: "持仓观察",
        currentPosition: "5%-10%",
        entryPlan: "等待",
        marketType: "美股",
        thinking: "合成计划",
      })),
    },
  };
}

async function snapshotDatabase(env) {
  const entries = [];
  for (const table of TABLES) {
    const rows = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
    entries.push([table, rows.results || []]);
  }
  return Object.fromEntries(entries);
}

export function wrapReviewWorker(application) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (url.pathname === "/__review-perf/reset" && request.method === "POST") {
        if (!authorized(request, env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
        try {
          const { fixture } = await request.json();
          return Response.json(await resetDatabase(env, fixture));
        } catch (error) {
          return Response.json({ error: String(error?.message || error) }, { status: 400 });
        }
      }
      if (url.pathname === "/__review-perf/snapshot" && request.method === "GET") {
        if (!authorized(request, env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
        return Response.json(await snapshotDatabase(env));
      }
      return application.fetch(request, env, ctx);
    },
  };
}
