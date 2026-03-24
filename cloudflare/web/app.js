// ===== snarkdown (inline, ~1KB) — Markdown → HTML =====
const _sdTags={'':['\x3cem>','</em>'],_:['\x3cstrong>','</strong>'],'*':['\x3cstrong>','</strong>'],'~':['\x3cs>','</s>'],'\n':['\x3cbr />'],' ':['\x3cbr />'],'-':['\x3chr />']};
function _sdOutdent(s){return s.replace(RegExp('^'+(s.match(/^(\t| )+/)||'')[0],'gm'),'');}
function _sdEnc(s){return(s+'').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function snarkdown(md,prevLinks){let tok=/((?:^|\n+)(?:\n---+|\* \*(?: \*)+)\n)|(?:^``` *(\w*)\n([\s\S]*?)\n```$)|((?:(?:^|\n+)(?:\t|  {2,}).+)+\n*)|((?:(?:^|\n)([>*+-]|\d+\.)\s+.*)+)|(?:!\[([^\]]*?)\]\(([^)]+?)\))|(\[)|(\](?:\(([^)]+?)\))?)|(?:(?:^|\n+)([^\s].*)\n(-{3,}|={3,})(?:\n+|$))|(?:(?:^|\n+)(#{1,6})\s*(.+)(?:\n+|$))|(?:`([^`].*?)`)|(  \n\n*|\n{2,}|__|\*\*|[_*]|~~)/gm,ctx=[],out='',links=prevLinks||{},last=0,chunk,prev,token,inner,t;function tag(tk){let d=_sdTags[tk[1]||''],e=ctx[ctx.length-1]==tk;if(!d)return tk;if(!d[1])return d[0];if(e)ctx.pop();else ctx.push(tk);return d[e|0];}function flush(){let s='';while(ctx.length)s+=tag(ctx[ctx.length-1]);return s;}md=md.replace(/^\[(.+?)\]:\s*(.+)$/gm,(s,n,u)=>{links[n.toLowerCase()]=u;return '';}).replace(/^\n+|\n+$/g,'');while((token=tok.exec(md))){prev=md.substring(last,token.index);last=tok.lastIndex;chunk=token[0];if(prev.match(/[^\\](\\\\)*\\$/)){}else if(t=(token[3]||token[4])){chunk='\x3cpre class="code '+(token[4]?'poetry':token[2].toLowerCase())+'">\x3ccode'+(token[2]?` class="language-${token[2].toLowerCase()}"`:'')+'>'+_sdOutdent(_sdEnc(t).replace(/^\n+|\n+$/g,''))+'</code></pre>';}else if(t=token[6]){if(t.match(/\./)){token[5]=token[5].replace(/^\d+/gm,'');}inner=snarkdown(_sdOutdent(token[5].replace(/^\s*[>*+.-]/gm,'')));if(t=='>')t='blockquote';else{t=t.match(/\./)?'ol':'ul';inner=inner.replace(/^(.*)(\n|$)/gm,'\x3cli>$1</li>');}chunk='\x3c'+t+'>'+inner+'</'+t+'>';}else if(token[8]){chunk=`\x3cimg src="${_sdEnc(token[8])}" alt="${_sdEnc(token[7])}">`;}else if(token[10]){out=out.replace('\x3ca>',`\x3ca href="${_sdEnc(token[11]||links[prev.toLowerCase()])}">`);chunk=flush()+'</a>';}else if(token[9]){chunk='\x3ca>';}else if(token[12]||token[14]){t='h'+(token[14]?token[14].length:(token[13]>'='?1:2));chunk='\x3c'+t+'>'+snarkdown(token[12]||token[15],links)+'</'+t+'>';}else if(token[16]){chunk='\x3ccode>'+_sdEnc(token[16])+'</code>';}else if(token[17]||token[1]){chunk=tag(token[17]||'--');}out+=prev;out+=chunk;}return(out+md.substring(last)+flush()).replace(/^\n+|\n+$/g,'');}
// ===== end snarkdown =====
// Pre-process user text before snarkdown to avoid misparse
function mdEscape(text) {
  return (text || "")
    // Neutralize standalone [text] so snarkdown doesn't treat it as a link
    .replace(/(?<!!)\[([^\]]+)\](?!\()/g, "⟦$1⟧")
    // Prevent "## 1. text" from becoming h2>ol — escape the dot after number
    .replace(/^(#{1,6}\s+\d+)\./gm, "$1．");
}

const NEWS_SOURCE_LABELS = {
  sina: "新浪",
  cls_cn: "财联社",
  jin10: "金十",
  yahoo_finance: "Yahoo",
  finnhub: "Finnhub",
};

const AKSHARE_SUB_SOURCE_LABELS = {
  cls: "财联社",
  "10jqka": "同花顺",
  sina: "新浪",
  futu: "富途",
};

const FINNHUB_SUB_SOURCE_LABELS = {
  general: "Finnhub",
  company: "Finnhub",
};

function formatNewsSource(source, subSource) {
  if (source === "akshare") {
    return AKSHARE_SUB_SOURCE_LABELS[subSource] || subSource || "AkShare";
  }
  if (source === "finnhub") {
    return FINNHUB_SUB_SOURCE_LABELS[subSource] || "Finnhub";
  }
  return NEWS_SOURCE_LABELS[source] || source || "未知来源";
}

const state = {
  activeView: "reviews",
  activeDate: null,
  activeBootstrap: null,
  newsFilters: null,
  reviewStep: "news",
  reviewStatus: "initialized",
  editMode: false,
  dailyInsight: null,
  homepageInsightSections: [],
  symbolsLoaded: false,
  symbolResolveResult: null,
  keywordsLoaded: false,
  activeKeywordType: "macro",
  readmeLoaded: false,
  newsPage: 1,
  newsPageSize: 20,
  reviewsPage: 1,
  reviewsPageSize: 20,
};

const APP_TOKEN_STORAGE_KEY = "myFinancialAgentApiToken";

const REVIEW_STEPS = [
  { key: "news", label: "新闻总结", field: "reviewerNewsNotes", optional: false, hint: "先看 AI 日总结和重点新闻，再写下你自己的主线判断与点评。" },
  { key: "market", label: "大盘盘点", field: "marketSentiment", optional: false, hint: "只写真正影响大盘的变量，比如美元、利率、VIX 和风险偏好。" },
  { key: "rotation", label: "板块轮动", field: "sectorRotation", optional: false, hint: "把大宗商品和板块强弱写清楚，说明谁领涨、谁承压、资金往哪边走。" },
  { key: "plan", label: "操作计划", field: "assetPlan", optional: false, hint: "针对核心标的和仓位，给出明确计划、触发条件和风险线。" },
  { key: "thinking", label: "深度总结", field: "tradingSummary", optional: true, hint: "最后补深度反思。可选，但如果写了，最好落到可执行的下一步。" },
];

const NEWS_TYPE_LABELS = {
  index: "大盘",
  sector: "板块",
  stock: "个股",
};

const REVIEW_STATUS_LABELS = {
  initialized: "待开始",
  draft: "进行中",
  reviewed: "已复盘",
  missing: "待开始",
};

const SYMBOL_DISPLAY_LABELS = {
  MU: "美光", LITE: "Lumentum", MSFT: "微软", GOOGL: "谷歌",
  GSPC: "标普500", NDX: "纳斯达克100", DJI: "道琼斯",
  VIX: "恐慌指数", HSI: "恒生指数", SSE: "上证指数",
  DXY: "美元指数", GOLD: "黄金", CL: "原油",
  XLK: "科技板块", SOXX: "半导体板块", XLE: "能源板块",
  XLF: "金融板块", XLY: "可选消费",
  // 向后兼容旧 Yahoo 代码
  "^VIX": "恐慌指数", "^HSI": "恒生指数", "^GSPC": "标普500",
  "000001.SS": "上证指数", "DX-Y.NYB": "美元指数", "GC=F": "黄金",
};

const DEFAULT_HOMEPAGE_INSIGHT_SECTIONS = [
  {
    id: "mindset",
    category: "投资心态建设",
    sectionTitle: "投资心态建设 9 步法",
    items: [
      { titleLine: "投资心态建设9步法之第1步", coreQuote: "制定投资计划：核心是屏蔽杂音。在进入市场前，必须明确自己的定位：是做风险投资、技术面、趋势追踪、反弹抄底、套利、定投，还是长期持有？", body: [] },
      { titleLine: "投资心态建设9步法之第2步", coreQuote: "确定理念和方法：对于初级投资者，不需要追求“完美”的方法，而应选择一个使用方便、有效概率较大的方法。", body: ["低胜率：赌博心态、人云亦云。", "可行方法：技术分析、基本面分析、随机漫步（指数化投资）。"] },
      { titleLine: "投资心态建设9步法之第3步", coreQuote: "保持自信：一旦选择了逻辑自洽的方法，必须在心理上完全信任它，否则在市场波动时容易动摇。", body: [] },
      { titleLine: "投资心态建设9步法之第4步", coreQuote: "克服恐惧与贪婪：耐心等待高胜率机会，记住市场上的钱赚不完，但本金一旦亏完就彻底出局。", body: ["耐心：等待高胜率的机会出现。", "认知：市场上的钱是赚不完的，但本金一旦亏完就彻底出局了。"] },
      { titleLine: "投资心态建设9步法之第5步", coreQuote: "心理预演：在实际下单前，先在脑海中模拟各种可能的走势及应对措施，做到“心中有数”。", body: [] },
      { titleLine: "投资心态建设9步法之第6步", coreQuote: "果断行动：当预设的信号出现时，必须立即执行，严禁犹豫不决导致错失良机或陷入被动。", body: [] },
      { titleLine: "投资心态建设9步法之第7步", coreQuote: "头寸管理与动态修正：实时观察市场变化，并根据实际情况对交易计划进行小幅修正，确保方向始终对自己有利。", body: ["实时观察市场变化。", "根据实际情况对交易计划进行小幅修正，确保方向始终对自己有利。"] },
      { titleLine: "投资心态建设9步法之第8步", coreQuote: "严格自律（止盈止损）：绝不轻易放大止损线，真正毁灭性的亏损通常来自一两次不肯止损的大额亏损。", body: ["底线思维：绝不轻易放大止损线。", "风险警示：毁灭性的亏损通常不是来自多次小额亏损，而是源于一两次不肯止损的大额亏损。"] },
      { titleLine: "投资心态建设9步法之第9步", coreQuote: "总结与复盘：交易结束后，无论盈亏都要总结经验，为下一次交易做准备。拒绝内耗，不要活在懊恼与后悔中。", body: [] }
    ]
  },
  {
    id: "truths",
    category: "投资真理",
    sectionTitle: "8 个投资真理",
    items: [
      { titleLine: "8个投资真理之一", coreQuote: "情绪控制：急性子、易冲动者不适合投资。", body: [] },
      { titleLine: "8个投资真理之二", coreQuote: "观望原则：对市场有疑问时，坚决不交易。", body: [] },
      { titleLine: "8个投资真理之三", coreQuote: "客观交易：不靠想象和主观愿望投资。", body: [] },
      { titleLine: "8个投资真理之四", coreQuote: "独立思考：独立判断，不跟随他人意见。", body: [] },
      { titleLine: "8个投资真理之五", coreQuote: "频率控制：严禁过度频繁交易。", body: [] },
      { titleLine: "8个投资真理之六", coreQuote: "学会取舍：不试图抓住每一个机会。", body: [] },
      { titleLine: "8个投资真理之七", coreQuote: "复盘记录：分析不足，记录错误。", body: [] },
      { titleLine: "8个投资真理之八", coreQuote: "专注研究：远离无效社交，屏蔽杂音。", body: [] }
    ]
  }
];

const AI_BADGE_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="geminiSparkGradient" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#4285F4" />
        <stop offset="32%" stop-color="#8E63FF" />
        <stop offset="58%" stop-color="#EA4335" />
        <stop offset="78%" stop-color="#FBBC05" />
        <stop offset="100%" stop-color="#34A853" />
      </linearGradient>
      <linearGradient id="geminiSparkGradientSoft" x1="16" y1="2" x2="22" y2="8" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#8AB4F8" />
        <stop offset="100%" stop-color="#C58AF9" />
      </linearGradient>
    </defs>
    <path fill="url(#geminiSparkGradient)" d="M12 2.4c.37 0 .69.24.8.59l1.31 4.22a3.2 3.2 0 0 0 2.1 2.1l4.22 1.31a.84.84 0 0 1 0 1.6l-4.22 1.31a3.2 3.2 0 0 0-2.1 2.1l-1.31 4.22a.84.84 0 0 1-1.6 0l-1.31-4.22a3.2 3.2 0 0 0-2.1-2.1l-4.22-1.31a.84.84 0 0 1 0-1.6l4.22-1.31a3.2 3.2 0 0 0 2.1-2.1l1.31-4.22c.11-.35.43-.59.8-.59Z"/>
    <path fill="url(#geminiSparkGradientSoft)" d="M18.4 3.2c.18 0 .34.12.39.29l.42 1.36c.13.43.47.77.9.9l1.36.42c.39.12.39.67 0 .79l-1.36.42c-.43.13-.77.47-.9.9l-.42 1.36a.41.41 0 0 1-.79 0l-.42-1.36a1.38 1.38 0 0 0-.9-.9l-1.36-.42a.41.41 0 0 1 0-.79l1.36-.42c.43-.13.77-.47.9-.9l.42-1.36c.05-.17.21-.29.4-.29Z"/>
  </svg>
`;

const newsView = document.querySelector("#newsView");
const reviewsView = document.querySelector("#reviewsView");
const symbolsView = document.querySelector("#symbolsView");
const keywordsView = document.querySelector("#keywordsView");
const readmeView = document.querySelector("#readmeView");
const navButtons = document.querySelectorAll(".nav-chip");
const heroEnvironmentText = document.querySelector("#heroEnvironmentText");
const dailyInsightCategory = document.querySelector("#dailyInsightCategory");
const dailyInsightSummary = document.querySelector("#dailyInsightSummary");
const dailyInsightToggle = document.querySelector("#dailyInsightToggle");
const dailyInsightModal = document.querySelector("#dailyInsightModal");
const dailyInsightBackdrop = document.querySelector("#dailyInsightBackdrop");
const dailyInsightModalCategory = document.querySelector("#dailyInsightModalCategory");
const dailyInsightModalTitle = document.querySelector("#dailyInsightModalTitle");
const dailyInsightModalQuote = document.querySelector("#dailyInsightModalQuote");
const dailyInsightModalContent = document.querySelector("#dailyInsightModalContent");
const closeDailyInsightBtn = document.querySelector("#closeDailyInsightBtn");

const newsFiltersForm = document.querySelector("#newsFiltersForm");
const newsContent = document.querySelector("#newsContent");
const newsList = document.querySelector("#newsList");
const newsSummary = document.querySelector("#newsSummary");
const newsAiHeader = document.querySelector("#newsAiHeader");
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

const reviewsList = document.querySelector("#reviewsList");

// 新闻检索台分页控件
const newsPagination = document.querySelector("#newsPagination");
const newsPrevBtn = document.querySelector("#newsPrevBtn");
const newsNextBtn = document.querySelector("#newsNextBtn");
const newsPageInfo = document.querySelector("#newsPageInfo");
const newsTotalInfo = document.querySelector("#newsTotalInfo");
const newsPageSizeSelect = document.querySelector("#newsPageSizeSelect");

// 复盘工作台分页控件
const reviewsPagination = document.querySelector("#reviewsPagination");
const reviewsPrevBtn = document.querySelector("#reviewsPrevBtn");
const reviewsNextBtn = document.querySelector("#reviewsNextBtn");
const reviewsPageInfo = document.querySelector("#reviewsPageInfo");
const reviewsTotalInfo = document.querySelector("#reviewsTotalInfo");
const reviewsPageSizeSelect = document.querySelector("#reviewsPageSizeSelect");

const reviewDrawer = document.querySelector("#reviewDrawer");
const reviewForm = document.querySelector("#reviewForm");
const archiveDateLabel = document.querySelector("#archiveDateLabel");
const reviewStatusBadge = document.querySelector("#reviewStatusBadge");
const carryForwardLabel = document.querySelector("#carryForwardLabel");
const drawerSubtitle = document.querySelector("#drawerSubtitle");
const pricesBox = document.querySelector("#pricesBox");
const analysisBox = document.querySelector("#analysisBox");
const newsPicker = document.querySelector("#newsPicker");
const reviewStepNav = document.querySelector("#reviewStepNav");
const reviewStepHint = document.querySelector("#reviewStepHint");
const saveDraftBtn = document.querySelector("#saveDraftBtn");
const initializeBtn = document.querySelector("#initializeBtn");
const reviewActionGroup = document.querySelector("#reviewActionGroup");
const prevStepBtn = document.querySelector("#prevStepBtn");
const nextStepBtn = document.querySelector("#nextStepBtn");
const reviewModalFooter = document.querySelector(".review-modal-footer");

navButtons.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelector("#refreshNewsBtn").addEventListener("click", () => loadNewsList(null, true));
document.querySelector("#resetNewsFiltersBtn").addEventListener("click", () => {
  newsFiltersForm.reset();
  loadNewsList(null, true);
});
newsFiltersForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadNewsList(new FormData(newsFiltersForm), true);
});
newsPrevBtn.addEventListener("click", () => { state.newsPage--; loadNewsList(); });
newsNextBtn.addEventListener("click", () => { state.newsPage++; loadNewsList(); });
newsPageSizeSelect.addEventListener("change", () => {
  state.newsPageSize = Number(newsPageSizeSelect.value);
  state.newsPage = 1;
  loadNewsList();
});

document.querySelector("#refreshReviewsBtn").addEventListener("click", () => loadReviews(null, true));
document.querySelector("#filtersForm").addEventListener("submit", (event) => {
  event.preventDefault();
  loadReviews(new FormData(event.currentTarget), true);
});
reviewsPrevBtn.addEventListener("click", () => { state.reviewsPage--; loadReviews(); });
reviewsNextBtn.addEventListener("click", () => { state.reviewsPage++; loadReviews(); });
reviewsPageSizeSelect.addEventListener("change", () => {
  state.reviewsPageSize = Number(reviewsPageSizeSelect.value);
  state.reviewsPage = 1;
  loadReviews();
});

saveDraftBtn.addEventListener("click", async () => {
  if (!state.activeDate) return;
  await saveReview();
});

initializeBtn.addEventListener("click", () => {
  if (!state.activeDate || state.reviewStatus !== "reviewed") return;
  state.editMode = !state.editMode;
  applyEditMode(state.editMode);
});

prevStepBtn.addEventListener("click", () => moveReviewStep(-1));
nextStepBtn.addEventListener("click", async () => {
  await handleNextStep();
});

closeNewsDetailBtn.addEventListener("click", closeNewsDetail);
newsDetailBackdrop.addEventListener("click", closeNewsDetail);
document.querySelector("#closeDrawerBtn").addEventListener("click", closeDrawer);
document.querySelector("#closeDrawerBackdrop").addEventListener("click", closeDrawer);
closeDailyInsightBtn.addEventListener("click", closeDailyInsightModal);
dailyInsightBackdrop.addEventListener("click", closeDailyInsightModal);
window.addEventListener("resize", scheduleDailyInsightSummaryLayout);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!newsDetailModal.classList.contains("hidden")) closeNewsDetail();
    if (!reviewDrawer.classList.contains("hidden")) closeDrawer();
    if (!dailyInsightModal.classList.contains("hidden")) closeDailyInsightModal();
  }
});

dailyInsightToggle.addEventListener("click", () => {
  openDailyInsightModal();
});

document.querySelector("#refreshSymbolsBtn")?.addEventListener("click", () => loadSymbols(true));
document.querySelector("#symbolResolveBtn")?.addEventListener("click", resolveSymbolInput);
document.querySelector("#symbolManualAddBtn")?.addEventListener("click", () => showSymbolForm());
document.querySelector("#symbolResolveInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); resolveSymbolInput(); }
});

switchView("reviews");
loadHeroEnvironment();
decorateAiHeaders();
initializeHomepageInsights();
initRichTooltips();
loadNewsList();
loadReviews();

function initRichTooltips() {
  document.querySelectorAll(".tip-trigger.tip-rich").forEach((trigger) => {
    const bubble = trigger.querySelector(".bubble");
    if (!bubble) return;
    let hideTimer = null;
    const show = () => { clearTimeout(hideTimer); trigger.classList.add("tip-active"); };
    const hide = (delay = 150) => { hideTimer = setTimeout(() => trigger.classList.remove("tip-active"), delay); };
    trigger.addEventListener("mouseenter", show);
    trigger.addEventListener("mouseleave", () => hide(300));
    bubble.addEventListener("mouseenter", show);
    bubble.addEventListener("mouseleave", () => hide(0));
  });
}

function switchView(view) {
  state.activeView = view;
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  newsView.classList.toggle("active", view === "news");
  reviewsView.classList.toggle("active", view === "reviews");
  if (symbolsView) symbolsView.classList.toggle("active", view === "symbols");
  if (keywordsView) keywordsView.classList.toggle("active", view === "keywords");
  if (readmeView) readmeView.classList.toggle("active", view === "readme");
  if (view === "symbols" && !state.symbolsLoaded) loadSymbols();
  if (view === "keywords" && !state.keywordsLoaded) loadKeywords();
  if (view === "readme" && !state.readmeLoaded) renderReadme();
}

async function loadHeroEnvironment() {
  try {
    const data = await fetchJson("/api/health");
    heroEnvironmentText.dataset.env = data.env || "unknown";
    heroEnvironmentText.textContent = formatEnvironmentLabel(data.env || "unknown");
  } catch (error) {
    heroEnvironmentText.dataset.env = "unknown";
    heroEnvironmentText.textContent = "环境读取失败";
  }
}

async function initializeHomepageInsights() {
  state.homepageInsightSections = await loadHomepageInsightSections();
  renderDailyInvestmentInsight();
}

async function loadHomepageInsightSections() {
  try {
    const response = await fetch("/content/homepage_content.json", { cache: "no-store" });
    if (!response.ok) throw new Error("homepage content unavailable");
    const data = await response.json();
    const sections = Array.isArray(data?.insightSections) ? data.insightSections : [];
    return sections.length ? sections : DEFAULT_HOMEPAGE_INSIGHT_SECTIONS;
  } catch (error) {
    return DEFAULT_HOMEPAGE_INSIGHT_SECTIONS;
  }
}

function renderDailyInvestmentInsight() {
  const insight = pickDailyInsight();
  state.dailyInsight = insight;
  dailyInsightCategory.textContent = insight.category;
  dailyInsightSummary.textContent = insight.coreQuote;
  dailyInsightSummary.title = insight.coreQuote;
  scheduleDailyInsightSummaryLayout();
}

let dailyInsightLayoutFrame = 0;

function scheduleDailyInsightSummaryLayout() {
  if (dailyInsightLayoutFrame) {
    window.cancelAnimationFrame(dailyInsightLayoutFrame);
  }
  dailyInsightLayoutFrame = window.requestAnimationFrame(() => {
    dailyInsightLayoutFrame = 0;
    adaptDailyInsightSummaryLayout();
  });
}

function adaptDailyInsightSummaryLayout() {
  if (!dailyInsightSummary) return;
  dailyInsightSummary.classList.remove("is-wrap");

  const parent = dailyInsightSummary.parentElement;
  if (!parent) return;

  if (dailyInsightSummary.scrollWidth <= dailyInsightSummary.clientWidth + 2) return;

  const stillOverflowing =
    dailyInsightSummary.scrollWidth > dailyInsightSummary.clientWidth + 2 ||
    dailyInsightSummary.getBoundingClientRect().right > parent.getBoundingClientRect().right + 2;

  if (!stillOverflowing) return;
  dailyInsightSummary.classList.add("is-wrap");
}

function decorateAiHeaders() {
  if (newsAiHeader) {
    newsAiHeader.replaceChildren("AI 摘要", buildAiBadge());
  }
}

function pickDailyInsight() {
  const items = state.homepageInsightSections.flatMap((section) =>
    (section.items || []).map((item) => ({
      ...item,
      category: section.category,
      sectionId: section.id,
      sectionTitle: section.sectionTitle,
    }))
  );
  const source = items.length ? items : DEFAULT_HOMEPAGE_INSIGHT_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({
      ...item,
      category: section.category,
      sectionId: section.id,
      sectionTitle: section.sectionTitle,
    }))
  );
  return source[Math.floor(Math.random() * source.length)];
}

function formatEnvironmentLabel(env) {
  if (env === "prod") return "生产环境";
  if (env === "test") return "测试环境";
  return `未知环境${env ? ` · ${env}` : ""}`;
}

function openDailyInsightModal() {
  const insight = state.dailyInsight || pickDailyInsight();
  const section = state.homepageInsightSections.find((item) => item.id === insight.sectionId)
    || DEFAULT_HOMEPAGE_INSIGHT_SECTIONS.find((item) => item.id === insight.sectionId)
    || DEFAULT_HOMEPAGE_INSIGHT_SECTIONS[0];
  dailyInsightModalCategory.textContent = section.category;
  dailyInsightModalTitle.textContent = section.sectionTitle;
  dailyInsightModalQuote.innerHTML = "";
  dailyInsightModalContent.innerHTML = "";

  (section.items || []).forEach((item) => {
    const block = document.createElement("article");
    block.className = "daily-insight-entry";

    const title = document.createElement("h4");
    title.textContent = item.titleLine;

    const quote = document.createElement("p");
    quote.className = "daily-insight-entry-quote";
    quote.innerHTML = `<strong>${escapeHtml(item.coreQuote)}</strong>`;

    block.append(title, quote);

    if (item.body?.length) {
      const list = document.createElement("ul");
      item.body.forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        list.appendChild(li);
      });
      block.appendChild(list);
    }

    dailyInsightModalContent.appendChild(block);
  });
  dailyInsightModal.classList.remove("hidden");
}

function closeDailyInsightModal() {
  dailyInsightModal.classList.add("hidden");
}

async function loadNewsList(formData = null, resetPage = false) {
  if (resetPage) state.newsPage = 1;
  newsList.innerHTML = `<tr><td colspan="5" class="table-empty">加载中...</td></tr>`;
  const params = new URLSearchParams();
  const sourceData = formData || getDefaultNewsFilters();
  for (const [key, value] of sourceData.entries()) {
    if (key === "starsMin") {
      const min = Number(value);
      if (min >= 1 && min <= 5) {
        for (let s = min; s <= 5; s++) params.append("stars", s);
      }
    } else if (value) {
      params.append(key, value);
    }
  }
  state.newsFilters = params;
  params.set("page", state.newsPage);
  params.set("pageSize", state.newsPageSize);

  const query = `?${params.toString()}`;
  try {
    const data = await fetchJson(`/api/news${query}`);
    newsList.innerHTML = "";
    if (!data.items.length) {
      newsList.innerHTML = `<tr><td colspan="5" class="table-empty">没有查到匹配新闻</td></tr>`;
      newsSummary.textContent = "共 0 条";
      newsPagination.classList.add("hidden");
      return;
    }
    data.items.forEach((item) => newsList.appendChild(buildNewsRow(item)));
    renderNewsPagination(data);
  } catch (error) {
    newsSummary.textContent = "加载失败";
    newsList.innerHTML = `<tr><td colspan="5" class="table-empty">新闻加载失败: ${error.message}</td></tr>`;
    newsPagination.classList.add("hidden");
  }
}

function renderNewsPagination(data) {
  const { total = 0, page = 1, totalPages = 1 } = data;
  newsSummary.textContent = `共 ${total} 条`;
  if (total === 0) {
    newsPagination.classList.add("hidden");
    return;
  }
  newsPagination.classList.remove("hidden");
  newsPageInfo.textContent = `${page} / ${totalPages} 页`;
  newsTotalInfo.textContent = `共 ${total} 条`;
  newsPrevBtn.disabled = page <= 1;
  newsNextBtn.disabled = page >= totalPages;
  state.newsPage = page;
}

async function loadNewsDetail(id) {
  const data = await fetchJson(`/api/news/${id}`);
  openNewsDetailFromItem(data.item);
}

function openNewsDetailFromItem(item) {
  newsDetailCard.classList.remove("hidden");
  newsDetailModal.classList.remove("hidden");
  newsDetailMeta.textContent = "";
  newsDetailMeta.classList.add("hidden");
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

  const aiHeading = newsDetailCard.querySelector(".detail-featured strong");
  if (aiHeading) {
    aiHeading.replaceChildren("AI 摘要", buildAiBadge());
  }
  const impactHeading = newsDetailCard.querySelector(".accent-block strong");
  if (impactHeading) {
    impactHeading.replaceChildren("市场影响", buildAiBadge());
  }

  const tags = [
    buildChip(item.pub_date || "未知时间", "detail-meta-chip"),
    ...(item.source ? [buildChip(formatNewsSource(item.source, item.sub_source), "detail-meta-chip")] : []),
    buildChip(formatStarLabel(item.importance_stars), starChipVariant(item.importance_stars)),
    buildChip(formatNewsType(item.type)),
    ...(item.related_symbols || []).map((symbol) => buildChip(symbol)),
  ].filter(Boolean);
  tags.forEach((tag) => newsDetailTags.appendChild(tag));
}

function closeNewsDetail() {
  newsDetailModal.classList.add("hidden");
}

async function loadReviews(formData = null, resetPage = false) {
  if (resetPage) state.reviewsPage = 1;
  reviewsList.innerHTML = `<tr><td colspan="7" class="table-empty">加载中...</td></tr>`;
  const params = new URLSearchParams();
  if (formData) {
    for (const [key, value] of formData.entries()) {
      if (value) params.set(key, value);
    }
  }
  state.reviewsFilters = params;
  params.set("page", state.reviewsPage);
  params.set("pageSize", state.reviewsPageSize);

  const query = `?${params.toString()}`;
  try {
    const data = await fetchJson(`/api/reviews${query}`);
    reviewsList.innerHTML = "";
    if (!data.items.length) {
      reviewsList.innerHTML = `<tr><td colspan="7" class="table-empty">还没有复盘记录</td></tr>`;
      reviewsPagination.classList.add("hidden");
      return;
    }
    data.items.forEach((item) => reviewsList.appendChild(buildReviewRow(item)));
    renderReviewsPagination(data);
  } catch (error) {
    reviewsList.innerHTML = `<tr><td colspan="7" class="table-empty">查询失败: ${error.message}</td></tr>`;
    reviewsPagination.classList.add("hidden");
  }
}

function renderReviewsPagination(data) {
  const { total = 0, page = 1, totalPages = 1 } = data;
  if (total === 0) {
    reviewsPagination.classList.add("hidden");
    return;
  }
  reviewsPagination.classList.remove("hidden");
  reviewsPageInfo.textContent = `${page} / ${totalPages} 页`;
  reviewsTotalInfo.textContent = `共 ${total} 条`;
  reviewsPrevBtn.disabled = page <= 1;
  reviewsNextBtn.disabled = page >= totalPages;
  state.reviewsPage = page;
}

async function openReviewDrawer(archiveDate) {
  const data = await fetchJson(`/api/reviews/${archiveDate}/bootstrap`);
  state.activeDate = archiveDate;
  state.activeBootstrap = data;

  const cycle = buildReviewCycle(archiveDate);
  archiveDateLabel.textContent = `${archiveDate} · 美股交易日`;
  document.querySelector("#priceSnapshotLabel").textContent = `${archiveDate} 核心标的与指数`;
  drawerSubtitle.textContent = `${cycle.beijingLabel} ｜ 新闻窗口（北京时间） ${formatNewsWindowBoundaryBeijing(data.newsWindow.start)} → ${formatNewsWindowBoundaryBeijing(data.newsWindow.end)}`;
  carryForwardLabel.textContent = "";
  carryForwardLabel.style.display = "none";

  const reviewStatus = data.draft?.review_status || "initialized";
  state.editMode = reviewStatus !== "reviewed";
  setReviewStatus(reviewStatus);

  const effectiveAnalysis = getEffectiveAnalysis(data.analysis, data.news);
  const snapshotCard = document.querySelector(".review-snapshot-card");
  const rawPrices = data.pricesByType || data.prices;
  const filteredPrices = {};
  if (rawPrices && typeof rawPrices === "object" && !Array.isArray(rawPrices)) {
    for (const [key, items] of Object.entries(rawPrices)) {
      filteredPrices[key] = (items || []).filter((p) => p.k_date === archiveDate);
    }
  }
  const hasAny = Object.values(filteredPrices).some((arr) => arr.length > 0);
  if (hasAny) {
    snapshotCard.classList.remove("hidden");
    renderPrices(filteredPrices);
  } else {
    snapshotCard.classList.add("hidden");
  }
  renderAnalysis(effectiveAnalysis, data.news);
  renderNewsPicker(data.news);

  applyFormValues({
    reviewerNewsNotes: data.draft?.reviewer_news_notes || data.draft?.news_brief || buildDefaultNewsBrief(data.analysis, data.news),
    marketSentiment: data.draft?.market_sentiment || data.carryForward?.market_sentiment || "",
    sectorRotation: data.draft?.sector_rotation || data.carryForward?.sector_rotation || "",
    assetPlan: data.draft?.asset_plan || data.carryForward?.asset_plan || "",
    tradingSummary: data.draft?.trading_summary || "",
  });

  initMdTabs();
  setReviewMode(reviewStatus);
  setReviewStep("news");
  reviewDrawer.classList.remove("hidden");
}

function closeDrawer() {
  reviewDrawer.classList.add("hidden");
}

async function saveReview() {
  const payload = Object.fromEntries(new FormData(reviewForm).entries());
  payload.reviewStatus = state.activeBootstrap?.draft?.review_status || "initialized";

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
      reviewer_news_notes: payload.reviewerNewsNotes,
      market_sentiment: payload.marketSentiment,
      sector_rotation: payload.sectorRotation,
      asset_plan: payload.assetPlan,
      trading_summary: payload.tradingSummary,
    },
  };
  if (state.reviewStatus === "reviewed" && state.editMode) {
    state.editMode = false;
    setReviewMode("reviewed");
  }
  await loadReviews();
}

function buildNewsRow(item) {
  const row = document.createElement("tr");
  row.className = "news-row";

  const timeCell = document.createElement("td");
  const pubDate = item.pub_date || "";
  const dateDisplay = pubDate.slice(0, 10) || "未知日期";
  const timeDisplay = pubDate.length >= 16 ? pubDate.slice(11, 16) : (pubDate || "未知时间");
  timeCell.innerHTML = `<strong>${escapeHtml(dateDisplay)}</strong><small>${escapeHtml(timeDisplay)} · ${escapeHtml(formatNewsSource(item.source, item.sub_source))}</small>`;

  const summaryCell = document.createElement("td");
  summaryCell.className = "news-summary-cell";
  const summaryTitle = document.createElement("strong");
  summaryTitle.className = "news-ai-summary-title";
  summaryTitle.textContent = item.ai_summary || item.title || "无标题";
  const summaryText = document.createElement("p");
  summaryText.textContent = buildNewsImpactText(item);
  summaryCell.append(summaryTitle, summaryText);

  const impactCell = document.createElement("td");
  impactCell.className = "news-impact-cell";
  impactCell.innerHTML = `<p>${escapeHtml(buildNewsBodyPreview(item))}</p>`;

  const tagsCell = document.createElement("td");
  tagsCell.className = "news-tags-cell";
  const chips = [
    buildChip(formatStarLabel(item.importance_stars), starChipVariant(item.importance_stars)),
    buildChip(formatNewsType(item.type)),
    ...(item.related_symbols || []).map((symbol) => buildChip(symbol)),
  ];
  const primaryRow = document.createElement("div");
  primaryRow.className = "chip-row compact centered nowrap";
  const maxVisibleChips = 3;
  chips.slice(0, maxVisibleChips).forEach((chip) => primaryRow.appendChild(chip));
  tagsCell.appendChild(primaryRow);

  if (chips.length > maxVisibleChips) {
    const overflowLabels = [
      formatStarLabel(item.importance_stars),
      formatNewsType(item.type),
      ...(item.related_symbols || []),
    ].slice(maxVisibleChips);
    const overflowRow = document.createElement("div");
    overflowRow.className = "chip-row compact centered overflow-row";
    const overflowChip = buildChip("⌄", "ellipsis ellipsis-arrow");
    overflowChip.dataset.tooltip = overflowLabels.join(" / ");
    overflowChip.setAttribute("aria-label", `剩余标签：${overflowLabels.join("，")}`);
    overflowRow.appendChild(overflowChip);
    tagsCell.appendChild(overflowRow);
  }

  const actionCell = document.createElement("td");
  actionCell.className = "news-action-cell";
  const button = document.createElement("button");
  button.className = "ghost";
  button.textContent = "查看详情";
  button.addEventListener("click", () => loadNewsDetail(item.id));
  actionCell.appendChild(button);

  row.append(timeCell, summaryCell, impactCell, tagsCell, actionCell);
  return row;
}

function renderMdCell(text, maxLen) {
  const raw = (text || "").trim();
  if (!raw) return "待补充";
  // Only show # headings in list view, skip ## and deeper
  const headings = raw.split("\n")
    .filter(line => /^#\s+/.test(line.trim()))
    .map(line => line.trim().replace(/^#\s+/, ""))
    .filter(Boolean);
  if (!headings.length) return escapeHtml(truncateText(raw, maxLen || 70));
  return escapeHtml(truncateText(headings.join(" | "), maxLen || 70));
}

function buildReviewRow(item) {
  const cycle = buildReviewCycle(item.archive_date);
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><strong>${item.archive_date}</strong><small>${formatReviewWindowLabel(cycle)}</small></td>
    <td class="md-cell">${renderMdCell(item.market_sentiment, 70)}</td>
    <td class="md-cell">${renderMdCell(item.sector_rotation, 70)}</td>
    <td class="md-cell">${renderMdCell(item.asset_plan, 70)}</td>
    <td></td>
    <td></td>
  `;
  const statusCell = row.children[4];
  statusCell.appendChild(buildChip(formatReviewStatus(item.review_status || "draft"), reviewStatusVariant(item.review_status)));

  const actionCell = row.children[5];
  const button = document.createElement("button");
  button.className = "ghost compact-button";
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

function starChipVariant(stars = 0) {
  const value = Math.max(0, Number(stars) || 0);
  if (value >= 5) return "star-5";
  if (value >= 4) return "star-4";
  if (value >= 3) return "star-3";
  return "star-low";
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

function initMdTabs() {
  reviewForm.querySelectorAll("textarea").forEach((ta) => {
    if (ta.parentElement.querySelector(".md-tab-bar")) return;
    const bar = document.createElement("div");
    bar.className = "md-tab-bar";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "md-tab active";
    editBtn.textContent = "编辑";
    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "md-tab";
    previewBtn.textContent = "预览";
    bar.append(editBtn, previewBtn);

    const preview = document.createElement("div");
    preview.className = "md-preview hidden";

    ta.parentElement.insertBefore(bar, ta);
    ta.parentElement.insertBefore(preview, ta.nextSibling);

    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.reviewStatus === "reviewed" && !state.editMode) return;
      editBtn.classList.add("active");
      previewBtn.classList.remove("active");
      ta.classList.remove("hidden");
      preview.classList.add("hidden");
    });
    previewBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.reviewStatus === "reviewed" && !state.editMode) return;
      previewBtn.classList.add("active");
      editBtn.classList.remove("active");
      preview.innerHTML = snarkdown(mdEscape(ta.value)) || '<span class="muted">暂无内容</span>';
      ta.classList.add("hidden");
      preview.classList.remove("hidden");
    });
    // Prevent label click from focusing hidden textarea in readonly mode
    preview.addEventListener("click", (e) => {
      if (state.reviewStatus === "reviewed" && !state.editMode) e.preventDefault();
    });
  });
}

