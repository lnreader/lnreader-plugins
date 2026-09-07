# Testing Website Tutorial

A comprehensive guide to testing your LNReader plugins using the web interface.

## Getting Started

1. **Start the development server:**

   ```bash
   npm run dev:start
   ```

2. **Open your browser:**
   Navigate to [localhost:3000](http://localhost:3000)

3. **Select a plugin:**
   Use the dropdown in the top navigation bar to select the plugin you want to test.

## Features Overview

The testing website provides five tabs to test different plugin functions:

- **Popular** - Test `popularNovels()`, including its `Latest`/`Popular` toggle, page-by-page
  fetching, and filters (via the `Filters` button, when the plugin declares any)
- **Search** - Test `searchNovels()` with search queries
- **Parse Novel** - Test `parseNovel()` with a novel path. If the plugin sets `totalPages` (see
  [Pagination](./docs.md#pagination)), this tab also exercises `parsePage()` through
  Previous/Next/Fetch Page controls, and offers an "Export EPUB" button that fetches every
  page's chapters (via `parsePage`, when paginated) and each one's content (via `parseChapter`)
  into a downloadable EPUB file
- **Parse Chapter** - Test `parseChapter()` with a chapter path
- **Settings** - Playground-wide request configuration: the browser User-Agent (and whether to
  send it), extra cookies to attach to every request, and the fetch mode (Proxy/Node
  Fetch/Curl) used to reach the target site. This is a testing convenience for the playground
  itself, separate from a plugin's own [`pluginSettings`](./docs.md#pluginsettings)

## Pre-Submission Testing

Before submitting your plugin, verify that:

- All five tabs work without errors
- Multiple pages load correctly, for both `popularNovels` and, if implemented, `parsePage`
- Search returns accurate results
- Novel parsing extracts all metadata
- Chapter content is clean
- Filters work (if implemented)
- No console errors appear
- Paths are properly formatted
- Images load correctly

## Need Help?

- **Plugin Development:** See [docs.md](./docs.md) for API reference
- **Quick Start:** See [quickstart.md](./quickstart.md) for plugin creation
- **Pre-PR Check:** See [testing.md](./testing.md) for the required `npm run check:plugin` live check
- **Issues:** Create a [GitHub issue](https://github.com/LNReader/lnreader-plugins/issues/new)
- **Community:** Join us on [Discord](https://discord.gg/QdcWN4MD63)
