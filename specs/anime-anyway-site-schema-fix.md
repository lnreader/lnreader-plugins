# Anime Anyway site-schema fix

## Requirements & Goals

- Restore Anime Anyway support in LNReader after the site changed its volume-page payload shape.
- Allow the new `Nibunnoinochi` volume and its first chapter to appear, open, and render in LNReader.
- Preserve compatibility with existing Anime Anyway volumes and the previous payload shape where practical.
- Keep the adapter's existing one-novel-per-volume catalogue behavior.

## Inputs, Outputs & Behavior

- Read the homepage `__NEXT_DATA__` catalogue, including the current `displayTitle` and `releaseDate` fields when present.
- Read volume pages from either the legacy `pageProps.vol` location or the current `pageProps.volumeProps.vol` location.
- Use the series title and volume display title to create a distinct, searchable LNReader novel name. Continue recognizing legacy `Year N Vol. M` titles.
- Use the normalized volume payload to populate the novel cover, synopsis, status, and ordered chapter list.
- Continue reading chapter content from `pageProps.chapter` and resolving chapter URLs using the site's real path format.
- Use homepage release dates for latest sorting and fall back to volume-page release dates when the homepage omits them.

## Edge Cases & Error Handling

- A missing or malformed volume payload must keep the existing unavailable-novel response rather than throwing.
- A volume with no `displayTitle` must still use its legacy title correctly.
- A legacy page with only `pageProps.vol` must continue to parse.
- Missing covers, synopsis, release dates, or chapter arrays must use the adapter's existing defaults and empty results.
- Unknown Portable Text block types must remain safely ignored.
- The adapter must not merge distinct volumes or construct synthetic paths.

## Acceptance Criteria

- [ ] `popularNovels(1, ...)` includes `Nibunnoinochi` Volume 1 with path `nibunnoinochi/v1` and a useful distinct name.
- [ ] `searchNovels('Nibunnoinochi', 1)` returns the new volume.
- [ ] `parseNovel('nibunnoinochi/v1')` returns the new volume name, cover, synopsis, and one chapter named `Prologue: The Place Where I’m to Die`.
- [ ] `parseChapter('nibunnoinochi/v1/prologue')` returns rendered content longer than the live-check minimum.
- [ ] An existing volume such as `y3v4` still returns its full chapter list and latest sorting remains functional.
- [ ] Type-checking, linting/format checks, and the live plugin check pass.
- [ ] The final change is committed with a conventional commit message and prepared for the repository's normal pull-request workflow.
