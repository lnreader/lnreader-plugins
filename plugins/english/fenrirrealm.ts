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
  slug: string;
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
  version = '1.0.19';
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
    let apiRes;
    try {
      apiRes = await fetchApi(
        `${this.site}/api/new/v2/series/${novelPath}/chapters`,
        {},
      );
    } catch (error) {
      throw new Error(
        'Cloudflare chặn kết nối! Vui lòng mở truyện bằng WebView (Trình Duyệt) để xác thực Captcha.',
      );
    }

    if (!apiRes.ok) {
      const slugMatch = novelPath.match(/^\d+-(.+)$/);
      let searchSlug = slugMatch ? slugMatch[1] : novelPath;
      apiRes = await fetchApi(
        `${this.site}/api/new/v2/series/${searchSlug}/chapters`,
        {},
      );
      cleanNovelPath = searchSlug;

      if (!apiRes.ok) {
        let SearchStr = searchSlug.replace(/-/g, ' ');
        let searchRes = await fetchApi(
          `${this.site}/api/series/filter?page=1&per_page=20&search=${encodeURIComponent(SearchStr)}`,
        ).then(r => r.json());

        if (!searchRes.data || searchRes.data.length === 0) {
          const words = SearchStr.split(' ');
          SearchStr = words.length > 3 ? words.slice(0, 3).join(' ') : words[0];
          searchRes = await fetchApi(
            `${this.site}/api/series/filter?page=1&per_page=20&search=${encodeURIComponent(SearchStr)}`,
          ).then(r => r.json());
        }

        if (searchRes.data && searchRes.data.length > 0) {
          cleanNovelPath = searchRes.data[0].slug;
          apiRes = await fetchApi(
            `${this.site}/api/new/v2/series/${cleanNovelPath}/chapters`,
            {},
          );
        }
      }

      if (!apiRes.ok) {
        throw new Error(
          'Novel not found. It may have been removed or its URL changed significantly.',
        );
      }
    }

    const seriesData = await fetchApi(
      `${this.site}/api/new/v2/series/${cleanNovelPath}`,
    ).then(r => r.json());
    const summaryCheerio = loadCheerio(seriesData.description || '');

    const novel: Plugin.SourceNovel = {
      path: cleanNovelPath,
      name: seriesData.title || '',
      summary:
        summaryCheerio('p').length > 0
          ? summaryCheerio('p')
              .map((i, el) => loadCheerio(el).text())
              .get()
              .join('\n\n')
          : summaryCheerio.text() || '',
      author: seriesData.user?.name || seriesData.user?.username || '',
      cover: seriesData.cover
        ? this.site + '/' + seriesData.cover
        : defaultCover,
      genres: (seriesData.genres || []).map((g: any) => g.name).join(','),
      status: seriesData.status || 'Unknown',
    };

    let chapters = await apiRes.json().catch(() => []);

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
          '/' +
          (c.slug || 'chapter-' + c.number),
        releaseTime: c.created_at,
        chapterNumber: c.number + (c.group?.index || 0) * 10000,
      }))
      .sort(
        (a: ChapterInfo, b: ChapterInfo) => a.chapterNumber - b.chapterNumber,
      );
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 1500));

    const defaultHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    };

    let page;
    try {
      page = await fetchApi(this.site + '/series/' + chapterPath, {
        headers: defaultHeaders,
      }).then(r => r.text());
    } catch (e) {
      throw new Error(
        'Lỗi mạng do Cloudflare! Vui lòng nhấn biểu tượng 🌐 WebView góc màn hình để xác thực.',
      );
    }
    let chapter = loadCheerio(page)('[id^="reader-area-"]');

    if (chapter.length === 0) {
      const parts = chapterPath.split('/');
      if (parts.length > 0) {
        let cleanNovelPath = parts[0];
        const chapterPart = parts[parts.length - 1];
        const match = chapterPart.match(/(\d+(?:\.\d+)?)/);

        if (match) {
          const chapterNum = parseFloat(match[1]);
          try {
            let apiRes = await fetchApi(
              this.site + '/api/new/v2/series/' + cleanNovelPath + '/chapters',
              { headers: defaultHeaders },
            );

            if (!apiRes.ok) {
              const slugMatch = cleanNovelPath.match(/^\d+-(.+)$/);
              let searchSlug = slugMatch ? slugMatch[1] : cleanNovelPath;
              apiRes = await fetchApi(
                `${this.site}/api/new/v2/series/${searchSlug}/chapters`,
                { headers: defaultHeaders },
              );
              cleanNovelPath = searchSlug;

              if (!apiRes.ok) {
                let SearchStr = searchSlug.replace(/-/g, ' ');
                let searchRes = await fetchApi(
                  `${this.site}/api/series/filter?page=1&per_page=20&search=${encodeURIComponent(SearchStr)}`,
                  { headers: defaultHeaders },
                ).then(r => r.json());

                if (!searchRes.data || searchRes.data.length === 0) {
                  const words = SearchStr.split(' ');
                  SearchStr =
                    words.length > 3 ? words.slice(0, 3).join(' ') : words[0];
                  searchRes = await fetchApi(
                    `${this.site}/api/series/filter?page=1&per_page=20&search=${encodeURIComponent(SearchStr)}`,
                    { headers: defaultHeaders },
                  ).then(r => r.json());
                }

                if (searchRes.data && searchRes.data.length > 0) {
                  cleanNovelPath = searchRes.data[0].slug;
                  apiRes = await fetchApi(
                    `${this.site}/api/new/v2/series/${cleanNovelPath}/chapters`,
                    { headers: defaultHeaders },
                  );
                }
              }
            }

            if (apiRes.ok) {
              const chaptersArray = await apiRes.json();
              if (Array.isArray(chaptersArray)) {
                const correctChapter = chaptersArray.find(
                  (c: any) => c.number === chapterNum,
                );
                if (correctChapter) {
                  const correctPath =
                    cleanNovelPath +
                    (correctChapter.group?.index == null
                      ? ''
                      : '/' + correctChapter.group.slug) +
                    '/' +
                    (correctChapter.slug || 'chapter-' + correctChapter.number);
                  page = await fetchApi(this.site + '/series/' + correctPath, {
                    headers: defaultHeaders,
                  }).then(r => r.text());
                  chapter = loadCheerio(page)('[id^="reader-area-"]');
                }
              }
            }
          } catch (e) {
            // ignore fallback errors
          }
        }
      }
    }

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
    let url = `${this.site}/api/series/filter?page=${pageNo}&per_page=20&search=${encodeURIComponent(
      searchTerm,
    )}`;
    let res = await fetchApi(url).then(r => r.json());

    if (pageNo === 1 && (!res.data || res.data.length === 0)) {
      const words = searchTerm.split(' ');
      const fallbackTerm = words.find(w => w.length > 3) || words[0];
      if (fallbackTerm && fallbackTerm !== searchTerm) {
        url = `${this.site}/api/series/filter?page=${pageNo}&per_page=20&search=${encodeURIComponent(
          fallbackTerm,
        )}`;
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
