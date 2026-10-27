import { createMarketReview, assembleMarketReview, serializeMarketReview, validateMarketReviewBlocks, patchMarketReviewLevels, projectMarketReview } from '../../web/market-review-model.js';

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
const PROTECTED_INVESTMENT_ACCOUNT_NAMES = new Set(["老虎-美股", "东方财富-国内", "天天基金-国内"]);
const MARKET_ACCOUNT_FALLBACKS = {
  "美股": "老虎-美股",
  "大A": "东方财富-国内",
};

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
        return json(await deleteSymbol(env, symbolId, url.searchParams.get("hard") === "1"), 200, request);
      }
    }
    // ── Investment Account Management ─────────────────────────
    if (url.pathname === "/api/investment-accounts" && request.method === "GET") {
      return json(await getInvestmentAccounts(env, url), 200, request);
    }
    if (url.pathname === "/api/account-fund-summary" && request.method === "GET") {
      return json(await getAccountFundSummary(env), 200, request);
    }
    if (url.pathname === "/api/investment-accounts" && request.method === "POST") {
      const body = await request.json();
      return json(await createInvestmentAccount(env, body), 200, request);
    }
    const accountMatch = url.pathname.match(/^\/api\/investment-accounts\/(\d+)$/);
    if (accountMatch) {
      const accountId = Number(accountMatch[1]);
      if (request.method === "GET") return json(await getInvestmentAccountById(env, accountId), 200, request);
      if (request.method === "PUT") return json(await updateInvestmentAccount(env, accountId, await request.json()), 200, request);
      if (request.method === "DELETE") return json(await deleteInvestmentAccount(env, accountId), 200, request);
    }
    // ── Account-managed Live Action Plans ─────────────────────
    if (url.pathname === "/api/account-live-action-plans/symbols" && request.method === "GET") {
      return json(await getAccountLiveActionPlanSymbolCatalog(env), 200, request);
    }
    if (url.pathname === "/api/account-live-action-plans" && request.method === "GET") {
      return json(await getAccountLiveActionPlansResponse(env), 200, request);
    }
    if (url.pathname === "/api/account-live-action-plans" && request.method === "POST") {
      const body = await request.json();
      return json(await createAccountLiveActionPlan(env, body), 200, request);
    }
    const liveActionPlanMatch = url.pathname.match(/^\/api\/account-live-action-plans\/(\d+)$/);
    if (liveActionPlanMatch) {
      const planId = Number(liveActionPlanMatch[1]);
      if (request.method === "GET") {
        const result = await getAccountLiveActionPlanById(env, planId);
        if (!result.item) {
          const error = new Error("活态操作计划不存在");
          error.statusCode = 404;
          throw error;
        }
        return json(result, 200, request);
      }
      if (request.method === "PUT") {
        return json(await updateAccountLiveActionPlan(env, planId, await request.json()), 200, request);
      }
      if (request.method === "DELETE") {
        return json(await deleteAccountLiveActionPlan(env, planId), 200, request);
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

    const actionPlanSymbolsMatch = url.pathname.match(/^\/api\/reviews\/(\d{4}-\d{2}-\d{2})\/action-plan-symbols$/);
    if (actionPlanSymbolsMatch && request.method === "GET") {
      return json(await getActionPlanSymbolCatalog(env, actionPlanSymbolsMatch[1]), 200, request);
    }

    const accountImpactPreviewMatch = url.pathname.match(/^\/api\/reviews\/(\d{4}-\d{2}-\d{2})\/account-impact\/preview$/);
    if (accountImpactPreviewMatch && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      return json(await previewReviewAccountImpact(env, accountImpactPreviewMatch[1], body), 200, request);
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
        return json(await withReviewTimings(env, (timedEnv) => saveReviewDraft(timedEnv, archiveDate, body)), 200, request);
      }
      if (action === "complete" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        return json(await withReviewTimings(env, (timedEnv) => completeReview(timedEnv, archiveDate, body)), 200, request);
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
      error.statusCode || error.status || 500,
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
  return new Response(JSON.stringify(data), {
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
  const limit = parsePendingReviewLimit(url.searchParams.get("limit"));
  const latestClosedDate = await getLatestClosedNyseTradingDay(env);
  if (!latestClosedDate) {
    return { items: [], latestClosedDate: null };
  }

  let query = `SELECT archive_date, review_status, updated_at
     FROM daily_review_archive
     WHERE archive_date <= ?
       AND COALESCE(review_status, 'initialized') NOT IN ('reviewed', 'completed')
     ORDER BY archive_date DESC`;
  if (limit !== null) query += " LIMIT ?";
  const statement = env.DB.prepare(query);
  const archiveRows = limit === null
    ? await statement.bind(latestClosedDate).all()
    : await statement.bind(latestClosedDate, limit).all();

  return {
    latestClosedDate,
    latestArchiveDate: await getLatestArchiveDate(env),
    items: (archiveRows.results || []).map((row) => ({
      archiveDate: row.archive_date,
      reviewStatus: normalizeReviewStatus(row.review_status),
      updatedAt: row.updated_at || null,
    })),
  };
}

function parsePendingReviewLimit(rawValue) {
  const normalized = String(rawValue ?? "").trim().toLowerCase();
  if (normalized === "all") return null;
  const parsed = Number(normalized || "10");
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(Math.max(Math.floor(parsed), 1), 500);
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
    clauses.push("a.review_status = ?");
    params.push(status);
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const dataQuery = `SELECT
      a.archive_date,
      a.review_status AS review_status,
      a.updated_at,
      a.reviewed_at,
      a.reviewer_news_notes,
      a.market_review_json,
      a.market_sentiment_blocks_json,
      a.sector_rotation_blocks_json,
      (
        SELECT GROUP_CONCAT(symbol, ' | ')
        FROM daily_review_action_plans p
        WHERE p.archive_date = a.archive_date
        ORDER BY p.sort_order ASC, p.symbol ASC
      ) AS action_plan_summary,
      a.trading_summary,
      n.daily_major_events,
      n.linkage_logic_chain,
      s.accounts_snapshot AS account_snapshot_json
    FROM daily_review_archive a
    LEFT JOIN daily_news_ai_analysis n ON n.analysis_date = a.archive_date
    LEFT JOIN review_account_snapshots s ON s.archive_date = a.archive_date
    ${whereClause}
    ORDER BY a.archive_date DESC
    LIMIT ? OFFSET ?`;

  if (usePagination) {
    const countQuery = `SELECT COUNT(*) AS cnt FROM daily_review_archive a ${whereClause}`;
    const [countResult, dataResult, latestArchiveDate] = await Promise.all([
      env.DB.prepare(countQuery).bind(...params).first(),
      env.DB.prepare(dataQuery).bind(...params, limitVal, offset).all(),
      getLatestArchiveDate(env),
    ]);
    const total = Number(countResult?.cnt || 0);
    const items = await buildReviewListItems(env, dataResult.results || []);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize), latestArchiveDate };
  }

  // 兼容模式
  const result = await env.DB.prepare(dataQuery).bind(...params, limitVal, 0).all();
  let items = await buildReviewListItems(env, result.results || []);
  if (status) {
    items = items.filter((item) => item.review_status === status);
  }
  return { items, latestArchiveDate: await getLatestArchiveDate(env) };
}

async function buildReviewListItems(env, rows) {
  return Promise.all((rows || []).map(async (item) => {
    const { account_snapshot_json: accountSnapshotJson, ...reviewItem } = item;
    const reviewStatus = normalizeReviewStatus(item.review_status);
    const embeddedSnapshot = accountSnapshotJson == null
      ? null
      : { accounts: parseJsonArray(accountSnapshotJson).map((account) => normalizeAccountSnapshotEntry(account)) };
    const accountImpactSummary = reviewStatus === "reviewed"
      ? await buildAccountImpactSummaryForReview(env, item.archive_date, { snapshot: embeddedSnapshot })
      : [];
    return {
      ...reviewItem,
      review_status: reviewStatus,
      news_summary: item.reviewer_news_notes || item.linkage_logic_chain || "",
      daily_thesis: deriveReviewDailyThesis(item),
      account_impact_summary: accountImpactSummary,
      account_estimate_summary: accountImpactSummary,
    };
  }));
}

function firstMeaningfulLine(value, maxLength = 84) {
  const line = String(value || "")
    .split(/\n+/)
    .map((item) => item.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  if (!line) return "";
  return line.length > maxLength ? `${line.slice(0, maxLength)}...` : line;
}

function deriveReviewDailyThesis(row = {}) {
  const tradingSummary = firstMeaningfulLine(row.trading_summary);
  if (tradingSummary) return tradingSummary;

  const reviewParts = row.market_review_json != null
    ? marketReviewThesisParts(row.market_review_json)
    : [
      firstReviewNoteBlockLine(row.market_sentiment_blocks_json, 42),
      firstReviewNoteBlockLine(row.sector_rotation_blocks_json, 42),
    ].filter(Boolean);
  if (reviewParts.length) return reviewParts.join(" / ");

  return firstMeaningfulLine(row.daily_major_events)
    || firstMeaningfulLine(row.linkage_logic_chain)
    || "待复盘";
}

// 新文档前两个主题：名称＋首行思考；不读价位，列表无需逐日期查询。
function marketReviewThesisParts(value) {
  let blocks = [];
  try { blocks = JSON.parse(value)?.blocks || []; } catch { return []; }
  return blocks.slice(0, 2).map((block) => {
    const name = block.type === "symbol" ? (block.identity?.displayName || block.symbol || "") : String(block.title || "").trim();
    const thinking = firstMeaningfulLine((block.children || []).find((child) => child.kind === "thinking")?.body, 84);
    const text = thinking ? `${name}：${thinking}` : name;
    return text.length > 42 ? `${text.slice(0, 42)}...` : text;
  }).filter(Boolean);
}

function firstReviewNoteBlockLine(value, maxLength = 42) {
  const blocks = normalizeReviewNoteBlocks(value);
  const title = blocks.map((block) => block.title).find(Boolean);
  if (!title) return "";
  return title.length > maxLength ? `${title.slice(0, maxLength)}...` : title;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createReviewNoteId(prefix, index, childIndex = null) {
  return childIndex == null ? `${prefix}-${index + 1}` : `${prefix}-${index + 1}-${childIndex + 1}`;
}

function normalizeReviewNoteBlocks(value, prefix = "note") {
  const source = parseJsonArray(value);
  return source
    .map((section, sectionIndex) => {
      if (!section || typeof section !== "object") return null;
      const title = String(section.title || "").trim();
      const childrenSource = Array.isArray(section.children)
        ? section.children
        : Array.isArray(section.subsections)
          ? section.subsections
          : [];
      const children = childrenSource
        .map((child, childIndex) => {
          if (!child || typeof child !== "object") return null;
          const childTitle = String(child.title || "").trim();
          const body = String(child.body || child.content || "").trim();
          if (!childTitle && !body) return null;
          return {
            id: String(child.id || createReviewNoteId(`${prefix}-sub`, sectionIndex, childIndex)),
            title: childTitle || "未命名维度",
            body,
          };
        })
        .filter(Boolean);
      if (!title && !children.length) return null;
      return {
        id: String(section.id || createReviewNoteId(prefix, sectionIndex)),
        title: title || "未命名主题",
        children,
      };
    })
    .filter(Boolean);
}

function resolveReviewNoteBlocks(record, jsonKey, prefix) {
  const saved = normalizeReviewNoteBlocks(record?.[jsonKey], prefix);
  if (saved.length) {
    return { blocks: saved, source: "saved" };
  }
  return { blocks: [], source: "empty" };
}

function getBatchReviewReadiness(record = {}) {
  const missingFields = [];
  if (!String(record.reviewer_news_notes || "").trim()) missingFields.push("news");
  const market = record.market_review_json == null ? createMarketReview() : JSON.parse(record.market_review_json);
  if (!market.blocks.length) missingFields.push("market");
  if (Number(record.action_plan_count || 0) <= 0) missingFields.push("plan");
  return { ready: missingFields.length === 0, missingFields };
}

function parsePositionWeight(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text === "0%") return 0;
  const greaterMatch = text.match(/^>\s*(\d+(?:\.\d+)?)%$/);
  if (greaterMatch) return Number(greaterMatch[1]) / 100 + 0.05;
  const rangeMatch = text.match(/^(\d+(?:\.\d+)?)%?\s*-\s*(\d+(?:\.\d+)?)%$/);
  if (rangeMatch) {
    const low = Number(rangeMatch[1]);
    const high = Number(rangeMatch[2]);
    if (Number.isFinite(low) && Number.isFinite(high)) return ((low + high) / 2) / 100;
  }
  return null;
}

function positionBucketMidpoint(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text === "0%") return { weight: 0, label: "0% → 0%" };
  const normalized = text.replace(/^0-5%$/, "0%-5%");
  if (normalized === ">30%") return { weight: 0.3, label: ">30% → 30%" };
  const rangeMatch = normalized.match(/^(\d+(?:\.\d+)?)%\s*-\s*(\d+(?:\.\d+)?)%$/);
  if (!rangeMatch) return null;
  const low = Number(rangeMatch[1]);
  const high = Number(rangeMatch[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  const midpoint = (low + high) / 2;
  const sourceLabel = text === "0-5%" ? "0-5%" : normalized;
  return { weight: midpoint / 100, label: `${sourceLabel} → ${formatPercentLabel(midpoint)}` };
}

function formatPercentLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return `${Number(number.toFixed(2)).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}%`;
}

function bucketEstimatedImpactPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (Math.abs(number) < 0.05) return "≈0%";
  if (number >= 4) return "≥4%";
  if (number <= -4) return "≤-4%";
  if (number > 0) {
    const low = Math.floor(number);
    return `${low}~${low + 1}%`;
  }
  const low = Math.floor(number);
  return `${low}~${low + 1}%`;
}

function impactDirection(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) < 0.05) return "flat";
  return number > 0 ? "gain" : "loss";
}

function buildAccountImpactSummaryFromSnapshot(snapshot) {
  if (snapshot?.accounts?.length) {
    const withImpact = snapshot.accounts
      .filter((account) => account.impact)
      .map((account) => ({
        accountId: account.accountId,
        accountName: account.accountName,
        currency: account.currency,
        ...account.impact,
        source: account.impact.source || "estimated_action_plan",
        label: "账户影响",
      }));
    if (withImpact.length) return withImpact;
    return snapshot.accounts.map((account) => ({
      accountId: account.accountId,
      accountName: account.accountName,
      currency: account.currency,
      source: "snapshot",
      label: "已记录快照",
      rangeLabel: "已记录",
      direction: "flat",
    }));
  }

  return null;
}

async function buildAccountImpactSummaryForReview(env, archiveDate, options = {}) {
  const snapshot = Object.hasOwn(options, "snapshot")
    ? options.snapshot
    : await getReviewAccountSnapshot(env, archiveDate);
  const snapshotSummary = buildAccountImpactSummaryFromSnapshot(snapshot);
  if (snapshotSummary) return snapshotSummary;

  return buildEstimatedAccountImpactSummary(env, archiveDate, options);
}

async function buildEstimatedAccountImpactSummary(env, archiveDate, options = {}) {
  const actionPlans = Object.hasOwn(options, "actionPlans")
    ? options.actionPlans
    : await listReviewActionPlans(env, archiveDate);
  return buildEstimatedAccountImpactSummaryForPlans(env, archiveDate, actionPlans, options);
}

