export const MARKET_REVIEW_VERSION = 1;
export const MARKET_REVIEW_PRESETS = Object.freeze({
  support: '支撑位', resistance: '压力位', thinking: '思考',
  cta: 'CTA 流动性', collar: 'JPM collar', eps: 'EPS 预计',
});

function fail(status, message, blockId) {
  const error = new Error(message);
  error.status = status;
  if (blockId !== undefined) error.blockId = blockId;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireArray(value, field) {
  if (!Array.isArray(value)) fail(400, `${field} 必须为数组`);
}

function requireId(id) {
  if (typeof id !== 'string' || !id.trim()) fail(400, '一级和二级 id 必须为非空字符串');
}

function isActive(item) {
  const active = item.isActive ?? item.is_active ?? item.active;
  return active === 1 || active === true;
}

function catalogIndex(catalog) {
  requireArray(catalog, 'catalog');
  const index = new Map();
  for (const item of catalog) {
    if (!isObject(item) || typeof item.symbol !== 'string' || !item.symbol.trim()) {
      fail(400, '目录标的必须包含系统 symbol');
    }
    index.set(item.symbol, item);
  }
  return index;
}

function catalogIdentity(item) {
  return {
    catalogId: item.catalogId ?? item.catalog_id ?? item.id ?? null,
    displayCode: item.displayCode ?? item.display_code ?? item.symbol,
    displayName: item.displayName ?? item.display_name ?? item.name ?? item.symbol,
  };
}

function hasPriceChildren(block) {
  return block.children.some(child => child.kind === 'support' || child.kind === 'resistance');
}

function sameData(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameData(value, right[index]));
  }
  if (!isObject(left) || !isObject(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && sameData(left[key], right[key]));
}

function originKey(origin) {
  if (!isObject(origin) || typeof origin.date !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(origin.date)
    || !['market', 'rotation'].includes(origin.group)
    || !Number.isSafeInteger(origin.index) || origin.index < 0) {
    fail(400, '历史来源 date/group/index 不合法');
  }
  return JSON.stringify([origin.date, origin.group, origin.index]);
}

function validateChildren(block, ids) {
  requireArray(block.children, 'children');
  const presets = new Set();
  for (const child of block.children) {
    if (!isObject(child)) fail(400, '二级必须为非 null 对象');
    requireId(child.id);
    if (ids.has(child.id)) fail(400, '一级和二级 id 必须在整份文档内唯一');
    ids.add(child.id);
    const preset = typeof child.kind === 'string' && Object.hasOwn(MARKET_REVIEW_PRESETS, child.kind);
    if (!preset && child.kind !== 'custom') fail(400, '未知二级 kind');
    if (typeof child.title !== 'string') fail(400, '二级标题必须为字符串');
    const price = child.kind === 'support' || child.kind === 'resistance';
    // symbol 价位 body 在存储中省略；提交了 body 则仍须是字符串，不作为价位写源。
    if (Object.hasOwn(child, 'body') ? typeof child.body !== 'string' : !(block.type === 'symbol' && price)) {
      fail(400, '二级正文必须为字符串');
    }
    if (block.type === 'legacy') continue; // 原文只读，在下方与可信旧块逐字段比对。
    if (preset) {
      if (child.title !== MARKET_REVIEW_PRESETS[child.kind]) fail(400, '预设标题必须与 kind 一致');
      if (presets.has(child.kind)) fail(400, '同一一级下预设不可重复');
      presets.add(child.kind);
    } else if (!child.title.trim()) fail(400, '自定义标题不能为空');
  }
}

export function searchMarketReviewSymbols(catalog, query = '') {
  catalogIndex(catalog);
  if (typeof query !== 'string') fail(400, '搜索内容必须为字符串');
  const needle = query.trim().toLowerCase();
  return catalog.filter(item => {
    if (!isActive(item)) return false;
    let aliases = item.aliases;
    if (typeof aliases === 'string') {
      try { aliases = JSON.parse(aliases); } catch { aliases = [aliases]; }
    }
    const terms = [item.symbol, item.displayCode, item.display_code, item.displayName, item.display_name, item.name,
      ...(Array.isArray(aliases) ? aliases : [])];
    return !needle || terms.some(term => typeof term === 'string' && term.toLowerCase().includes(needle));
  });
}

