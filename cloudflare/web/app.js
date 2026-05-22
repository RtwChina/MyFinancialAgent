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

// 券商账户 App 图标查表：URL 由 Apple iTunes Search API 公开返回，浏览器渲染时直接从 Apple CDN 拉取。
// 新增券商：在 BROKER_ICONS 写一行 URL，再在 resolveBrokerKey 加一条匹配规则即可。
const BROKER_ICONS = {
  tiger:       "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/4e/d2/54/4ed254e2-582f-d399-8f62-ce8863a5a24b/AppIcon-0-0-1x_U007ephone-0-1-85-220.png/128x128bb.jpg",
  eastmoney:   "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/e1/55/d9/e155d91d-e19b-0f84-fa25-5e01d3cf3ae0/AppIcon-0-0-1x_U007ephone-0-11-0-0-sRGB-85-220.png/128x128bb.jpg",
  tiantian:    "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/03/5d/e2/035de212-9107-41f2-3365-85ba93c9ab45/AppIcon-0-0-1x_U007emarketing-0-11-0-0-85-220.jpeg/128x128bb.jpg",
  tonghuashun: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/a6/62/71/a6627199-cd36-773c-9557-f9dac017c2fa/AppIcon-0-0-1x_U007emarketing-0-6-0-85-220.png/128x128bb.jpg",
  moomoo:      "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/4c/c2/4a/4cc24ab0-0522-b0f5-d5cb-aa650f4324e9/AppIcon-MooMoo-0-0-1x_U007epad-0-1-sRGB-85-220.png/128x128bb.jpg",
  futu:        "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/8c/ab/89/8cab8954-e76e-4297-c12b-a2647879734e/AppIcon-NiuNiu-0-0-1x_U007epad-0-1-sRGB-85-220.png/128x128bb.jpg",
  ibkr:        "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/44/79/b5/4479b5d9-903a-8f64-e008-23d937b09660/AppIcon-0-0-1x_U007emarketing-0-8-0-0-85-220.png/128x128bb.jpg",
  schwab:      "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/63/35/22/63352205-efb2-052a-5b6d-2a93838754e7/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/128x128bb.jpg",
  usmart:      "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/95/b7/30/95b730b8-a366-104c-78d7-be723d6a3f86/AppIcon-0-0-1x_U007emarketing-0-6-0-85-220.png/128x128bb.jpg",
  sharppoint:  "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/79/07/fa/7907fadf-2b20-1c55-62a3-0d9a01d1083e/AppIcon-production-0-0-1x_U007emarketing-0-11-0-85-220.png/128x128bb.jpg",
  bbae:        "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/eb/6b/c2/eb6bc2a5-7614-c755-b040-9e0373a326bf/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/128x128bb.jpg",
};

function resolveBrokerKey(account) {
  const text = `${account?.broker || ""} ${account?.name || ""}`.toLowerCase();
  if (text.includes("老虎") || text.includes("tiger")) return "tiger";
  if (text.includes("东方财富") || text.includes("eastmoney") || text.includes("east money")) return "eastmoney";
  if (text.includes("天天基金") || text.includes("tiantian")) return "tiantian";
  if (text.includes("同花顺") || text.includes("tonghuashun") || text.includes("ths")) return "tonghuashun";
  if (text.includes("moomoo")) return "moomoo";
  if (text.includes("富途") || text.includes("futu") || text.includes("牛牛")) return "futu";
  if (text.includes("盈透") || text.includes("ibkr") || text.includes("interactive broker")) return "ibkr";
  if (text.includes("嘉信") || text.includes("schwab")) return "schwab";
  if (text.includes("盈立") || text.includes("usmart")) return "usmart";
  if (text.includes("卓锐") || text.includes("sharp point") || text.includes("sptrader")) return "sharppoint";
  if (text.includes("bbae")) return "bbae";
  return null;
}

function renderAccountLogoHtml(account) {
  const key = resolveBrokerKey(account);
  const url = key ? BROKER_ICONS[key] : null;
  if (url) {
    return `<span class="action-plan-account-logo" aria-hidden="true"><img src="${escapeAttribute(url)}" alt="" referrerpolicy="no-referrer" /></span>`;
  }
  const fallback = ((account?.name || "?").trim().charAt(0)) || "?";
  return `<span class="action-plan-account-logo action-plan-account-logo--fallback" aria-hidden="true">${escapeHtml(fallback)}</span>`;
}

const state = {
  activeView: "reviews",
  activeDate: null,
  activeBootstrap: null,
  accountSnapshot: null,
  accountImpactSummary: [],
  accountImpactPreviewTimer: null,
  newsFilters: null,
  reviewStep: "news",
  reviewStatus: "initialized",
  editMode: false,
  reviewNoteBlocks: {
    marketSentiment: [],
    sectorRotation: [],
  },
  actionPlans: [],
  accountLiveActionPlans: [],
  investmentAccounts: [],
  selectedActionPlanIndex: -1,
  actionPlanSymbolCatalog: [],
  latestArchiveDate: null,
  actionPlanEditorMode: "review-latest",
  dailyInsight: null,
  homepageInsightSections: [],
  symbolsLoaded: false,
  accountsLoaded: false,
  accountLivePlansLoaded: false,
  keywordsLoaded: false,
  activeKeywordType: "macro",
  readmeLoaded: false,
  newsPage: 1,
  newsPageSize: 20,
  reviewsPage: 1,
  reviewsPageSize: 10,
};

const APP_TOKEN_STORAGE_KEY = "myFinancialAgentApiToken";
const ACTION_PLAN_ACTIONS = ["准备开仓", "持仓观察", "已清仓复盘"];
const ACTION_PLAN_POSITIONS = ["0%", "0-5%", "5%-10%", "10%-15%", "15%-20%", "20%-25%", "25%-30%", ">30%"];
const DEFAULT_ACTION_PLAN_ACTION = "持仓观察";
const DEFAULT_ACTION_PLAN_POSITION = "0-5%";
const ZERO_POSITION_ACTIONS = new Set(["准备开仓", "已清仓复盘"]);

function pickActionPlanEditorMode(archiveDate, latestArchiveDate) {
  if (!archiveDate) return "live";
  if (!latestArchiveDate) return "review-latest";
  return archiveDate === latestArchiveDate ? "review-latest" : "review-historical";
}

function applyActionPlanEditorModeHint(labelEl, mode, archiveDate) {
  if (!labelEl) return;
  if (mode === "review-historical") {
    labelEl.textContent = `历史草稿（仅修改 ${archiveDate} 当日数据，不同步账户管理）`;
    labelEl.style.display = "";
    labelEl.classList.add("historical-draft-hint");
  } else if (mode === "review-latest") {
    labelEl.textContent = "此编辑会同步到账户管理";
    labelEl.style.display = "";
    labelEl.classList.remove("historical-draft-hint");
  } else {
    labelEl.textContent = "";
    labelEl.style.display = "none";
    labelEl.classList.remove("historical-draft-hint");
  }
}

let activeActionPlanEditorContext = null;

function mountActionPlanEditor(rootEl, context = {}) {
  const ctx = {
    mode: context.mode || "review-latest",
    plans: Array.isArray(context.plans) ? context.plans : [],
    symbolCatalog: Array.isArray(context.symbolCatalog) ? context.symbolCatalog : [],
    accounts: Array.isArray(context.accounts) ? context.accounts : [],
    archiveDate: context.archiveDate || null,
    callbacks: {
      onSave: typeof context.callbacks?.onSave === "function" ? context.callbacks.onSave : null,
      onDelete: typeof context.callbacks?.onDelete === "function" ? context.callbacks.onDelete : null,
      onReorder: typeof context.callbacks?.onReorder === "function" ? context.callbacks.onReorder : null,
      onLocalChange: typeof context.callbacks?.onLocalChange === "function" ? context.callbacks.onLocalChange : null,
    },
    ui: {
      showSyncHint: Boolean(context.ui?.showSyncHint),
      historicalDraftHint: Boolean(context.ui?.historicalDraftHint),
    },
    rootEl: rootEl || null,
  };
  activeActionPlanEditorContext = ctx;
  if (state.activeActionPlanEditor?.destroy && state.activeActionPlanEditor.context !== ctx) {
    state.activeActionPlanEditor.destroy();
  }
  state.actionPlanEditorMode = ctx.mode;
  state.actionPlans = ctx.plans.slice();
  state.selectedActionPlanIndex = state.actionPlans.length ? 0 : -1;
  state.actionPlanSymbolCatalog = ctx.symbolCatalog.slice();
  if (ctx.accounts.length) {
    state.investmentAccounts = ctx.accounts.slice();
  }
  renderActionPlans();
  applyActionPlanEditorModeHint(carryForwardLabel, ctx.mode, ctx.archiveDate);

  return {
    refresh(nextPlans) {
      if (Array.isArray(nextPlans)) {
        ctx.plans = nextPlans;
        state.actionPlans = nextPlans.slice();
        if (state.selectedActionPlanIndex >= state.actionPlans.length) {
          state.selectedActionPlanIndex = state.actionPlans.length ? 0 : -1;
        }
      }
      renderActionPlans();
    },
    destroy() {
      closeActionPlanDetail();
      if (activeActionPlanEditorContext === ctx) {
        activeActionPlanEditorContext = null;
      }
    },
    get context() {
      return ctx;
    },
  };
}

function getActiveActionPlanEditorContext() {
  return activeActionPlanEditorContext;
}

function getActionPlanRenderRoot() {
  return activeActionPlanEditorContext?.rootEl || actionPlanAccountGroups;
}

function isLiveActionPlanMode() {
  return activeActionPlanEditorContext?.mode === "live";
}

function isActionPlanEditorReadOnly() {
  return !isLiveActionPlanMode() && state.reviewStatus === "reviewed" && !state.editMode;
}

function notifyActionPlanLocalChange() {
  const ctx = getActiveActionPlanEditorContext();
  if (ctx?.callbacks?.onLocalChange) ctx.callbacks.onLocalChange(state.actionPlans.slice());
}

const REVIEW_STEPS = [
  { key: "news", label: "新闻总结", field: "reviewerNewsNotes", optional: false, hint: "先看 AI 日总结和重点新闻，再写下你自己的主线判断与点评。" },
  { key: "market", label: "大盘盘点", field: "marketSentiment", optional: false, hint: "只写真正影响大盘的变量，比如美元、利率、VIX 和风险偏好。" },
  { key: "rotation", label: "板块轮动", field: "sectorRotation", optional: false, hint: "把大宗商品和板块强弱写清楚，说明谁领涨、谁承压、资金往哪边走。" },
  { key: "plan", label: "操作计划", field: "actionPlans", optional: false, hint: "针对核心标的和仓位，给出明确计划、触发条件和风险线。" },
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
const accountsView = document.querySelector("#accountsView");
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
const reviewModalPanel = document.querySelector(".review-modal-panel");
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
const reviewOutline = document.querySelector("#reviewOutline");
const saveDraftBtn = document.querySelector("#saveDraftBtn");
const initializeBtn = document.querySelector("#initializeBtn");
const reviewActionGroup = document.querySelector("#reviewActionGroup");
const prevStepBtn = document.querySelector("#prevStepBtn");
const nextStepBtn = document.querySelector("#nextStepBtn");
const reviewModalFooter = document.querySelector(".review-modal-footer");
const actionPlanAccountGroups = document.querySelector("#actionPlanAccountGroups");
const accountLivePlans = document.querySelector("#accountLivePlans");
const accountsSummary = document.querySelector("#accountsSummary");
const accountFormModal = document.querySelector("#accountFormModal");
const accountFormBody = document.querySelector("#accountFormBody");
const accountFormTitle = document.querySelector("#accountFormTitle");
const accountFormBackdrop = document.querySelector("#accountFormBackdrop");
const closeAccountFormBtn = document.querySelector("#closeAccountFormBtn");

function closeAccountForm() {
  if (accountFormModal) accountFormModal.classList.add("hidden");
}
accountFormBackdrop?.addEventListener("click", closeAccountForm);
closeAccountFormBtn?.addEventListener("click", closeAccountForm);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && accountFormModal && !accountFormModal.classList.contains("hidden")) {
    closeAccountForm();
  }
});
const actionPlanDetailModal = document.querySelector("#actionPlanDetailModal");
const actionPlanDetailBackdrop = document.querySelector("#actionPlanDetailBackdrop");
const actionPlanDetailTitle = document.querySelector("#actionPlanDetailTitle");
const actionPlanDetailSubtitle = document.querySelector("#actionPlanDetailSubtitle");
const closeActionPlanDetailBtn = document.querySelector("#closeActionPlanDetailBtn");
const cancelActionPlanDetailBtn = document.querySelector("#cancelActionPlanDetailBtn");
const saveActionPlanDetailBtn = document.querySelector("#saveActionPlanDetailBtn");
const actionPlanCellTooltip = document.querySelector("#actionPlanCellTooltip");
const actionPlanEditor = document.querySelector("#actionPlanEditor");
const actionPlanSymbolInput = document.querySelector("#actionPlanSymbolInput");
const actionPlanSymbolSelect = document.querySelector("#actionPlanSymbolSelect");
const actionPlanAccountSelect = document.querySelector("#actionPlanAccountSelect");
const actionPlanMetrics = document.querySelector("#actionPlanMetrics");
const actionPlanActionSelect = document.querySelector("#actionPlanActionSelect");
const actionPlanPositionSelect = document.querySelector("#actionPlanPositionSelect");
const actionPlanPositionAmountInput = document.querySelector("#actionPlanPositionAmountInput");
const actionPlanSupportLevelsInput = document.querySelector("#actionPlanSupportLevelsInput");
const actionPlanResistanceLevelsInput = document.querySelector("#actionPlanResistanceLevelsInput");
const actionPlanEntryInput = document.querySelector("#actionPlanEntryInput");
const appendDailyRecordDateBtn = document.querySelector("#appendDailyRecordDateBtn");
const actionPlanTakeProfitInput = document.querySelector("#actionPlanTakeProfitInput");
const actionPlanStopLossInput = document.querySelector("#actionPlanStopLossInput");
const actionPlanThinkingInput = document.querySelector("#actionPlanThinkingInput");

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

