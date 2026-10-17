import assert from "node:assert/strict";
import test from "node:test";

import {
  buildZoneExport,
  extractMarketSp500Zones,
  parseZoneLine,
} from "../cloudflare/web/zone-export.js";

const level = (kind, id = kind) => ({ id, kind, title: kind === "support" ? "支撑位" : "压力位" });
const symbolBlock = (symbol, children) => ({ id: `b-${symbol}`, type: "symbol", symbol, children });

const sp500Template = [
  "// --- 标普500 ---",
  "",
  "// 支撑位",
  "draw_zone('SPX,ES1!,ES', 6745, 6570, '支撑: 6570-6745 (强)')",
  "",
  "// 负伽马位 (关键破位点)",
  "// 给它稍微加了2个点的厚度，并在图表上强制显示为醒目的红色",
  "draw_zone('SPX,ES1!,ES', 6476, 6474, '负伽马: 6475 (破位大抛压)', color.new(color.red, 50), color.red)",
  "",
  "// 加速下跌位 (关键破位点)",
  "// 给它稍微加了2个点的厚度，并在图表上强制显示为醒目的红色",
  "draw_zone('SPX,ES1!,ES', 7621, 7619, '加速下跌: 7620 (跌破加速卖出)', color.new(color.red, 50), color.red)",
  "draw_zone('SPX,ES1!,ES', 7357, 7355, '加速下跌: 7356 (跌破加速卖出)', color.new(color.red, 50), color.red)",
  "draw_zone('SPX,ES1!,ES', 6885, 6883, '加速下跌: 6884 (跌破加速卖出)', color.new(color.red, 50), color.red)",
];
const gspcBlock = symbolBlock("GSPC", [
  level("support"), level("resistance"),
  { id: "cta", kind: "cta", title: "CTA 流动性", body: "加速卖出触发：跌破 7620 / 7356 / 6884" },
  { id: "gamma", kind: "custom", title: "负伽马", body: "6475（破了该点位后就会出现较大的抛压）" },
  { id: "eps", kind: "eps", title: "EPS 预计", body: "2026 EPS 300；2027 325.50" },
  { id: "thinking", kind: "thinking", title: "思考", body: "成交额 500-600 亿，6500-6600 只是分析" },
]);
const gspcLevels = { GSPC: { supportLevels: "6570-6745（强）", resistanceLevels: "7500-7550（强）" } };

test("zone line parser normalizes punctuation, decimals, notes, and reversed ranges", () => {
  assert.deepEqual(parseZoneLine("- 734–744（小）", "压力"), {
    type: "压力",
    lowerText: "734",
    upperText: "744",
    label: "压力: 734-744 (小)",
  });
  assert.deepEqual(parseZoneLine("433.5 至 392.25（强）：注意反弹承压", "支撑"), {
    type: "支撑",
    lowerText: "392.25",
    upperText: "433.5",
    label: "支撑: 392.25-433.5 (强) 注意反弹承压",
  });
  assert.equal(parseZoneLine("等待结构确认", "支撑"), null);
});

test("GSPC uses the S&P 500 template for shared support only; resistance and plain analysis numbers stay out", () => {
  const market = extractMarketSp500Zones([symbolBlock("GSPC", [level("support"), level("resistance")])], {
    GSPC: { supportLevels: "7310-7350（小）\n7200–7250（强） 防守", resistanceLevels: "7500-7550（强）" },
  });
  assert.deepEqual(market.supportZones.map(({ symbol, type, lowerText, upperText, label }) => ({
    symbol, type, lowerText, upperText, label,
  })), [
    { symbol: "SPX,ES1!,ES", type: "支撑", lowerText: "7310", upperText: "7350", label: "支撑: 7310-7350 (小)" },
    { symbol: "SPX,ES1!,ES", type: "支撑", lowerText: "7200", upperText: "7250", label: "支撑: 7200-7250 (强) 防守" },
  ]);

  const result = buildZoneExport({ marketReviewBlocks: [gspcBlock], symbolLevels: gspcLevels });
  assert.equal(result.text, sp500Template.join("\n"));
  assert.equal(result.zoneCount, 5);
  assert.equal(result.skippedCount, 0);
  assert.doesNotMatch(result.text, /7500|6500-6600|500-600|GSPC/);
});

