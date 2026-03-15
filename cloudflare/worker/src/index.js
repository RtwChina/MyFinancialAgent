const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

const TRACKED_SYMBOLS = [
  { symbol: "MU", aliases: ["MU", "Micron", "Micron Technology", "美光"] },
  { symbol: "LITE", aliases: ["LITE", "Lumentum", "Lumentum Holdings"] },
  { symbol: "MSFT", aliases: ["MSFT", "Microsoft", "微软"] },
  { symbol: "GOOGL", aliases: ["GOOGL", "Google", "Alphabet", "谷歌"] },
  { symbol: "^VIX", aliases: ["VIX", "Volatility Index", "恐慌指数"] },
  { symbol: "^HSI", aliases: ["HSI", "Hang Seng", "恒指", "恒生指数"] },
  { symbol: "^GSPC", aliases: ["S&P 500", "SP500", "标普500", "标普"] },
  { symbol: "000001.SS", aliases: ["SSE Composite", "上证指数", "沪指"] },
  { symbol: "DX-Y.NYB", aliases: ["Dollar Index", "DXY", "美元指数"] },
  { symbol: "GC=F", aliases: ["Gold", "黄金", "金价"] },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleApi(request, env, url) {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "my-financial-agent-api" });
    }

    if (url.pathname === "/api/ingest/prices" && request.method === "POST") {
      requireAuth(request, env);
      const body = await request.json();
      return json(await ingestPrices(env, body.items || []));
    }

    if (url.pathname === "/api/ingest/news" && request.method === "POST") {
      requireAuth(request, env);
      const body = await request.json();
      return json(await ingestNews(env, body.items || []));
    }

    if (url.pathname === "/api/ingest/news-analysis" && request.method === "POST") {
      requireAuth(request, env);
      const body = await request.json();
      return json(await ingestNewsAnalysis(env, body));
    }

    if (url.pathname === "/api/reviews/pending" && request.method === "GET") {
      return json(await getPendingReviews(env, url));
    }

    if (url.pathname === "/api/news" && request.method === "GET") {
      return json(await getNewsList(env, url));
    }

    const newsMatch = url.pathname.match(/^\/api\/news\/(\d+)$/);
    if (newsMatch && request.method === "GET") {
      return json(await getNewsById(env, Number(newsMatch[1])));
    }

    if (url.pathname === "/api/reviews" && request.method === "GET") {
      return json(await getReviews(env, url));
    }

    const reviewMatch = url.pathname.match(/^\/api\/reviews\/(\d{4}-\d{2}-\d{2})(?:\/(bootstrap|complete|initialize|delete))?$/);
    if (reviewMatch) {
      const [, archiveDate, action] = reviewMatch;
      if (!action && request.method === "GET") {
        return json(await getReviewByDate(env, archiveDate));
      }
      if (action === "bootstrap" && request.method === "GET") {
        return json(await getReviewBootstrap(env, archiveDate));
      }
      if (!action && request.method === "POST") {
        const body = await request.json();
        return json(await saveReviewDraft(env, archiveDate, body));
      }
      if (action === "complete" && request.method === "POST") {
        return json(await completeReview(env, archiveDate));
      }
      if ((action === "initialize" || action === "delete") && request.method === "POST") {
        return json(await initializeReview(env, archiveDate));
      }
    }

    return json({ error: "Not Found" }, 404);
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      error.statusCode || 500,
    );
  }
}

function requireAuth(request, env) {
  const expected = env.INGEST_API_TOKEN;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || actual !== expected) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
  };
}

async function ingestPrices(env, items) {
  let inserted = 0;
  let ignored = 0;

  for (const item of items) {
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO stock_raw
      (k_date, stock_code, stock_name, symbol, current_price, change_percent, volume, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        item.k_date,
        item.stock_code || item.symbol,
        item.stock_name || item.symbol,
        item.symbol,
        item.current_price,
        item.change_percent,
        item.volume,
        item.captured_at,
      )
      .run();

    if (result.meta.changes > 0) {
      inserted += 1;
    } else {
      ignored += 1;
    }
  }

  return { inserted, ignored, total: items.length };
}