appendDailyRecordDateBtn?.addEventListener("click", () => appendDailyRecordDate());
closeActionPlanDetailBtn?.addEventListener("click", () => closeActionPlanDetail());
cancelActionPlanDetailBtn?.addEventListener("click", () => closeActionPlanDetail());
actionPlanDetailBackdrop?.addEventListener("click", () => closeActionPlanDetail());
saveActionPlanDetailBtn?.addEventListener("click", () => saveActionPlanDetailAndClose());
actionPlanActionSelect?.addEventListener("change", syncZeroPositionForAction);
actionPlanAccountSelect?.addEventListener("change", () => {
  updateActionPlanDetailHeading();
  syncPositionBucketFromAmount();
});
actionPlanSymbolSelect?.addEventListener("change", () => {
  if (actionPlanSymbolInput) actionPlanSymbolInput.value = actionPlanSymbolSelect.value;
  updateActionPlanDetailHeading();
  renderActionPlanMetrics(actionPlanSymbolSelect.value);
});
actionPlanPositionAmountInput?.addEventListener("input", syncPositionBucketFromAmount);

function syncPositionBucketFromAmount() {
  if (!actionPlanPositionAmountInput || !actionPlanPositionSelect) return;
  const raw = actionPlanPositionAmountInput.value;
  if (raw === "" || raw == null) return;
  const wan = Number(raw);
  if (!Number.isFinite(wan)) return;
  const amountRaw = wan * 10000;
  const accountId = Number(actionPlanAccountSelect?.value || 0);
  const account = findAccountById(accountId);
  const bucket = mapAmountToPositionBucket(amountRaw, account?.totalAssets);
  if (!bucket) return;
  if (ZERO_POSITION_ACTIONS.has(actionPlanActionSelect?.value)) return;
  actionPlanPositionSelect.value = bucket;
}

[
  actionPlanEntryInput,
  actionPlanTakeProfitInput,
  actionPlanStopLossInput,
  actionPlanSupportLevelsInput,
  actionPlanResistanceLevelsInput,
  actionPlanThinkingInput,
].filter(Boolean).forEach((el) => {
  el.addEventListener("input", () => autoResizeTextarea(el));
});

