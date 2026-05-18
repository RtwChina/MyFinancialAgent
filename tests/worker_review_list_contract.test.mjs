import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountSnapshotFromAccounts,
  bucketEstimatedImpactPercent,
  deriveReviewDailyThesis,
  parsePositionWeight,
} from "../cloudflare/worker/src/index.js";

test("deriveReviewDailyThesis prefers trading summary, then review notes, then AI analysis", () => {
  assert.equal(
    deriveReviewDailyThesis({
      trading_summary: "交易总结第一优先",
      market_sentiment: "大盘",
      sector_rotation: "板块",
      daily_major_events: "AI 事件",
      linkage_logic_chain: "AI 链路",
    }),
    "交易总结第一优先",
  );

  assert.equal(
    deriveReviewDailyThesis({
      market_sentiment: "大盘变量",
      sector_rotation: "板块轮动",
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