async function buildEstimatedAccountImpactSummaryForPlans(env, archiveDate, actionPlans = [], options = {}) {
  if (!actionPlans.length) return [];
  const accounts = Object.hasOwn(options, "accounts")
    ? options.accounts
    : await listInvestmentAccounts(env, { includeDisabled: true });
  const symbols = [...new Set(actionPlans.map((plan) => plan.symbol).filter(Boolean))];
  const [priceMap, previousSymbolsByAccount] = await Promise.all([
    Object.hasOwn(options, "priceMap")
      ? options.priceMap
      : getLatestPricePointMap(env, symbols, archiveDate),
    Object.hasOwn(options, "previousSymbolsByAccount")
      ? options.previousSymbolsByAccount
      : getPreviousActionPlanSymbolKeys(env, archiveDate),
  ]);
  return buildAccountImpactSummaryFromPlans({
    actionPlans,
    accounts,
    priceMap,
    previousSymbolsByAccount,
  });
}

function buildAccountImpactSummaryFromPlans({
  actionPlans = [],
  accounts = [],
  priceMap = new Map(),
  previousSymbolsByAccount = new Set(),
} = {}) {
  const accountMap = new Map(accounts.map((account) => [Number(account.id), account]));
  const totalsByAccount = new Map();

  for (const plan of actionPlans) {
    const accountId = Number(plan.accountId);
    const account = accountMap.get(accountId);
    if (!account || !isSnapshotEligibleAccount(account)) continue;
    const key = `${accountId}:${plan.symbol}`;
    const weight = parsePositionWeight(plan.currentPosition);
    const changePercent = priceMap.get(plan.symbol)?.change_percent;
    if (!previousSymbolsByAccount.has(key)) {
      addImpactSkip(totalsByAccount, account, "新增标的，当日不计入");
      continue;
    }
    if (weight == null || changePercent == null || !Number.isFinite(Number(changePercent))) {
      addImpactSkip(totalsByAccount, account, "缺少仓位或价格涨跌幅");
      continue;
    }
    const current = totalsByAccount.get(accountId) || createImpactAccumulator(account);
    current.valuePercent += weight * Number(changePercent);
    current.contributors += 1;
    totalsByAccount.set(accountId, current);
  }

  return [...totalsByAccount.values()].map((item) => {
    if (!item.contributors) {
      return {
        accountId: item.accountId,
        accountName: item.accountName,
        currency: item.currency,
        source: "estimate",
        label: "账户估算影响",
        rangeLabel: "暂无数据",
        direction: "flat",
        contributors: 0,
        skippedReasons: item.skippedReasons,
      };
    }
    return {
      accountId: item.accountId,
      accountName: item.accountName,
      currency: item.currency,
      source: "estimate",
      label: "账户估算影响",
      rangeLabel: bucketEstimatedImpactPercent(item.valuePercent),
      direction: impactDirection(item.valuePercent),
      valuePercent: item.valuePercent,
      contributors: item.contributors,
      skippedReasons: item.skippedReasons,
    };
  });
}

function createImpactAccumulator(account) {
  return {
    accountId: Number(account.id),
    accountName: account.name,
    currency: account.currency,
    valuePercent: 0,
    contributors: 0,
    skippedReasons: [],
  };
}

function addImpactSkip(map, account, reason) {
  const accountId = Number(account.id);
  const current = map.get(accountId) || createImpactAccumulator(account);
  if (reason && !current.skippedReasons.includes(reason)) current.skippedReasons.push(reason);
  map.set(accountId, current);
}

async function previewReviewAccountImpact(env, archiveDate, body = {}) {
  const inputPlans = Array.isArray(body.actionPlans) ? body.actionPlans : [];
  const investmentAccounts = await listInvestmentAccounts(env, { includeDisabled: true });
  const normalizedPlans = await resolveActionPlanAccountsForSave(
    env,
    normalizeActionPlansForSave(inputPlans),
    { accounts: investmentAccounts },
  );
  const accounts = await buildEstimatedAccountImpactSummaryForPlans(
    env,
    archiveDate,
    normalizedPlans,
    { accounts: investmentAccounts },
  );
  return { accounts };
}

function impactSummaryToSnapshotImpact(item = {}) {
  return normalizeAccountImpactEntry({
    source: "estimated_action_plan",
    valuePercent: item.valuePercent,
    rangeLabel: item.rangeLabel || "暂无数据",
    direction: item.direction || "flat",
    contributors: item.contributors || 0,
    skippedReasons: item.skippedReasons || [],
  });
}

async function getPreviousActionPlanSymbolKeys(env, archiveDate) {
  const rows = await env.DB.prepare(
    `SELECT account_id, symbol
     FROM daily_review_action_plans
     WHERE archive_date = (
       SELECT MAX(archive_date)
       FROM daily_review_action_plans
       WHERE archive_date < ?
     )`,
  ).bind(archiveDate).all();
  return previousActionPlanSymbolKeysFromRows(rows.results || []);
}

function previousActionPlanSymbolKeysFromRows(rows = []) {
  return new Set(rows.map((row) => `${Number(row.account_id)}:${row.symbol}`));
}

function symbolLevelMapFromRows(rows) {
  return Object.fromEntries(rows.map(row => [row.symbol, {
    supportLevels: row.support_levels,
    resistanceLevels: row.resistance_levels,
  }]));
}

// Existing rows, including two empty strings, are authoritative. Legacy raw
// plans only supply missing symbols; callers order them by account then plan.
function resolvePlanSymbolLevels(levelRows, planRows, { conflicts = false } = {}) {
  const symbolLevels = symbolLevelMapFromRows(levelRows);
  const differences = [];
  for (const symbol of new Set(planRows.map(row => row.symbol))) {
    if (Object.hasOwn(symbolLevels, symbol)) continue;
    const candidates = planRows.filter(row => row.symbol === symbol);
    const levels = {};
    for (const [field, column] of [['supportLevels', 'support_levels'], ['resistanceLevels', 'resistance_levels']]) {
      const nonempty = candidates.filter(row => typeof row[column] === 'string' && row[column].trim());
      const selected = nonempty[0];
      levels[field] = selected?.[column] ?? '';
      const alternatives = nonempty.filter(row => row[column] !== levels[field]);
      if (conflicts && alternatives.length) differences.push({
        id: `live:${symbol}:${field}`, symbol, field, selectedValue: levels[field],
        selectedSource: { accountId: Number(selected.account_id), planId: Number(selected.id), source: 'live' },
        alternatives: alternatives.map(row => ({ value: row[column], accountId: Number(row.account_id), planId: Number(row.id) })),
      });
    }
    Object.defineProperty(symbolLevels, symbol, { value: levels, enumerable: true, configurable: true, writable: true });
  }
  return { symbolLevels, conflicts: differences };
}

function projectActionPlanPrices(rows, symbolLevels, toApi = dbActionPlanToApi) {
  return rows.map(row => ({ ...toApi(row), ...(Object.hasOwn(symbolLevels, row.symbol)
    ? symbolLevels[row.symbol] : { supportLevels: '', resistanceLevels: '' }) }));
}

function nonEmptyJsonArraySql(column, path = '') {
  return `(CASE WHEN json_valid(${column}) THEN json_array_length(${column}${path ? `, '${path}'` : ''}) ELSE 0 END) > 0`;
}

// 沿用候选：最近非空新文档基线，及其后各组最近非空旧列（新文档日期的冻结旧列不参与）。
// dateSql 为 '?' 或标量子查询；两条语句并入调用方既有读批次，不增加往返。
function prepareMarketHistoryReads(env, dateSql, dateParams = []) {
  const baseline = `(SELECT MAX(archive_date) FROM daily_review_archive
    WHERE archive_date < ${dateSql} AND review_status = 'reviewed' AND market_review_json IS NOT NULL
      AND ${nonEmptyJsonArraySql('market_review_json', '$.blocks')})`;
  const legacy = column => `(SELECT MAX(archive_date) FROM daily_review_archive
    WHERE archive_date < ${dateSql} AND review_status = 'reviewed' AND market_review_json IS NULL
      AND ${nonEmptyJsonArraySql(column)} AND archive_date > COALESCE(${baseline}, ''))`;
  return [
    env.DB.prepare(
      `SELECT archive_date, review_status, market_review_json, market_sentiment_blocks_json, sector_rotation_blocks_json
       FROM daily_review_archive
       WHERE archive_date IN (${baseline}, ${legacy('market_sentiment_blocks_json')}, ${legacy('sector_rotation_blocks_json')})
       ORDER BY archive_date DESC`,
    ).bind(...Array.from({ length: 5 }, () => dateParams).flat()),
    env.DB.prepare(`SELECT * FROM daily_review_symbol_levels WHERE archive_date = ${baseline} ORDER BY symbol`).bind(...dateParams),
  ];
}

function projectArchiveMarketReview({
  archiveDate, archive, catalog, levelRows = [], planRows = [], historyRows = [], baselineLevelRows = [], allowInheritance = false,
}) {
  const historyLevels = {};
  for (const row of baselineLevelRows) {
    historyLevels[row.archive_date] ??= {};
    Object.assign(historyLevels[row.archive_date], symbolLevelMapFromRows([row]));
  }
  return projectMarketReview({
    archiveDate, target: archive || {}, catalog, history: historyRows, levelRows, planRows, historyLevels, allowInheritance,
  });
}