document.querySelectorAll("[data-note-add-section]").forEach((button) => {
  button.addEventListener("click", () => addReviewNoteSection(button.dataset.noteAddSection));
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
document.querySelector("#refreshAccountsBtn")?.addEventListener("click", () => loadAccounts(true));
document.querySelector("#newAccountBtn")?.addEventListener("click", () => showAccountForm());

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
  if (accountsView) accountsView.classList.toggle("active", view === "accounts");
  if (keywordsView) keywordsView.classList.toggle("active", view === "keywords");
  if (readmeView) readmeView.classList.toggle("active", view === "readme");
  if (view === "symbols" && !state.symbolsLoaded) loadSymbols();
  if (view === "accounts") {
    if (state.accountsLoaded) renderAccountLiveActionPlans();
    else loadAccounts();
  }
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
  reviewsList.innerHTML = `<tr><td colspan="4" class="table-empty">加载中...</td></tr>`;
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
    state.latestArchiveDate = data.latestArchiveDate || state.latestArchiveDate || null;
    reviewsList.innerHTML = "";
    if (!data.items.length) {
      reviewsList.innerHTML = `<tr><td colspan="4" class="table-empty">还没有复盘记录</td></tr>`;
      reviewsPagination.classList.add("hidden");
      return;
    }
    data.items.forEach((item) => reviewsList.appendChild(buildReviewRow(item)));
    renderReviewsPagination(data);
  } catch (error) {
    reviewsList.innerHTML = `<tr><td colspan="4" class="table-empty">查询失败: ${error.message}</td></tr>`;
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

async function openReviewDrawer(archiveDate, options = {}) {
  const { editPlan = false, initialStep = "news" } = options;
  const [data, symbolCatalog] = await Promise.all([
    fetchJson(`/api/reviews/${archiveDate}/bootstrap`),
    fetchJson(`/api/reviews/${archiveDate}/action-plan-symbols`),
  ]);
  state.activeDate = archiveDate;
  state.activeBootstrap = data;
  state.investmentAccounts = normalizeInvestmentAccounts(data.investmentAccounts || state.investmentAccounts || []);
  state.accountSnapshot = normalizeAccountSnapshot(data.accountSnapshot, state.investmentAccounts);
  state.accountsLoaded = state.investmentAccounts.length > 0;
  state.actionPlanSymbolCatalog = symbolCatalog.items || [];

  const cycle = buildReviewCycle(archiveDate);
  archiveDateLabel.textContent = `${archiveDate} · 美股交易日`;
  document.querySelector("#priceSnapshotLabel").textContent = `${archiveDate} 核心标的与指数`;
  drawerSubtitle.textContent = `${cycle.beijingLabel} ｜ 新闻窗口（北京时间） ${formatNewsWindowBoundaryBeijing(data.newsWindow.start)} → ${formatNewsWindowBoundaryBeijing(data.newsWindow.end)}`;
  state.latestArchiveDate = data.latestArchiveDate || null;
  state.actionPlanEditorMode = pickActionPlanEditorMode(archiveDate, state.latestArchiveDate);
  applyActionPlanEditorModeHint(carryForwardLabel, state.actionPlanEditorMode, archiveDate);

  const reviewStatus = data.draft?.review_status || "initialized";
  state.editMode = editPlan || reviewStatus !== "reviewed";
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
  state.accountImpactSummary = normalizeAccountImpactSummary(data.accountImpactSummary || data.account_impact_summary || []);
  state.reviewNoteBlocks = {
    marketSentiment: resolveBootstrapNoteBlocks(data, "marketSentiment"),
    sectorRotation: resolveBootstrapNoteBlocks(data, "sectorRotation"),
  };

  applyFormValues({
    reviewerNewsNotes: data.draft?.reviewer_news_notes || data.draft?.news_brief || buildDefaultNewsBrief(data.analysis, data.news),
    tradingSummary: data.draft?.trading_summary || "",
  });
  renderStructuredNoteEditors();
  state.activeActionPlanEditor = mountActionPlanEditor(actionPlanAccountGroups, {
    mode: state.actionPlanEditorMode,
    plans: normalizeActionPlans(data.actionPlans || []),
    symbolCatalog: state.actionPlanSymbolCatalog,
    accounts: state.investmentAccounts,
    archiveDate,
    callbacks: {
      onLocalChange: (plans) => {
        state.actionPlans = plans;
      },
    },
    ui: {
      showSyncHint: state.actionPlanEditorMode === "review-latest",
      historicalDraftHint: state.actionPlanEditorMode === "review-historical",
    },
  });
  if (state.editMode) scheduleAccountImpactPreview(0);

  initMdTabs();
  setReviewMode(reviewStatus);
  // editPlan 只在已复盘记录上跳到"个股操作"；未复盘时按正常顺序从 news 开始
  const jumpToPlan = editPlan && reviewStatus === "reviewed";
  setReviewStep(jumpToPlan ? "plan" : initialStep);
  reviewDrawer.classList.remove("hidden");
  scheduleStructuredNoteTextareaResize();
}

function closeDrawer() {
  if (state.activeActionPlanEditor?.destroy) {
    state.activeActionPlanEditor.destroy();
    state.activeActionPlanEditor = null;
  } else {
    closeActionPlanDetail();
  }
  reviewDrawer.classList.add("hidden");
}

async function saveReview() {
  if (!actionPlanDetailModal?.classList.contains("hidden")) {
    if (syncSelectedActionPlanFromEditor() === false) return;
  }
  const payload = Object.fromEntries(new FormData(reviewForm).entries());
  payload.reviewStatus = state.activeBootstrap?.draft?.review_status || "initialized";
  payload.actionPlans = normalizeActionPlans(state.actionPlans);
  payload.marketSentimentBlocks = normalizeReviewNoteBlocks(state.reviewNoteBlocks.marketSentiment);
  payload.sectorRotationBlocks = normalizeReviewNoteBlocks(state.reviewNoteBlocks.sectorRotation);

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
      market_sentiment_blocks: payload.marketSentimentBlocks,
      sector_rotation_blocks: payload.sectorRotationBlocks,
      trading_summary: payload.tradingSummary,
    },
    actionPlans: payload.actionPlans,
  };
  state.reviewNoteBlocks.marketSentiment = payload.marketSentimentBlocks;
  state.reviewNoteBlocks.sectorRotation = payload.sectorRotationBlocks;
  state.actionPlans = payload.actionPlans;
  state.selectedActionPlanIndex = state.actionPlans.length ? Math.max(0, state.selectedActionPlanIndex) : -1;
  renderActionPlans();
  renderStructuredNoteEditors();
  scheduleAccountImpactPreview(0);
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
  const isReviewed = normalizeReviewStatusValue(item.review_status) === "reviewed";
  const isHistoricalDraft = !isReviewed && state.latestArchiveDate && item.archive_date !== state.latestArchiveDate;
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>
      <div class="review-date-cell ${isReviewed ? "" : "is-pending"}">
        <strong>${escapeHtml(item.archive_date)}</strong>
        ${isReviewed ? "" : `<small>${isHistoricalDraft ? "历史草稿" : "未复盘"}</small>`}
      </div>
    </td>
    <td></td>
    <td class="review-thesis-cell">${renderMdCell(item.daily_thesis || item.news_summary || "待复盘", 96)}</td>
    <td></td>
  `;
  const impactCell = row.children[1];
  impactCell.appendChild(buildAccountImpactSummary(item));

  const actionCell = row.children[3];
  const actionGroup = document.createElement("div");
  actionGroup.className = "review-row-actions";

  if (isReviewed) {
    const viewButton = document.createElement("button");
    viewButton.className = "ghost compact-button";
    viewButton.textContent = "查看";
    viewButton.addEventListener("click", () => openReviewDrawer(item.archive_date));

    const editButton = document.createElement("button");
    editButton.className = "compact-button";
    editButton.textContent = "编辑";
    editButton.addEventListener("click", () => openReviewDrawer(item.archive_date, { editPlan: true }));

    actionGroup.append(viewButton, editButton);
  } else {
    const startButton = document.createElement("button");
    startButton.className = "compact-button";
    startButton.textContent = isHistoricalDraft ? "编辑草稿" : "开始复盘";
    startButton.addEventListener("click", () => openReviewDrawer(item.archive_date));
    if (isHistoricalDraft) {
      const badge = document.createElement("span");
      badge.className = "review-row-badge historical-draft";
      badge.textContent = "不同步账户管理";
      actionGroup.appendChild(badge);
    }
    actionGroup.append(startButton);
  }

  actionCell.appendChild(actionGroup);
  return row;
}

function normalizeReviewStatusValue(status) {
  return status === "completed" ? "reviewed" : (status || "initialized");
}

function buildAccountImpactSummary(item) {
  const wrapper = document.createElement("div");
  wrapper.className = "review-account-impact";
  const isReviewed = normalizeReviewStatusValue(item.review_status) === "reviewed";
  const summaries = item.account_impact_summary || item.account_estimate_summary || [];
  if (!isReviewed) {
    wrapper.innerHTML = `<span class="impact-empty">未复盘</span>`;
    return wrapper;
  }
  if (!summaries.length) {
    wrapper.innerHTML = `<span class="impact-empty">暂无数据</span>`;
    return wrapper;
  }
  summaries.slice(0, 4).forEach((summary) => {
    const row = document.createElement("div");
    row.className = "impact-meter-row";
    const nameSpan = document.createElement("span");
    nameSpan.className = "impact-account-name";
    nameSpan.textContent = summary.accountName || "账户";
    row.appendChild(nameSpan);
    row.appendChild(buildImpactMeter(summary));
    wrapper.appendChild(row);
  });
  if (summaries.length > 4) {
    const more = document.createElement("small");
    more.textContent = `还有 ${summaries.length - 4} 个账户`;
    wrapper.appendChild(more);
  }
  return wrapper;
}

function buildImpactMeter(summary) {
  const MAX_PERCENT = 4;
  const raw = Number(summary.valuePercent);
  const hasValue = Number.isFinite(raw) && summary.rangeLabel !== "暂无数据" && summary.rangeLabel !== "已记录";
  if (!hasValue) {
    const empty = document.createElement("span");
    empty.className = "impact-empty-inline";
    empty.textContent = summary.rangeLabel || "暂无数据";
    return empty;
  }
  const abs = Math.min(Math.abs(raw), MAX_PERCENT);
  const cols = abs < 0.05 ? 1 : Math.min(Math.ceil(abs), 4);
  const direction = raw > 0.05 ? "gain" : raw < -0.05 ? "loss" : "gain";

  const meter = document.createElement("div");
  meter.className = `impact-meter-cut cols-${cols} ${direction}`;
  for (let i = 0; i < cols; i++) {
    const seg = document.createElement("div");
    seg.className = "impact-seg";
    meter.appendChild(seg);
  }

  const dotPosInCols = abs < 0.05 ? 0.12 : (abs / MAX_PERCENT) / (cols / 4);
  const dotPercent = Math.max(6, Math.min(dotPosInCols * 100, 97));
  const dot = document.createElement("div");
  dot.className = "impact-dot";
  dot.style.left = `${dotPercent}%`;
  meter.appendChild(dot);
  return meter;
}

function makeReviewNoteId(prefix = "note") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeReviewNoteBlocks(value = []) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((section) => {
      const title = String(section?.title || "").trim();
      const children = (Array.isArray(section?.children) ? section.children : [])
        .map((child) => {
          const childTitle = String(child?.title || "").trim();
          const body = String(child?.body || "").trim();
          if (!childTitle && !body) return null;
          return {
            id: String(child?.id || makeReviewNoteId("sub")),
            title: childTitle || "未命名维度",
            body,
          };
        })
        .filter(Boolean);
      if (!title && !children.length) return null;
      return {
        id: String(section?.id || makeReviewNoteId("section")),
        title: title || "未命名主题",
        children,
      };
    })
    .filter(Boolean);
}

function reviewNoteBlocksHaveContent(blocks = []) {
  return normalizeReviewNoteBlocks(blocks).some((section) => (
    String(section.title || "").trim()
    || (section.children || []).some((child) => String(child.title || child.body || "").trim())
  ));
}

function resolveBootstrapNoteBlocks(data, camelKey) {
  const structured = data.structuredNotes?.[camelKey]?.blocks;
  if (Array.isArray(structured)) return normalizeReviewNoteBlocks(structured);
  return [];
}

function renderStructuredNoteEditors() {
  renderStructuredNoteEditor("marketSentiment", document.querySelector("#marketSentimentBlockEditor"));
  renderStructuredNoteEditor("sectorRotation", document.querySelector("#sectorRotationBlockEditor"));
  renderReviewOutline();
}

function renderStructuredNoteEditor(field, container) {
  if (!container) return;
  const readOnly = state.reviewStatus === "reviewed" && !state.editMode;
  const blocks = normalizeReviewNoteBlocks(state.reviewNoteBlocks[field] || []);
  state.reviewNoteBlocks[field] = blocks;
  container.innerHTML = "";
  container.classList.toggle("is-readonly", readOnly);
  if (!blocks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state structured-note-empty";
    empty.textContent = readOnly ? "暂无内容" : "还没有内容，先添加一个一级块。";
    container.appendChild(empty);
    return;
  }
  blocks.forEach((section, sectionIndex) => {
    const sectionEl = document.createElement("article");
    sectionEl.className = "structured-note-section";
    sectionEl.id = getReviewNoteSectionAnchor(field, sectionIndex);
    const head = document.createElement("div");
    head.className = "structured-note-section-head";
    const indexEl = document.createElement("span");
    indexEl.className = "structured-note-section-index";
    indexEl.textContent = String(sectionIndex + 1);
    head.appendChild(indexEl);
    const titleInput = document.createElement("input");
    titleInput.value = section.title;
    titleInput.placeholder = "一级标题";
    titleInput.readOnly = readOnly;
    titleInput.addEventListener("input", () => updateReviewNoteSectionTitle(field, sectionIndex, titleInput.value));
    head.appendChild(titleInput);
    const sectionTools = buildReviewNoteTools([
      ["删除", () => deleteReviewNoteSection(field, sectionIndex), false],
    ], readOnly);
    if (!readOnly) {
      sectionTools.prepend(buildReviewNoteDragHandle({
        label: "拖动一级排序",
        type: "section",
        field,
        sectionIndex,
      }));
    }
    head.appendChild(sectionTools);
    sectionEl.appendChild(head);

    const childList = document.createElement("div");
    childList.className = "structured-note-subsections";
    (section.children || []).forEach((child, childIndex) => {
      childList.appendChild(buildReviewNoteSubsection(field, sectionIndex, childIndex, child, readOnly));
    });
    sectionEl.appendChild(childList);

    if (!readOnly) {
      const addChild = document.createElement("button");
      addChild.type = "button";
      addChild.className = "ghost compact-button structured-note-add-sub";
      addChild.textContent = "+ 二级";
      addChild.addEventListener("click", () => addReviewNoteSubsection(field, sectionIndex));
      sectionEl.appendChild(addChild);
    }
    container.appendChild(sectionEl);
  });
}

function buildReviewNoteSubsection(field, sectionIndex, childIndex, child, readOnly) {
  // 对齐 demo .note-sub 结构：<div class="note-sub"><div class="note-sub-head"><b><span class="note-sub-tools"></span></div><p></p></div>
  // input/textarea 仍保留以维持编辑能力，readOnly 时通过 CSS 让其视觉等同 <b>/<p>
  const wrapper = document.createElement("div");
  wrapper.className = "note-sub";
  wrapper.id = getReviewNoteSubsectionAnchor(field, sectionIndex, childIndex);
  const head = document.createElement("div");
  head.className = "note-sub-head";
  const input = document.createElement("input");
  input.value = child.title;
  input.placeholder = "二级标题";
  input.readOnly = readOnly;
  input.addEventListener("input", () => updateReviewNoteSubsection(field, sectionIndex, childIndex, { title: input.value }));
  head.appendChild(input);
  const siblings = state.reviewNoteBlocks[field]?.[sectionIndex]?.children || [];
  const tools = document.createElement("span");
  tools.className = "note-sub-tools";
  if (!readOnly && siblings.length > 1) {
    tools.appendChild(buildReviewNoteDragHandle({
      label: "拖动二级排序",
      type: "subsection",
      field,
      sectionIndex,
      childIndex,
    }));
  }
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "compact-button danger";
  deleteBtn.textContent = "删除";
  deleteBtn.disabled = readOnly;
  deleteBtn.addEventListener("click", () => deleteReviewNoteSubsection(field, sectionIndex, childIndex));
  tools.appendChild(deleteBtn);
  head.appendChild(tools);
  const textarea = document.createElement("textarea");
  textarea.rows = 2;
  textarea.placeholder = "正文";
  textarea.dataset.noMd = "";
  textarea.value = child.body || "";
  textarea.readOnly = readOnly;
  const resizeNoteTextarea = () => scheduleTextareaResize(textarea);
  textarea.addEventListener("input", () => {
    updateReviewNoteSubsection(field, sectionIndex, childIndex, { body: textarea.value });
    resizeNoteTextarea();
  });
  textarea.addEventListener("change", resizeNoteTextarea);
  textarea.addEventListener("paste", resizeNoteTextarea);
  textarea.addEventListener("compositionend", resizeNoteTextarea);
  textarea.addEventListener("focus", resizeNoteTextarea);
  wrapper.append(head, textarea);
  scheduleTextareaResize(textarea);
  return wrapper;
}

function buildReviewNoteTools(items, readOnly) {
  const tools = document.createElement("div");
  tools.className = "structured-note-tools";
  items.forEach(([label, handler, disabled]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost compact-button";
    button.textContent = label;
    button.disabled = readOnly || disabled;
    button.addEventListener("click", handler);
    tools.appendChild(button);
  });
  return tools;
}

let reviewNoteDragState = null;

function buildReviewNoteDragHandle({ label, type, field, sectionIndex, childIndex = null }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "drag-handle";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<span aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
  button.addEventListener("mousedown", (event) => {
    const itemEl = button.closest(type === "section" ? ".structured-note-section" : ".note-sub");
    if (!itemEl) return;
    reviewNoteDragState = {
      type,
      field,
      sectionIndex,
      childIndex,
      itemEl,
      containerEl: type === "section"
        ? itemEl.parentElement
        : itemEl.closest(".structured-note-subsections"),
      selector: type === "section" ? ".structured-note-section" : ".note-sub",
      dropTarget: null,
      dropAfter: false,
    };
    itemEl.classList.add("is-dragging");
    event.preventDefault();
  });
  return button;
}

function getReviewNoteSectionAnchor(field, sectionIndex) {
  return `review-note-${field}-${sectionIndex}`;
}

function getReviewNoteSubsectionAnchor(field, sectionIndex, childIndex) {
  return `review-note-${field}-${sectionIndex}-${childIndex}`;
}

const REVIEW_OUTLINE_GROUPS = [
  { step: "market", field: "marketSentiment", label: "大盘盘点" },
  { step: "rotation", field: "sectorRotation", label: "大宗商品与板块轮动" },
];

function renderReviewOutline() {
  if (!reviewOutline) return;
  reviewOutline.innerHTML = "";
  const groups = buildReviewOutlineGroups();

  reviewModalPanel?.classList.toggle("has-outline", groups.length > 0);
  reviewOutline.classList.toggle("hidden", groups.length === 0);
  if (!groups.length) return;

  const title = document.createElement("div");
  title.className = "review-outline-title";
  title.textContent = "目录";
  reviewOutline.appendChild(title);

  groups.forEach((group) => {
    const groupEl = document.createElement("section");
    groupEl.className = "review-outline-group";
    const groupButton = buildReviewOutlineButton({
      label: group.label,
      level: "group",
      step: group.step,
      targetId: group.targetId || null,
    });
    groupEl.appendChild(groupButton);

    (group.items || []).forEach((section) => {
      groupEl.appendChild(buildReviewOutlineButton({
        label: section.label,
        level: "section",
        step: group.step,
        targetId: section.targetId,
      }));
      (section.children || []).forEach((child) => {
        groupEl.appendChild(buildReviewOutlineButton({
          label: child.label,
          level: "child",
          step: group.step,
          targetId: child.targetId,
        }));
      });
    });
    reviewOutline.appendChild(groupEl);
  });
}

function buildReviewOutlineGroups() {
  const groups = [];
  groups.push({
    step: null,
    label: "复盘日价格",
    targetId: "reviewPriceSnapshot",
    items: [],
  });
  groups.push({
    step: "news",
    label: "新闻总结",
    targetId: "analysisBox",
    items: [],
  });

  REVIEW_OUTLINE_GROUPS.forEach((group) => {
    const blocks = normalizeReviewNoteBlocks(state.reviewNoteBlocks[group.field] || []);
    if (!blocks.length) return;
    groups.push({
      step: group.step,
      label: group.label,
      targetId: null,
      items: blocks.map((section, sectionIndex) => ({
        label: `${sectionIndex + 1}. ${section.title || "未命名主题"}`,
        targetId: getReviewNoteSectionAnchor(group.field, sectionIndex),
        children: [],
      })),
    });
  });

  const actionPlanItems = buildActionPlanOutlineItems();
  groups.push({
    step: "plan",
    label: "个股操作",
    targetId: "actionPlanAccountGroups",
    items: actionPlanItems.length
      ? actionPlanItems
      : [{ label: "暂无操作计划", targetId: "actionPlanAccountGroups", children: [] }],
  });

  return groups.filter((group) => group.targetId || group.items?.length);
}

function buildActionPlanOutlineItems() {
  const accounts = getActionPlanVisibleAccounts();
  return accounts
    .map((account) => {
      const plans = state.actionPlans
        .map((plan, index) => ({ plan, index }))
        .filter(({ plan }) => Number(plan.accountId || 0) === Number(account.id));
      if (!plans.length) return null;
      return {
        label: account.name || "未分配账户",
        targetId: getActionPlanAccountAnchor(account),
        children: [],
      };
    })
    .filter(Boolean);
}

function buildReviewOutlineButton({ label, level, step, targetId }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `review-outline-item ${level}`;
  button.textContent = label;
  button.title = label;
  button.addEventListener("click", () => {
    if (step) setReviewStep(step);
    window.requestAnimationFrame(() => {
      const target = targetId ? document.getElementById(targetId) : document.querySelector(`.review-step-panel[data-step="${step}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  return button;
}

function clearReviewNoteDropMarkers() {
  document.querySelectorAll(".structured-note-drop-before, .structured-note-drop-after").forEach((node) => {
    node.classList.remove("structured-note-drop-before", "structured-note-drop-after");
  });
}

document.addEventListener("mousemove", (event) => {
  if (!reviewNoteDragState?.itemEl || !reviewNoteDragState.containerEl) return;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(reviewNoteDragState.selector);
  if (!target || target === reviewNoteDragState.itemEl || target.parentElement !== reviewNoteDragState.containerEl) return;
  const rect = target.getBoundingClientRect();
  reviewNoteDragState.dropTarget = target;
  reviewNoteDragState.dropAfter = event.clientY > rect.top + rect.height / 2;
  clearReviewNoteDropMarkers();
  target.classList.add(reviewNoteDragState.dropAfter ? "structured-note-drop-after" : "structured-note-drop-before");
});

document.addEventListener("mouseup", () => {
  const dragState = reviewNoteDragState;
  if (!dragState) return;
  if (dragState.dropTarget) {
    const targetIndex = Array.from(dragState.containerEl.querySelectorAll(dragState.selector)).indexOf(dragState.dropTarget);
    const nextIndex = dragState.dropAfter ? targetIndex + 1 : targetIndex;
    if (dragState.type === "section") {
      moveReviewNoteSectionTo(dragState.field, dragState.sectionIndex, nextIndex);
    } else {
      moveReviewNoteSubsectionTo(dragState.field, dragState.sectionIndex, dragState.childIndex, nextIndex);
    }
  }
  dragState.itemEl.classList.remove("is-dragging");
  reviewNoteDragState = null;
  clearReviewNoteDropMarkers();
});

function addReviewNoteSection(field) {
  if (!field || (state.reviewStatus === "reviewed" && !state.editMode)) return;
  const blocks = normalizeReviewNoteBlocks(state.reviewNoteBlocks[field] || []);
  blocks.push({
    id: makeReviewNoteId("section"),
    title: "未命名主题",
    children: [{ id: makeReviewNoteId("sub"), title: "核心判断", body: "" }],
  });
  state.reviewNoteBlocks[field] = blocks;
  renderStructuredNoteEditors();
}

function deleteReviewNoteSection(field, sectionIndex) {
  const blocks = normalizeReviewNoteBlocks(state.reviewNoteBlocks[field] || []);
  const section = blocks[sectionIndex];
  if (!section) return;
  if (!window.confirm(`删除“${section.title}”及其全部二级内容？`)) return;
  blocks.splice(sectionIndex, 1);
  state.reviewNoteBlocks[field] = blocks;
  renderStructuredNoteEditors();
}

function moveReviewNoteSection(field, sectionIndex, delta) {
  const blocks = normalizeReviewNoteBlocks(state.reviewNoteBlocks[field] || []);
  const targetIndex = sectionIndex + delta;
  if (targetIndex < 0 || targetIndex >= blocks.length) return;
  const [item] = blocks.splice(sectionIndex, 1);
  blocks.splice(targetIndex, 0, item);
  state.reviewNoteBlocks[field] = blocks;
  renderStructuredNoteEditors();
}

function moveReviewNoteSectionTo(field, sectionIndex, targetIndex) {
  const blocks = normalizeReviewNoteBlocks(state.reviewNoteBlocks[field] || []);
  if (sectionIndex < 0 || sectionIndex >= blocks.length) return;
  let insertIndex = Math.max(0, Math.min(targetIndex, blocks.length));
  if (insertIndex > sectionIndex) insertIndex -= 1;
  if (insertIndex === sectionIndex) return;
  const [item] = blocks.splice(sectionIndex, 1);
  blocks.splice(insertIndex, 0, item);
  state.reviewNoteBlocks[field] = blocks;
  renderStructuredNoteEditors();
}

function updateReviewNoteSectionTitle(field, sectionIndex, title) {
  const blocks = state.reviewNoteBlocks[field] || [];
  if (!blocks[sectionIndex]) return;
  blocks[sectionIndex].title = title;
  renderReviewOutline();
}

function addReviewNoteSubsection(field, sectionIndex) {
  const blocks = normalizeReviewNoteBlocks(state.reviewNoteBlocks[field] || []);
  if (!blocks[sectionIndex]) return;
  blocks[sectionIndex].children.push({ id: makeReviewNoteId("sub"), title: "未命名维度", body: "" });
  state.reviewNoteBlocks[field] = blocks;
  renderStructuredNoteEditors();
}

function deleteReviewNoteSubsection(field, sectionIndex, childIndex) {
  const blocks = normalizeReviewNoteBlocks(state.reviewNoteBlocks[field] || []);
  const child = blocks[sectionIndex]?.children?.[childIndex];
  if (!child) return;
  if (!window.confirm(`删除“${child.title}”？`)) return;
  blocks[sectionIndex].children.splice(childIndex, 1);
  state.reviewNoteBlocks[field] = blocks;
  renderStructuredNoteEditors();
}

function moveReviewNoteSubsection(field, sectionIndex, childIndex, delta) {
  const blocks = normalizeReviewNoteBlocks(state.reviewNoteBlocks[field] || []);
  const children = blocks[sectionIndex]?.children || [];
  const targetIndex = childIndex + delta;
  if (targetIndex < 0 || targetIndex >= children.length) return;
  const [item] = children.splice(childIndex, 1);
  children.splice(targetIndex, 0, item);
  state.reviewNoteBlocks[field] = blocks;
  renderStructuredNoteEditors();
}

function moveReviewNoteSubsectionTo(field, sectionIndex, childIndex, targetIndex) {
  const blocks = normalizeReviewNoteBlocks(state.reviewNoteBlocks[field] || []);
  const children = blocks[sectionIndex]?.children || [];
  if (childIndex < 0 || childIndex >= children.length) return;
  let insertIndex = Math.max(0, Math.min(targetIndex, children.length));
  if (insertIndex > childIndex) insertIndex -= 1;
  if (insertIndex === childIndex) return;
  const [item] = children.splice(childIndex, 1);
  children.splice(insertIndex, 0, item);
  state.reviewNoteBlocks[field] = blocks;
  renderStructuredNoteEditors();
}

function updateReviewNoteSubsection(field, sectionIndex, childIndex, patch) {
  const blocks = state.reviewNoteBlocks[field] || [];
  const child = blocks[sectionIndex]?.children?.[childIndex];
  if (!child) return;
  Object.assign(child, patch);
  if (Object.prototype.hasOwnProperty.call(patch, "title")) renderReviewOutline();
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

function normalizeActionPlanAction(value) {
  const text = String(value || "").trim();
  return ACTION_PLAN_ACTIONS.includes(text) ? text : DEFAULT_ACTION_PLAN_ACTION;
}

function normalizeActionPlanPosition(value) {
  const text = String(value || "").trim();
  return ACTION_PLAN_POSITIONS.includes(text) ? text : DEFAULT_ACTION_PLAN_POSITION;
}

function defaultActionPlanPositionForAction(actionType) {
  return ZERO_POSITION_ACTIONS.has(normalizeActionPlanAction(actionType)) ? "0%" : DEFAULT_ACTION_PLAN_POSITION;
}

function normalizeActionPlan(item = {}, sortOrder = 0) {
  const supportLevels = String(item.supportLevels || item.support_levels || "").trim();
  const resistanceLevels = String(item.resistanceLevels || item.resistance_levels || "").trim();
  const keyLevels = String(item.keyLevels || item.key_levels || "").trim();
  const marketType = ["美股", "大A"].includes(item.marketType || item.market_type) ? (item.marketType || item.market_type) : "美股";
  const fallbackAccount = getDefaultAccountForMarket(marketType);
  const accountId = Number(item.accountId ?? item.account_id ?? fallbackAccount?.id ?? 0) || null;
  const rawAmount = item.positionAmount ?? item.position_amount;
  const positionAmount = rawAmount == null || rawAmount === ""
    ? null
    : (Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : null);
  return {
    id: item.id ?? null,
    accountId,
    accountName: String(item.accountName || item.account_name || findAccountById(accountId)?.name || fallbackAccount?.name || "").trim(),
    symbol: String(item.symbol || "").trim().toUpperCase(),
    actionType: normalizeActionPlanAction(item.actionType || item.action_type),
    currentPosition: normalizeActionPlanPosition(item.currentPosition || item.current_position || defaultActionPlanPositionForAction(item.actionType || item.action_type)),
    positionAmount,
    entryPlan: String(item.entryPlan || item.entry_plan || "").trim(),
    takeProfitPlan: String(item.takeProfitPlan || item.take_profit_plan || "").trim(),
    stopLossPlan: String(item.stopLossPlan || item.stop_loss_plan || "").trim(),
    supportLevels,
    resistanceLevels,
    keyLevels: keyLevels || formatSupportResistanceLevels(supportLevels, resistanceLevels),
    thinking: String(item.thinking || "").trim(),
    marketType,
    sortOrder,
  };
}

function mapAmountToPositionBucket(amount, totalAssets) {
  const num = Number(amount);
  const total = Number(totalAssets);
  if (!Number.isFinite(num) || num <= 0) return "0%";
  if (!Number.isFinite(total) || total <= 0) return null;
  const ratio = (num / total) * 100;
  if (ratio <= 0.0001) return "0%";
  if (ratio <= 5) return "0-5%";
  if (ratio <= 10) return "5%-10%";
  if (ratio <= 15) return "10%-15%";
  if (ratio <= 20) return "15%-20%";
  if (ratio <= 25) return "20%-25%";
  if (ratio <= 30) return "25%-30%";
  return ">30%";
}


function formatSupportResistanceLevels(supportLevels, resistanceLevels) {
  const sections = [];
  if (supportLevels) sections.push(`支撑位：\n${supportLevels}`);
  if (resistanceLevels) sections.push(`压力位：\n${resistanceLevels}`);
  return sections.join("\n\n");
}

function positionColorClass(position) {
  switch (String(position || "").trim()) {
    case "0%":      return "pos-0";
    case "0-5%":    return "pos-5";
    case "5%-10%":  return "pos-10";
    case "10%-15%": return "pos-15";
    case "15%-20%": return "pos-20";
    case "20%-25%": return "pos-25";
    case "25%-30%": return "pos-30";
    case ">30%":    return "pos-max";
    default:        return "pos-0";
  }
}

function autoResizeTextarea(el) {
  if (!el || !el.isConnected) return;
  el.style.height = "0px";
  const nextHeight = Math.max(el.scrollHeight + 2, 42);
  el.style.height = `${nextHeight}px`;
}

function scheduleTextareaResize(el) {
  window.requestAnimationFrame(() => autoResizeTextarea(el));
}

function resizeStructuredNoteTextareas() {
  reviewForm.querySelectorAll(".note-sub textarea").forEach(autoResizeTextarea);
}

function scheduleStructuredNoteTextareaResize() {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(resizeStructuredNoteTextareas);
  });
}

