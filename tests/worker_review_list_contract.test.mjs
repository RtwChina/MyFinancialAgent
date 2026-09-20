import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountSnapshotFromAccounts,
  buildAccountImpactSummaryFromPlans,
  buildAccountImpactSummaryFromSnapshot,
  buildActionPlanSymbolMetrics,
  buildNewsWindowFromRows,
  buildReviewListItems,
  bucketEstimatedImpactPercent,
  deriveReviewDailyThesis,
  getBatchReviewReadiness,
  completeReview,
  getReviewBootstrap,
  normalizeReviewNoteBlocks,
  parsePendingReviewLimit,
  parsePositionWeight,
  previousActionPlanSymbolKeysFromRows,
  resolveReviewNoteBlocksWithFallback,
} from "../cloudflare/worker/src/index.js";

test("pending review limit supports an explicit all mode and bounds numeric requests", () => {
  assert.equal(parsePendingReviewLimit(null), 10);
  assert.equal(parsePendingReviewLimit("all"), null);
  assert.equal(parsePendingReviewLimit("25"), 25);
  assert.equal(parsePendingReviewLimit("0"), 1);
  assert.equal(parsePendingReviewLimit("5000"), 500);
  assert.equal(parsePendingReviewLimit("invalid"), 10);
});

test("batch review requires every mandatory review section before completion", () => {
  const complete = getBatchReviewReadiness({
    reviewer_news_notes: "今日主线明确。",
    market_sentiment_blocks_json: JSON.stringify([{ title: "大盘", children: [] }]),
    sector_rotation_blocks_json: JSON.stringify([{ title: "板块", children: [] }]),
    action_plan_count: 1,
  });
  assert.deepEqual(complete, { ready: true, missingFields: [] });

  const incomplete = getBatchReviewReadiness({
    reviewer_news_notes: "已有新闻总结",
    market_sentiment_blocks_json: null,
    sector_rotation_blocks_json: "[]",
    action_plan_count: 0,
  });
  assert.deepEqual(incomplete, {
    ready: false,
    missingFields: ["market", "rotation", "plan"],
  });
});

function createBootstrapDb({ previousReview = null } = {}) {
  const batchCalls = [];
  const resultFor = (sql) => {
    if (sql.includes("FROM investment_accounts ORDER BY")) {
      return { results: [{ id: 1, name: "老虎-美股", currency: "USD", enabled: 1, sort_order: 10 }] };
    }
    if (sql.includes("SELECT * FROM daily_review_archive WHERE")) {
      return { results: [{ archive_date: "2026-08-05", review_status: "reviewed" }] };
    }
    if (sql.includes("FROM tracked_symbols managed") && sql.includes("JOIN stock_raw p")) {
      return { results: [{
        symbol: "MU",
        stock_name: "Micron",
        current_price: 110,
        change_percent: 2.5,
        volume: 10,
        k_date: "2026-08-05",
        display_name: "美光",
        symbol_type: "stock",
        market_type: "美股",
        sort_order: 1,
      }] };
    }
    if (sql.includes("SELECT DISTINCT k_date")) {
      return { results: [{ k_date: "2026-08-05" }, { k_date: "2026-08-04" }] };
    }
    if (sql.includes("FROM daily_news_ai_analysis")) return { results: [] };
    if (sql.includes("AS market_sentiment_blocks_json") && sql.includes("AS sector_rotation_blocks_json")) {
      return { results: [previousReview || {
        market_sentiment_blocks_json: null,
        sector_rotation_blocks_json: null,
      }] };
    }
    if (sql.includes("FROM daily_review_action_plans p")) return { results: [] };
    if (sql.includes("FROM review_account_snapshots")) {
      return { results: [{
        id: 1,
        archive_date: "2026-08-05",
        accounts_snapshot: JSON.stringify([{
          accountId: 1,
          accountName: "老虎-美股",
          currency: "USD",
          impact: { rangeLabel: "1~2%", direction: "gain", contributors: 1 },
        }]),
      }] };
    }
    if (sql.includes("MAX(archive_date) AS latest")) return { results: [{ latest: "2026-08-05" }] };
    if (sql.includes("FROM daily_review_archive_news")) return { results: [] };
    throw new Error(`Unexpected bootstrap SQL: ${sql}`);
  };

  return {
    batchCalls,
    prepare(sql) {
      return {
        sql,
        params: [],
        bind(...params) {
          this.params = params;
          return this;
        },
      };
    },
    async batch(statements) {
      batchCalls.push(statements);
      return statements.map((statement) => resultFor(statement.sql));
    },
  };
}