function syncMdPreviews(readOnly) {
  reviewForm.querySelectorAll("textarea").forEach((ta) => {
    const preview = ta.parentElement.querySelector(".md-preview");
    const bar = ta.parentElement.querySelector(".md-tab-bar");
    if (!preview || !bar) return;
    if (readOnly) {
      preview.innerHTML = snarkdown(mdEscape(ta.value)) || '<span class="muted">暂无内容</span>';
      ta.classList.add("hidden");
      preview.classList.remove("hidden");
      bar.classList.add("hidden");
    } else {
      const editBtn = bar.querySelector(".md-tab");
      const previewBtn = bar.querySelectorAll(".md-tab")[1];
      if (editBtn) editBtn.classList.add("active");
      if (previewBtn) previewBtn.classList.remove("active");
      ta.classList.remove("hidden");
      preview.classList.add("hidden");
      bar.classList.remove("hidden");
    }
  });
}

function buildPriceCard(item) {
  const card = document.createElement("article");
  const raw = Number(item.change_percent ?? 0);
  const dir = raw > 0 ? "up" : raw < 0 ? "down" : "";
  card.className = `price-card ${dir}`.trim();
  const name = document.createElement("div");
  name.className = "price-card-name";
  const title = document.createElement("strong");
  title.textContent = formatPriceDisplayName(item);
  const symbol = document.createElement("span");
  symbol.className = "price-card-symbol";
  symbol.textContent = item?.symbol || "-";
  name.append(title, symbol);
  const price = document.createElement("div");
  price.className = "price-value";
  price.textContent = formatPrice(item.current_price);
  const change = document.createElement("div");
  change.className = `price-change ${dir}`.trim();
  change.textContent = `${raw > 0 ? "+" : ""}${Number.isFinite(raw) ? raw.toFixed(2) : "-"}%`;
  card.append(name, price, change);
  return card;
}