function resizeActionPlanTextareas() {
  [
    actionPlanEntryInput,
    actionPlanTakeProfitInput,
    actionPlanStopLossInput,
    actionPlanSupportLevelsInput,
    actionPlanResistanceLevelsInput,
    actionPlanThinkingInput,
  ].filter(Boolean).forEach(autoResizeTextarea);
}

function normalizeActionPlans(items = []) {
  const seen = new Set();
  const normalized = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const plan = normalizeActionPlan(item, normalized.length);
    const key = `${plan.accountId || 0}::${plan.symbol}`;
    if (!plan.symbol || seen.has(key)) return;
    seen.add(key);
    normalized.push(plan);
  });
  return normalized;
}

function formatActionPlansMarkdown(items = []) {
  const groups = new Map();
  normalizeActionPlans(items).forEach((plan) => {
    const accountName = accountNameForPlan(plan);
    if (!groups.has(accountName)) groups.set(accountName, []);
    groups.get(accountName).push(plan);
  });
  return [...groups.entries()].map(([accountName, plans]) => {
    const body = plans.map((plan) => {
    const lines = [
      `### ${plan.symbol}`,
      `- 动作：${plan.actionType}`,
      `- 当前仓位：${plan.currentPosition}`,
    ];
    [
      ["每日记录", plan.entryPlan],
      ["止盈计划", plan.takeProfitPlan],
      ["止损计划", plan.stopLossPlan],
      ["支撑位", plan.supportLevels],
      ["压力位", plan.resistanceLevels],
      ["思考", plan.thinking],
    ].forEach(([label, value]) => {
      if (!value) return;
      if (value.includes("\n")) {
        lines.push(`- ${label}：\n${value.split("\n").map((line) => (line ? `  ${line}` : "")).join("\n")}`);
      } else {
        lines.push(`- ${label}：${value}`);
      }
    });
    return lines.join("\n");
    }).join("\n\n");
    return `## ${accountName}\n\n${body}`;
  }).join("\n\n");
}