test("deriveReviewDailyThesis prefers trading summary, then review notes, then AI analysis", () => {
  assert.equal(
    deriveReviewDailyThesis({
      trading_summary: "交易总结第一优先",
      market_sentiment_blocks_json: JSON.stringify([{ title: "大盘" }]),
      sector_rotation_blocks_json: JSON.stringify([{ title: "板块" }]),
      daily_major_events: "AI 事件",
      linkage_logic_chain: "AI 链路",
    }),
    "交易总结第一优先",
  );

  assert.equal(
    deriveReviewDailyThesis({
      market_sentiment_blocks_json: JSON.stringify([{ title: "大盘变量" }]),
      sector_rotation_blocks_json: JSON.stringify([{ title: "板块轮动" }]),
      daily_major_events: "AI 事件",
    }),
    "大盘变量 / 板块轮动",
  );

  assert.equal(
    deriveReviewDailyThesis({ daily_major_events: "AI 事件", linkage_logic_chain: "AI 链路" }),
    "AI 事件",
  );

  assert.equal(deriveReviewDailyThesis({}), "待复盘");
});

test("parsePositionWeight returns midpoint weights for action plan ranges", () => {
  assert.equal(parsePositionWeight("0%"), 0);
  assert.equal(parsePositionWeight("0-5%"), 0.025);
  assert.equal(parsePositionWeight("15%-20%"), 0.175);
  assert.equal(parsePositionWeight(">30%"), 0.35);
  assert.equal(parsePositionWeight("unknown"), null);
});

test("bucketEstimatedImpactPercent returns display ranges instead of exact values", () => {
  assert.equal(bucketEstimatedImpactPercent(0), "≈0%");
  assert.equal(bucketEstimatedImpactPercent(0.2), "0~1%");
  assert.equal(bucketEstimatedImpactPercent(1.8), "1~2%");
  assert.equal(bucketEstimatedImpactPercent(-0.2), "-1~0%");
  assert.equal(bucketEstimatedImpactPercent(-2.4), "-3~-2%");
  assert.equal(bucketEstimatedImpactPercent(4.8), "≥4%");
});

test("buildAccountImpactSummaryFromPlans uses current-position midpoint times review-day price change", () => {
  const summary = buildAccountImpactSummaryFromPlans({
    actionPlans: [
      { accountId: 3, symbol: "GOLD", currentPosition: "20%-25%" },
      { accountId: 3, symbol: "XLK", currentPosition: "10%-15%" },
      { accountId: 3, symbol: "NEW", currentPosition: "10%-15%" },
      { accountId: 3, symbol: "MISS", currentPosition: "15%-20%" },
    ],
    accounts: [
      { id: 3, name: "天天基金-国内", currency: "CNY", enabled: true },
    ],
    priceMap: new Map([
      ["GOLD", { change_percent: -2 }],
      ["XLK", { change_percent: 1.6 }],
    ]),
    previousSymbolsByAccount: new Set(["3:GOLD", "3:XLK", "3:MISS"]),
  });

  assert.equal(summary.length, 1);
  assert.equal(summary[0].accountId, 3);
  assert.equal(summary[0].label, "账户估算影响");
  assert.equal(summary[0].contributors, 2);
  assert.equal(summary[0].valuePercent, -0.25);
  assert.equal(summary[0].rangeLabel, "-1~0%");
  assert.equal(summary[0].direction, "loss");
  assert.deepEqual(summary[0].skippedReasons, ["新增标的，当日不计入", "缺少仓位或价格涨跌幅"]);
});