function buildPriceSummaryLine(items) {
  return items
    .slice(0, 4)
    .map((item) => {
      const label = item.display_name || item.stock_name || item.symbol;
      const raw = Number(item.change_percent ?? 0);
      const sign = raw > 0 ? "+" : "";
      const pct = Number.isFinite(raw) ? `${sign}${raw.toFixed(1)}%` : "-";
      return `${label} ${pct}`;
    })
    .join("  ·  ");
}

function renderPrices(prices) {
  pricesBox.innerHTML = "";
  pricesBox.classList.remove("price-sections-compact");
  delete pricesBox.dataset.sectionCount;

  // 方案 A: 点击「复盘日价格」标题区折叠/展开全部
  const snapshotHead = pricesBox.closest(".review-snapshot-card")?.querySelector(".snapshot-head");
  if (snapshotHead && !snapshotHead.dataset.collapseInit) {
    snapshotHead.dataset.collapseInit = "1";
    snapshotHead.style.cursor = "pointer";
    snapshotHead.style.userSelect = "none";
    const hint = document.createElement("span");
    hint.className = "price-collapse-hint";
    hint.textContent = "▾ 点击折叠";
    snapshotHead.appendChild(hint);
    snapshotHead.addEventListener("click", () => {
      const allDetails = pricesBox.querySelectorAll("details.price-section");
      if (!allDetails.length) return;
      const anyOpen = [...allDetails].some((d) => d.open);
      allDetails.forEach((d) => d.open = !anyOpen);
      ["priceSectionIndex", "priceSectionSector", "priceSectionStock"].forEach(
        (k) => localStorage.setItem(k, anyOpen ? "closed" : "open")
      );
      hint.textContent = anyOpen ? "▸ 点击展开" : "▾ 点击折叠";
    });
  }

  // Sectioned display: { index: [...], sector: [...], stock: [...] }
  if (prices && !Array.isArray(prices) && typeof prices === "object") {
    const sections = [
      { key: "index",  label: "大盘分析",    storageKey: "priceSectionIndex" },
      { key: "sector", label: "板块分析",    storageKey: "priceSectionSector" },
      { key: "stock",  label: "个股深度研究", storageKey: "priceSectionStock" },
    ];
    let hasAny = false;
    let visibleSections = 0;
    sections.forEach(({ key, label, storageKey }) => {
      const items = prices[key] || [];
      if (!items.length) return;
      hasAny = true;
      visibleSections += 1;
      pricesBox.classList.add("price-sections-compact");

      const details = document.createElement("details");
      details.className = "price-section";
      details.open = true;
      details.addEventListener("toggle", () => {
        localStorage.setItem(storageKey, details.open ? "open" : "closed");
      });

      const summary = document.createElement("summary");
      summary.className = "price-section-head";
      const titleSpan = document.createElement("span");
      titleSpan.textContent = label;
      const summaryLine = document.createElement("span");
      summaryLine.className = "price-section-summary";
      summaryLine.textContent = buildPriceSummaryLine(items);
      summary.append(titleSpan, summaryLine);

      const list = document.createElement("div");
      list.className = "price-list";
      items.forEach((item) => list.appendChild(buildPriceCard(item)));

      const body = document.createElement("div");
      body.className = "price-section-body";
      body.appendChild(list);

      details.append(summary, body);
      pricesBox.appendChild(details);
    });
    if (visibleSections) {
      pricesBox.dataset.sectionCount = String(visibleSections);
    }
    if (!hasAny) pricesBox.innerHTML = `<div class="empty-state">暂无价格数据</div>`;
    return;
  }

  // Flat array fallback
  if (!prices?.length) {
    pricesBox.innerHTML = `<div class="empty-state">暂无价格数据</div>`;
    return;
  }
  prices.forEach((item) => pricesBox.appendChild(buildPriceCard(item)));
}

