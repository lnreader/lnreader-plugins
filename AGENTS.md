# AGENTS.md

## Navigation pointers

- `CODING_STANDARDS.md` — coding, plugin, multisrc migration, and PR review standards (consult during review and before adding/migrating plugins).
- `package.json` — authoritative scripts (`lint`, `format:check`, `build:compile`, `build:full`, `dev:start`, `check:plugin`, `check:sites`).
- `README.md`, `docs/quickstart.md`, `docs/docs.md`, `docs/testing.md`, `docs/plugin-template.ts` — setup, plugin API, live checker, and starter template.

## Repository map

- `plugins/<language>/*.ts`: standalone plugins (grouped by full language name).
- `plugins/multi/`: intrinsically multi-language or server-based plugins.
- `plugins/multisrc/<generator>/`: generator, template, `sources.json`, and custom assets (`plugins/<language>/*[*].ts` are disposable generated outputs).
- `public/static/src/<language-code>/<plugin-id>/`: 96x96 PNG icons (short language code, e.g. `en`).
- `src/types/plugin.ts`, `src/libs/`: canonical plugin interfaces and `@libs/*` runtime helpers.
- `src/`: React/Vite playground; `scripts/`: build, manifest, publishing, and live-check tooling.
- `BLACKLIST.json`: disallowed sources.

## Environment & package management

- Use Node.js 22+ locally (CI runs Node 20 and 24).
- Repo docs and CI use `npm` / `npm ci`; keep `package-lock.json` untouched unless dependencies change.
- Copy `.env.template` to `.env` only for local manifest serving; keep `.env` uncommitted.

## Key gotchas

- **Hermes runtime**: Plugins compile for ES5/Hermes/React Native — use `@libs/fetch` (not `@/lib/fetch`) and avoid Node/browser-only globals.
- **Finding multisrc plugins**: Search `plugins/multisrc/*/sources.json` by domain or ID; `plugins/<language>/` only holds generated `[generator]` files after `build:multisrc`.
- **Trailing slashes on migrated paths**: Multisrc generators such as Fictioneer produce `novelPath` values with trailing slashes (`novels/<slug>/`). Normalize leading and trailing slashes in `parseNovel` when migrating to standalone so existing library entries resolve cleanly.
- **Validation**: Choose checks from `package.json` proportionate to the change. For standalone plugins, run `eslint`, `prettier --check`, `build:compile`, and `check:plugin -- plugins/<language>/<plugin>.ts`. In `check:plugin`, `FAIL` requires investigation while `INCONCLUSIVE` usually indicates remote site blocking or downtime.
