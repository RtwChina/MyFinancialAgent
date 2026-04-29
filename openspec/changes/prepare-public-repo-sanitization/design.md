## Context

The repository is currently private and GitHub Actions runs are blocked by account billing/spending limits. Making the repository public can restore free standard GitHub-hosted runner usage, but the current tree and git history contain credential-like values.

Known findings from the initial scan:

- `src/config.py` contains hardcoded default values for `LLM_API_KEY` and `TAVILY_API_KEY`.
- `tests/news_quality_test.py` contains a hardcoded default `FINNHUB_API_KEY`.
- `wrangler.toml` contains a checked-in `INGEST_API_TOKEN` placeholder-like value under vars.
- These files have existed in git history, so current-tree cleanup alone is insufficient.

The project has multiple runtime environments:

- GitHub Actions runs Python collection jobs and must receive secrets through repository Actions secrets.
- Cloudflare Worker validates write requests and optionally calls LLM APIs for symbol resolution.
- Local development uses `.env` and `.dev.vars`, both ignored by git.
- Public repository content must contain only variable names, placeholders, and non-sensitive defaults.

## Goals / Non-Goals

**Goals:**

- Make the repository safe to switch to public visibility.
- Remove committed secret values from the current tree and rewritten history.
- Provide exact GitHub Actions and Cloudflare Worker secret placement instructions.
- Retain existing credentials by operator decision, and require history/log sanitization before public visibility is enabled.
- Preserve scheduled job behavior after sanitization.
- Provide a verification checklist for current tree, history, Actions, Worker, and local development.

**Non-Goals:**

- This change does not switch the GitHub repository visibility to public by itself.
- This change does not redesign authentication or replace the Worker Bearer-token model.
- This change does not publish production secrets into any example file.
- This change does not guarantee that third-party provider logs outside GitHub are sanitized.

## Decisions

### 1. Retain credentials only after explicit risk acceptance

Credential-like values that appeared in tracked files or git history will be removed from the current tree, rewritten history, and retained workflow logs before public visibility is enabled. The operator has explicitly chosen not to rotate existing provider or Worker tokens, so public conversion is blocked until scans confirm those retained values no longer appear in repository-visible surfaces.

Alternative considered: rotate all exposed values before public conversion. Rejected by operator preference to avoid key churn; the trade-off is stricter history/log cleanup and verification before public conversion.

### 2. Use environment-only runtime configuration

Application code will read secrets from environment variables without real fallback values. Public example files may include placeholder values such as `replace-me`, but no executable production credential.

Placement:

| Secret | GitHub Actions Secret | Cloudflare Worker Secret | Local untracked file |
|---|---:|---:|---:|
| `LLM_API_KEY` | yes | yes, if Worker LLM symbol resolution remains enabled | `.env` / `.dev.vars` |
| `LLM_BASE_URL` | yes or repo variable | optional Worker var/secret | `.env` / `.dev.vars` |
| `FINNHUB_API_KEY` | yes | no | `.env` |
| `INGEST_API_BASE_URL` | yes | no | `.env` |
| `INGEST_API_TOKEN` | yes | yes, retained runtime binding | `.env` / `.dev.vars` |
| `APP_API_TOKEN` | no | optional; falls back to `INGEST_API_TOKEN` if unset | `.dev.vars` |
| `LLM_MODEL_ID` | optional | optional Worker var/secret | `.env` / `.dev.vars` |

### 3. Keep `wrangler.toml` non-sensitive

`wrangler.toml` may keep public deployment metadata such as Worker name, compatibility date, static asset binding, D1 binding, and `APP_ENV`. It must not contain write tokens or API keys.

Worker secrets will be configured through Cloudflare Dashboard or `wrangler secret put`.

### 4. Rewrite history before changing visibility

The repository history will be rewritten with a history-cleaning tool such as `git-filter-repo` to remove known secret values and sensitive file contents from all relevant refs. After rewriting, the sanitized history will be force-pushed to the remote.

This is intentionally separated from the final visibility change. The repository should remain private until:

- current tree scan passes,
- full history scan passes,
- key non-rotation risk has been accepted and retained values are absent from repository-visible surfaces,
- GitHub Actions secrets and Cloudflare Worker runtime bindings are populated,
- scheduled jobs pass with the new secrets.

### 5. Verify Actions and Worker after sanitization

The public-readiness verification must cover each runtime path:

- `collect_news.yml`: hourly news collection using LLM, Finnhub, embeddings, and remote write.
- `collect_prices.yml`: close-summary flow using price collection, news collection, LLM summary, and remote write.
- `repair_prices.yml`: repair flow using remote candidate lookup and repair write.
- Worker write APIs: authenticated ingest and repair endpoints.
- Worker front-end write operations: `APP_API_TOKEN` or fallback `INGEST_API_TOKEN`.

## Risks / Trade-offs

- [History rewrite disrupts clones] -> Communicate that collaborators must re-clone or realign with the rewritten `main`; prevent old clones from force-pushing stale history.
- [Secret still present in Actions logs or artifacts] -> Inspect recent workflow runs and delete risky logs/artifacts before switching public.
- [Missed key pattern] -> Run more than one scanner style: targeted regex scan plus a history scanner such as `gitleaks` or `trufflehog`.
- [Sanitization breaks scheduled jobs] -> Re-run `workflow_dispatch` for each workflow while the repo is still private and confirm success.
- [Cloudflare Worker loses write auth] -> Keep GitHub Actions `INGEST_API_TOKEN` aligned with the Worker `INGEST_API_TOKEN` runtime binding; verify with a non-destructive authenticated endpoint or a controlled write path.
- [Public repository reveals operational URLs] -> Treat service URLs and D1 binding names as low sensitivity, but verify no private admin-only endpoint or token is embedded.

## Migration Plan

1. Freeze repository changes during sanitization.
2. Record the operator decision to retain existing DashScope/Bailian, Tavily, Finnhub, and Cloudflare write tokens.
3. Update current tracked files to remove hardcoded secret defaults and add example configuration files.
4. Rewrite git history to remove known secrets and sensitive local values.
5. Run current-tree and full-history secret scans.
6. Force-push rewritten history to the private remote.
7. Confirm GitHub Actions Secrets and Cloudflare Worker Secrets still contain the intended retained values.
8. Run `workflow_dispatch` for all scheduled workflows while private.
9. Inspect recent workflow logs for secret leakage.
10. Switch repository visibility to public only after all checks pass.

Rollback strategy:

- If rewritten history causes issues before public visibility, keep the repository private and restore from a private backup clone.
- If scheduled jobs fail after sanitization, keep the repository private, fix secret placement, and rerun workflows before public conversion.

## Open Questions

- Should old GitHub Actions workflow runs and artifacts be deleted before visibility is changed, or is rotating all visible credentials sufficient?
- Should `LLM_BASE_URL` and `LLM_MODEL_ID` be GitHub repository variables rather than secrets, since they are not credentials?
- Is the current `repair_prices.yml` schedule intentional, given it currently differs from the previously discussed `08:17` / `09:17` plan?
