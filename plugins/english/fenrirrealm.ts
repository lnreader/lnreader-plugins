import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Node } from 'domhandler';
import { load as loadCheerio } from 'cheerio';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { storage } from '@libs/storage';
import { defaultCover } from '@libs/defaultCover';

type APINovel = {
  title: string;
  slug: string;
  cover: string;
  description: string;
  status: string;
  genres: { name: string }[];
};

type APIChapter = {
  locked: { price: number } | null;
  group: null | {
    index: number;
    slug: string;
  };
  title: string;
  number: number;
  created_at: string;
};

type ChapterInfo = {
  name: string;
  path: string;
  releaseTime: string;
  chapterNumber: number;
};

class FenrirRealmPlugin implements Plugin.PluginBase {
  id = 'fenrir';
  name = 'Fenrir Realm';
  icon = 'src/en/fenrirrealm/icon.png';
  site = 'https://fenrirealm.com';
  version = '1.0.13';
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  hideLocked = storage.get('hideLocked');
  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // let sort = "updated";
    let sort = filters.sort.value;
    if (showLatestNovels) sort = 'latest';
    const genresFilter = filters.genres.value
      .map(g => '&genres%5B%5D=' + g)
      .join('');
    const res = await fetchApi(
      `${this.site}/api/series/filter?page=${pageNo}&per_page=20&status=${filters.status.value}&order=${sort}${genresFilter}`,
    ).then(r =>
      r.json().catch(() => {
        throw new Error(
          'There was an error fetching the data from the server. Please try to open it in WebView',
        );
      }),
    );

