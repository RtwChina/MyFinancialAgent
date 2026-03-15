const state = {
  activeView: "news",
  activeDate: null,
  activeBootstrap: null,
  newsFilters: null,
  reviewStep: "news",
  selectedNewsIds: new Set(),
};

const REVIEW_STEPS = [
  { key: "news", label: "新闻汇总", field: "newsBrief", optional: false, hint: "先圈出重点新闻，再把当天主线压成一句能指导交易的判断。" },
  { key: "market", label: "大盘盘点", field: "marketSentiment", optional: false, hint: "只写真正影响大盘的变量，比如美元、利率、VIX 和风险偏好。" },
  { key: "rotation", label: "板块轮动", field: "sectorRotation", optional: false, hint: "把大宗商品和板块强弱写清楚，说明谁领涨、谁承压、资金往哪边走。" },
  { key: "plan", label: "操作计划", field: "assetPlan", optional: false, hint: "针对核心标的和仓位，给出明确计划、触发条件和风险线。" },
  { key: "thinking", label: "深度总结", field: "tradingSummary", optional: true, hint: "最后补深度反思。可选，但如果写了，最好落到可执行的下一步。" },
];

const NEWS_TYPE_LABELS = {
  macro: "宏观",
  market: "宏观",
  symbol: "标的",
};

const REVIEW_STATUS_LABELS = {
  initialized: "待开始",
  draft: "进行中",
  reviewed: "已复盘",
  missing: "待开始",
};

const newsView = document.querySelector("#newsView");
const reviewsView = document.querySelector("#reviewsView");
const navButtons = document.querySelectorAll(".nav-chip");

const newsFiltersForm = document.querySelector("#newsFiltersForm");
const newsContent = document.querySelector("#newsContent");
const newsList = document.querySelector("#newsList");
const newsSummary = document.querySelector("#newsSummary");
const newsDetailModal = document.querySelector("#newsDetailModal");
const newsDetailBackdrop = document.querySelector("#newsDetailBackdrop");
const newsDetailCard = document.querySelector("#newsDetailCard");
const newsDetailMeta = document.querySelector("#newsDetailMeta");
const newsDetailTitle = document.querySelector("#newsDetailTitle");
const newsDetailTags = document.querySelector("#newsDetailTags");
const newsDetailAi = document.querySelector("#newsDetailAi");
const newsDetailOriginalBlock = document.querySelector("#newsDetailOriginalBlock");
const newsDetailSummary = document.querySelector("#newsDetailSummary");
const newsDetailImpact = document.querySelector("#newsDetailImpact");
const newsDetailContent = document.querySelector("#newsDetailContent");
const newsDetailLink = document.querySelector("#newsDetailLink");
const closeNewsDetailBtn = document.querySelector("#closeNewsDetailBtn");

const pendingRibbon = document.querySelector("#pendingRibbon");
const pendingState = document.querySelector("#pendingState");
const reviewsList = document.querySelector("#reviewsList");

const reviewDrawer = document.querySelector("#reviewDrawer");
const reviewForm = document.querySelector("#reviewForm");
const archiveDateLabel = document.querySelector("#archiveDateLabel");
const reviewStatusBadge = document.querySelector("#reviewStatusBadge");
const carryForwardLabel = document.querySelector("#carryForwardLabel");
const drawerSubtitle = document.querySelector("#drawerSubtitle");
const pricesBox = document.querySelector("#pricesBox");
const newsWindowBox = document.querySelector("#newsWindowBox");
const analysisBox = document.querySelector("#analysisBox");
const newsPicker = document.querySelector("#newsPicker");
const reviewNewsDetailBox = document.querySelector("#reviewNewsDetailBox");
const reviewStepNav = document.querySelector("#reviewStepNav");
const reviewStepHint = document.querySelector("#reviewStepHint");
const saveDraftBtn = document.querySelector("#saveDraftBtn");
const initializeBtn = document.querySelector("#initializeBtn");
const reviewActionGroup = document.querySelector("#reviewActionGroup");
const prevStepBtn = document.querySelector("#prevStepBtn");
const nextStepBtn = document.querySelector("#nextStepBtn");

navButtons.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelector("#refreshNewsBtn").addEventListener("click", () => loadNewsList());
document.querySelector("#resetNewsFiltersBtn").addEventListener("click", () => {
  newsFiltersForm.reset();
  loadNewsList();
});
newsFiltersForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadNewsList(new FormData(newsFiltersForm));
});

document.querySelector("#refreshPendingBtn").addEventListener("click", () => loadPendingReviews());
document.querySelector("#refreshReviewsBtn").addEventListener("click", () => loadReviews());
document.querySelector("#filtersForm").addEventListener("submit", (event) => {
  event.preventDefault();
  loadReviews(new FormData(event.currentTarget));
});

