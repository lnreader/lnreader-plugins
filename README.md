# LNReader Plugins

<p>
<img alt="Total number of available plugins" src="https://raw.githubusercontent.com/LNReader/lnreader-plugins/plugins/v3.0.0/total.svg">
<img alt="Open plugin requests" src="https://img.shields.io/github/issues/lnreader/lnreader-plugins/Plugin%20Request?color=success&label=plugin%20requests">
<img alt="Open bug reports" src="https://img.shields.io/github/issues/lnreader/lnreader-plugins/Bug?color=red&label=bugs">
</p>

Community-driven plugin repository for [LNReader](https://github.com/LNReader/lnreader). This repository hosts plugins and manages related issues and requests.

## Quick Start

**Prerequisites:** Node.js >= 20 

```bash
npm install
npm run dev:start
```

## Documentation

- **[Quick Start Guide](./docs/quickstart.md)** - Create your first plugin
- **[Plugin Development](./docs/docs.md)** - Complete API reference
- **[Testing Guide](./docs/website-tutorial.md)** - Test plugins using the web interface
- **[Komga Plugin](./docs/komga-plugin.md)** - Self-hosted server integration

## Testing Methods

### Web Interface

```bash
npm run dev:start
```

Open [localhost:3000](http://localhost:3000) to test plugins interactively. See the [testing guide](./docs/website-tutorial.md) for details.

### Mobile App

**From GitHub (Automated):**

Push your changes to the `master` branch. The [GitHub Action](./.github/workflows/publish-plugins.yml) automatically builds and publishes plugins to the `plugins` branch.

Add your repository URL to the app:

```
https://raw.githubusercontent.com/<username>/<repo>/plugins/<tag>/.dist/plugins.min.json
```

**From GitHub (Manual):**

There is a npm command that will push your current code to the same link as above:

```
npm run publish:plugins
```
Or on windows
```
npm run publish:plugins:windows
```

**From Localhost:**

```bash
npm run serve:dev
```

Add `http://10.0.2.2/.dist/plugins.min.json` (Android emulator) to the app. Requires `.env` configuration (see `.env.template`).

## Disclaimer

The developers are not affiliated with any content providers. If you are a non-aggregator website owner, you may request plugin removal via [Discord](https://discord.gg/QdcWN4MD63) or by [creating an issue](https://github.com/LNReader/lnreader-plugins/issues/new). Removed sites are added to the [blacklist](BLACKLIST.json).