function renderAnalysis(analysis, news) {
  const effective = getEffectiveAnalysis(analysis, news);
  analysisBox.innerHTML = "";

  const summary = document.createElement("section");
  summary.className = "analysis-summary";
  const eyebrow = document.createElement("span");
  eyebrow.className = "eyebrow";
  eyebrow.append("每日新闻总结", buildAiBadge());
  const paragraph = document.createElement("p");
  paragraph.textContent = formatHashNumberedText(effective?.daily_major_events || "暂无");
  summary.append(eyebrow, paragraph);
  analysisBox.appendChild(summary);

  const chain = String(effective?.linkage_logic_chain || "").trim();
  const split = splitAnalysisByType(effective?.sector_impact_map);
  const hasAiLines = split.index.length || split.sector.length || split.stock.length || split.untagged.length;

  if (chain || hasAiLines) {
    const outline = document.createElement("section");
    outline.className = "analysis-outline";

    if (hasAiLines) {
      const card = document.createElement("article");
      card.className = "analysis-outline-card";
      const title = document.createElement("strong");
      title.append("市场影响", buildAiBadge());
      const allLines = [
        ...split.index.map((l) => l),
        ...split.sector.map((l) => l),
        ...split.stock.map((l) => l),
        ...split.untagged.map((l) => l),
      ];
      const body = document.createElement("p");
      body.textContent = formatNumberedText(allLines.join("\n"));
      card.append(title, body);
      outline.appendChild(card);
    }

    if (chain) {
      const card = document.createElement("article");
      card.className = "analysis-outline-card";
      const title = document.createElement("strong");
      title.append("逻辑链", buildAiBadge());
      const body = document.createElement("p");
      body.textContent = formatNumberedText(chain);
      card.append(title, body);
      outline.appendChild(card);
    }

    analysisBox.appendChild(outline);
  }
}

