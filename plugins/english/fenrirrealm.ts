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
  version = '1.0.22';
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
    const sort = showLatestNovels ? 'latest' : filters.sort.value;
    const params = new URLSearchParams({
      page: pageNo.toString(),
      per_page: '12',
      status: filters.status.value,
      order: sort,
    });

    filters.genres.value.include.forEach(genre => {
      params.append('genres[]', genre);
    });
    filters.genres.value.exclude.forEach(genre => {
      params.append('exclude_genres[]', genre);
    });

    const url = `${this.site}/api/new/v2/series?${params.toString()}`;

    const res = await fetchApi(url).then(r =>
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
    const loadedCheerio = loadCheerio(html);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.my-2').text(),
      summary: loadedCheerio(
        'div.overflow-hidden.transition-all.max-h-\\[108px\\] p',
      )
        .map((i, el) => loadCheerio(el).text())
        .get()
        .join('\n\n'),
      author: loadedCheerio('div.flex-1 > div.mb-3 > a.inline-flex').text(),
      cover: defaultCover,
      status: loadedCheerio('div.flex-1 > div.mb-3 > span.rounded-md')
        .first()
        .text(),
    };

    const coverMatch = html.match(/,cover:"storage\/(.+?)",cover_data_url/);
    if (coverMatch) {
      novel.cover = this.site + '/storage/' + coverMatch[1];
    }

    novel.genres = loadedCheerio('div.flex-1 > div.flex:not(.mb-3, .mt-5) > a')
      .map((i, el) => loadCheerio(el).text())
      .toArray()
      .join(',');

    const chaptersRes = await fetchApi(
      this.site + '/api/new/v2/series/' + novelPath + '/chapters',
    ).then(r => r.json());

    let chapterList = Array.isArray(chaptersRes)
      ? chaptersRes
      : chaptersRes.data || [];

    if (this.hideLocked) {
      chapterList = chapterList.filter((c: APIChapter) => !c.locked?.price);
    }

    novel.chapters = chapterList
      .map((c: APIChapter) => ({
        name:
          (c.locked?.price ? '🔒 ' : '') +
          (c.group?.index === null ? '' : 'Vol ' + c.group?.index + ' ') +
          'Chapter ' +
          c.number +
          (c.title && c.title.trim() != 'Chapter ' + c.number
            ? ' - ' + c.title.replace(/^chapter [0-9]+ . /i, '')
            : ''),
        path:
          novelPath +
          (c.group?.index === null ? '' : '/' + c.group?.slug) +
          '/chapter-' +
          c.number,
        releaseTime: c.created_at,
        chapterNumber: c.number + (c.group?.index || 0) * 1000000000000,
      }))
      .sort(
        (a: ChapterInfo, b: ChapterInfo) => a.chapterNumber - b.chapterNumber,
      );
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 1500));

    let page = '';
    try {
      page = await fetchApi(this.site + '/series/' + chapterPath).then(r =>
        r.text(),
      );
    } catch (e) {
      // Suppress network errors to allow fallback
    }

    let chapterHtml = this.extractChapterContent(page);

    if (!chapterHtml) {
      // Fallback: Try to heal path and fetch again
      const healedPath = await this.healChapterPath(chapterPath);
      if (healedPath && healedPath !== chapterPath) {
        try {
          page = await fetchApi(this.site + '/series/' + healedPath).then(r =>
            r.text(),
          );
          chapterHtml = this.extractChapterContent(page);
        } catch (e) {
          // ignore
        }
      }
    }

    return chapterHtml || '';
  }

  private extractChapterContent(html: string): string {
    if (!html) return '';
    const $ = loadCheerio(html);

    // 1. Try DOM selector
    let readerArea = $('[id^="reader-area-"], .content-area');
    if (readerArea.length > 0) {
      readerArea
        .contents()
        .filter((_, node: Node) => node.type === 'comment')
        .remove();

      // Clean up HTML
      readerArea.find('script, style, iframe, noscript').remove();
      readerArea.find('*').removeAttr('style');
      readerArea.find('*').removeAttr('tabindex');

      const content = readerArea.html();
      if (content && content.trim().length > 100) return content;
    }

    // 2. Try SvelteKit data extraction (Regex-based to handle JS object literals)
    try {
      const scriptTag = $('script:contains("__sveltekit")').html();
      if (scriptTag) {
        // Find all strings that look like HTML content or JSON document structure
        const strings = scriptTag.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g);
        if (strings) {
          let longestStr = '';
          for (const s of strings) {
            const content = s
              .slice(1, -1)
              .replace(/\\"/g, '"')
              .replace(/\\n/g, '\n');

            // Check if it's HTML or ProseMirror JSON
            if (content.includes('<p') || content.includes('"type":"doc"')) {
              if (content.length > longestStr.length) {
                longestStr = content;
              }
            }
          }

          if (longestStr.length > 500) {
            // If it's JSON, extract the text content
            if (
              longestStr.startsWith('{') &&
              longestStr.includes('"type":"doc"')
            ) {
              try {
                const doc = JSON.parse(longestStr);
                const extractText = (node: any): string => {
                  if (node.type === 'text') return node.text || '';
                  if (node.content && Array.isArray(node.content)) {
                    const text = node.content.map(extractText).join('');
                    if (node.type === 'paragraph') return `<p>${text}</p>`;
                    return text;
                  }
                  return '';
                };
                return extractText(doc);
              } catch (e) {
                // If direct JSON parse fails (e.g. partial match), try regex extraction
                const textMatches = longestStr.match(/\"text\":\"([^\"]+)\"/g);
                if (textMatches) {
                  return textMatches
                    .map(m => `<p>${m.slice(8, -1)}</p>`)
                    .join('');
                }
              }
            }
            return longestStr;
          }
        }
      }
    } catch (e) {
      // ignore parsing errors
    }

    return '';
  }

  private async healChapterPath(chapterPath: string): Promise<string | null> {
    const parts = chapterPath.split('/');
    if (parts.length === 0) return null;

    let novelSlug = parts[0];
    const chapterPart = parts[parts.length - 1];
    const match = chapterPart.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;

    const chapterNum = parseFloat(match[1]);

    const getChapters = async (slug: string) => {
      const res = await fetchApi(
        `${this.site}/api/new/v2/series/${slug}/chapters`,
      ).catch(() => null);
      if (res && res.ok) return res.json().catch(() => []);
      return null;
    };

    let chaptersArray = await getChapters(novelSlug);

    if (!chaptersArray) {
      // Try search fallback
      const slugMatch = novelSlug.match(/^\d+-(.+)$/);
      let searchSlug = slugMatch ? slugMatch[1] : novelSlug;
      chaptersArray = await getChapters(searchSlug);
      if (chaptersArray) novelSlug = searchSlug;
    }

    if (!chaptersArray) {
      const searchRes = await fetchApi(
        `${this.site}/api/series/filter?page=1&per_page=20&search=${encodeURIComponent(novelSlug.replace(/-/g, ' '))}`,
      )
        .then(r => r.json())
        .catch(() => ({ data: [] }));

      if (searchRes.data && searchRes.data.length > 0) {
        novelSlug = searchRes.data[0].slug;
        chaptersArray = await getChapters(novelSlug);
      }
    }

    if (Array.isArray(chaptersArray)) {
      const correctChapter = chaptersArray.find(
        (c: any) => c.number === chapterNum,
      );
      if (correctChapter) {
        return (
          novelSlug +
          (correctChapter.group?.index == null
            ? ''
            : '/' + correctChapter.group.slug) +
          '/' +
          (correctChapter.slug || 'chapter-' + correctChapter.number)
        );
      }
    }

    return null;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      page: pageNo.toString(),
      per_page: '12',
      search: searchTerm,
      status: 'any',
      sort: 'latest',
    });

    return await fetchApi(
      `${this.site}/api/new/v2/series?${params.toString()}`,
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
      type: FilterTypes.ExcludableCheckboxGroup,
      label: 'Genres',
      value: {
        include: [],
        exclude: [],
      },
      options: [
        { label: 'Action', value: '1' },
        { label: 'Adult', value: '2' },
        {
          label: 'Adventure',
          value: '3',
        },
        { label: 'Comedy', value: '4' },
        { label: 'Drama', value: '5' },
        {
          label: 'Ecchi',
          value: '6',
        },
        { label: 'Fantasy', value: '7' },
        { label: 'Gender Bender', value: '8' },
        {
          label: 'Harem',
          value: '9',
        },
        { label: 'Historical', value: '10' },
        { label: 'Horror', value: '11' },
        {
          label: 'Josei',
          value: '12',
        },
        { label: 'Martial Arts', value: '13' },
        { label: 'Mature', value: '14' },
        {
          label: 'Mecha',
          value: '15',
        },
        { label: 'Mystery', value: '16' },
        { label: 'Psychological', value: '17' },
        {
          label: 'Romance',
          value: '18',
        },
        { label: 'School Life', value: '19' },
        { label: 'Sci-fi', value: '20' },
        {
          label: 'Seinen',
          value: '21',
        },
        { label: 'Shoujo', value: '22' },
        { label: 'Shoujo Ai', value: '23' },
        {
          label: 'Shounen',
          value: '24',
        },
        { label: 'Shounen Ai', value: '25' },
        { label: 'Slice of Life', value: '26' },
        {
          label: 'Smut',
          value: '27',
        },
        { label: 'Sports', value: '28' },
        { label: 'Supernatural', value: '29' },
        {
          label: 'Tragedy',
          value: '30',
        },
        { label: 'Wuxia', value: '31' },
        { label: 'Xianxia', value: '32' },
        {
          label: 'Xuanhuan',
          value: '33',
        },
        { label: 'Yaoi', value: '34' },
        { label: 'Yuri', value: '35' },
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