function formatChineseMonthDay(dateString) {
  const match = String(dateString || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${Number(match[1])} 月 ${Number(match[2])} 日：`;
}

function renderActionPlanTextCell(value, className = "") {
  const text = String(value || "").trim();
  const shouldShowTooltip = text.length > 18 || text.includes("\n");
  const tooltipAttr = shouldShowTooltip ? ` data-full-text="${escapeAttribute(text)}"` : "";
  return `<div class="action-plan-cell-text ${className}"${tooltipAttr}>${escapeHtml(text)}</div>`;
}

function findActionPlanSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  return state.actionPlanSymbolCatalog.find((item) => item.symbol === normalized) || null;
}

function actionPlanSymbolLabel(symbol) {
  return symbol || "未命名";
}

function actionPlanStatusClass(actionType) {
  const normalized = normalizeActionPlanAction(actionType);
  if (normalized === "准备开仓") return "status-open";
  if (normalized === "已清仓复盘") return "status-closed";
  return "status-hold";
}

function showActionPlanCellTooltip(event) {
  const text = event.currentTarget?.dataset?.fullText || "";
  if (!actionPlanCellTooltip || !text.trim()) return;
  actionPlanCellTooltip.textContent = text;
  actionPlanCellTooltip.classList.remove("hidden");
  positionActionPlanCellTooltip(event);
}

function positionActionPlanCellTooltip(event) {
  if (!actionPlanCellTooltip || actionPlanCellTooltip.classList.contains("hidden")) return;
  const viewportPadding = 12;
  const cursorOffset = 14;
  const rect = actionPlanCellTooltip.getBoundingClientRect();
  let left = event.clientX + cursorOffset;
  let top = event.clientY + cursorOffset;
  if (left + rect.width > window.innerWidth - viewportPadding) {
    left = event.clientX - rect.width - cursorOffset;
  }
  if (top + rect.height > window.innerHeight - viewportPadding) {
    top = event.clientY - rect.height - cursorOffset;
  }
  actionPlanCellTooltip.style.left = `${Math.max(viewportPadding, left)}px`;
  actionPlanCellTooltip.style.top = `${Math.max(viewportPadding, top)}px`;
}

function hideActionPlanCellTooltip() {
  if (!actionPlanCellTooltip) return;
  actionPlanCellTooltip.classList.add("hidden");
  actionPlanCellTooltip.textContent = "";
}

function actionPlanTableHtml(tbodyId) {
  return `
    <div class="action-plan-table-wrap">
      <table class="action-plan-table">
        <colgroup>
          <col class="col-symbol">
          <col class="col-position">
          <col class="col-entry">
          <col class="col-take-profit">
          <col class="col-stop-loss">
          <col class="col-support">
          <col class="col-resistance">
          <col class="col-thinking">
        </colgroup>
        <thead>
          <tr>
            <th>标的 / 动作</th>
            <th>当前仓位</th>
            <th>每日记录</th>
            <th>止盈计划</th>
            <th>止损计划</th>
            <th>支撑位</th>
            <th>压力位</th>
            <th>思考</th>
          </tr>
        </thead>
        <tbody id="${escapeAttribute(tbodyId)}"></tbody>
      </table>
    </div>`;
}

function actionPlanTbodyId(account) {
  const prefix = isLiveActionPlanMode() ? "live" : "";
  if (account?.name === "老虎-美股") return `${prefix}actionPlanRowsUs`;
  if (account?.name === "东方财富-国内") return `${prefix}actionPlanRowsCn`;
  return `${prefix}ActionPlanRowsAccount${account.id}`;
}

function getActionPlanAccountAnchor(account) {
  return `review-action-account-${Number(account?.id || 0)}`;
}

function getActionPlanRowAnchor(index) {
  return `review-action-plan-${index}`;
}

function legacyActionPlanControlIds(account) {
  if (isLiveActionPlanMode()) return { add: "", sort: "", empty: "" };
  if (account?.name === "老虎-美股") {
    return { add: "addActionPlanUsBtn", sort: "sortActionPlansUsBtn", empty: "emptyActionPlanStateUs" };
  }
  if (account?.name === "东方财富-国内") {
    return { add: "addActionPlanCnBtn", sort: "sortActionPlansCnBtn", empty: "emptyActionPlanStateCn" };
  }
  return { add: "", sort: "", empty: "" };
}

function renderActionPlanGroup(tbody, account) {
  if (!tbody || !account) return 0;
  const selected = state.selectedActionPlanIndex;
  const rows = state.actionPlans
    .map((plan, index) => ({ plan, index }))
    .filter(({ plan }) => Number(plan.accountId || 0) === Number(account.id));
  tbody.innerHTML = rows.map(({ plan, index }) => `
    <tr id="${escapeAttribute(getActionPlanRowAnchor(index))}" class="${index === selected ? "selected" : ""}" data-index="${index}">
      <td class="action-plan-target-cell">
        <div class="action-plan-target-stack">
          <strong class="action-plan-symbol">${escapeHtml(actionPlanSymbolLabel(plan.symbol))}</strong>
          <span class="action-plan-status-pill ${actionPlanStatusClass(plan.actionType)}">${escapeHtml(plan.actionType)}</span>
          ${isLiveActionPlanMode() ? `<button type="button" class="ghost compact-button action-plan-inline-edit" data-action="edit-row" data-index="${escapeAttribute(String(index))}">编辑</button>` : ""}
        </div>
      </td>
      <td><span class="action-plan-position ${positionColorClass(plan.currentPosition)}">${escapeHtml(plan.currentPosition)}</span></td>
      <td>${renderActionPlanTextCell(plan.entryPlan)}</td>
      <td>${renderActionPlanTextCell(plan.takeProfitPlan)}</td>
      <td>${renderActionPlanTextCell(plan.stopLossPlan)}</td>
      <td>${renderActionPlanTextCell(plan.supportLevels, "action-plan-levels")}</td>
      <td>${renderActionPlanTextCell(plan.resistanceLevels, "action-plan-levels")}</td>
      <td>${renderActionPlanTextCell(plan.thinking)}</td>
    </tr>
  `).join("");
  tbody.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => selectActionPlan(Number(row.dataset.index)));
  });
  tbody.querySelectorAll("[data-action='edit-row']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selectActionPlan(Number(button.dataset.index));
    });
  });
  tbody.querySelectorAll("[data-full-text]").forEach((cell) => {
    cell.addEventListener("mouseenter", showActionPlanCellTooltip);
    cell.addEventListener("mousemove", positionActionPlanCellTooltip);
    cell.addEventListener("mouseleave", hideActionPlanCellTooltip);
  });
  const tableWrap = tbody.closest(".action-plan-table-wrap");
  if (tableWrap) tableWrap.classList.toggle("hidden", rows.length === 0);
  bindHorizontalWheelScroll(tableWrap);
  return rows.length;
}

function bindHorizontalWheelScroll(element) {
  if (!element || element.dataset.horizontalWheelBound === "1") return;
  element.dataset.horizontalWheelBound = "1";
  element.addEventListener("wheel", (event) => {
    if (!event.shiftKey) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    element.scrollLeft += delta;
  }, { passive: false });
}

function renderImpactMeterHtml(summary) {
  const MAX_PERCENT = 4;
  const raw = Number(summary?.valuePercent);
  const hasValue = Number.isFinite(raw) && summary?.rangeLabel !== "暂无数据" && summary?.rangeLabel !== "已记录";
  if (!hasValue) {
    return `<span class="impact-empty-inline">${escapeHtml(summary?.rangeLabel || "暂无数据")}</span>`;
  }
  const abs = Math.min(Math.abs(raw), MAX_PERCENT);
  const cols = abs < 0.05 ? 1 : Math.min(Math.ceil(abs), 4);
  const direction = raw > 0.05 ? "gain" : raw < -0.05 ? "loss" : "gain";
  const dotPosInCols = abs < 0.05 ? 0.12 : (abs / MAX_PERCENT) / (cols / 4);
  const dotPercent = Math.max(6, Math.min(dotPosInCols * 100, 97));
  const segments = Array.from({ length: cols }, () => `<div class="impact-seg"></div>`).join("");
  return `<div class="impact-meter-cut cols-${cols} ${direction}" title="${escapeAttribute(summary?.rangeLabel || "账户影响")}">${segments}<div class="impact-dot" style="left: ${dotPercent}%"></div></div>`;
}

function renderActionPlanAccountImpact(account, summary) {
  return `
    <div class="action-plan-account-impact" aria-label="${escapeAttribute(`${account.name || "账户"}账户影响`)}">
      <span class="action-plan-account-impact-label">账户影响</span>
      ${renderImpactMeterHtml(summary)}
    </div>
  `;
}

function renderActionPlans(options = {}) {
  syncLegacyAssetPlanField();
  const rootEl = getActionPlanRenderRoot();
  const readOnly = isActionPlanEditorReadOnly();
  const snapshot = normalizeAccountSnapshot(state.accountSnapshot, state.investmentAccounts);
  state.accountSnapshot = snapshot;
  const impactByAccountId = new Map(accountImpactItemsForDisplay(snapshot, readOnly)
    .map((item) => [Number(item.accountId), item]));
  const selectedPlan = state.actionPlans[state.selectedActionPlanIndex] || null;
  const groupItems = selectedPlan
    ? state.actionPlans.filter((p) => Number(p.accountId || 0) === Number(selectedPlan.accountId || 0))
    : [];
  const posInGroup = selectedPlan ? groupItems.indexOf(selectedPlan) : -1;
  if (rootEl) {
    const visibleAccounts = getActionPlanVisibleAccounts();
    const liveMode = isLiveActionPlanMode();
    rootEl.innerHTML = visibleAccounts.map((account) => {
      const accountIdStr = escapeAttribute(String(account.id));
      const fundsLine = `${escapeHtml(account.currency)} · 总资产 ${escapeHtml(formatAccountMoney(account.totalAssets, account.currency))} · 可用 ${escapeHtml(formatAccountMoney(account.availableCash, account.currency))}`;
      const editButtonHtml = `<button type="button" class="account-edit-btn" data-action="edit-account" data-account-id="${accountIdStr}" title="编辑账户">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z"/></svg>
           <span>编辑</span>
         </button>`;
      const impactHtml = renderActionPlanAccountImpact(account, impactByAccountId.get(Number(account.id)));
      return `
      <div id="${escapeAttribute(getActionPlanAccountAnchor(account))}" class="action-plan-group${liveMode ? " account-card" : ""}" data-account-id="${accountIdStr}">
        <div class="action-plan-group-head">
          <div class="action-plan-account-info">
            ${renderAccountLogoHtml(account)}
            <div class="action-plan-account-text">
              <span class="action-plan-group-label">${escapeHtml(account.name)}${account.enabled ? "" : ` <span class="symbol-visibility-badge status-hidden">已停用</span>`}${editButtonHtml}</span>
              <span class="action-plan-account-funds">${fundsLine}</span>
            </div>
          </div>
          ${impactHtml}
          <div class="action-row">
            <button ${legacyActionPlanControlIds(account).add ? `id="${legacyActionPlanControlIds(account).add}"` : ""} type="button" class="ghost compact-button" data-action="add-plan" data-account-id="${accountIdStr}">添加标的</button>
            <button ${legacyActionPlanControlIds(account).sort ? `id="${legacyActionPlanControlIds(account).sort}"` : ""} type="button" class="ghost compact-button" data-action="sort-plan" data-account-id="${accountIdStr}">自动排序</button>
            <span class="action-plan-row-tools">
              <button type="button" class="ghost compact-button" data-action="move-up" data-account-id="${accountIdStr}">上移</button>
              <button type="button" class="ghost compact-button" data-action="move-down" data-account-id="${accountIdStr}">下移</button>
              <button type="button" class="ghost compact-button danger" data-action="delete-selected" data-account-id="${accountIdStr}">删除</button>
            </span>
          </div>
        </div>
        ${actionPlanTableHtml(actionPlanTbodyId(account))}
        <div ${legacyActionPlanControlIds(account).empty ? `id="${legacyActionPlanControlIds(account).empty}"` : ""} class="empty-state hidden">${liveMode ? "这个账户暂无标的，点击「添加标的」开始维护。" : "这个账户还没有操作计划，点击“添加标的”开始填写。"}</div>
      </div>
    `;
    }).join("");
    rootEl.querySelectorAll("[data-action='add-plan']").forEach((button) => {
      const account = findAccountById(button.dataset.accountId);
      button.disabled = readOnly || (isLiveActionPlanMode() && account && !account.enabled);
      if (button.disabled && isLiveActionPlanMode() && account && !account.enabled) {
        button.title = "账户已停用，无法新增标的";
      }
      button.addEventListener("click", () => addActionPlanForAccount(Number(button.dataset.accountId)));
    });
    rootEl.querySelectorAll("[data-action='sort-plan']").forEach((button) => {
      const accountId = Number(button.dataset.accountId);
      const count = state.actionPlans.filter((plan) => Number(plan.accountId) === accountId).length;
      button.disabled = readOnly || count < 2;
      button.addEventListener("click", () => sortActionPlansByAccountPosition(accountId));
    });
    rootEl.querySelectorAll("[data-action='move-up']").forEach((button) => {
      button.addEventListener("click", () => moveActionPlan(-1));
    });
    rootEl.querySelectorAll("[data-action='move-down']").forEach((button) => {
      button.addEventListener("click", () => moveActionPlan(1));
    });
    rootEl.querySelectorAll("[data-action='delete-selected']").forEach((button) => {
      button.addEventListener("click", () => deleteSelectedActionPlan());
    });
    rootEl.querySelectorAll("[data-action='edit-account']").forEach((button) => {
      const accountId = Number(button.dataset.accountId);
      const account = findAccountById(accountId);
      if (!account) {
        button.disabled = true;
        return;
      }
      button.addEventListener("click", () => showAccountForm(account));
    });
    visibleAccounts.forEach((account) => {
      const tbody = rootEl.querySelector(`#${CSS.escape(actionPlanTbodyId(account))}`);
      const count = renderActionPlanGroup(tbody, account);
      tbody?.closest(".action-plan-group")?.querySelector(".empty-state")?.classList.toggle("hidden", count > 0);
    });
  }
  const hasPlans = state.actionPlans.length > 0;
  rootEl?.querySelectorAll("[data-action='move-up']").forEach((button) => {
    const sameAccount = Number(button.dataset.accountId || 0) === Number(selectedPlan?.accountId || 0);
    button.disabled = readOnly || !sameAccount || posInGroup <= 0;
  });
  rootEl?.querySelectorAll("[data-action='move-down']").forEach((button) => {
    const sameAccount = Number(button.dataset.accountId || 0) === Number(selectedPlan?.accountId || 0);
    button.disabled = readOnly || !sameAccount || posInGroup < 0 || posInGroup >= groupItems.length - 1;
  });
  rootEl?.querySelectorAll("[data-action='delete-selected']").forEach((button) => {
    const sameAccount = Number(button.dataset.accountId || 0) === Number(selectedPlan?.accountId || 0);
    button.disabled = readOnly || !sameAccount || state.selectedActionPlanIndex < 0;
  });
  if (!hasPlans) closeActionPlanDetail();
  applyActionPlanReadOnly(readOnly);
  if (!isLiveActionPlanMode()) {
    if (!readOnly && options.refreshImpact !== false) scheduleAccountImpactPreview();
    renderReviewOutline();
  }
}

function renderActionPlanSymbolOptions(selectedSymbol = "") {
  if (!actionPlanSymbolSelect) return;
  const selected = String(selectedSymbol || "").trim().toUpperCase();
  const existing = selected && !state.actionPlanSymbolCatalog.some((item) => item.symbol === selected)
    ? [{ symbol: selected, displayName: selected, symbolType: "stock", unmanaged: true }]
    : [];
  const options = [...existing, ...state.actionPlanSymbolCatalog];
  actionPlanSymbolSelect.innerHTML = options.map((item) => {
    const label = item.displayName && item.displayName !== item.symbol
      ? `${item.displayName} / ${item.symbol}`
      : item.symbol;
    const suffix = item.unmanaged ? "（未在标的管理）" : "";
    return `<option value="${escapeHtml(item.symbol)}" ${item.symbol === selected ? "selected" : ""}>${escapeHtml(label + suffix)}</option>`;
  }).join("");
}

