const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

// 静态兜底列表，仅供 deriveRelatedSymbols 在无存储 related_symbols 时使用。
// symbol 值必须与 tracked_symbols.symbol 保持一致（系统代码，非 Yahoo 代码）。
const TRACKED_SYMBOLS = [
  { symbol: "MU",   aliases: ["MU", "Micron", "Micron Technology", "美光", "美光科技"] },
  { symbol: "LITE", aliases: ["LITE", "Lumentum", "Lumentum Holdings"] },
  { symbol: "MSFT", aliases: ["MSFT", "Microsoft", "微软", "Microsoft Corporation"] },
  { symbol: "GOOGL",aliases: ["GOOGL", "Google", "Alphabet", "谷歌", "Alphabet Inc"] },
  { symbol: "GSPC", aliases: ["S&P 500", "SP500", "标普500", "标普", "SPX", "^GSPC"] },
  { symbol: "NDX",  aliases: ["Nasdaq 100", "纳指", "纳斯达克100", "纳斯达克", "^NDX"] },
  { symbol: "DJI",  aliases: ["Dow Jones", "DJIA", "道指", "道琼斯", "^DJI"] },
  { symbol: "VIX",  aliases: ["VIX", "Volatility Index", "恐慌指数", "波动率指数", "^VIX"] },
  { symbol: "HSI",  aliases: ["HSI", "Hang Seng", "恒指", "恒生指数", "^HSI"] },
  { symbol: "SSE",  aliases: ["SSE Composite", "上证指数", "沪指", "上证", "000001.SS"] },
  { symbol: "DXY",  aliases: ["Dollar Index", "DXY", "美元指数", "美元", "DX-Y.NYB"] },
  { symbol: "GOLD", aliases: ["Gold", "黄金", "金价", "COMEX黄金", "GC=F"] },
  { symbol: "CL",   aliases: ["Crude Oil", "WTI", "原油", "油价", "CL=F"] },
  { symbol: "XLK",  aliases: ["XLK", "科技板块", "科技ETF", "Technology"] },
  { symbol: "SOXX", aliases: ["SOXX", "半导体", "芯片板块", "iShares Semiconductor"] },
  { symbol: "XLE",  aliases: ["XLE", "能源板块", "能源ETF", "Energy"] },
  { symbol: "XLF",  aliases: ["XLF", "金融板块", "金融ETF", "Financial"] },
  { symbol: "XLY",  aliases: ["XLY", "可选消费", "消费板块", "Consumer Discretionary"] },
];

const ACTION_PLAN_ACTIONS = ["准备开仓", "持仓观察", "已清仓复盘"];
const ACTION_PLAN_POSITIONS = ["0%", "0-5%", "5%-10%", "10%-15%", "15%-20%", "20%-25%", "25%-30%", ">30%"];
const DEFAULT_ACTION_PLAN_ACTION = "持仓观察";
const DEFAULT_ACTION_PLAN_POSITION = "0-5%";
const ZERO_POSITION_ACTIONS = new Set(["准备开仓", "已清仓复盘"]);

export default {
  async fetch(request, env) {
    const appEnv = getAppEnv(env);
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url, appEnv);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const headers = new Headers(assetResponse.headers);
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      headers.set("Pragma", "no-cache");
      return new Response(assetResponse.body, { status: assetResponse.status, headers });
    }
    return assetResponse;
  },
};

function getAppEnv(env) {
  const value = String(env.APP_ENV || "").trim();
  if (value === "test" || value === "prod") return value;
  const error = new Error(`Invalid APP_ENV: ${value || "undefined"}`);
  error.statusCode = 500;
  throw error;
}

async function handleApi(request, env, url, appEnv) {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request) });
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "my-financial-agent-api", env: appEnv }, 200, request);
    }

    if (url.pathname === "/api/ingest/prices" && request.method === "POST") {
      requireWriteAuth(request, env, appEnv);
      const body = await request.json();
      return json(await ingestPrices(env, body.items || []), 200, request);
    }
    if (url.pathname === "/api/prices/repair-candidates" && request.method === "GET") {
      requireWriteAuth(request, env, appEnv);
      return json(await getPriceRepairCandidates(env, url), 200, request);
    }
    if (url.pathname === "/api/repair/prices" && request.method === "POST") {
      requireWriteAuth(request, env, appEnv);
      const body = await request.json();
      return json(await repairPrice(env, body), 200, request);
    }

    if (url.pathname === "/api/ingest/news" && request.method === "POST") {
      requireWriteAuth(request, env, appEnv);
      const body = await request.json();
      return json(await ingestNews(env, body.items || []), 200, request);
    }

    if (url.pathname === "/api/ingest/news-analysis" && request.method === "POST") {
      requireWriteAuth(request, env, appEnv);
      const body = await request.json();
      return json(await ingestNewsAnalysis(env, body), 200, request);
    }

    // ── Pipeline Trace & Filter Log ──────────────────────────
    if (url.pathname === "/api/ingest/pipeline-trace" && request.method === "POST") {
      requireWriteAuth(request, env, appEnv);
      const body = await request.json();
      return json(await ingestPipelineTrace(env, body), 200, request);
    }

    if (url.pathname === "/api/ingest/filter-logs" && request.method === "POST") {
      requireWriteAuth(request, env, appEnv);
      const body = await request.json();
      return json(await ingestFilterLogs(env, body.items || []), 200, request);
    }

    if (url.pathname === "/api/pipeline-traces" && request.method === "GET") {
      return json(await getPipelineTraces(env, url), 200, request);
    }

    if (url.pathname === "/api/filter-logs" && request.method === "GET") {
      return json(await getFilterLogs(env, url), 200, request);
    }

    // ── Symbol Management ──────────────────────────────────────
    if (url.pathname === "/api/symbols" && request.method === "GET") {
      return json(await getSymbols(env, url), 200, request);
    }
    if (url.pathname === "/api/symbols" && request.method === "POST") {
      const body = await request.json();
      return json(await createSymbol(env, body), 200, request);
    }
    if (url.pathname === "/api/symbols/resolve" && request.method === "POST") {
      const body = await request.json();
      return json(await resolveSymbol(env, body), 200, request);
    }
    if (url.pathname === "/api/symbols/validate" && request.method === "POST") {
      const body = await request.json();
      return json(await fetchYahooValidation(body.yahoo_symbol || body.symbol), 200, request);
    }
    const symbolMatch = url.pathname.match(/^\/api\/symbols\/(\d+)$/);
    if (symbolMatch) {
      const symbolId = Number(symbolMatch[1]);
      if (request.method === "GET")    return json(await getSymbolById(env, symbolId), 200, request);
      if (request.method === "PUT") {
        return json(await updateSymbol(env, symbolId, await request.json()), 200, request);
      }
      if (request.method === "DELETE") {
        return json(await deleteSymbol(env, symbolId), 200, request);
      }
    }
    // ── Screening Keywords Management ─────────────────────────
    if (url.pathname === "/api/screening-keywords" && request.method === "GET") {
      return json(await getScreeningKeywords(env, url), 200, request);
    }
    if (url.pathname === "/api/screening-keywords" && request.method === "POST") {
      const body = await request.json();
      return json(await createScreeningKeyword(env, body), 200, request);
    }
    const kwMatch = url.pathname.match(/^\/api\/screening-keywords\/(\d+)$/);
    if (kwMatch) {
      const kwId = Number(kwMatch[1]);
      if (request.method === "PUT") {
        return json(await updateScreeningKeyword(env, kwId, await request.json()), 200, request);
      }
      if (request.method === "DELETE") {
        return json(await deleteScreeningKeyword(env, kwId), 200, request);
      }
    }
    // ─────────────────────────────────────────────────────────

    if (url.pathname === "/api/reviews/pending" && request.method === "GET") {
      return json(await getPendingReviews(env, url), 200, request);
    }

    if (url.pathname === "/api/news/hashes" && request.method === "GET") {
      return json(await getNewsHashes(env, url), 200, request);
    }

    if (url.pathname === "/api/news" && request.method === "GET") {
      return json(await getNewsList(env, url), 200, request);
    }

    const newsAnalysisMatch = url.pathname.match(/^\/api\/news-analysis\/(\d{4}-\d{2}-\d{2})$/);
    if (newsAnalysisMatch && request.method === "GET") {
      return json(await getNewsAnalysisByDate(env, newsAnalysisMatch[1]), 200, request);
    }

    const newsMatch = url.pathname.match(/^\/api\/news\/(\d+)$/);
    if (newsMatch && request.method === "GET") {
      return json(await getNewsById(env, Number(newsMatch[1])), 200, request);
    }

    if (url.pathname === "/api/reviews" && request.method === "GET") {
      return json(await getReviews(env, url), 200, request);
    }

    const reviewMatch = url.pathname.match(/^\/api\/reviews\/(\d{4}-\d{2}-\d{2})(?:\/(bootstrap|complete|initialize|delete|snapshot))?$/);
    if (reviewMatch) {
      const [, archiveDate, action] = reviewMatch;
      if (!action && request.method === "GET") {
        return json(await getReviewByDate(env, archiveDate), 200, request);
      }
      if (action === "bootstrap" && request.method === "GET") {
        return json(await getReviewBootstrap(env, archiveDate), 200, request);
      }
      if (!action && request.method === "POST") {
        const body = await request.json();
        return json(await saveReviewDraft(env, archiveDate, body), 200, request);
      }
      if (action === "complete" && request.method === "POST") {
        return json(await completeReview(env, archiveDate), 200, request);
      }
      if (action === "snapshot" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        return json(await createReviewSnapshots(env, archiveDate, body), 200, request);
      }
      if ((action === "initialize" || action === "delete") && request.method === "POST") {
        return json(await initializeReview(env, archiveDate), 200, request);
      }
    }

    return json({ error: "Not Found" }, 404, request);
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      error.statusCode || 500,
      request,
    );
  }
}

