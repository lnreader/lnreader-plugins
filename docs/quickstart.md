# Quick start

1. [Requirements](#requirements)
2. [Single plugin guide](#quick-guide)
3. [Multi-src guide](#creating-multi-src-plugins)

### Requirements

-   [git](https://git-scm.com/doc/ext) basics
-   Typescript or Javascript basics
-   Node >=22
-   Installing the dependencies with `npm i`

### Guide

1. Create plugin script in `/plugins` [<span style="font-size: 0.8rem;">(learn more)</span>](#creating-plugin-script)
2. Copy code from [plugin-template.ts](./plugin-template.ts)
3. Start coding [<span style="font-size:0.8rem">(documentation)</span>](./docs.md)

#### Creating plugin script

1. Remember to create your plugin inside the language folder corresponding to the language of the novels
2. File should have the `.ts` extension
   Example `plugins/english/nobleMTL.ts`
3. Add an icon to `public/static/src/<lang>/<plugin-name>/icon.png`

> [!WARNING]
> Icon size should be 96x96px!

### Creating multi-source plugins
