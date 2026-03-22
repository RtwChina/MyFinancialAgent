## ADDED Requirements

### Requirement: README SHALL expose a stable top-level table of contents

The root `README.md` SHALL include a top-level directory section near the beginning of the document. The directory SHALL link to the major second-level sections of the document using stable anchors that do not depend on renderer-specific automatic slug generation.

#### Scenario: Reader opens README from the top
- **GIVEN** the repository root `README.md` has been updated with the current system documentation
- **WHEN** a reader opens the document in GitHub or any Markdown viewer that preserves explicit anchors
- **THEN** the reader MUST see a directory section before the main content sections
- **AND** each directory entry MUST link to a corresponding major section anchor in the same document

#### Scenario: Section title text changes but anchor contract remains stable
- **GIVEN** a maintainer updates the visible Chinese section title for readability
- **WHEN** the maintainer does not need to change the section's navigation contract
- **THEN** the directory link target MUST remain stable through explicit anchor identifiers rather than renderer-generated heading slugs

### Requirement: ReadMe page SHALL resolve README directory links after async render

The front-end ReadMe page SHALL preserve and activate the README directory links after `/readme.md` is fetched and rendered asynchronously. The page MUST support both in-page clicks and first-load hash navigation.

#### Scenario: User clicks a directory entry inside the ReadMe page
- **GIVEN** the ReadMe view has loaded `/readme.md` into `#readmeContent`
- **WHEN** the user clicks a directory link such as `#system-overview`
- **THEN** the page MUST scroll to the matching section target inside the rendered ReadMe content
- **AND** the target heading MUST not be hidden behind the page's fixed or sticky layout offsets

#### Scenario: User opens the ReadMe page with an existing hash
- **GIVEN** the browser location already contains a README hash target before the Markdown fetch completes
- **WHEN** `renderReadme()` finishes rendering the content
- **THEN** the page MUST resolve the existing hash against the rendered content
- **AND** the matching section MUST become visible without requiring the user to click the link again

### Requirement: README synchronization SHALL remain single-source

The directory feature SHALL be maintained inside the root `README.md` and SHALL flow to the ReadMe page through the existing sync pipeline. No second directory manifest, generated metadata file, or environment-specific document copy may become the source of truth.

#### Scenario: Local preview refreshes README content
- **GIVEN** a maintainer updates the root `README.md`, including directory entries or anchors
- **WHEN** `npm run sync:readme`, `npm run dev`, or `npm run deploy` runs
- **THEN** `cloudflare/web/readme.md` MUST contain the same directory and anchor content as the root `README.md`
- **AND** the front-end MUST render that synced content without requiring extra manual editing in `cloudflare/web/`