test("buildAccountSnapshotFromAccounts preserves one review-day structured snapshot row payload", () => {
  const snapshot = buildAccountSnapshotFromAccounts([
    { id: 1, name: "老虎-美股", currency: "USD", totalAssets: 3.2, availableCash: 1.1 },
  ]);

  assert.deepEqual(snapshot, [
    {
      accountId: 1,
      accountName: "老虎-美股",
      currency: "USD",
      totalAssets: 3.2,
      availableCash: 1.1,
      netCashFlow: null,
      dailyPnl: null,
      dailyPnlPercent: null,
      notes: "",
    },
  ]);
});

test("bootstrap helpers reuse snapshot impact without another database read", () => {
  assert.deepEqual(buildAccountImpactSummaryFromSnapshot({
    accounts: [
      {
        accountId: 1,
        accountName: "老虎-美股",
        currency: "USD",
        impact: { rangeLabel: "1~2%", direction: "gain", contributors: 2 },
      },
    ],
  }), [
    {
      accountId: 1,
      accountName: "老虎-美股",
      currency: "USD",
      rangeLabel: "1~2%",
      direction: "gain",
      contributors: 2,
      source: "estimated_action_plan",
      label: "账户影响",
    },
  ]);
  assert.equal(buildAccountImpactSummaryFromSnapshot(null), null);
});

test("previous action plan symbols are reduced from one-query rows", () => {
  const keys = previousActionPlanSymbolKeysFromRows([
    { account_id: 1, symbol: "MU" },
    { account_id: 3, symbol: "GOLD" },
  ]);
  assert.deepEqual([...keys], ["1:MU", "3:GOLD"]);
});

test("batched bootstrap date rows preserve the news window contract", () => {
  assert.deepEqual(
    buildNewsWindowFromRows([{ k_date: "2026-08-04" }, { k_date: "2026-08-01" }], "2026-08-05"),
    { start: "2026-08-01 16:00:00", end: "2026-08-05 16:00:00" },
  );
});

test("single-query symbol catalog rows preserve day/week/month metrics", () => {
  assert.deepEqual(
    buildActionPlanSymbolMetrics(
      { k_date: "2026-08-05", current_price: 110, change_percent: 2.5 },
      { current_price: 100 },
      { current_price: 88 },
    ),
    {
      latestDate: "2026-08-05",
      latestPrice: 110,
      dayChangePercent: 2.5,
      weekChangePercent: 10,
      monthChangePercent: 25,
    },
  );
});

test("review bootstrap uses batched read stages and reuses its account snapshot", async () => {
  const DB = createBootstrapDb();
  const result = await getReviewBootstrap({ DB }, "2026-08-05");

  assert.equal(DB.batchCalls.length, 2);
  assert.equal(DB.batchCalls[0].length, 9);
  assert.equal(DB.batchCalls.flat().some((statement) => /\bINSERT\b/i.test(statement.sql)), false);
  assert.equal(result.prices.usStock[0].symbol, "MU");
  assert.equal(result.accountImpactSummary[0].rangeLabel, "1~2%");
  assert.deepEqual(result.account_impact_summary, result.accountImpactSummary);
});

test("review bootstrap can fall back to independently selected nonempty market and rotation notes", async () => {
  const DB = createBootstrapDb({
    previousReview: {
      market_sentiment_blocks_json: JSON.stringify([{ title: "更早的大盘内容" }]),
      sector_rotation_blocks_json: JSON.stringify([{ title: "较近的板块内容" }]),
    },
  });
  const result = await getReviewBootstrap({ DB }, "2026-08-05");

  assert.equal(result.structuredNotes.marketSentiment.blocks[0].title, "更早的大盘内容");
  assert.equal(result.structuredNotes.sectorRotation.blocks[0].title, "较近的板块内容");
  const fallbackStatement = DB.batchCalls[0][5];
  assert.equal(fallbackStatement.params.length, 2);
  assert.equal(fallbackStatement.sql.includes("LENGTH(TRIM(COALESCE(market_sentiment_blocks_json"), true);
  assert.equal(fallbackStatement.sql.includes("LENGTH(TRIM(COALESCE(sector_rotation_blocks_json"), true);
});