saveDraftBtn.addEventListener("click", async () => {
  if (!state.activeDate) return;
  await saveReview();
});

initializeBtn.addEventListener("click", async () => {
  if (!state.activeDate) return;
  if (!window.confirm(`确认要把 ${state.activeDate} 重新初始化吗？这会清空当前复盘内容。`)) return;
  if (!window.confirm("请再次确认：初始化后将清空新闻汇总、操作计划和复盘结论。")) return;
  await fetchJson(`/api/reviews/${state.activeDate}/initialize`, { method: "POST" });
  setReviewStatus("initialized");
  setReviewMode("initialized");
  if (state.activeBootstrap?.draft) {
    state.activeBootstrap.draft = {
      ...state.activeBootstrap.draft,
      review_status: "initialized",
      news_brief: "",
      selected_news_ids: "[]",
      market_sentiment: "",
      sector_rotation: "",
      asset_plan: "",
      trading_summary: "",
    };
  }
  applyFormValues({
    selectedNewsIds: JSON.stringify([...new Set((state.activeBootstrap?.news || []).map((item) => String(item.id || item.pub_date)))]),
    newsBrief: buildDefaultNewsBrief(state.activeBootstrap?.analysis, state.activeBootstrap?.news),
    marketSentiment: "",
    sectorRotation: "",
    assetPlan: "",
    tradingSummary: "",
  });
  state.selectedNewsIds = new Set((state.activeBootstrap?.news || []).map((item) => String(item.id || item.pub_date)));
  renderNewsPicker(state.activeBootstrap?.news || []);
  await Promise.all([loadPendingReviews(), loadReviews()]);
});

prevStepBtn.addEventListener("click", () => moveReviewStep(-1));
nextStepBtn.addEventListener("click", async () => {
  await handleNextStep();
});

closeNewsDetailBtn.addEventListener("click", closeNewsDetail);
newsDetailBackdrop.addEventListener("click", closeNewsDetail);
document.querySelector("#closeDrawerBtn").addEventListener("click", closeDrawer);
document.querySelector("#closeDrawerBackdrop").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!newsDetailModal.classList.contains("hidden")) closeNewsDetail();
    if (!reviewDrawer.classList.contains("hidden")) closeDrawer();
  }
});

switchView("news");
loadNewsList();
loadPendingReviews();
loadReviews();

function switchView(view) {
  state.activeView = view;
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  newsView.classList.toggle("active", view === "news");
  reviewsView.classList.toggle("active", view === "reviews");
}

async function loadNewsList(formData = null) {
  newsList.innerHTML = `<tr><td colspan="5" class="table-empty">加载中...</td></tr>`;
  const params = new URLSearchParams();
  const sourceData = formData || getDefaultNewsFilters();
  for (const [key, value] of sourceData.entries()) {
    if (value) params.append(key, value);
  }
  state.newsFilters = params;

  const query = params.toString() ? `?${params.toString()}` : "";
  try {
    const data = await fetchJson(`/api/news${query}`);
    newsSummary.textContent = `当前结果 ${data.total} 条 · 默认仅看 3 星及以上`;
    newsList.innerHTML = "";
    if (!data.items.length) {
      newsList.innerHTML = `<tr><td colspan="5" class="table-empty">没有查到匹配新闻</td></tr>`;
      return;
    }
    data.items.forEach((item) => {
      newsList.appendChild(buildNewsRow(item));
    });
  } catch (error) {
    newsSummary.textContent = "加载失败";
    newsList.innerHTML = `<tr><td colspan="5" class="table-empty">新闻加载失败: ${error.message}</td></tr>`;
  }
}

async function loadNewsDetail(id) {
  const data = await fetchJson(`/api/news/${id}`);
  const item = data.item;
  newsDetailCard.classList.remove("hidden");
  newsDetailModal.classList.remove("hidden");
  newsDetailMeta.textContent = `${item.pub_date || "未知时间"} · ${item.source || "未知来源"} · ${formatNewsType(item.type)}`;
  newsDetailTitle.textContent = item.ai_summary || item.title || "无标题";
  newsDetailAi.textContent = item.ai_summary || "暂无 AI 摘要";
  newsDetailSummary.textContent = item.title || "暂无原始标题";
  newsDetailOriginalBlock.classList.toggle("hidden", isDuplicateHeadline(item.ai_summary, item.title));
  newsDetailImpact.textContent = item.market_impact || item.rule_reason || "暂无市场影响说明";
  newsDetailContent.textContent = item.content || "暂无正文";
  newsDetailLink.href = item.url || "#";
  newsDetailLink.textContent = item.url ? "打开原始链接" : "无原始链接";
  newsDetailLink.classList.toggle("disabled", !item.url);
  newsDetailTags.innerHTML = "";

  const tags = [
    formatNewsType(item.type),
    formatStarLabel(item.importance_stars),
    ...(item.related_symbols || []).map((symbol) => symbol),
  ].filter(Boolean);
  tags.forEach((tag) => newsDetailTags.appendChild(buildChip(tag)));
}