function renderActionPlanAccountOptions(selectedAccountId = null) {
  if (!actionPlanAccountSelect) return;
  const selected = Number(selectedAccountId || 0);
  const accounts = getActionPlanVisibleAccounts();
  actionPlanAccountSelect.innerHTML = accounts.map((account) => {
    const isSelected = Number(account.id) === selected;
    const isDisabled = isLiveActionPlanMode() && !account.enabled && !isSelected;
    const suffix = account.enabled ? "" : "（已停用）";
    return `<option value="${escapeAttribute(String(account.id))}" ${isSelected ? "selected" : ""} ${isDisabled ? "disabled" : ""}>${escapeHtml(account.name + suffix)}</option>`;
  }).join("");
}

function getActionPlanVisibleAccounts() {
  if (isLiveActionPlanMode()) {
    return state.investmentAccounts.slice();
  }
  const referenced = new Set(state.actionPlans.map((plan) => Number(plan.accountId || 0)).filter(Boolean));
  const accounts = state.investmentAccounts.filter((account) => account.enabled || referenced.has(Number(account.id)));
  if (accounts.length) return accounts;
  return [{
    id: 0,
    name: "未分配账户",
    currency: "CNY",
    totalAssets: null,
    availableCash: null,
    enabled: true,
    sortOrder: 999,
  }];
}

function formatMetricNumber(value) {
  if (value == null || value === "") return "暂无";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "暂无";
}

function formatMetricPercent(value) {
  if (value == null || value === "") return "暂无";
  const number = Number(value);
  if (!Number.isFinite(number)) return "暂无";
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function setMetricValue(metric, value) {
  const card = actionPlanMetrics?.querySelector(`[data-metric="${metric}"]`);
  const target = card?.querySelector("strong");
  if (target) target.textContent = value;
  if (card) {
    card.classList.toggle("metric-up", String(value).startsWith("+"));
    card.classList.toggle("metric-down", String(value).startsWith("-"));
  }
}

function renderActionPlanMetrics(symbol) {
  if (!actionPlanMetrics) return;
  const metrics = findActionPlanSymbol(symbol)?.metrics || {};
  setMetricValue("latest-price", formatMetricNumber(metrics.latestPrice));
  setMetricValue("day-change", formatMetricPercent(metrics.dayChangePercent));
  setMetricValue("week-change", formatMetricPercent(metrics.weekChangePercent));
  setMetricValue("month-change", formatMetricPercent(metrics.monthChangePercent));
}

function fillActionPlanEditor(plan) {
  if (!plan) return;
  renderActionPlanAccountOptions(plan.accountId || "");
  if (actionPlanAccountSelect) actionPlanAccountSelect.value = String(plan.accountId || "");
  if (actionPlanSymbolInput) actionPlanSymbolInput.value = plan.symbol || "";
  renderActionPlanSymbolOptions(plan.symbol || "");
  if (actionPlanSymbolSelect) actionPlanSymbolSelect.value = plan.symbol || "";
  renderActionPlanMetrics(plan.symbol || "");
  if (actionPlanActionSelect) actionPlanActionSelect.value = normalizeActionPlanAction(plan.actionType);
  if (actionPlanPositionSelect) actionPlanPositionSelect.value = normalizeActionPlanPosition(plan.currentPosition);
  if (actionPlanPositionAmountInput) {
    actionPlanPositionAmountInput.value = plan.positionAmount != null
      ? Number((plan.positionAmount / 10000).toFixed(4))
      : "";
  }
  if (actionPlanSupportLevelsInput) actionPlanSupportLevelsInput.value = plan.supportLevels || "";
  if (actionPlanResistanceLevelsInput) actionPlanResistanceLevelsInput.value = plan.resistanceLevels || "";
  if (actionPlanEntryInput) actionPlanEntryInput.value = plan.entryPlan || "";
  if (actionPlanTakeProfitInput) actionPlanTakeProfitInput.value = plan.takeProfitPlan || "";
  if (actionPlanStopLossInput) actionPlanStopLossInput.value = plan.stopLossPlan || "";
  if (actionPlanThinkingInput) actionPlanThinkingInput.value = plan.thinking || "";
  resizeActionPlanTextareas();
}

function selectActionPlan(index) {
  if (index < 0 || index >= state.actionPlans.length) return;
  hideActionPlanCellTooltip();
  openActionPlanDetail(index);
}

function syncZeroPositionForAction() {
  if (!actionPlanActionSelect || !actionPlanPositionSelect) return;
  if (ZERO_POSITION_ACTIONS.has(actionPlanActionSelect.value)) {
    actionPlanPositionSelect.value = "0%";
  }
}

function syncSelectedActionPlanFromEditor() {
  const index = state.selectedActionPlanIndex;
  if (index < 0 || index >= state.actionPlans.length) return;
  const actionType = actionPlanActionSelect.value;
  const currentPosition = ZERO_POSITION_ACTIONS.has(actionType)
    ? "0%"
    : actionPlanPositionSelect.value;
  if (actionPlanPositionSelect.value !== currentPosition) {
    actionPlanPositionSelect.value = currentPosition;
  }
  const selectedSymbol = String(actionPlanSymbolSelect?.value || actionPlanSymbolInput?.value || "").trim().toUpperCase();
  const selectedAccountId = Number(actionPlanAccountSelect?.value || state.actionPlans[index].accountId || 0);
  const duplicate = state.actionPlans.some((plan, i) => i !== index && plan.symbol === selectedSymbol && Number(plan.accountId || 0) === selectedAccountId);
  if (duplicate) {
    window.alert(`${accountNameForPlan({ accountId: selectedAccountId })} 中已经有 ${selectedSymbol}，不能重复添加。`);
    return false;
  }
  if (actionPlanSymbolInput) actionPlanSymbolInput.value = selectedSymbol;
  const account = findAccountById(selectedAccountId);
  const positionAmountRaw = actionPlanPositionAmountInput?.value;
  const positionAmountWan = positionAmountRaw == null || positionAmountRaw === ""
    ? null
    : (Number.isFinite(Number(positionAmountRaw)) ? Number(positionAmountRaw) : null);
  const positionAmount = positionAmountWan == null ? null : Math.round(positionAmountWan * 10000 * 100) / 100;
  state.actionPlans[index] = normalizeActionPlan({
    ...state.actionPlans[index],
    accountId: selectedAccountId,
    accountName: account?.name || state.actionPlans[index].accountName,
    symbol: selectedSymbol,
    actionType,
    currentPosition,
    positionAmount,
    marketType: marketTypeForAccount(account),
    supportLevels: actionPlanSupportLevelsInput.value,
    resistanceLevels: actionPlanResistanceLevelsInput.value,
    entryPlan: actionPlanEntryInput.value,
    takeProfitPlan: actionPlanTakeProfitInput.value,
    stopLossPlan: actionPlanStopLossInput.value,
    thinking: actionPlanThinkingInput.value,
  }, index);
  syncLegacyAssetPlanField();
  notifyActionPlanLocalChange();
  renderActionPlanRowsOnly();
  updateActionPlanDetailHeading();
  return true;
}

function updateActionPlanDetailHeading() {
  const symbol = String(actionPlanSymbolInput?.value || "").trim() || "未命名标的";
  const accountId = Number(actionPlanAccountSelect?.value || 0);
  const account = findAccountById(accountId);
  const accountName = account?.name || "未分配账户";
  const fundsPart = account
    ? (account.totalAssets == null
        ? `${account.currency} · 未设置总资产`
        : `${account.currency} · 总资产 ${formatAccountMoney(account.totalAssets, account.currency)}`)
    : "";
  if (actionPlanDetailTitle) {
    actionPlanDetailTitle.textContent = symbol;
  }
  if (actionPlanDetailSubtitle) {
    actionPlanDetailSubtitle.textContent = fundsPart ? `${accountName} · ${fundsPart}` : accountName;
  }
}

function openActionPlanDetail(index) {
  if (index < 0 || index >= state.actionPlans.length) return;
  state.selectedActionPlanIndex = index;
  renderActionPlanRowsOnly();
  fillActionPlanEditor(state.actionPlans[index]);
  updateActionPlanDetailHeading();
  const readOnly = isActionPlanEditorReadOnly();
  applyActionPlanReadOnly(readOnly);
  actionPlanEditor?.classList.remove("hidden");
  actionPlanDetailModal?.classList.remove("hidden");
  saveActionPlanDetailBtn?.classList.toggle("hidden", readOnly);
  requestAnimationFrame(() => {
    resizeActionPlanTextareas();
    actionPlanSymbolSelect?.focus();
  });
}

function closeActionPlanDetail() {
  hideActionPlanCellTooltip();
  actionPlanDetailModal?.classList.add("hidden");
  actionPlanEditor?.classList.add("hidden");
}

async function saveActionPlanDetailAndClose() {
  if (syncSelectedActionPlanFromEditor() === false) return;
  const ctx = getActiveActionPlanEditorContext();
  const plan = state.actionPlans[state.selectedActionPlanIndex] || null;
  try {
    if (ctx?.callbacks?.onSave && plan) {
      await ctx.callbacks.onSave(plan);
    }
    closeActionPlanDetail();
  } catch (error) {
    window.alert(`保存失败: ${error.message}`);
  }
}

function appendDailyRecordDate() {
  const marker = formatChineseMonthDay(state.activeDate);
  if (!marker || actionPlanEntryInput.readOnly) return;
  const current = actionPlanEntryInput.value;
  const needsBreak = current.trim() && !current.endsWith("\n");
  const insertion = `${needsBreak ? "\n" : ""}${marker}`;
  const start = actionPlanEntryInput.selectionStart ?? current.length;
  const end = actionPlanEntryInput.selectionEnd ?? current.length;
  const useCursor = document.activeElement === actionPlanEntryInput && start !== end;
  if (useCursor) {
    actionPlanEntryInput.setRangeText(insertion, start, end, "end");
  } else {
    actionPlanEntryInput.value = `${current}${insertion}`;
    actionPlanEntryInput.selectionStart = actionPlanEntryInput.selectionEnd = actionPlanEntryInput.value.length;
  }
  actionPlanEntryInput.focus();
  autoResizeTextarea(actionPlanEntryInput);
}

function renderActionPlanRowsOnly() {
  renderActionPlans();
}

function addActionPlan(marketType = "美股") {
  const account = getDefaultAccountForMarket(marketType);
  addActionPlanForAccount(account?.id || 0, marketType);
}

function addActionPlanForAccount(accountId, marketType = null) {
  const readOnly = isActionPlanEditorReadOnly();
  if (readOnly) return;
  const account = findAccountById(accountId) || getDefaultAccountForMarket(marketType || "美股");
  if (isLiveActionPlanMode() && account && !account.enabled) {
    window.alert("已停用账户不能新增标的。");
    return;
  }
  const resolvedAccountId = Number(account?.id || accountId || 0);
  const used = new Set(state.actionPlans
    .filter((item) => Number(item.accountId || 0) === resolvedAccountId)
    .map((item) => item.symbol)
    .filter(Boolean));
  const symbol = (state.actionPlanSymbolCatalog || []).find((item) => !used.has(item.symbol))?.symbol || "";
  if (!symbol) {
    window.alert("没有可添加的标的，请先在标的管理中新增或显示标的。");
    return;
  }
  state.actionPlans.push(normalizeActionPlan({
    accountId: resolvedAccountId,
    accountName: account?.name || "",
    symbol,
    actionType: "准备开仓",
    currentPosition: "0%",
    marketType: marketType || marketTypeForAccount(account),
  }, state.actionPlans.length));
  state.selectedActionPlanIndex = state.actionPlans.length - 1;
  notifyActionPlanLocalChange();
  renderActionPlans();
  openActionPlanDetail(state.selectedActionPlanIndex);
}

async function moveActionPlan(delta) {
  const index = state.selectedActionPlanIndex;
  if (index < 0) return;
  const plan = state.actionPlans[index];
  const groupIndices = state.actionPlans
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => Number(p.accountId || 0) === Number(plan.accountId || 0))
    .map(({ i }) => i);
  const posInGroup = groupIndices.indexOf(index);
  const targetPos = posInGroup + delta;
  if (targetPos < 0 || targetPos >= groupIndices.length) return;
  const targetIndex = groupIndices[targetPos];
  [state.actionPlans[index], state.actionPlans[targetIndex]] = [state.actionPlans[targetIndex], state.actionPlans[index]];
  state.actionPlans = state.actionPlans.map((p, sortOrder) => ({ ...p, sortOrder }));
  state.selectedActionPlanIndex = targetIndex;
  notifyActionPlanLocalChange();
  renderActionPlans();
  const ctx = getActiveActionPlanEditorContext();
  if (ctx?.callbacks?.onReorder) {
    try {
      await ctx.callbacks.onReorder(state.actionPlans.slice());
    } catch (error) {
      window.alert(`排序保存失败: ${error.message}`);
    }
  }
}

function actionPlanPositionScore(plan) {
  const value = String(plan?.currentPosition || "").trim();
  if (value === ">30%") return 40;
  const match = value.match(/(\d+)\s*%-\s*(\d+)\s*%/);
  if (match) return Number(match[2]);
  const single = value.match(/(\d+)\s*%/);
  return single ? Number(single[1]) : -1;
}

