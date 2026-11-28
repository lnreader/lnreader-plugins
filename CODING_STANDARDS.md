# Coding Standards

Review-time standards for LNReader plugins and repository tooling. Automated checks (`prettier`, `eslint`, and `tsc --project tsconfig.production.json --noEmit`) handle formatting, `type`-over-`interface`, restricted `@/lib/fetch*` imports, and Hermes globals.

## Plugin implementation

- **Scope & theme reuse**: Check `plugins/multisrc/` for a matching CMS/theme before adding a standalone plugin.
- **Placement & exports**: Place standalone plugins under `plugins/<language>/<id>.ts` (full language name). Implement `Plugin.PluginBase` with a `PascalCase` class and `export default new <ClassName>();`. Keep `id` unique, stable, and `camelCase` or lowercase alphanumeric.
- **Runtime compatibility**: Use `@libs/*` helpers (e.g., `@libs/fetch`, `@libs/novelStatus`, `@libs/pluginError`, `@libs/storage`) and target ES5/Hermes/React Native (avoid Node-only or browser-only globals).
- **Error handling**: Use `@libs/pluginError` (`checkResponse`, `httpError`, `createPluginError`, `assertNoChallenge`, `PluginError`) to report HTTP failures, anti-bot challenges, rate limits, and empty content with `.code` and `.status` metadata rather than throwing plain strings or silently returning empty results on non-`ok` responses.
- **Semantic versioning**: Bump `version` on every existing-plugin change — patch for compatibility fixes, minor for new features/filters, major for breaking site/domain rewrites.
- **Assets**: Place a 96x96 PNG at `public/static/src/<short-language-code>/<plugin-id>/icon.png` and set `icon` to `src/<short-language-code>/<plugin-id>/icon.png`. Leave `cover` unset when no usable cover exists (the app shows its own placeholder; `@libs/defaultCover` is removed); omit metadata the source does not provide.
- **Path & URL consistency**: Keep `novelPath`, `chapterPath`, and `resolveUrl` consistent across `popularNovels`, `searchNovels`, `parseNovel`, and `parseChapter`. When migrating from a multisrc generator whose paths include a trailing slash (e.g., Fictioneer `novels/<slug>/`), strip leading and trailing slashes before building URLs or selectors.
- **Broken plugins**: Only add or remove a `*.broken.ts` suffix after verifying live site status and updating `version` on recovery.
- **Blacklist**: Verify new sources are absent from `BLACKLIST.json`.

## Multisrc & migration checklist

- Edit `sources.json`, `template.ts`, filters, custom assets, or `generator.js` inside `plugins/multisrc/<generator>/` rather than generated `plugins/<language>/<name>[<generator>].ts` files.
- Bump the generator's version increment field when changing a multisrc source URL or behavior, then run `npm run build:multisrc`.
- When migrating a multisrc source to standalone `plugins/<language>/<id>.ts`:
  1. Remove its entry from `plugins/multisrc/<generator>/sources.json` and any `plugins/multisrc/<generator>/custom/<id>/` assets.
  2. Move `public/static/multisrc/<generator>/<id>/icon.png` to `public/static/src/<short-language-code>/<id>/icon.png`.
  3. Preserve `id`, support legacy `resolveUrl`/trailing-slash paths, and bump the major `version`.

## GitHub workflows & scripts

- **Live-issue & concurrency safety**: Auto-close workflows (`issue_moderator.yml`, `theme_auto_label.yml`) must fetch the live GitHub issue before deciding to close and set `concurrency.cancel-in-progress: false` whenever `edited` runs skip checks on unchanged URLs or targets.
- **SSRF-safe probing & reachability**: Outbound website checks and theme probes in `.github/scripts/` must reuse `site-reachability.cjs` (pre-connection DNS resolution via `resolvePublicIps` with multi-IP failover, `curl --resolve` IP pinning, and hop-by-hop redirect validation) rather than raw `curl --location`; reachability-only checks must stop at the first HTTP response (`maxRedirs: 0`) so `3xx` responses count as reachable, while theme probes follow redirects (`maxRedirs: 5`).
- **Managed label reconciliation**: Workflows triggered on `issues.edited` that apply managed labels (`language: *`, `theme: *`, `plugin: *`, `severity: *`) must reconcile (`add`/`remove`) against an explicit `MANAGED_*_LABELS` set rather than issuing add-only `POST /labels` calls.
- **Shared issue actions & async subprocesses**: Apply `invalid` + comment + `not_planned` closures through `close-invalid-issue.cjs`, share form/label helpers via `issue-parsing.cjs`, and use async `child_process.execFile` (not `execFileSync`) in scripts tested against in-process `node:http` servers.

## Naming & scope

- **camelCase**: Use `camelCase` for plugin variables, properties, methods, and function parameters. Fields on type aliases that mirror external JSON/API/RSC schemas (e.g., `chapter_number`, `published_at`) are exempt.
- **Focused changes**: Reuse parsing helpers and patterns from nearby plugins or templates instead of introducing repo-wide abstractions for a single site.

## Pull requests & commits

- Keep unrelated files and generated artifacts (`.js/`, `.dist/`, `plugins/<language>/*[*].ts`, `broken-sites-report.json`, `.env`) out of commits.
- Edit `.github/scripts/blank_report_issue.yml` rather than the generated `.github/ISSUE_TEMPLATE/report_issue.yml`.
- In PR descriptions, document live-check results (`check:plugin`) and reference related issues (e.g., `Closes #123`).
- Use Conventional Commits: `<type>(<scope>): <imperative description>` (e.g., `fix(english/penguinsquad): restore Next.js App Router scraper`). Include a `Co-Authored-By:` trailer or PR note when AI-assisted.
