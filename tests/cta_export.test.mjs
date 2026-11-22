import assert from "node:assert/strict";
import test from "node:test";
import worker from "../cloudflare/worker/src/index.js";
import { buildPineExport, collectSpxCtaText } from "../cloudflare/web/cta-export.js";
import { buildZoneExport } from "../cloudflare/web/zone-export.js";

test("SPX CTA endpoint validates source and the export renders a complete SPX-only Pine script", async (t) => {
  const updated = "11月9日更新";
  const horizon = "未来一个月";
  const note = "突破7549卖压减少，但仍属横盘主卖";
  const levels = [
    { price: 7549, direction: "up", scenario: "横盘", side: "BUY", amount: 138, unit: "亿", note, evidence: "横盘：buy 138亿，突破7549急速" },
    { price: 7676, direction: "up", scenario: "上涨", side: "BUY", amount: 891, unit: "亿", evidence: "上涨：buy 891亿，突破7676加速" },
    { price: 7084, direction: "down", scenario: "下跌", side: "SELL", amount: 1229, unit: "亿", evidence: "下跌：sell 1229亿，跌破7084加速" },
  ];
  const body = [updated, horizon, ...levels.map(({ evidence }) => evidence), note, "加速触发：7676/7549/7084"].join("\n");
  const blocks = [
    { type: "symbol", symbol: "GSPC", children: [{ kind: "cta", body }, { title: "加速下跌", body: "7084" }] },
    { type: "symbol", symbol: "NDX", children: [{ kind: "cta", body: "其他指数" }] },
  ];
  const text = collectSpxCtaText(blocks);
  assert.equal(text, body);
  t.mock.method(globalThis, "fetch", async () => Response.json({
    choices: [{ message: { content: JSON.stringify({
      updated, horizon, levels: [{ ...levels[0], amount: 999 }, ...levels, levels[0]],
    }) } }],
  }));
  const response = await worker.fetch(new Request("https://test.invalid/api/spx-cta-extract", {
    method: "POST",
    body: JSON.stringify({ text }),
  }), { APP_ENV: "test", LLM_API_KEY: "mock" });
  assert.equal(response.status, 200);
  const { cta } = await response.json();
  assert.deepEqual(cta.levels.map(({ price, amount }) => [price, amount]), [[7549, 138], [7676, 891], [7084, 1229]]);
  const zones = buildZoneExport({ marketReviewBlocks: blocks, ctaPrices: levels.map(({ price }) => price) });
  assert.equal(zones.zoneCount, 0);
  const script = buildPineExport({ zones: "draw_zone('SPY', 710, 720, '支撑')", cta });
  assert.match(script, /^\/\/@version=6\nindicator\(/);
  assert.match(script, /\nif syminfo\.ticker == "SPX" or syminfo\.ticker == "\.SPX"\n {4}draw_cta_level\(7676/);
  assert.match(script, /7549 ↑ 突破后卖压减少\\n横盘情景 · CTA BUY 138 亿/);
  assert.match(script, /7084 ↓ 跌破加速 · CTA SELL 1229 亿/);
  assert.equal((script.match(/\n {4}draw_cta_level\(/g) || []).length, 3);
  assert.ok(script.indexOf("draw_zone('SPY'") < script.lastIndexOf("if barstate.islast and in_show_val"));
  assert.match(buildPineExport({ zones: "draw_zone('SPY', 710, 720, '支撑')", cta: null }), /^\/\/@version=6/);
});