    return res.data.map((r: APINovel) => this.parseNovelFromApi(r));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await fetchApi(`${this.site}/series/${novelPath}`, {}).then(
      r => r.text(),
    );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      summary: '',
    };
    
    // Parse title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    if (titleMatch) {
      novel.name = titleMatch[1].replace(/ - Fenrir Realm$/i, '').trim();
    } else {
      const ogTitleMatch = html.match(/property="og:title"\s+content="([^"]+)"/);
      if (ogTitleMatch) novel.name = ogTitleMatch[1];
    }

    // Parse summary
    const descMatch = html.match(/property="og:description"\s+content="([^"]+)"/);
    if (descMatch) {
      novel.summary = descMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }

    // Parse cover
    const coverMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
    novel.cover = coverMatch ? coverMatch[1] : defaultCover;

    // Extracting user/author from SvelteKit data payload
    const userMatch = html.match(/user:{username:"[^"]+",name:"([^"]+)"}/);
    if (userMatch) novel.author = userMatch[1];

    // Extract status (it's often part of the Svelte payload but can be hard to reliably extract since it's just a number enum in the array. 
    // Usually Fenrir Realm series are ongoing if not specified)
    novel.status = 'Unknown';
    if (html.match(/status:"Completed"|status:"completed"/i)) {
        novel.status = 'Completed';
    } else if (html.match(/status:"Ongoing"|status:"ongoing"/i)) {
        novel.status = 'Ongoing';
    }

    // Attempt to extract genres from SvelteKit payload
    // The payload looks like: ["Action","adult","@{id:..., name:...}"]
    // It's encoded complexly, so we'll try to find common genre strings directly
    const possibleGenres = [
      'Action','Adult','Adventure','Comedy','Drama','Ecchi','Fantasy','Gender Bender',
      'Harem','Historical','Horror','Josei','Martial Arts','Mature','Mecha','Mystery',
      'Psychological','Romance','School Life','Sci-fi','Seinen','Shoujo','Shoujo Ai',
      'Shounen','Shounen Ai','Slice of Life','Smut','Sports','Supernatural','Tragedy',
      'Wuxia','Xianxia','Xuanhuan','Yaoi','Yuri','Magic','Cultivation','System','Reincarnation'
    ];
    const foundGenres = [];
    for (const g of possibleGenres) {
      // Look for the genre inside the SvelteKit data payload array strings
      const rgx = new RegExp(`"${g}"`, 'i');
      if (rgx.test(html)) {
        foundGenres.push(g);
      }
    }
    if (foundGenres.length > 0) {
      novel.genres = foundGenres.join(',');
    }

    let chapters = await fetchApi(
      this.site + '/api/novels/chapter-list/' + novelPath,
    ).then(r => r.json());

    if (this.hideLocked) {
      chapters = chapters.filter((c: APIChapter) => !c.locked?.price);
    }

    novel.chapters = chapters
      .map((c: any) => {
        let chapterTitle = '';
        if (c.title) {
            chapterTitle = ' - ' + c.title.trim().replace(/^chapter [0-9]+ . /i, '');
        } else if (c.name) {
            // Some chapters have 'name' instead of 'title' in the API
            const n = c.name.trim();
            if (n !== 'Chapter ' + c.number && n !== c.number.toString()) {
                chapterTitle = ' - ' + n.replace(/^chapter [0-9]+ . /i, '');
            }
        }

        return {
        name:
          (c.locked?.price ? '🔒 ' : '') +
          (c.group?.index === null || c.group?.index === undefined ? '' : 'Vol ' + c.group?.index + ' ') +
          'Chapter ' +
          c.number +
          chapterTitle,
        path:
          novelPath +
          (c.group?.index === null || c.group?.index === undefined || c.group?.slug === null ? '' : '/' + c.group?.slug) +
          '/' + (c.slug || c.number.toString()),
        releaseTime: c.created_at,
        chapterNumber: c.number + (c.group?.index || 0) * 1000000000000,
      }})
      .sort(
        (a: ChapterInfo, b: ChapterInfo) => a.chapterNumber - b.chapterNumber,
      );
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const page = await fetchApi(this.site + '/series/' + chapterPath, {}).then(
      r => r.text(),
    );
    const chapter = loadCheerio(page)('[id^="reader-area-"]');
    chapter
      .contents()
      .filter((_, node: Node) => {
        return node.type === 'comment';
      })
      .remove();

    return chapter.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return await fetchApi(
      `${this.site}/api/series/filter?page=${pageNo}&per_page=20&search=${encodeURIComponent(searchTerm)}`,
    )
      .then(r => r.json())
      .then(r =>
        r.data.map((novel: APINovel) => this.parseNovelFromApi(novel)),
      );
  }

  parseNovelFromApi(apiData: APINovel) {
    return {
      name: apiData.title,
      path: apiData.slug,
      cover: this.site + '/' + apiData.cover,
      summary: apiData.description,
      status: apiData.status,
      genres: apiData.genres.map(g => g.name).join(','),
    };
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + '/series/' + path;

  filters = {
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: 'any',
      options: [
        { label: 'All', value: 'any' },
        { label: 'Ongoing', value: 'ongoing' },
        {
          label: 'Completed',
          value: 'completed',
        },
      ],
    },
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort',
      value: 'popular',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'Latest', value: 'latest' },
        { label: 'Updated', value: 'updated' },
      ],
    },
    genres: {
      type: FilterTypes.CheckboxGroup,
      label: 'Genres',
      value: [],
      options: [
        { 'label': 'Action', 'value': '1' },
        { 'label': 'Adult', 'value': '2' },
        {
          'label': 'Adventure',
          'value': '3',
        },
        { 'label': 'Comedy', 'value': '4' },
        { 'label': 'Drama', 'value': '5' },
        {
          'label': 'Ecchi',
          'value': '6',
        },
        { 'label': 'Fantasy', 'value': '7' },
        { 'label': 'Gender Bender', 'value': '8' },
        {
          'label': 'Harem',
          'value': '9',
        },
        { 'label': 'Historical', 'value': '10' },
        { 'label': 'Horror', 'value': '11' },
        {
          'label': 'Josei',
          'value': '12',
        },
        { 'label': 'Martial Arts', 'value': '13' },
        { 'label': 'Mature', 'value': '14' },
        {
          'label': 'Mecha',
          'value': '15',
        },
        { 'label': 'Mystery', 'value': '16' },
        { 'label': 'Psychological', 'value': '17' },
        {
          'label': 'Romance',
          'value': '18',
        },
        { 'label': 'School Life', 'value': '19' },
        { 'label': 'Sci-fi', 'value': '20' },
        {
          'label': 'Seinen',
          'value': '21',
        },
        { 'label': 'Shoujo', 'value': '22' },
        { 'label': 'Shoujo Ai', 'value': '23' },
        {
          'label': 'Shounen',
          'value': '24',
        },
        { 'label': 'Shounen Ai', 'value': '25' },
        { 'label': 'Slice of Life', 'value': '26' },
        {
          'label': 'Smut',
          'value': '27',
        },
        { 'label': 'Sports', 'value': '28' },
        { 'label': 'Supernatural', 'value': '29' },
        {
          'label': 'Tragedy',
          'value': '30',
        },
        { 'label': 'Wuxia', 'value': '31' },
        { 'label': 'Xianxia', 'value': '32' },
        {
          'label': 'Xuanhuan',
          'value': '33',
        },
        { 'label': 'Yaoi', 'value': '34' },
        { 'label': 'Yuri', 'value': '35' },
      ],
    },
  } satisfies Filters;
}

export default new FenrirRealmPlugin();

type GenreData = {
  name: string;
  id: number;
};

//paste into console on site to load
async function getUpdatedGenres() {
  const data = await fetch(
    'https://fenrirealm.com/api/novels/taxonomy/genres',
  ).then(d => d.json());
  const genreData = data.map((g: GenreData) => ({
    label: g.name,
    value: g.id.toString(),
  }));
  console.log(JSON.stringify(genreData));
}