function closeNewsDetail() {
  newsDetailModal.classList.add("hidden");
}

async function loadPendingReviews() {
  pendingState.textContent = "加载中...";
  pendingRibbon.innerHTML = "";
  try {
    const data = await fetchJson("/api/reviews/pending");
    pendingState.textContent = data.items.length
      ? `最近美股收盘日：${data.latestClosedDate}`
      : "当前没有待复盘日期";

    if (!data.items.length) {
      pendingRibbon.innerHTML = `<article class="empty-pending-card">最近已收盘交易日都已处理完，当前没有待复盘日期。</article>`;
      return;
    }

    data.items.forEach((item) => pendingRibbon.appendChild(buildPendingCard(item)));
  } catch (error) {
    pendingState.textContent = `加载失败: ${error.message}`;
  }
}

async function loadReviews(formData = null) {
  reviewsList.innerHTML = `<tr><td colspan="8" class="table-empty">加载中...</td></tr>`;
  const params = new URLSearchParams();
  if (formData) {
    for (const [key, value] of formData.entries()) {
      if (value) params.set(key, value);
    }
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  try {
    const data = await fetchJson(`/api/reviews${query}`);
    reviewsList.innerHTML = "";
    if (!data.items.length) {
      reviewsList.innerHTML = `<tr><td colspan="8" class="table-empty">还没有复盘记录</td></tr>`;
      return;
    }
    data.items.forEach((item) => reviewsList.appendChild(buildReviewRow(item)));
  } catch (error) {
    reviewsList.innerHTML = `<tr><td colspan="8" class="table-empty">查询失败: ${error.message}</td></tr>`;
  }
}

async function openReviewDrawer(archiveDate) {
  const data = await fetchJson(`/api/reviews/${archiveDate}/bootstrap`);
  state.activeDate = archiveDate;
  state.activeBootstrap = data;
  state.selectedNewsIds = new Set(parseStoredIds(data.draft?.selected_news_ids));

  const cycle = buildReviewCycle(archiveDate);
  archiveDateLabel.textContent = `${archiveDate} · 美股交易日`;
  drawerSubtitle.textContent = `${cycle.beijingLabel} · 新闻窗口 ${data.newsWindow.start} → ${data.newsWindow.end}`;
  carryForwardLabel.textContent = data.carryForward?.archive_date
    ? `参考上一已复盘日 ${data.carryForward.archive_date}`
    : "无上一复盘日参考";

  const reviewStatus = data.draft?.review_status || "initialized";
  setReviewStatus(reviewStatus);
  setReviewMode(reviewStatus);

  renderPrices(data.prices);
  newsWindowBox.textContent = `${cycle.nyLabel} · ${cycle.beijingLabel}`;
  renderAnalysis(getEffectiveAnalysis(data.analysis, data.news), data.news);
  renderNewsPicker(data.news);

  applyFormValues({
    selectedNewsIds: JSON.stringify([...state.selectedNewsIds]),
    newsBrief: data.draft?.news_brief || buildDefaultNewsBrief(data.analysis, data.news),
    marketSentiment: data.draft?.market_sentiment || data.carryForward?.market_sentiment || "",
    sectorRotation: data.draft?.sector_rotation || data.carryForward?.sector_rotation || "",
    assetPlan: data.draft?.asset_plan || data.carryForward?.asset_plan || "",
    tradingSummary: data.draft?.trading_summary || "",
  });

  setReviewStep("news");
  reviewDrawer.classList.remove("hidden");
}

function closeDrawer() {
  reviewDrawer.classList.add("hidden");
}

async function saveReview() {
  const payload = Object.fromEntries(new FormData(reviewForm).entries());
  payload.reviewStatus = state.activeBootstrap?.draft?.review_status || "initialized";
  payload.selectedNewsIds = JSON.parse(payload.selectedNewsIds || "[]");

  await fetchJson(`/api/reviews/${state.activeDate}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  state.activeBootstrap = {
    ...state.activeBootstrap,
    draft: {
      ...(state.activeBootstrap?.draft || {}),
      review_status: payload.reviewStatus,
      news_brief: payload.newsBrief,
      selected_news_ids: JSON.stringify(payload.selectedNewsIds),
      market_sentiment: payload.marketSentiment,
      sector_rotation: payload.sectorRotation,
      asset_plan: payload.assetPlan,
      trading_summary: payload.tradingSummary,
    },
  };
  await Promise.all([loadPendingReviews(), loadReviews()]);
}

function buildNewsRow(item) {
  const row = document.createElement("tr");
  row.className = "news-row";

  const timeCell = document.createElement("td");
  timeCell.innerHTML = `<strong>${escapeHtml(item.pub_date || "未知时间")}</strong><small>${escapeHtml(item.source || "未知来源")}</small>`;

  const summaryCell = document.createElement("td");
  summaryCell.className = "news-summary-cell";
  summaryCell.innerHTML = `<strong>${escapeHtml(item.ai_summary || item.title || "无标题")}</strong><p>${escapeHtml(buildNewsImpactText(item))}</p>`;

  const impactCell = document.createElement("td");
  impactCell.className = "news-impact-cell";
  impactCell.textContent = buildNewsBodyPreview(item);

  const tagsCell = document.createElement("td");
  const chipRow = document.createElement("div");
  chipRow.className = "chip-row compact";
  chipRow.appendChild(buildChip(formatStarLabel(item.importance_stars), "highlight"));
  chipRow.appendChild(buildChip(formatNewsType(item.type)));
  (item.related_symbols || []).slice(0, 3).forEach((symbol) => chipRow.appendChild(buildChip(symbol)));
  tagsCell.appendChild(chipRow);

  const actionCell = document.createElement("td");
  const button = document.createElement("button");
  button.className = "ghost";
  button.textContent = "查看详情";
  button.addEventListener("click", () => loadNewsDetail(item.id));
  actionCell.appendChild(button);

  row.append(timeCell, summaryCell, impactCell, tagsCell, actionCell);
  return row;
}

function buildPendingCard(item) {
  const cycle = buildReviewCycle(item.archiveDate);
  const card = document.createElement("article");
  card.className = "pending-card";
  card.appendChild(textBlock("复盘日", item.archiveDate));
  card.appendChild(textBlock("北京时间", cycle.beijingLabel));
  card.appendChild(textBlock("状态", formatReviewStatus(item.reviewStatus)));

  const button = document.createElement("button");
  button.textContent = item.reviewStatus === "draft" ? "继续复盘" : "开始复盘";
  button.addEventListener("click", () => {
    switchView("reviews");
    openReviewDrawer(item.archiveDate);
  });
  card.appendChild(button);
  return card;
}

function buildReviewRow(item) {
  const cycle = buildReviewCycle(item.archive_date);
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><strong>${item.archive_date}</strong><small>${cycle.nyLabel}</small></td>
    <td>${cycle.beijingLabel}</td>
    <td>${escapeHtml(truncateText(item.news_summary || "待补充", 80))}</td>
    <td>${escapeHtml(truncateText(item.market_sentiment || "待补充", 70))}</td>
    <td>${escapeHtml(truncateText(item.sector_rotation || "待补充", 70))}</td>
    <td>${escapeHtml(truncateText(item.asset_plan || "待补充", 70))}</td>
    <td></td>
    <td></td>
  `;
  const statusCell = row.children[6];
  statusCell.appendChild(buildChip(formatReviewStatus(item.review_status || "draft"), reviewStatusVariant(item.review_status)));

  const actionCell = row.children[7];
  const button = document.createElement("button");
  button.className = "ghost";
  button.textContent = item.review_status === "reviewed" ? "查看" : item.review_status === "draft" ? "继续复盘" : "开始复盘";
  button.addEventListener("click", () => openReviewDrawer(item.archive_date));
  actionCell.appendChild(button);
  return row;
}

function buildChip(label, variant = "") {
  const chip = document.createElement("span");
  chip.className = `tag ${variant}`.trim();
  chip.textContent = label;
  return chip;
}

function textBlock(label, value) {
  const wrapper = document.createElement("div");
  const small = document.createElement("small");
  small.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  wrapper.append(small, strong);
  return wrapper;
}

function applyFormValues(values) {
  for (const [key, value] of Object.entries(values)) {
    const field = reviewForm.elements.namedItem(key);
    if (field) field.value = value;
  }
}

function renderPrices(prices) {
  pricesBox.innerHTML = "";
  if (!prices?.length) {
    pricesBox.innerHTML = `<div class="empty-state">暂无价格数据</div>`;
    return;
  }
  prices.forEach((item) => {
    const card = document.createElement("article");
    card.className = "price-card";
    const symbol = document.createElement("strong");
    symbol.textContent = item.stock_name ? `${item.symbol} · ${item.stock_name}` : item.symbol || "-";
    const price = document.createElement("div");
    price.className = "price-value";
    price.textContent = formatPrice(item.current_price);
    const change = document.createElement("div");
    const raw = Number(item.change_percent ?? 0);
    change.className = `price-change ${raw > 0 ? "up" : raw < 0 ? "down" : ""}`.trim();
    change.textContent = `${raw > 0 ? "+" : ""}${Number.isFinite(raw) ? raw.toFixed(2) : "-"}%`;
    card.append(symbol, price, change);
    pricesBox.appendChild(card);
  });
}

function renderAnalysis(analysis, news) {
  analysisBox.innerHTML = "";
  const summary = document.createElement("section");
  summary.className = "analysis-summary";
  const eyebrow = document.createElement("span");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "AI Summary";
  const paragraph = document.createElement("p");
  paragraph.textContent = buildAiSummaryText(analysis, news);
  summary.append(eyebrow, paragraph);
  analysisBox.appendChild(summary);

  const outline = document.createElement("section");
  outline.className = "analysis-outline";
  [
    { title: "宏观主线", value: splitLines(analysis?.global_news)[0] || splitLines(analysis?.market_news)[0] || "暂无" },
    { title: "标的主线", value: splitLines(analysis?.symbol_news)[0] || topNewsHeadline((news || []).filter((item) => normalizeNewsType(item.type) === "symbol")) || "暂无" },
  ].forEach((item) => {
    const card = document.createElement("article");
    card.className = "analysis-outline-card";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const body = document.createElement("p");
    body.textContent = item.value;
    card.append(title, body);
    outline.appendChild(card);
  });
  analysisBox.appendChild(outline);
}

function renderNewsPicker(news) {
  newsPicker.innerHTML = "";
  reviewNewsDetailBox.innerHTML = "";
  reviewNewsDetailBox.classList.add("hidden");
  if (!(news || []).length) {
    newsPicker.innerHTML = `<div class="empty-state">当前没有可纳入复盘的重点新闻。</div>`;
    updateSelectedNewsField();
    return;
  }

  if (!state.selectedNewsIds.size) {
    news.forEach((item) => state.selectedNewsIds.add(String(item.id || item.pub_date)));
  }

  const sorted = sortNewsByStars(news);
  const intro = document.createElement("div");
  intro.className = "review-news-header";
  intro.innerHTML = `<strong>需复盘的新闻列表</strong><small>默认按星级筛出重点新闻，你可以取消勾选不需要进入复盘的条目。</small>`;
  newsPicker.appendChild(intro);

  const macroNews = sorted.filter((item) => normalizeNewsType(item.type) === "macro");
  const symbolNews = sorted.filter((item) => normalizeNewsType(item.type) === "symbol");

  newsPicker.appendChild(buildReviewNewsSection("宏观新闻", macroNews, false));

  const symbolSection = document.createElement("section");
  symbolSection.className = "review-news-section";
  const symbolHead = document.createElement("div");
  symbolHead.className = "review-news-section-head";
  symbolHead.innerHTML = `<h4>标的新闻</h4><small>按标的分组，默认折叠。</small>`;
  symbolSection.appendChild(symbolHead);

  if (!symbolNews.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "当前没有标的新闻。";
    symbolSection.appendChild(empty);
  } else {
    Object.entries(groupSymbolNews(symbolNews)).forEach(([symbol, items]) => {
      const details = document.createElement("details");
      details.className = "symbol-group";
      const summary = document.createElement("summary");
      summary.innerHTML = `<span>${escapeHtml(symbol)}</span><small>${items.length} 条 · 最高 ${formatStarLabel(items[0]?.importance_stars || 0)}</small>`;
      details.appendChild(summary);

      const body = document.createElement("div");
      body.className = "review-news-group-body";
      items.forEach((item) => body.appendChild(buildReviewNewsItem(item)));
      details.appendChild(body);
      symbolSection.appendChild(details);
    });
  }
  newsPicker.appendChild(symbolSection);
  updateSelectedNewsField();
}

function buildReviewNewsSection(title, items, collapsible = false) {
  const section = document.createElement(collapsible ? "details" : "section");
  section.className = "review-news-section";
  if (collapsible) section.open = false;

  const head = document.createElement(collapsible ? "summary" : "div");
  head.className = "review-news-section-head";
  head.innerHTML = `<h4>${escapeHtml(title)}</h4><small>${items.length ? `${items.length} 条，按星级从高到低排序` : "当前没有可展示的新闻"}</small>`;
  section.appendChild(head);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "当前没有可纳入复盘的新闻。";
    section.appendChild(empty);
    return section;
  }

  const body = document.createElement("div");
  body.className = "review-news-group-body";
  items.forEach((item) => body.appendChild(buildReviewNewsItem(item)));
  section.appendChild(body);
  return section;
}

function buildReviewNewsItem(item) {
  const key = String(item.id || item.pub_date);
  const article = document.createElement("article");
  article.className = "review-news-item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.selectedNewsIds.has(key);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) state.selectedNewsIds.add(key);
    else state.selectedNewsIds.delete(key);
    updateSelectedNewsField();
  });

  const body = document.createElement("div");
  body.className = "review-news-item-body";
  const title = document.createElement("strong");
  title.textContent = item.ai_summary || item.title || item.content || "未命名新闻";

  const meta = document.createElement("div");
  meta.className = "chip-row compact";
  meta.appendChild(buildChip(formatStarLabel(item.importance_stars), "highlight"));
  meta.appendChild(buildChip(formatNewsType(item.type)));
  (item.related_symbols || []).slice(0, 3).forEach((symbol) => meta.appendChild(buildChip(symbol)));

  const impact = document.createElement("p");
  impact.textContent = item.market_impact || item.rule_reason || "暂无市场影响说明";

  const foot = document.createElement("div");
  foot.className = "review-news-item-foot";
  const time = document.createElement("small");
  time.textContent = `${item.pub_date || "未知时间"} · ${item.source || "未知来源"}`;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost";
  button.textContent = "查看新闻";
  button.addEventListener("click", () => renderReviewNewsDetail(item));
  foot.append(time, button);

  body.append(title, meta, impact, foot);
  article.append(checkbox, body);
  return article;
}

