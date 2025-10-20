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

The testing website provides five main sections to test different plugin functions:

- **Headers** - Configure custom HTTP headers
- **Popular Novels** - Test `popularNovels()` with pagination and filters
- **Search Novels** - Test `searchNovels()` with search queries
- **Parse Novel** - Test `parseNovel()` with a novel URL
- **Parse Chapter** - Test `parseChapter()` with a chapter URL

## Pre-Submission Testing

Before submitting your plugin, verify that all five sections work without errors, multiple pages load, search returns accurate results, novel parsing extracts all metadata, chapter content is clean, filters work (if implemented), no console errors appear, URLs are properly formatted, and images load correctly.

## Need Help?

- **Plugin Development:** See [docs.md](./docs.md) for API reference
- **Quick Start:** See [quickstart.md](./quickstart.md) for plugin creation
- **Issues:** Create a [GitHub issue](https://github.com/LNReader/lnreader-plugins/issues/new)
- **Community:** Join us on [Discord](https://discord.gg/QdcWN4MD63)