function sortActionPlansByPosition(marketType) {
  const account = getDefaultAccountForMarket(marketType);
  sortActionPlansByAccountPosition(account?.id || 0);
}

async function sortActionPlansByAccountPosition(accountId) {
  const readOnly = isActionPlanEditorReadOnly();
  if (readOnly) return;
  const selected = state.actionPlans[state.selectedActionPlanIndex] || null;
  const groupIndices = state.actionPlans
    .map((p, i) => i)
    .filter((i) => Number(state.actionPlans[i].accountId || 0) === Number(accountId || 0));
  if (groupIndices.length < 2) return;
  const sortedGroup = groupIndices
    .map((i) => ({ plan: state.actionPlans[i], i }))
    .sort((a, b) => {
      const scoreDiff = actionPlanPositionScore(b.plan) - actionPlanPositionScore(a.plan);
      return scoreDiff || a.i - b.i;
    });
  sortedGroup.forEach(({ plan }, pos) => {
    state.actionPlans[groupIndices[pos]] = plan;
  });
  state.actionPlans = state.actionPlans.map((p, sortOrder) => ({ ...p, sortOrder }));
  if (selected) {
    state.selectedActionPlanIndex = state.actionPlans.indexOf(selected);
  }
  notifyActionPlanLocalChange();
  renderActionPlans();
  const ctx = getActiveActionPlanEditorContext();
  if (ctx?.callbacks?.onReorder) {
    try {
      await ctx.callbacks.onReorder(state.actionPlans.slice());
    } catch (error) {
      window.alert(`排序保存失败: ${error.message}`);
    }
  }
}

async function deleteSelectedActionPlan() {
  const index = state.selectedActionPlanIndex;
  if (index < 0 || index >= state.actionPlans.length) return;
  const removed = state.actionPlans[index];
  const ctx = getActiveActionPlanEditorContext();
  if (ctx?.mode === "live" && !window.confirm(`确认删除标的「${removed.symbol || "未命名"}」？`)) return;
  state.actionPlans.splice(index, 1);
  state.actionPlans = state.actionPlans.map((plan, sortOrder) => ({ ...plan, sortOrder }));
  state.selectedActionPlanIndex = state.actionPlans.length ? Math.min(index, state.actionPlans.length - 1) : -1;
  closeActionPlanDetail();
  notifyActionPlanLocalChange();
  renderActionPlans();
  if (ctx?.callbacks?.onDelete) {
    try {
      await ctx.callbacks.onDelete(removed);
    } catch (error) {
      window.alert(`删除失败: ${error.message}`);
    }
  }
}

function syncLegacyAssetPlanField() {
}

function applyActionPlanReadOnly(readOnly) {
  [
    actionPlanAccountSelect,
    actionPlanSymbolInput,
    actionPlanSymbolSelect,
    actionPlanActionSelect,
    actionPlanPositionSelect,
    actionPlanSupportLevelsInput,
    actionPlanResistanceLevelsInput,
    actionPlanEntryInput,
    appendDailyRecordDateBtn,
    actionPlanTakeProfitInput,
    actionPlanStopLossInput,
    actionPlanThinkingInput,
  ].filter(Boolean).forEach((field) => {
    field.disabled = readOnly;
    if ("readOnly" in field) field.readOnly = readOnly;
  });
}

function initMdTabs() {
  reviewForm.querySelectorAll("textarea").forEach((ta) => {
    if (ta.dataset.noMd !== undefined) return;
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
    if (ta.dataset.noMd !== undefined) return;
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
    renderReviewOutline();
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
    const topStars = Number(items[0]?.importance_stars || 0);
    const starsSuffix = items.length && topStars > 0 ? ` · 最高 ${formatStarLabel(topStars)}` : "";
    head.innerHTML = `<h4>${label}</h4><small>${items.length} 条${starsSuffix}</small>`;

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
  renderReviewOutline();
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

  // header: 标题 + 时间·来源（对齐 demo .news-card header）
  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = item.ai_summary || item.title || item.content || "未命名新闻";
  const meta = document.createElement("span");
  meta.textContent = `${item.pub_date || "未知时间"} · ${formatNewsSource(item.source, item.sub_source)}`;
  header.append(title, meta);

  // 市场影响段
  const impact = document.createElement("p");
  impact.textContent = item.market_impact || item.rule_reason || "暂无市场影响说明";

  // footer: 星级 + 类型 + 标的 + 查看新闻按钮（保留原 handler）
  const footer = document.createElement("footer");
  const stars = document.createElement("span");
  stars.className = "review-news-stars";
  stars.textContent = formatStarLabel(item.importance_stars);
  footer.append(stars);
  const typeSpan = document.createElement("span");
  typeSpan.textContent = formatNewsType(item.type);
  footer.append(typeSpan);
  (item.related_symbols || []).slice(0, 3).forEach((symbol) => {
    const s = document.createElement("span");
    s.textContent = symbol;
    footer.append(s);
  });
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost review-news-detail-btn";
  button.textContent = "查看新闻";
  button.addEventListener("click", () => openNewsDetailFromItem(item));
  footer.append(button);

  article.append(header, impact, footer);
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
  // 已复盘后整条步骤导航不再需要，靠目录跳转即可
  reviewStepNav.classList.toggle("hidden", state.reviewStatus === "reviewed");

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
  scheduleStructuredNoteTextareaResize();

  const index = REVIEW_STEPS.findIndex((step) => step.key === state.reviewStep);
  // 已复盘后 step-nav 已隐藏，没有"上方标记"可点，把提示也清掉
  reviewStepHint.textContent = reviewedMode ? "" : REVIEW_STEPS[index]?.hint || "";
  reviewStepHint.classList.toggle("hidden", reviewedMode || !reviewStepHint.textContent);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountSnapshot: collectAccountSnapshotPayload() }),
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
  if (step.key === "plan") {
    return state.actionPlans.length ? formatActionPlansMarkdown(state.actionPlans) : "";
  }
  if (step.key === "market") {
    return reviewNoteBlocksHaveContent(state.reviewNoteBlocks.marketSentiment) ? "structured" : "";
  }
  if (step.key === "rotation") {
    return reviewNoteBlocksHaveContent(state.reviewNoteBlocks.sectorRotation) ? "structured" : "";
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

  if (step.key === "plan") {
    const validPlans = normalizeActionPlans(state.actionPlans).filter((plan) => plan.symbol);
    if (!validPlans.length) {
      if (showAlert) window.alert("请先添加至少一条结构化操作计划。");
      return false;
    }
    if (state.actionPlans.length && !validPlans.length) {
      if (showAlert) window.alert("请先填写操作计划的标的代码。");
      return false;
    }
    return true;
  }
  if (step.key === "market" || step.key === "rotation") {
    const field = step.key === "market" ? "marketSentiment" : "sectorRotation";
    if (!reviewNoteBlocksHaveContent(state.reviewNoteBlocks[field])) {
      if (showAlert) window.alert(`请先完成“${step.label}”这一步。`);
      return false;
    }
    return true;
  }

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
  reviewDrawer.classList.toggle("review-readonly", readOnly);
  prevStepBtn.disabled = readOnly || REVIEW_STEPS.findIndex((step) => step.key === state.reviewStep) <= 0;
  nextStepBtn.disabled = readOnly ? true : false;
  syncMdPreviews(readOnly);
  Array.from(reviewForm.elements).forEach((field) => {
    if ("readOnly" in field) field.readOnly = readOnly;
    if ("disabled" in field && field.type !== "hidden") field.disabled = readOnly && field.type === "checkbox";
  });
  applyActionPlanReadOnly(readOnly);
  renderActionPlans();
  renderStructuredNoteEditors();
  // 非编辑状态（已复盘且未点编辑）整个隐藏保存按钮，而不是 disabled 灰显
  saveDraftBtn.classList.toggle("hidden", readOnly);
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

function escapeAttribute(value) {
  return escapeHtml(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

// ========== Investment Accounts ==========

function normalizeInvestmentAccount(item = {}) {
  return {
    id: Number(item.id || 0),
    name: String(item.name || "").trim(),
    broker: String(item.broker || "").trim(),
    accountType: String(item.accountType || item.account_type || "stock").trim(),
    region: String(item.region || "").trim(),
    currency: String(item.currency || "CNY").trim().toUpperCase(),
    totalAssets: item.totalAssets ?? item.total_assets ?? null,
    availableCash: item.availableCash ?? item.available_cash ?? null,
    enabled: item.enabled === false || Number(item.enabled) === 0 ? false : true,
    sortOrder: Number(item.sortOrder ?? item.sort_order ?? 0),
    notes: String(item.notes || "").trim(),
  };
}

function normalizeInvestmentAccounts(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeInvestmentAccount)
    .filter((item) => item.id && item.name)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

function accountTypeLabel(type) {
  return { stock: "股票", fund: "基金", mixed: "综合" }[type] || type || "股票";
}

function formatAccountMoney(value, currency = "CNY") {
  if (value == null || value === "") return "未填写";
  const number = Number(value);
  if (!Number.isFinite(number)) return "未填写";
  const prefix = currency === "USD" ? "$" : currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${(number / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}万`;
}

function normalizeSnapshotNumber(value) {
  if (value == null || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "";
}

function normalizeAccountImpact(item = null) {
  if (!item || typeof item !== "object") return null;
  const valuePercent = item.valuePercent ?? item.value_percent;
  const contributors = Number(item.contributors ?? 0);
  const skippedReasons = Array.isArray(item.skippedReasons)
    ? item.skippedReasons
    : Array.isArray(item.skipped_reasons)
      ? item.skipped_reasons
      : [];
  return {
    source: item.source || "estimate",
    label: item.label || "账户估算影响",
    valuePercent: valuePercent == null || valuePercent === "" ? null : Number(valuePercent),
    rangeLabel: item.rangeLabel || item.range_label || "暂无数据",
    direction: item.direction || "flat",
    contributors: Number.isFinite(contributors) ? contributors : 0,
    skippedReasons: skippedReasons.map((reason) => String(reason || "").trim()).filter(Boolean),
  };
}

function normalizeAccountImpactSummary(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const impact = normalizeAccountImpact(item);
      if (!impact) return null;
      return {
        accountId: Number(item.accountId ?? item.account_id ?? 0) || null,
        accountName: item.accountName || item.account_name || "",
        currency: item.currency || "CNY",
        ...impact,
      };
    })
    .filter(Boolean);
}

function normalizeAccountSnapshot(snapshot, accounts = []) {
  const source = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];
  const snapshotById = new Map(source.map((item) => [Number(item.accountId ?? item.account_id), item]));
  const items = accounts
    .filter((account) => account.enabled && account.name !== "未分配账户")
    .map((account) => {
      const existing = snapshotById.get(Number(account.id)) || {};
      return {
        accountId: Number(account.id),
        accountName: existing.accountName || existing.account_name || account.name,
        currency: existing.currency || account.currency,
        totalAssets: normalizeSnapshotNumber(existing.totalAssets ?? existing.total_assets ?? account.totalAssets),
        availableCash: normalizeSnapshotNumber(existing.availableCash ?? existing.available_cash ?? account.availableCash),
        netCashFlow: normalizeSnapshotNumber(existing.netCashFlow ?? existing.net_cash_flow),
        dailyPnl: normalizeSnapshotNumber(existing.dailyPnl ?? existing.daily_pnl),
        dailyPnlPercent: normalizeSnapshotNumber(existing.dailyPnlPercent ?? existing.daily_pnl_percent),
        impact: normalizeAccountImpact(existing.impact),
        notes: existing.notes || "",
      };
    });
  return {
    archiveDate: snapshot?.archiveDate || state.activeDate,
    notes: snapshot?.notes || "",
    accounts: items,
  };
}

function accountImpactItemsForDisplay(snapshot, readOnly) {
  if (readOnly) {
    const saved = (snapshot.accounts || [])
      .map((account) => account.impact ? ({
        accountId: account.accountId,
        accountName: account.accountName,
        currency: account.currency,
        ...account.impact,
        source: account.impact.source || "estimated_action_plan",
        label: "已保存账户影响",
      }) : null)
      .filter(Boolean);
    if (saved.length) return saved;
  }
  return normalizeAccountImpactSummary(state.accountImpactSummary).map((item) => ({
    ...item,
    label: readOnly ? "当前估算" : "当前账户影响",
  }));
}

function scheduleAccountImpactPreview(delay = 300) {
  if (!state.activeDate || state.reviewStatus === "reviewed" && !state.editMode) return;
  window.clearTimeout(state.accountImpactPreviewTimer);
  state.accountImpactPreviewTimer = window.setTimeout(refreshAccountImpactPreview, delay);
}

async function refreshAccountImpactPreview() {
  if (!state.activeDate || state.reviewStatus === "reviewed" && !state.editMode) return;
  try {
    const result = await fetchJson(`/api/reviews/${state.activeDate}/account-impact/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPlans: normalizeActionPlans(state.actionPlans) }),
    });
    state.accountImpactSummary = normalizeAccountImpactSummary(result.accounts || []);
    renderActionPlans({ refreshImpact: false });
  } catch (error) {
    console.warn("Failed to refresh account impact preview", error);
  }
}

function collectAccountSnapshotPayload() {
  return {
    archiveDate: state.activeDate,
    accounts: [],
    notes: "",
  };
}

function findAccountById(accountId) {
  const id = Number(accountId || 0);
  return state.investmentAccounts.find((account) => Number(account.id) === id) || null;
}