function renderReviewNewsDetail(item) {
  reviewNewsDetailBox.innerHTML = "";
  reviewNewsDetailBox.classList.remove("hidden");

  const header = document.createElement("div");
  header.className = "review-news-detail-head";
  const title = document.createElement("strong");
  title.textContent = item.ai_summary || item.title || "未命名新闻";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ghost";
  close.textContent = "收起详情";
  close.addEventListener("click", () => {
    reviewNewsDetailBox.classList.add("hidden");
    reviewNewsDetailBox.innerHTML = "";
  });
  header.append(title, close);

  const meta = document.createElement("p");
  meta.className = "muted";
  meta.textContent = `${item.pub_date || "未知时间"} · ${item.source || "未知来源"} · ${formatNewsType(item.type)}`;

  const tags = document.createElement("div");
  tags.className = "chip-row compact";
  tags.appendChild(buildChip(formatStarLabel(item.importance_stars), "highlight"));
  (item.related_symbols || []).forEach((symbol) => tags.appendChild(buildChip(symbol)));

  const summary = buildReviewNewsDetailBlock("AI 摘要", item.ai_summary || "暂无 AI 摘要");
  const origin = buildReviewNewsDetailBlock("原始标题", item.title || "暂无原始标题");
  const impact = buildReviewNewsDetailBlock("市场影响", item.market_impact || item.rule_reason || "暂无市场影响说明");
  const content = buildReviewNewsDetailBlock("正文", item.content || "暂无正文");

  reviewNewsDetailBox.append(header, meta, tags, summary, origin, impact, content);
  reviewNewsDetailBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buildReviewNewsDetailBlock(label, value) {
  const block = document.createElement("div");
  block.className = "detail-block";
  const title = document.createElement("strong");
  title.textContent = label;
  const text = document.createElement("p");
  text.textContent = value;
  block.append(title, text);
  return block;
}

function setReviewStep(stepKey) {
  state.reviewStep = stepKey;
  reviewStepNav.innerHTML = "";
  const maxReachableIndex = getMaxReachableStepIndex();

  REVIEW_STEPS.forEach((step, index) => {
    const button = document.createElement("button");
    button.type = "button";
    const isActive = step.key === state.reviewStep;
    const isCompleted = isStepComplete(step.key);
    const isLocked = index > maxReachableIndex;
    button.className = `step-chip ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`.trim();
    button.textContent = `${index + 1}. ${step.label}`;
    button.disabled = isLocked;
    if (!isLocked) button.addEventListener("click", () => setReviewStep(step.key));
    reviewStepNav.appendChild(button);
  });

  document.querySelectorAll(".review-step-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.step !== stepKey);
  });

  const index = REVIEW_STEPS.findIndex((step) => step.key === stepKey);
  reviewStepHint.textContent = REVIEW_STEPS[index]?.hint || "";
  prevStepBtn.disabled = index <= 0;
  nextStepBtn.textContent = index === REVIEW_STEPS.length - 1 ? "完成复盘" : "下一步";
  nextStepBtn.disabled = false;
}

