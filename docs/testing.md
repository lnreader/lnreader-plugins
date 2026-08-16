# Testing your plugin

`tsc`, ESLint, and Prettier all check that your plugin _compiles_. None of them can tell you
whether it actually returns novels, chapters, or search results from the real site — plugins fail
in ways the compiler can't see, because the wiki/site content they scrape has no schema: an empty
chapter list, a chapter body that's actually a "back to top" nav page, search results leaking
pages in the wrong language, and so on.

## `npm run check:plugin`

Bundles your plugin with esbuild the same way the production build does, then runs it against the
live site — calling `popularNovels`, `searchNovels`, `parseNovel`, and `parseChapter` in sequence,
using your plugin's own default filter values (the same values the app would send).

```sh
npm run check:plugin -- plugins/english/yourPlugin.ts
```

You can check multiple plugins in one run:

```sh
npm run check:plugin -- plugins/english/yourPlugin.ts plugins/english/anotherPlugin.ts
```

Each step reports one of three outcomes:

- **PASS** — got a plausible result (non-empty novel list, a chapter body over ~200 characters,
  etc).
- **FAIL** — the plugin ran but returned something wrong (empty results, a novel with no chapters,
  a suspiciously short chapter body, or a thrown error that isn't network-related). This is what
  you're looking for before opening a PR.
- **INCONCLUSIVE** — the site itself was unreachable, timed out, or returned a Cloudflare-style
  block during this run. Not a plugin bug; re-run later or check the site manually.

## CI

Any PR that touches a file under `plugins/**/*.ts` (excluding multisrc-generated files) runs this
same check automatically against just the changed plugins, and posts a summary comment. The check
only fails the PR on a genuine `FAIL` — `INCONCLUSIVE` results (a site being briefly down) never
block a merge.

You can also trigger it manually against any plugin path from the Actions tab
(`Plugin Live Check` → `Run workflow`), which is useful for re-checking an existing plugin after
its target site changes layout.

## See also

`check:plugin` catches wrong/missing data automatically, but it's not a substitute for actually
looking at the output. See the [website tutorial](./website-tutorial.md) for testing your plugin
interactively in the browser — useful for spot-checking filters, pagination, and chapter
formatting by eye before opening a PR.
