const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

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

    if (url.pathname === "/api/reviews" && request.method === "GET") {
      return json(await getReviews(env, url));
    }

    const reviewMatch = url.pathname.match(/^\/api\/reviews\/(\d{4}-\d{2}-\d{2})(?:\/(bootstrap|complete))?$/);
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
  let ignored = 0;

  for (const item of items) {
    const newsHash = item.news_hash || await digest(`${item.title || ""}|${item.content || ""}|${item.time || item.pub_date || ""}`);
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO stock_news_raw
      (pub_date, title, summary, content, url, source, type, ai_summary, news_hash, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        item.time || item.pub_date || null,
        item.title || "",
        item.summary || "",
        item.content || "",
        item.url || "",
        item.source || "",
        item.type || "0",
        item.ai_summary || "",
        newsHash,
        item.captured_at || isoNow(),
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

async function ingestNewsAnalysis(env, body) {
  await env.DB.prepare(
    `INSERT INTO news_analysis
    (analysis_date, global_news, market_news, market_analysis, raw_summary)
    VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      body.analysis_date || todayDate(),
      body.global_news || "",
      body.market_news || "",
      body.market_analysis || "",
      body.raw_summary || JSON.stringify(body),
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

  const tradeDates = await env.DB.prepare(
    `SELECT DISTINCT k_date
     FROM stock_raw
     WHERE k_date <= ?
     ORDER BY k_date DESC
     LIMIT ?`,
  )
    .bind(latestClosedDate, limit)
    .all();

  const archiveRows = await env.DB.prepare(
    `SELECT archive_date, review_status, updated_at
     FROM stock_archive
     WHERE archive_date <= ?`,
  )
    .bind(latestClosedDate)
    .all();

  const archiveMap = new Map((archiveRows.results || []).map((row) => [row.archive_date, row]));
  const pendingItems = (tradeDates.results || [])
    .map((row) => {
      const archive = archiveMap.get(row.k_date);
      return {
        archiveDate: row.k_date,
        reviewStatus: archive?.review_status || "missing",
        updatedAt: archive?.updated_at || null,
      };
    })
    .filter((row) => row.reviewStatus !== "completed");

  return {
    latestClosedDate,
    items: pendingItems,
  };
}

async function getReviews(env, url) {
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const clauses = [];
  const params = [];

  if (status) {
    clauses.push("review_status = ?");
    params.push(status);
  }
  if (from) {
    clauses.push("archive_date >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("archive_date <= ?");
    params.push(to);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const query = `SELECT archive_date, review_status, updated_at, reviewed_at,
    CASE WHEN source_snapshot_json IS NULL OR source_snapshot_json = '' THEN 0 ELSE 1 END AS has_snapshot
    FROM stock_archive
    ${whereClause}
    ORDER BY archive_date DESC
    LIMIT 100`;

  const result = await env.DB.prepare(query).bind(...params).all();
  return { items: result.results || [] };
}

async function getReviewByDate(env, archiveDate) {
  const archive = await env.DB.prepare(
    `SELECT * FROM stock_archive WHERE archive_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  return { archiveDate, review: archive || null };
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
    `SELECT pub_date, title, content, source, type, ai_summary, url
     FROM stock_news_raw
     WHERE pub_date >= ? AND pub_date <= ?
     ORDER BY pub_date DESC
     LIMIT 200`,
  )
    .bind(newsWindow.start, newsWindow.end)
    .all();

  const analysis = await env.DB.prepare(
    `SELECT * FROM news_analysis WHERE analysis_date = ? ORDER BY id DESC LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  const previousCompletedReview = await env.DB.prepare(
    `SELECT archive_date, market_sentiment, sector_rotation, asset_plan
     FROM stock_archive
     WHERE archive_date < ? AND review_status = 'completed'
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
    news: news.results || [],
    analysis,
    carryForward: previousCompletedReview,
    draft: existingDraft,
  };
}

async function saveReviewDraft(env, archiveDate, body) {
  const sourceSnapshotJson = JSON.stringify(body.sourceSnapshot || {});
  const reviewStatus = body.reviewStatus || "draft";

  await env.DB.prepare(
    `INSERT INTO stock_archive (
      archive_date, review_status, hist_price_level, news_summary, market_sentiment,
      sector_rotation, asset_plan, custom_notes, trading_summary, source_snapshot_json,
      carry_forward_from_date, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(archive_date) DO UPDATE SET
      review_status = excluded.review_status,
      hist_price_level = excluded.hist_price_level,
      news_summary = excluded.news_summary,
      market_sentiment = excluded.market_sentiment,
      sector_rotation = excluded.sector_rotation,
      asset_plan = excluded.asset_plan,
      custom_notes = excluded.custom_notes,
      trading_summary = excluded.trading_summary,
      source_snapshot_json = excluded.source_snapshot_json,
      carry_forward_from_date = excluded.carry_forward_from_date,
      updated_at = excluded.updated_at`,
  )
    .bind(
      archiveDate,
      reviewStatus,
      body.histPriceLevel || "",
      body.newsSummary || "",
      body.marketSentiment || "",
      body.sectorRotation || "",
      body.assetPlan || "",
      body.customNotes || "",
      body.tradingSummary || "",
      sourceSnapshotJson,
      body.carryForwardFromDate || null,
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
       VALUES (?, 'completed', ?, ?)`,
    )
      .bind(archiveDate, isoNow(), isoNow())
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE stock_archive
       SET review_status = 'completed', reviewed_at = ?, updated_at = ?
       WHERE archive_date = ?`,
    )
      .bind(isoNow(), isoNow(), archiveDate)
      .run();
  }

  return { ok: true, archiveDate, reviewStatus: "completed" };
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
     LIMIT 3`,
  )
    .bind(archiveDate)
    .all();

  const dates = (datesResult.results || []).map((row) => row.k_date).sort();
  const endDate = archiveDate;
  const startDate = dates.length >= 3 ? dates[0] : subtractTradingDays(archiveDate, 2);
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
