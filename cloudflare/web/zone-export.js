const SYMBOL_STOP_WORDS = new Set([
  "ETF",
  "INDEX",
  "SUPPORT",
  "RESISTANCE",
]);

function normalizeAliases(value) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // 兼容逗号分隔的旧别名。
    }
    return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeSymbolItem(item = {}) {
  const symbol = String(item.symbol || "").trim().toUpperCase();
  if (!symbol) return null;
  const displayName = String(item.displayName || item.display_name || "").trim();
  return {
    symbol,
    aliases: [
      { value: symbol, priority: 2 },
      { value: displayName, priority: 1 },
      ...normalizeAliases(item.aliases).map((value) => ({ value, priority: 1 })),
    ].map((alias) => ({ ...alias, value: String(alias.value || "").trim() }))
      .filter((alias) => alias.value),
  };
}

function aliasAppearsInTitle(title, alias) {
  const normalizedTitle = String(title || "").toUpperCase();
  const normalizedAlias = String(alias || "").trim().toUpperCase();
  if (!normalizedAlias) return false;
  if (/^[A-Z0-9.^=-]+$/.test(normalizedAlias)) {
    const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).test(normalizedTitle);
  }
  return normalizedTitle.includes(normalizedAlias);
}

export function resolveRotationSymbol(sectionTitle, symbolCatalog = [], actionPlans = []) {
  const candidates = new Map();
  [...symbolCatalog, ...actionPlans].forEach((item) => {
    const normalized = normalizeSymbolItem(item);
    if (!normalized) return;
    const existing = candidates.get(normalized.symbol) || { symbol: normalized.symbol, aliases: [] };
    existing.aliases.push(...normalized.aliases);
    candidates.set(normalized.symbol, existing);
  });

  const matches = new Map();
  candidates.forEach((candidate) => {
    candidate.aliases.forEach((alias) => {
      if (aliasAppearsInTitle(sectionTitle, alias.value)) {
        const score = alias.priority * 1000 + alias.value.length;
        matches.set(candidate.symbol, Math.max(matches.get(candidate.symbol) || 0, score));
      }
    });
  });
  const rankedMatches = [...matches].map(([symbol, score]) => ({ symbol, score }))
    .sort((left, right) => right.score - left.score || left.symbol.localeCompare(right.symbol));
  if (rankedMatches.length) {
    if (rankedMatches[1]?.score === rankedMatches[0].score) return null;
    return rankedMatches[0].symbol;
  }

  const explicitTokens = String(sectionTitle || "").toUpperCase().match(/\b[A-Z][A-Z0-9.^=-]{0,11}\b/g) || [];
  return explicitTokens.find((token) => !SYMBOL_STOP_WORDS.has(token)) || null;
}

export function classifyZoneTitle(title) {
  const normalized = String(title || "").trim();
  if (/(压力|阻力|resistance)/i.test(normalized)) return "压力";
  if (/(支撑|支持|support)/i.test(normalized)) return "支撑";
  return null;
}

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

export function extractRotationZones(blocks = [], symbolCatalog = [], actionPlans = []) {
  const zones = [];
  let skipped = 0;
  let order = 0;
  (Array.isArray(blocks) ? blocks : []).forEach((section) => {
    const typedChildren = (Array.isArray(section?.children) ? section.children : [])
      .map((child) => ({ child, type: classifyZoneTitle(child?.title) }))
      .filter((item) => item.type);
    if (!typedChildren.length) return;
    const symbol = resolveRotationSymbol(section?.title, symbolCatalog, actionPlans);
    typedChildren.forEach(({ child, type }) => {
      const parsed = parseZoneText(child?.body, {
        symbol,
        type,
        source: "rotation",
        startOrder: order,
      });
      zones.push(...parsed.zones);
      skipped += parsed.skipped;
      order = parsed.nextOrder;
    });
  });
  return { zones, skipped };
}