async function getReviewByDate(env, archiveDate) {
  const reads = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM daily_review_archive WHERE archive_date = ? LIMIT 1`).bind(archiveDate),
    env.DB.prepare(`SELECT * FROM daily_review_symbol_levels WHERE archive_date = ? ORDER BY symbol`).bind(archiveDate),
    prepareDailyReviewPlanRead(env, archiveDate),
    env.DB.prepare(`SELECT * FROM tracked_symbols ORDER BY symbol_type, market_type, sort_order, id`),
  ]);
  const archive = firstBatchRow(reads[0]);
  const { marketReview, symbolLevels } = projectArchiveMarketReview({
    archiveDate, archive, catalog: (reads[3]?.results || []).map(enrichSymbolItem),
    levelRows: reads[1]?.results || [], planRows: reads[2]?.results || [],
  });
  return {
    archiveDate,
    review: archive ? {
      ...archive,
      review_status: normalizeReviewStatus(archive.review_status),
      marketReview,
      symbolLevels,
      market_sentiment_blocks: resolveReviewNoteBlocks(
        archive,
        "market_sentiment_blocks_json",
        "market",
      ).blocks,
      sector_rotation_blocks: resolveReviewNoteBlocks(
        archive,
        "sector_rotation_blocks_json",
        "rotation",
      ).blocks,
    } : null,
  };
}

async function getReviewBootstrap(env, archiveDate) {
  const [historyRead, baselineLevelsRead] = prepareMarketHistoryReads(env, '?', [archiveDate]);
  const phaseOne = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM investment_accounts ORDER BY sort_order ASC, id ASC`),
    env.DB.prepare(`SELECT * FROM daily_review_archive WHERE archive_date = ? LIMIT 1`).bind(archiveDate),
    // 活跃标的驱动，并逐标的定位最近交易日；可直接使用 (symbol, k_date DESC) 索引。
    env.DB.prepare(
      `SELECT managed.symbol, p.stock_name, p.current_price, p.change_percent, p.volume, p.k_date,
         managed.yahoo_symbol, managed.display_name, managed.symbol_type,
         managed.market_type, managed.sort_order
       FROM tracked_symbols managed
       JOIN stock_raw p
         ON p.symbol = managed.symbol
        AND p.k_date = (
          SELECT MAX(point.k_date)
          FROM stock_raw point
          WHERE point.symbol = managed.symbol
            AND point.k_date <= ?
        )
       WHERE managed.is_active = 1
       ORDER BY managed.symbol`,
    ).bind(archiveDate),
    env.DB.prepare(
      `SELECT DISTINCT k_date FROM stock_raw
       WHERE k_date <= ? ORDER BY k_date DESC LIMIT 2`,
    ).bind(archiveDate),
    env.DB.prepare(`SELECT * FROM daily_news_ai_analysis WHERE analysis_date = ? LIMIT 1`).bind(archiveDate),
    historyRead,
    env.DB.prepare(
      `SELECT p.*, a.name AS account_name, a.currency AS account_currency,
          a.sort_order AS account_sort_order, a.enabled AS account_enabled
       FROM daily_review_action_plans p
       LEFT JOIN investment_accounts a ON a.id = p.account_id
       WHERE p.archive_date = ?
       ORDER BY COALESCE(a.sort_order, 999), COALESCE(a.id, 999999), p.sort_order, p.id`,
    ).bind(archiveDate),
    env.DB.prepare(`SELECT * FROM review_account_snapshots WHERE archive_date = ? LIMIT 1`).bind(archiveDate),
    env.DB.prepare(`SELECT MAX(archive_date) AS latest FROM daily_review_archive`),
    env.DB.prepare(`SELECT * FROM tracked_symbols ORDER BY symbol_type, market_type, sort_order, id`),
    env.DB.prepare(`SELECT * FROM daily_review_symbol_levels WHERE archive_date = ? ORDER BY symbol`).bind(archiveDate),
    baselineLevelsRead,
  ]);

  const investmentAccounts = (phaseOne[0]?.results || []).map(accountRowToApi);
  const existingDraft = firstBatchRow(phaseOne[1]);
  const currentPriceRows = phaseOne[2]?.results || [];
  const currentPricesRaw = { results: currentPriceRows };
  const newsWindow = buildNewsWindowFromRows(phaseOne[3]?.results || [], archiveDate);
  const analysis = firstBatchRow(phaseOne[4]);
  const rawActionPlans = phaseOne[6]?.results || [];
  const marketReviewSymbols = (phaseOne[9]?.results || []).map(enrichSymbolItem);
  const { marketReview, symbolLevels } = projectArchiveMarketReview({
    archiveDate, archive: existingDraft, catalog: marketReviewSymbols,
    levelRows: phaseOne[10]?.results || [], planRows: rawActionPlans,
    historyRows: phaseOne[5]?.results || [], baselineLevelRows: phaseOne[11]?.results || [], allowInheritance: true,
  });
  const actionPlans = projectActionPlanPrices(rawActionPlans, symbolLevels);
  const accountSnapshot = snapshotRowToApi(firstBatchRow(phaseOne[7]));
  const latestArchiveDate = firstBatchRow(phaseOne[8])?.latest || null;

  // prices 按 index / sector / stock 分组，并把 stock 拆成美股 / 大A。
  const pricesByType = { usStock: [], cnStock: [], sector: [], index: [] };
  for (const p of currentPriceRows) {
    const type = p.symbol_type || "stock";
    const marketType = normalizeSymbolMarketType(p.market_type || inferSymbolMarketType(p));
    const bucket = type === "stock"
      ? (marketType === "大A" ? pricesByType.cnStock : pricesByType.usStock)
      : (pricesByType[type] || pricesByType.usStock);
    bucket.push({
      ...p,
      display_name: p.display_name || p.stock_name || p.symbol,
      symbol_type: type,
      market_type: marketType,
      sort_order: p.sort_order ?? 999,
    });
  }
  for (const bucket of Object.values(pricesByType)) {
    bucket.sort((a, b) => a.sort_order - b.sort_order);
  }
  const pricesPayload = {
    ...pricesByType,
    stock: [...pricesByType.usStock, ...pricesByType.cnStock].sort((a, b) => a.sort_order - b.sort_order),
  };

  const useArchivedNews = normalizeReviewStatus(existingDraft?.review_status) === "reviewed";
  const sourceNewsIds = parseStoredIds(analysis?.source_news_ids);
  const phaseTwoStatements = [];
  let archivedNewsIndex = -1;
  let sourceNewsIndex = -1;

  if (useArchivedNews) {
    archivedNewsIndex = phaseTwoStatements.length;
    phaseTwoStatements.push(env.DB.prepare(
      `SELECT id AS archive_news_id, original_news_id, pub_date, title, content, source, type,
        ai_summary, market_impact, related_symbols, rule_passed, rule_reason,
        processing_status, importance_stars, url, news_hash
       FROM daily_review_archive_news
       WHERE archive_date = ?
       ORDER BY pub_date DESC, id DESC`,
    ).bind(archiveDate));
  }

  if (sourceNewsIds.length) {
    const placeholders = sourceNewsIds.map(() => "?").join(", ");
    sourceNewsIndex = phaseTwoStatements.length;
    phaseTwoStatements.push(env.DB.prepare(
      `SELECT id, pub_date, title, content, source, sub_source, language, type, ai_summary, market_impact,
        related_symbols, is_relevant_to_review, rule_passed, rule_reason,
        processing_status, importance_stars, url, news_hash
       FROM news_raw_data
       WHERE id IN (${placeholders})
       ORDER BY pub_date DESC, id DESC`,
    ).bind(...sourceNewsIds));
  }

  const reviewStatus = normalizeReviewStatus(existingDraft?.review_status);
  let accountImpactSummary = reviewStatus === "reviewed"
    ? buildAccountImpactSummaryFromSnapshot(accountSnapshot)
    : null;
  const needsEstimatedImpact = accountImpactSummary == null && actionPlans.length > 0;
  let priceResultStart = -1;
  let priceResultCount = 0;
  let previousSymbolsIndex = -1;
  if (needsEstimatedImpact) {
    const symbols = [...new Set(actionPlans.map((plan) => plan.symbol).filter(Boolean))];
    const priceStatements = prepareLatestPricePointStatements(env, symbols, archiveDate);
    priceResultStart = phaseTwoStatements.length;
    priceResultCount = priceStatements.length;
    phaseTwoStatements.push(...priceStatements);
    previousSymbolsIndex = phaseTwoStatements.length;
    phaseTwoStatements.push(env.DB.prepare(
      `SELECT account_id, symbol
       FROM daily_review_action_plans
       WHERE archive_date = (
         SELECT MAX(archive_date)
         FROM daily_review_action_plans
         WHERE archive_date < ?
       )`,
    ).bind(archiveDate));
  }

  const phaseTwo = phaseTwoStatements.length ? await env.DB.batch(phaseTwoStatements) : [];
  const archivedNewsRows = archivedNewsIndex >= 0 ? (phaseTwo[archivedNewsIndex]?.results || []) : [];
  const sourceNewsRows = sourceNewsIndex >= 0 ? (phaseTwo[sourceNewsIndex]?.results || []) : [];
  const newsItems = archivedNewsRows.length
    ? archivedNewsRows.map((item) => enrichNewsItem({
      ...item,
      id: item.archive_news_id,
      archived: 1,
    }))
    : sourceNewsRows.map(enrichNewsItem);

  if (needsEstimatedImpact) {
    accountImpactSummary = buildAccountImpactSummaryFromPlans({
      actionPlans,
      accounts: investmentAccounts,
      priceMap: latestPricePointMapFromBatchResults(
        phaseTwo.slice(priceResultStart, priceResultStart + priceResultCount),
      ),
      previousSymbolsByAccount: previousActionPlanSymbolKeysFromRows(
        phaseTwo[previousSymbolsIndex]?.results || [],
      ),
    });
  }
  if (accountImpactSummary == null) accountImpactSummary = [];

  // news 按类型分组
  const newsByType = { index: [], sector: [], stock: [] };
  for (const item of newsItems) {
    const t = item.type || "index";
    const bucket = newsByType[t] || newsByType.index;
    bucket.push(item);
  }

  return {
    archiveDate,
    latestArchiveDate,
    investmentAccounts,
    newsWindow,
    // 兼容旧版：prices 同时提供扁平数组和分组对象
    prices: pricesPayload,
    pricesFlat: (currentPricesRaw.results || []),
    news: newsItems,          // 全量（兼容旧版）
    newsByType,               // 按 index/sector/stock 分组
    analysis: normalizeReviewAnalysis(analysis, newsItems),
    actionPlans,
    accountSnapshot,
    accountImpactSummary,
    account_impact_summary: accountImpactSummary,
    marketReviewSymbols,
    symbolLevels,
    structuredNotes: {
      marketReview,
    },
    draft: existingDraft ? {
      ...existingDraft,
      review_status: reviewStatus,
      marketReview,
      symbolLevels,
    } : null,
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
  const keyLevels = String(item.keyLevels ?? item.key_levels ?? "");
  const rawAmount = item.positionAmount ?? item.position_amount;
  const positionAmount = rawAmount == null || rawAmount === ""
    ? null
    : (Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : null);
  return {
    id: item.id == null ? null : Number(item.id),
    accountId: Number.isFinite(Number(item.accountId ?? item.account_id))
      ? Number(item.accountId ?? item.account_id)
      : null,
    accountName: String(item.accountName || item.account_name || "").trim(),
    symbol,
    actionType: normalizeActionPlanAction(item.actionType || item.action_type),
    entryPlan: String(item.entryPlan || item.entry_plan || "").trim(),
    takeProfitPlan: String(item.takeProfitPlan || item.take_profit_plan || "").trim(),
    stopLossPlan: String(item.stopLossPlan || item.stop_loss_plan || "").trim(),
    supportLevels,
    resistanceLevels,
    keyLevels,
    currentPosition: normalizeActionPlanPosition(item.currentPosition || item.current_position || defaultActionPlanPositionForAction(item.actionType || item.action_type)),
    positionAmount,
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
    accountId: row.account_id == null ? null : Number(row.account_id),
    accountName: row.account_name || "",
    accountCurrency: row.account_currency || "",
    accountSortOrder: Number(row.account_sort_order ?? 999),
    accountEnabled: row.account_enabled == null ? 1 : Number(row.account_enabled),
    symbol: row.symbol,
    actionType: row.action_type || DEFAULT_ACTION_PLAN_ACTION,
    entryPlan: row.entry_plan || "",
    takeProfitPlan: row.take_profit_plan || "",
    stopLossPlan: row.stop_loss_plan || "",
    supportLevels: row.support_levels || "",
    resistanceLevels: row.resistance_levels || "",
    keyLevels: row.key_levels ?? "",
    currentPosition: row.current_position || DEFAULT_ACTION_PLAN_POSITION,
    positionAmount: row.position_amount == null ? null : Number(row.position_amount),
    thinking: row.thinking || "",
    marketType: row.market_type || "美股",
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function prepareDailyReviewPlanRead(env, archiveDate) {
  const statement = env.DB.prepare(
    `SELECT p.*, a.name AS account_name, a.currency AS account_currency,
        a.sort_order AS account_sort_order, a.enabled AS account_enabled
     FROM daily_review_action_plans p
     LEFT JOIN investment_accounts a ON a.id = p.account_id
     WHERE p.archive_date = ${archiveDate === undefined ? '(SELECT MAX(archive_date) FROM daily_review_archive)' : '?'}
     ORDER BY COALESCE(a.sort_order, 999), COALESCE(a.id, 999999), p.sort_order, p.id`,
  );
  return archiveDate === undefined ? statement : statement.bind(archiveDate);
}

async function listReviewActionPlans(env, archiveDate) {
  const reads = await env.DB.batch([
    prepareDailyReviewPlanRead(env, archiveDate),
    env.DB.prepare(`SELECT * FROM daily_review_symbol_levels WHERE archive_date = ? ORDER BY symbol`).bind(archiveDate),
  ]);
  const rows = reads[0]?.results || [];
  const { symbolLevels } = resolvePlanSymbolLevels(reads[1]?.results || [], rows);
  return projectActionPlanPrices(rows, symbolLevels);
}

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function computePercentChange(currentPrice, baselinePrice) {
  const current = Number(currentPrice);
  const baseline = Number(baselinePrice);
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

async function getLatestPricePointMap(env, symbols, targetDate) {
  if (!symbols.length) return new Map();
  const statements = prepareLatestPricePointStatements(env, symbols, targetDate);
  const results = await env.DB.batch(statements);
  return latestPricePointMapFromBatchResults(results);
}

function prepareLatestPricePointStatements(env, symbols, targetDate) {
  const statements = [];
  const chunkSize = 80;
  for (let index = 0; index < symbols.length; index += chunkSize) {
    const chunk = symbols.slice(index, index + chunkSize);
    const values = chunk.map(() => "(?)").join(", ");
    statements.push(env.DB.prepare(
      `WITH requested(symbol) AS (VALUES ${values})
       SELECT p.symbol, p.stock_name, p.yahoo_symbol, p.current_price, p.change_percent, p.k_date
       FROM requested requested_symbol
       JOIN stock_raw p
         ON p.symbol = requested_symbol.symbol
        AND p.k_date = (
          SELECT MAX(point.k_date)
          FROM stock_raw point
          WHERE point.symbol = requested_symbol.symbol
            AND point.k_date <= ?
            AND point.current_price IS NOT NULL
        )
       WHERE p.current_price IS NOT NULL`,
    ).bind(...chunk, targetDate));
  }
  return statements;
}

function latestPricePointMapFromBatchResults(results = []) {
  const points = new Map();
  for (const result of results) {
    for (const row of (result.results || [])) points.set(row.symbol, row);
  }
  return points;
}

function buildActionPlanSymbolMetrics(latest, weekBaseline, monthBaseline) {
  if (!latest) {
    return {
      latestDate: null,
      latestPrice: null,
      dayChangePercent: null,
      weekChangePercent: null,
      monthChangePercent: null,
    };
  }
  return {
    latestDate: latest.k_date || null,
    latestPrice: latest.current_price == null ? null : Number(latest.current_price),
    dayChangePercent: latest.change_percent == null ? null : Number(latest.change_percent),
    weekChangePercent: weekBaseline ? computePercentChange(latest.current_price, weekBaseline.current_price) : null,
    monthChangePercent: monthBaseline ? computePercentChange(latest.current_price, monthBaseline.current_price) : null,
  };
}

async function getActionPlanSymbolCatalog(env, archiveDate) {
  const result = await env.DB.prepare(
    `SELECT managed.id, managed.symbol, managed.yahoo_symbol, managed.display_name,
       managed.symbol_type, managed.market_type, managed.aliases, managed.is_active,
       managed.sort_order, managed.created_at, managed.updated_at,
       latest.k_date AS latest_date,
       latest.current_price AS latest_price,
       latest.change_percent AS day_change_percent,
       week.current_price AS week_baseline_price,
       month.current_price AS month_baseline_price
     FROM tracked_symbols managed
     LEFT JOIN stock_raw latest
       ON latest.symbol = managed.symbol
      AND latest.k_date = (
        SELECT MAX(point.k_date)
        FROM stock_raw point
        WHERE point.symbol = managed.symbol
          AND point.k_date <= ?
          AND point.current_price IS NOT NULL
      )
     LEFT JOIN stock_raw week
       ON week.symbol = managed.symbol
      AND week.k_date = (
        SELECT MAX(point.k_date)
        FROM stock_raw point
        WHERE point.symbol = managed.symbol
          AND point.k_date <= ?
          AND point.current_price IS NOT NULL
      )
     LEFT JOIN stock_raw month
       ON month.symbol = managed.symbol
      AND month.k_date = (
        SELECT MAX(point.k_date)
        FROM stock_raw point
        WHERE point.symbol = managed.symbol
          AND point.k_date <= ?
          AND point.current_price IS NOT NULL
      )
     WHERE managed.is_active = 1
     ORDER BY managed.symbol_type, managed.market_type, managed.sort_order, managed.id`,
  ).bind(archiveDate, shiftDate(archiveDate, -7), shiftDate(archiveDate, -30)).all();
  const symbolRows = result.results || [];
  const items = [];
  for (const row of symbolRows) {
    const symbolItem = enrichSymbolItem(row);
    items.push({
      id: symbolItem.id,
      symbol: symbolItem.symbol,
      yahooSymbol: symbolItem.yahoo_symbol,
      displayName: symbolItem.display_name,
      symbolType: symbolItem.symbol_type,
      marketType: symbolItem.market_type,
      aliases: symbolItem.aliases || [],
      sortOrder: symbolItem.sort_order,
      metrics: buildActionPlanSymbolMetrics(
        row.latest_date ? {
          k_date: row.latest_date,
          current_price: row.latest_price,
          change_percent: row.day_change_percent,
        } : null,
        row.week_baseline_price == null ? null : { current_price: row.week_baseline_price },
        row.month_baseline_price == null ? null : { current_price: row.month_baseline_price },
      ),
    });
  }
  return { items, total: items.length, archiveDate };
}

function accountRowToApi(row) {
  return {
    id: Number(row.id),
    name: row.name || "",
    broker: row.broker || "",
    accountType: row.account_type || "stock",
    region: row.region || "",
    currency: row.currency || "CNY",
    totalAssets: row.total_assets == null ? null : Number(row.total_assets),
    availableCash: row.available_cash == null ? null : Number(row.available_cash),
    enabled: Number(row.enabled ?? 1) === 1,
    sortOrder: Number(row.sort_order ?? 0),
    notes: row.notes || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeSnapshotNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeAccountImpactEntry(value = null) {
  if (!value || typeof value !== "object") return null;
  const valuePercent = normalizeSnapshotNumber(value.valuePercent ?? value.value_percent);
  const contributors = Number(value.contributors ?? 0);
  const skippedReasons = Array.isArray(value.skippedReasons)
    ? value.skippedReasons
    : Array.isArray(value.skipped_reasons)
      ? value.skipped_reasons
      : [];
  return {
    source: String(value.source || "estimated_action_plan").trim() || "estimated_action_plan",
    valuePercent,
    rangeLabel: String(value.rangeLabel || value.range_label || (valuePercent == null ? "暂无数据" : bucketEstimatedImpactPercent(valuePercent))).trim(),
    direction: String(value.direction || impactDirection(valuePercent)).trim() || "flat",
    contributors: Number.isFinite(contributors) ? contributors : 0,
    skippedReasons: skippedReasons.map((item) => String(item || "").trim()).filter(Boolean),
  };
}

function normalizeAccountSnapshotEntry(item = {}, fallback = {}) {
  const normalized = {
    accountId: Number(item.accountId ?? item.account_id ?? fallback.id ?? 0) || null,
    accountName: String(item.accountName || item.account_name || fallback.name || "").trim(),
    currency: String(item.currency || fallback.currency || "CNY").trim().toUpperCase() || "CNY",
    totalAssets: normalizeSnapshotNumber(item.totalAssets ?? item.total_assets ?? fallback.totalAssets),
    availableCash: normalizeSnapshotNumber(item.availableCash ?? item.available_cash ?? fallback.availableCash),
    netCashFlow: normalizeSnapshotNumber(item.netCashFlow ?? item.net_cash_flow),
    dailyPnl: normalizeSnapshotNumber(item.dailyPnl ?? item.daily_pnl),
    dailyPnlPercent: normalizeSnapshotNumber(item.dailyPnlPercent ?? item.daily_pnl_percent),
    notes: String(item.notes || "").trim(),
  };
  const impact = normalizeAccountImpactEntry(item.impact);
  if (impact) normalized.impact = impact;
  return normalized;
}

function buildAccountSnapshotFromAccounts(accounts = []) {
  return accounts.filter(isSnapshotEligibleAccount).map((account) => normalizeAccountSnapshotEntry({}, account));
}

function isSnapshotEligibleAccount(account = {}) {
  return account.enabled !== false && account.name !== "未分配账户";
}

function snapshotAccountsFromJson(accountsJson) {
  return parseJsonArray(accountsJson)
    .map((item) => normalizeAccountSnapshotEntry(item))
    .filter((item) => item.accountId || item.accountName);
}

function snapshotRowToApi(row) {
  if (!row) return null;
  return {
    id: row.id == null ? null : Number(row.id),
    archiveDate: row.archive_date,
    accounts: snapshotAccountsFromJson(row.accounts_snapshot),
    snapshotSource: row.snapshot_source || "manual_review",
    notes: row.notes || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function getReviewAccountSnapshot(env, archiveDate) {
  const row = await env.DB.prepare(
    `SELECT * FROM review_account_snapshots WHERE archive_date = ? LIMIT 1`,
  ).bind(archiveDate).first();
  return snapshotRowToApi(row);
}

function buildReviewAccountSnapshotStatement(env, archiveDate, snapshotInput = {}, options = {}) {
  const accounts = options.accounts || [];
  const accountMap = new Map(accounts.map((account) => [Number(account.id), account]));
  const inputAccounts = Array.isArray(snapshotInput.accounts)
    ? snapshotInput.accounts
    : Array.isArray(snapshotInput.accountsSnapshot)
      ? snapshotInput.accountsSnapshot
      : [];
  const snapshotAccounts = inputAccounts.length
    ? inputAccounts.map((item) => normalizeAccountSnapshotEntry(item, accountMap.get(Number(item.accountId ?? item.account_id))))
    : buildAccountSnapshotFromAccounts(accounts);
  const impactByAccountId = new Map((options.accountImpactSummary || []).map((item) => [Number(item.accountId), item]));
  const normalizedAccounts = snapshotAccounts
    .filter((item) => item.accountId || item.accountName)
    .map((item) => {
      const impact = impactByAccountId.get(Number(item.accountId));
      return impact ? { ...item, impact: impactSummaryToSnapshotImpact(impact) } : item;
    });
  const now = isoNow();
  const accountsJson = JSON.stringify(normalizedAccounts);
  // RETURNING 让写入与回读合成一条语句：既省掉一次跨洋往返，id 与 created_at 又仍是库里的真值。
  const statement = env.DB.prepare(
    `INSERT INTO review_account_snapshots (
      archive_date, accounts_snapshot, snapshot_source, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(archive_date) DO UPDATE SET
      accounts_snapshot = excluded.accounts_snapshot,
      snapshot_source = excluded.snapshot_source,
      notes = excluded.notes,
      updated_at = excluded.updated_at
    RETURNING *`,
  ).bind(
    archiveDate,
    accountsJson,
    options.snapshotSource || snapshotInput.snapshotSource || snapshotInput.snapshot_source || "manual_review",
    String(snapshotInput.notes || "").trim(),
    now,
    now,
  );
  return { statement, accountsJson };
}

// D1 的每次 batch 是一次网络往返。官方 Limits 只约束单条语句（绑定参数 100 个、SQL 100KB），
// 未给出单批条数上限，这里取 100 是为了让常见规模的复盘正好落在一批内，同时留出余量。
const D1_MAX_BATCH_STATEMENTS = 100;

async function runWriteBatches(env, statements) {
  const results = [];
  for (let index = 0; index < statements.length; index += D1_MAX_BATCH_STATEMENTS) {
    results.push(...await env.DB.batch(statements.slice(index, index + D1_MAX_BATCH_STATEMENTS)));
  }
  return results;
}

function buildInvestmentAccountSyncStatements(env, snapshotAccounts = []) {
  const now = isoNow();
  const writeStatement = env.DB.prepare(
    `UPDATE investment_accounts
       SET total_assets = COALESCE(?, total_assets),
           available_cash = COALESCE(?, available_cash),
           updated_at = ?
       WHERE id = ?`,
  );
  const statements = [];
  for (const account of snapshotAccounts) {
    if (!account.accountId) continue;
    if (account.totalAssets == null && account.availableCash == null) continue;
    statements.push(writeStatement.bind(account.totalAssets, account.availableCash, now, account.accountId));
  }
  return statements;
}

async function listInvestmentAccounts(env, options = {}) {
  const includeDisabled = options.includeDisabled !== false;
  const result = await env.DB.prepare(
    `SELECT *
     FROM investment_accounts
     ${includeDisabled ? "" : "WHERE enabled = 1"}
     ORDER BY sort_order ASC, id ASC`,
  ).all();
  return (result.results || []).map(accountRowToApi);
}

async function getInvestmentAccounts(env, url) {
  const includeDisabled = url.searchParams.get("active") !== "1";
  const items = await listInvestmentAccounts(env, { includeDisabled });
  return { items, total: items.length };
}

function roundMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function roundPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 10000) / 10000;
}

function computeFundSummaryAmount(plan, account) {
  const manual = plan.positionAmount == null || plan.positionAmount === "" ? null : Number(plan.positionAmount);
  if (Number.isFinite(manual) && manual >= 0) {
    return { amount: roundMoney(manual), source: "exact", estimateLabel: "" };
  }
  const action = normalizeActionPlanAction(plan.actionType);
  const position = normalizeActionPlanPosition(plan.currentPosition || defaultActionPlanPositionForAction(action));
  if (ZERO_POSITION_ACTIONS.has(action) || position === "0%") {
    return { amount: 0, source: "zero", estimateLabel: "" };
  }
  const totalAssets = account?.totalAssets == null ? null : Number(account.totalAssets);
  const midpoint = positionBucketMidpoint(position);
  if (!Number.isFinite(totalAssets) || totalAssets <= 0 || !midpoint) {
    return { amount: null, source: "unavailable", estimateLabel: midpoint?.label || "" };
  }
  return {
    amount: roundMoney(totalAssets * midpoint.weight),
    source: "estimated",
    estimateLabel: midpoint.label,
  };
}

async function getAccountFundSummary(env) {
  const accounts = (await listInvestmentAccounts(env, { includeDisabled: false }))
    .filter((account) => account.name !== "未分配账户");
  const plans = await listAccountLiveActionPlans(env);
  const accountMap = new Map(accounts.map((account) => [Number(account.id), account]));
  const groupMap = new Map();

  for (const account of accounts) {
    const currency = String(account.currency || "CNY").toUpperCase();
    if (!groupMap.has(currency)) {
      groupMap.set(currency, {
        currency,
        totalAssets: 0,
        positionAmount: 0,
        unallocatedAmount: 0,
        accounts: [],
        symbols: [],
        _symbolMap: new Map(),
      });
    }
    const group = groupMap.get(currency);
    const totalAssets = account.totalAssets == null ? null : Number(account.totalAssets);
    const safeTotalAssets = Number.isFinite(totalAssets) && totalAssets > 0 ? totalAssets : null;
    if (safeTotalAssets != null) group.totalAssets += safeTotalAssets;
    group.accounts.push({
      accountId: Number(account.id),
      accountName: account.name,
      broker: account.broker,
      currency,
      totalAssets: safeTotalAssets,
      positionAmount: 0,
      unallocatedAmount: safeTotalAssets,
      allocationPercent: 0,
      sortOrder: account.sortOrder,
    });
  }

  const summaryAccounts = new Map();
  for (const group of groupMap.values()) {
    for (const account of group.accounts) summaryAccounts.set(account.accountId, account);
  }

  for (const plan of plans) {
    const account = accountMap.get(Number(plan.accountId));
    if (!account) continue;
    const currency = String(account.currency || "CNY").toUpperCase();
    const group = groupMap.get(currency);
    if (!group) continue;
    const amountResult = computeFundSummaryAmount(plan, account);
    if (amountResult.amount === 0) continue;
    const accountSummary = summaryAccounts.get(Number(account.id));
    const accountSharePercent = amountResult.amount == null || !account.totalAssets
      ? null
      : roundPercent((amountResult.amount / Number(account.totalAssets)) * 100);

    if (!group._symbolMap.has(plan.symbol)) {
      const symbolRow = {
        symbol: plan.symbol,
        totalAmount: 0,
        accountCells: [],
      };
      group._symbolMap.set(plan.symbol, symbolRow);
      group.symbols.push(symbolRow);
    }
    const symbolRow = group._symbolMap.get(plan.symbol);
    symbolRow.accountCells.push({
      accountId: Number(account.id),
      accountName: account.name,
      amount: amountResult.amount,
      accountSharePercent,
      source: amountResult.source,
      estimateLabel: amountResult.estimateLabel,
      currentPosition: plan.currentPosition,
      actionType: plan.actionType,
    });

    if (amountResult.amount != null) {
      symbolRow.totalAmount = roundMoney(Number(symbolRow.totalAmount || 0) + amountResult.amount);
      group.positionAmount = roundMoney(Number(group.positionAmount || 0) + amountResult.amount);
      if (accountSummary) {
        accountSummary.positionAmount = roundMoney(Number(accountSummary.positionAmount || 0) + amountResult.amount);
      }
    } else if (!symbolRow.accountCells.some((cell) => cell.amount != null)) {
      symbolRow.totalAmount = null;
    }
  }

  const groups = Array.from(groupMap.values()).map((group) => {
    group.accounts = group.accounts.map((account) => {
      const total = Number(account.totalAssets);
      const position = Number(account.positionAmount || 0);
      return {
        ...account,
        positionAmount: roundMoney(position),
        unallocatedAmount: Number.isFinite(total) ? roundMoney(total - position) : null,
        allocationPercent: Number.isFinite(total) && total > 0 ? roundPercent((position / total) * 100) : null,
      };
    });
    group.unallocatedAmount = roundMoney(Number(group.totalAssets || 0) - Number(group.positionAmount || 0));
    group.symbols = group.symbols.map((symbol) => ({
      ...symbol,
      currencyAssetPercent: symbol.totalAmount == null || !Number(group.totalAssets)
        ? null
        : roundPercent((Number(symbol.totalAmount) / Number(group.totalAssets)) * 100),
    }));
    group.symbols.sort((a, b) => {
      const amountA = a.totalAmount == null ? -1 : Number(a.totalAmount);
      const amountB = b.totalAmount == null ? -1 : Number(b.totalAmount);
      return amountB - amountA || String(a.symbol).localeCompare(String(b.symbol));
    });
    const { _symbolMap, ...apiGroup } = group;
    return apiGroup;
  }).sort((a, b) => {
    if (a.currency === "USD" && b.currency !== "USD") return -1;
    if (a.currency !== "USD" && b.currency === "USD") return 1;
    return a.currency.localeCompare(b.currency);
  });

  return { scope: "current", groups, generatedAt: isoNow() };
}

async function getInvestmentAccountById(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM investment_accounts WHERE id = ? LIMIT 1`).bind(id).first();
  if (!row) {
    const error = new Error("Investment account not found");
    error.statusCode = 404;
    throw error;
  }
  return { item: accountRowToApi(row) };
}

function normalizeAccountText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeOptionalNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    const error = new Error("账户资金字段必须是数字");
    error.statusCode = 400;
    throw error;
  }
  return number;
}

function normalizeInvestmentAccountBody(body = {}, existing = {}) {
  const name = normalizeAccountText(body.name ?? existing.name);
  if (!name) {
    const error = new Error("账户名称不能为空");
    error.statusCode = 400;
    throw error;
  }
  const accountType = normalizeAccountText(body.accountType ?? body.account_type ?? existing.account_type ?? "stock") || "stock";
  const currency = normalizeAccountText(body.currency ?? existing.currency ?? "CNY").toUpperCase() || "CNY";
  return {
    name,
    broker: normalizeAccountText(body.broker ?? existing.broker),
    accountType,
    region: normalizeAccountText(body.region ?? existing.region).toUpperCase(),
    currency,
    totalAssets: normalizeOptionalNumber(body.totalAssets ?? body.total_assets ?? existing.total_assets),
    availableCash: normalizeOptionalNumber(body.availableCash ?? body.available_cash ?? existing.available_cash),
    enabled: body.enabled != null ? (body.enabled ? 1 : 0) : Number(existing.enabled ?? 1),
    sortOrder: Number.isFinite(Number(body.sortOrder ?? body.sort_order ?? existing.sort_order))
      ? Number(body.sortOrder ?? body.sort_order ?? existing.sort_order)
      : 0,
    notes: normalizeAccountText(body.notes ?? existing.notes),
  };
}

async function createInvestmentAccount(env, body) {
  const account = normalizeInvestmentAccountBody(body);
  const duplicate = await env.DB.prepare(`SELECT id FROM investment_accounts WHERE name = ? LIMIT 1`).bind(account.name).first();
  if (duplicate) {
    const error = new Error("账户名称已存在");
    error.statusCode = 409;
    throw error;
  }
  const now = isoNow();
  const result = await env.DB.prepare(
    `INSERT INTO investment_accounts (
      name, broker, account_type, region, currency, total_assets, available_cash,
      enabled, sort_order, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    account.name,
    account.broker,
    account.accountType,
    account.region,
    account.currency,
    account.totalAssets,
    account.availableCash,
    account.enabled,
    account.sortOrder,
    account.notes,
    now,
    now,
  ).run();
  return getInvestmentAccountById(env, result.meta.last_row_id);
}

async function updateInvestmentAccount(env, id, body) {
  const existing = await env.DB.prepare(`SELECT * FROM investment_accounts WHERE id = ? LIMIT 1`).bind(id).first();
  if (!existing) {
    const error = new Error("Investment account not found");
    error.statusCode = 404;
    throw error;
  }
  const account = normalizeInvestmentAccountBody(body, existing);
  const duplicate = await env.DB.prepare(`SELECT id FROM investment_accounts WHERE name = ? AND id != ? LIMIT 1`).bind(account.name, id).first();
  if (duplicate) {
    const error = new Error("账户名称已存在");
    error.statusCode = 409;
    throw error;
  }
  await env.DB.prepare(
    `UPDATE investment_accounts SET
      name = ?, broker = ?, account_type = ?, region = ?, currency = ?,
      total_assets = ?, available_cash = ?, enabled = ?, sort_order = ?,
      notes = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(
    account.name,
    account.broker,
    account.accountType,
    account.region,
    account.currency,
    account.totalAssets,
    account.availableCash,
    account.enabled,
    account.sortOrder,
    account.notes,
    isoNow(),
    id,
  ).run();
  return getInvestmentAccountById(env, id);
}

async function deleteInvestmentAccount(env, id) {
  const existing = await env.DB.prepare(`SELECT * FROM investment_accounts WHERE id = ? LIMIT 1`).bind(id).first();
  if (!existing) {
    const error = new Error("Investment account not found");
    error.statusCode = 404;
    throw error;
  }
  if (PROTECTED_INVESTMENT_ACCOUNT_NAMES.has(existing.name)) {
    const error = new Error("默认账户不能删除，可以改为停用或编辑账户信息。");
    error.statusCode = 409;
    throw error;
  }
  const usage = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM daily_review_action_plans WHERE account_id = ?`,
  ).bind(id).first();
  const count = Number(usage?.count || 0);
  if (count > 0) {
    const error = new Error(`该账户已有 ${count} 条操作计划引用，不能直接删除；请先停用或迁移这些计划。`);
    error.statusCode = 409;
    throw error;
  }
  const liveUsage = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM account_live_action_plans WHERE account_id = ?`,
  ).bind(id).first();
  const liveCount = Number(liveUsage?.count || 0);
  if (liveCount > 0) {
    const error = new Error(`该账户已有 ${liveCount} 条活态操作计划引用，不能直接删除；请先在账户管理中删除或迁移这些活态计划。`);
    error.statusCode = 409;
    throw error;
  }
  await env.DB.prepare(`DELETE FROM investment_accounts WHERE id = ?`).bind(id).run();
  return { ok: true, deletedId: id };
}

function getFallbackActionPlanAccountId(accounts, marketType) {
  const fallbackName = MARKET_ACCOUNT_FALLBACKS[marketType] || "未分配账户";
  const fallback = accounts.find((account) => account.name === fallbackName)
    || accounts.find((account) => account.name === "未分配账户");
  if (fallback?.id) return Number(fallback.id);
  const error = new Error("没有可用于操作计划的账户");
  error.statusCode = 400;
  throw error;
}

async function resolveActionPlanAccountsForSave(env, actionPlans, options = {}) {
  const accounts = Object.hasOwn(options, "accounts")
    ? options.accounts
    : await listInvestmentAccounts(env, { includeDisabled: true });
  const accountById = new Map(accounts.map((account) => [Number(account.id), account]));
  const resolved = [];
  for (const plan of actionPlans) {
    let accountId = Number(plan.accountId || 0);
    if (!accountId) accountId = getFallbackActionPlanAccountId(accounts, plan.marketType);
    const account = accountById.get(accountId);
    if (!account) {
      const error = new Error(`操作计划账户不存在：${accountId}`);
      error.statusCode = 400;
      throw error;
    }
    resolved.push({
      ...plan,
      accountId,
      accountName: account.name,
      accountCurrency: account.currency,
      accountSortOrder: account.sortOrder,
      accountEnabled: account.enabled ? 1 : 0,
    });
  }
  return resolved;
}

function normalizeActionPlansForSave(actionPlans) {
  const normalized = [];
  const seen = new Set();
  for (const item of Array.isArray(actionPlans) ? actionPlans : []) {
    const plan = normalizeActionPlanItem(item, normalized.length);
    if (!plan) continue;
    const key = `${plan.accountId || "fallback"}::${plan.marketType || "美股"}::${plan.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ ...plan, sortOrder: normalized.length });
  }
  return normalized;
}

function formatActionPlansMarkdownSummary(actionPlans = []) {
  const groups = new Map();
  for (const plan of actionPlans) {
    const groupName = plan.accountName || "未分配账户";
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push(plan);
  }
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
        const text = String(value || "").trim();
        if (!text) return;
        if (text.includes("\n")) {
          lines.push(`- ${label}：\n${text.split("\n").map((line) => (line ? `  ${line}` : "")).join("\n")}`);
        } else {
          lines.push(`- ${label}：${text}`);
        }
      });
      return lines.join("\n");
    }).join("\n\n");
    return `## ${accountName}\n\n${body}`;
  }).join("\n\n");
}