function buildAiBadge() {
  const badge = document.createElement("span");
  badge.className = "ai-badge";
  badge.innerHTML = `${AI_BADGE_ICON}<span class="sr-only">AI生成</span>`;
  return badge;
}

function renderNewsPicker(news) {
  newsPicker.innerHTML = "";
  if (!(news || []).length) {
    newsPicker.innerHTML = `<div class="empty-state">当前没有可纳入复盘的重点新闻。</div>`;
    return;
  }

  const sorted = sortNewsByStars(news);
  const collapseNewsSections = true;

  const indexNews = sorted.filter((item) => normalizeNewsType(item.type) === "index");
  const sectorNews = sorted.filter((item) => normalizeNewsType(item.type) === "sector");
  const stockNews = sorted.filter((item) => normalizeNewsType(item.type) === "stock");

  const newsTypeSections = [
    { key: "index",  label: "大盘新闻",  items: indexNews,  emptyText: "当前没有大盘新闻。",  groupBy: false },
    { key: "sector", label: "板块新闻",  items: sectorNews, emptyText: "当前没有板块新闻。",  groupBy: false },
    { key: "stock",  label: "个股新闻",  items: stockNews,  emptyText: "当前没有个股新闻。",  groupBy: true  },
  ];

  newsTypeSections.forEach(({ label, items, emptyText, groupBy }) => {
    const section = document.createElement(collapseNewsSections ? "details" : "section");
    section.className = "review-news-section review-news-overview";
    if (collapseNewsSections) section.open = false;
    const head = document.createElement(collapseNewsSections ? "summary" : "div");
    head.className = "review-news-section-head";
    head.innerHTML = `<h4>${label}</h4><small>${items.length} 条</small>`;

    section.appendChild(head);

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = emptyText;
      section.appendChild(empty);
    } else if (groupBy) {
      Object.entries(groupSymbolNews(items)).forEach(([symbol, group]) => {
        section.appendChild(buildReviewNewsGroup(symbol, group, collapseNewsSections));
      });
    } else {
      section.appendChild(buildReviewNewsGroup(label, items, collapseNewsSections));
    }
    newsPicker.appendChild(section);
  });
}

function buildReviewNewsGroup(title, items, expanded = false) {
  const container = document.createElement(expanded ? "article" : "details");
  container.className = "symbol-group";
  if (!expanded) container.open = false;

  const head = document.createElement(expanded ? "div" : "summary");
  head.className = "symbol-group-head";
  head.innerHTML = `<span>${escapeHtml(title)}</span><small>${items.length} 条 · 最高 ${formatStarLabel(items[0]?.importance_stars || 0)}</small>`;
  container.appendChild(head);

  const body = document.createElement("div");
  body.className = "review-news-group-body";
  items.forEach((item) => body.appendChild(buildReviewNewsItem(item)));
  container.appendChild(body);
  return container;
}

function buildReviewNewsItem(item) {
  const article = document.createElement("article");
  article.className = "review-news-item";

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
  time.textContent = `${item.pub_date || "未知时间"} · ${formatNewsSource(item.source, item.sub_source)}`;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost";
  button.textContent = "查看新闻";
  button.addEventListener("click", () => openNewsDetailFromItem(item));
  foot.append(time, button);

  body.append(title, meta, impact, foot);
  article.append(body);
  return article;
}

function showReviewNewsFallback(item) {
  openNewsDetailFromItem(item);
}