function getDefaultAccountForMarket(marketType = "美股") {
  const preferred = marketType === "大A" ? "东方财富-国内" : "老虎-美股";
  return state.investmentAccounts.find((account) => account.enabled && account.name === preferred)
    || state.investmentAccounts.find((account) => account.enabled)
    || state.investmentAccounts[0]
    || null;
}

function marketTypeForAccount(account) {
  return String(account?.currency || "").toUpperCase() === "CNY" ? "大A" : "美股";
}

function accountNameForPlan(plan) {
  return findAccountById(plan.accountId)?.name || plan.accountName || "未分配账户";
}

async function loadAccounts(forceRefresh = false) {
  if (!accountLivePlans) return;
  if (accountsSummary) accountsSummary.textContent = "正在加载账户与标的...";
  accountLivePlans.innerHTML = `<div class="empty-state">加载中...</div>`;
  try {
    const [data, liveData, symbolData] = await Promise.all([
      fetchJson("/api/investment-accounts"),
      fetchJson("/api/account-live-action-plans"),
      fetchJson("/api/account-live-action-plans/symbols"),
    ]);
    state.investmentAccounts = normalizeInvestmentAccounts(data.items || []);
    state.accountLiveActionPlans = normalizeActionPlans(liveData.items || []);
    state.actionPlanSymbolCatalog = symbolData.items || [];
    state.accountsLoaded = true;
    state.accountLivePlansLoaded = true;
    renderAccountLiveActionPlans();
  } catch (error) {
    accountLivePlans.innerHTML = `<div class="empty-state">加载失败: ${escapeHtml(error.message)}</div>`;
    if (accountsSummary) accountsSummary.textContent = `加载失败: ${error.message}`;
  }
}

async function loadAccountLivePlans(forceRefresh = false) {
  if (!accountLivePlans) return;
  try {
    const [liveData, symbolData] = await Promise.all([
      fetchJson("/api/account-live-action-plans"),
      fetchJson("/api/account-live-action-plans/symbols"),
    ]);
    state.accountLiveActionPlans = normalizeActionPlans(liveData.items || []);
    state.actionPlanSymbolCatalog = symbolData.items || state.actionPlanSymbolCatalog || [];
    state.accountLivePlansLoaded = true;
    renderAccountLiveActionPlans();
  } catch (error) {
    if (accountsSummary) accountsSummary.textContent = `标的加载失败: ${error.message}`;
  }
}

function showAccountForm(prefill = {}) {
  if (!accountFormModal || !accountFormBody) return;
  const account = normalizeInvestmentAccount(prefill);
  const isEdit = Boolean(account.id);
  if (accountFormTitle) accountFormTitle.textContent = isEdit ? `编辑账户 · ${account.name || ""}`.trim() : "新增账户";
  accountFormBody.innerHTML = `
    <form id="accountForm" class="symbol-manual-form" autocomplete="off">
      <div class="symbol-manual-grid">
        <label>
          <small>账户名称</small>
          <input type="text" name="name" value="${escapeAttribute(account.name)}" required placeholder="如 老虎-美股" />
        </label>
        <label>
          <small>机构</small>
          <input type="text" name="broker" value="${escapeAttribute(account.broker)}" placeholder="如 老虎、东方财富" />
        </label>
        <label>
          <small>类型</small>
          <select name="accountType">
            <option value="stock" ${account.accountType === "stock" ? "selected" : ""}>股票</option>
            <option value="fund" ${account.accountType === "fund" ? "selected" : ""}>基金</option>
            <option value="mixed" ${account.accountType === "mixed" ? "selected" : ""}>综合</option>
          </select>
        </label>
        <label>
          <small>币种</small>
          <input type="text" name="currency" value="${escapeAttribute(account.currency)}" required placeholder="USD / CNY" />
        </label>
        <label>
          <small>总资产</small>
          <input type="number" step="0.01" name="totalAssets" value="${account.totalAssets ?? ""}" placeholder="账户整体规模" />
        </label>
        <label>
          <small>排序</small>
          <input type="number" step="1" name="sortOrder" value="${account.sortOrder || 0}" />
        </label>
        <label>
          <small>状态</small>
          <select name="enabled">
            <option value="1" ${account.enabled ? "selected" : ""}>启用</option>
            <option value="0" ${!account.enabled ? "selected" : ""}>停用</option>
          </select>
        </label>
        <label class="symbol-manual-aliases-label">
          <small>备注</small>
          <input type="text" name="notes" value="${escapeAttribute(account.notes)}" />
        </label>
      </div>
      <div class="account-form-actions">
        <div class="account-form-actions-primary">
          <button type="submit">${isEdit ? "保存账户" : "新增账户"}</button>
          <button type="button" id="accountFormCancelBtn" class="ghost">取消</button>
        </div>
        ${isEdit ? `<button type="button" id="accountFormDeleteBtn" class="ghost danger">删除账户</button>` : ""}
      </div>
    </form>
  `;
  accountFormModal.classList.remove("hidden");
  accountFormBody.querySelector("#accountFormCancelBtn").addEventListener("click", closeAccountForm);
  accountFormBody.querySelector("#accountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAccountForm(new FormData(event.target), account.id || null);
  });
  if (isEdit) {
    accountFormBody.querySelector("#accountFormDeleteBtn")?.addEventListener("click", async () => {
      const ok = await deleteAccount(account);
      if (ok) closeAccountForm();
    });
  }
  requestAnimationFrame(() => accountFormBody.querySelector("[name='name']")?.focus());
}

async function submitAccountForm(formData, id = null) {
  const payload = {
    name: String(formData.get("name") || "").trim(),
    broker: String(formData.get("broker") || "").trim(),
    accountType: formData.get("accountType"),
    currency: String(formData.get("currency") || "").trim().toUpperCase(),
    totalAssets: formData.get("totalAssets") === "" ? null : Number(formData.get("totalAssets")),
    enabled: formData.get("enabled") === "1",
    sortOrder: Number(formData.get("sortOrder") || 0),
    notes: String(formData.get("notes") || "").trim(),
  };
  if (!payload.name || !payload.currency) {
    window.alert("账户名称和币种不能为空。");
    return;
  }
  try {
    await fetchJson(id ? `/api/investment-accounts/${id}` : "/api/investment-accounts", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    closeAccountForm();
    await refreshAfterAccountChange();
  } catch (error) {
    window.alert(`账户保存失败: ${error.message}`);
  }
}

async function deleteAccount(account) {
  if (!account?.id) return false;
  const confirmed = window.confirm(`确认删除账户「${account.name}」？若该账户被复盘历史或当前标的引用，系统会阻止删除。`);
  if (!confirmed) return false;
  try {
    await fetchJson(`/api/investment-accounts/${account.id}`, { method: "DELETE" });
    await refreshAfterAccountChange();
    return true;
  } catch (error) {
    window.alert(`账户删除失败: ${error.message}`);
    return false;
  }
}

async function refreshAfterAccountChange() {
  try {
    const data = await fetchJson("/api/investment-accounts");
    state.investmentAccounts = normalizeInvestmentAccounts(data.items || []);
  } catch (error) {
    // 静默：保留旧 state，下面继续按已有数据渲染
  }
  const activeCtx = getActiveActionPlanEditorContext();
  if (activeCtx?.mode === "live") {
    await loadAccountLivePlans(true);
    return;
  }
  if (activeCtx) {
    // 复盘抽屉编辑中：state.actionPlans 不动，刷新 DOM 让账户信息更新
    renderActionPlans();
    return;
  }
  // 没有挂载的编辑器：可能用户在账户页但编辑器没起来，走完整 loadAccounts
  if (accountsView?.classList.contains("active")) {
    await loadAccounts(true);
  }
}

function renderAccountLiveActionPlans() {
  if (!accountLivePlans) return;
  const enabledCount = state.investmentAccounts.filter((account) => account.enabled).length;
  if (!state.investmentAccounts.length) {
    accountLivePlans.innerHTML = `<div class="empty-state">暂无账户，点击「新增账户」开始。</div>`;
    updateAccountsSummaryText(0, 0, 0);
    return;
  }
  state.activeAccountLivePlanEditor = mountActionPlanEditor(accountLivePlans, {
    mode: "live",
    plans: state.accountLiveActionPlans,
    symbolCatalog: state.actionPlanSymbolCatalog,
    accounts: state.investmentAccounts,
    callbacks: {
      onSave: saveAccountLivePlan,
      onDelete: deleteAccountLivePlan,
      onReorder: persistAccountLivePlanOrder,
      onLocalChange: (plans) => {
        state.accountLiveActionPlans = plans;
      },
    },
    ui: {
      showSyncHint: true,
      historicalDraftHint: false,
    },
  });
  updateAccountsSummaryText(
    state.investmentAccounts.length,
    enabledCount,
    state.accountLiveActionPlans.length,
  );
}

function updateAccountsSummaryText(accountCount, enabledCount, planCount) {
  if (!accountsSummary) return;
  if (!accountCount) {
    accountsSummary.textContent = "暂无账户，点击「新增账户」开始。";
    return;
  }
  const parts = [`共 ${accountCount} 个账户`];
  if (enabledCount !== accountCount) parts.push(`${enabledCount} 个启用`);
  parts.push(`${planCount} 个标的`);
  accountsSummary.textContent = `${parts.join(" · ")}。保存后会同步到最新复盘日。`;
}

function accountLivePlanPayload(plan) {
  return {
    accountId: Number(plan.accountId || 0),
    symbol: plan.symbol,
    actionType: plan.actionType,
    entryPlan: plan.entryPlan,
    takeProfitPlan: plan.takeProfitPlan,
    stopLossPlan: plan.stopLossPlan,
    supportLevels: plan.supportLevels,
    resistanceLevels: plan.resistanceLevels,
    keyLevels: plan.keyLevels,
    currentPosition: plan.currentPosition,
    positionAmount: plan.positionAmount ?? null,
    thinking: plan.thinking,
    marketType: plan.marketType,
    sortOrder: Number(plan.sortOrder || 0),
  };
}

async function saveAccountLivePlan(plan) {
  const payload = accountLivePlanPayload(plan);
  if (!payload.accountId || !payload.symbol) {
    throw new Error("账户和标的不能为空");
  }
  const isExisting = Number(plan.id || 0) > 0;
  await fetchJson(isExisting ? `/api/account-live-action-plans/${plan.id}` : "/api/account-live-action-plans", {
    method: isExisting ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await loadAccountLivePlans(true);
  await refreshOpenLatestReviewActionPlans();
}

async function deleteAccountLivePlan(plan) {
  if (!plan?.id) {
    await loadAccountLivePlans(true);
    return;
  }
  await fetchJson(`/api/account-live-action-plans/${plan.id}`, { method: "DELETE" });
  await loadAccountLivePlans(true);
  await refreshOpenLatestReviewActionPlans();
}

async function persistAccountLivePlanOrder(plans) {
  const persisted = plans.filter((plan) => Number(plan.id || 0) > 0);
  for (const plan of persisted) {
    await fetchJson(`/api/account-live-action-plans/${plan.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accountLivePlanPayload(plan)),
    });
  }
  await loadAccountLivePlans(true);
  await refreshOpenLatestReviewActionPlans();
}

async function refreshOpenLatestReviewActionPlans() {
  if (!state.activeDate || reviewDrawer?.classList.contains("hidden")) return;
  if (!state.latestArchiveDate || state.activeDate !== state.latestArchiveDate) return;
  if (getActiveActionPlanEditorContext()?.mode === "live") return;
  try {
    const data = await fetchJson(`/api/reviews/${state.activeDate}/bootstrap`);
    state.activeBootstrap = data;
    state.actionPlans = normalizeActionPlans(data.actionPlans || []);
    state.activeActionPlanEditor?.refresh?.(state.actionPlans);
    scheduleAccountImpactPreview(0);
  } catch (error) {
    console.warn("Failed to refresh latest review action plans", error);
  }
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
  const deleteButton = item.is_active
    ? ""
    : `<button class="symbol-hard-delete-btn" data-action="hard-delete" data-id="${escapeHtml(String(item.id))}" data-symbol="${escapeHtml(item.symbol)}">删除</button>`;

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
      ${deleteButton}
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
  row.querySelector("[data-action='hard-delete']")?.addEventListener("click", async (e) => {
    const { id, symbol } = e.currentTarget.dataset;
    if (!window.confirm(`确认彻底删除标的 ${symbol}？这个操作不会删除历史价格、新闻或复盘记录，但标的管理中将不再保留该项。`)) return;
    try {
      await fetchJson(`/api/symbols/${id}?hard=1`, { method: "DELETE" });
      row.remove();
    } catch (err) {
      window.alert(`删除失败: ${err.message}`);
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

function showSymbolForm(prefill = {}, options = {}) {
  const preview = document.querySelector("#symbolResolvePreview");
  const isEdit = Boolean(prefill.id);
  const submitLabel = options.submitLabel || (isEdit ? "保存修改" : "添加标的");
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
            <input type="text" name="symbol" value="${escapeHtml(prefill.symbol || "")}" placeholder="如 MU、GSPC、SOXX" required />
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
          <button type="submit" data-submit-label="${escapeHtml(submitLabel)}">${escapeHtml(submitLabel)}</button>
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
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.submitLabel || (id ? "保存修改" : "添加标的"); }
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
    showSymbolForm(item, { submitLabel: "确认添加" });
  } catch (err) {
    preview.innerHTML = `<div class="empty-state">解析失败: ${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "智能解析";
  }
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