async function ingestNews(env, items) {
  let inserted = 0;
  let updated = 0;
  let ignored = 0;

  for (const item of items) {
    const newsHash = item.news_hash || await digest(`${item.title || ""}|${item.content || ""}|${item.time || item.pub_date || ""}`);
    const existing = await env.DB.prepare(
      `SELECT id FROM stock_news_raw WHERE news_hash = ? LIMIT 1`,
    )
      .bind(newsHash)
      .first();
    const result = await env.DB.prepare(
      `INSERT INTO stock_news_raw
      (
        pub_date, title, content, url, source, type,
        rule_passed, rule_score, rule_reason, processing_status, ai_summary, market_impact,
        importance_stars, related_symbols, is_relevant_to_review, news_hash, captured_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(news_hash) DO UPDATE SET
        pub_date = excluded.pub_date,
        title = excluded.title,
        content = excluded.content,
        url = excluded.url,
        source = excluded.source,
        type = excluded.type,
        rule_passed = excluded.rule_passed,
        rule_score = excluded.rule_score,
        rule_reason = excluded.rule_reason,
        processing_status = excluded.processing_status,
        ai_summary = excluded.ai_summary,
        market_impact = excluded.market_impact,
        importance_stars = excluded.importance_stars,
        related_symbols = excluded.related_symbols,
        is_relevant_to_review = excluded.is_relevant_to_review,
        captured_at = excluded.captured_at`,
    )
      .bind(
        item.time || item.pub_date || null,
        item.title || "",
        item.content || "",
        item.url || "",
        item.source || "",
        item.type || "market",
        item.rule_passed ? 1 : 0,
        item.rule_score || 0,
        item.rule_reason || "",
        item.processing_status || "rule_screened",
        item.ai_summary || "",
        item.market_impact || "",
        Number(item.importance_stars || 0),
        JSON.stringify(item.related_symbols || []),
        item.is_relevant_to_review ? 1 : 0,
        newsHash,
        item.captured_at || isoNow(),
      )
      .run();

    if (result.meta.changes > 0) {
      if (existing) {
        updated += 1;
      } else {
        inserted += 1;
      }
    } else {
      ignored += 1;
    }
  }

  return { inserted, updated, ignored, total: items.length };
}

async function ingestNewsAnalysis(env, body) {
  await env.DB.prepare(
    `INSERT INTO news_analysis
    (analysis_date, global_news, market_news, symbol_news, market_analysis, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(analysis_date) DO UPDATE SET
      global_news = excluded.global_news,
      market_news = excluded.market_news,
      symbol_news = excluded.symbol_news,
      market_analysis = excluded.market_analysis,
      updated_at = excluded.updated_at`,
  )
    .bind(
      body.analysis_date || todayDate(),
      body.global_news || "",
      body.market_news || "",
      body.symbol_news || "",
      body.market_analysis || "",
      isoNow(),
    )
    .run();

  return { inserted: 1 };
}

async function getPendingReviews(env, url) {
  const limit = Number(url.searchParams.get("limit") || "10");
  const latestClosedDate = await getLatestPriceDate(env);
  if (!latestClosedDate) {
    return { items: [], latestClosedDate: null };
  }

  const archiveRows = await env.DB.prepare(
    `SELECT archive_date, review_status, updated_at
     FROM stock_archive
     WHERE archive_date <= ?
       AND COALESCE(review_status, 'initialized') != 'reviewed'
     ORDER BY archive_date DESC
     LIMIT ?`,
  )
    .bind(latestClosedDate, limit)
    .all();

  return {
    latestClosedDate,
    items: (archiveRows.results || []).map((row) => ({
      archiveDate: row.archive_date,
      reviewStatus: normalizeReviewStatus(row.review_status),
      updatedAt: row.updated_at || null,
    })),
  };
}

