## Documentation for LNReader plugins

- [Getting started](#getting-started)
- [Plugin bundle API](#plugin-bundle-api)
  - [PluginBase](#pluginbase)
  - [NovelItem](#novelitem)
  - [SourceNovel](#sourcenovel)
  - [ChapterItem](#chapteritem)
  - [Filters](#filters)
  - [PluginSettings](#pluginsettings)
  - [NovelStatus](#novelstatus)
  - [Pagination](#pagination)
  - [Using Cheerio](#using-cheerio)
  - [Custom fetching functions](#custom-fetching-functions)
  - [Other libraries](#other-libraries)
- [Repository manifest & install metadata](#repository-manifest--install-metadata)

---

### Getting started

1. Pick the language folder your source belongs to under `plugins/<language>/` (full language name,
   e.g. `plugins/english/`), and create a `.ts` file there — e.g. `plugins/english/myNovelSite.ts`.
2. Copy [`docs/plugin-template.ts`](./plugin-template.ts) into that file as a starting point. It
   already imports the pieces most plugins need (`fetchApi`/`fetchText`, `Plugin` namespace,
   `Filters`, `cheerio`, `defaultCover`, `NovelStatus`) and stubs out the required methods.
3. Add a 96x96px icon at `public/static/src/<short-lang-code>/<plugin-id>/icon.png` (note: this
   folder uses the **short** language code, e.g. `en`, not the full folder name from step 1), then
   set `icon = 'src/<short-lang-code>/<plugin-id>/icon.png'` on your class — see
   [PluginBase::icon](#pluginbaseicon) and [Repository manifest & install metadata](#repository-manifest--install-metadata)
   for what happens to that path at publish time.
4. Fill in `popularNovels`, `parseNovel`, `parseChapter`, and `searchNovels` against the target
   site — the reference sections below cover the shape each one returns. [Using Cheerio](#using-cheerio)
   and [Custom fetching functions](#custom-fetching-functions) cover the two building blocks most
   plugins need for that.
5. Test locally with `npm run dev:start`, which launches a browser playground at
   `http://localhost:3000` where you can run your plugin's functions against the real site. Before
   opening a PR, run `npm run check:plugin -- plugins/<lang>/yourPlugin.ts` (see
   [`docs/testing.md`](./testing.md)) — this is the same live-site check CI runs.

For CMS-templated sites (WordPress themes, Madara, etc.) and any other repo-specific workflow
detail (multi-source generators, icon conventions, live-check tooling), see
[`docs/quickstart.md`](./quickstart.md).

---

## Plugin bundle API

This is the contract your plugin file itself implements: a default-exported instance of a class
satisfying `Plugin.PluginBase`, imported via

```ts
import { Plugin } from '@/types/plugin';
```

### PluginBase

PluginBase is a base class for all plugins.

```ts
class ExamplePlugin implements Plugin.PluginBase {}
```

| Field                                                        | Required | Description                                                 |
| ------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| [id](#pluginbaseid)                                            | yes      | Plugin ID                                                     |
| [name](#pluginbasename)                                        | yes      | Plugin Name                                                   |
| [icon](#pluginbaseicon)                                        | yes      | Path to the plugin's icon, converted to `iconUrl` at publish time — see [Repository manifest](#repository-manifest--install-metadata) |
| [site](#pluginbasesite)                                        | yes      | Plugin site link                                              |
| [version](#pluginbaseversion)                                  | yes      | Plugin version                                                |
| [imageRequestInit](#pluginbaseimagerequestinit)                | no       | Plugin Image Request Init                                     |
| [filters](#pluginbasefilters)                                  | no       | [Filter definition](#filter-definition-object) object          |
| [pluginSettings](#pluginbasepluginsettings)                    | no       | [Plugin settings](#pluginsettings) object                      |
| [webStorageUtilized](#pluginbasewebstorageutilized)            | no       | Flag for plugins that need `localStorage`/`sessionStorage`     |
| [customJS](#pluginbasecustomjs)                                | no       | Path to a custom JS file, converted to a manifest URL — see [Repository manifest](#repository-manifest--install-metadata) |
| [customCSS](#pluginbasecustomcss)                              | no       | Path to a custom CSS file, converted to a manifest URL — see [Repository manifest](#repository-manifest--install-metadata) |
| [popularNovels(page, options)](#pluginbasepopularnovels)       | yes      | Novel list getter                                              |
| [parseNovel(path)](#pluginbaseparsenovel)                      | yes      | Novel info and chapter list getter                             |
| [parseChapter(path)](#pluginbaseparsechapter)                  | yes      | Chapter text getter                                            |
| [searchNovels(searchTerm, page)](#pluginbasesearchnovels)      | yes      | Novel searching getter                                         |
| [resolveUrl(path, isNovel)](#pluginbaseresolveurl)             | no       | Helper that turns a novel/chapter path into a full URL          |
| [parsePage(novelPath, page)](#pagination)                      | no       | Chapter-list-by-page getter, for novels too large to list in one `parseNovel` call — see [Pagination](#pagination) |

#### PluginBase::id

Unique ID of your plugin

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  id = 'templateID';
  ...
}
```

#### PluginBase::name

The name of your plugin that is shown in-app

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  name = 'template Plugin';
  ...
}
```

#### PluginBase::icon

The path to your plugin's icon, relative to `public/static` (do **not** include the
`public/static` prefix itself). The file must actually live at `public/static/<icon>` in this
repo.

This is an authoring-time path only — the app itself never reads `icon` or `public/static`
directly. At publish time, `scripts/build-plugin-manifest.js` reads this field off your compiled
plugin and turns it into an absolute `iconUrl` in the published manifest, which is what the app
actually fetches and displays. See [Repository manifest & install metadata](#repository-manifest--install-metadata).

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  icon = 'src/en/templateplugin/icon.png';
  ...
}
```

> [!WARNING]
> Icons should be 96x96px

#### PluginBase::site

The url to the plugin's site

###### Example

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  site = 'https://example.com';
  ...
}
```

#### PluginBase::version

Version of your plugin formatted according to [semver2.0 spec](https://semver.org/) i.e. `<major>.<minor>.<patch>`

Where

- `patch` increments on small fixes that fix the plugin (like site changed a selector, filter had a typo etc.)
- `minor` increments on fixes that improve the plugin (like adding/removing filters, adding search options etc.)
- `major` increments on fixes that fix the major issues with the plugin (like changing site link)

###### Example

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  version = '1.0.0';
  ...
}
```

#### PluginBase::imageRequestInit

The init for request to obtain images

Used if images failed to load due to site's protection

###### Example

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: 'https://example.com',
    },
  };
  ...
}
```

#### PluginBase::webStorageUtilized

Optional flag that tells the app your plugin needs access to `localStorage`/`sessionStorage`
(see [Other libraries](#other-libraries)). Leave it unset if your plugin only uses `storage` for
[plugin settings](#pluginsettings).

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  webStorageUtilized = true;
  ...
}
```

#### PluginBase::customJS

Path to a custom JavaScript file, relative to `public/static` (same convention as
[icon](#pluginbaseicon)). Used by some multi-source templates to run extra JS against the parsed
page (e.g. stripping a site's injected copyright notice).

Like `icon`, this is an authoring-time path: `scripts/build-plugin-manifest.js` turns it into an
absolute URL in the published manifest, and the app downloads that URL into the plugin's private
storage the first time the plugin is installed or updated — see
[Repository manifest & install metadata](#repository-manifest--install-metadata).

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  customJS = 'src/en/templateplugin/customJS.js';
  ...
}
```

#### PluginBase::customCSS

Path to a custom CSS file, relative to `public/static` (same convention as
[icon](#pluginbaseicon)), applied when rendering the chapter/novel page in-app.

Same publish-time/install-time handling as [customJS](#pluginbasecustomjs) — see
[Repository manifest & install metadata](#repository-manifest--install-metadata).

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  customCSS = 'src/en/templateplugin/customCSS.css';
  ...
}
```

#### PluginBase::filters

A [Filter definition](#filter-definition-object) object that holds filters used in the
[popularNovels](#pluginbasepopularnovels) function. `Filters` and `FilterTypes` come from
`@libs/filterInputs`:

```ts
import { FilterTypes, Filters } from '@libs/filterInputs';
```

See [Filters](#filters) for the full type reference.

###### Example

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  filters = {
    order: {
      label: 'Order',
      options: [
        { label: 'Popular', value: '' },
        { label: 'Newest', value: 'newest' },
      ],
      type: FilterTypes.Picker,
      value: '',
    },
    status: {
      label: 'Status',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'Completed', value: 'completed' },
      ],
      type: FilterTypes.Picker,
      value: '',
    },
  } satisfies Filters;
  ...
}
```

#### PluginBase::popularNovels

Function that is used to get the (filtered) list of novels from the front page of the site

```ts
async popularNovels(
        page: number,
        options: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]>
```

See [Using cheerio](#using-cheerio) for more information on how to parse HTML documents

###### Parameters

- `page` current page to fetch
- `options` [PopularNovelsOptions](#pluginbasepopularnovelsoptions)

###### Returns

`NovelItem[]` An array of filtered main-page [NovelItems](#novelitem)

###### Example

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  async popularNovels(
    page: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    if (options.filters.status.value === 'ongoing') {
      novels.push({
        name: 'Novel1',
        path: '/novel1',
        cover: defaultCover,
      });
    }
    return novels;
  }
}
```

##### PluginBase::PopularNovelsOptions

This type is used for getting the options of the [popularNovels](#pluginbasepopularnovels) function

- <span id='popularnovelsoptions-showlatestnovels'></span>`showLatestNovels: boolean` flag set when opened with the `Latest` button

- <span id='popularnovelsoptions-filters'></span>`filters: FilterToValues<typeof filters>` object containing all selected filter values. [More about Filters](#filters)

#### PluginBase::parseNovel

Function that is used to get the information about a particular novel and the list of its chapters

```ts
async parseNovel(novelPath: string): Promise<Plugin.SourceNovel>
```

See [Using cheerio](#using-cheerio) for more information on how to parse HTML documents

###### Parameters

- `novelPath` value from [NovelItem::path](#novelitempath)

###### Returns

`SourceNovel` Novel information and chapter list as [SourceNovel](#sourcenovel) object

> [!CAUTION]
> [SourceNovel::path](#sourcenovelpath) should be the same value as [NovelItem::path](#novelitempath) provided as parameter!

###### Example

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'test',
      artist: 'none',
      author: 'none',
      cover: defaultCover,
      genres: 'Isekai, Neverland',
      status: NovelStatus.Completed,
      summary: '',
      chapters: [],
    };
    const chapter: Plugin.ChapterItem = {
      name: '',
      path: '',
      releaseTime: '',
      chapterNumber: 0,
    };
    novel.chapters.push(chapter);
    return novel;
  }
  ...
}
```

#### PluginBase::parseChapter

Function that is used to get the text content of a particular chapter

```ts
async parseChapter(chapterPath: string): Promise<string>
```

See [Using cheerio](#using-cheerio) for more information on how to parse HTML documents

###### Parameters

- `chapterPath` value from [ChapterItem::path](#chapteritempath)

###### Returns

`string` HTML content of the chapter

###### Example

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  async parseChapter(chapterPath: string): Promise<string> {
    return '<h1>No chapter here</h1>';
  }
  ...
}
```

#### PluginBase::searchNovels

Function that is used to find novels in the source

```ts
async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]>
```

See [Using cheerio](#using-cheerio) for more information on how to parse HTML documents

###### Parameters

- `searchTerm` the search term
- `pageNo` search page number

###### Returns

`NovelItem[]` An array of found [NovelItems](#novelitem)

###### Example

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    return novels;
  }
}
```

#### PluginBase::resolveUrl

Optional helper that turns a novel or chapter `path` into a full, requestable URL. It isn't
required by the interface, but most plugins define one to avoid repeating
`this.site + '/...'` string concatenation in every function.

```ts
resolveUrl?(path: string, isNovel?: boolean): string;
```

###### Example

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/novel/' : '/chapter/') + path;
}
```

---

### NovelItem

It is an object representing information on how to store/access the novel

| Field                             | Type        | Required | Description                                             |
| ---------------------------------- | ----------- | -------- | --------------------------------------------------------- |
| <p id="novelitemid">id</p>         | `undefined` | yes      | Reserved for the app's internal use — always assign the literal value `undefined`, never a real id, from plugin code |
| <p id="novelitempath">path</p>    | `string`    | yes      | The relative path to the novel                            |
| <p id="novelitemname">name</p>    | `string`    | yes      | The name of the novel shown in the library                 |
| <p id="novelitemcover">cover</p>  | `string`    | no       | URL to novel's cover                                        |

#### Default cover

You can use the default `Cover not available` cover by importing

```ts
import { defaultCover } from '@libs/defaultCover';
```

---

### SourceNovel

`SourceNovel` extends [NovelItem](#novelitem), so `id`, `path`, `name`, and `cover` behave the same
way here as they do there.

| Field    | Type                                | Required | Description                                                                |
| -------- | ------------------------------------ | -------- | ----------------------------------------------------------------------------- |
| <p id="sourcenovelpath">path</p> | `string`             | yes      | Must match the [NovelItem::path](#novelitempath) passed into `parseNovel`      |
| name     | `string`                             | yes      | The novel's title                                                             |
| cover    | `string`                             | no       | URL to the novel's cover                                                       |
| genres   | `string`                             | no       | Comma-separated genre list, e.g. `"Action,Fantasy,Romance"`                     |
| summary  | `string`                             | no       | The novel's synopsis/description                                               |
| author   | `string`                             | no       |                                                                                 |
| artist   | `string`                             | no       |                                                                                 |
| status   | [NovelStatus](#novelstatus)          | no       | See [NovelStatus](#novelstatus) for the standard values                        |
| rating   | `number`                             | no       | Rating out of 5, as a float                                                    |
| chapters | [ChapterItem](#chapteritem)`[]`      | yes      | The novel's chapter list. If the novel is paginated, return the first page's chapters here and see [Pagination](#pagination) |
| totalPages | `number`                            | no       | Total number of chapter-list pages, for paginated novels — see [Pagination](#pagination) |

---

### ChapterItem

| Field         | Type                     | Required | Description                                                     |
| ------------- | ------------------------ | -------- | ----------------------------------------------------------------- |
| name          | `string`                 | yes      |                                                                     |
| path          | `string`                 | yes      |                                                                     |
| releaseTime   | `string`                 | no       | `"YYYY-MM-DD"` or an ISO date string                               |
| chapterNumber | `number`                 | no       |                                                                     |
| page          | `string`                 | no       | Only used for novels without pages (see [Pagination](#pagination)) |
| scanlator     | `string` or `string[]`   | no       | Name(s) of the scanlation/translation group(s)                    |

### Filters

`Filters` and `FilterTypes` are not in the `Plugin` namespace and are from `@libs/filterInputs` file:

```ts
import { FilterTypes, Filters } from '@libs/filterInputs';
```

There are 2 main objects when using filters:

- [Filter definition](#filter-definition-object) object
- [FilterValues](#filterValue) object

#### Filter definition object

This is the user-defined object that defines strictly what filters are available in the "filter" menu in app.
Every property of this object is a different filter. The key of the object is the name that will be used to reference this filter's value in the [FilterValues](#filtervalues-object) object

```ts
filters = {
  order: {<FilterProperties>},
} satisfies Filters;
// accessible in popularNovels as
options.filters.order;
```

> [!CAUTION]
> Do not forget to add `satisfies Filters` after the Filter definition object!

##### FilterProperties

| Name    | Type                         | Required      | Description                                                        |
| ------- | ---------------------------- | ------------- | ------------------------------------------------------------------ |
| label   | `string`                     | yes           | in-app label                                                       |
| type    | `FilterTypes`                | yes           | type of the filter                                                 |
| value   | [check types](#filter-types) | yes           | Default value for this filter and the starting filter state in-app |
| options | [check types](#filter-types) | in some types | The options available in the given type                            |

###### Example

```ts
filters = {
  genre: {
    type: FilterTypes.CheckboxGroup,
    label: 'Genres',
    value: [],
    options: [
      { label: 'Isekai', value: 'isekai' },
      { label: 'Romance', value: 'romans' },
    ],
  },
} satisfies Filters;
```

##### Filter types

Types of filters supported. The `FilterTypes` enum values shown below are also the strings used to
serialize each filter's `type` (e.g. `FilterTypes.CheckboxGroup === 'Checkbox'`).

| FilterType                | Serialized as | Description                                                        | `value`                                                                      | `options`                                       |
| -------------------------- | -------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `Picker`                  | `'Picker'`     | A spinner for choosing one of the choices provided in `options`    | `string` the picked value                                                    | [Picker](#picker-options) options               |
| `TextInput`               | `'Text'`       | A filter allowing a free text input                                | `string` written value                                                       | N/A                                             |
| `Switch`                  | `'Switch'`     | A boolean switch                                                   | `boolean` state of the switch                                                | N/A                                             |
| `CheckboxGroup`           | `'Checkbox'`   | A grouping of checkboxes                                           | `string[]` array containing selected values                                  | [CheckboxGroup](#checkboxgroup-options) options |
| `ExcludableCheckboxGroup` | `'XCheckbox'`  | A grouping of checkboxes where each one can be marked as included or excluded (e.g. "must have this genre" vs. "must not have this genre") | [ExcludableCheckboxGroupValue](#excludablecheckboxgroupvalue-object) object | [CheckboxGroup](#checkboxgroup-options) options |

###### Picker options

```ts
options: [
  {
    label: 'default', // in-app label
    value: '', // in-code value
  },
  {
    label: 'Value ABC',
    value: 'abc',
  },
];
```

###### CheckboxGroup options

```ts
options: [
  {
    label: 'Value ABC', // in-app label
    value: 'abc', // in-code value
  },
  {
    label: 'Value DEF',
    value: 'def',
  },
];
```

#### FilterValues object

It is an object used inside of `popularNovels` that contains selected values for all filters defined in the [Filter definition](#filter-definition-object) object.
The keys of the filter values correspond to Filter definition keys

```ts
// Filter definition object
filters = { abc: {} } satisfies Filters;

// then
options.filters; // FilterValues
options.filters.abc; // FilterValue for abc filter
```

##### FilterValue

Properties of FilterValue:

- `type: FilterType` type of the filter
- `value` value dependent on [FilterTypes](#filter-types)

```ts
options.filters.abc.value; // value of the filter
options.filters.abc.type; // type of the filter
```

###### ExcludableCheckboxGroupValue object

```ts
{
  include?: string[]; // values of the checkboxes marked as included
  exclude?: string[]; // values of the checkboxes marked as excluded
}
```

---

### PluginSettings

Plugin settings allow plugins to define user-configurable options that are displayed in the app's settings UI. These settings are persistent and can be accessed within the plugin code.

#### PluginBase::pluginSettings

A user-defined object that defines configurable settings for the plugin. Each property of this object is a different setting that will be displayed in the app's settings UI.

```ts
pluginSettings = {
  settingKey: {
    value: '',
    label: 'Setting Label',
    type: 'Text', // optional, defaults to 'Text'
  },
};
```

##### Setting Properties

The shape of a setting depends on its `type` — see [Setting Types](#setting-types) below for the
`value`/`options` each one requires.

| Name    | Type                              | Required      | Description                                    |
| ------- | ---------------------------------- | -------- | ---------------------------------------------- |
| value   | depends on `type`, see below       | yes      | Default value for this setting                 |
| label   | `string`                           | yes      | Display label shown in the app's settings UI    |
| type    | `'Text' \| 'Switch' \| 'Select' \| 'CheckboxGroup'` | no | Type of the setting UI component (see below) |
| options | `{ label: string; value: string }[]` | for `Select`/`CheckboxGroup` | The choices shown for that setting |

##### Setting Types

Four setting types are supported:

| Type            | Description                                       | UI Component | `value` type                            |
| ---------------- | -------------------------------------------------- | ------------- | ---------------------------------------- |
| `Text`           | A text input field (default if type is omitted)     | TextInput     | `string`                                 |
| `Switch`         | A boolean toggle switch                             | SwitchItem    | `boolean`                                |
| `Select`         | A single choice from a dropdown menu                | Menu          | `string` — must match one option's `value` |
| `CheckboxGroup`  | Multiple choices toggled independently              | Checkbox list | `string[]` — the selected option values    |

`Select` and `CheckboxGroup` also require an `options: { label: string; value: string }[]` array,
the same shape as [Picker options](#picker-options)/[CheckboxGroup options](#checkboxgroup-options)
for filters.

> [!NOTE]
> If `type` is not specified, the setting defaults to `Text` type and will be rendered as a TextInput.

##### Accessing Settings Values

Settings values are stored and can be accessed using the `storage` utility:

```ts
import { storage } from '@libs/storage';

// Get a setting value
const settingValue = storage.get('settingKey');

// Set a setting value
storage.set('settingKey', 'newValue');
```

> [!WARNING]
> The settings screen writes directly to `storage` — it does not reload or re-instantiate your
> plugin. If you read a setting as a **class-field initializer** (as in the examples below), that
> field is only evaluated once, when the plugin is loaded, so it won't reflect a value the user
> changes afterwards until the plugin is reloaded (e.g. on app restart or plugin update). If your
> plugin needs to react to a changed setting immediately, call `storage.get('settingKey')` **inside**
> the method that needs it instead of caching it in a field.

##### Examples

###### Example 1: Switch Setting

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  hideLocked = storage.get('hideLocked');

  pluginSettings = {
    hideLocked: {
      value: false,
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    // Use the setting value
    if (this.hideLocked) {
      // Filter out locked chapters
    }
    ...
  }
  ...
}
```

###### Example 2: Text Settings

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  site = storage.get('url');
  email = storage.get('email');
  password = storage.get('password');

  pluginSettings = {
    url: {
      value: '',
      label: 'URL',
      // type: 'Text' is optional
    },
    email: {
      value: '',
      label: 'Email',
      type: 'Text',
    },
    password: {
      value: '',
      label: 'Password',
      // type defaults to 'Text' if omitted
    },
  };

  async makeRequest(url: string): Promise<string> {
    return await fetchApi(url, {
      headers: {
        Authorization: `Basic ${btoa(this.email + ':' + this.password)}`,
        Referer: this.site,
      },
    }).then(res => res.text());
  }
  ...
}
```

###### Example 3: Select and CheckboxGroup Settings

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  pluginSettings = {
    quality: {
      value: 'high',
      label: 'Image quality',
      type: 'Select',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'High', value: 'high' },
      ],
    },
    excludedTags: {
      value: [],
      label: 'Excluded tags',
      type: 'CheckboxGroup',
      options: [
        { label: 'Mature', value: 'mature' },
        { label: 'Adaptation', value: 'adaptation' },
      ],
    },
  };
  ...
}
```

---

### NovelStatus

`NovelStatus` is an enum of the standard values used for [SourceNovel::status](#sourcenovel). Using
it (instead of a raw string) is what lets the app group/filter novels by status consistently
across plugins.

```ts
import { NovelStatus } from '@libs/novelStatus';
```

| Member               | Value                 |
| --------------------- | ---------------------- |
| `Unknown`              | `'Unknown'`             |
| `Ongoing`              | `'Ongoing'`             |
| `Completed`            | `'Completed'`           |
| `Licensed`             | `'Licensed'`            |
| `PublishingFinished`   | `'Publishing Finished'` |
| `Cancelled`            | `'Cancelled'`           |
| `OnHiatus`             | `'On Hiatus'`           |
| `STUB`                 | `'STUB'`                |
| `Inactive`             | `'Inactive'`            |

`status` is typed as `NovelStatus`, not a free-form string — always assign one of the members
above (there's no fallback for other strings; pick `Unknown` if the source's status doesn't map
onto any of them).

---

### Pagination

Some sites split a novel's chapter list across multiple pages rather than returning it all from
`parseNovel`. For those, implement `parsePage` in addition to `parseNovel`:

```ts
parsePage?(novelPath: string, page: string): Promise<Plugin.SourcePage>;
```

- `SourceNovel::chapters` should hold the **first page** of chapters, and
  `SourceNovel::totalPages` should be set to the total number of pages.
- `parsePage` is called with the same `novelPath` and a `page` string (`ChapterItem::page`, if you
  set it) for every subsequent page the app needs, and should return that page's chapters:

```ts
type SourcePage = {
  chapters: Plugin.ChapterItem[];
};
```

###### Example

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'test',
      chapters: await this.parseChapterListPage(novelPath, '1'),
      totalPages: 5,
    };
    return novel;
  }

  async parsePage(
    novelPath: string,
    page: string,
  ): Promise<Plugin.SourcePage> {
    return { chapters: await this.parseChapterListPage(novelPath, page) };
  }

  private async parseChapterListPage(
    novelPath: string,
    page: string,
  ): Promise<Plugin.ChapterItem[]> {
    // fetch and parse the given page's chapter list
    return [];
  }
}
```

If your plugin doesn't paginate chapter lists, omit `parsePage`/`totalPages` entirely and just
return the full list from `parseNovel`.

---

### Using Cheerio

Most sites are scraped by fetching the page HTML and parsing it with [Cheerio](https://cheerio.js.org/),
a jQuery-like API for traversing/selecting elements server-side.

```ts
import { load as parseHTML } from 'cheerio';
```

A typical `popularNovels` implementation fetches a listing page, loads it into Cheerio, and maps
each matching element to a [NovelItem](#novelitem):

```ts
async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
  const novels: Plugin.NovelItem[] = [];

  const body = await fetchApi(`${this.site}/novels?page=${page}`).then(res =>
    res.text(),
  );
  const $ = parseHTML(body);

  $('li.novel-item').each((i, el) => {
    const name = $(el).find('.title').text().trim();
    const path = $(el).find('a').attr('href')?.replace(this.site, '');
    const cover = $(el).find('img').attr('src');

    if (!path) return;
    novels.push({ name, path, cover });
  });

  return novels;
}
```

A similar pattern for `parseNovel`, pulling structured fields (author, genres, status) plus a
chapter list off the novel page:

```ts
async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
  const body = await fetchApi(this.site + novelPath).then(res => res.text());
  const $ = parseHTML(body);

  const novel: Plugin.SourceNovel = {
    path: novelPath,
    name: $('h1.novel-title').text().trim(),
    cover: $('.novel-cover img').attr('src'),
    author: $('.novel-author').text().trim(),
    genres: $('.novel-genres a')
      .map((i, el) => $(el).text().trim())
      .get()
      .join(','),
    summary: $('.novel-summary').text().trim(),
    status: $('.novel-status').text().includes('Ongoing')
      ? NovelStatus.Ongoing
      : NovelStatus.Completed,
    chapters: [],
  };

  $('ul.chapter-list li a').each((i, el) => {
    const chapterPath = $(el).attr('href')?.replace(this.site, '');
    if (!chapterPath) return;
    novel.chapters.push({
      name: $(el).text().trim(),
      path: chapterPath,
      chapterNumber: i + 1,
    });
  });

  return novel;
}
```

Notes:

- `$(el)` re-scopes a selector to a single element found by `.each()`; without it you'd search the
  whole document again for every item.
- `path` should be relative (strip `this.site`/the domain) — see [NovelItem::path](#novelitempath).
- Prefer `.attr('href')` / `.attr('src')` over `.text()` for links and images, and always guard for
  `undefined` since a selector can fail to match if the site changes its markup.
- `.map((i, el) => ...).get()` is Cheerio's way of turning a selection into a plain array — `.get()`
  is required, a bare `.map()` returns a Cheerio object, not an array.

See the [Cheerio API docs](https://cheerio.js.org/docs/api) for the full set of selectors/methods
(`.find()`, `.first()`, `.eq()`, `.attr()`, `.text()`, `.html()`, etc.), and look at existing
plugins under `plugins/**` for real examples.

---

### Custom fetching functions

Plugins can't use the browser/Node `fetch` directly — use the wrappers from `@libs/fetch` instead,
which handle plugin-specific request setup (default headers, etc.):

```ts
import { fetchApi, fetchText, fetchProto } from '@libs/fetch';
```

#### fetchApi

```ts
declare function fetchApi(url: string, init?: FetchInit): Promise<Response>;
```

The general-purpose fetcher. Returns a standard `Response`, so use `.text()`, `.json()`, etc. on
the result, the same way you would with the native `fetch`.

Every request automatically gets these default headers, merged under whatever you pass in
`init.headers` (a header you set yourself takes priority over the default of the same name):

- `User-Agent` — the app's configured user agent
- `Connection: keep-alive`
- `Accept: */*`
- `Accept-Language: *`
- `Accept-Encoding: gzip, deflate`
- `Sec-Fetch-Mode: cors`
- `Cache-Control: max-age=0`

You don't need to set these yourself; only pass headers the site actually requires beyond the
defaults (`Referer`, `Authorization`, `Cookie`, etc.).

```ts
const res = await fetchApi(this.resolveUrl(novelPath));
const body = await res.text();
```

#### fetchText

```ts
declare function fetchText(
  url: string,
  init?: FetchInit,
  encoding?: string,
): Promise<string>;
```

A shortcut for `fetchApi(...).then(res => res.text())`, with an optional `encoding` for sites that
don't serve UTF-8 (e.g. `fetchText(url, undefined, 'gbk')` for some Chinese-language sites).

> [!WARNING]
> `fetchText` never throws. If the request fails (network error) or the response isn't `ok` (e.g.
> a 404/500), it silently returns an **empty string** `''` instead of rejecting. Check for an
> empty result before parsing it if the site's availability can't be assumed:
>
> ```ts
> const body = await fetchText(url);
> if (!body) {
>   // request failed or returned no content — bail out instead of parsing ''
>   return novels;
> }
> ```

#### fetchProto

```ts
declare function fetchProto(
  protoInit: ProtoRequestInit,
  url: string,
  init?: FetchInit,
): Promise<unknown>;
```

For sites whose API responds with [Protocol Buffers](https://protobuf.dev/) instead of JSON/HTML.

```ts
type ProtoRequestInit = {
  proto: string; // the .proto schema source
  requestType: string; // message type to encode the request as
  requestData?: any; // request payload, encoded as `requestType`
  responseType: string; // message type to decode the response as
};
```

This is an advanced/uncommon case — only reach for it if the site's API is proto-based, which you
can usually tell from binary (non-JSON) response bodies on an `application/x-protobuf`-style
content type.

#### FetchInit

The `init` object accepted by all three functions above:

```ts
type FetchInit = {
  headers?: Record<string, string> | Headers;
  method?: string;
  body?: FormData | string;
  [key: string]: string | Record<string, string> | FormData | Headers | undefined;
};
```

It mirrors the standard [`fetch` init object](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit)
(`headers`, `method`, `body`) — set headers like `Referer`/`Authorization`/`Cookie` under
`headers`, not as top-level keys.

---

### Other libraries

A few smaller helpers and runtime-provided packages are available for less common cases. You
generally won't need most of these unless your target site requires them. Everything listed here
is what's actually injected into a running plugin's `require(...)` calls — anything else you
`import` won't resolve at runtime even if it type-checks locally.

| Package            | Exposes                                    | Typical use                                                   |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `cheerio`           | `load`                                       | HTML parsing — see [Using Cheerio](#using-cheerio)               |
| `@libs/fetch`       | `fetchApi`, `fetchText`, `fetchProto`        | Network requests — see [Custom fetching functions](#custom-fetching-functions) |
| `dayjs`             | the `dayjs` default export                   | Parsing/formatting relative or oddly-formatted release dates     |
| `urlencode`         | `encode`, `decode`                           | Percent-encoding for URLs/query params, with non-UTF-8 charset support |
| `htmlparser2`       | `Parser`                                     | Low-level streaming HTML/XML parsing, for pages too large or malformed for Cheerio |
| `@libs/storage`     | `storage`, `localStorage`, `sessionStorage`  | Persistent key-value storage — see [storage](#storage-localstorage--sessionstorage) below |
| `@libs/isAbsoluteUrl` | `isUrlAbsolute`                             | See below                                                          |
| `@libs/filterInputs`  | `FilterTypes`, `Filters`, ...               | See [Filters](#filters)                                            |
| `@libs/novelStatus`   | `NovelStatus`                               | See [NovelStatus](#novelstatus)                                    |
| `@libs/defaultCover`  | `defaultCover`                              | See [Default cover](#default-cover)                                |
| `@libs/aes`           | `gcm`                                       | See [AES decryption](#aes-decryption) below                        |
| `@libs/utils`         | `utf8ToBytes`, `bytesToUtf8`                | See [AES decryption](#aes-decryption) below                        |

#### isUrlAbsolute

```ts
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';

declare function isUrlAbsolute(url: string): boolean;
```

Useful when a site mixes absolute and relative URLs in the same listing (e.g. some cover images
are full URLs, others are paths) and you need to normalize them before returning a
[NovelItem](#novelitem)/[SourceNovel](#sourcenovel).

#### storage (localStorage / sessionStorage)

```ts
import { storage, localStorage, sessionStorage } from '@libs/storage';
```

`storage` is the same persistent key-value store used for [plugin settings](#pluginsettings) —
you can also use it directly for things like caching a session cookie or an auth token between
requests. It supports more than a plain get/set pair:

| Method                              | Description                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `storage.set(key, value, expires?)` | Stores `value` under `key`; `expires` is an optional `Date` or epoch-millisecond timestamp after which the entry is treated as gone |
| `storage.get(key, raw?)`            | Returns the stored value, or `undefined` if missing/expired. Pass `raw: true` to get back `{ created, value, expires }` instead of just `value` |
| `storage.delete(key)`               | Removes a single key                                                          |
| `storage.clearAll()`                | Removes every key this plugin has stored                                      |
| `storage.getAllKeys()`              | Returns all keys currently set by this plugin                                 |

`localStorage`/`sessionStorage` are separate, lower-level stores for plugins that need that exact
browser-style API (for example, reusing scraping code shared with a web target) — but unlike
`storage`, they are **read-only** from plugin code: each only exposes `get()`, with no `set()`.
They're populated by the app's own WebView integration, not written by your plugin. If your
plugin uses either of them, set [`webStorageUtilized`](#pluginbasewebstorageutilized) to `true` on
the plugin so the app knows to provide that access.

#### AES decryption

```ts
import { gcm } from '@libs/aes';
import { utf8ToBytes, bytesToUtf8 } from '@libs/utils';
```

For sites that encrypt their API responses with AES-GCM (uncommon, but seen on a handful of
sources). `gcm(key, nonce, AAD?)` returns a `Cipher` with `encrypt`/`decrypt` methods operating on
`Uint8Array`; `utf8ToBytes`/`bytesToUtf8` convert between that and plain strings.

```ts
const cipher = gcm(keyBytes, nonceBytes);
const plaintext = bytesToUtf8(cipher.decrypt(ciphertextBytes));
```

This is an advanced case — only needed if you've confirmed the site is actually encrypting its
payloads, not just minifying/obfuscating them.

---

## Repository manifest & install metadata

The plugin bundle API above is what your `.ts` file implements. Separately, this repository
publishes a **manifest** (`plugins.json`) listing every plugin, which is what the LNReader app
actually reads to show, install, and update plugins from this repo. The manifest entry for a
plugin is built automatically from your class's fields — you don't write it by hand — but it's
useful to know its shape, since it's what the app sees, not your source file directly.

```ts
// app-side manifest entry shape
type PluginItem = {
  id: string;
  name: string;
  site: string;
  lang: string; // full language name, e.g. "English"
  version: string;
  url: string; // raw URL to the compiled plugin's JS, which the app downloads and runs
  iconUrl: string; // absolute URL to the icon, always present (falls back to a placeholder)
  customJS?: string; // absolute URL to the custom JS file, if any
  customCSS?: string; // absolute URL to the custom CSS file, if any
  hasUpdate?: boolean;
  hasSettings?: boolean;
};
```

`lang`, `url`, and `iconUrl` are always required on every manifest entry; the app relies on all
three being present to list and install a plugin.

### How manifest fields are produced

`npm run build:manifest` (`scripts/build-plugin-manifest.js`) compiles every plugin under
`plugins/**`, evaluates its default export, and reads off `id`, `name`, `site`, `version`, `icon`,
`customJS`, `customCSS`, and `filters` to build each `plugins.json` entry:

- `iconUrl` is built from your class's [`icon`](#pluginbaseicon) field: `icon` (or
  `siteNotAvailable.png` if unset) is appended to this repo's `public/static` raw-content URL for
  the current branch.
- `customJS`/`customCSS` are built the same way from your class's
  [`customJS`](#pluginbasecustomjs)/[`customCSS`](#pluginbasecustomcss) fields, when set — omitted
  from the manifest entirely if you didn't set them.
- `url` points at the compiled JS for your plugin, not your `.ts` source.

`scripts/download-plugin-icons.js` separately fetches/validates the icon file that
`iconUrl` will point to (falling back to the site's favicon when you haven't committed one) and
prunes any `public/static` assets no manifest entry references any more.

### Install flow (app side)

When the app installs or updates a plugin from a repository's manifest, it:

1. Downloads the compiled JS from the entry's `url` and evaluates it as the plugin.
2. If the entry has a `customJS` and/or `customCSS` URL, downloads each into the plugin's own
   private on-device storage (not `public/static` — that's this repo's hosting location, not
   where the installed copy ends up) alongside the plugin's compiled code.
3. Displays the plugin using `iconUrl` directly — the app never resolves an `icon` path itself.

In other words: `icon`/`customJS`/`customCSS` on your class are source-repo-relative paths that
exist only so the build step above can turn them into the absolute, downloadable URLs
(`iconUrl`/`customJS`/`customCSS`) the manifest — and therefore the app — actually uses.
