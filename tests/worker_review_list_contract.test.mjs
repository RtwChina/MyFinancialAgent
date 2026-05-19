import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountSnapshotFromAccounts,
  buildAccountImpactSummaryFromPlans,
  bucketEstimatedImpactPercent,
  deriveReviewDailyThesis,
  normalizeReviewNoteBlocks,
  parsePositionWeight,
  resolveReviewNoteBlocksWithFallback,
} from "../cloudflare/worker/src/index.js";

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