function setReviewStep(stepKey = null) {
  if (stepKey) state.reviewStep = stepKey;
  reviewStepNav.innerHTML = "";
  const maxReachableIndex = getMaxReachableStepIndex();
  const reviewedMode = state.reviewStatus === "reviewed" && !state.editMode;
  reviewStepNav.classList.toggle("reviewed-mode", reviewedMode);

  REVIEW_STEPS.forEach((step, index) => {
    const button = document.createElement("button");
    button.type = "button";
    const isActive = step.key === state.reviewStep;
    const isCompleted = isStepComplete(step.key);
    const isLocked = index > maxReachableIndex;
    button.className = `step-chip ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`.trim();
    button.textContent = `${index + 1}. ${step.label}`;
    button.disabled = reviewedMode ? false : isLocked;
    if (!button.disabled) {
      button.addEventListener("click", () => {
        setReviewStep(step.key);
        if (reviewedMode) scrollToReviewStep(step.key);
      });
    }
    reviewStepNav.appendChild(button);
  });

  document.querySelectorAll(".review-step-panel").forEach((panel) => {
    const shouldShow = reviewedMode || panel.dataset.step === state.reviewStep;
    panel.classList.toggle("hidden", !shouldShow);
    panel.classList.toggle("review-step-panel-active", panel.dataset.step === state.reviewStep);
  });

  const index = REVIEW_STEPS.findIndex((step) => step.key === state.reviewStep);
  reviewStepHint.textContent = reviewedMode
    ? "点击上方标记可直接跳到对应模块。"
    : REVIEW_STEPS[index]?.hint || "";
  prevStepBtn.disabled = reviewedMode || index <= 0;
  nextStepBtn.textContent = reviewedMode ? "已复盘" : index === REVIEW_STEPS.length - 1 ? "完成复盘" : "下一步";
  nextStepBtn.disabled = reviewedMode;
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
    await fetchJson(`/api/reviews/${state.activeDate}/complete`, {
      method: "POST",
    });
    setReviewStatus("reviewed");
    setReviewMode("reviewed");
    if (state.activeBootstrap?.draft) state.activeBootstrap.draft.review_status = "reviewed";
    await loadReviews();
    closeDrawer();
    return;
  }

  setReviewStep(REVIEW_STEPS[currentIndex + 1].key);
}

function getStepValue(step) {
  if (!step) return "";
  if (step.key === "news") {
    const summary = String(reviewForm.elements.namedItem("reviewerNewsNotes")?.value || "").trim();
    return summary;
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
    const summary = String(reviewForm.elements.namedItem("reviewerNewsNotes")?.value || "").trim();
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
  state.reviewStatus = status;
  reviewStatusBadge.textContent = formatReviewStatus(status);
  reviewStatusBadge.className = `status-pill ${reviewStatusVariant(status)}`.trim();
}

function applyEditMode(editable) {
  state.editMode = editable;
  setReviewMode(state.reviewStatus);
}

function setReviewMode(status) {
  const readOnly = status === "reviewed" && !state.editMode;
  reviewActionGroup.classList.toggle("hidden", false);
  reviewModalFooter.classList.toggle("hidden", readOnly);
  prevStepBtn.disabled = readOnly || REVIEW_STEPS.findIndex((step) => step.key === state.reviewStep) <= 0;
  nextStepBtn.disabled = readOnly ? true : false;
  syncMdPreviews(readOnly);
  Array.from(reviewForm.elements).forEach((field) => {
    if ("readOnly" in field) field.readOnly = readOnly;
    if ("disabled" in field && field.type !== "hidden") field.disabled = readOnly && field.type === "checkbox";
  });
  saveDraftBtn.disabled = readOnly;
  if (status === "reviewed") {
    initializeBtn.textContent = state.editMode ? "退出编辑" : "编辑";
    initializeBtn.disabled = false;
  } else {
    initializeBtn.textContent = "已初始化";
    initializeBtn.disabled = true;
  }
  nextStepBtn.textContent = status === "reviewed"
    ? "已复盘"
    : REVIEW_STEPS.findIndex((step) => step.key === state.reviewStep) === REVIEW_STEPS.length - 1
      ? "完成复盘"
      : "下一步";
  setReviewStep(state.reviewStep);
}

function scrollToReviewStep(stepKey) {
  const panel = document.querySelector(`.review-step-panel[data-step="${stepKey}"]`);
  if (!panel) return;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getDefaultNewsFilters() {
  return new FormData(newsFiltersForm);
}

function getEffectiveAnalysis(analysis, news) {
  const sections = analysis || {};
  const hasContent = [sections.daily_major_events, sections.sector_impact_map, sections.linkage_logic_chain]
    .some((value) => String(value || "").trim() && !isGarbageAnalysisSummary(value));
  if (hasContent) return sections;

  const taggedLine = (item, text) => {
    const label = {
      index: "[大盘]",
      sector: "[板块]",
      stock: "[个股]",
    }[normalizeNewsType(item?.type)] || "[大盘]";
    const normalized = String(text || "").trim();
    if (!normalized) return "";
    if (/^\[(大盘|板块|个股)\]/.test(normalized)) return normalized;
    return `${label} ${normalized}`;
  };
  const pick = (predicate) => (news || [])
    .filter(predicate)
    .slice(0, 4)
    .map((item) => taggedLine(item, item.ai_summary || item.title || item.content || ""))
    .filter(Boolean)
    .join("\n");
  return {
    daily_major_events: pick(() => true),
    sector_impact_map: (news || [])
      .slice(0, 3)
      .map((item) => taggedLine(item, item.market_impact || item.ai_summary || item.title || ""))
      .filter(Boolean)
      .join("\n") || "暂无新闻分析，请先运行新闻采集。",
    linkage_logic_chain: pick((item) => normalizeNewsType(item.type) === "stock") || pick(() => true),
  };
}

function buildDefaultNewsBrief(analysis, news) {
  return buildAiSummaryText(analysis, news);
}

function buildAiSummaryText(analysis, news) {
  const effective = getEffectiveAnalysis(analysis, news);
  const candidate = String(effective.daily_major_events || "").trim();
  if (candidate && !isGarbageAnalysisSummary(candidate)) return formatHashNumberedText(candidate);

  const parts = [];
  const macroLine = splitLines(effective.daily_major_events)[0] || splitLines(effective.sector_impact_map)[0];
  const symbolLine = splitLines(effective.sector_impact_map)[0] || splitLines(effective.linkage_logic_chain)[0];
  const impactLine = topNewsImpact(news);

  if (macroLine) parts.push(`宏观主线：${macroLine}`);
  if (symbolLine) parts.push(`标的主线：${symbolLine}`);
  if (impactLine) parts.push(`市场影响：${impactLine}`);
  return formatHashNumberedText(parts.join("\n")) || "暂无新闻分析，请先运行新闻采集。";
}

function stripLeadingListMarker(value) {
  return String(value || "")
    .trim()
    .replace(/^#\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^[•·▪◦\-]\s*/, "");
}

function ensureDisplayTag(value, fallbackLabel = "[大盘]") {
  const normalized = stripLeadingListMarker(value);
  if (!normalized) return "";
  if (/^\[(大盘|板块|个股)\]/.test(normalized)) return normalized;
  return `${fallbackLabel} ${normalized}`;
}

function formatHashNumberedText(value, fallbackLabel = "[大盘]") {
  const text = String(value || "").trim();
  if (!text) return "";
  const items = splitLines(text)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, i) => {
      const stripped = ensureDisplayTag(item, fallbackLabel);
      return `# ${i + 1}. ${stripped}`;
    });
  return items.join("\n");
}

function formatNumberedText(value, fallbackLabel = "[大盘]") {
  const text = String(value || "").trim();
  if (!text) return "";
  const items = splitLines(text)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, i) => `${i + 1}. ${ensureDisplayTag(item, fallbackLabel)}`);
  return items.join("\n");
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
  if (type === "stock" || type === "symbol") return "stock";
  if (type === "sector") return "sector";
  if (type === "market" || type === "macro") return "index";
  return "index";
}

