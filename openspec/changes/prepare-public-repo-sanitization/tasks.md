## 1. Inventory And Freeze

- [x] 1.1 Record the current default branch commit SHA and pause non-essential pushes during sanitization.
- [x] 1.2 Inventory tracked files that currently contain credential-like values: `src/config.py`, `tests/news_quality_test.py`, `wrangler.toml`, workflow files, README/docs, and Cloudflare files.
- [x] 1.3 Inventory required runtime secrets for GitHub Actions, Cloudflare Worker, and local development.
- [x] 1.4 Decide whether to delete or retain existing GitHub Actions workflow run logs and artifacts before public visibility.

## 2. Current Tree Sanitization

- [x] 2.1 Remove real fallback values from `src/config.py`; secrets must default to empty values or explicit non-secret placeholders.
- [x] 2.2 Remove real default provider keys from tests such as `tests/news_quality_test.py`; use environment variables, mocks, or placeholders.
- [x] 2.3 Remove `INGEST_API_TOKEN` and any credential-like values from `wrangler.toml`; keep only public-safe vars such as `APP_ENV`.
- [x] 2.4 Add or update `.env.example` with required local Python variables and placeholder values.
- [x] 2.5 Add or update `.dev.vars.example` with required local Worker variables and placeholder values.
- [x] 2.6 Confirm `.gitignore` excludes `.env`, `.env.local`, `.dev.vars`, logs, DB files, exports, and local runner artifacts.

## 3. Secret Retention And Placement Checklist

- [x] 3.1 Record operator decision to retain DashScope/Bailian `LLM_API_KEY` and rely on history/log sanitization.
- [x] 3.2 Record operator decision to retain Tavily `TAVILY_API_KEY` and rely on history/log sanitization.
- [x] 3.3 Record operator decision to retain Finnhub `FINNHUB_API_KEY` and rely on history/log sanitization.
- [x] 3.4 Record operator decision to retain `INGEST_API_TOKEN` and `APP_API_TOKEN` and rely on history/log sanitization.
- [ ] 3.5 Confirm GitHub Actions repository secrets exist: `LLM_API_KEY`, `LLM_BASE_URL`, `FINNHUB_API_KEY`, `INGEST_API_BASE_URL`, `INGEST_API_TOKEN`.
- [ ] 3.6 Confirm Cloudflare Worker secrets exist: `INGEST_API_TOKEN`, `APP_API_TOKEN`, and `LLM_API_KEY` if Worker LLM symbol resolution remains enabled.
- [ ] 3.7 Add Cloudflare Worker non-secret vars as needed: `LLM_BASE_URL`, `LLM_MODEL_ID`, and `APP_ENV`.
- [x] 3.8 Document the final secret placement table in project docs or an operator checklist.

## 4. Git History Sanitization

- [x] 4.1 Create a private backup clone or branch before rewriting history.
- [x] 4.2 Prepare a history rewrite plan covering known secret values and sensitive file paths.
- [x] 4.3 Run git history cleanup with `git-filter-repo` or an equivalent tool across all relevant refs.
- [x] 4.4 Verify removed secrets no longer appear in rewritten history.
- [ ] 4.5 Force-push the rewritten history while the repository remains private.
- [x] 4.6 Communicate that old clones must be re-cloned or carefully realigned to avoid reintroducing old history.

## 5. Scanning And Verification

- [x] 5.1 Run targeted regex scanning against the current tree for provider keys, Bearer tokens, private keys, and local tokens.
- [x] 5.2 Run a full-history scanner such as `gitleaks` or `trufflehog` on the rewritten repository.
- [x] 5.3 Check for committed databases, logs, exports, spreadsheets, or generated artifacts in current tree and rewritten history.
- [ ] 5.4 Inspect recent GitHub Actions logs for leaked secrets, request headers, environment dumps, or sensitive prompts.
- [x] 5.5 Run `python -m py_compile` or equivalent smoke checks for files touched during sanitization.
- [x] 5.6 Run existing focused tests affected by configuration changes.

## 6. Runtime Validation

- [ ] 6.1 Run `采集新闻数据` via `workflow_dispatch` using GitHub Actions secrets.
- [ ] 6.2 Run `采集股票价格数据` via `workflow_dispatch` using GitHub Actions secrets.
- [ ] 6.3 Run `修复股票空价格数据` via `workflow_dispatch` using GitHub Actions secrets.
- [ ] 6.4 Verify Worker authenticated write paths still accept the retained token.
- [ ] 6.5 Verify Worker front-end write operations use `APP_API_TOKEN` or the intended fallback token.
- [ ] 6.6 Recheck `repair_prices.yml` schedule and confirm the intended Beijing run times before public conversion.

## 7. Public Conversion Readiness

- [ ] 7.1 Confirm secret retention risk is accepted and retained secrets are absent from current tree, rewritten history, and retained logs.
- [x] 7.2 Confirm current-tree scan and full-history scan are clean.
- [ ] 7.3 Confirm required GitHub Actions and Cloudflare Worker secrets are populated with intended retained values.
- [ ] 7.4 Confirm scheduled workflows can start successfully after billing-independent public-readiness changes.
- [ ] 7.5 Confirm the repository is still private immediately before changing visibility.
- [ ] 7.6 Change repository visibility to public manually in GitHub settings.
- [ ] 7.7 After public conversion, run one workflow manually and verify it starts with the public repository settings.
