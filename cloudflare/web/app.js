const state = {
  activeDate: null,
  activeBootstrap: null,
};

const pendingList = document.querySelector("#pendingList");
const pendingState = document.querySelector("#pendingState");
const reviewsList = document.querySelector("#reviewsList");
const reviewForm = document.querySelector("#reviewForm");
const editorEmpty = document.querySelector("#editorEmpty");
const editorContent = document.querySelector("#editorContent");
const archiveDateLabel = document.querySelector("#archiveDateLabel");
const reviewStatusLabel = document.querySelector("#reviewStatusLabel");
const carryForwardLabel = document.querySelector("#carryForwardLabel");
const pricesBox = document.querySelector("#pricesBox");
const newsWindowBox = document.querySelector("#newsWindowBox");
const analysisBox = document.querySelector("#analysisBox");
const carryForwardBox = document.querySelector("#carryForwardBox");

document.querySelector("#refreshPendingBtn").addEventListener("click", () => {
  loadPendingReviews();
});

document.querySelector("#refreshReviewsBtn").addEventListener("click", () => {
  loadReviews();
});

document.querySelector("#filtersForm").addEventListener("submit", (event) => {
  event.preventDefault();
  loadReviews(new FormData(event.currentTarget));
});

document.querySelector("#saveDraftBtn").addEventListener("click", async () => {
  if (!state.activeDate) return;
  await saveReview("draft");
});

document.querySelector("#completeBtn").addEventListener("click", async () => {
  if (!state.activeDate) return;
  await saveReview("draft");
  await fetchJson(`/api/reviews/${state.activeDate}/complete`, { method: "POST" });
  reviewStatusLabel.textContent = "completed";
  await Promise.all([loadPendingReviews(), loadReviews()]);
});

loadPendingReviews();
loadReviews();

async function loadPendingReviews() {
  pendingState.textContent = "加载中...";
  pendingList.innerHTML = "";
  try {
    const data = await fetchJson("/api/reviews/pending");
    pendingState.textContent = data.items.length
      ? `最新已收盘交易日：${data.latestClosedDate}`
      : "当前没有待复盘日期";

    data.items.forEach((item) => {
      pendingList.appendChild(
        buildListCard({
          title: item.archiveDate,
          subtitle: `状态: ${item.reviewStatus}`,
          status: item.reviewStatus,
          buttonLabel: "开始复盘",
          onClick: () => loadBootstrap(item.archiveDate),
        }),
      );
    });
  } catch (error) {
    pendingState.textContent = `加载失败: ${error.message}`;
  }
}

async function loadReviews(formData = null) {
  reviewsList.innerHTML = "加载中...";
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
      reviewsList.textContent = "没有查到复盘记录";
      return;
    }

    data.items.forEach((item) => {
      reviewsList.appendChild(
        buildListCard({
          title: item.archive_date,
          subtitle: `最后更新: ${item.updated_at || "-"}`,
          status: item.review_status,
          buttonLabel: "打开",
          onClick: () => loadBootstrap(item.archive_date),
        }),
      );
    });
  } catch (error) {
    reviewsList.textContent = `查询失败: ${error.message}`;
  }
}

async function loadBootstrap(archiveDate) {
  const data = await fetchJson(`/api/reviews/${archiveDate}/bootstrap`);
  state.activeDate = archiveDate;
  state.activeBootstrap = data;

  editorEmpty.classList.add("hidden");
  editorContent.classList.remove("hidden");
  archiveDateLabel.textContent = archiveDate;
  reviewStatusLabel.textContent = data.draft?.review_status || "draft";
  carryForwardLabel.textContent = data.carryForward?.archive_date || "-";

  pricesBox.textContent = formatPrices(data.prices);
  newsWindowBox.textContent = `${data.newsWindow.start} -> ${data.newsWindow.end}\n共 ${data.news.length} 条新闻`;
  analysisBox.textContent = formatAnalysis(data.analysis);
  carryForwardBox.textContent = formatCarryForward(data.carryForward);

  applyFormValues({
    histPriceLevel: data.draft?.hist_price_level || "",
    newsSummary: data.draft?.news_summary || "",
    marketSentiment: data.draft?.market_sentiment || data.carryForward?.market_sentiment || "",
    sectorRotation: data.draft?.sector_rotation || data.carryForward?.sector_rotation || "",
    assetPlan: data.draft?.asset_plan || data.carryForward?.asset_plan || "",
    customNotes: data.draft?.custom_notes || "",
    tradingSummary: data.draft?.trading_summary || "",
  });
}

async function saveReview(reviewStatus) {
  const payload = Object.fromEntries(new FormData(reviewForm).entries());
  payload.reviewStatus = reviewStatus;
  payload.carryForwardFromDate = state.activeBootstrap?.carryForward?.archive_date || null;
  payload.sourceSnapshot = {
    prices: state.activeBootstrap?.prices || [],
    newsWindow: state.activeBootstrap?.newsWindow || null,
    analysis: state.activeBootstrap?.analysis || null,
  };

  await fetchJson(`/api/reviews/${state.activeDate}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  reviewStatusLabel.textContent = reviewStatus;
  await Promise.all([loadPendingReviews(), loadReviews()]);
}

function applyFormValues(values) {
  for (const [key, value] of Object.entries(values)) {
    const field = reviewForm.elements.namedItem(key);
    if (field) field.value = value;
  }
}

function buildListCard({ title, subtitle, status, buttonLabel, onClick }) {
  const card = document.createElement("article");
  card.className = "list-card";

  const titleNode = document.createElement("strong");
  titleNode.textContent = title;
  card.appendChild(titleNode);

  const subtitleNode = document.createElement("small");
  subtitleNode.textContent = subtitle;
  card.appendChild(subtitleNode);

  const statusNode = document.createElement("span");
  statusNode.className = `status-pill ${status === "completed" ? "completed" : ""}`;
  statusNode.textContent = status;
  card.appendChild(statusNode);

  const button = document.createElement("button");
  button.className = "ghost";
  button.textContent = buttonLabel;
  button.addEventListener("click", onClick);
  button.style.marginTop = "10px";
  card.appendChild(button);

  return card;
}

function formatPrices(prices) {
  if (!prices?.length) return "暂无价格数据";
  return prices
    .map((item) => `${item.symbol}: ${item.current_price ?? "-"} (${item.change_percent ?? "-"}%)`)
    .join("\n");
}

function formatAnalysis(analysis) {
  if (!analysis) return "暂无新闻分析";
  return [analysis.global_news, analysis.market_news, analysis.market_analysis]
    .filter(Boolean)
    .join("\n\n");
}

function formatCarryForward(carryForward) {
  if (!carryForward) return "暂无可回填的上一复盘日内容";
  return [
    `来源日期: ${carryForward.archive_date}`,
    `流动性追踪: ${carryForward.market_sentiment || "-"}`,
    `板块轮动: ${carryForward.sector_rotation || "-"}`,
    `资产计划: ${carryForward.asset_plan || "-"}`,
  ].join("\n");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}
