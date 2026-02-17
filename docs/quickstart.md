# Quick start

1. [Requirements](#requirements)
2. [Single plugin guide](#guide)
3. [Multi-src guide](#creating-multi-source-plugins)
3. [Dev Containers / Codespaces](#dev-containers--codespaces)
3. [VScode](#vscode)

### Requirements

-   [git](https://git-scm.com/doc/ext) basics
-   Typescript or Javascript basics
-   Node >=20
-   Installing the dependencies with `npm i`

### Guide

1. Create plugin script in `/plugins` [<span style="font-size: 0.8rem;">(learn more)</span>](#creating-plugin-script)
2. Copy code from [plugin-template.ts](./plugin-template.ts)
3. Start coding [<span style="font-size:0.8rem">(documentation)</span>](./docs.md)

#### Creating plugin script

1. Remember to create your plugin inside the language folder corresponding to the language of the novels
Recommend checking that the site doesn't have a wordpress theme, as it may be a simple addition to a multisrc config.
2. File should have the `.ts` extension
   Example `plugins/english/nobleMTL.ts`
3. Add an icon to `icons/src/<lang>/<plugin-name>/icon.png`

> [!WARNING]
> Icon size should be 96x96px!

### Creating multi-source plugins
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