export function validateMarketReviewBlocks(blocks, { catalog, existingBlocks = [] } = {}) {
  requireArray(blocks, 'blocks');
  requireArray(existingBlocks, 'existingBlocks');
  const directory = catalogIndex(catalog);
  const existingById = new Map();
  for (const existing of existingBlocks) {
    if (!isObject(existing)) fail(400, 'existingBlocks 必须包含非 null 对象');
    requireId(existing.id);
    if (existingById.has(existing.id)) fail(400, '可信一级 id 重复');
    existingById.set(existing.id, existing);
  }
  const ids = new Set();
  const sources = new Set();
  const symbolBlocks = new Map();
  const result = [];
  for (const block of blocks) {
    if (!isObject(block)) fail(400, '一级必须为非 null 对象');
    requireId(block.id);
    if (ids.has(block.id)) fail(400, '一级和二级 id 必须在整份文档内唯一');
    ids.add(block.id);
    if (block.type !== 'symbol' && block.type !== 'legacy') fail(400, '一级 type 必须为 symbol 或 legacy');
    const existing = existingById.get(block.id);
    const trustedOrigin = existing?.legacyOrigin;
    if (Object.hasOwn(block, 'legacyOrigin')) {
      if (!trustedOrigin || !sameData(block.legacyOrigin, trustedOrigin)) fail(400, '不可伪造或复制历史来源');
    }
    if (trustedOrigin) {
      const key = originKey(trustedOrigin);
      if (sources.has(key)) fail(400, '同一历史 date/group/index 来源只能保留一次');
      sources.add(key);
    }
    const linking = existing?.type === 'legacy' && block.type === 'symbol';
    if (existing && existing.type !== block.type && !linking) fail(409, '历史块类型不可直接更改', block.id);
    // 关联只接受原文逐项转为自定义二级的结果，不能借关联同时改写历史原文。
    if (linking && !sameData(block.children, linkedLegacyChildren(existing))) fail(409, '未关联历史原文不可修改', block.id);
    validateChildren(block, ids);
    if (block.type === 'legacy') {
      if (block.symbol !== null) fail(400, 'legacy symbol 必须为 null');
      if (!existing || existing.type !== 'legacy' || !trustedOrigin) fail(400, '不能新建未关联的历史一级');
      if (typeof block.title !== 'string') fail(400, '历史原标题必须为字符串');
      if (!sameData(block, existing)) fail(409, '未关联历史原文不可修改', block.id);
      result.push(structuredClone(existing));
      continue;
    }
    if (typeof block.symbol !== 'string' || !block.symbol.trim()) fail(400, 'symbol 必须为系统键字符串');
    const unchanged = existing?.type === 'symbol' && existing.symbol === block.symbol;
    if (existing?.type === 'symbol' && !unchanged && hasPriceChildren(block)) {
      fail(409, '含支撑位或压力位二级时不能更换标的，请先删除价位二级', block.id);
    }
    const item = directory.get(block.symbol);
    let identity;
    if (item && isActive(item)) {
      identity = catalogIdentity(item);
    } else if (unchanged && isObject(existing.identity)) {
      identity = existing.identity;
    } else fail(400, '新增或更换标的必须使用已启用的目录系统键');
    const canonical = {
      id: block.id, type: 'symbol', symbol: block.symbol,
      identity: structuredClone(identity), children: structuredClone(block.children),
    };
    if (trustedOrigin) canonical.legacyOrigin = structuredClone(trustedOrigin);
    const previous = symbolBlocks.get(block.symbol);
    // 只有提交的每个重复块均延续已有同 id、同 symbol 的身份才可保留；关联历史块不能制造重复。
    const historical = unchanged;
    if (previous && (!previous.historical || !historical)) {
      fail(409, '该标的主题已存在', previous.blockId);
    }
    if (!previous) symbolBlocks.set(block.symbol, { blockId: block.id, historical });
    result.push(canonical);
  }
  return result;
}

