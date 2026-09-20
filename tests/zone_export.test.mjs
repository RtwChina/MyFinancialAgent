import assert from "node:assert/strict";
import test from "node:test";

import {
  buildZoneExport,
  classifyZoneTitle,
  extractMarketSp500SupportZones,
  parseZoneLine,
  resolveRotationSymbol,
} from "../cloudflare/web/zone-export.js";

test("zone title classification only accepts explicit pressure and support headings", () => {
  assert.equal(classifyZoneTitle("压力位"), "压力");
  assert.equal(classifyZoneTitle("阻力 Resistance"), "压力");
  assert.equal(classifyZoneTitle("支撑位 (Support):"), "支撑");
  assert.equal(classifyZoneTitle("支持"), "支撑");
  assert.equal(classifyZoneTitle("关键指标"), null);
  assert.equal(classifyZoneTitle("风险"), null);
});

test("market overview exports only support zones from the S&P 500 section", () => {
  const result = extractMarketSp500SupportZones([
    {
      title: "标普500点位",
      children: [
        { title: "压力位", body: "7500-7550（强）" },
        { title: "支撑位", body: "7310-7350（小）\n7200–7250（强） 防守" },
        { title: "流动性", body: "7000-7100（不应导出）" },
      ],
    },
    { title: "纳斯达克100", children: [{ title: "支撑位", body: "24000-24200" }] },
  ]);

  assert.deepEqual(result.zones.map(({ symbol, type, lowerText, upperText, label }) => ({
    symbol, type, lowerText, upperText, label,
  })), [
    { symbol: "SPX,ES1!,ES", type: "支撑", lowerText: "7310", upperText: "7350", label: "支撑: 7310-7350 (小)" },
    { symbol: "SPX,ES1!,ES", type: "支撑", lowerText: "7200", upperText: "7250", label: "支撑: 7200-7250 (强) 防守" },
  ]);
});

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

test("rotation symbol resolution prefers an explicit ticker over a longer display-name match", () => {
  const catalog = [
    { symbol: "IXIC", displayName: "纳斯达克" },
    { symbol: "QQQ", displayName: "纳斯达克100ETF" },
  ];
  assert.equal(resolveRotationSymbol("纳斯达克 QQQ", catalog), "QQQ");
  assert.equal(resolveRotationSymbol("IGV 软件 ETF", []), "IGV");
});

test("combined export matches the requested QQQ format and keeps pressure before support", () => {
  const result = buildZoneExport({
    marketBlocks: [{
      title: "S&P 500 点位",
      children: [
        { title: "CTA流动性", body: "加速卖出触发：跌破 7620 / 7356 / 6884" },
        { title: "支持", body: "6570-6745（强）" },
        { title: "负伽马", body: "6475（破了该点位后就会出现较大的抛压）" },
      ],
    }],
    symbolCatalog: [{ symbol: "QQQ", displayName: "纳斯达克100ETF" }],
    rotationBlocks: [{
      title: "纳斯达克 QQQ",
      children: [
        { title: "支撑位 (Support):", body: "671–681（小）" },
        { title: "压力位", body: "734–744（小）\n693–724（强）注意反弹承压" },
        { title: "关键指标", body: "600-620（不应导出）" },
      ],
    }],
  });

  assert.equal(result.text, [
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
    "",
    "// QQQ 的压力支持",
    "draw_zone('QQQ', 734, 744, '压力: 734-744 (小)')",
    "draw_zone('QQQ', 693, 724, '压力: 693-724 (强) 注意反弹承压')",
    "draw_zone('QQQ', 671, 681, '支撑: 671-681 (小)')",
  ].join("\n"));
  assert.equal(result.zoneCount, 8);
  assert.equal(result.skippedCount, 0);
});

test("action-plan data wins duplicate ranges while rotation controls initial symbol order", () => {
  const result = buildZoneExport({
    symbolCatalog: [{ symbol: "SOXX" }, { symbol: "MSFT" }],
    rotationBlocks: [{
      title: "半导体指数 SOXX",
      children: [
        { title: "压力位", body: "550-580（强）旧说明" },
        { title: "支撑位", body: "489-532（中）" },
      ],
    }],
    actionPlans: [
      {
        symbol: "MSFT",
        resistanceLevels: "397-430（超强）突破右侧",
        supportLevels: "381-392（中）长线",
      },
      {
        symbol: "SOXX",
        resistanceLevels: "550-580（强）反弹承压",
        supportLevels: "",
      },
    ],
  });

  assert.deepEqual(result.groups.map((group) => group.symbol), ["SOXX", "MSFT"]);
  assert.equal(result.text.match(/SOXX', 550, 580/g)?.length, 1);
  assert.match(result.text, /压力: 550-580 \(强\) 反弹承压/);
  assert.ok(result.text.indexOf("压力: 397-430") < result.text.indexOf("支撑: 381-392"));
});