function splitAnalysisByType(text) {
  const lines = String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const result = { index: [], sector: [], stock: [], untagged: [] };
  for (const line of lines) {
    if (/^\[(大盘|index)\]/i.test(line)) {
      result.index.push(line.replace(/^\[(index)\]\s*/i, "[大盘] "));
    } else if (/^\[(板块|sector)\]/i.test(line)) {
      result.sector.push(line.replace(/^\[(sector)\]\s*/i, "[板块] "));
    } else if (/^\[(个股|stock)\]/i.test(line)) {
      result.stock.push(line.replace(/^\[(stock)\]\s*/i, "[个股] "));
    } else {
      result.untagged.push(line);
    }
  }
  // If nothing is tagged, fall back: put all lines in index
  if (!result.index.length && !result.sector.length && !result.stock.length) {
    result.index = result.untagged.map((line) => ensureDisplayTag(line, "[大盘]"));
    result.untagged = [];
  }
  return result;
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

function formatReviewWindowLabel(cycle) {
  return `北京时间 ${cycle.beijingLabel.replace(/^北京时间\s*/, "")}`;
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

function formatNewsWindowBoundaryBeijing(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return text;
  const [, dateString, hour, minute] = match;
  const beijingDate = resolveNyTimeToBeijing(dateString, `${hour}:${minute}`);
  return beijingDate.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).replace(",", "");
}

function formatPriceDisplayLabel(item) {
  const symbol = String(item?.symbol || "").trim();
  const preferredName = formatPriceDisplayName(item);
  return symbol ? `${preferredName} · ${symbol}` : preferredName;
}

function formatPriceDisplayName(item) {
  const symbol = String(item?.symbol || "").trim();
  return SYMBOL_DISPLAY_LABELS[symbol]
    || String(item?.display_name || "").trim()
    || normalizeChineseSecurityName(item?.stock_name)
    || String(item?.stock_name || "").trim()
    || symbol
    || "-";
}

function normalizeChineseSecurityName(name) {
  const text = String(name || "").trim();
  if (!text) return "";
  if (text === "SSE Composite") return "上证指数";
  if (text === "Hang Seng") return "恒生指数";
  if (text === "S&P 500") return "标普500";
  if (text === "Volatility Index") return "恐慌指数";
  if (text === "Dollar Index") return "美元指数";
  if (text === "Gold") return "黄金";
  return text;
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
  return NEWS_TYPE_LABELS[normalizeNewsType(type)] || normalizeNewsType(type) || "未分类";
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
  return value ? "★".repeat(value) : "观察";
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
  const { auth = false, authReason = "当前操作", ...fetchOptions } = options;

  async function sendRequest(forcePrompt = false) {
    const requestOptions = {
      ...fetchOptions,
      headers: new Headers(fetchOptions.headers || {}),
    };

    if (auth) {
      const token = getAppToken({ reason: authReason, forcePrompt });
      requestOptions.headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(url, requestOptions);
    const data = await response.json().catch(() => ({}));

    if (auth && response.status === 401) {
      clearStoredAppToken();
      if (!forcePrompt) return sendRequest(true);
      throw new Error(data.error || "令牌无效或未授权");
    }
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  return sendRequest(false);
}

function getStoredAppToken() {
  try {
    return localStorage.getItem(APP_TOKEN_STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function setStoredAppToken(token) {
  try {
    localStorage.setItem(APP_TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore storage failures
  }
}

function clearStoredAppToken() {
  try {
    localStorage.removeItem(APP_TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

function getAppToken({ reason = "当前操作", forcePrompt = false } = {}) {
  const existing = !forcePrompt ? getStoredAppToken() : "";
  if (existing) return existing;

  const entered = window.prompt(
    forcePrompt
      ? `${reason}鉴权失败，请重新输入写入令牌。`
      : `${reason}需要写入令牌。请输入 Worker 配置的 INGEST_API_TOKEN（或 APP_API_TOKEN）。`,
    "",
  );
  const normalized = String(entered || "").trim();
  if (!normalized) throw new Error("未提供写入令牌");
  setStoredAppToken(normalized);
  return normalized;
}

// ========== Symbol Manager ==========

async function loadSymbols(forceRefresh = false) {
  const indexList = document.querySelector("#symbolsIndexList");
  const sectorList = document.querySelector("#symbolsSectorList");
  const stockList = document.querySelector("#symbolsStockList");
  if (!indexList) return;

  [indexList, sectorList, stockList].forEach((el) => {
    el.innerHTML = `<tr><td colspan="6" class="empty-state">加载中...</td></tr>`;
  });

  try {
    const data = await fetchJson("/api/symbols?active=0");
    const items = data.items || [];
    state.symbolsLoaded = true;

    const byType = { index: [], sector: [], stock: [] };
    items.forEach((item) => {
      const t = item.symbol_type || "stock";
      if (byType[t]) byType[t].push(item);
    });

    const render = (tbody, typeItems) => {
      tbody.innerHTML = "";
      if (!typeItems.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">暂无标的</td></tr>`;
        return;
      }
      typeItems.forEach((item) => tbody.appendChild(buildSymbolRow(item)));
    };
    render(indexList, byType.index);
    render(sectorList, byType.sector);
    render(stockList, byType.stock);
    [indexList, sectorList, stockList].forEach((g) => {
      if (g.querySelector(".symbol-row")) initSymbolDragDrop(g);
    });
  } catch (error) {
    [indexList, sectorList, stockList].forEach((el) => {
      el.innerHTML = `<tr><td colspan="6" class="empty-state">加载失败: ${escapeHtml(error.message)}</td></tr>`;
    });
  }
}

function buildSymbolRow(item) {
  const row = document.createElement("tr");
  row.className = `symbol-row ${item.is_active ? "" : "symbol-row-inactive"}`.trim();
  row.draggable = true;
  row.dataset.id = String(item.id);
  row.dataset.symbol = item.symbol;

  const aliases = Array.isArray(item.aliases) ? item.aliases : [];
  const typeClass = { index: "type-index", sector: "type-sector", stock: "type-stock" }[item.symbol_type] || "type-stock";
  const typeLabel = { index: "大盘", sector: "板块", stock: "个股" }[item.symbol_type] || item.symbol_type;
  const yahooIsDiff = item.yahoo_symbol && item.yahoo_symbol !== item.symbol;
  const activeLabel = item.is_active ? "显示中" : "已隐藏";
  const activeClass = item.is_active ? "status-active" : "status-hidden";
  const toggleLabel = item.is_active ? "隐藏" : "显示";

  row.innerHTML = `
    <td class="symbol-col-drag"><span class="symbol-drag-handle" title="拖拽排序">⠿</span></td>
    <td class="symbol-col-name">
      <div class="symbol-name-stack">
        <strong>${escapeHtml(item.display_name || item.symbol)}</strong>
        <span class="symbol-visibility-badge ${activeClass}">${activeLabel}</span>
      </div>
    </td>
    <td class="symbol-col-codes">
      <code class="sym-code">${escapeHtml(item.symbol)}</code>
      ${yahooIsDiff ? `<span class="sym-arrow">→</span><code class="sym-code sym-code-yahoo">${escapeHtml(item.yahoo_symbol)}</code>` : ""}
    </td>
    <td class="symbol-col-type">
      <span class="symbol-type-badge ${typeClass}">${typeLabel}</span>
    </td>
    <td class="symbol-col-aliases">
      ${aliases.map((a) => `<span class="alias-chip">${escapeHtml(a)}</span>`).join("")}
    </td>
    <td class="symbol-col-actions">
      <button class="symbol-edit-btn" data-action="edit" data-id="${escapeHtml(String(item.id))}">编辑</button>
      <button class="symbol-toggle-btn ${activeClass}" data-action="toggle" data-id="${escapeHtml(String(item.id))}" data-symbol="${escapeHtml(item.symbol)}" data-active="${item.is_active ? "1" : "0"}">${toggleLabel}</button>
    </td>
  `;

  row.querySelector("[data-action='edit']").addEventListener("click", () => {
    showSymbolForm({ ...item });
  });
  row.querySelector("[data-action='toggle']").addEventListener("click", async (e) => {
    const { id, symbol, active } = e.currentTarget.dataset;
    const isActive = active === "1";
    const actionLabel = isActive ? "隐藏" : "显示";
    const confirmMessage = isActive
      ? `确认隐藏标的 ${symbol}？隐藏后将不再参与后续采集、打标与默认展示。`
      : `确认显示标的 ${symbol}？显示后将重新参与后续采集、打标与默认展示。`;
    if (!window.confirm(confirmMessage)) return;
    try {
      let updatedItem = null;
      if (isActive) {
        const result = await fetchJson(`/api/symbols/${id}`, {
          method: "DELETE",
        });
        updatedItem = result.item || null;
      } else {
        const result = await fetchJson(`/api/symbols/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: 1 }),
        });
        updatedItem = result.item || null;
      }
      if (updatedItem) {
        row.replaceWith(buildSymbolRow(updatedItem));
      } else {
        await loadSymbols();
      }
    } catch (err) {
      window.alert(`${actionLabel}失败: ${err.message}`);
    }
  });
  return row;
}

// 保留 buildSymbolCard 作为别名，兼容 initSymbolDragDrop 里的 .symbol-card 选择器
function buildSymbolCard(item) { return buildSymbolRow(item); }

// 为同一个 <tbody> 内的行绑定拖拽排序
function initSymbolDragDrop(tbody) {
  let dragSrc = null;

  tbody.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".symbol-row");
    if (!row) return;
    dragSrc = row;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  tbody.addEventListener("dragend", () => {
    tbody.querySelectorAll(".symbol-row").forEach((r) => r.classList.remove("dragging", "drag-over"));
    dragSrc = null;
  });

  tbody.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const target = e.target.closest(".symbol-row");
    if (!target || target === dragSrc) return;
    tbody.querySelectorAll(".symbol-row").forEach((r) => r.classList.remove("drag-over"));
    target.classList.add("drag-over");
  });

  tbody.addEventListener("dragleave", (e) => {
    const row = e.target.closest(".symbol-row");
    if (row) row.classList.remove("drag-over");
  });

  tbody.addEventListener("drop", async (e) => {
    e.preventDefault();
    const target = e.target.closest(".symbol-row");
    if (!target || !dragSrc || target === dragSrc) return;
    target.classList.remove("drag-over");

    const rows = [...tbody.querySelectorAll(".symbol-row")];
    const fromIdx = rows.indexOf(dragSrc);
    const toIdx = rows.indexOf(target);
    if (fromIdx < toIdx) {
      tbody.insertBefore(dragSrc, target.nextSibling);
    } else {
      tbody.insertBefore(dragSrc, target);
    }

    const updated = [...tbody.querySelectorAll(".symbol-row")];
    const patches = updated.map((r, i) => ({ id: Number(r.dataset.id), sort_order: i + 1 }));
    try {
      await Promise.all(patches.map(({ id, sort_order }) =>
        fetchJson(`/api/symbols/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order }),
        })
      ));
    } catch {
      // 持久化失败不影响 UI
    }
  });
}

function showSymbolForm(prefill = {}) {
  const preview = document.querySelector("#symbolResolvePreview");
  const isEdit = Boolean(prefill.id);
  const aliasStr = Array.isArray(prefill.aliases)
    ? prefill.aliases.join(", ")
    : String(prefill.aliases || "");

  preview.classList.remove("hidden");
  preview.innerHTML = `
    <div class="symbol-resolve-card">
      <form id="symbolManualForm" class="symbol-manual-form" autocomplete="off">
        <div class="symbol-manual-grid">
          <label>
            <small>系统代码</small>
            <input type="text" name="symbol" value="${escapeHtml(prefill.symbol || "")}" placeholder="如 MU、GSPC、SOXX" ${isEdit ? "readonly" : ""} required />
          </label>
          <label>
            <small>Yahoo 代码</small>
            <input type="text" name="yahoo_symbol" value="${escapeHtml(prefill.yahoo_symbol || "")}" placeholder="如 MU、^GSPC、GC=F" />
          </label>
          <label>
            <small>显示名称</small>
            <input type="text" name="display_name" value="${escapeHtml(prefill.display_name || "")}" placeholder="如 美光科技、标普500" required />
          </label>
          <label>
            <small>类型</small>
            <select name="symbol_type">
              <option value="index" ${prefill.symbol_type === "index" ? "selected" : ""}>大盘 / 指数</option>
              <option value="sector" ${prefill.symbol_type === "sector" ? "selected" : ""}>板块 / ETF</option>
              <option value="stock" ${(!prefill.symbol_type || prefill.symbol_type === "stock") ? "selected" : ""}>个股</option>
            </select>
          </label>
          <label class="symbol-manual-aliases-label">
            <small>别名（逗号分隔，用于新闻匹配）</small>
            <input type="text" name="aliases" value="${escapeHtml(aliasStr)}" placeholder="如 Micron, Micron Technology, 美光" />
          </label>
        </div>
        <div class="action-row">
          <button type="submit">${isEdit ? "保存修改" : "添加标的"}</button>
          <button type="button" id="symbolFormCancelBtn" class="ghost">取消</button>
        </div>
        ${prefill.id ? `<input type="hidden" name="id" value="${prefill.id}" />` : ""}
      </form>
    </div>
  `;

  preview.querySelector("#symbolFormCancelBtn").addEventListener("click", () => {
    preview.classList.add("hidden");
  });
  preview.querySelector("#symbolManualForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitSymbolForm(new FormData(e.target));
  });
}

async function submitSymbolForm(formData) {
  const preview = document.querySelector("#symbolResolvePreview");
  const submitBtn = preview.querySelector("button[type='submit']");
  const id = formData.get("id");
  const aliasRaw = String(formData.get("aliases") || "").trim();
  const aliases = aliasRaw ? aliasRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const payload = {
    symbol: String(formData.get("symbol") || "").trim().toUpperCase(),
    yahoo_symbol: String(formData.get("yahoo_symbol") || "").trim() || null,
    display_name: String(formData.get("display_name") || "").trim(),
    symbol_type: formData.get("symbol_type"),
    aliases,
  };

  if (!payload.symbol || !payload.display_name) {
    window.alert("系统代码和显示名称不能为空。");
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "提交中..."; }
  try {
    if (id) {
      await fetchJson(`/api/symbols/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetchJson("/api/symbols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    preview.classList.add("hidden");
    await loadSymbols();
  } catch (err) {
    window.alert(`操作失败: ${err.message}`);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = id ? "保存修改" : "添加标的"; }
  }
}

async function resolveSymbolInput() {
  const input = document.querySelector("#symbolResolveInput");
  const preview = document.querySelector("#symbolResolvePreview");
  const query = input?.value?.trim();
  if (!query) { window.alert("请先输入标的名称或代码。"); return; }

  const btn = document.querySelector("#symbolResolveBtn");
  btn.disabled = true;
  btn.textContent = "解析中...";
  preview.classList.remove("hidden");
  preview.innerHTML = `<div class="empty-state">AI 正在识别「${escapeHtml(query)}」...</div>`;

  try {
    const data = await fetchJson("/api/symbols/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: query }),
    });
    const item = data.resolved;
    if (!item) throw new Error("AI 未能识别该标的，请尝试更具体的名称或代码。");
    state.symbolResolveResult = item;
    preview.innerHTML = `
      <div class="symbol-resolve-card">
        <div class="symbol-resolve-info">
          <div><small>系统代码</small><strong>${escapeHtml(item.symbol)}</strong></div>
          <div><small>Yahoo 代码</small><strong>${escapeHtml(item.yahoo_symbol || "-")}</strong></div>
          <div><small>显示名称</small><strong>${escapeHtml(item.display_name || "-")}</strong></div>
          <div><small>类型</small><strong>${escapeHtml(symbolTypeLabel(item.symbol_type))}</strong></div>
        </div>
        <div class="action-row">
          <button id="symbolConfirmBtn" type="button">确认添加</button>
          <button id="symbolCancelResolveBtn" type="button" class="ghost">取消</button>
        </div>
      </div>
    `;
    preview.querySelector("#symbolConfirmBtn").addEventListener("click", confirmAddSymbol);
    preview.querySelector("#symbolCancelResolveBtn").addEventListener("click", () => {
      preview.classList.add("hidden");
      state.symbolResolveResult = null;
    });
  } catch (err) {
    preview.innerHTML = `<div class="empty-state">解析失败: ${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "智能解析";
  }
}

async function confirmAddSymbol() {
  const item = state.symbolResolveResult;
  if (!item) return;
  const confirmBtn = document.querySelector("#symbolConfirmBtn");
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "添加中..."; }
  try {
    await fetchJson("/api/symbols", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    document.querySelector("#symbolResolveInput").value = "";
    document.querySelector("#symbolResolvePreview").classList.add("hidden");
    state.symbolResolveResult = null;
    await loadSymbols();
  } catch (err) {
    window.alert(`添加失败: ${err.message}`);
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "确认添加"; }
  }
}

function symbolTypeLabel(type) {
  return { index: "大盘/指数", sector: "板块/ETF", stock: "个股" }[type] || type || "未知";
}

// ── Keywords Management ───────────────────────────────────────────────────────

const keywordInput = document.querySelector("#keywordInput");
const keywordTypeSelect = document.querySelector("#keywordTypeSelect");
const keywordLangSelect = document.querySelector("#keywordLangSelect");
const keywordAddBtn = document.querySelector("#keywordAddBtn");
const keywordsListEl = document.querySelector("#keywordsList");
const refreshKeywordsBtn = document.querySelector("#refreshKeywordsBtn");

document.querySelectorAll(".kw-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".kw-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.activeKeywordType = tab.dataset.type;
    renderKeywordsList();
  });
});

if (refreshKeywordsBtn) {
  refreshKeywordsBtn.addEventListener("click", () => {
    state.keywordsLoaded = false;
    loadKeywords();
  });
}

if (keywordAddBtn) {
  keywordAddBtn.addEventListener("click", addKeyword);
}

let _keywordsData = [];

async function loadKeywords() {
  try {
    const data = await fetchJson("/api/screening-keywords");
    _keywordsData = data.items || [];
    state.keywordsLoaded = true;
    renderKeywordsList();
  } catch (err) {
    if (keywordsListEl) keywordsListEl.innerHTML = `<tr><td colspan="4" class="muted" style="padding:12px">加载失败: ${err.message}</td></tr>`;
  }
}

function renderKeywordsList() {
  if (!keywordsListEl) return;
  const filtered = _keywordsData.filter((k) => k.keyword_type === state.activeKeywordType);
  if (!filtered.length) {
    keywordsListEl.innerHTML = `<tr><td colspan="4" class="muted" style="padding:12px 0">暂无关键词</td></tr>`;
    return;
  }
  keywordsListEl.innerHTML = filtered.map((kw) => `
    <tr class="${kw.is_active ? "" : "kw-inactive"}">
      <td>${escapeHtml(kw.keyword)}</td>
      <td class="muted">${kw.language === "zh" ? "中文" : "英文"}</td>
      <td>
        <label class="kw-toggle">
          <input type="checkbox" ${kw.is_active ? "checked" : ""} data-kw-id="${kw.id}" data-action="toggle" />
          ${kw.is_active ? "启用" : "禁用"}
        </label>
      </td>
      <td>
        ${kw.sort_order >= 100 ? `<button class="ghost" style="font-size:0.75rem;padding:2px 8px" data-kw-id="${kw.id}" data-action="delete">删除</button>` : ""}
      </td>
    </tr>
  `).join("");

  keywordsListEl.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("change", handleKeywordToggle);
    el.addEventListener("click", handleKeywordDelete);
  });
}

async function handleKeywordToggle(e) {
  if (e.target.dataset.action !== "toggle") return;
  const id = Number(e.target.dataset.kwId);
  const is_active = e.target.checked ? 1 : 0;
  try {
    await fetchJson(`/api/screening-keywords/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active }),
    });
    const kw = _keywordsData.find((k) => k.id === id);
    if (kw) { kw.is_active = is_active; kw.updated_at = new Date().toISOString(); }
    renderKeywordsList();
  } catch (err) {
    alert(`更新失败: ${err.message}`);
  }
}

async function handleKeywordDelete(e) {
  if (e.target.dataset.action !== "delete") return;
  const id = Number(e.target.dataset.kwId);
  if (!confirm("确认删除此关键词？")) return;
  try {
    await fetchJson(`/api/screening-keywords/${id}`, {
      method: "DELETE",
    });
    _keywordsData = _keywordsData.filter((k) => k.id !== id);
    renderKeywordsList();
  } catch (err) {
    alert(`删除失败: ${err.message}`);
  }
}

async function addKeyword() {
  const keyword = keywordInput?.value.trim();
  if (!keyword) { alert("请输入关键词"); return; }
  const keyword_type = keywordTypeSelect?.value || "market";
  const language = keywordLangSelect?.value || "zh";
  try {
    const created = await fetchJson("/api/screening-keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, keyword_type, language }),
    });
    _keywordsData.push(created);
    if (keywordInput) keywordInput.value = "";
    // 自动切换到新词所在 tab
    state.activeKeywordType = keyword_type;
    document.querySelectorAll(".kw-tab").forEach((t) => t.classList.toggle("active", t.dataset.type === keyword_type));
    renderKeywordsList();
  } catch (err) {
    alert(`添加失败: ${err.message}`);
  }
}

// ── ReadMe ────────────────────────────────────────────────────────────────────

const README_ASSET_PATH = "/readme.md";
const README_LOADING_HTML = '<p class="muted">正在加载 README...</p>';
const README_ERROR_HTML = '<p class="muted">README 加载失败。请先运行 `npm run sync:readme`，然后重新刷新页面。</p>';
const README_TOC_HEADING = "目录";

function buildReadmeLayout(container) {
  const article = document.createElement("article");
  article.className = "readme-article";
  while (container.firstChild) article.appendChild(container.firstChild);

  const sections = Array.from(article.querySelectorAll('a[id] + h2'))
    .map((heading) => {
      const anchor = heading.previousElementSibling;
      const id = anchor?.tagName === "A" ? anchor.id : "";
      const label = heading.textContent.trim();
      if (!id || !label || label === README_TOC_HEADING) return null;
      return { id, label };
    })
    .filter(Boolean);

  const layout = document.createElement("div");
  layout.className = "readme-layout";

  if (sections.length) {
    const sidebar = document.createElement("aside");
    sidebar.className = "readme-sidebar";
    const tocTitle = document.createElement("div");
    tocTitle.className = "readme-sidebar-label";
    tocTitle.textContent = "目录导航";
    const tocList = document.createElement("ol");
    tocList.className = "readme-sidebar-list";
    sections.forEach(({ id, label }) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#${id}`;
      link.textContent = label;
      item.appendChild(link);
      tocList.appendChild(item);
    });
    sidebar.append(tocTitle, tocList);
    layout.appendChild(sidebar);
  }

  layout.appendChild(article);
  container.innerHTML = "";
  container.appendChild(layout);
}

function syncReadmeHash(container) {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return;
  const target = container.querySelector(`#${CSS.escape(hash)}`);
  if (!target) return;
  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "auto", block: "start" });
  });
}

async function renderReadme() {
  const el = document.querySelector("#readmeContent");
  if (!el) return;
  el.innerHTML = README_LOADING_HTML;
  try {
    const response = await fetch(README_ASSET_PATH, { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load README: ${response.status}`);
    const markdown = await response.text();
    el.innerHTML = snarkdown(markdown);
    buildReadmeLayout(el);
    syncReadmeHash(el);
    state.readmeLoaded = true;
  } catch (error) {
    console.error("README load failed", error);
    el.innerHTML = README_ERROR_HTML;
  }
}