export function createSymbolMarketBlock(options = {}) {
  const { symbol, catalog, blocks = [] } = options;
  requireArray(blocks, 'blocks');
  const id = Object.hasOwn(options, 'id') ? options.id : crypto.randomUUID();
  requireId(id);
  const duplicate = blocks.find(block => block?.type === 'symbol' && block.symbol === symbol);
  if (duplicate) fail(409, '该标的主题已存在', duplicate.id);
  const block = {
    id, type: 'symbol', symbol,
    children: ['support', 'resistance', 'thinking'].map(kind => ({
      id: `${id}-${kind}`, kind, title: MARKET_REVIEW_PRESETS[kind], body: '',
    })),
  };
  return validateMarketReviewBlocks([...blocks, block], { catalog, existingBlocks: blocks }).at(-1);
}

export function changeMarketBlockSymbol(block, { symbol, catalog, blocks = [] } = {}) {
  if (!isObject(block) || block.type !== 'symbol') fail(400, '只能更换已关联标的块');
  requireArray(blocks, 'blocks');
  requireArray(block.children, 'children');
  if (symbol !== block.symbol && hasPriceChildren(block)) {
    fail(409, '含支撑位或压力位二级时不能更换标的，请先删除价位二级', block.id);
  }
  const duplicate = blocks.find(other => other?.type === 'symbol' && other.id !== block.id && other.symbol === symbol);
  if (duplicate) fail(409, '该标的主题已存在', duplicate.id);
  const existingBlocks = blocks.some(other => other?.id === block.id)
    ? blocks.map(other => other.id === block.id ? block : other) : [...blocks, block];
  const submitted = existingBlocks.map(other => other.id === block.id ? { ...block, symbol } : other);
  return validateMarketReviewBlocks(submitted, { catalog, existingBlocks }).find(other => other.id === block.id);
}

function cloneEditableMarketBlock(block) {
  if (!isObject(block)) fail(400, '一级必须为非 null 对象');
  if (block.type === 'legacy') fail(409, '未关联历史原文不可修改', block.id);
  if (block.type !== 'symbol') fail(400, '只能编辑 symbol 块的二级');
  requireId(block.id);
  validateChildren(block, new Set([block.id]));
  return structuredClone(block);
}

function marketChildIndex(block, childId) {
  requireId(childId);
  const index = block.children.findIndex(child => child.id === childId);
  if (index === -1) fail(400, '二级 childId 不存在', block.id);
  return index;
}

export function addMarketChild(block, options = {}) {
  const result = cloneEditableMarketBlock(block);
  if (!isObject(options)) fail(400, '新增二级参数必须为非 null 对象');
  const { kind, title = '' } = options;
  const preset = typeof kind === 'string' && Object.hasOwn(MARKET_REVIEW_PRESETS, kind);
  if (!preset && kind !== 'custom') fail(400, '未知二级 kind');
  if (preset && result.children.some(child => child.kind === kind)) {
    fail(409, '同一一级下预设不可重复', block.id);
  }
  if (!preset && (typeof title !== 'string' || !title.trim())) {
    fail(400, '自定义标题必须为非空字符串');
  }
  const id = Object.hasOwn(options, 'id') ? options.id : crypto.randomUUID();
  requireId(id);
  if (id === result.id || result.children.some(child => child.id === id)) {
    fail(400, '一级和二级 id 必须在本块内唯一', block.id);
  }
  result.children.push({ id, kind, title: preset ? MARKET_REVIEW_PRESETS[kind] : title, body: '' });
  return result;
}

export function updateMarketChildTitle(block, childId, title) {
  const result = cloneEditableMarketBlock(block);
  const child = result.children[marketChildIndex(result, childId)];
  if (child.kind !== 'custom') fail(409, '预设标题不可修改', block.id);
  if (typeof title !== 'string' || !title.trim()) fail(400, '自定义标题必须为非空字符串');
  child.title = title;
  return result;
}

export function moveMarketChild(block, childId, delta) {
  const result = cloneEditableMarketBlock(block);
  const index = marketChildIndex(result, childId);
  if (delta !== -1 && delta !== 1) fail(400, '二级排序 delta 必须为数字 -1 或 1');
  const target = index + delta;
  if (target >= 0 && target < result.children.length) {
    [result.children[index], result.children[target]] = [result.children[target], result.children[index]];
  }
  return result;
}

export function deleteMarketChild(block, childId) {
  const result = cloneEditableMarketBlock(block);
  result.children.splice(marketChildIndex(result, childId), 1);
  return result;
}

export function createMarketReview({ blocks = [], conflicts = [], sourceDates = [] } = {}) {
  return structuredClone({ version: MARKET_REVIEW_VERSION, blocks, conflicts, sourceDates });
}

