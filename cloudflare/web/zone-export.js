const SP500_SYMBOL = "GSPC";
const SP500_CHART_SYMBOLS = "SPX,ES1!,ES";
const LEVEL_FIELDS = [
  { kind: "resistance", field: "resistanceLevels", type: "压力" },
  { kind: "support", field: "supportLevels", type: "支撑" },
];

function formatZoneNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(4)));
}

function normalizeZoneLine(line) {
  return String(line || "")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseZoneLine(line, zoneType) {
  const normalized = normalizeZoneLine(line);
  if (!normalized) return null;
  const rangeMatch = normalized.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|－|~|～|至)\s*(-?\d+(?:\.\d+)?)/);
  if (!rangeMatch) return null;
  const first = Number(rangeMatch[1]);
  const second = Number(rangeMatch[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  const lowerText = formatZoneNumber(Math.min(first, second));
  const upperText = formatZoneNumber(Math.max(first, second));
  let rest = normalized.slice(rangeMatch.index + rangeMatch[0].length).trim();
  rest = rest.replace(/^[\s:：,，;；—–-]+/, "").trim();
  let strength = "";
  const strengthMatch = rest.match(/^\(([^)]+)\)/);
  if (strengthMatch) {
    strength = strengthMatch[1].trim();
    rest = rest.slice(strengthMatch[0].length).replace(/^[\s:：,，;；—–-]+/, "").trim();
  }
  const labelParts = [`${zoneType}: ${lowerText}-${upperText}`];
  if (strength) labelParts.push(`(${strength})`);
  if (rest) labelParts.push(rest);
  return {
    type: zoneType,
    lowerText,
    upperText,
    label: labelParts.join(" "),
  };
}

function parseZoneText(text, { symbol, type, source, startOrder = 0 }) {
  const zones = [];
  let skipped = 0;
  let order = startOrder;
  String(text || "").split(/\r?\n/).forEach((line) => {
    if (!String(line).trim()) return;
    const parsed = parseZoneLine(line, type);
    if (!parsed || !symbol) {
      skipped += 1;
      return;
    }
    zones.push({ ...parsed, symbol, source, order });
    order += 1;
  });
  return { zones, skipped, nextOrder: order };
}

function isLevelKind(kind) {
  return kind === "support" || kind === "resistance";
}

function sharedLevelText(symbolLevels, symbol, field, fallback = "") {
  const row = symbolLevels?.[symbol];
  return row && typeof row[field] === "string" ? row[field] : String(fallback || "");
}

function extractPointNumbers(text) {
  return (String(text || "").match(/-?\d+(?:\.\d+)?/g) || [])
    .map(Number)
    .filter(Number.isFinite);
}

function extractMarkedPointNumbers(title, body, markerPattern) {
  const titleMatches = markerPattern.test(String(title || ""));
  const points = [];
  String(body || "").split(/\r?\n/).forEach((line) => {
    markerPattern.lastIndex = 0;
    const lineMatch = markerPattern.exec(line);
    if (lineMatch) {
      points.push(...extractPointNumbers(line.slice(lineMatch.index + lineMatch[0].length)));
    } else if (titleMatches) {
      points.push(...extractPointNumbers(line));
    }
  });
  return points;
}

function uniquePointZones(points, type) {
  const seen = new Set();
  return points.flatMap((point) => {
    const pointText = formatZoneNumber(point);
    if (!pointText || seen.has(pointText)) return [];
    seen.add(pointText);
    return [{
      type,
      pointText,
      upperText: formatZoneNumber(point + 1),
      lowerText: formatZoneNumber(point - 1),
      symbol: "SPX,ES1!,ES",
      source: "market",
    }];
  });
}

// Only linked GSPC themes feed the S&P 500 template; resistance stays out of it by design.
export function extractMarketSp500Zones(blocks = [], symbolLevels = {}) {
  const themes = (Array.isArray(blocks) ? blocks : []).filter((block) => block?.type === "symbol" && block.symbol === SP500_SYMBOL);
  const children = themes.flatMap((block) => (Array.isArray(block.children) ? block.children : []));
  const levelBody = (child) => (isLevelKind(child.kind)
    ? sharedLevelText(symbolLevels, SP500_SYMBOL, child.kind === "support" ? "supportLevels" : "resistanceLevels", child.body)
    : child.body);
  const support = children.some((child) => child.kind === "support")
    ? parseZoneText(sharedLevelText(symbolLevels, SP500_SYMBOL, "supportLevels", children.find((child) => child.kind === "support")?.body), {
      symbol: SP500_CHART_SYMBOLS,
      type: "支撑",
      source: "market",
    })
    : { zones: [], skipped: 0 };
  const negativeGammaPoints = [];
  const accelerationPoints = [];
  children.forEach((child) => {
    negativeGammaPoints.push(...extractMarkedPointNumbers(child.title, levelBody(child), /负\s*伽马(?:位)?/i));
    accelerationPoints.push(...extractMarkedPointNumbers(child.title, levelBody(child), /加速(?:卖出(?:触发)?|下跌)(?:位)?/i));
  });
  return {
    supportZones: support.zones,
    negativeGammaZones: uniquePointZones(negativeGammaPoints, "负伽马"),
    accelerationZones: uniquePointZones(accelerationPoints, "加速下跌"),
    skipped: support.skipped,
  };
}

