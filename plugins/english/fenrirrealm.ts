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
  version = '1.0.14';
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

    return (res.data || []).map((r: APINovel) => this.parseNovelFromApi(r));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    let cleanNovelPath = novelPath;
    let htmlRes = await fetchApi(`${this.site}/series/${novelPath}`, {});

    if (!htmlRes.ok) {
      const slugMatch = novelPath.match(/^\d+-(.+)$/);
      let searchSlug = slugMatch ? slugMatch[1] : novelPath;
      htmlRes = await fetchApi(`${this.site}/series/${searchSlug}`, {});
      cleanNovelPath = searchSlug;

      if (!htmlRes.ok) {
        // As a last-ditch effort, search for the slug string
        let SearchStr = searchSlug.replace(/-/g, ' ');
        let searchRes = await fetchApi(
          `${this.site}/api/series/filter?page=1&per_page=20&search=${encodeURIComponent(SearchStr)}`,
        ).then(r => r.json());

        let words = SearchStr.split(' ');
        // If no results, try removing words from the end (up to 2 words min) to find a match
        while (
          (!searchRes.data || searchRes.data.length === 0) &&
          words.length > 2
        ) {
          words.pop();
          SearchStr = words.join(' ');
          searchRes = await fetchApi(
            `${this.site}/api/series/filter?page=1&per_page=20&search=${encodeURIComponent(SearchStr)}`,
          ).then(r => r.json());
        }

        if (searchRes.data && searchRes.data.length > 0) {
          cleanNovelPath = searchRes.data[0].slug;
          htmlRes = await fetchApi(`${this.site}/series/${cleanNovelPath}`, {});
        }
      }

      if (!htmlRes.ok) {
        throw new Error(
          'Novel not found. It may have been removed or its URL changed significantly.',
        );
      }
    }

    const html = await htmlRes.text();
    const loadedCheerio = loadCheerio(html);

    const novel: Plugin.SourceNovel = {
      path: cleanNovelPath,
      name: loadedCheerio('h1.my-2').text(),
      summary: loadedCheerio(
        'div.overflow-hidden.transition-all.max-h-\\[108px\\] p',
      )
        .map((i, el) => loadCheerio(el).text())
        .get()
        .join('\n\n'),
    };
    // novel.artist = '';
    novel.author = loadedCheerio(
      'div.flex-1 > div.mb-3 > a.inline-flex',
    ).text();
    const coverMatch = html.match(/,cover:"storage\/(.+?)",cover_data_url/);
    novel.cover = coverMatch
      ? this.site + '/storage/' + coverMatch[1]
      : defaultCover;
    novel.genres = loadedCheerio('div.flex-1 > div.flex:not(.mb-3, .mt-5) > a')
      .map((i, el) => loadCheerio(el).text())
      .toArray()
      .join(',');
    novel.status = loadedCheerio('div.flex-1 > div.mb-3 > span.rounded-md')
      .first()
      .text();

    let chapters = await fetchApi(
      this.site + '/api/new/v2/series/' + cleanNovelPath + '/chapters',
    ).then(r => r.json());

    if (this.hideLocked) {
      chapters = chapters.filter((c: APIChapter) => !c.locked?.price);
    }

    novel.chapters = chapters
      .map((c: APIChapter) => ({
        name:
          (c.locked?.price ? '🔒 ' : '') +
          (c.group?.index == null ? '' : 'Vol ' + c.group?.index + ' ') +
          'Chapter ' +
          c.number +
          (c.title && c.title.trim() != 'Chapter ' + c.number
            ? ' - ' + c.title.replace(/^chapter [0-9]+ . /i, '')
            : ''),
        path:
          novelPath +
          (c.group?.index == null ? '' : '/' + c.group?.slug) +
          '/chapter-' +
          c.number,
        releaseTime: c.created_at,
        chapterNumber: c.number + (c.group?.index || 0) * 10000,
      }))
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
    let url = `${this.site}/api/series/filter?page=${pageNo}&per_page=20&search=${encodeURIComponent(searchTerm)}`;
    let res = await fetchApi(url).then(r => r.json());

    if (pageNo === 1 && (!res.data || res.data.length === 0)) {
      let words = searchTerm.split(' ');
      while ((!res.data || res.data.length === 0) && words.length > 2) {
        words.pop();
        const fallbackTerm = words.join(' ');
        url = `${this.site}/api/series/filter?page=${pageNo}&per_page=20&search=${encodeURIComponent(fallbackTerm)}`;
        res = await fetchApi(url).then(r => r.json());
      }
    }

    return (res.data || []).map((novel: APINovel) =>
      this.parseNovelFromApi(novel),
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
