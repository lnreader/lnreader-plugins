# Quick start

1. [Requirements](#requirements)
2. [Single plugin guide](#single-plugin-guide)
3. [Multi-source guide](#creating-multi-source-plugins)
4. [Testing your plugin](./testing.md)
3. [Dev Containers / Codespaces](#dev-containers--codespaces)
3. [VScode](#vscode)

### Requirements

- [git](https://git-scm.com/doc/ext) basics
- TypeScript or JavaScript basics
- Node.js >= 22
- Install the dependencies with `npm i`

### Single plugin guide

1. Create your plugin script in `/plugins` [<span style="font-size: 0.8rem;">(learn more)</span>](#creating-plugin-script)
2. Copy the code from [plugin-template.ts](./plugin-template.ts)
3. Start coding [<span style="font-size:0.8rem">(documentation)</span>](./docs.md)
4. Run `npm run check:plugin -- plugins/<lang>/yourPlugin.ts` before opening a PR — see [Testing your plugin](./testing.md)

#### Creating plugin script

1. Remember to create your plugin inside the language folder corresponding to the language of the novels.
   These folders are spelled out in full, e.g. `plugins/english/`, `plugins/portuguese/` (see the
   existing folders under `plugins/` for the full list).
2. The file should have the `.ts` extension.
   Example: `plugins/english/nobleMTL.ts`
3. Add a 96x96px icon at `public/static/src/<lang>/<plugin-name>/icon.png`, then reference it from
   your plugin as `icon = 'src/<lang>/<plugin-name>/icon.png'` (without the `public/static` prefix
   — see [PluginBase::icon](./docs.md#pluginbaseicon)).

Recommend checking that the site doesn't have a wordpress theme, as it may be a simple addition to a multisrc config.

   > [!WARNING]
   > The `<lang>` folder here uses the **short** language code (`en`, `pt-br`, `fr`, ...), which is
   > different from the full language name used for the `plugins/<lang>/` folder in step 1. Check
   > the existing folders under `public/static/src/` for the codes already in use.

### Creating multi-source plugins

Some sites run on the same off-the-shelf CMS/theme (WordPress themes, Madara, etc.), so instead of
writing a near-identical plugin by hand for each one, this repo generates them from a shared
template. That system lives in `plugins/multisrc/`, where each subfolder is one **generator** —
for example `plugins/multisrc/lightnovelwp/` covers sites using the LightNovel WordPress theme, and
`plugins/multisrc/madara/` covers sites using the Madara theme.

**Adding a new source to an existing generator** (the common case — check `plugins/multisrc/` first
to see if a generator already matches your target site's CMS):

1. Open the generator's folder, e.g. `plugins/multisrc/lightnovelwp/`, and add an entry for your
   site to its `sources.json`.
2. Run `npm run build:multisrc` to materialize the actual plugin file(s) into
   `plugins/<lang>/<name>[<generator>].ts`.
3. Follow the generator's own `README.md` for anything specific to it — icon handling, available
   filters, and `sources.json` fields differ between generators (compare
   `plugins/multisrc/lightnovelwp/README.md` and `plugins/multisrc/madara/README.md` for examples).
4. [Test your plugin](./testing.md) the same way you would a single-source one.

**Adding a new generator** (only if no existing generator's CMS matches your target site) is a
larger undertaking — read an existing generator's `generator.js` and `template.ts` first to see the
shape expected by `plugins/multisrc/generate-multisrc-plugins.js`, which drives all generators via
`npm run build:multisrc`.
TBD, but in the meantime, you can check out `/plugins/multisrc` for examples!

#### Adding a multi-source source
You edit `sources.json` inside the relevant `/plugins/multisrc/*/` folder for your website template/theme.

Example
```json
  {
    "id": "totallyrealnovel",
    "sourceSite": "https://veryreal.example.com/",
    "sourceName": "TotallyRealNovel",
    "options": {
      "useNewChapterEndpoint": true
    }
  },
  ```

### Dev Containers / Codespaces
You can use the VScode [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension to spin up a docker container on your local machine with a valid dev environment, if you prefer. Do note a docker container requires more resources than setting up the environment properly, but can be simpler and more consistent.

Codespaces will *mostly* work, but **it's not currently possible to fetch any pages from dev playground.** This is due to CORS, but even with that bypassed, the codespace is hosted in a datacenter, which is often IP blocked.

Either will automatically run `npm install`

### VScode

#### Build
The multisrc generators generate `.ts` files inside the relevant language directories, and you will need these during local testing. It is setup within VScode as build. `Terminal > Run Build Task` will trigger it.

#### Debug/Testing

You can `Run > Start Debugging` or use the Run and Debug panel to launch vite, which will trigger the builds, and then launch vite the same as `npm run dev:start` would have. It will attach the debugger, to vite, which is probably less helpful than the browser's built in debugging tools and console.

Vite will automatically reload when you save files, so you can edit the relevant `.ts` file, save it, and test immediately with results. The only exception is multisrc which must be rebuilt/regenerated.

#### Extensions

Recommended extensions for this repo have been set to pop up in the window.