function escapeDrawZoneString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function renderMarketSp500Export(market) {
  const lines = ["// --- 标普500 ---"];
  if (market.supportZones.length) {
    lines.push("", "// 支撑位");
    market.supportZones.forEach((zone) => {
      lines.push(`draw_zone('SPX,ES1!,ES', ${zone.upperText}, ${zone.lowerText}, '${escapeDrawZoneString(zone.label)}')`);
    });
  }
  if (market.negativeGammaZones.length) {
    lines.push(
      "",
      "// 负伽马位 (关键破位点)",
      "// 给它稍微加了2个点的厚度，并在图表上强制显示为醒目的红色",
    );
    market.negativeGammaZones.forEach((zone) => {
      lines.push(`draw_zone('SPX,ES1!,ES', ${zone.upperText}, ${zone.lowerText}, '负伽马: ${zone.pointText} (破位大抛压)', color.new(color.red, 50), color.red)`);
    });
  }
  if (market.accelerationZones.length) {
    lines.push(
      "",
      "// 加速下跌位 (关键破位点)",
      "// 给它稍微加了2个点的厚度，并在图表上强制显示为醒目的红色",
    );
    market.accelerationZones.forEach((zone) => {
      lines.push(`draw_zone('SPX,ES1!,ES', ${zone.upperText}, ${zone.lowerText}, '加速下跌: ${zone.pointText} (跌破加速卖出)', color.new(color.red, 50), color.red)`);
    });
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

// Symbols come from linked identities only; each symbol's shared levels are parsed once,
// so the same price shown in the market review and several accounts is exported once.
export function buildZoneExport({
  marketReviewBlocks = [],
  symbolLevels = {},
  actionPlans = [],
  includeMarket = true,
} = {}) {
  const themes = includeMarket
    ? (Array.isArray(marketReviewBlocks) ? marketReviewBlocks : []).filter((block) => block?.type === "symbol" && block.symbol)
    : [];
  const market = includeMarket
    ? extractMarketSp500Zones(themes, symbolLevels)
    : { supportZones: [], negativeGammaZones: [], accelerationZones: [], skipped: 0 };

  const exported = new Map();
  const include = (symbol, kinds, fallback = {}) => {
    const entry = exported.get(symbol) || { kinds: new Set(), fallback };
    kinds.forEach((kind) => entry.kinds.add(kind));
    exported.set(symbol, entry);
  };
  themes.filter((block) => block.symbol !== SP500_SYMBOL).forEach((block) => {
    const kinds = (Array.isArray(block.children) ? block.children : []).map((child) => child?.kind).filter(isLevelKind);
    if (kinds.length) include(block.symbol, kinds);
  });
  (Array.isArray(actionPlans) ? actionPlans : []).forEach((plan) => {
    const symbol = String(plan?.symbol || "").trim().toUpperCase();
    if (symbol) include(symbol, ["support", "resistance"], plan);
  });

  let skipped = market.skipped;
  const groups = [...exported].map(([symbol, { kinds, fallback }]) => {
    const seen = new Set();
    const zones = [];
    LEVEL_FIELDS.filter(({ kind }) => kinds.has(kind)).forEach(({ field, type }) => {
      const parsed = parseZoneText(sharedLevelText(symbolLevels, symbol, field, fallback[field]), { symbol, type, source: "levels" });
      skipped += parsed.skipped;
      parsed.zones.forEach((zone) => {
        const key = `${zone.type}\u0000${zone.lowerText}\u0000${zone.upperText}`;
        if (seen.has(key)) return;
        seen.add(key);
        zones.push(zone);
      });
    });
    return zones.length ? { symbol, zones } : null;
  }).filter(Boolean);

  const genericText = groups.map(({ symbol, zones }) => [
    `// ${symbol} 的压力支持`,
    ...zones.map((zone) => (
      `draw_zone('${escapeDrawZoneString(symbol)}', ${zone.lowerText}, ${zone.upperText}, '${escapeDrawZoneString(zone.label)}')`
    )),
  ].join("\n")).join("\n\n");
  const marketText = renderMarketSp500Export(market);
  const text = [marketText, genericText].filter(Boolean).join("\n\n");
  const marketZones = [
    ...market.supportZones,
    ...market.negativeGammaZones,
    ...market.accelerationZones,
  ];
  const outputGroups = marketZones.length
    ? [{ symbol: SP500_CHART_SYMBOLS, zones: marketZones }, ...groups]
    : groups;

  return {
    text,
    groups: outputGroups,
    zoneCount: outputGroups.reduce((total, group) => total + group.zones.length, 0),
    skippedCount: skipped,
  };
}
