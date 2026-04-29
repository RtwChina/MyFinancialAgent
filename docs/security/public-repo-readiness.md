# Public Repository Readiness Checklist

This checklist tracks the safe-publication work before changing the GitHub repository visibility.

## Baseline

- Default branch commit recorded before sanitization: `e454a2ed9c72b50d41e86d8bbf5a495fc2dbdcbb`
- Freeze decision: pause non-essential pushes until current-tree sanitization, secret rotation, history rewrite, and verification are complete.
- GitHub Actions logs/artifacts decision: delete old workflow runs/artifacts that may include sensitive request URLs, prompts, or environment-derived values before making the repository public.

## Current Tree Inventory

Tracked files with credential-like values or secret references found during the initial review:

- `src/config.py`: previously had real DashScope/Bailian and Tavily fallback values; now reads those values only from environment variables.
- `tests/news_quality_test.py`: previously had a real Finnhub fallback value; now reads it only from `FINNHUB_API_KEY`.
- `wrangler.toml`: previously had `INGEST_API_TOKEN` under checked-in vars; the current tree no longer stores it.
- `.github/workflows/collect_news.yml`: consumes GitHub Actions secrets for LLM, Finnhub, and Worker ingest.
- `.github/workflows/collect_prices.yml`: consumes GitHub Actions secrets for LLM, Finnhub, and Worker ingest.
- `.github/workflows/repair_prices.yml`: consumes GitHub Actions secrets for Worker ingest.
- `cloudflare/worker/src/index.js`: reads Worker secrets and vars from Cloudflare runtime bindings.
- `README.md`, `cloudflare/README.md`, and architecture/test docs: mention secret names and placeholder usage; they should not include real values.

## Secret Placement

GitHub Actions repository secrets:

| Name | Used by | Notes |
| --- | --- | --- |
| `LLM_API_KEY` | `collect_news.yml`, `collect_prices.yml` | Retained by operator decision; must not appear in current tree, rewritten history, or retained logs. |
| `LLM_BASE_URL` | `collect_news.yml`, `collect_prices.yml` | Usually `https://dashscope.aliyuncs.com/compatible-mode/v1`; keep as a secret or repo variable if preferred. |
| `FINNHUB_API_KEY` | `collect_news.yml`, `collect_prices.yml` | Retained by operator decision; must not appear in current tree, rewritten history, or retained logs. |
| `INGEST_API_BASE_URL` | all production ingestion workflows | Production Worker URL. |
| `INGEST_API_TOKEN` | all production ingestion workflows | Retained by operator decision; must not appear in current tree, rewritten history, or retained logs. |

Cloudflare Worker runtime bindings:

| Name | Used by | Notes |
| --- | --- | --- |
| `INGEST_API_TOKEN` | Python ingest write authentication | Retained Worker binding; must match the GitHub Actions `INGEST_API_TOKEN`. |
| `APP_API_TOKEN` | Front-end write authentication | Optional; omitted if Worker front-end writes intentionally fall back to `INGEST_API_TOKEN`. |
| `LLM_API_KEY` | Worker-side symbol resolution | Configured as a Worker secret if Worker LLM symbol resolution remains enabled. |

Cloudflare Worker non-secret vars:

| Name | Suggested value | Notes |
| --- | --- | --- |
| `APP_ENV` | `prod` | Safe to keep in `wrangler.toml`. |
| `LLM_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Only needed for Worker LLM symbol resolution. |
| `LLM_MODEL_ID` | `qwen3.5-plus` | Only needed for Worker LLM symbol resolution. |

Local development files:

| File | Purpose |
| --- | --- |
| `.env` | Python local runtime variables; create from `.env.example`. |
| `.dev.vars` | Worker local secrets for `wrangler dev`; create from `.dev.vars.example`. |

## History Rewrite Plan

Known sensitive values and file locations to cover in the history rewrite:

- Real DashScope/Bailian fallback value formerly committed in `src/config.py`.
- Real Tavily fallback value formerly committed in `src/config.py`.
- Real Finnhub fallback value formerly committed in `tests/news_quality_test.py`.
- `INGEST_API_TOKEN` value formerly committed in `wrangler.toml`.
- Any committed local environment files, logs, database files, exports, or workflow artifacts discovered by full-history scanning.

Recommended sequence:

1. Keep the repository private.
2. Create a private backup clone or branch.
3. Confirm the operator accepts retaining existing provider and Worker tokens.
4. Use `git-filter-repo` or an equivalent tool to remove known secret values and sensitive files from all relevant refs.
5. Delete or retain only safe GitHub Actions workflow logs and artifacts.
6. Run a full-history scanner such as `gitleaks` or `trufflehog`.
7. Force-push the rewritten history while the repository remains private.
8. Ask collaborators to re-clone or carefully realign local clones so old history is not pushed back.
9. Re-run GitHub Actions and Worker smoke checks.
10. Only then switch the repository to public.