const LEGACY_CHILD_KINDS = new Map([
  ...['支撑位', '支撑', '支持', '支持位', '支撑位(support)'].map(title => [title, 'support']),
  ...['压力位', '压力', '阻力位', '阻力', '压力位(resistance)', '阻力位(resistance)'].map(title => [title, 'resistance']),
  ['思考', 'thinking'], ['cta', 'cta'], ['cta流动性', 'cta'], ['jpmcollar', 'collar'], ['eps预计', 'eps'],
]);
const UNTITLED_LEGACY_CHILD = '未命名原二级';

function rawText(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function legacyChildKind(title) {
  const key = title.replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/\s+/g, '').toLowerCase();
  return LEGACY_CHILD_KINDS.get(key) ?? 'custom';
}

function itemAliases(item) {
  let aliases = item.aliases;
  if (typeof aliases === 'string') {
    try { aliases = JSON.parse(aliases); } catch { aliases = aliases.split(/[,，]/); }
  }
  return Array.isArray(aliases) ? aliases.filter(alias => typeof alias === 'string') : [];
}

function codeAppears(title, code) {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`).test(title);
}

// 只认唯一明确的目录代码或与整个标题完全相同的名称/别名；停用标的也参与，避免历史歧义被猜成另一个标的。
// 大盘组另沿用原导出的标普识别（如“标普500点位”），ETF 标题不算指数。
function resolveLegacyBlockItem(title, directory, group) {
  const items = [...directory.values()];
  const byCode = new Set(items.filter(item => [item.symbol, item.displayCode ?? item.display_code]
    .some(code => typeof code === 'string' && code && codeAppears(title, code))).map(item => item.symbol));
  if (byCode.size) return byCode.size === 1 ? directory.get([...byCode][0]) : null;
  const needle = title.trim().toLowerCase();
  if (!needle) return null;
  const byName = new Set(items.filter(item => [item.displayName, item.display_name, ...itemAliases(item)]
    .some(name => typeof name === 'string' && name.trim().toLowerCase() === needle)).map(item => item.symbol));
  if (byName.size) return byName.size === 1 ? directory.get([...byName][0]) : null;
  if (group === 'market' && /(?:标普\s*500|S\s*&\s*P\s*500|SP\s*500)/i.test(title) && !/ETF/i.test(title)) {
    return directory.get('GSPC') ?? null;
  }
  return null;
}

function convertLegacyBlock(raw, { date, group, index, directory }) {
  const source = isObject(raw) ? raw : {};
  const title = rawText(source.title);
  const rawChildren = Array.isArray(source.children) ? source.children : [];
  const id = `legacy-${date}-${group}-${index}`;
  // 原 id 缺失时存 null，保证 JSON 往返后可信来源仍逐字段相等。
  const legacyOrigin = {
    date, group, index, id: source.id ?? null, title,
    children: rawChildren.map((child, childIndex) => ({
      index: childIndex, id: isObject(child) ? child.id ?? null : null,
      title: rawText(isObject(child) ? child.title : ''), body: rawText(isObject(child) ? child.body : ''),
    })),
  };
  const item = resolveLegacyBlockItem(title, directory, group);
  if (!item) {
    return {
      id, type: 'legacy', symbol: null, title, legacyOrigin,
      children: legacyOrigin.children.map(child => ({
        id: `${id}-${child.index}`, kind: 'custom', title: child.title, body: child.body, readOnly: true,
      })),
    };
  }
  const used = new Set();
  const children = legacyOrigin.children.map(child => {
    let kind = legacyChildKind(child.title);
    if (kind !== 'custom' && used.has(kind)) kind = 'custom';
    used.add(kind);
    const childTitle = kind !== 'custom' ? MARKET_REVIEW_PRESETS[kind] : child.title.trim() ? child.title : UNTITLED_LEGACY_CHILD;
    return { id: `${id}-${child.index}`, kind, title: childTitle, body: child.body };
  });
  return { id, type: 'symbol', symbol: item.symbol, identity: catalogIdentity(item), children, legacyOrigin };
}

function convertLegacyGroup(blocks, group, date, directory) {
  return (Array.isArray(blocks) ? blocks : []).map((raw, index) => convertLegacyBlock(raw, { date, group, index, directory }));
}

export function convertLegacyMarketReview({ date, marketBlocks, rotationBlocks, catalog }) {
  const directory = catalogIndex(catalog);
  return createMarketReview({ blocks: [
    ...convertLegacyGroup(marketBlocks, 'market', date, directory),
    ...convertLegacyGroup(rotationBlocks, 'rotation', date, directory),
  ] });
}

function parseLegacyColumn(value) {
  if (value == null) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function parseStoredReview(value) {
  if (value == null) return null;
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return createMarketReview({
    blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [],
    conflicts: Array.isArray(parsed?.conflicts) ? parsed.conflicts : [],
    sourceDates: Array.isArray(parsed?.sourceDates) ? parsed.sourceDates : [],
  });
}

function replaceGroupBlocks(entries, group, replacement) {
  const first = entries.findIndex(entry => entry.block.legacyOrigin?.group === group);
  const kept = entries.filter(entry => entry.block.legacyOrigin?.group !== group);
  if (first === -1) return group === 'market' ? [...replacement, ...kept] : [...kept, ...replacement];
  const position = entries.slice(0, first).filter(entry => entry.block.legacyOrigin?.group !== group).length;
  return [...kept.slice(0, position), ...replacement, ...kept.slice(position)];
}

// 最近非空新文档为基线；只有其后的旧组按 legacyOrigin.group 替换，无来源的新建主题保留。
function inheritedEntries(archiveDate, history, directory) {
  const rows = history.filter(row => isObject(row) && row.archive_date < archiveDate && row.review_status === 'reviewed')
    .sort((left, right) => (left.archive_date < right.archive_date ? 1 : -1));
  const baseline = rows.find(row => (parseStoredReview(row.market_review_json)?.blocks.length ?? 0) > 0);
  let entries = baseline ? parseStoredReview(baseline.market_review_json).blocks
    .map(block => ({ block, provenance: { type: 'baseline', date: baseline.archive_date } })) : [];
  for (const [group, column] of [['market', 'market_sentiment_blocks_json'], ['rotation', 'sector_rotation_blocks_json']]) {
    const source = rows.find(row => row.market_review_json == null
      && (!baseline || row.archive_date > baseline.archive_date) && (parseLegacyColumn(row[column])?.length ?? 0) > 0);
    if (!source) continue;
    const replacement = convertLegacyGroup(parseLegacyColumn(source[column]), group, source.archive_date, directory)
      .map(block => ({ block, provenance: { type: 'legacy', date: source.archive_date } }));
    entries = replaceGroupBlocks(entries, group, replacement);
  }
  return entries;
}

function setOwn(target, key, value) {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

function levelMapFromRows(rows) {
  const levels = {};
  for (const row of rows) setOwn(levels, row.symbol, { supportLevels: row.support_levels, resistanceLevels: row.resistance_levels });
  return levels;
}

const LEVEL_FIELDS = [['supportLevels', 'support', 'support_levels'], ['resistanceLevels', 'resistance', 'resistance_levels']];

// 已存行为权威；否则逐字段按 本日市场 → 本日计划(账户顺序) → 沿用来源 取首个非空，其余非空差异留作证据。
function selectInitialLevels({ archiveDate, entries, levelRows, planRows, historyLevels }) {
  const symbolLevels = levelMapFromRows(levelRows);
  const conflicts = [];
  const symbols = [];
  for (const symbol of [...entries.filter(entry => entry.block.type === 'symbol').map(entry => entry.block.symbol),
    ...planRows.map(row => row.symbol)]) {
    if (!symbols.includes(symbol)) symbols.push(symbol);
  }
  for (const symbol of symbols) {
    if (Object.hasOwn(symbolLevels, symbol)) continue;
    const row = {};
    for (const [field, kind, column] of LEVEL_FIELDS) {
      const candidates = [];
      const marketCandidates = (types) => {
        const seenBaseline = new Set();
        for (const { block, provenance } of entries) {
          if (block.type !== 'symbol' || block.symbol !== symbol || !types.includes(provenance.type)) continue;
          if (provenance.type === 'baseline') {
            if (seenBaseline.has(provenance.date)) continue;
            seenBaseline.add(provenance.date);
            const levels = historyLevels?.[provenance.date];
            const value = levels && Object.hasOwn(levels, symbol) ? levels[symbol]?.[field] : undefined;
            candidates.push({ value, source: { type: 'levels', date: provenance.date } });
            continue;
          }
          const child = block.children.find(item => item.kind === kind);
          if (child) candidates.push({ value: child.body, source: { type: 'market', date: provenance.date, blockId: block.id } });
        }
      };
      marketCandidates(['target']);
      for (const plan of planRows.filter(item => item.symbol === symbol)) {
        candidates.push({ value: plan[column], source: { type: 'plan', date: archiveDate, accountId: Number(plan.account_id), planId: Number(plan.id) } });
      }
      marketCandidates(['legacy', 'baseline']);
      const nonempty = candidates.filter(item => typeof item.value === 'string' && item.value.trim());
      const selected = nonempty[0];
      row[field] = selected?.value ?? '';
      const alternatives = nonempty.filter(item => item.value !== row[field]);
      if (alternatives.length) {
        conflicts.push({
          id: `${symbol}:${field}`, symbol, field, selectedValue: row[field], selectedSource: selected.source,
          alternatives: alternatives.map(item => ({ value: item.value, source: item.source })),
        });
      }
    }
    setOwn(symbolLevels, symbol, row);
  }
  return { symbolLevels, conflicts };
}

export function projectMarketReview({
  archiveDate, target = {}, catalog = [], history = [], levelRows = [], planRows = [],
  historyLevels = {}, allowInheritance = false,
}) {
  const directory = catalogIndex(catalog);
  const saved = parseStoredReview(target?.market_review_json);
  if (saved) {
    const symbolLevels = levelMapFromRows(levelRows);
    for (const symbol of planRows.map(row => row.symbol)) {
      if (Object.hasOwn(symbolLevels, symbol)) continue;
      const candidates = planRows.filter(row => row.symbol === symbol);
      setOwn(symbolLevels, symbol, Object.fromEntries(LEVEL_FIELDS.map(([field, , column]) => [field,
        candidates.find(row => typeof row[column] === 'string' && row[column].trim())?.[column] ?? ''])));
    }
    return { document: saved, symbolLevels, marketReview: { ...assembleMarketReview(saved, symbolLevels), source: 'saved' }, materialized: true };
  }
  const groups = [['market', 'market_sentiment_blocks_json'], ['rotation', 'sector_rotation_blocks_json']]
    .map(([group, column]) => ({ group, blocks: parseLegacyColumn(target?.[column]) }));
  const own = groups.filter(item => item.blocks !== null);
  let entries = [];
  if (allowInheritance && own.length < groups.length) entries = inheritedEntries(archiveDate, history, directory);
  for (const { group, blocks } of own) {
    entries = replaceGroupBlocks(entries, group, convertLegacyGroup(blocks, group, archiveDate, directory)
      .map(block => ({ block, provenance: { type: 'target', date: archiveDate } })));
  }
  const sourceDates = [...new Set(entries.filter(entry => entry.provenance.type !== 'target').map(entry => entry.provenance.date))];
  const { symbolLevels, conflicts } = selectInitialLevels({ archiveDate, entries, levelRows, planRows, historyLevels });
  const document = createMarketReview({ blocks: entries.map(entry => entry.block), conflicts, sourceDates });
  const source = sourceDates.length ? 'inherited' : own.length ? 'legacy' : 'empty';
  return { document, symbolLevels, marketReview: { ...assembleMarketReview(document, symbolLevels), source }, materialized: false };
}

function linkedLegacyChildren(block) {
  // 原价位文字保持为自定义原文，不自动写入共用价位。
  return (Array.isArray(block.children) ? block.children : []).map(child => ({
    id: child.id, kind: 'custom', title: rawText(child.title).trim() ? child.title : UNTITLED_LEGACY_CHILD, body: rawText(child.body),
  }));
}

export function linkLegacyMarketBlock(block, { symbol, catalog, blocks = [] } = {}) {
  if (!isObject(block) || block.type !== 'legacy' || !isObject(block.legacyOrigin)) fail(400, '只能关联未关联的历史块');
  requireArray(blocks, 'blocks');
  const duplicate = blocks.find(other => other?.type === 'symbol' && other.symbol === symbol);
  if (duplicate) fail(409, '该标的主题已存在', duplicate.id);
  const linked = {
    id: block.id, type: 'symbol', symbol, legacyOrigin: structuredClone(block.legacyOrigin),
    children: linkedLegacyChildren(block),
  };
  const existingBlocks = blocks.some(other => other?.id === block.id) ? blocks : [...blocks, block];
  const submitted = existingBlocks.map(other => other.id === block.id ? linked : other);
  return validateMarketReviewBlocks(submitted, { catalog, existingBlocks }).find(other => other.id === block.id);
}

export function serializeMarketReview(document) {
  const stored = createMarketReview(document);
  for (const block of stored.blocks) {
    if (block.type !== 'symbol') continue;
    for (const child of block.children) {
      if (child.kind === 'support' || child.kind === 'resistance') delete child.body;
    }
  }
  return JSON.stringify(stored);
}

function marketLevelValue(levels, field) {
  return levels && Object.hasOwn(levels, field) ? levels[field] ?? '' : '';
}

export function assembleMarketReview(document, symbolLevels) {
  const assembled = createMarketReview(document);
  for (const block of assembled.blocks) {
    if (block.type !== 'symbol') continue;
    const levels = Object.hasOwn(symbolLevels, block.symbol) ? symbolLevels[block.symbol] : null;
    for (const child of block.children) {
      if (child.kind === 'support') child.body = marketLevelValue(levels, 'supportLevels');
      if (child.kind === 'resistance') child.body = marketLevelValue(levels, 'resistanceLevels');
    }
  }
  return assembled;
}

export function patchMarketReviewLevels(document, symbolLevels, patches, { catalog, supplement = false } = {}) {
  requireArray(patches, 'patches');
  if (!isObject(symbolLevels)) fail(400, 'symbolLevels 必须为对象映射');
  const fields = [['supportLevels', 'support'], ['resistanceLevels', 'resistance']];
  const symbols = new Set();
  // 先校验整份补丁，避免非法/重复补丁触发任何结构补齐。
  for (const patch of patches) {
    if (!isObject(patch)) fail(400, '价位补丁必须为非 null 对象');
    if (!Object.hasOwn(patch, 'symbol') || typeof patch.symbol !== 'string' || !patch.symbol.trim()) {
      fail(400, '价位补丁 symbol 必须为非空系统键字符串');
    }
    if (symbols.has(patch.symbol)) fail(400, '同 symbol 不能提交重复价位补丁');
    symbols.add(patch.symbol);
    let submitted = false;
    for (const [field] of fields) {
      if (!Object.hasOwn(patch, field)) continue;
      submitted = true;
      if (typeof patch[field] !== 'string') fail(400, `${field} 必须为字符串`);
    }
    if (!submitted) fail(400, '价位补丁至少包含一个价位字段');
  }

  const levels = structuredClone(symbolLevels);
  const review = createMarketReview(document);
  for (const patch of patches) {
    const row = Object.hasOwn(levels, patch.symbol)
      ? levels[patch.symbol] : { supportLevels: '', resistanceLevels: '' };
    const changedKinds = [];
    for (const [field, kind] of fields) {
      if (!Object.hasOwn(patch, field)) continue;
      const value = patch[field];
      if (value !== marketLevelValue(row, field) && value.trim()) changedKinds.push(kind);
      row[field] = value;
    }
    // __proto__ 等系统键也必须写成自身属性，不能调用原型 setter。
    Object.defineProperty(levels, patch.symbol, { value: row, enumerable: true, writable: true, configurable: true });
    // 提交 blocksFinal 的入口保持默认 false；clear/未变化镜像永不补结构。
    if (!supplement || !changedKinds.length) continue;
    const matching = review.blocks.filter(block => block.type === 'symbol' && block.symbol === patch.symbol);
    if (!matching.length) {
      review.blocks.push(createSymbolMarketBlock({ symbol: patch.symbol, catalog, blocks: review.blocks }));
      continue;
    }
    // 历史重复主题各自保留，只补真正变化字段对应的缺失 price kind。
    review.blocks = review.blocks.map(block => {
      if (block.type !== 'symbol' || block.symbol !== patch.symbol) return block;
      for (const kind of changedKinds) {
        if (!block.children.some(child => child.kind === kind)) block = addMarketChild(block, { kind });
      }
      return block;
    });
  }
  return { marketReview: assembleMarketReview(review, levels), symbolLevels: levels };
}
