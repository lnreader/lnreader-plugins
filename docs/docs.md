## Documentation for LNReader plugins

- [PluginBase](#pluginbase)
  - [NovelItem](#novelitem)
  - [SourceNovel](#sourcenovel)
  - [ChapterItem](#chapteritem)
  - [Filters](#filters)
  - [PluginSettings](#pluginsettings)
  - [NovelStatus](#novelstatus)
- [Using Cheerio](#using-cheerio)
- [Custom fetching functions](#custom-fetching-functions)
- [Other libraries](#other-libraries)

Most of the Plugin/Novel type definitions accessed using the `Plugin` namespace imported via

```ts
import { Plugin } from '@/types/plugin';
```

### PluginBase

PluginBase is a base class for all plugins.

```ts
class ExamplePlugin implements Plugin.PluginBase {}
```

| Field                                                      | Required | Description                                            |
| ----------------------------------------------------------- | -------- | ------------------------------------------------------- |
| [id](#pluginbaseid)                                          | yes      | Plugin ID                                                |
| [name](#pluginbasename)                                      | yes      | Plugin Name                                              |
| [icon](#pluginbaseicon)                                      | yes      | Plugin Icon                                              |
| [site](#pluginbasesite)                                      | yes      | Plugin site link                                         |
| [version](#pluginbaseversion)                                | yes      | Plugin version                                           |
| [imageRequestInit](#pluginbaseimagerequestinit)              | no       | Plugin Image Request Init                                |
| [filters](#pluginbasefilters)                                | no       | [Filter definition](#filter-definition-object) object    |
| [pluginSettings](#pluginbasepluginsettings)                  | no       | [Plugin settings](#pluginsettings) object                |
| [webStorageUtilized](#pluginbasewebstorageutilized)          | no       | Flag for plugins that need `localStorage`/`sessionStorage` |
| [customJS](#pluginbasecustomjs)                              | no       | Path to a custom JS file bundled with the plugin         |
| [customCSS](#pluginbasecustomcss)                             | no       | Path to a custom CSS file bundled with the plugin        |
| [popularNovels(page, options)](#pluginbasepopularnovels)     | yes      | Novel list getter                                        |
| [parseNovel(path)](#pluginbaseparsenovel)                    | yes      | Novel info and chapter list getter                       |
| [parseChapter(path)](#pluginbaseparsechapter)                | yes      | Chapter text getter                                      |
| [searchNovels(searchTerm, page)](#pluginbasesearchnovels)    | yes      | Novel searching getter                                   |
| [resolveUrl(path, isNovel)](#pluginbaseresolveurl)           | no       | Helper that turns a novel/chapter path into a full URL   |

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
`public/static` prefix itself). The file must actually live at
`public/static/<icon>` in this repo.

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

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  customCSS = 'src/en/templateplugin/customCSS.css';
  ...
}
```

#### PluginBase::filters

A [Filter definition](#filter-definition-object) object that holds filters used in the
[popularNovels](#pluginbasepopularnovels) function

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
    if (options.filters.example.value === 'test') {
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
> [SourceNovel::path](#sourcenovel) should be the same value as [NovelItem::path](#novelitempath) provided as parameter!

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
    };
    const chapters: Plugin.ChapterItem[] = [];
    const chapter: Plugin.ChapterItem = {
      name: '',
      path: '',
      releaseTime: '',
      chapterNumber: 0,
    };
    chapters.push(chapter);
    novel.chapters = chapters;
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
  ...
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

| Field                            | type     | Required | Description                                |
| -------------------------------- | -------- | -------- | ------------------------------------------ |
| <p id="novelitempath">path</p>   | `string` | yes      | The relative path to the novel             |
| <p id="novelitemname">name</p>   | `string` | yes      | The name of the novel shown in the library |
| <p id="novelitemcover">cover</p> | `string` | no       | URL to novel's cover                       |

#### Default cover

You can use the default `Cover not available` cover by importing

```ts
import { defaultCover } from '@libs/defaultCover';
```

---

### SourceNovel

`SourceNovel` extends [NovelItem](#novelitem), so `path`, `name`, and `cover` behave the same way
here as they do there.

| Field    | Type                              | Required | Description                                  |
| -------- | ---------------------------------- | -------- | --------------------------------------------- |
| path     | `string`                           | yes      | Must match the [NovelItem::path](#novelitempath) passed into `parseNovel` |
| name     | `string`                           | yes      | The novel's title                             |
| cover    | `string`                           | no       | URL to the novel's cover                      |
| genres   | `string`                           | no       | Comma-separated genre list, e.g. `"Action,Fantasy,Romance"` |
| summary  | `string`                           | no       | The novel's synopsis/description              |
| author   | `string`                           | no       |                                                |
| artist   | `string`                           | no       |                                                |
| status   | [NovelStatus](#novelstatus) or `string` | no  | See [NovelStatus](#novelstatus) for the standard values |
| rating   | `number`                           | no       | Rating out of 5, as a float                   |
| chapters | [ChapterItem](#chapteritem)`[]`    | no       | The novel's chapter list                      |

---

### ChapterItem

| Field         | Type                     | Required | Description                                                     |
| ------------- | ------------------------ | -------- | ----------------------------------------------------------------- |
| name          | `string`                 | yes      |                                                                     |
| path          | `string`                 | yes      |                                                                     |
| releaseTime   | `string`                 | no       | `"YYYY-MM-DD"` or an ISO date string                               |
| chapterNumber | `number`                 | no       |                                                                     |
| page          | `string`                 | no       | Only used for novels without pages (see `SourcePage`/`PagePlugin`) |
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

Types of filters supported

| FilterType                | Description                                                        | `value`                                                                      | `options`                                       |
| ------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `Picker`                  | A spinner for choosing one of the choices provided in `options`    | `string` the picked value                                                    | [Picker](#picker-options) options               |
| `TextInput`               | A filter allowing a free text input                                | `string` written value                                                       | N/A                                             |
| `Switch`                  | A boolean switch                                                   | `boolean` state of the switch                                                | N/A                                             |
| `CheckboxGroup`           | A grouping of checkboxes                                           | `string[]` array containing selected values                                  | [CheckboxGroup](#checkboxgroup-options) options |
| `ExcludableCheckboxGroup` | A grouping of checkboxes where each one can be marked as included or excluded (e.g. "must have this genre" vs. "must not have this genre") | [ExcludableCheckboxGroupValue](#excludablecheckboxgroupvalue-object) object | [CheckboxGroup](#checkboxgroup-options) options |

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

| Name    | Type     | Required | Description                                    |
| ------- | -------- | -------- | ---------------------------------------------- |
| value   | `string` | yes      | Default value for this setting                 |
| label   | `string` | yes      | Display label shown in the app's settings UI   |
| type    | `string` | no       | Type of the setting UI component (see below)   |

##### Setting Types

Currently, two setting types are supported:

| Type     | Description                                    | UI Component | Default Value Type |
| -------- | ---------------------------------------------- | ------------ | ------------------ |
| `Switch` | A boolean toggle switch                        | SwitchItem   | `boolean`          |
| `Text`   | A text input field (default if type is omitted) | TextInput    | `string`           |

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

##### Examples

###### Example 1: Switch Setting

```ts
class ExamplePlugin implements Plugin.PluginBase {
  ...
  hideLocked = storage.get('hideLocked');

  pluginSettings = {
    hideLocked: {
      value: '',
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

`status` isn't restricted to these values (it accepts any `string`), but prefer a `NovelStatus`
member whenever the source's status maps onto one — free-text values won't be recognized by the
app's status filter.

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

Notes:

- `$(el)` re-scopes a selector to a single element found by `.each()`; without it you'd search the
  whole document again for every item.
- `path` should be relative (strip `this.site`/the domain) — see [NovelItem::path](#novelitempath).
- Prefer `.attr('href')` / `.attr('src')` over `.text()` for links and images, and always guard for
  `undefined` since a selector can fail to match if the site changes its markup.

See the [Cheerio API docs](https://cheerio.js.org/docs/api) for the full set of selectors/methods
(`.find()`, `.first()`, `.eq()`, `.attr()`, `.text()`, `.html()`, etc.), and look at existing
plugins under `plugins/**` for real examples.

---

### Custom fetching functions

Plugins can't use the browser/Node `fetch` directly — use the wrappers from `@libs/fetch` instead,
which handle plugin-specific request setup (proxying, headers, etc.):

```ts
import { fetchApi, fetchText, fetchProto } from '@libs/fetch';
```

#### fetchApi

```ts
declare function fetchApi(url: string, init?: FetchInit): Promise<Response>;
```

The general-purpose fetcher. Returns a standard `Response`, so use `.text()`, `.json()`, etc. on
the result, the same way you would with the native `fetch`.

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

A few smaller helpers are available for less common cases. You generally won't need these unless
your target site requires them.

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
requests. `localStorage`/`sessionStorage` are separate, lower-level stores for plugins that need
that exact browser-style API (for example, reusing scraping code shared with a web target). If
your plugin uses either of them, set [`webStorageUtilized`](#pluginbasewebstorageutilized) to
`true` on the plugin so the app knows to provide that access.

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