function moveReviewStep(delta) {
  const currentIndex = REVIEW_STEPS.findIndex((step) => step.key === state.reviewStep);
  const target = REVIEW_STEPS[currentIndex + delta];
  if (target) setReviewStep(target.key);
}

async function handleNextStep() {
  const currentIndex = REVIEW_STEPS.findIndex((step) => step.key === state.reviewStep);
  if (currentIndex === -1) return;

  if (!validateStep(REVIEW_STEPS[currentIndex])) return;

  if (currentIndex === REVIEW_STEPS.length - 1) {
    await saveReview();
    await fetchJson(`/api/reviews/${state.activeDate}/complete`, { method: "POST" });
    setReviewStatus("reviewed");
    setReviewMode("reviewed");
    if (state.activeBootstrap?.draft) state.activeBootstrap.draft.review_status = "reviewed";
    await Promise.all([loadPendingReviews(), loadReviews()]);
    return;
  }

  setReviewStep(REVIEW_STEPS[currentIndex + 1].key);
}

function getStepValue(step) {
  if (!step) return "";
  if (step.key === "news") {
    const summary = String(reviewForm.elements.namedItem("newsBrief")?.value || "").trim();
    return summary && state.selectedNewsIds.size > 0 ? summary : "";
  }
  return String(reviewForm.elements.namedItem(step.field)?.value || "").trim();
}

