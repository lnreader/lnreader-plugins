## Documentation for LNReader plugins

- [PluginBase](#pluginbase)
  - [NovelItem](#novelitem)
  - [SourceNovel](#sourcenovel)
  - [ChapterItem](#chapteritem)
  - [Filters](#filters)
  - [PluginSettings](#pluginsettings)
- [Using Cheerio](#using-cheerio)
- [Custom fetching functions](#custom-fetching-functions)

Most of the Plugin/Novel type definitions accessed using the `Plugin` namespace imported via

```ts
import { Plugin } from '@/types/plugin';
```

### PluginBase

PluginBase is a base class for all plugins.

```ts
class ExamplePlugin implements Plugin.PluginBase {}
```

| Field                                                          | Required | Description                                           |
| -------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| [id](#pluginbaseid)                                            | yes      | Plugin ID                                             |
| [name](#pluginbasename)                                        | yes      | Plugin Name                                           |
| [icon](#pluginbasename)                                        | yes      | Plugin Icon                                           |
| [site](#pluginbasesite)                                        | yes      | Plugin site link                                      |
| [version](#pluginbaseversion)                                  | yes      | Plugin version                                        |
| [imageRequestInit](#pluginbaseimagerequestinit)                | no       | Plugin Image Request Init                             |
| [filters](#pluginbasefilters)                                  | no       | [Filter definition](#filter-definition-object) object |
| [pluginSettings](#pluginbasepluginsettings)                    | no       | [Plugin settings](#pluginsettings) object             |
| [popularNovels(page, options)](#pluginbasepopularnovels)       | yes      | Novel list getter                                     |
| [parseNovelAndChapters(url)](#pluginbaseparsenovelandchapters) | yes      | Novel info and chapter list getter                    |
| [parseChapter(url)](#pluginbaseparsechapter)                   | yes      | Chapter text getter                                   |
| [searchNovels(searchTerm, page)](#pluginbasesearchnovels)      | yes      | Novel searching getter                                |

#### PluginBase::id

Unique ID of your plugin

```ts
class ExamplePlugin implements Plugin.PluginBase {
    ...
    id = "templateID";
    ...
}
```

#### PluginBase::name

The name of your plugin that is shown in-app

```ts
class ExamplePlugin implements Plugin.PluginBase {
    ...
    name = "template Plugin";
    ...
}
```

#### PluginBase::icon

The path to your plugin's icon inside of `icon` folder

```ts
class ExamplePlugin implements Plugin.PluginBase {
    ...
    icon = "src/eng/templateplugin/icon.png";
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
    site = "https://example.com";
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
    version = "1.0.0";
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

#### PluginBase::filters

A [Filter definition]() object that holds filters used in [popularNovels](#pluginbasepopularnovels) function

###### Example

```ts
class ExamplePlugin implements Plugin.PluginBase {
    ...
    filters = {
        order: {
            label:"Order",
            options: [
                { label: "Popular", value: "" },
                { label: "Newest", value: "newest" }
            ],
            type: FilterTypes.Picker,
            value: ""
        },
        status: {
            label: "Status",
            options: [
                { label: "All", value: "" },
                { label: "Ongoing", value: "ongoing" },
                { label: "Hiatus", value: "hiatus" },
                { label: "Completed", value: "completed" },
            ],
            type: FilterTypes.Picker,
            value: "",
        }
    }
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

###### Example:

```ts
class ExamplePlugin implements Plugin.PluginBase {
    ...
    async popularNovels(
        page: number,
        options: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {
        const novels: Plugin.NovelItem[] = [];
        if(options.filters.example.value === "test"){
            novels.push({
                name: "Novel1",
                url: "https://example.com/novel1",
                cover:defaultCover
            })
        }
        return novels;
    }
}
```

##### PluginBase::PopularNovelsOptions

This type is used for getting the options of the [popularNovels](#pluginbasepopularnovels) function

- <span id='popularnovelsoptions-showlatestnovels'></span>`showLatestNovels: boolean` flag set when opened with `Latest` button

- <span id='popularnovelsoptions-showlatestnovels'></span>`filters: FilterValues<typeof filters>` object containing all selected filter values. [More about Filters](#filters)

#### PluginBase::parseNovelAndChapters

Function that is used to get the information about particular novel and the list of it's chapters

```ts
async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel>
```

See [Using cheerio](#using-cheerio) for more information on how to parse HTML documents

###### Parameters

- `novelUrl` value from [NovelItem::url](#novelitemurl)

###### Returns

`SourceNovel` Novel information and chapter list as [SourceNovel](#sourcenovel) object

> [!CAUTION] > [SourceNovel::url]() should be the same value as [NovelItem::url]() provided as parameter!

###### Example:

```ts
class ExamplePlugin implements Plugin.PluginBase {
    ...
    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        const novel: Plugin.SourceNovel = {
            url: novelUrl,
            name: "test",
            artist: "none",
            author: "none",
            cover: defaultCover,
            genres: "Isekai, Neverland",
            status: NovelStatus.Completed,
            summary: ""
        };
        let chapters: Plugin.ChapterItem[] = [];
        const chapter: Plugin.ChapterItem = {
            name: "",
            url: "",
            releaseTime: "",
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

Function that is used to get the information about particular novel and the list of it's chapters

```ts
async parseChapter(chapterUrl: string): Promise<string>
```

See [Using cheerio](#using-cheerio) for more information on how to parse HTML documents

###### Parameters

- `chapterUrl` value from [ChapterItem::url](#chapteritemurl)

###### Returns

`string` HTML content of the chapter

###### Example:

```ts
class ExamplePlugin implements Plugin.PluginBase {
    ...
    async parseChapter(chapterUrl: string): Promise<string>{
        return "<h1>No chapter here</h1>";
    }
    ...
}
```

#### PluginBase::searchNovels

Function that is used to find Novels in the source

```ts
async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]>
```

See [Using cheerio](#using-cheerio) for more information on how to parse HTML documents

###### Parameters

- `searchTerm` the search term
- `page` search page number

###### Returns

`NovelItem[]` An array of found [NovelItems](#novelitem)

###### Example

```ts
class ExamplePlugin implements Plugin.PluginBase {
    ...
    async searchNovels(
        searchTerm: string,
        pageNo: number
    ): Promise<Plugin.NovelItem[]> {
        let novels: Plugin.NovelItem[] = [];
        return novels;
    }
    ...
}
```

---

### NovelItem

It is an object representing information how to store/access the novel

| Field                            | type     | Required | Description                                |
| -------------------------------- | -------- | -------- | ------------------------------------------ |
| <p id="novelitemurl">url</p>     | `string` | yes      | The url to the site                        |
| <p id="novelitemname">name</p>   | `string` | yes      | The name of the novel shown in the library |
| <p id="novelitemcover">cover</p> | `string` | no       | URL to novel's cover                       |

#### Default cover

You can use the default `Cover not available` cover by importing

```ts
import { defaultCover } from '@libs/defaultCover';
```

---

### SourceNovel

| Field   | Type                      | Required | Desciption |
| ------- | ------------------------- | -------- | ---------- |
| url     | string                    | yes      |            |
| name    | string                    | no       | string     |
| cover   | `string`                  | no       |            |
| genres  | `string`                  | no       |            |
| summary | `string`                  | no       |            |
| author  | `string`                  | no       |            |
| artist  | `string`                  | no       |            |
| status  | [NovelStatus] or `string` | no       |            |

        chapters?: ChapterItem[];

---

### ChapterItem

---

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
    order: {<FilterProperties>}
} satisfies Filters;
// accessible in popularNovels as
options.filters.order
```

> [!CAUTION]
> Do not forget to add `satisfies Filters` after the Filter definition object!

##### FilterProperties

| Name    | Type                         | Required      | Desciption                                                         |
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
| `ExcludableCheckboxGroup` | A filter allowing to pick one of the choices provided in `options` | [ExcludableCheckboxGroupValues](#excludablecheckboxgroupvalue-object) object | [CheckboxGroup](#checkboxgroup-options) options |

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

It is an object used inisde of `popularNovels` that contains selected values for all filters defined in the [Filter definition](#filter-definition-object) object.
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
    included: string[], // options with selected selected
    excluded: string[]  // options with excluded selected
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
                'Authorization': `Basic ${this.btoa(this.email + ':' + this.password)}`,
            },
            Referer: this.site,
        }).then(res => res.text());
    }
    ...
}
```

---

### Using Cheerio

### Custom fetching functions
