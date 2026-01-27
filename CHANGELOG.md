# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2025-08-25

### Added

- Variable interpolation wired for Grafana 12+ (template replacement happens before SPL is sent).
- Examples for **exact interface matching** using a safe regex boundary:  
  `regex _raw="(^|[^0-9/])$sysloginterface([^0-9/]|$)"`

### Changed

- `datasource.ts` now always uses the **Grafana-proxied base URL** from `instanceSettings.url` (e.g. `/api/datasources/proxy/uid/<UID>`) and never rebuilds it manually.
- Query mapping prefers `message` and falls back to `_raw`.

### Fixed

- Empty results when using dashboard variables due to quoting & interpolation timing.
- “Unable to find datasource” when stale UID was referenced — docs updated with steps to reselect/reload.

---

## [0.7.1] - 2025-08-24

### Fixed

- Query editor input was read-only in Grafana 12. Switched from `QueryField` to `TextArea` in `QueryEditor.tsx` so SPL can be entered normally.

---

## [0.7.0] - 2025-08-24

### Added

- Frontend-only Splunk integration via Grafana proxy: create job, poll status, page results.
- Results mapped to a Grafana **Table** with fields: `time`, `host`, `message`.
- `metricFindQuery` for variable population (first results column → `{text,value}`).
- `testDatasource()` reaching `/services/server/info?output_mode=json` (config-dependent).

### Changed

- Centralized types in `src/types.ts` (`SplunkDataSourceOptions`, `SplunkSecureJsonData`, `SplunkQuery`).

### Fixed

- Build issues from legacy imports; exported `DEFAULT_QUERY` and `defaultQuery` aliases.

---

## [0.4.0] - 2025-08-24

### Added

- Dev flow with `npm run server` verified; plugin listed in **Add data source**.

### Fixed

- Initial guardrail checks surfaced as a warning frame for unsafe queries.

---

## [0.3.0] - 2025-08-24

### Added

- Wired `ConfigEditor`, `QueryEditor`, and `VariableQueryEditor` into the scaffold.

### Fixed

- Type alignment and path corrections for clean webpack build.

---

## [0.2.0] - 2025-08-24

### Added

- Types for queries and datasource options.

### Fixed

- Import path issues from moved files.

---

## [0.1.0] - 2025-08-24

### Added

- Initial scaffold via `@grafana/create-plugin`, with build and dev server scripts.