// 迁移 017 已删除该列；表结构在实例生命周期内不变，探测一次即可，避免每次保存都发 PRAGMA。
let legacyAssetPlanColumnPresent;
async function updateLegacyAssetPlanSummaryIfPresent(env, archiveDate, actionPlans) {
  if (legacyAssetPlanColumnPresent === undefined) {
    const columns = await env.DB.prepare(`PRAGMA table_info(daily_review_archive)`).all();
    legacyAssetPlanColumnPresent = (columns.results || []).some((column) => column.name === "asset_plan");
  }
  if (!legacyAssetPlanColumnPresent) return;
  await env.DB.prepare(
    `UPDATE daily_review_archive SET asset_plan = ?, updated_at = ? WHERE archive_date = ?`,
  ).bind(formatActionPlansMarkdownSummary(actionPlans), isoNow(), archiveDate).run();
}

async function getLatestArchiveDate(env) {
  const row = await env.DB.prepare(
    `SELECT MAX(archive_date) AS latest FROM daily_review_archive`,
  ).first();
  return row?.latest || null;
}

function dbAccountLiveActionPlanToApi(row) {
  return {
    id: Number(row.id),
    accountId: row.account_id == null ? null : Number(row.account_id),
    accountName: row.account_name || "",
    accountCurrency: row.account_currency || "",
    accountSortOrder: Number(row.account_sort_order ?? 999),
    accountEnabled: row.account_enabled == null ? 1 : Number(row.account_enabled),
    symbol: row.symbol,
    actionType: row.action_type || DEFAULT_ACTION_PLAN_ACTION,
    entryPlan: row.entry_plan || "",
    takeProfitPlan: row.take_profit_plan || "",
    stopLossPlan: row.stop_loss_plan || "",
    supportLevels: row.support_levels || "",
    resistanceLevels: row.resistance_levels || "",
    keyLevels: row.key_levels ?? "",
    currentPosition: row.current_position || DEFAULT_ACTION_PLAN_POSITION,
    positionAmount: row.position_amount == null ? null : Number(row.position_amount),
    thinking: row.thinking || "",
    marketType: row.market_type || "美股",
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function readAccountLivePlanState(env, { mutation = false } = {}) {
  const latestSql = '(SELECT MAX(archive_date) FROM daily_review_archive)';
  const statements = [
    env.DB.prepare(`SELECT * FROM daily_review_archive WHERE archive_date = ${latestSql} LIMIT 1`),
    env.DB.prepare(`SELECT * FROM daily_review_symbol_levels WHERE archive_date = ${latestSql} ORDER BY symbol`),
    prepareDailyReviewPlanRead(env),
    env.DB.prepare(
      `SELECT p.*, a.name AS account_name, a.currency AS account_currency,
          a.sort_order AS account_sort_order, a.enabled AS account_enabled
       FROM account_live_action_plans p
       LEFT JOIN investment_accounts a ON a.id = p.account_id
       ORDER BY COALESCE(a.sort_order, 999), COALESCE(a.id, 999999), p.sort_order, p.id`,
    ),
    env.DB.prepare(`SELECT * FROM tracked_symbols ORDER BY symbol_type, market_type, sort_order, id`),
    ...prepareMarketHistoryReads(env, latestSql),
  ];
  if (mutation) statements.push(env.DB.prepare(`SELECT * FROM investment_accounts ORDER BY sort_order, id`));
  const reads = await env.DB.batch(statements);
  const archive = firstBatchRow(reads[0]);
  const levelRows = reads[1]?.results || [];
  const dailyRows = reads[2]?.results || [];
  const liveRows = reads[3]?.results || [];
  const catalog = (reads[4]?.results || []).map(enrichSymbolItem);
  if (!archive) {
    return { archive, levelRows, dailyRows, liveRows, catalog, projection: null, accounts: reads[7]?.results || [],
      ...resolvePlanSymbolLevels(levelRows, liveRows, { conflicts: true }) };
  }
  // 最新日未物化时与 bootstrap 同一投影（含沿用）；首次 live 写入冻结的就是这份内容。
  const projection = projectArchiveMarketReview({
    archiveDate: archive.archive_date, archive, catalog, levelRows, planRows: dailyRows,
    historyRows: reads[5]?.results || [], baselineLevelRows: reads[6]?.results || [], allowInheritance: true,
  });
  return { archive, levelRows, dailyRows, liveRows, catalog, projection, accounts: reads[7]?.results || [],
    symbolLevels: projection.symbolLevels, conflicts: projection.marketReview.conflicts };
}

async function listAccountLiveActionPlans(env) {
  const state = await readAccountLivePlanState(env);
  return projectActionPlanPrices(state.liveRows, state.symbolLevels, dbAccountLiveActionPlanToApi);
}

async function getAccountLiveActionPlanById(env, id) {
  const state = await readAccountLivePlanState(env);
  const row = state.liveRows.find(row => Number(row.id) === id);
  return { item: row ? projectActionPlanPrices([row], state.symbolLevels, dbAccountLiveActionPlanToApi)[0] : null, conflicts: state.conflicts };
}

function validateLivePriceBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw reviewInputError('活态计划请求必须是对象');
  const patch = {};
  for (const [field, alias] of [['supportLevels', 'support_levels'], ['resistanceLevels', 'resistance_levels']]) {
    for (const key of [field, alias]) {
      if (!Object.hasOwn(body, key)) continue;
      if (typeof body[key] !== 'string') throw reviewInputError('价位必须为字符串，清空请使用空字符串');
    }
    if (Object.hasOwn(body, field)) patch[field] = body[field];
    else if (Object.hasOwn(body, alias)) patch[field] = body[alias];
  }
  return patch;
}

function liveBodyValue(body, field, alias, fallback) {
  if (Object.hasOwn(body, field)) return body[field];
  if (alias && Object.hasOwn(body, alias)) return body[alias];
  return fallback;
}

function normalizeLiveMutation(body, existing, state) {
  const rawAccountId = liveBodyValue(body, 'accountId', 'account_id', existing?.account_id);
  const accountId = Number(rawAccountId);
  if (!['number', 'string'].includes(typeof rawAccountId) || !Number.isSafeInteger(accountId) || accountId <= 0) {
    throw reviewInputError('accountId 必填且必须是正整数');
  }
  if (!state.accounts.some(account => Number(account.id) === accountId)) throw reviewInputError(`账户不存在：accountId=${accountId}`);
  const merged = { accountId, symbol: body.symbol ?? existing?.symbol };
  for (const [field, column] of [
    ['actionType', 'action_type'], ['entryPlan', 'entry_plan'], ['takeProfitPlan', 'take_profit_plan'],
    ['stopLossPlan', 'stop_loss_plan'], ['keyLevels', 'key_levels'], ['currentPosition', 'current_position'],
    ['positionAmount', 'position_amount'], ['thinking', 'thinking'], ['marketType', 'market_type'], ['sortOrder', 'sort_order'],
  ]) {
    const value = liveBodyValue(body, field, column, existing?.[column]);
    merged[field] = field === 'positionAmount' ? value : value ?? existing?.[column];
  }
  const normalized = normalizeActionPlanItem(merged, Number(existing?.sort_order || 0));
  if (!normalized) throw reviewInputError('symbol 不能为空');
  if (state.liveRows.some(row => Number(row.id) !== Number(existing?.id) && Number(row.account_id) === accountId && row.symbol === normalized.symbol)) {
    throw reviewInputError(`该账户已存在 ${normalized.symbol} 的活态计划`, 409);
  }
  // Historical identities may remain editable, but cannot be created or moved
  // to another account using an unavailable catalog symbol.
  const sameIdentity = existing && Number(existing.account_id) === accountId && existing.symbol === normalized.symbol;
  if (!sameIdentity && !state.catalog.some(item => item.symbol === normalized.symbol && Number(item.is_active) === 1)) {
    throw reviewInputError(`操作计划标的不可用：${normalized.symbol}`);
  }
  // Omitted fields must not normalize stored text, especially legacy key_levels.
  if (existing) for (const [field, column] of [
    ['entryPlan', 'entry_plan'], ['takeProfitPlan', 'take_profit_plan'], ['stopLossPlan', 'stop_loss_plan'],
    ['keyLevels', 'key_levels'], ['thinking', 'thinking'],
  ]) {
    if (!Object.hasOwn(body, field) && !Object.hasOwn(body, column)) normalized[field] = existing[column] ?? '';
  }
  return normalized;
}

function buildLivePriceMirrorStatement(env, levels, now, { archiveDate = null } = {}) {
  if (archiveDate) {
    // Date prices have already been patched in this batch. Never mirror a
    // read-before-write snapshot, including the field omitted by this request.
    const scope = levels == null ? '' : `AND symbol IN (SELECT json_extract(value, '$.symbol') FROM json_each(?))`;
    return env.DB.prepare(
      `UPDATE account_live_action_plans SET
         support_levels = (SELECT support_levels FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = account_live_action_plans.symbol),
         resistance_levels = (SELECT resistance_levels FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = account_live_action_plans.symbol),
         updated_at = ?
       WHERE EXISTS (SELECT 1 FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = account_live_action_plans.symbol) ${scope}`,
    ).bind(archiveDate, archiveDate, now, archiveDate, ...(levels == null ? [] : [JSON.stringify(levels)]));
  }
  const data = JSON.stringify(levels);
  return env.DB.prepare(
    `UPDATE account_live_action_plans SET
       support_levels = COALESCE((SELECT json_extract(value, '$.supportLevels') FROM json_each(?) WHERE json_extract(value, '$.symbol') = account_live_action_plans.symbol AND json_type(value, '$.supportLevels') = 'text'), support_levels),
       resistance_levels = COALESCE((SELECT json_extract(value, '$.resistanceLevels') FROM json_each(?) WHERE json_extract(value, '$.symbol') = account_live_action_plans.symbol AND json_type(value, '$.resistanceLevels') = 'text'), resistance_levels),
       updated_at = ?
     WHERE symbol IN (SELECT json_extract(value, '$.symbol') FROM json_each(?))`,
  ).bind(data, data, now, data);
}

function liveMutationPriceValue(field, column, normalized, pricePatch, state, existing) {
  if (Object.hasOwn(pricePatch, field)) return { sql: '?', values: [pricePatch[field]] };
  if (state.archive) return {
    sql: `COALESCE((SELECT ${column} FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = ?), ?)`,
    values: [state.archive.archive_date, normalized.symbol, normalized[field]],
  };
  // New/rekeyed identities load the current shared value, excluding the old
  // identity. The first nonempty field is selected independently per price.
  return {
    sql: `COALESCE((SELECT p.${column} FROM account_live_action_plans p
      LEFT JOIN investment_accounts a ON a.id = p.account_id
      WHERE p.symbol = ? AND p.id <> ? AND typeof(p.${column}) = 'text' AND trim(p.${column}) <> ''
      ORDER BY COALESCE(a.sort_order, 999), COALESCE(a.id, 999999), p.sort_order, p.id LIMIT 1), '')`,
    values: [normalized.symbol, existing?.id ?? -1],
  };
}

async function mutateAccountLiveActionPlan(env, method, id, body) {
  const pricePatch = method === 'DELETE' ? {} : validateLivePriceBody(body);
  const state = await readAccountLivePlanState(env, { mutation: true });
  const existing = method === 'POST' ? null : state.liveRows.find(row => Number(row.id) === id);
  if (method !== 'POST' && !existing) throw reviewInputError('活态操作计划不存在', 404);
  const normalized = method === 'DELETE' ? null : normalizeLiveMutation(body, existing, state);
  const patches = Object.keys(pricePatch).length ? [{ symbol: normalized.symbol, ...pricePatch }] : [];
  // 最新日未物化时，写前有效展示结构（含沿用、sourceDates 与冲突证据）先冻结，再叠本次补丁。
  const materializing = Boolean(state.archive) && !state.projection.materialized;
  const document = state.archive ? state.projection.document : createMarketReview();
  // Editing a historical live identity is allowed; creating a new market
  // identity still requires an active catalog entry (existing blocks may stay).
  const canSupplement = patches.every(patch => document.blocks.some(block => block.type === 'symbol' && block.symbol === patch.symbol)
    || state.catalog.some(item => item.symbol === patch.symbol && Number(item.is_active) === 1));
  const patched = patchMarketReviewLevels(document, state.symbolLevels, patches, {
    catalog: state.catalog, supplement: Boolean(state.archive) && canSupplement,
  });
  const symbolLevels = patched.symbolLevels;
  const now = isoNow();
  // Materialize/patch date authority before writing any live price values.
  const persisted = new Set(state.levelRows.map(row => row.symbol));
  const levelSymbols = !state.archive ? [] : materializing
    ? Object.keys(symbolLevels).filter(symbol => !persisted.has(symbol) || patches.some(patch => patch.symbol === symbol))
    : normalized && (patches.length || !persisted.has(normalized.symbol)) ? [normalized.symbol] : [];
  if (state.archive && normalized && !levelSymbols.includes(normalized.symbol) && !persisted.has(normalized.symbol)) levelSymbols.push(normalized.symbol);
  const changedLevels = levelSymbols.map(symbol => ({ symbol, supportLevels: '', resistanceLevels: '', ...symbolLevels[symbol] }));
  const statements = state.archive
    ? buildReviewSymbolLevelStatements(env, state.archive.archive_date, changedLevels, { patches }) : [];
  const mutationIndex = statements.length;
  if (method === 'DELETE') {
    statements.push(env.DB.prepare(`DELETE FROM account_live_action_plans WHERE id = ? RETURNING *`).bind(id));
  } else {
    Object.assign(normalized, Object.hasOwn(symbolLevels, normalized.symbol) ? symbolLevels[normalized.symbol] : { supportLevels: '', resistanceLevels: '' });
    if (method === 'POST') {
      const support = liveMutationPriceValue('supportLevels', 'support_levels', normalized, pricePatch, state, existing);
      const resistance = liveMutationPriceValue('resistanceLevels', 'resistance_levels', normalized, pricePatch, state, existing);
      const values = [normalized.accountId, normalized.symbol, normalized.actionType, normalized.entryPlan,
        normalized.takeProfitPlan, normalized.stopLossPlan, normalized.keyLevels, ...support.values,
        ...resistance.values, normalized.currentPosition, normalized.positionAmount, normalized.thinking,
        normalized.sortOrder, normalized.marketType];
      statements.push(env.DB.prepare(
        `INSERT INTO account_live_action_plans (
           account_id, symbol, action_type, entry_plan, take_profit_plan, stop_loss_plan,
           key_levels, support_levels, resistance_levels, current_position, position_amount,
           thinking, sort_order, market_type, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ${support.sql}, ${resistance.sql}, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      ).bind(...values, now, now));
    } else {
      // Only explicit client fields may replace non-price values read before
      // another request committed. SQL identifiers come from this fixed map.
      const fields = [
        ['accountId', 'account_id'], ['symbol', 'symbol'], ['actionType', 'action_type'],
        ['entryPlan', 'entry_plan'], ['takeProfitPlan', 'take_profit_plan'], ['stopLossPlan', 'stop_loss_plan'],
        ['keyLevels', 'key_levels'], ['currentPosition', 'current_position'], ['positionAmount', 'position_amount'],
        ['thinking', 'thinking'], ['sortOrder', 'sort_order'], ['marketType', 'market_type'],
      ].filter(([field, column]) => Object.hasOwn(body, field) || Object.hasOwn(body, column));
      const priceFields = [['supportLevels', 'support_levels'], ['resistanceLevels', 'resistance_levels']]
        .filter(([field]) => Object.hasOwn(pricePatch, field) || existing.symbol !== normalized.symbol)
        .map(([field, column]) => ({ column, ...liveMutationPriceValue(field, column, normalized, pricePatch, state, existing) }));
      const assignments = [...fields.map(([, column]) => `${column} = ?`),
        ...priceFields.map(({ column, sql }) => `${column} = ${sql}`), 'updated_at = ?'];
      statements.push(env.DB.prepare(
        `UPDATE account_live_action_plans SET ${assignments.join(', ')} WHERE id = ? RETURNING *`,
      ).bind(...fields.map(([field]) => normalized[field]), ...priceFields.flatMap(price => price.values), now, id));
    }
    if (!state.archive && patches.length) statements.push(buildLivePriceMirrorStatement(env, patches, now));
  }
  if (state.archive) {
    if (normalized) statements.push(buildLivePriceMirrorStatement(env, [{ symbol: normalized.symbol }], now, { archiveDate: state.archive.archive_date }));
    if (materializing) {
      // 并发首次写入已落文档时保留对方结果，不用本次读前快照覆盖。
      statements.push(env.DB.prepare(
        `UPDATE daily_review_archive SET market_review_json = COALESCE(market_review_json, ?), updated_at = ?
         WHERE archive_date = ? RETURNING market_review_json`,
      ).bind(serializeMarketReview(patched.marketReview), now, state.archive.archive_date));
    } else if (serializeMarketReview(patched.marketReview) !== serializeMarketReview(document)) {
      statements.push(env.DB.prepare(
        `UPDATE daily_review_archive SET
           market_review_json = CASE WHEN market_review_json = ? THEN ? ELSE market_review_json END,
           updated_at = ? WHERE archive_date = ? RETURNING market_review_json`,
      ).bind(state.archive.market_review_json, serializeMarketReview(patched.marketReview), now, state.archive.archive_date));
    }
    // Read membership and non-price fields from the current live table inside
    // the write batch, never from the pre-mutation snapshot.
    statements.push(...buildReviewActionPlanStatements(env, state.archive.archive_date, null, { fromLive: true }).statements);
  }
  if (normalized) statements.push(env.DB.prepare(
    `SELECT p.*, a.name AS account_name, a.currency AS account_currency,
        a.sort_order AS account_sort_order, a.enabled AS account_enabled
     FROM account_live_action_plans p LEFT JOIN investment_accounts a ON a.id = p.account_id
     WHERE p.symbol = ?
     ORDER BY COALESCE(a.sort_order, 999), COALESCE(a.id, 999999), p.sort_order, p.id`,
  ).bind(normalized.symbol));
  // One write batch owns mutation, prices, every same-symbol live mirror and the
  // latest daily membership, including the final response read.
  const written = await env.DB.batch(statements);
  if (method === 'DELETE') return { ok: true, deletedId: id };
  const finalRows = written[written.length - 1]?.results || [];
  const currentId = Number(firstBatchRow(written[mutationIndex]).id);
  const row = finalRows.find(row => Number(row.id) === currentId);
  const finalLevels = resolvePlanSymbolLevels([], finalRows).symbolLevels;
  return { item: projectActionPlanPrices([row], finalLevels, dbAccountLiveActionPlanToApi)[0] };
}

async function createAccountLiveActionPlan(env, body) {
  return mutateAccountLiveActionPlan(env, 'POST', null, body);
}

async function updateAccountLiveActionPlan(env, id, body) {
  return mutateAccountLiveActionPlan(env, 'PUT', id, body);
}

async function deleteAccountLiveActionPlan(env, id) {
  return mutateAccountLiveActionPlan(env, 'DELETE', id);
}

function buildAccountLiveActionPlanStatements(env, actionPlans, { archiveDate = null } = {}) {
  const normalizedInput = (Array.isArray(actionPlans) ? actionPlans : [])
    .map((plan, idx) => {
      const normalized = normalizeActionPlanItem(plan, idx);
      if (!normalized) return null;
      if (typeof plan.supportLevels === 'string') normalized.supportLevels = plan.supportLevels;
      if (typeof plan.resistanceLevels === 'string') normalized.resistanceLevels = plan.resistanceLevels;
      return normalized;
    })
    .filter(Boolean)
    .filter((plan) => Number.isFinite(Number(plan.accountId)) && Number(plan.accountId) > 0);
  const seen = new Set();
  const normalized = [];
  for (const plan of normalizedInput) {
    const key = `${plan.accountId}::${plan.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ ...plan, sortOrder: normalized.length });
  }
  const now = isoNow();
  const data = JSON.stringify(normalized);
  const priceValue = (field, column) => archiveDate
    ? `COALESCE((SELECT ${column} FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = json_extract(value, '$.symbol')), json_extract(value, '$.${field}'))`
    : `json_extract(value, '$.${field}')`;
  const statements = [
    env.DB.prepare(
      `INSERT INTO account_live_action_plans (
          account_id, symbol, action_type, entry_plan, take_profit_plan,
          stop_loss_plan, key_levels, support_levels, resistance_levels,
          current_position, position_amount, thinking, sort_order, market_type, created_at, updated_at
        )
        SELECT json_extract(value, '$.accountId'), json_extract(value, '$.symbol'),
          json_extract(value, '$.actionType'), json_extract(value, '$.entryPlan'),
          json_extract(value, '$.takeProfitPlan'), json_extract(value, '$.stopLossPlan'),
          json_extract(value, '$.keyLevels'), ${priceValue('supportLevels', 'support_levels')},
          ${priceValue('resistanceLevels', 'resistance_levels')}, json_extract(value, '$.currentPosition'),
          json_extract(value, '$.positionAmount'), json_extract(value, '$.thinking'),
          json_extract(value, '$.sortOrder'), json_extract(value, '$.marketType'), ?, ?
        FROM json_each(?) WHERE 1
        ON CONFLICT(account_id, symbol) DO UPDATE SET
          action_type = excluded.action_type,
          entry_plan = excluded.entry_plan,
          take_profit_plan = excluded.take_profit_plan,
          stop_loss_plan = excluded.stop_loss_plan,
          support_levels = excluded.support_levels,
          resistance_levels = excluded.resistance_levels,
          current_position = excluded.current_position,
          position_amount = excluded.position_amount,
          thinking = excluded.thinking,
          market_type = excluded.market_type,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at`,
    ).bind(...(archiveDate ? [archiveDate, archiveDate] : []), now, now, data),
    env.DB.prepare(
      `DELETE FROM account_live_action_plans
       WHERE NOT EXISTS (
         SELECT 1 FROM json_each(?) member
         WHERE json_extract(member.value, '$.accountId') = account_live_action_plans.account_id
           AND json_extract(member.value, '$.symbol') = account_live_action_plans.symbol
       )`,
    ).bind(data),
  ];
  return { statements, normalized };
}

async function replaceAccountLiveActionPlans(env, actionPlans) {
  const { statements, normalized } = buildAccountLiveActionPlanStatements(env, actionPlans);
  await runWriteBatches(env, statements);
  return normalized;
}

async function getAccountLiveActionPlansResponse(env) {
  const state = await readAccountLivePlanState(env);
  const items = projectActionPlanPrices(state.liveRows, state.symbolLevels, dbAccountLiveActionPlanToApi);
  return { items, total: items.length, conflicts: state.conflicts };
}

async function getAccountLiveActionPlanSymbolCatalog(env) {
  const latest = await getLatestArchiveDate(env);
  return getActionPlanSymbolCatalog(env, latest || new Date().toISOString().slice(0, 10));
}

function buildReviewActionPlanStatements(env, archiveDate, actionPlans, { preserveValues = false, fromLive = false } = {}) {
  const normalized = fromLive ? [] : preserveValues ? actionPlans.map(plan => ({ ...plan })) : normalizeActionPlansForSave(actionPlans);
  const now = isoNow();
  const data = JSON.stringify(normalized);
  const source = fromLive
    ? `SELECT ?, p.account_id, p.symbol, p.action_type, p.entry_plan, p.take_profit_plan,
          p.stop_loss_plan, p.key_levels, NULL, NULL, p.current_position, p.position_amount,
          p.thinking, p.market_type,
          ROW_NUMBER() OVER (ORDER BY COALESCE(a.sort_order, 999), COALESCE(a.id, 999999), p.sort_order, p.id) - 1,
          ?, ?
       FROM account_live_action_plans p
       LEFT JOIN investment_accounts a ON a.id = p.account_id WHERE 1`
    : `SELECT ?, json_extract(value, '$.accountId'), json_extract(value, '$.symbol'),
          json_extract(value, '$.actionType'), json_extract(value, '$.entryPlan'),
          json_extract(value, '$.takeProfitPlan'), json_extract(value, '$.stopLossPlan'),
          json_extract(value, '$.keyLevels'), NULL,
          NULL, json_extract(value, '$.currentPosition'),
          json_extract(value, '$.positionAmount'), json_extract(value, '$.thinking'),
          json_extract(value, '$.marketType'), json_extract(value, '$.sortOrder'), ?, ?
       FROM json_each(?) WHERE 1`;
  const members = fromLive
    ? `SELECT 1 FROM account_live_action_plans member
       WHERE member.account_id = daily_review_action_plans.account_id
         AND member.symbol = daily_review_action_plans.symbol`
    : `SELECT 1 FROM json_each(?) member
       WHERE json_extract(member.value, '$.accountId') = daily_review_action_plans.account_id
         AND json_extract(member.value, '$.symbol') = daily_review_action_plans.symbol`;
  const statements = [
    env.DB.prepare(
      `INSERT INTO daily_review_action_plans (
          archive_date, account_id, symbol, action_type, entry_plan, take_profit_plan,
          stop_loss_plan, key_levels, support_levels, resistance_levels,
          current_position, position_amount, thinking, market_type, sort_order, created_at, updated_at
        )
        ${source}
        ON CONFLICT(archive_date, account_id, symbol) DO UPDATE SET
          action_type = excluded.action_type,
          entry_plan = excluded.entry_plan,
          take_profit_plan = excluded.take_profit_plan,
          stop_loss_plan = excluded.stop_loss_plan,
          current_position = excluded.current_position,
          position_amount = excluded.position_amount,
          thinking = excluded.thinking,
          market_type = excluded.market_type,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at`,
    ).bind(...(fromLive ? [archiveDate, now, now] : [archiveDate, now, now, data])),
    env.DB.prepare(
      `DELETE FROM daily_review_action_plans
       WHERE archive_date = ? AND NOT EXISTS (${members})`,
    ).bind(...(fromLive ? [archiveDate] : [archiveDate, data])),
  ];
  return { statements, normalized };
}

async function replaceReviewActionPlans(env, archiveDate, actionPlans) {
  const { statements, normalized } = buildReviewActionPlanStatements(env, archiveDate, actionPlans);
  await runWriteBatches(env, statements);
  await updateLegacyAssetPlanSummaryIfPresent(env, archiveDate, normalized);
  return normalized;
}

function buildReviewSymbolLevelStatements(env, archiveDate, levels, { patches } = {}) {
  if (!levels.length) return [];
  const now = isoNow();
  // The base collection API still replaces both fields. Request callers pass
  // actual own-field patches; initial-only materialization never overwrites a
  // row another request inserted after the initial read.
  const assignment = (field, column) => patches === undefined ? `excluded.${column}` :
    `CASE WHEN EXISTS (SELECT 1 FROM json_each(?) patch
       WHERE json_extract(patch.value, '$.symbol') = excluded.symbol
         AND json_type(patch.value, '$.${field}') = 'text')
     THEN excluded.${column} ELSE daily_review_symbol_levels.${column} END`;
  return [env.DB.prepare(
    `INSERT INTO daily_review_symbol_levels (
        archive_date, symbol, support_levels, resistance_levels, created_at, updated_at
      )
      SELECT ?, json_extract(value, '$.symbol'), COALESCE(json_extract(value, '$.supportLevels'), ''),
        COALESCE(json_extract(value, '$.resistanceLevels'), ''), ?, ?
      FROM json_each(?) WHERE 1
      ON CONFLICT(archive_date, symbol) DO UPDATE SET
        support_levels = ${assignment('supportLevels', 'support_levels')},
        resistance_levels = ${assignment('resistanceLevels', 'resistance_levels')},
        updated_at = excluded.updated_at`,
  ).bind(archiveDate, now, now, JSON.stringify(levels), ...(patches === undefined ? [] : [JSON.stringify(patches), JSON.stringify(patches)]))];
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
    }[normalizeCanonicalNewsType(item?.type)] || "[大盘]";
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

// Request-local diagnostic state; never stores review content or account values.
async function withReviewTimings(env, operation) {
  const timing = { runId: crypto.randomUUID(), stages: [], current: null };
  const timedEnv = { ...env, reviewTiming: timing };
  let success = false;
  try {
    const result = await operation(timedEnv);
    success = true;
    return result;
  } finally {
    beginReviewStage(timedEnv, null);
    if (env.APP_ENV === "prod") {
      try { console.info(JSON.stringify({ event: "review_timing", runId: timing.runId, success, stages: timing.stages })); }
      catch { /* Diagnostics must not change a business result. */ }
    }
  }
}

function beginReviewStage(env, stage, itemCount = null) {
  const timing = env.reviewTiming;
  if (!timing) return;
  const now = performance.now();
  if (timing.current) timing.stages.push({
    stage: timing.current.stage,
    durationMs: Math.round((now - timing.current.start) * 100) / 100,
    ...(timing.current.itemCount == null ? {} : { itemCount: timing.current.itemCount }),
  });
  timing.current = stage ? { stage, start: now, itemCount } : null;
}

function reviewInputError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateReviewLevelPatches(patches, catalog, existingBlocks, symbolLevels) {
  const available = new Set(catalog.filter(item => Number(item.is_active) === 1).map(item => item.symbol));
  const historical = new Set(existingBlocks.filter(block => block.type === 'symbol').map(block => block.symbol));
  const seen = new Set();
  return patches.map(patch => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || typeof patch.symbol !== 'string' || !patch.symbol.trim()) {
      throw reviewInputError('价位补丁必须包含有效的 symbol');
    }
    const symbol = patch.symbol;
    if (!available.has(symbol) && !historical.has(symbol) && !Object.hasOwn(symbolLevels, symbol)) {
      throw reviewInputError(`价位标的不可用：${symbol}`);
    }
    if (seen.has(symbol)) throw reviewInputError(`重复的价位补丁：${symbol}`);
    seen.add(symbol);
    const fields = ['supportLevels', 'resistanceLevels'].filter(field => Object.hasOwn(patch, field));
    if (!fields.length || fields.some(field => typeof patch[field] !== 'string')) {
      throw reviewInputError('价位补丁至少包含一个字符串字段，null 不是清空');
    }
    return { symbol, ...Object.fromEntries(fields.map(field => [field, patch[field]])) };
  });
}

async function saveReviewDraft(env, archiveDate, body) {
  beginReviewStage(env, "save.validate");
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw reviewInputError('复盘请求必须是对象');
  const oldFields = ['marketSentimentBlocks', 'sectorRotationBlocks', 'market_sentiment_blocks', 'sector_rotation_blocks'];
  if (oldFields.some(field => Object.hasOwn(body, field))) {
    throw reviewInputError('旧复盘字段已停用，请刷新页面后重试');
  }
  const hasMarketReview = Object.hasOwn(body, 'marketReview');
  if (hasMarketReview && (!body.marketReview || typeof body.marketReview !== 'object' || Array.isArray(body.marketReview) ||
      !Array.isArray(body.marketReview.blocks) || !Array.isArray(body.marketReview.levels))) {
    throw reviewInputError('marketReview 必须同时包含 blocks 和 levels 数组');
  }
  if (Object.hasOwn(body, 'actionPlans') && !Array.isArray(body.actionPlans)) throw reviewInputError('actionPlans 必须为数组');
  const hasStructuredActionPlans = Array.isArray(body.actionPlans);
  if (hasStructuredActionPlans && body.actionPlans.some(plan => !plan || typeof plan !== 'object' || Array.isArray(plan))) {
    throw reviewInputError('actionPlans 中每条计划必须为对象');
  }
  const normalizedActionPlans = hasStructuredActionPlans ? normalizeActionPlansForSave(body.actionPlans) : [];
  const readResults = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM daily_review_archive WHERE archive_date = ? LIMIT 1`).bind(archiveDate),
    env.DB.prepare(`SELECT MAX(archive_date) AS latest FROM daily_review_archive`),
    env.DB.prepare(`SELECT * FROM tracked_symbols ORDER BY symbol_type, market_type, sort_order, id`),
    env.DB.prepare(`SELECT * FROM daily_review_symbol_levels WHERE archive_date = ? ORDER BY symbol`).bind(archiveDate),
    env.DB.prepare(
      `SELECT p.* FROM daily_review_action_plans p
       LEFT JOIN investment_accounts a ON a.id = p.account_id
       WHERE p.archive_date = ?
       ORDER BY COALESCE(a.sort_order, 999), COALESCE(a.id, 999999), p.sort_order, p.id`,
    ).bind(archiveDate),
    ...prepareMarketHistoryReads(env, '?', [archiveDate]),
  ]);
  const existing = firstBatchRow(readResults[0]);
  const latestBeforeSave = firstBatchRow(readResults[1])?.latest || null;
  const catalog = (readResults[2]?.results || []).map(enrichSymbolItem);
  const persistedLevels = symbolLevelMapFromRows(readResults[3]?.results || []);
  const existingPlans = readResults[4]?.results || [];
  // 未物化日期以写前的有效展示结构（与 bootstrap 相同，含沿用）为可信基础，并在本次写入冻结。
  const projection = projectArchiveMarketReview({
    archiveDate, archive: existing, catalog, levelRows: readResults[3]?.results || [], planRows: existingPlans,
    historyRows: readResults[5]?.results || [], baselineLevelRows: readResults[6]?.results || [], allowInheritance: true,
  });
  const materializing = !projection.materialized;
  const existingDocument = projection.document;
  const document = hasMarketReview ? createMarketReview({
    ...existingDocument,
    blocks: validateMarketReviewBlocks(body.marketReview.blocks, { catalog, existingBlocks: existingDocument.blocks }),
  }) : existingDocument;
  const patches = hasMarketReview ? validateReviewLevelPatches(body.marketReview.levels, catalog, existingDocument.blocks, projection.symbolLevels) : [];
  const initialSymbolLevels = Object.assign(Object.create(null), structuredClone(projection.symbolLevels));
  const initialSymbols = materializing
    ? [...Object.keys(projection.symbolLevels), ...document.blocks.filter(block => block.type === 'symbol').map(block => block.symbol), ...normalizedActionPlans.map(plan => plan.symbol)]
    : [];
  for (const symbol of new Set([...initialSymbols, ...patches.map(patch => patch.symbol)])) {
    if (!Object.hasOwn(initialSymbolLevels, symbol)) initialSymbolLevels[symbol] = { supportLevels: '', resistanceLevels: '' };
  }
  // Submitted blocks are final: shared patching must never supplement here.
  const { symbolLevels } = patchMarketReviewLevels(document, initialSymbolLevels, patches, { catalog });
  if (hasStructuredActionPlans) {
    for (const plan of body.actionPlans) {
      for (const [field, alias] of [['supportLevels', 'support_levels'], ['resistanceLevels', 'resistance_levels']]) {
        for (const key of [field, alias]) {
          if (Object.hasOwn(plan, key) && plan[key] !== (symbolLevels[plan.symbol]?.[field] ?? '')) {
            throw reviewInputError('操作计划价位必须使用 marketReview.levels 提交', 409);
          }
        }
      }
    }
  }
  const patchSymbols = new Set(patches.map(patch => patch.symbol));
  const changedLevels = Object.entries(symbolLevels)
    .filter(([symbol]) => (materializing && !Object.hasOwn(persistedLevels, symbol)) || patchSymbols.has(symbol))
    .map(([symbol, levels]) => ({ symbol, ...levels }));
  const reviewStatus = body.reviewStatus || existing?.review_status || 'initialized';
  // 1 替换为提交结构；2 仅在仍未物化时冻结写前投影；0 保留现有文档。
  const documentMode = hasMarketReview ? 1 : materializing ? 2 : 0;
  const storedJson = documentMode ? serializeMarketReview(document) : existing?.market_review_json ?? null;
  const isLatest = !latestBeforeSave || archiveDate >= latestBeforeSave;
  beginReviewStage(env, 'save.write', normalizedActionPlans.length);
  const statements = [env.DB.prepare(
    `INSERT INTO daily_review_archive (
       archive_date, review_status, reviewer_news_notes, market_review_json, trading_summary, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(archive_date) DO UPDATE SET
       review_status = excluded.review_status,
       reviewer_news_notes = excluded.reviewer_news_notes,
       market_review_json = CASE ? WHEN 1 THEN excluded.market_review_json
         WHEN 2 THEN COALESCE(daily_review_archive.market_review_json, excluded.market_review_json)
         ELSE daily_review_archive.market_review_json END,
       trading_summary = excluded.trading_summary,
       updated_at = excluded.updated_at
     RETURNING market_review_json, reviewer_news_notes, trading_summary`,
  ).bind(archiveDate, reviewStatus, body.reviewerNewsNotes ?? body.newsBrief ?? existing?.reviewer_news_notes ?? '',
    storedJson, body.tradingSummary ?? existing?.trading_summary ?? '', isoNow(), documentMode),
    ...buildReviewSymbolLevelStatements(env, archiveDate, changedLevels, { patches })];
  if (hasStructuredActionPlans) {
    const daily = buildReviewActionPlanStatements(env, archiveDate, normalizedActionPlans);
    statements.push(...daily.statements);
    if (isLatest) {
      // Membership/non-price values are replaced by the collection request;
      // shared price values come from date authority inside the same SQL.
      statements.push(...buildAccountLiveActionPlanStatements(env, daily.normalized, { archiveDate }).statements);
    }
  }
  if (isLatest && (hasStructuredActionPlans || changedLevels.length)) {
    statements.push(buildLivePriceMirrorStatement(env, null, isoNow(), { archiveDate }));
  }
  // A single bulk read at the tail of the write batch returns current authority
  // values, not the snapshot used to validate/initialize the request.
  statements.push(env.DB.prepare(
    `SELECT * FROM daily_review_symbol_levels WHERE archive_date = ? ORDER BY symbol`,
  ).bind(archiveDate));
  const written = await env.DB.batch(statements);
  const saved = firstBatchRow(written[0]);
  const savedJson = saved.market_review_json;
  const savedDocument = savedJson == null ? createMarketReview() : JSON.parse(savedJson);
  const finalSymbolLevels = symbolLevelMapFromRows(written[written.length - 1]?.results || []);
  return {
    ok: true, archiveDate, reviewStatus,
    reviewerNewsNotes: saved.reviewer_news_notes,
    tradingSummary: saved.trading_summary,
    actionPlanCount: hasStructuredActionPlans ? normalizedActionPlans.length : existingPlans.length,
    marketReview: { ...assembleMarketReview(savedDocument, finalSymbolLevels), source: savedJson == null ? 'empty' : 'saved' },
    symbolLevels: finalSymbolLevels,
    syncedToLive: isLatest && (hasStructuredActionPlans || changedLevels.length > 0),
  };
}

async function completeReview(env, archiveDate, body = {}) {
  beginReviewStage(env, "complete.guard");
  if (body.completionSource === "batch") {
    const latestArchiveDate = await getLatestArchiveDate(env);
    const latestClosedDate = await getLatestClosedNyseTradingDay(env);
    if (archiveDate === latestArchiveDate || !latestClosedDate || archiveDate > latestClosedDate) {
      return { ok: true, skipped: true, reason: "reserved review date", archiveDate };
    }
    body = { ...body, onlyIfPending: true };
  }
  beginReviewStage(env, "complete.read");
  // 这六条读语句互不依赖，合成一批只走一次跨洋往返。即使随后命中早返回分支，
  // 代价仍是一次往返，与逐条读时相同。
  const reads = await env.DB.batch([
    env.DB.prepare(
      `SELECT archive_date, review_status, reviewer_news_notes, trading_summary,
         market_review_json, market_sentiment_blocks_json, sector_rotation_blocks_json,
         (SELECT COUNT(*) FROM daily_review_action_plans plans
          WHERE plans.archive_date = daily_review_archive.archive_date) AS action_plan_count
       FROM daily_review_archive
       WHERE archive_date = ?
       LIMIT 1`,
    ).bind(archiveDate),
    env.DB.prepare(
      `SELECT DISTINCT k_date FROM stock_raw WHERE k_date <= ? ORDER BY k_date DESC LIMIT 2`,
    ).bind(archiveDate),
    env.DB.prepare(
      `SELECT source_news_ids FROM daily_news_ai_analysis WHERE analysis_date = ? LIMIT 1`,
    ).bind(archiveDate),
    env.DB.prepare(
      `SELECT p.*, a.name AS account_name, a.currency AS account_currency,
          a.sort_order AS account_sort_order, a.enabled AS account_enabled
       FROM daily_review_action_plans p
       LEFT JOIN investment_accounts a ON a.id = p.account_id
       WHERE p.archive_date = ?
       ORDER BY COALESCE(a.sort_order, 999), COALESCE(a.id, 999999), p.sort_order, p.id`,
    ).bind(archiveDate),
    env.DB.prepare(`SELECT * FROM investment_accounts ORDER BY sort_order ASC, id ASC`),
    env.DB.prepare(
      `SELECT account_id, symbol
       FROM daily_review_action_plans
       WHERE archive_date = (
         SELECT MAX(archive_date)
         FROM daily_review_action_plans
         WHERE archive_date < ?
       )`,
    ).bind(archiveDate),
    env.DB.prepare(`SELECT * FROM daily_review_symbol_levels WHERE archive_date = ? ORDER BY symbol`).bind(archiveDate),
  ]);
  const existing = (reads[0].results || [])[0] || null;
  const newsWindow = buildNewsWindowFromRows(reads[1].results || [], archiveDate);
  const analysis = (reads[2].results || [])[0] || null;
  const rawActionPlans = reads[3].results || [];
  const { symbolLevels } = resolvePlanSymbolLevels(reads[6]?.results || [], rawActionPlans);
  const actionPlans = projectActionPlanPrices(rawActionPlans, symbolLevels);
  const investmentAccounts = (reads[4].results || []).map(accountRowToApi);
  const previousSymbolsByAccount = previousActionPlanSymbolKeysFromRows(reads[5].results || []);

  if (body.onlyIfPending && !existing) {
    return { ok: true, skipped: true, reason: "review not found", archiveDate };
  }
  if (body.onlyIfPending && normalizeReviewStatus(existing?.review_status) === "reviewed") {
    return { ok: true, skipped: true, reason: "already reviewed", archiveDate, reviewStatus: "reviewed" };
  }
  let readinessRecord = existing;
  if (body.completionSource === "batch" && body.autoFill && existing) {
    beginReviewStage(env, "complete.autofill");
    // Saved documents (including blocks: []) and every persisted price row
    // win over defaults. Omit an unchanged document to preserve concurrent edits.
    const defaults = body.autoFill.marketReview;
    const persistedSymbols = new Set((reads[6]?.results || []).map(row => row.symbol));
    const levels = Array.isArray(defaults?.levels)
      ? defaults.levels.filter(patch => !persistedSymbols.has(patch?.symbol))
      : defaults?.levels;
    const hasDefaults = Object.hasOwn(body.autoFill, 'marketReview');
    // 本日旧列（含明确 []）也是已有内容：省略 marketReview 让保存冻结其投影，不被默认覆盖。
    const ownLegacy = existing.market_review_json == null
      && (existing.market_sentiment_blocks_json != null || existing.sector_rotation_blocks_json != null);
    const needsMarketReview = hasDefaults && !ownLegacy
      && (existing.market_review_json == null || !Array.isArray(levels) || levels.length > 0);
    const marketReview = existing.market_review_json != null
      ? { blocks: JSON.parse(existing.market_review_json).blocks, levels }
      : defaults && typeof defaults === 'object' && !Array.isArray(defaults) ? { ...defaults, levels } : defaults;
    const saved = await saveReviewDraft(env, archiveDate, {
      reviewStatus: existing.review_status,
      reviewerNewsNotes: existing.reviewer_news_notes || body.autoFill.reviewerNewsNotes || "",
      tradingSummary: existing.trading_summary ?? "",
      ...(needsMarketReview ? { marketReview } : {}),
    });
    readinessRecord = { ...existing,
      market_review_json: saved.marketReview.source === 'empty' ? null : serializeMarketReview(saved.marketReview),
      reviewer_news_notes: saved.reviewerNewsNotes,
      trading_summary: saved.tradingSummary,
      action_plan_count: saved.actionPlanCount,
    };
  }
  if (body.requireCompleteContent && existing) {
    const readiness = getBatchReviewReadiness(readinessRecord);
    if (!readiness.ready) {
      return {
        ok: true,
        skipped: true,
        reason: "incomplete review",
        archiveDate,
        reviewStatus: normalizeReviewStatus(existing.review_status),
        missingFields: readiness.missingFields,
      };
    }
  }

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO daily_review_archive (archive_date, review_status, updated_at)
       VALUES (?, 'initialized', ?)`,
    ).bind(archiveDate, isoNow()).run();
  }

  beginReviewStage(env, "complete.news");
  const sourceNewsIds = parseStoredIds(analysis?.source_news_ids);
  const newsSelectColumns = `id, pub_date, title, content, url, source, type, rule_passed, rule_reason,
         processing_status, ai_summary, market_impact, importance_stars, related_symbols, news_hash`;
  const newsWindowFilter = `pub_date >= ? AND pub_date <= ?
           AND COALESCE(importance_stars, 0) >= 3
           AND (
             COALESCE(rule_passed, 0) = 1
             OR type IN ('index', 'sector', 'stock')
             OR COALESCE(ai_summary, '') != ''
           )`;
  let markStatement;
  let archiveSelectStatement;
  if (sourceNewsIds.length) {
    const placeholders = sourceNewsIds.map(() => "?").join(", ");
    markStatement = env.DB.prepare(
      `UPDATE news_raw_data SET processing_status = 'reviewed' WHERE id IN (${placeholders})`,
    ).bind(...sourceNewsIds);
    archiveSelectStatement = env.DB.prepare(
      `SELECT ${newsSelectColumns}
       FROM news_raw_data
       WHERE id IN (${placeholders})
       ORDER BY pub_date DESC, id DESC`,
    ).bind(...sourceNewsIds);
  } else {
    markStatement = env.DB.prepare(
      `UPDATE news_raw_data SET processing_status = 'reviewed' WHERE ${newsWindowFilter}`,
    ).bind(newsWindow.start, newsWindow.end);
    archiveSelectStatement = env.DB.prepare(
      `SELECT ${newsSelectColumns}
       FROM news_raw_data
       WHERE ${newsWindowFilter}
       ORDER BY pub_date DESC, id DESC`,
    ).bind(newsWindow.start, newsWindow.end);
  }
  // 批内按提交顺序执行，所以 SELECT 读到的 processing_status 已经是 'reviewed'，
  // 与拆成两趟时归档的内容一致。价格查询与这两条无依赖，顺带搭同一趟车。
  const planSymbols = [...new Set(actionPlans.map((plan) => plan.symbol).filter(Boolean))];
  const priceStatements = planSymbols.length
    ? prepareLatestPricePointStatements(env, planSymbols, archiveDate)
    : [];
  const newsResults = await env.DB.batch([markStatement, archiveSelectStatement, ...priceStatements]);
  const archiveRows = { results: newsResults[1].results || [] };
  const priceMap = latestPricePointMapFromBatchResults(newsResults.slice(2));

  const archivedAt = isoNow();
  const archiveNewsStatement = env.DB.prepare(
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
  );
  const archiveStatements = [
    env.DB.prepare(`DELETE FROM daily_review_archive_news WHERE archive_date = ?`).bind(archiveDate),
    ...(archiveRows.results || []).map((item) => archiveNewsStatement.bind(
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
      archivedAt,
    )),
  ];
  const snapshotInput = body.accountSnapshot || body.account_snapshot || {};
  beginReviewStage(env, "complete.impact");
  const accountImpactSummary = actionPlans.length
    ? buildAccountImpactSummaryFromPlans({
      actionPlans,
      accounts: investmentAccounts,
      priceMap,
      previousSymbolsByAccount,
    })
    : [];
  const { statement: snapshotStatement, accountsJson } = buildReviewAccountSnapshotStatement(
    env,
    archiveDate,
    snapshotInput,
    {
      accounts: investmentAccounts,
      snapshotSource: body.completionSource === "batch" ? "batch_review" : "manual_review",
      accountImpactSummary,
    },
  );
  const snapshotAccounts = snapshotAccountsFromJson(accountsJson);

  // 新闻归档、账户快照、账户资产回写、复盘状态一次写完：跨太平洋的 D1 每次往返约 120ms，
  // 拆开就是四趟。同批也意味着这四段要么全成功、要么全回滚，不会留下「新闻归档了但状态没改」的半成品。
  beginReviewStage(env, "complete.write", archiveStatements.length);
  const writeStatements = [
    ...archiveStatements,
    snapshotStatement,
    ...buildInvestmentAccountSyncStatements(env, snapshotAccounts),
    env.DB.prepare(
      `UPDATE daily_review_archive
       SET review_status = 'reviewed', reviewed_at = ?, updated_at = ?
       WHERE archive_date = ?`,
    ).bind(isoNow(), isoNow(), archiveDate),
  ];
  const writeResults = await runWriteBatches(env, writeStatements);
  const accountSnapshot = snapshotRowToApi((writeResults[archiveStatements.length]?.results || [])[0]);

  return { ok: true, archiveDate, reviewStatus: "reviewed", accountSnapshot, accountImpactSummary };
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
        archive_date, review_status, reviewer_news_notes,
        market_sentiment_blocks_json, sector_rotation_blocks_json,
        trading_summary, reviewed_at, updated_at
      )
       VALUES (?, 'initialized', '', NULL, NULL, '', NULL, ?)`,
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
           market_review_json = NULL,
           market_sentiment_blocks_json = NULL,
           sector_rotation_blocks_json = NULL,
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

  const copyOutcome = await copyLiveActionPlansToDailyIfEmpty(env, archiveDate);

  return {
    ok: true,
    archiveDate,
    reviewStatus: "initialized",
    liveCopied: copyOutcome.copied,
    liveSkippedSymbols: copyOutcome.skipped,
  };
}

async function copyLiveActionPlansToDailyIfEmpty(env, archiveDate) {
  const existingPlans = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM daily_review_action_plans WHERE archive_date = ?`,
  ).bind(archiveDate).first();
  if (Number(existingPlans?.n || 0) > 0) {
    return { copied: 0, skipped: [] };
  }
  const livePlans = await listAccountLiveActionPlans(env);
  if (!livePlans.length) {
    return { copied: 0, skipped: [] };
  }
  const trackedResult = await env.DB.prepare(
    `SELECT symbol FROM tracked_symbols WHERE is_active = 1`,
  ).all();
  const trackedSet = new Set((trackedResult.results || []).map((row) => row.symbol));
  const now = isoNow();
  const skipped = [];
  let copied = 0;
  for (const plan of livePlans) {
    if (!trackedSet.has(plan.symbol)) {
      skipped.push(plan.symbol);
      console.warn(`[initializeReview] skip untracked live plan: account=${plan.accountId} symbol=${plan.symbol}`);
      continue;
    }
    await env.DB.prepare(
      `INSERT INTO daily_review_action_plans (
        archive_date, account_id, symbol, action_type, entry_plan,
        take_profit_plan, stop_loss_plan, key_levels, support_levels,
        resistance_levels, current_position, position_amount, thinking, sort_order,
        market_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      archiveDate,
      plan.accountId,
      plan.symbol,
      plan.actionType,
      plan.entryPlan,
      plan.takeProfitPlan,
      plan.stopLossPlan,
      plan.keyLevels,
      plan.supportLevels,
      plan.resistanceLevels,
      plan.currentPosition,
      plan.positionAmount,
      plan.thinking,
      plan.sortOrder,
      plan.marketType,
      now,
      now,
    ).run();
    copied += 1;
  }
  return { copied, skipped };
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
      // 价位在同一语句内复制当时的值；未物化旧日不写新列，也不反向物化。
      `INSERT INTO daily_review_snapshots (
        archive_date, version_no, snapshot_reason, review_status, reviewer_news_notes,
        market_sentiment_blocks_json, sector_rotation_blocks_json, trading_summary,
        reviewed_at, source_updated_at, snapshot_created_at, market_review_json, symbol_levels_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE (
        SELECT json_group_object(symbol, json_object('supportLevels', support_levels, 'resistanceLevels', resistance_levels))
        FROM daily_review_symbol_levels WHERE archive_date = ?) END)`,
    )
      .bind(
        archiveDate,
        versionNo,
        snapshotReason,
        reviewRecord.review_status || "initialized",
        reviewRecord.reviewer_news_notes || "",
        reviewRecord.market_sentiment_blocks_json || null,
        reviewRecord.sector_rotation_blocks_json || null,
        reviewRecord.trading_summary || "",
        reviewRecord.reviewed_at || null,
        reviewRecord.updated_at || null,
        snapshotCreatedAt,
        reviewRecord.market_review_json ?? null,
        reviewRecord.market_review_json ?? null,
        archiveDate,
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

// 以标普500（S&P 500）作为 NYSE 收盘日代理：有价格记录说明 NYSE 当天已收盘。
// 这样可以避免亚洲指数/汇率/商品先进入下一自然日时把复盘候选日错误推进。
async function getLatestClosedNyseTradingDay(env) {
  // 标的管理里该标的的系统代码历史上叫 GSPC，后改名为 SPX，两个代码都要认。
  const row = await env.DB.prepare(
    `SELECT MAX(k_date) AS latest FROM stock_raw WHERE symbol IN ('GSPC', 'SPX')`,
  ).first();
  return row?.latest || null;
}

function firstBatchRow(result) {
  return result?.results?.[0] || null;
}

function buildNewsWindowFromRows(rows, archiveDate) {
  const dates = (rows || []).map((row) => row.k_date).sort();
  const startDate = dates.length >= 2 ? dates[0] : subtractTradingDays(archiveDate, 1);
  return {
    start: `${startDate} 16:00:00`,
    end: `${archiveDate} 16:00:00`,
  };
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

  return buildNewsWindowFromRows(datesResult.results || [], archiveDate);
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
    `SELECT id, symbol, yahoo_symbol, display_name, symbol_type, market_type, aliases, is_active, sort_order, created_at, updated_at
     FROM tracked_symbols ${where} ORDER BY symbol_type, market_type, sort_order, id`,
  ).bind(...params).all();
  const items = (result.results || []).map(enrichSymbolItem);
  return { items, total: items.length };
}

async function getSymbolById(env, id) {
  const row = await env.DB.prepare(
    `SELECT id, symbol, yahoo_symbol, display_name, symbol_type, market_type, aliases, is_active, sort_order, created_at, updated_at
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
    `INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, market_type, aliases, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  ).bind(
    body.symbol.trim().toUpperCase(),
    (body.yahoo_symbol || "").trim() || null,
    body.display_name.trim(),
    body.symbol_type,
    normalizeSymbolMarketType(body.market_type || inferSymbolMarketType(body)),
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

  const oldSymbol = String(existing.symbol || "").trim().toUpperCase();
  const symbol = (body.symbol || existing.symbol).trim().toUpperCase();
  if (symbol !== oldSymbol) {
    const duplicate = await env.DB.prepare(
      `SELECT id FROM tracked_symbols WHERE symbol = ? AND id != ? LIMIT 1`,
    ).bind(symbol, id).first();
    if (duplicate) {
      const e = new Error("symbol already exists");
      e.statusCode = 409;
      throw e;
    }
  }
  const displayName = (body.display_name || existing.display_name).trim();
  const aliases = body.aliases != null
    ? normalizeAliases(body.aliases, symbol, displayName)
    : JSON.parse(existing.aliases || "[]");
  if (oldSymbol && oldSymbol !== symbol && !aliases.includes(oldSymbol)) aliases.push(oldSymbol);
  if (symbol && !aliases.includes(symbol)) aliases.unshift(symbol);

  const statements = [
    env.DB.prepare(
    `UPDATE tracked_symbols SET
       symbol = ?, yahoo_symbol = ?, display_name = ?, symbol_type = ?, market_type = ?,
       aliases = ?, is_active = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`,
    ).bind(
      symbol,
      (body.yahoo_symbol != null ? body.yahoo_symbol : existing.yahoo_symbol) || null,
      displayName,
      body.symbol_type || existing.symbol_type,
      normalizeSymbolMarketType(body.market_type || existing.market_type || inferSymbolMarketType({ symbol, yahoo_symbol: body.yahoo_symbol ?? existing.yahoo_symbol })),
      JSON.stringify(aliases),
      body.is_active != null ? Number(body.is_active) : existing.is_active,
      body.sort_order != null ? Number(body.sort_order) : existing.sort_order,
      isoNow(),
      id,
    ),
  ];
  if (oldSymbol && oldSymbol !== symbol) {
    statements.push(
      env.DB.prepare(`UPDATE stock_raw SET symbol = ? WHERE symbol = ?`).bind(symbol, oldSymbol),
      env.DB.prepare(`UPDATE daily_review_action_plans SET symbol = ?, updated_at = ? WHERE symbol = ?`).bind(symbol, isoNow(), oldSymbol),
    );
    const relatedUpdates = await buildRelatedSymbolRenameUpdates(env, oldSymbol, symbol);
    statements.push(...relatedUpdates);
  }
  await env.DB.batch(statements);
  const updated = await env.DB.prepare(`SELECT * FROM tracked_symbols WHERE id = ? LIMIT 1`).bind(id).first();
  return { ok: true, item: enrichSymbolItem(updated) };
}

async function buildRelatedSymbolRenameUpdates(env, oldSymbol, newSymbol) {
  const updates = [];
  const tables = ["news_raw_data", "daily_review_archive_news"];
  for (const table of tables) {
    const { results } = await env.DB.prepare(
      `SELECT id, related_symbols FROM ${table} WHERE related_symbols LIKE ?`,
    ).bind(`%${oldSymbol}%`).all();
    for (const row of results || []) {
      const symbols = parseStoredSymbols(row.related_symbols);
      if (!symbols || !symbols.includes(oldSymbol)) continue;
      const renamed = symbols.map((item) => (item === oldSymbol ? newSymbol : item));
      const unique = [...new Set(renamed)];
      updates.push(
        env.DB.prepare(`UPDATE ${table} SET related_symbols = ? WHERE id = ?`).bind(JSON.stringify(unique), row.id),
      );
    }
  }
  return updates;
}

async function deleteSymbol(env, id, hardDelete = false) {
  const existing = await env.DB.prepare(`SELECT * FROM tracked_symbols WHERE id = ? LIMIT 1`).bind(id).first();
  if (!existing) { const e = new Error("Symbol not found"); e.statusCode = 404; throw e; }
  if (hardDelete) {
    if (Number(existing.is_active) === 1) {
      const e = new Error("Only hidden symbols can be permanently deleted");
      e.statusCode = 400;
      throw e;
    }
    await env.DB.prepare(`DELETE FROM tracked_symbols WHERE id = ?`).bind(id).run();
    return { ok: true, deleted: true, symbol: existing.symbol };
  }
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
  const llmModel = env.LLM_MODEL_ID || "qwen3.5-flash";

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
  "market_type": "美股 或 大A；A股/H股/沪深代码用大A，美股ticker用美股",
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
    parsed.market_type = normalizeSymbolMarketType(parsed.market_type || inferSymbolMarketType(parsed));
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
  return { ...row, market_type: normalizeSymbolMarketType(row.market_type || inferSymbolMarketType(row)), aliases };
}

function normalizeSymbolMarketType(value) {
  return value === "大A" ? "大A" : "美股";
}

function inferSymbolMarketType(item = {}) {
  const text = `${item.symbol || ""} ${item.yahoo_symbol || ""} ${item.display_name || ""}`;
  if (/[.\s](SS|SZ|HK)\b/i.test(text) || /[\u4e00-\u9fff]/.test(String(item.symbol || ""))) return "大A";
  return "美股";
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

export {
  buildAccountImpactSummaryFromPlans,
  buildAccountImpactSummaryFromSnapshot,
  buildAccountSnapshotFromAccounts,
  buildAccountLiveActionPlanStatements,
  buildReviewActionPlanStatements,
  buildReviewSymbolLevelStatements,
  buildActionPlanSymbolMetrics,
  buildNewsWindowFromRows,
  buildReviewListItems,
  bucketEstimatedImpactPercent,
  deriveReviewDailyThesis,
  completeReview,
  getBatchReviewReadiness,
  getReviewBootstrap,
  normalizeReviewNoteBlocks,
  parsePendingReviewLimit,
  parsePositionWeight,
  previousActionPlanSymbolKeysFromRows,
};