test("combined export keeps the QQQ format: symbol from identity, pressure first, duplicates once, invalid lines skipped", () => {
  const result = buildZoneExport({
    marketReviewBlocks: [gspcBlock, symbolBlock("QQQ", [
      level("support"), level("resistance"),
      { id: "metric", kind: "custom", title: "压力测试指标", body: "600-620（不应导出）" },
    ])],
    symbolLevels: {
      ...gspcLevels,
      QQQ: { supportLevels: "671–681（小）", resistanceLevels: "734–744（小）\n693–724（强）注意反弹承压\n734-744（小）\n无效行" },
    },
  });
  assert.equal(result.text, [
    ...sp500Template,
    "",
    "// QQQ 的压力支持",
    "draw_zone('QQQ', 734, 744, '压力: 734-744 (小)')",
    "draw_zone('QQQ', 693, 724, '压力: 693-724 (强) 注意反弹承压')",
    "draw_zone('QQQ', 671, 681, '支撑: 671-681 (小)')",
  ].join("\n"));
  assert.equal(result.zoneCount, 8);
  assert.equal(result.skippedCount, 1);
});

test("shared levels are exported once per symbol across market and every account; market order comes first", () => {
  const result = buildZoneExport({
    marketReviewBlocks: [symbolBlock("SOXX", [level("resistance"), level("support")])],
    symbolLevels: {
      SOXX: { supportLevels: "489-532（中）\n不是价位", resistanceLevels: "550-580（强）反弹承压" },
      MSFT: { supportLevels: "381-392（中）长线", resistanceLevels: "397-430（超强）突破右侧" },
    },
    actionPlans: [
      { accountId: 1, symbol: "MSFT", supportLevels: "旧镜像 1-2", resistanceLevels: "" },
      { accountId: 1, symbol: "SOXX", supportLevels: "", resistanceLevels: "" },
      { accountId: 2, symbol: "SOXX", supportLevels: "", resistanceLevels: "" },
    ],
  });
  assert.deepEqual(result.groups.map((group) => group.symbol), ["SOXX", "MSFT"]);
  assert.equal(result.text.match(/SOXX', 550, 580/g)?.length, 1);
  assert.equal(result.text.match(/SOXX', 489, 532/g)?.length, 1);
  assert.match(result.text, /压力: 550-580 \(强\) 反弹承压/);
  assert.ok(result.text.indexOf("压力: 397-430") < result.text.indexOf("支撑: 381-392"));
  assert.doesNotMatch(result.text, /旧镜像/);
  assert.equal(result.skippedCount, 1);
});

test("legacy and linked-legacy original text never invent a symbol or become price zones", () => {
  const result = buildZoneExport({
    marketReviewBlocks: [
      {
        id: "legacy-cross", type: "legacy", symbol: null, title: "QQQ / SPY 相对强弱",
        legacyOrigin: { date: "2026-10-12", group: "rotation", index: 9, title: "QQQ / SPY 相对强弱" },
        children: [{ id: "c1", kind: "custom", title: "支撑位", body: "QQQ 580-590 / SPY 650-660" }],
      },
      {
        id: "linked", type: "symbol", symbol: "MU",
        legacyOrigin: { date: "2026-10-12", group: "rotation", index: 10, title: "Micron" },
        children: [{ id: "c2", kind: "custom", title: "支撑位", body: "90-95" }],
      },
    ],
    symbolLevels: { MU: { supportLevels: "", resistanceLevels: "" } },
  });
  assert.equal(result.text, "");
  assert.deepEqual(result.groups, []);
  assert.equal(result.skippedCount, 0);
});

test("a theme without price children is not exported from the market side, but its plans still are", () => {
  const symbolLevels = { IGV: { supportLevels: "90-95", resistanceLevels: "110-115" } };
  const marketReviewBlocks = [symbolBlock("IGV", [{ id: "t", kind: "thinking", title: "思考", body: "软件板块 90-95" }])];
  assert.equal(buildZoneExport({ marketReviewBlocks, symbolLevels }).text, "");
  const withPlan = buildZoneExport({ marketReviewBlocks, symbolLevels, actionPlans: [{ accountId: 2, symbol: "IGV" }] });
  assert.equal(withPlan.text, [
    "// IGV 的压力支持",
    "draw_zone('IGV', 110, 115, '压力: 110-115')",
    "draw_zone('IGV', 90, 95, '支撑: 90-95')",
  ].join("\n"));
});

test("account-page export skips the market review and reads plans through shared levels", () => {
  const result = buildZoneExport({
    includeMarket: false,
    marketReviewBlocks: [gspcBlock],
    symbolLevels: { ...gspcLevels, MU: { supportLevels: "90-95", resistanceLevels: "120-125" } },
    actionPlans: [{ accountId: 1, symbol: "MU", supportLevels: "", resistanceLevels: "" }],
  });
  assert.equal(result.text, [
    "// MU 的压力支持",
    "draw_zone('MU', 120, 125, '压力: 120-125')",
    "draw_zone('MU', 90, 95, '支撑: 90-95')",
  ].join("\n"));
});
