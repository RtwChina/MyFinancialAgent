## ADDED Requirements

### Requirement: Current repository tree contains no real secrets

The system SHALL keep all real credentials out of tracked files before the repository is made public.

#### Scenario: Application config uses environment-only secrets

- **GIVEN** the repository is prepared for public visibility
- **WHEN** `src/config.py` is inspected
- **THEN** credential fields such as `LLM_API_KEY`, `TAVILY_API_KEY`, `FINNHUB_API_KEY`, and `INGEST_API_TOKEN` MUST NOT contain real fallback credential values

#### Scenario: Cloudflare config contains no write token

- **GIVEN** the repository is prepared for public visibility
- **WHEN** `wrangler.toml` is inspected
- **THEN** it MUST NOT contain `INGEST_API_TOKEN`, `APP_API_TOKEN`, LLM API keys, or other write credentials

#### Scenario: Tests contain no real provider keys

- **GIVEN** the repository is prepared for public visibility
- **WHEN** test files are inspected
- **THEN** tests MUST use environment variables, placeholders, or mocks instead of hardcoded real provider API keys

### Requirement: Runtime secrets are documented by execution environment

The system SHALL provide a clear secret placement checklist for GitHub Actions, Cloudflare Worker, and local development.

#### Scenario: GitHub Actions secret checklist exists

- **GIVEN** the repository is prepared for public visibility
- **WHEN** an operator configures GitHub Actions
- **THEN** the checklist MUST identify the required repository secrets for `collect_news.yml`, `collect_prices.yml`, and `repair_prices.yml`

#### Scenario: Cloudflare Worker secret checklist exists

- **GIVEN** the repository is prepared for public visibility
- **WHEN** an operator configures the Cloudflare Worker
- **THEN** the checklist MUST identify Worker secrets including write authentication and optional LLM symbol-resolution settings

#### Scenario: Local development example files exist

- **GIVEN** the repository is prepared for public visibility
- **WHEN** a developer clones the repository
- **THEN** the repository SHOULD include example environment files with placeholder values and MUST keep real `.env` / `.dev.vars` files ignored

### Requirement: Credential exposure is removed before public visibility

The operator SHALL remove credential exposure from tracked files, rewritten history, and retained workflow logs before changing repository visibility to public.

#### Scenario: Known committed keys are removed from repository-visible surfaces

- **GIVEN** a credential-like value was found in tracked files or git history
- **WHEN** the public-readiness checklist is executed
- **THEN** that credential MUST be absent from current files, rewritten history, and retained workflow logs before the repository is made public

#### Scenario: Retained secrets are installed in runtime platforms

- **GIVEN** provider credentials are retained by operator decision
- **WHEN** GitHub Actions and Cloudflare Worker are configured
- **THEN** the intended retained secret values MUST be installed in the relevant runtime secret stores before scheduled jobs are validated

### Requirement: Git history is sanitized before repository visibility changes

The repository SHALL rewrite git history to remove known committed secrets and sensitive local configuration before changing visibility to public.

#### Scenario: Full-history scan passes after rewrite

- **GIVEN** history has been rewritten
- **WHEN** a full-history secret scan is run across all relevant refs
- **THEN** no known real API key, token, private key, database export, or log artifact MUST remain

#### Scenario: Rewritten history is force-pushed only while private

- **GIVEN** rewritten history is ready
- **WHEN** the remote repository is updated
- **THEN** the force-push MUST happen while the repository is still private

### Requirement: Public-readiness verification covers scheduled jobs and Worker auth

The system SHALL verify all production runtime paths with secrets after sanitization and before public visibility is enabled.

#### Scenario: Scheduled workflows run with secret stores

- **GIVEN** sanitized history has been pushed and runtime secrets have been configured
- **WHEN** `collect_news.yml`, `collect_prices.yml`, and `repair_prices.yml` are run manually through `workflow_dispatch`
- **THEN** each workflow MUST start successfully and read required secrets from GitHub Actions Secrets rather than tracked files

#### Scenario: Worker write auth still works

- **GIVEN** Worker secrets have been configured
- **WHEN** an authenticated write path is exercised
- **THEN** the Worker MUST authorize the request using secrets from Cloudflare Worker configuration

#### Scenario: Public visibility is the final step

- **GIVEN** current tree, history, retained-secret verification, runtime configuration, and workflow validation checks have passed
- **WHEN** the repository visibility is changed
- **THEN** the repository MAY be switched to public without exposing known committed secrets