async function getNewsList(env, url) {
  const keyword = (url.searchParams.get("keyword") || "").trim();
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const source = url.searchParams.get("source");
  const type = url.searchParams.get("type");
  const symbol = url.searchParams.get("symbol");
  const stars = [
    ...url.searchParams.getAll("stars"),
    ...(url.searchParams.get("stars") || "").split(","),
  ]
    .map((value) => Number(value))
    .filter((value, index, array) => Number.isFinite(value) && value > 0 && array.indexOf(value) === index);
  const limit = Math.min(Number(url.searchParams.get("limit") || "100"), 200);

  const clauses = [];
  const params = [];

  if (keyword) {
    clauses.push("(title LIKE ? OR ai_summary LIKE ? OR content LIKE ? OR market_impact LIKE ?)");
    const like = `%${keyword}%`;
    params.push(like, like, like, like);
  }
  if (dateFrom) {
    clauses.push("pub_date >= ?");
    params.push(`${dateFrom} 00:00:00`);
  }
  if (dateTo) {
    clauses.push("pub_date <= ?");
    params.push(`${dateTo} 23:59:59`);
  }
  if (source) {
    clauses.push("source = ?");
    params.push(source);
  }
  if (type) {
    if (type === "major") {
      clauses.push("is_relevant_to_review = 1");
      clauses.push("importance_stars >= 3");
    } else if (type === "macro") {
      clauses.push("type IN ('macro', 'market')");
    } else {
      clauses.push("type = ?");
      params.push(type);
    }
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const query = `SELECT id, pub_date, title, content, url, source, type,
    rule_passed, rule_score, rule_reason, processing_status, ai_summary, market_impact,
    importance_stars, related_symbols, is_relevant_to_review
    FROM stock_news_raw
    ${whereClause}
    ORDER BY pub_date DESC, id DESC
    LIMIT ?`;
  const result = await env.DB.prepare(query).bind(...params, limit).all();
  let items = (result.results || []).map(enrichNewsItem);

  if (symbol) {
    items = items.filter((item) => item.related_symbols.includes(symbol));
  }
  if (stars.length) {
    items = items.filter((item) => stars.includes(Number(item.importance_stars || 0)));
  }

  return {
    items,
    total: items.length,
    filters: {
      keyword,
      dateFrom,
      dateTo,
      source,
      type,
      symbol,
      stars,
    },
  };
}

async function getNewsById(env, id) {
  const row = await env.DB.prepare(
    `SELECT id, pub_date, title, content, url, source, type,
      rule_passed, rule_score, rule_reason, processing_status, ai_summary, market_impact,
      importance_stars, related_symbols, is_relevant_to_review
     FROM stock_news_raw
     WHERE id = ?
     LIMIT 1`,
  )
    .bind(id)
    .first();

  if (!row) {
    const error = new Error("News not found");
    error.statusCode = 404;
    throw error;
  }

  return { item: enrichNewsItem(row) };
}

async function getReviews(env, url) {
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const clauses = [];
  const params = [];
  if (from) {
    clauses.push("a.archive_date >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("a.archive_date <= ?");
    params.push(to);
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const query = `SELECT
      a.archive_date,
      COALESCE(a.review_status, 'initialized') AS review_status,
      a.updated_at,
      a.reviewed_at,
      a.news_brief,
      a.selected_news_ids,
      a.market_sentiment,
      a.sector_rotation,
      a.asset_plan,
      a.trading_summary,
      n.market_analysis
    FROM stock_archive a
    LEFT JOIN news_analysis n ON n.analysis_date = a.archive_date
    ${whereClause}
    ORDER BY a.archive_date DESC
    LIMIT 100`;

  const result = await env.DB.prepare(query).bind(...params).all();
  let items = (result.results || []).map((item) => ({
    ...item,
    review_status: normalizeReviewStatus(item.review_status),
    news_summary: item.news_brief || item.market_analysis || "",
  }));
  if (status) {
    items = items.filter((item) => item.review_status === status);
  }
  return {
    items,
  };
}

async function getReviewByDate(env, archiveDate) {
  const archive = await env.DB.prepare(
    `SELECT * FROM stock_archive WHERE archive_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  return {
    archiveDate,
    review: archive ? { ...archive, review_status: normalizeReviewStatus(archive.review_status) } : null,
  };
}

async function getReviewBootstrap(env, archiveDate) {
  const currentPrices = await env.DB.prepare(
    `SELECT symbol, stock_name, current_price, change_percent, volume
     FROM stock_raw
     WHERE k_date = ?
     ORDER BY symbol`,
  )
    .bind(archiveDate)
    .all();

  const newsWindow = await getNewsWindowForDate(env, archiveDate);
  const news = await env.DB.prepare(
    `SELECT id, pub_date, title, content, source, type, ai_summary, market_impact,
      related_symbols, is_relevant_to_review, rule_passed,
      processing_status, importance_stars, url
     FROM stock_news_raw
     WHERE pub_date >= ? AND pub_date <= ?
       AND is_relevant_to_review = 1
       AND (
         COALESCE(rule_passed, 0) = 1
         OR type IN ('macro', 'market', 'symbol')
         OR COALESCE(ai_summary, '') != ''
       )
     ORDER BY pub_date DESC
     LIMIT 200`,
  )
    .bind(newsWindow.start, newsWindow.end)
    .all();
  let newsItems = (news.results || []).map(enrichNewsItem);

  if (!newsItems.length) {
    const fallbackNews = await env.DB.prepare(
      `SELECT id, pub_date, title, content, source, type, ai_summary, market_impact,
        related_symbols, is_relevant_to_review, rule_passed,
        processing_status, importance_stars, url
       FROM stock_news_raw
       WHERE is_relevant_to_review = 1
         AND processing_status IN ('llm_processed', 'reviewed')
       ORDER BY pub_date DESC
       LIMIT 12`,
    ).all();
    newsItems = (fallbackNews.results || []).map(enrichNewsItem);
  }

  const analysis = await env.DB.prepare(
    `SELECT * FROM news_analysis WHERE analysis_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  const previousCompletedReview = await env.DB.prepare(
    `SELECT archive_date, news_brief, selected_news_ids, market_sentiment, sector_rotation, asset_plan
     FROM stock_archive
     WHERE archive_date < ? AND review_status = 'reviewed'
     ORDER BY archive_date DESC
     LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  const existingDraft = await env.DB.prepare(
    `SELECT * FROM stock_archive WHERE archive_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  return {
    archiveDate,
    newsWindow,
    prices: currentPrices.results || [],
    news: newsItems,
    analysis: normalizeReviewAnalysis(analysis, newsItems),
    carryForward: previousCompletedReview,
    draft: existingDraft ? { ...existingDraft, review_status: normalizeReviewStatus(existingDraft.review_status) } : null,
  };
}

function enrichNewsItem(item) {
  const relatedSymbols = parseStoredSymbols(item.related_symbols)
    || deriveRelatedSymbols(`${item.title || ""}\n${item.content || ""}`);
  const primarySymbol = relatedSymbols[0] || null;
  const isRelevantToReview = Number(item.is_relevant_to_review ?? 0) || (relatedSymbols.length > 0 ? 1 : 0);
  const rulePassed = item.rule_passed == null ? null : Number(item.rule_passed ?? 0);
  const importanceStars = Number(item.importance_stars ?? 0);

  return {
    ...item,
    primary_symbol: primarySymbol,
    related_symbols: relatedSymbols,
    is_relevant_to_review: isRelevantToReview,
    rule_passed: rulePassed,
    importance_stars: importanceStars,
  };
}

function deriveRelatedSymbols(text) {
  const normalized = text.toLowerCase();
  return TRACKED_SYMBOLS.filter((entry) => entry.aliases.some((alias) => normalized.includes(alias.toLowerCase())))
    .map((entry) => entry.symbol);
}

function parseStoredSymbols(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : null;
  } catch {
    return null;
  }
}

function normalizeReviewStatus(status) {
  if (status === "completed") return "reviewed";
  if (status === "deleted") return "initialized";
  return status || "initialized";
}

function normalizeReviewAnalysis(analysis, newsItems) {
  const hasAnalysisContent = analysis && [
    analysis.global_news,
    analysis.market_news,
    analysis.symbol_news,
    analysis.market_analysis,
  ].some((value) => String(value || "").trim());

  if (hasAnalysisContent && !String(analysis.market_analysis || "").startsWith("保留 ")) {
    return analysis;
  }

  const grouped = {
    macro: newsItems.filter((item) => item.type === "macro").slice(0, 3),
    market: newsItems.filter((item) => item.type === "market").slice(0, 3),
    symbol: newsItems.filter((item) => item.type === "symbol").slice(0, 3),
  };
  const summaryLine = (item) => item.ai_summary || item.title || item.content || "";
  const impactLine = (item) => item.market_impact || item.rule_reason || "";
  const buildBlock = (items) => items.map((item) => summaryLine(item)).filter(Boolean).join("\n");
  const topImpacts = newsItems
    .slice(0, 3)
    .map((item) => impactLine(item))
    .filter(Boolean)
    .join("；");

  return {
    ...(analysis || {}),
    global_news: buildBlock(grouped.macro),
    market_news: buildBlock(grouped.market),
    symbol_news: buildBlock(grouped.symbol),
    market_analysis: topImpacts || "暂无可用的市场分析，请先更新新闻数据。",
  };
}

async function saveReviewDraft(env, archiveDate, body) {
  const existing = await env.DB.prepare(
    `SELECT review_status FROM stock_archive WHERE archive_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();
  const reviewStatus = body.reviewStatus
    || (existing?.review_status === "initialized" ? "draft" : existing?.review_status)
    || "draft";

  await env.DB.prepare(
    `INSERT INTO stock_archive (
      archive_date, review_status, news_brief, selected_news_ids, market_sentiment,
      sector_rotation, asset_plan, trading_summary, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(archive_date) DO UPDATE SET
      review_status = excluded.review_status,
      news_brief = excluded.news_brief,
      selected_news_ids = excluded.selected_news_ids,
      market_sentiment = excluded.market_sentiment,
      sector_rotation = excluded.sector_rotation,
      asset_plan = excluded.asset_plan,
      trading_summary = excluded.trading_summary,
      updated_at = excluded.updated_at`,
  )
    .bind(
      archiveDate,
      reviewStatus,
      body.newsBrief || "",
      JSON.stringify(body.selectedNewsIds || []),
      body.marketSentiment || "",
      body.sectorRotation || "",
      body.assetPlan || "",
      body.tradingSummary || "",
      isoNow(),
    )
    .run();

  return { ok: true, archiveDate, reviewStatus };
}

async function completeReview(env, archiveDate) {
  const existing = await env.DB.prepare(
    `SELECT archive_date FROM stock_archive WHERE archive_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO stock_archive (archive_date, review_status, reviewed_at, updated_at)
       VALUES (?, 'reviewed', ?, ?)`,
    )
      .bind(archiveDate, isoNow(), isoNow())
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE stock_archive
       SET review_status = 'reviewed', reviewed_at = ?, updated_at = ?
       WHERE archive_date = ?`,
    )
      .bind(isoNow(), isoNow(), archiveDate)
      .run();
  }

  const newsWindow = await getNewsWindowForDate(env, archiveDate);
  await env.DB.prepare(
    `UPDATE stock_news_raw
     SET processing_status = 'reviewed'
     WHERE pub_date >= ? AND pub_date <= ?
       AND is_relevant_to_review = 1
       AND (
         COALESCE(rule_passed, 0) = 1
         OR type IN ('macro', 'market', 'symbol')
         OR COALESCE(ai_summary, '') != ''
       )`,
  )
    .bind(newsWindow.start, newsWindow.end)
    .run();

  return { ok: true, archiveDate, reviewStatus: "reviewed" };
}

async function initializeReview(env, archiveDate) {
  const now = isoNow();
  const newsWindow = await getNewsWindowForDate(env, archiveDate);
  const existing = await env.DB.prepare(
    `SELECT review_status FROM stock_archive WHERE archive_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO stock_archive (
        archive_date, review_status, news_brief, selected_news_ids, market_sentiment,
        sector_rotation, asset_plan, trading_summary, reviewed_at, updated_at
      )
       VALUES (?, 'initialized', '', '[]', '', '', '', '', NULL, ?)`,
    )
      .bind(archiveDate, now)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE stock_archive
       SET review_status = 'initialized',
           news_brief = '',
           selected_news_ids = '[]',
           market_sentiment = '',
           sector_rotation = '',
           asset_plan = '',
           trading_summary = '',
           reviewed_at = NULL,
           updated_at = ?
       WHERE archive_date = ?`,
    )
      .bind(now, archiveDate)
      .run();
  }

  await env.DB.prepare(
    `UPDATE stock_news_raw
     SET processing_status = 'llm_processed'
     WHERE pub_date >= ? AND pub_date <= ?
       AND processing_status = 'reviewed'`,
  )
    .bind(newsWindow.start, newsWindow.end)
    .run();

  return { ok: true, archiveDate, reviewStatus: "initialized" };
}

async function getLatestPriceDate(env) {
  const row = await env.DB.prepare(`SELECT MAX(k_date) AS latest FROM stock_raw`).first();
  return row?.latest || null;
}

async function getNewsWindowForDate(env, archiveDate) {
  const datesResult = await env.DB.prepare(
    `SELECT DISTINCT k_date
     FROM stock_raw
     WHERE k_date <= ?
     ORDER BY k_date DESC
     LIMIT 2`,
  )
    .bind(archiveDate)
    .all();

  const dates = (datesResult.results || []).map((row) => row.k_date).sort();
  const endDate = archiveDate;
  const startDate = dates.length >= 2 ? dates[0] : subtractTradingDays(archiveDate, 1);
  return {
    start: `${startDate} 16:00:00`,
    end: `${endDate} 16:00:00`,
  };
}

async function digest(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isoNow() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function subtractTradingDays(dateString, count) {
  const current = new Date(`${dateString}T00:00:00Z`);
  let remaining = count;

  while (remaining > 0) {
    current.setUTCDate(current.getUTCDate() - 1);
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return current.toISOString().slice(0, 10);
}
