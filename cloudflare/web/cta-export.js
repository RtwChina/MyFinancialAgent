import { pineTemplate } from "./pine-template.js";

export function collectSpxCtaText(blocks) {
  return blocks
    .filter((block) => block.type === "symbol" && block.symbol === "GSPC")
    .flatMap((block) => block.children || [])
    .filter((child) => child.kind === "cta" || /CTA|加速触发/i.test([child.title, child.body].join("\n")))
    .map((child) => [child.title, child.body].filter(Boolean).join("\n"))
    .join("\n\n");
}

function pineString(value) {
  return JSON.stringify(value.replace(/\r\n?/g, "\n"));
}

export function buildPineExport({ zones, valuation, cta }) {
  const data = [zones, valuation, renderSpxCta(cta)].filter(Boolean).join("\n\n");
  return data ? pineTemplate.replace("// EXPORT_DATA", () => data) : "";
}

function renderSpxCta(cta) {
  if (!cta?.levels.length) return "";
  const lines = ['if syminfo.ticker == "SPX" or syminfo.ticker == ".SPX"'];
  const levels = [...cta.levels].sort((a, b) => b.price - a.price);
  for (const level of levels) {
    const { price, direction, scenario, side, amount, unit, note, evidence } = level;
    const up = direction === "up";
    const mixed = scenario.includes("横盘");
    const flow = `CTA ${side} ${amount} ${unit}`;
    const trigger = mixed && note.includes("卖压减少")
      ? "突破后卖压减少"
      : up ? "突破加速" : "跌破加速";
    const prefix = `${price} ${up ? "↑" : "↓"} ${trigger}`;
    const caption = mixed ? `${prefix}\n${scenario}情景 · ${flow}` : `${prefix} · ${flow}`;
    const tooltip = [cta.updated, cta.horizon, evidence, note].filter(Boolean).join("\n");
    const color = mixed ? "#A7610B" : side === "BUY" ? "#167554" : "#B43B4E";
    lines.push(`    draw_cta_level(${price}, ${pineString(caption)}, ${pineString(tooltip)}, ${color}, ${mixed})`);
  }
  return lines.join("\n");
}