test("review list reuses the joined account snapshot without per-row database reads", async () => {
  const env = {
    DB: {
      prepare() {
        throw new Error("review list should not query an already joined snapshot");
      },
    },
  };
  const [item] = await buildReviewListItems(env, [{
    archive_date: "2026-08-05",
    review_status: "reviewed",
    trading_summary: "日内主线",
    account_snapshot_json: JSON.stringify([{
      accountId: 1,
      accountName: "老虎-美股",
      currency: "USD",
      impact: { rangeLabel: "0~1%", direction: "gain", contributors: 1 },
    }]),
  }]);

  assert.equal(item.account_snapshot_json, undefined);
  assert.equal(item.account_impact_summary[0].rangeLabel, "0~1%");
});

test("review note blocks preserve arbitrary titles", () => {
  const blocks = normalizeReviewNoteBlocks([
    {
      title: "黄金",
      children: [
        { title: "战争影响", body: "避险需求升温。" },
        { title: "利率影响", body: "实际利率回落支撑金价。\n保留 Markdown **重点**。" },
      ],
    },
  ]);

  assert.equal(blocks[0].title, "黄金");
  assert.equal(blocks[0].children[0].title, "战争影响");
  assert.equal(blocks[0].children[1].body.includes("**重点**"), true);
});

test("empty initialized review notes fall back to previous reviewed notes", () => {
  const resolved = resolveReviewNoteBlocksWithFallback(
    {
      review_status: "initialized",
      market_sentiment_blocks_json: null,
    },
    {
      archive_date: "2026-05-15",
      market_sentiment_blocks_json: JSON.stringify([
        { title: "黄金", children: [{ title: "战争影响", body: "避险需求升温。" }] },
      ]),
    },
    "market_sentiment_blocks_json",
    "market",
  );

  assert.equal(resolved.source, "saved");
  assert.equal(resolved.blocks.length, 1);
  assert.equal(resolved.blocks[0].title, "黄金");
});

test("empty initialized review notes prefer previous saved structured notes", () => {
  const resolved = resolveReviewNoteBlocksWithFallback(
    {
      review_status: "initialized",
      market_sentiment_blocks_json: null,
    },
    {
      archive_date: "2026-05-15",
      market_sentiment_blocks_json: JSON.stringify([
        { title: "标普500点位", children: [{ title: "CTA流动性", body: "横盘 sell。" }] },
      ]),
    },
    "market_sentiment_blocks_json",
    "market",
  );

  assert.equal(resolved.source, "saved");
  assert.equal(resolved.blocks[0].title, "标普500点位");
  assert.equal(resolved.blocks[0].children[0].title, "CTA流动性");
});


test("batch completion protects the newest record even when it is already reviewed", async () => {
  const DB = { prepare(sql) {
    assert.match(sql, /SELECT MAX/);
    return { first: async () => ({ latest: "2026-05-12" }) };
  } };
  const result = await completeReview({ DB }, "2026-05-12", { completionSource: "batch" });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "reserved review date");
});

test("batch autofill preserves drafts and explicit empty blocks before archiving; failures stay pending", async () => {
  const writes = [];
  const DB = { prepare(sql) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() {
        if (sql.includes("SELECT MAX")) return { latest: "2026-05-12" };
        return { review_status: "draft", reviewer_news_notes: "自己的新闻点评",
          trading_summary: "自己的深度总结", market_sentiment_blocks_json: "[]",
          sector_rotation_blocks_json: null };
      },
      async run() { writes.push({ sql, values }); },
      async all() { throw new Error("模拟新闻归档失败"); },
    };
  } };
  await assert.rejects(completeReview({ DB }, "2026-05-08", {
    completionSource: "batch", autoFill: {
      reviewerNewsNotes: "AI 总结",
      marketSentimentBlocks: [{ title: "旧大盘", children: [] }],
      sectorRotationBlocks: [{ title: "旧板块", children: [] }],
    },
  }), /模拟新闻归档失败/);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].values[1], "draft");
  assert.equal(writes[0].values[2], "自己的新闻点评");
  assert.equal(writes[0].values[3], "[]");
  assert.equal(JSON.parse(writes[0].values[4])[0].title, "旧板块");
  assert.equal(writes[0].values[5], "自己的深度总结");
});