function isStepComplete(stepKey) {
  const step = REVIEW_STEPS.find((item) => item.key === stepKey);
  if (!step) return false;
  if (step.optional) return Boolean(getStepValue(step));
  return Boolean(getStepValue(step));
}

function getMaxReachableStepIndex() {
  let maxIndex = 0;
  for (let index = 0; index < REVIEW_STEPS.length - 1; index += 1) {
    if (validateStep(REVIEW_STEPS[index], false)) {
      maxIndex = index + 1;
    } else {
      break;
    }
  }
  return maxIndex;
}

function validateStep(step, showAlert = true) {
  if (!step) return false;
  if (step.key === "news") {
    const summary = String(reviewForm.elements.namedItem("newsBrief")?.value || "").trim();
    if (!state.selectedNewsIds.size) {
      if (showAlert) window.alert("先在新闻汇总里至少勾选一条重点新闻。");
      return false;
    }
    if (!summary) {
      if (showAlert) window.alert("先把新闻汇总写出来，再进入下一步。");
      return false;
    }
    return true;
  }

  if (step.optional) return true;

  const value = String(reviewForm.elements.namedItem(step.field)?.value || "").trim();
  if (!value) {
    if (showAlert) window.alert(`请先完成“${step.label}”这一步。`);
    return false;
  }
  return true;
}