function getApiToken(env) {
  return String(env.APP_API_TOKEN || env.INGEST_API_TOKEN || "").trim();
}

function requireWriteAuth(request, env, appEnv) {
  const expected = getApiToken(env);
  if (!expected) {
    if (appEnv === "test") return;
    const error = new Error("Write API token is not configured");
    error.statusCode = 500;
    throw error;
  }
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (actual !== expected) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
}

function json(data, status = 200, request = null) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...corsHeaders(request),
    },
  });
}

function corsHeaders(request) {
  const sameOrigin = request ? new URL(request.url).origin : "*";
  return {
    "access-control-allow-origin": sameOrigin,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    vary: "Origin",
  };
}

async function ingestPrices(env, items) {
  let inserted = 0;
  let ignored = 0;

  for (const item of items) {
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO stock_raw
      (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        item.k_date,
        item.stock_name || item.symbol,
        item.symbol,
        item.yahoo_symbol || null,
        item.current_price,
        item.change_percent,
        item.volume,
        item.captured_at,
        isoNow(),
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

async function getPriceRepairCandidates(env, url) {
  const dateFrom = String(url.searchParams.get("dateFrom") || "").trim();
  if (!dateFrom) {
    return { items: [], total: 0 };
  }
  const { results } = await env.DB.prepare(
    `SELECT symbol, yahoo_symbol, stock_name, k_date
     FROM stock_raw
     WHERE k_date IS NOT NULL
       AND current_price IS NULL
       AND k_date >= ?
     ORDER BY k_date DESC, symbol`,
  )
    .bind(dateFrom)
    .all();
  return { items: results || [], total: (results || []).length };
}

async function repairPrice(env, item) {
  const result = await env.DB.prepare(
    `UPDATE stock_raw
     SET yahoo_symbol = COALESCE(?, yahoo_symbol),
         stock_name = COALESCE(?, stock_name),
         current_price = ?,
         change_percent = ?,
         volume = ?,
         captured_at = ?
     WHERE symbol = ?
       AND k_date = ?
       AND current_price IS NULL`,
  )
    .bind(
      item.yahoo_symbol || null,
      item.stock_name || null,
      item.current_price,
      item.change_percent,
      item.volume,
      item.captured_at || isoNow(),
      item.symbol,
      item.k_date,
    )
    .run();

  return { updated: Number(result.meta.changes || 0), symbol: item.symbol, k_date: item.k_date };
}

async function ingestNews(env, items) {
  let inserted = 0;
  let updated = 0;
  let ignored = 0;
  const idMap = {};

  for (const item of items) {
    const newsHash = item.news_hash || await digest(`${item.title || ""}|${item.content || ""}|${item.time || item.pub_date || ""}`);
    const existing = await env.DB.prepare(
      `SELECT id FROM news_raw_data WHERE news_hash = ? LIMIT 1`,
    )
      .bind(newsHash)
      .first();
    const result = await env.DB.prepare(
      `INSERT INTO news_raw_data
      (
        pub_date, title, content, url, source, type,
        rule_passed, rule_reason, processing_status, ai_summary, market_impact,
        importance_stars, related_symbols, is_relevant_to_review, news_hash, captured_at,
        created_at, language, sub_source
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(news_hash) DO UPDATE SET
        pub_date = excluded.pub_date,
        title = excluded.title,
        content = excluded.content,
        url = excluded.url,
        source = excluded.source,
        type = excluded.type,
        rule_passed = excluded.rule_passed,
        rule_reason = excluded.rule_reason,
        processing_status = excluded.processing_status,
        ai_summary = excluded.ai_summary,
        market_impact = excluded.market_impact,
        importance_stars = excluded.importance_stars,
        related_symbols = excluded.related_symbols,
        is_relevant_to_review = excluded.is_relevant_to_review,
        captured_at = excluded.captured_at,
        language = excluded.language,
        sub_source = excluded.sub_source`,
    )
      .bind(
        item.time || item.pub_date || null,
        item.title || "",
        item.content || "",
        item.url || "",
        item.source || "",
        normalizeCanonicalNewsType(item.type),
        item.rule_passed ? 1 : 0,
        item.rule_reason || "",
        item.processing_status || "rule_screened",
        item.ai_summary || "",
        item.market_impact || "",
        Number(item.importance_stars || 0),
        JSON.stringify(item.related_symbols || []),
        item.is_relevant_to_review ? 1 : 0,
        newsHash,
        item.captured_at || isoNow(),
        isoNow(),
        item.language || "zh",
        item.sub_source || "",
      )
      .run();

    const persisted = await env.DB.prepare(
      `SELECT id FROM news_raw_data WHERE news_hash = ? LIMIT 1`,
    )
      .bind(newsHash)
      .first();
    if (persisted?.id != null) {
      idMap[newsHash] = Number(persisted.id);
    }

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

  return { inserted, updated, ignored, total: items.length, id_map: idMap };
}

async function ingestNewsAnalysis(env, body) {
  await env.DB.prepare(
    `INSERT INTO daily_news_ai_analysis
    (analysis_date, daily_major_events, sector_impact_map, linkage_logic_chain, source_news_ids, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(analysis_date) DO UPDATE SET
      daily_major_events = excluded.daily_major_events,
      sector_impact_map = excluded.sector_impact_map,
      linkage_logic_chain = excluded.linkage_logic_chain,
      source_news_ids = excluded.source_news_ids,
      updated_at = excluded.updated_at`,
  )
    .bind(
      body.analysis_date || todayDate(),
      body.daily_major_events || "",
      body.sector_impact_map || "",
      body.linkage_logic_chain || "",
      body.source_news_ids || "[]",
      isoNow(),
    )
    .run();

  return { inserted: 1 };
}

// ── Pipeline Trace & Filter Log handlers ─────────────────────

async function ingestPipelineTrace(env, body) {
  await env.DB.prepare(
    `INSERT INTO pipeline_trace
    (run_id, run_date, started_at, finished_at, status,
     total_fetched, total_deduped, prefilter_skipped,
     rule_passed, rule_filtered,
     embedding_input, embedding_passed, embedding_filtered,
     llm_input, llm_kept, llm_discarded, final_count,
     fetch_duration, rule_duration, embedding_duration, llm_duration, total_duration,
     config_snapshot, dynamic_keywords, active_strategy, star_fallback_triggered, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET
      finished_at = excluded.finished_at,
      status = excluded.status,
      total_fetched = excluded.total_fetched,
      total_deduped = excluded.total_deduped,
      prefilter_skipped = excluded.prefilter_skipped,
      rule_passed = excluded.rule_passed,
      rule_filtered = excluded.rule_filtered,
      embedding_input = excluded.embedding_input,
      embedding_passed = excluded.embedding_passed,
      embedding_filtered = excluded.embedding_filtered,
      llm_input = excluded.llm_input,
      llm_kept = excluded.llm_kept,
      llm_discarded = excluded.llm_discarded,
      final_count = excluded.final_count,
      fetch_duration = excluded.fetch_duration,
      rule_duration = excluded.rule_duration,
      embedding_duration = excluded.embedding_duration,
      llm_duration = excluded.llm_duration,
      total_duration = excluded.total_duration,
      config_snapshot = excluded.config_snapshot,
      dynamic_keywords = excluded.dynamic_keywords,
      active_strategy = excluded.active_strategy,
      star_fallback_triggered = excluded.star_fallback_triggered,
      error_message = excluded.error_message`,
  )
    .bind(
      body.run_id, body.run_date, body.started_at, body.finished_at || null, body.status || "running",
      body.total_fetched || 0, body.total_deduped || 0, body.prefilter_skipped || 0,
      body.rule_passed || 0, body.rule_filtered || 0,
      body.embedding_input || 0, body.embedding_passed || 0, body.embedding_filtered || 0,
      body.llm_input || 0, body.llm_kept || 0, body.llm_discarded || 0, body.final_count || 0,
      body.fetch_duration || null, body.rule_duration || null, body.embedding_duration || null,
      body.llm_duration || null, body.total_duration || null,
      body.config_snapshot || null, body.dynamic_keywords || null,
      body.active_strategy || "A", body.star_fallback_triggered || 0, body.error_message || null,
    )
    .run();

  return { inserted: 1 };
}

async function ingestFilterLogs(env, items) {
  let inserted = 0;
  for (const item of items) {
    await env.DB.prepare(
      `INSERT INTO news_filter_log
      (run_id, news_hash,
       strategy_a_score, strategy_b_score, strategy_c_score,
       active_strategy, rule_threshold,
       macro_hits, market_hits, noise_hits, symbol_hits, focus_hits,
       rule_decision, rule_reason,
       embedding_similarity, embedding_matched_symbol, embedding_decision,
       llm_keep, llm_stars, llm_type, llm_summary, llm_cot_reasoning, llm_raw_response,
       final_decision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        item.run_id, item.news_hash,
        item.strategy_a_score ?? null, item.strategy_b_score ?? null, item.strategy_c_score ?? null,
        item.active_strategy || "A", item.rule_threshold ?? null,
        item.macro_hits || null, item.market_hits || null, item.noise_hits || null,
        item.symbol_hits || null, item.focus_hits || null,
        item.rule_decision || null, item.rule_reason || null,
        item.embedding_similarity ?? null, item.embedding_matched_symbol || null,
        item.embedding_decision || null,
        item.llm_keep ?? null, item.llm_stars ?? null, item.llm_type || null,
        item.llm_summary || null, item.llm_cot_reasoning || null, item.llm_raw_response || null,
        item.final_decision || null,
      )
      .run();
    inserted += 1;
  }
  return { inserted, total: items.length };
}

async function getPipelineTraces(env, url) {
  const date = url.searchParams.get("date");
  const limit = Math.min(Number(url.searchParams.get("limit") || "20"), 100);

  let sql = "SELECT * FROM pipeline_trace";
  const bindings = [];
  if (date) {
    sql += " WHERE run_date = ?";
    bindings.push(date);
  }
  sql += " ORDER BY created_at DESC LIMIT ?";
  bindings.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...bindings).all();
  return { items: results, total: results.length };
}

async function getFilterLogs(env, url) {
  const runId = url.searchParams.get("run_id");
  const decision = url.searchParams.get("decision");
  const limit = Math.min(Number(url.searchParams.get("limit") || "200"), 500);

  let sql = "SELECT * FROM news_filter_log WHERE 1=1";
  const bindings = [];
  if (runId) {
    sql += " AND run_id = ?";
    bindings.push(runId);
  }
  if (decision) {
    sql += " AND final_decision = ?";
    bindings.push(decision);
  }
  sql += " ORDER BY id DESC LIMIT ?";
  bindings.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...bindings).all();
  return { items: results, total: results.length };
}

async function getPendingReviews(env, url) {
  const limit = Number(url.searchParams.get("limit") || "10");
  const latestClosedDate = await getLatestClosedNyseTradingDay(env);
  if (!latestClosedDate) {
    return { items: [], latestClosedDate: null };
  }

  const archiveRows = await env.DB.prepare(
    `SELECT archive_date, review_status, updated_at
     FROM daily_review_archive
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

async function getNewsHashes(env, url) {
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  const clauses = [];
  const bindings = [];
  if (dateFrom) {
    clauses.push("pub_date >= ?");
    bindings.push(dateFrom);
  }
  if (dateTo) {
    clauses.push("pub_date < ?");
    bindings.push(dateTo);
  }

  const where = clauses.length > 0 ? " WHERE " + clauses.join(" AND ") : "";
  const { results } = await env.DB.prepare(
    `SELECT news_hash FROM news_raw_data${where}`,
  ).bind(...bindings).all();

  const hashes = results.map((r) => r.news_hash);
  return { hashes, count: hashes.length };
}

async function getNewsList(env, url) {
  const keyword = (url.searchParams.get("keyword") || "").trim();
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const dateTimeFrom = url.searchParams.get("dateTimeFrom");
  const dateTimeTo = url.searchParams.get("dateTimeTo");
  const source = url.searchParams.get("source");
  const type = url.searchParams.get("type");
  const symbol = url.searchParams.get("symbol");
  const stars = [
    ...url.searchParams.getAll("stars"),
    ...(url.searchParams.get("stars") || "").split(","),
  ]
    .map((value) => Number(value))
    .filter((value, index, array) => Number.isFinite(value) && value > 0 && array.indexOf(value) === index);

  // 分页参数：page 存在时启用服务端分页，否则退回 limit 兼容模式
  const pageParam = url.searchParams.get("page");
  const usePagination = pageParam !== null;
  const page = Math.max(1, Number(pageParam || "1"));
  const pageSize = Math.min(Math.max(1, Number(url.searchParams.get("pageSize") || "20")), 100);
  const limit = usePagination ? pageSize : Math.min(Number(url.searchParams.get("limit") || "100"), 200);
  const offset = usePagination ? (page - 1) * pageSize : 0;

  const showFiltered = url.searchParams.get("showFiltered") === "1";

  const clauses = [];
  const params = [];

  if (!showFiltered) {
    clauses.push("rule_passed = 1");
  }

  if (keyword) {
    clauses.push("(title LIKE ? OR ai_summary LIKE ? OR content LIKE ? OR market_impact LIKE ?)");
    const like = `%${keyword}%`;
    params.push(like, like, like, like);
  }
  if (dateTimeFrom) {
    clauses.push("pub_date >= ?");
    params.push(dateTimeFrom);
  } else if (dateFrom) {
    clauses.push("pub_date >= ?");
    params.push(`${dateFrom} 00:00:00`);
  }
  if (dateTimeTo) {
    clauses.push("pub_date <= ?");
    params.push(dateTimeTo);
  } else if (dateTo) {
    clauses.push("pub_date <= ?");
    params.push(`${dateTo} 23:59:59`);
  }
  if (source) {
    clauses.push("source = ?");
    params.push(source);
  }
  if (type) {
    const normalizedType = normalizeCanonicalNewsType(type);
    if (normalizedType === "index") {
      clauses.push("type = 'index'");
    } else if (normalizedType === "sector") {
      clauses.push("type = 'sector'");
    } else if (normalizedType === "stock") {
      clauses.push("type = 'stock'");
    } else {
      clauses.push("type = ?");
      params.push(normalizedType);
    }
  }
  if (symbol) {
    clauses.push("related_symbols LIKE ?");
    params.push(`%${symbol}%`);
  }
  if (stars.length) {
    const placeholders = stars.map(() => "?").join(", ");
    clauses.push(`importance_stars IN (${placeholders})`);
    params.push(...stars);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const dataQuery = `SELECT id, pub_date, title, content, url, source, sub_source, language, type,
    rule_passed, rule_reason, processing_status, ai_summary, market_impact,
    importance_stars, related_symbols, is_relevant_to_review
    FROM news_raw_data
    ${whereClause}
    ORDER BY pub_date DESC, id DESC
    LIMIT ? OFFSET ?`;

  if (usePagination) {
    const countQuery = `SELECT COUNT(*) AS cnt FROM news_raw_data ${whereClause}`;
    const [countResult, dataResult] = await Promise.all([
      env.DB.prepare(countQuery).bind(...params).first(),
      env.DB.prepare(dataQuery).bind(...params, limit, offset).all(),
    ]);
    const total = Number(countResult?.cnt || 0);
    const items = (dataResult.results || []).map(enrichNewsItem);
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // 兼容模式（不传 page）
  const result = await env.DB.prepare(dataQuery).bind(...params, limit, 0).all();
  const items = (result.results || []).map(enrichNewsItem);
  return {
    items,
    total: items.length,
    filters: { keyword, dateFrom, dateTo, dateTimeFrom, dateTimeTo, source, type, symbol, stars },
  };
}

async function getNewsAnalysisByDate(env, analysisDate) {
  const item = await env.DB.prepare(
    `SELECT * FROM daily_news_ai_analysis WHERE analysis_date = ? LIMIT 1`,
  )
    .bind(analysisDate)
    .first();
  return { item: item || null };
}

async function getNewsById(env, id) {
  const row = await env.DB.prepare(
    `SELECT id, pub_date, title, content, url, source, type,
      rule_passed, rule_reason, processing_status, ai_summary, market_impact,
      importance_stars, related_symbols, is_relevant_to_review
     FROM news_raw_data
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

  // 分页参数
  const pageParam = url.searchParams.get("page");
  const usePagination = pageParam !== null;
  const page = Math.max(1, Number(pageParam || "1"));
  const pageSize = Math.min(Math.max(1, Number(url.searchParams.get("pageSize") || "20")), 100);
  const offset = usePagination ? (page - 1) * pageSize : 0;
  const limitVal = usePagination ? pageSize : 100;

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
  if (status) {
    clauses.push("COALESCE(a.review_status, 'initialized') = ?");
    params.push(status);
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const dataQuery = `SELECT
      a.archive_date,
      COALESCE(a.review_status, 'initialized') AS review_status,
      a.updated_at,
      a.reviewed_at,
      a.reviewer_news_notes,
      a.market_sentiment,
      a.sector_rotation,
      (
        SELECT GROUP_CONCAT(symbol, ' | ')
        FROM daily_review_action_plans p
        WHERE p.archive_date = a.archive_date
        ORDER BY p.sort_order ASC, p.symbol ASC
      ) AS action_plan_summary,
      a.trading_summary,
      n.linkage_logic_chain
    FROM daily_review_archive a
    LEFT JOIN daily_news_ai_analysis n ON n.analysis_date = a.archive_date
    ${whereClause}
    ORDER BY a.archive_date DESC
    LIMIT ? OFFSET ?`;

  if (usePagination) {
    const countQuery = `SELECT COUNT(*) AS cnt FROM daily_review_archive a ${whereClause}`;
    const [countResult, dataResult] = await Promise.all([
      env.DB.prepare(countQuery).bind(...params).first(),
      env.DB.prepare(dataQuery).bind(...params, limitVal, offset).all(),
    ]);
    const total = Number(countResult?.cnt || 0);
    const items = (dataResult.results || []).map((item) => ({
      ...item,
      review_status: normalizeReviewStatus(item.review_status),
      news_summary: item.reviewer_news_notes || item.linkage_logic_chain || "",
    }));
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  // 兼容模式
  const result = await env.DB.prepare(dataQuery).bind(...params, limitVal, 0).all();
  let items = (result.results || []).map((item) => ({
    ...item,
    review_status: normalizeReviewStatus(item.review_status),
    news_summary: item.reviewer_news_notes || item.linkage_logic_chain || "",
  }));
  if (status) {
    items = items.filter((item) => item.review_status === status);
  }
  return { items };
}

async function getReviewByDate(env, archiveDate) {
  const archive = await env.DB.prepare(
    `SELECT * FROM daily_review_archive WHERE archive_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  return {
    archiveDate,
    review: archive ? { ...archive, review_status: normalizeReviewStatus(archive.review_status) } : null,
  };
}

async function getReviewBootstrap(env, archiveDate) {
  const existingDraft = await env.DB.prepare(
    `SELECT * FROM daily_review_archive WHERE archive_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  // 跨市场资产的 k_date 不统一（美股/亚洲/汇率/商品收盘时间不同），
  // 对每个 symbol 取 k_date <= archiveDate 的最近一条，避免因日期偏差漏掉美股个股/板块价格。
  const currentPricesRaw = await env.DB.prepare(
    `SELECT p.symbol, p.stock_name, p.current_price, p.change_percent, p.volume, p.k_date
     FROM stock_raw p
     JOIN (
       SELECT symbol, MAX(k_date) AS latest_k_date
       FROM stock_raw
       WHERE k_date <= ?
       GROUP BY symbol
     ) latest ON latest.symbol = p.symbol AND latest.latest_k_date = p.k_date
     ORDER BY p.symbol`,
  )
    .bind(archiveDate)
    .all();

  // 从 tracked_symbols 获取分组信息
  const trackedSymbols = await env.DB.prepare(
    `SELECT symbol, yahoo_symbol, display_name, symbol_type, sort_order
     FROM tracked_symbols WHERE is_active = 1`,
  ).all();
  const symbolInfoMap = {};
  for (const s of (trackedSymbols.results || [])) {
    symbolInfoMap[s.symbol] = s;
  }

  // prices 按 index / sector / stock 分组
  const pricesByType = { index: [], sector: [], stock: [] };
  for (const p of (currentPricesRaw.results || [])) {
    const info = symbolInfoMap[p.symbol];
    const type = info?.symbol_type || "stock";
    const bucket = pricesByType[type] || pricesByType.stock;
    bucket.push({
      ...p,
      display_name: info?.display_name || p.stock_name || p.symbol,
      sort_order: info?.sort_order ?? 999,
    });
  }
  for (const bucket of Object.values(pricesByType)) {
    bucket.sort((a, b) => a.sort_order - b.sort_order);
  }

  const newsWindow = await getNewsWindowForDate(env, archiveDate);
  const useArchivedNews = normalizeReviewStatus(existingDraft?.review_status) === "reviewed";
  const analysis = await env.DB.prepare(
    `SELECT * FROM daily_news_ai_analysis WHERE analysis_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();
  const sourceNewsIds = parseStoredIds(analysis?.source_news_ids);
  let newsItems = [];

  if (useArchivedNews) {
    const archivedNews = await env.DB.prepare(
      `SELECT id AS archive_news_id, original_news_id, pub_date, title, content, source, type,
        ai_summary, market_impact, related_symbols, rule_passed, rule_reason,
        processing_status, importance_stars, url, news_hash
       FROM daily_review_archive_news
       WHERE archive_date = ?
       ORDER BY pub_date DESC, id DESC`,
    )
      .bind(archiveDate)
      .all();
    newsItems = (archivedNews.results || []).map((item) => enrichNewsItem({
      ...item,
      id: item.archive_news_id,
      archived: 1,
    }));
  }

  if (!newsItems.length) {
    if (sourceNewsIds.length) {
      const placeholders = sourceNewsIds.map(() => "?").join(", ");
      const sourceNews = await env.DB.prepare(
        `SELECT id, pub_date, title, content, source, sub_source, language, type, ai_summary, market_impact,
          related_symbols, is_relevant_to_review, rule_passed, rule_reason,
          processing_status, importance_stars, url, news_hash
         FROM news_raw_data
         WHERE id IN (${placeholders})
         ORDER BY pub_date DESC, id DESC`,
      )
        .bind(...sourceNewsIds)
        .all();
      newsItems = (sourceNews.results || []).map(enrichNewsItem);
    }

    // 没有 source_news_ids 时不再回退，保持空列表
  }

  const previousCompletedReview = await env.DB.prepare(
    `SELECT archive_date, reviewer_news_notes, market_sentiment, sector_rotation
     FROM daily_review_archive
     WHERE archive_date < ? AND review_status = 'reviewed'
     ORDER BY archive_date DESC
     LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  const currentActionPlans = await listReviewActionPlans(env, archiveDate);
  const carryForwardActionPlans = previousCompletedReview
    ? await listReviewActionPlans(env, previousCompletedReview.archive_date)
    : [];
  const actionPlans = currentActionPlans.length ? currentActionPlans : carryForwardActionPlans;

  // news 按类型分组
  const newsByType = { index: [], sector: [], stock: [] };
  for (const item of newsItems) {
    const t = item.type || "index";
    const bucket = newsByType[t] || newsByType.index;
    bucket.push(item);
  }

  return {
    archiveDate,
    newsWindow,
    // 兼容旧版：prices 同时提供扁平数组和分组对象
    prices: pricesByType,
    pricesFlat: (currentPricesRaw.results || []),
    news: newsItems,          // 全量（兼容旧版）
    newsByType,               // 按 index/sector/stock 分组
    analysis: normalizeReviewAnalysis(analysis, newsItems),
    actionPlans,
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
    type: normalizeCanonicalNewsType(item.type),
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

function parseStoredIds(value) {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
  }
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
      : [];
  } catch {
    return [];
  }
}

function normalizeCanonicalNewsType(type) {
  const value = String(type || "").trim().toLowerCase();
  if (value === "sector") return "sector";
  if (value === "stock" || value === "symbol") return "stock";
  if (value === "index" || value === "macro" || value === "market") return "index";
  return "index";
}

function normalizeReviewStatus(status) {
  if (status === "completed") return "reviewed";
  if (status === "deleted") return "initialized";
  return status || "initialized";
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

function normalizeActionPlanItem(item, sortOrder = 0) {
  if (!item || typeof item !== "object") return null;
  const symbol = String(item.symbol || "").trim().toUpperCase();
  if (!symbol) return null;
  const supportLevels = String(item.supportLevels || item.support_levels || "").trim();
  const resistanceLevels = String(item.resistanceLevels || item.resistance_levels || "").trim();
  const keyLevels = String(item.keyLevels || item.key_levels || "").trim();
  return {
    id: item.id == null ? null : Number(item.id),
    symbol,
    actionType: normalizeActionPlanAction(item.actionType || item.action_type),
    entryPlan: String(item.entryPlan || item.entry_plan || "").trim(),
    takeProfitPlan: String(item.takeProfitPlan || item.take_profit_plan || "").trim(),
    stopLossPlan: String(item.stopLossPlan || item.stop_loss_plan || "").trim(),
    supportLevels,
    resistanceLevels,
    keyLevels: keyLevels || formatSupportResistanceLevels(supportLevels, resistanceLevels),
    currentPosition: normalizeActionPlanPosition(item.currentPosition || item.current_position || defaultActionPlanPositionForAction(item.actionType || item.action_type)),
    thinking: String(item.thinking || "").trim(),
    marketType: ["美股", "大A"].includes(item.marketType || item.market_type) ? (item.marketType || item.market_type) : "美股",
    sortOrder: Number.isFinite(Number(item.sortOrder ?? item.sort_order))
      ? Number(item.sortOrder ?? item.sort_order)
      : sortOrder,
  };
}

function formatSupportResistanceLevels(supportLevels, resistanceLevels) {
  const sections = [];
  if (supportLevels) sections.push(`支撑位：\n${supportLevels}`);
  if (resistanceLevels) sections.push(`压力位：\n${resistanceLevels}`);
  return sections.join("\n\n");
}

function dbActionPlanToApi(row) {
  return {
    id: row.id,
    archiveDate: row.archive_date,
    symbol: row.symbol,
    actionType: row.action_type || DEFAULT_ACTION_PLAN_ACTION,
    entryPlan: row.entry_plan || "",
    takeProfitPlan: row.take_profit_plan || "",
    stopLossPlan: row.stop_loss_plan || "",
    supportLevels: row.support_levels || "",
    resistanceLevels: row.resistance_levels || "",
    keyLevels: row.key_levels || formatSupportResistanceLevels(row.support_levels || "", row.resistance_levels || ""),
    currentPosition: row.current_position || DEFAULT_ACTION_PLAN_POSITION,
    thinking: row.thinking || "",
    marketType: row.market_type || "美股",
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function listReviewActionPlans(env, archiveDate) {
  const rows = await env.DB.prepare(
    `SELECT *
     FROM daily_review_action_plans
     WHERE archive_date = ?
     ORDER BY sort_order ASC, symbol ASC`,
  )
    .bind(archiveDate)
    .all();
  return (rows.results || []).map(dbActionPlanToApi);
}

function normalizeActionPlansForSave(actionPlans) {
  const normalized = [];
  const seen = new Set();
  for (const item of Array.isArray(actionPlans) ? actionPlans : []) {
    const plan = normalizeActionPlanItem(item, normalized.length);
    if (!plan || seen.has(plan.symbol)) continue;
    seen.add(plan.symbol);
    normalized.push({ ...plan, sortOrder: normalized.length });
  }
  return normalized;
}

async function replaceReviewActionPlans(env, archiveDate, actionPlans) {
  const normalized = normalizeActionPlansForSave(actionPlans);
  const now = isoNow();
  for (const plan of normalized) {
    await env.DB.prepare(
      `INSERT INTO daily_review_action_plans (
        archive_date, symbol, action_type, entry_plan, take_profit_plan,
        stop_loss_plan, key_levels, support_levels, resistance_levels,
        current_position, thinking, market_type, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(archive_date, symbol) DO UPDATE SET
        action_type = excluded.action_type,
        entry_plan = excluded.entry_plan,
        take_profit_plan = excluded.take_profit_plan,
        stop_loss_plan = excluded.stop_loss_plan,
        key_levels = excluded.key_levels,
        support_levels = excluded.support_levels,
        resistance_levels = excluded.resistance_levels,
        current_position = excluded.current_position,
        thinking = excluded.thinking,
        market_type = excluded.market_type,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at`,
    )
      .bind(
        archiveDate,
        plan.symbol,
        plan.actionType,
        plan.entryPlan,
        plan.takeProfitPlan,
        plan.stopLossPlan,
        plan.keyLevels,
        plan.supportLevels,
        plan.resistanceLevels,
        plan.currentPosition,
        plan.thinking,
        plan.marketType,
        plan.sortOrder,
        now,
        now,
      )
      .run();
  }

  if (normalized.length) {
    const placeholders = normalized.map(() => "?").join(", ");
    await env.DB.prepare(
      `DELETE FROM daily_review_action_plans
       WHERE archive_date = ?
         AND symbol NOT IN (${placeholders})`,
    )
      .bind(archiveDate, ...normalized.map((plan) => plan.symbol))
      .run();
  } else {
    await env.DB.prepare(
      `DELETE FROM daily_review_action_plans WHERE archive_date = ?`,
    )
      .bind(archiveDate)
      .run();
  }

  return normalized;
}

function normalizeReviewAnalysis(analysis, newsItems) {
  const hasAnalysisContent = analysis && [
    analysis.daily_major_events,
    analysis.sector_impact_map,
    analysis.linkage_logic_chain,
  ].some((value) => String(value || "").trim());

  if (hasAnalysisContent && !String(analysis.linkage_logic_chain || "").startsWith("保留 ")) {
    return analysis;
  }

  const grouped = {
    major: newsItems.slice(0, 3),
    symbol: newsItems.filter((item) => item.type === "stock").slice(0, 3),
  };
  const summaryLine = (item) => item.ai_summary || item.title || item.content || "";
  const impactLine = (item) => item.market_impact || item.rule_reason || "";
  const buildTaggedLine = (item, text) => {
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
  const buildLines = (items) => items
    .map((item) => buildTaggedLine(item, summaryLine(item)))
    .filter(Boolean)
    .join("\n");
  const topImpacts = newsItems
    .slice(0, 3)
    .map((item) => buildTaggedLine(item, impactLine(item)))
    .filter(Boolean)
    .join("\n");

  return {
    ...(analysis || {}),
    daily_major_events: buildLines(grouped.major),
    sector_impact_map: topImpacts || "[大盘] 暂无可用的大盘与板块影响，请先更新新闻数据。",
    linkage_logic_chain: buildLines(grouped.symbol) || topImpacts || "[个股] 暂无可用的联动逻辑链，请先更新新闻数据。",
  };
}

async function saveReviewDraft(env, archiveDate, body) {
  const existing = await env.DB.prepare(
    `SELECT review_status FROM daily_review_archive WHERE archive_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();
  const reviewStatus = body.reviewStatus || existing?.review_status || "initialized";
  const hasStructuredActionPlans = Array.isArray(body.actionPlans);
  const normalizedActionPlans = hasStructuredActionPlans
    ? normalizeActionPlansForSave(body.actionPlans)
    : [];

  await env.DB.prepare(
    `INSERT INTO daily_review_archive (
      archive_date, review_status, reviewer_news_notes, market_sentiment,
      sector_rotation, trading_summary, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(archive_date) DO UPDATE SET
      review_status = excluded.review_status,
      reviewer_news_notes = excluded.reviewer_news_notes,
      market_sentiment = excluded.market_sentiment,
      sector_rotation = excluded.sector_rotation,
      trading_summary = excluded.trading_summary,
      updated_at = excluded.updated_at`,
  )
    .bind(
      archiveDate,
      reviewStatus,
      body.reviewerNewsNotes || body.newsBrief || "",
      body.marketSentiment || "",
      body.sectorRotation || "",
      body.tradingSummary || "",
      isoNow(),
    )
    .run();

  if (hasStructuredActionPlans) {
    await replaceReviewActionPlans(env, archiveDate, normalizedActionPlans);
  }

  return {
    ok: true,
    archiveDate,
    reviewStatus,
    actionPlanCount: normalizedActionPlans.length,
  };
}

async function completeReview(env, archiveDate) {
  const existing = await env.DB.prepare(
    `SELECT archive_date FROM daily_review_archive WHERE archive_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO daily_review_archive (archive_date, review_status, reviewed_at, updated_at)
       VALUES (?, 'reviewed', ?, ?)`,
    )
      .bind(archiveDate, isoNow(), isoNow())
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE daily_review_archive
       SET review_status = 'reviewed', reviewed_at = ?, updated_at = ?
       WHERE archive_date = ?`,
    )
      .bind(isoNow(), isoNow(), archiveDate)
      .run();
  }

  const newsWindow = await getNewsWindowForDate(env, archiveDate);
  const analysis = await env.DB.prepare(
    `SELECT source_news_ids FROM daily_news_ai_analysis WHERE analysis_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();
  const sourceNewsIds = parseStoredIds(analysis?.source_news_ids);
  if (sourceNewsIds.length) {
    const placeholders = sourceNewsIds.map(() => "?").join(", ");
    await env.DB.prepare(
      `UPDATE news_raw_data
       SET processing_status = 'reviewed'
       WHERE id IN (${placeholders})`,
    )
      .bind(...sourceNewsIds)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE news_raw_data
       SET processing_status = 'reviewed'
       WHERE pub_date >= ? AND pub_date <= ?
           AND COALESCE(importance_stars, 0) >= 3
           AND (
             COALESCE(rule_passed, 0) = 1
             OR type IN ('index', 'sector', 'stock')
             OR COALESCE(ai_summary, '') != ''
           )`,
    )
      .bind(newsWindow.start, newsWindow.end)
      .run();
  }
  let archiveRows;
  if (sourceNewsIds.length) {
    const placeholders = sourceNewsIds.map(() => "?").join(", ");
    archiveRows = await env.DB.prepare(
      `SELECT id, pub_date, title, content, url, source, type, rule_passed, rule_reason,
         processing_status, ai_summary, market_impact, importance_stars, related_symbols, news_hash
       FROM news_raw_data
       WHERE id IN (${placeholders})
       ORDER BY pub_date DESC, id DESC`,
    )
      .bind(...sourceNewsIds)
      .all();
  } else {
    const archiveQuery = `SELECT id, pub_date, title, content, url, source, type, rule_passed, rule_reason,
           processing_status, ai_summary, market_impact, importance_stars, related_symbols, news_hash
         FROM news_raw_data
         WHERE pub_date >= ? AND pub_date <= ?
           AND COALESCE(importance_stars, 0) >= 3
           AND (
             COALESCE(rule_passed, 0) = 1
             OR type IN ('index', 'sector', 'stock')
             OR COALESCE(ai_summary, '') != ''
           )
         ORDER BY pub_date DESC, id DESC`;
    archiveRows = await env.DB.prepare(archiveQuery)
      .bind(newsWindow.start, newsWindow.end)
      .all();
  }

  await env.DB.prepare(`DELETE FROM daily_review_archive_news WHERE archive_date = ?`)
    .bind(archiveDate)
    .run();

  for (const item of archiveRows.results || []) {
    await env.DB.prepare(
      `INSERT INTO daily_review_archive_news (
        archive_date, original_news_id, pub_date, title, content, url, source, type,
        rule_passed, rule_reason, processing_status, ai_summary, market_impact,
        importance_stars, related_symbols, news_hash, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(archive_date, news_hash) DO UPDATE SET
        original_news_id = excluded.original_news_id,
        pub_date = excluded.pub_date,
        title = excluded.title,
        content = excluded.content,
        url = excluded.url,
        source = excluded.source,
        type = excluded.type,
        rule_passed = excluded.rule_passed,
        rule_reason = excluded.rule_reason,
        processing_status = excluded.processing_status,
        ai_summary = excluded.ai_summary,
        market_impact = excluded.market_impact,
        importance_stars = excluded.importance_stars,
        related_symbols = excluded.related_symbols,
        news_hash = excluded.news_hash,
        archived_at = excluded.archived_at`,
    )
      .bind(
        archiveDate,
        item.id || null,
        item.pub_date || null,
        item.title || "",
        item.content || "",
        item.url || "",
        item.source || "",
        normalizeCanonicalNewsType(item.type),
        item.rule_passed ? 1 : 0,
        item.rule_reason || "",
        item.processing_status || "",
        item.ai_summary || "",
        item.market_impact || "",
        Number(item.importance_stars || 0),
        item.related_symbols || "[]",
        item.news_hash || null,
        isoNow(),
      )
      .run();
  }

  return { ok: true, archiveDate, reviewStatus: "reviewed" };
}

async function initializeReview(env, archiveDate) {
  const now = isoNow();
  const newsWindow = await getNewsWindowForDate(env, archiveDate);
  const existing = await env.DB.prepare(
    `SELECT review_status FROM daily_review_archive WHERE archive_date = ? LIMIT 1`,
  )
    .bind(archiveDate)
    .first();

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO daily_review_archive (
        archive_date, review_status, reviewer_news_notes, market_sentiment,
        sector_rotation, trading_summary, reviewed_at, updated_at
      )
       VALUES (?, 'initialized', '', '', '', '', NULL, ?)`,
    )
      .bind(archiveDate, now)
      .run();
  } else if (existing.review_status === "reviewed") {
    return { ok: true, skipped: true, reason: "already reviewed" };
  } else {
    await env.DB.prepare(
      `UPDATE daily_review_archive
       SET review_status = 'initialized',
           reviewer_news_notes = '',
           market_sentiment = '',
           sector_rotation = '',
           trading_summary = '',
           reviewed_at = NULL,
           updated_at = ?
       WHERE archive_date = ?`,
    )
      .bind(now, archiveDate)
      .run();
  }

  await env.DB.prepare(`DELETE FROM daily_review_archive_news WHERE archive_date = ?`)
    .bind(archiveDate)
    .run();

  await env.DB.prepare(
    `UPDATE news_raw_data
     SET processing_status = 'llm_processed'
     WHERE pub_date >= ? AND pub_date <= ?
       AND processing_status = 'reviewed'`,
  )
    .bind(newsWindow.start, newsWindow.end)
    .run();

  return { ok: true, archiveDate, reviewStatus: "initialized" };
}

async function createReviewSnapshots(env, archiveDate, body = {}) {
  const snapshotReason = normalizeOptionalText(body.snapshotReason);
  const [reviewRecord, analysisRecord] = await Promise.all([
    env.DB.prepare(`SELECT * FROM daily_review_archive WHERE archive_date = ? LIMIT 1`)
      .bind(archiveDate)
      .first(),
    env.DB.prepare(`SELECT * FROM daily_news_ai_analysis WHERE analysis_date = ? LIMIT 1`)
      .bind(archiveDate)
      .first(),
  ]);

  if (!reviewRecord && !analysisRecord) {
    const error = new Error(`archive_date=${archiveDate} 的当前复盘记录和 AI 总结都不存在，无法创建快照`);
    error.statusCode = 404;
    throw error;
  }

  const result = {
    ok: true,
    archiveDate,
    snapshotReason,
    reviewSnapshot: null,
    analysisSnapshot: null,
    skipped: [],
  };

  if (reviewRecord) {
    const versionNo = await getNextSnapshotVersionNo(env, "daily_review_snapshots", "archive_date", archiveDate);
    const snapshotCreatedAt = isoNow();
    await env.DB.prepare(
      `INSERT INTO daily_review_snapshots (
        archive_date, version_no, snapshot_reason, review_status, reviewer_news_notes,
        market_sentiment, sector_rotation, trading_summary,
        reviewed_at, source_updated_at, snapshot_created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        archiveDate,
        versionNo,
        snapshotReason,
        reviewRecord.review_status || "initialized",
        reviewRecord.reviewer_news_notes || "",
        reviewRecord.market_sentiment || "",
        reviewRecord.sector_rotation || "",
        reviewRecord.trading_summary || "",
        reviewRecord.reviewed_at || null,
        reviewRecord.updated_at || null,
        snapshotCreatedAt,
      )
      .run();
    result.reviewSnapshot = {
      archive_date: archiveDate,
      version_no: versionNo,
      snapshot_created_at: snapshotCreatedAt,
    };
  } else {
    result.skipped.push({
      table: "daily_review_archive",
      reason: "current record not found",
    });
  }

  if (analysisRecord) {
    const versionNo = await getNextSnapshotVersionNo(
      env,
      "daily_news_ai_analysis_snapshots",
      "analysis_date",
      archiveDate,
    );
    const snapshotCreatedAt = isoNow();
    await env.DB.prepare(
      `INSERT INTO daily_news_ai_analysis_snapshots (
        analysis_date, version_no, snapshot_reason, daily_major_events,
        sector_impact_map, linkage_logic_chain, source_news_ids,
        source_updated_at, snapshot_created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        archiveDate,
        versionNo,
        snapshotReason,
        analysisRecord.daily_major_events || "",
        analysisRecord.sector_impact_map || "",
        analysisRecord.linkage_logic_chain || "",
        analysisRecord.source_news_ids || null,
        analysisRecord.updated_at || null,
        snapshotCreatedAt,
      )
      .run();
    result.analysisSnapshot = {
      analysis_date: archiveDate,
      version_no: versionNo,
      snapshot_created_at: snapshotCreatedAt,
    };
  } else {
    result.skipped.push({
      table: "daily_news_ai_analysis",
      reason: "current record not found",
    });
  }

  result.message = result.skipped.length
    ? "快照已创建；缺失主表的数据已按表独立跳过"
    : "快照已创建";
  return result;
}

async function getNextSnapshotVersionNo(env, tableName, dateColumn, dateValue) {
  const row = await env.DB.prepare(
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version
     FROM ${tableName}
     WHERE ${dateColumn} = ?`,
  )
    .bind(dateValue)
    .first();
  return Number(row?.next_version || 1);
}

function normalizeOptionalText(value) {
  const text = String(value || "").trim();
  return text || null;
}

// 以 GSPC（S&P 500）作为 NYSE 收盘日代理：当 GSPC 有价格记录时，说明 NYSE 当天已收盘。
// 这样可以避免亚洲指数/汇率/商品先进入下一自然日时把复盘候选日错误推进。
async function getLatestClosedNyseTradingDay(env) {
  const row = await env.DB.prepare(
    `SELECT MAX(k_date) AS latest FROM stock_raw WHERE symbol = 'GSPC'`,
  ).first();
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
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

function todayDate() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
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

// ============================================================
// Symbol Management
// ============================================================

async function getSymbols(env, url) {
  const type = url.searchParams.get("type");
  const activeOnly = url.searchParams.get("active") !== "0";
  const clauses = [];
  const params = [];
  if (type) { clauses.push("symbol_type = ?"); params.push(type); }
  if (activeOnly) { clauses.push("is_active = 1"); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await env.DB.prepare(
    `SELECT id, symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order, created_at, updated_at
     FROM tracked_symbols ${where} ORDER BY symbol_type, sort_order, id`,
  ).bind(...params).all();
  const items = (result.results || []).map(enrichSymbolItem);
  return { items, total: items.length };
}

async function getSymbolById(env, id) {
  const row = await env.DB.prepare(
    `SELECT id, symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order, created_at, updated_at
     FROM tracked_symbols WHERE id = ? LIMIT 1`,
  ).bind(id).first();
  if (!row) { const e = new Error("Symbol not found"); e.statusCode = 404; throw e; }
  return { item: enrichSymbolItem(row) };
}

async function createSymbol(env, body) {
  validateSymbolBody(body);
  const now = isoNow();
  const aliases = normalizeAliases(body.aliases, body.symbol, body.display_name);
  const result = await env.DB.prepare(
    `INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  ).bind(
    body.symbol.trim().toUpperCase(),
    (body.yahoo_symbol || "").trim() || null,
    body.display_name.trim(),
    body.symbol_type,
    JSON.stringify(aliases),
    Number(body.sort_order ?? 0),
    now, now,
  ).run();
  const created = await env.DB.prepare(
    `SELECT * FROM tracked_symbols WHERE id = ? LIMIT 1`,
  ).bind(result.meta.last_row_id).first();
  return { ok: true, item: enrichSymbolItem(created) };
}

async function updateSymbol(env, id, body) {
  const existing = await env.DB.prepare(
    `SELECT * FROM tracked_symbols WHERE id = ? LIMIT 1`,
  ).bind(id).first();
  if (!existing) { const e = new Error("Symbol not found"); e.statusCode = 404; throw e; }

  const symbol = (body.symbol || existing.symbol).trim().toUpperCase();
  const displayName = (body.display_name || existing.display_name).trim();
  const aliases = body.aliases != null
    ? normalizeAliases(body.aliases, symbol, displayName)
    : JSON.parse(existing.aliases || "[]");

  await env.DB.prepare(
    `UPDATE tracked_symbols SET
       symbol = ?, yahoo_symbol = ?, display_name = ?, symbol_type = ?,
       aliases = ?, is_active = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(
    symbol,
    (body.yahoo_symbol != null ? body.yahoo_symbol : existing.yahoo_symbol) || null,
    displayName,
    body.symbol_type || existing.symbol_type,
    JSON.stringify(aliases),
    body.is_active != null ? Number(body.is_active) : existing.is_active,
    body.sort_order != null ? Number(body.sort_order) : existing.sort_order,
    isoNow(),
    id,
  ).run();
  const updated = await env.DB.prepare(`SELECT * FROM tracked_symbols WHERE id = ? LIMIT 1`).bind(id).first();
  return { ok: true, item: enrichSymbolItem(updated) };
}

async function deleteSymbol(env, id) {
  const existing = await env.DB.prepare(`SELECT * FROM tracked_symbols WHERE id = ? LIMIT 1`).bind(id).first();
  if (!existing) { const e = new Error("Symbol not found"); e.statusCode = 404; throw e; }
  // 软删除
  await env.DB.prepare(`UPDATE tracked_symbols SET is_active = 0, updated_at = ? WHERE id = ?`).bind(isoNow(), id).run();
  const updated = await env.DB.prepare(`SELECT * FROM tracked_symbols WHERE id = ? LIMIT 1`).bind(id).first();
  return { ok: true, id, item: enrichSymbolItem(updated) };
}

async function resolveSymbol(env, body) {
  const userInput = (body.input || "").trim();
  if (!userInput) { const e = new Error("input is required"); e.statusCode = 400; throw e; }

  // 已有标的（避免重复提示）
  const existing = await env.DB.prepare(`SELECT symbol FROM tracked_symbols WHERE is_active = 1`).all();
  const existingSymbols = (existing.results || []).map((r) => r.symbol);

  // 调用 LLM 识别
  const llmApiKey = env.LLM_API_KEY;
  const llmBaseUrl = env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const llmModel = env.LLM_MODEL_ID || "qwen-plus";

  let resolved = null;
  if (llmApiKey) {
    resolved = await callLLMForSymbol(llmApiKey, llmBaseUrl, llmModel, userInput, existingSymbols);
  }

  // Yahoo 验价（并行，但 LLM 可能失败）
  let validation = null;
  const yahooCode = resolved?.yahoo_symbol || resolved?.symbol;
  if (yahooCode) {
    validation = await fetchYahooValidation(yahooCode);
    // Yahoo 返回的 instrumentType 可辅助校正 symbol_type
    if (validation?.valid && validation.instrumentType && resolved) {
      const inferredType = inferSymbolType(validation.instrumentType);
      if (inferredType && inferredType !== resolved.symbol_type) {
        resolved._yahoo_type_hint = inferredType;
      }
    }
  }

  return {
    resolved,
    validation,
    isDuplicate: resolved ? existingSymbols.includes(resolved.symbol) : false,
  };
}

async function callLLMForSymbol(apiKey, baseUrl, model, userInput, existingSymbols) {
  const prompt = `请识别以下输入对应的金融标的："${userInput}"

返回一个 JSON 对象（只返回 JSON，不要解释）：
{
  "symbol": "系统唯一标识，简短人类友好。个股用ticker(如MU)，指数去掉^前缀(如GSPC)，ETF用代码(如XLK)",
  "yahoo_symbol": "Yahoo Finance精确代码。注意：美股指数需要^前缀(如^GSPC)，上证用000001.SS，美元指数用DX-Y.NYB，黄金用GC=F，原油用CL=F",
  "display_name": "中文显示名称",
  "symbol_type": "index（大盘指数/大宗商品/汇率/波动率）或 sector（板块ETF/行业指数）或 stock（个股）",
  "aliases": ["中英文别名数组，用于新闻匹配，至少包含symbol、公司名、中文名"],
  "confidence": "high 或 medium 或 low",
  "reason": "一句话识别依据"
}

已有标的（参考，避免重复）：${JSON.stringify(existingSymbols)}
只返回 JSON。`;

  try {
    const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "你是金融标的识别助手，只输出JSON，不输出解释。" },
          { role: "user", content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    // 规范化字段
    if (parsed.symbol) parsed.symbol = parsed.symbol.trim().toUpperCase();
    if (!["index", "sector", "stock"].includes(parsed.symbol_type)) parsed.symbol_type = "stock";
    if (!Array.isArray(parsed.aliases)) parsed.aliases = [parsed.symbol];
    return parsed;
  } catch {
    return null;
  }
}

async function fetchYahooValidation(yahooSymbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return { valid: false, error: `HTTP ${resp.status}` };
    const data = await resp.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return { valid: false, error: "no data" };
    const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPreviousClose;
    const cur = meta.regularMarketPrice;
    return {
      valid: true,
      latestPrice: cur,
      previousClose: prev,
      changePct: cur && prev ? (((cur - prev) / prev) * 100).toFixed(2) + "%" : null,
      currency: meta.currency,
      exchangeName: meta.fullExchangeName || meta.exchangeName,
      instrumentType: meta.instrumentType,
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

function inferSymbolType(instrumentType) {
  if (!instrumentType) return null;
  const t = instrumentType.toUpperCase();
  if (t === "EQUITY") return "stock";
  if (t === "ETF") return "sector";
  if (t === "INDEX" || t === "FUTURE" || t === "CURRENCY" || t === "MUTUALFUND") return "index";
  return null;
}

function enrichSymbolItem(row) {
  if (!row) return null;
  let aliases = [];
  try { aliases = JSON.parse(row.aliases || "[]"); } catch { aliases = []; }
  return { ...row, aliases };
}

function normalizeAliases(input, symbol, displayName) {
  let list = [];
  if (typeof input === "string") {
    list = input.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (Array.isArray(input)) {
    list = input.map(String).map((s) => s.trim()).filter(Boolean);
  }
  // 始终包含 symbol 和 displayName
  if (symbol && !list.includes(symbol)) list.unshift(symbol);
  if (displayName && !list.includes(displayName)) list.push(displayName);
  return [...new Set(list)];
}

function validateSymbolBody(body) {
  if (!body.symbol?.trim()) { const e = new Error("symbol is required"); e.statusCode = 400; throw e; }
  if (!body.display_name?.trim()) { const e = new Error("display_name is required"); e.statusCode = 400; throw e; }
  if (!["index", "sector", "stock"].includes(body.symbol_type)) {
    const e = new Error("symbol_type must be index, sector, or stock"); e.statusCode = 400; throw e;
  }
}

// ── Screening Keywords CRUD ───────────────────────────────────────────────────

async function getScreeningKeywords(env, url) {
  const type = url.searchParams.get("type");
  const active = url.searchParams.get("active");

  let query = "SELECT * FROM screening_keywords WHERE 1=1";
  const params = [];
  if (type) { query += " AND keyword_type = ?"; params.push(type); }
  if (active !== null && active !== "") { query += " AND is_active = ?"; params.push(Number(active)); }
  query += " ORDER BY keyword_type, sort_order, language, keyword";

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return { items: results, total: results.length };
}

async function createScreeningKeyword(env, body) {
  const keyword = String(body.keyword || "").trim();
  const keyword_type = String(body.keyword_type || "").trim();
  const language = String(body.language || "zh").trim();

  if (!keyword) { const e = new Error("keyword is required"); e.statusCode = 400; throw e; }
  if (!["macro", "market", "noise", "symbol_context"].includes(keyword_type)) {
    const e = new Error("keyword_type must be macro, market, noise, or symbol_context"); e.statusCode = 400; throw e;
  }
  if (!["zh", "en"].includes(language)) {
    const e = new Error("language must be zh or en"); e.statusCode = 400; throw e;
  }

  // 检查是否重复
  const existing = await env.DB.prepare(
    "SELECT id FROM screening_keywords WHERE keyword = ? AND keyword_type = ?"
  ).bind(keyword, keyword_type).first();
  if (existing) { const e = new Error("keyword already exists for this type"); e.statusCode = 409; throw e; }

  const result = await env.DB.prepare(
    "INSERT INTO screening_keywords (keyword, keyword_type, language, is_active, sort_order) VALUES (?, ?, ?, 1, 100) RETURNING *"
  ).bind(keyword, keyword_type, language).first();
  return result;
}

async function updateScreeningKeyword(env, id, body) {
  const row = await env.DB.prepare("SELECT * FROM screening_keywords WHERE id = ?").bind(id).first();
  if (!row) { const e = new Error("keyword not found"); e.statusCode = 404; throw e; }

  const is_active = body.is_active !== undefined ? Number(body.is_active) : row.is_active;

  const result = await env.DB.prepare(
    "UPDATE screening_keywords SET is_active = ?, updated_at = datetime('now') WHERE id = ? RETURNING *"
  ).bind(is_active, id).first();
  return result;
}

async function deleteScreeningKeyword(env, id) {
  const row = await env.DB.prepare("SELECT id FROM screening_keywords WHERE id = ?").bind(id).first();
  if (!row) { const e = new Error("keyword not found"); e.statusCode = 404; throw e; }
  await env.DB.prepare("DELETE FROM screening_keywords WHERE id = ?").bind(id).run();
  return { ok: true, deleted_id: id };
}