function isSp500MarketSection(title) {
  return /(?:标普\s*500|S\s*&\s*P\s*500|SP\s*500|\bSPX\b|\^?GSPC\b)/i.test(String(title || ""));
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

export function extractMarketSp500Zones(blocks = []) {
  const zones = [];
  const negativeGammaPoints = [];
  const accelerationPoints = [];
  let skipped = 0;
  let order = 0;
  (Array.isArray(blocks) ? blocks : []).forEach((section) => {
    if (!isSp500MarketSection(section?.title)) return;
    (Array.isArray(section?.children) ? section.children : []).forEach((child) => {
      if (classifyZoneTitle(child?.title) === "支撑") {
        const parsed = parseZoneText(child?.body, {
          symbol: "SPX,ES1!,ES",
          type: "支撑",
          source: "market",
          startOrder: order,
        });
        zones.push(...parsed.zones);
        skipped += parsed.skipped;
        order = parsed.nextOrder;
      }
      negativeGammaPoints.push(...extractMarkedPointNumbers(
        child?.title,
        child?.body,
        /负\s*伽马(?:位)?/i,
      ));
      accelerationPoints.push(...extractMarkedPointNumbers(
        child?.title,
        child?.body,
        /加速(?:卖出(?:触发)?|下跌)(?:位)?/i,
      ));
    });
  });
  return {
    supportZones: zones,
    negativeGammaZones: uniquePointZones(negativeGammaPoints, "负伽马"),
    accelerationZones: uniquePointZones(accelerationPoints, "加速下跌"),
    skipped,
  };
}

export function extractMarketSp500SupportZones(blocks = []) {
  const result = extractMarketSp500Zones(blocks);
  return { zones: result.supportZones, skipped: result.skipped };
}

export function extractActionPlanZones(plans = []) {
  const zones = [];
  let skipped = 0;
  let order = 0;
  (Array.isArray(plans) ? plans : []).forEach((plan) => {
    const symbol = String(plan?.symbol || "").trim().toUpperCase() || null;
    [
      { text: plan?.resistanceLevels, type: "压力" },
      { text: plan?.supportLevels, type: "支撑" },
    ].forEach(({ text, type }) => {
      const parsed = parseZoneText(text, {
        symbol,
        type,
        source: "action-plan",
        startOrder: order,
      });
      zones.push(...parsed.zones);
      skipped += parsed.skipped;
      order = parsed.nextOrder;
    });
  });
  return { zones, skipped };
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

export function buildZoneExport({
  marketBlocks = [],
  rotationBlocks = [],
  actionPlans = [],
  symbolCatalog = [],
  includeMarket = true,
  includeRotation = true,
} = {}) {
  const market = includeMarket
    ? extractMarketSp500Zones(marketBlocks)
    : { supportZones: [], negativeGammaZones: [], accelerationZones: [], skipped: 0 };
  const rotation = includeRotation
    ? extractRotationZones(rotationBlocks, symbolCatalog, actionPlans)
    : { zones: [], skipped: 0 };
  const plans = extractActionPlanZones(actionPlans);
  const symbolOrder = [];
  const merged = new Map();
  let displayOrder = 0;

  [...rotation.zones, ...plans.zones].forEach((zone) => {
    if (!symbolOrder.includes(zone.symbol)) symbolOrder.push(zone.symbol);
    const key = `${zone.symbol}\u0000${zone.type}\u0000${zone.lowerText}\u0000${zone.upperText}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...zone, displayOrder });
      displayOrder += 1;
      return;
    }
    if (zone.source === "action-plan") {
      merged.set(key, { ...zone, displayOrder: existing.displayOrder });
    }
  });

  const groups = symbolOrder
    .map((symbol) => {
      const zones = [...merged.values()]
        .filter((zone) => zone.symbol === symbol)
        .sort((left, right) => {
          const typeOrder = (left.type === "压力" ? 0 : 1) - (right.type === "压力" ? 0 : 1);
          return typeOrder || left.displayOrder - right.displayOrder;
        });
      return zones.length ? { symbol, zones } : null;
    })
    .filter(Boolean);

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
    ? [{ symbol: "SPX,ES1!,ES", zones: marketZones }, ...groups]
    : groups;

  return {
    text,
    groups: outputGroups,
    zoneCount: outputGroups.reduce((total, group) => total + group.zones.length, 0),
    skippedCount: market.skipped + rotation.skipped + plans.skipped,
  };
}