function setReviewStatus(status) {
  reviewStatusBadge.textContent = formatReviewStatus(status);
  reviewStatusBadge.className = `status-pill ${reviewStatusVariant(status)}`.trim();
}

function setReviewMode(status) {
  const readOnly = status === "reviewed";
  reviewActionGroup.classList.toggle("hidden", false);
  prevStepBtn.disabled = readOnly || REVIEW_STEPS.findIndex((step) => step.key === state.reviewStep) <= 0;
  nextStepBtn.disabled = readOnly ? true : false;
  Array.from(reviewForm.elements).forEach((field) => {
    if ("readOnly" in field) field.readOnly = readOnly;
    if ("disabled" in field && field.type !== "hidden") field.disabled = readOnly && field.type === "checkbox";
  });
  saveDraftBtn.disabled = readOnly;
  initializeBtn.textContent = status === "initialized" ? "已初始化" : "重新初始化";
  initializeBtn.disabled = status === "initialized" || status === "reviewed";
  nextStepBtn.textContent = status === "reviewed"
    ? "已复盘"
    : REVIEW_STEPS.findIndex((step) => step.key === state.reviewStep) === REVIEW_STEPS.length - 1
      ? "完成复盘"
      : "下一步";
}

function getDefaultNewsFilters() {
  const data = new FormData(newsFiltersForm);
  if (!data.get("type")) data.set("type", "major");
  return data;
}

function getEffectiveAnalysis(analysis, news) {
  const sections = analysis || {};
  const hasContent = [sections.global_news, sections.market_news, sections.symbol_news, sections.market_analysis]
    .some((value) => String(value || "").trim() && !isGarbageAnalysisSummary(value));
  if (hasContent) return sections;

  const pick = (type) => (news || [])
    .filter((item) => item.type === type)
    .slice(0, 4)
    .map((item) => item.ai_summary || item.title || item.content || "")
    .filter(Boolean)
    .join("\n");
  return {
    global_news: pick("macro"),
    market_news: pick("market"),
    symbol_news: pick("symbol"),
    market_analysis: (news || [])
      .slice(0, 3)
      .map((item) => item.market_impact || item.ai_summary || item.title || "")
      .filter(Boolean)
      .join("；") || "暂无新闻分析，请先运行新闻采集。",
  };
}

function buildDefaultNewsBrief(analysis, news) {
  return buildAiSummaryText(analysis, news);
}

function buildAiSummaryText(analysis, news) {
  const effective = getEffectiveAnalysis(analysis, news);
  const candidate = String(effective.market_analysis || "").trim();
  if (candidate && !isGarbageAnalysisSummary(candidate)) return candidate;

  const parts = [];
  const macroLine = splitLines(effective.global_news)[0] || splitLines(effective.market_news)[0];
  const symbolLine = splitLines(effective.symbol_news)[0];
  const impactLine = topNewsImpact(news);

  if (macroLine) parts.push(`宏观主线：${macroLine}`);
  if (symbolLine) parts.push(`标的主线：${symbolLine}`);
  if (impactLine) parts.push(`市场影响：${impactLine}`);
  return parts.join(" ") || "暂无新闻分析，请先运行新闻采集。";
}

