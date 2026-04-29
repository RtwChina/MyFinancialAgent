## Why

GitHub Actions is currently blocked by billing limits, and making the repository public is a practical way to restore standard hosted-runner usage. The repository has contained hardcoded API keys and tokens in tracked files and history, so it must be sanitized before public visibility is enabled.

## What Changes

- Remove hardcoded secrets from the current repository tree and replace them with environment-only configuration and example files.
- Define the exact GitHub Actions Secrets and Cloudflare Worker Secrets required for scheduled jobs and Worker runtime behavior.
- Retain existing credentials by operator decision, and require history/log sanitization before public visibility is enabled.
- Rewrite git history to remove known committed secrets and sensitive local-development values.
- Scan the current tree and rewritten history for secrets, databases, logs, exports, and other private artifacts.
- Verify that scheduled workflows and Worker write/auth flows still run using secrets after sanitization.
- **BREAKING**: Rewriting git history changes commit SHAs and requires collaborators or automation clones to re-clone or carefully realign with the new history.

## Capabilities

### New Capabilities

- `public-repo-sanitization`: Covers repository sanitization, secret relocation, history cleanup, and public-readiness verification before changing repository visibility.

### Modified Capabilities

- None.

## Impact

- Current tracked files containing credential defaults, especially `src/config.py`, `tests/news_quality_test.py`, and `wrangler.toml`.
- Git history across all relevant refs, because committed secrets remain visible after a simple file edit.
- GitHub Actions repository secrets used by `collect_news.yml`, `collect_prices.yml`, and `repair_prices.yml`.
- Cloudflare Worker secrets used for write authentication and optional LLM-powered symbol resolution.
- Local development setup through `.env`, `.dev.vars`, and checked-in example files.
- Operational process for deployment, scheduled jobs, and any collaborator clone after force-pushing rewritten history.