function isGarbageAnalysisSummary(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /^当前保留\s*\d+条/.test(text)
    || /^保留\s*\d+条/.test(text)
    || /其中宏观\s*\d+条/.test(text)
    || /市场\s*\d+条/.test(text)
    || /标的\s*\d+条/.test(text);
}

function sortNewsByStars(news) {
  return [...(news || [])].sort((left, right) => {
    const starDiff = (Number(right.importance_stars) || 0) - (Number(left.importance_stars) || 0);
    if (starDiff) return starDiff;
    return String(right.pub_date || "").localeCompare(String(left.pub_date || ""));
  });
}

function normalizeNewsType(type) {
  return type === "symbol" ? "symbol" : "macro";
}

function groupSymbolNews(news) {
  return news.reduce((groups, item) => {
    const key = getPrimarySymbol(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

function getPrimarySymbol(item) {
  return item.primary_symbol || item.related_symbols?.[0] || "其他标的";
}

function topNewsImpact(news) {
  return sortNewsByStars(news)
    .map((item) => item.market_impact || item.ai_summary || item.title || "")
    .find(Boolean) || "";
}

function topNewsHeadline(news) {
  return sortNewsByStars(news)
    .map((item) => item.ai_summary || item.title || "")
    .find(Boolean) || "";
}

function buildReviewCycle(archiveDate) {
  const open = resolveNyTimeToBeijing(archiveDate, "09:30");
  const close = resolveNyTimeToBeijing(archiveDate, "16:00");
  return {
    nyLabel: `美股交易日 ${archiveDate}`,
    beijingLabel: `北京时间 ${formatBeijingMoment(open)} - ${formatBeijingMoment(close)}`,
  };
}

function resolveNyTimeToBeijing(dateString, targetTime) {
  const [hour, minute] = targetTime.split(":").map(Number);
  const candidates = [13, 14, 20, 21];
  for (const utcHour of candidates) {
    const candidate = new Date(Date.UTC(
      Number(dateString.slice(0, 4)),
      Number(dateString.slice(5, 7)) - 1,
      Number(dateString.slice(8, 10)),
      utcHour,
      minute,
      0,
    ));
    const nyTime = candidate.toLocaleString("en-CA", {
      timeZone: "America/New_York",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).replace(",", "");
    if (nyTime.startsWith(dateString) && nyTime.includes(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`)) {
      return candidate;
    }
  }
  return new Date(`${dateString}T00:00:00Z`);
}

function formatBeijingMoment(date) {
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", "");
}

function updateSelectedNewsField() {
  const field = reviewForm.elements.namedItem("selectedNewsIds");
  if (field) field.value = JSON.stringify([...state.selectedNewsIds]);
}

function parseStoredIds(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function splitLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean);
}

function truncateText(value, limit) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function buildNewsSecondaryText(item) {
  const title = String(item.title || "").trim();
  const summary = String(item.ai_summary || "").trim();
  const content = String(item.content || "").trim();
  if (title && !isDuplicateHeadline(summary, title)) return truncateText(title, 120);
  if (content) return truncateText(content, 120);
  return "暂无补充说明";
}

function buildNewsImpactText(item) {
  return truncateText(item.market_impact || item.rule_reason || buildNewsSecondaryText(item), 90);
}

function buildNewsBodyPreview(item) {
  const content = String(item.content || "").trim();
  if (content) return truncateText(content, 96);
  return truncateText(item.market_impact || item.rule_reason || "暂无正文摘要", 96);
}

function isDuplicateHeadline(summary, title) {
  const normalizedSummary = normalizeHeadlineText(summary);
  const normalizedTitle = normalizeHeadlineText(title);
  return Boolean(normalizedSummary) && normalizedSummary === normalizedTitle;
}

function normalizeHeadlineText(value) {
  return String(value || "")
    .replace(/\s*#\d{8}-\d{2}-\d{2}\s*$/, "")
    .replace(/[：:]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNewsType(type) {
  return NEWS_TYPE_LABELS[type] || type || "未分类";
}

function formatReviewStatus(status) {
  return REVIEW_STATUS_LABELS[status] || status || "编辑中";
}

function reviewStatusVariant(status) {
  if (status === "reviewed") return "success";
  if (status === "initialized") return "highlight";
  return "editing";
}

function formatStarLabel(stars = 0) {
  const value = Math.max(0, Number(stars) || 0);
  return value ? `${"★".repeat(value)} ${value}星` : "0星观察";
}

function formatPrice(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "-";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}
