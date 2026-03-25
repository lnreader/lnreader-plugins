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
  id: number;
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

    return (res.data || []).map((r: APINovel) => this.parseNovelFromApi(r));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    let cleanNovelPath = novelPath;
    let apiRes = await fetchApi(
      `${this.site}/api/new/v2/series/${novelPath}/chapters`,
      {},
    );

    if (!apiRes.ok) {
      const slugMatch = novelPath.match(/^\d+-(.+)$/);
      let searchSlug = slugMatch ? slugMatch[1] : novelPath;
      apiRes = await fetchApi(
        `${this.site}/api/new/v2/series/${searchSlug}/chapters`,
        {},
      );
      cleanNovelPath = searchSlug;

      if (!apiRes.ok) {
        const words = searchSlug.replace(/-/g, ' ').split(' ');
        const SearchStr = words.find(w => w.length > 3) || words[0];
        const searchRes = await fetchApi(
          `${this.site}/api/series/filter?page=1&per_page=20&search=${encodeURIComponent(SearchStr)}`,
        ).then(r => r.json());

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

    let chapters = await apiRes.json();

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
          (c.slug || 'chapter-' + c.number) +
          '~~' +
          c.id,
        releaseTime: c.created_at,
        chapterNumber: c.number + (c.group?.index || 0) * 10000,
      }))
      .sort(
        (a: ChapterInfo, b: ChapterInfo) => a.chapterNumber - b.chapterNumber,
      );
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const chapterId = chapterPath.split('~~')[1];
    if (chapterId) {
      const url = `${this.site}/api/new/v2/chapters/${chapterId}`;
      const res = await fetchApi(url);
      const json = await res.json();
      const content = json.content;

      if (content) {
        const parsedContent = JSON.parse(content);
        if (parsedContent.type === 'doc') {
          return parsedContent.content
            .map((node: any) => {
              if (node.type === 'paragraph') {
                const innerHtml =
                  node.content
                    ?.map((c: any) => {
                      if (c.type === 'text') {
                        let text = c.text;
                        if (c.marks) {
                          for (const mark of c.marks) {
                            if (mark.type === 'bold') text = `<b>${text}</b>`;
                            if (mark.type === 'italic') text = `<i>${text}</i>`;
                            if (mark.type === 'underline')
                              text = `<u>${text}</u>`;
                            if (mark.type === 'strike')
                              text = `<strike>${text}</strike>`;
                            if (mark.type === 'link')
                              text = `<a href="${mark.attrs?.href}">${text}</a>`;
                          }
                        }
                        return text;
                      }
                      if (c.type === 'hardBreak') return '<br>';
                      return '';
                    })
                    .join('') || '';
                return `<p>${innerHtml}</p>`;
              }
              if (node.type === 'heading') {
                const level = node.attrs?.level || 1;
                const innerHtml =
                  node.content?.map((c: any) => c.text).join('') || '';
                return `<h${level}>${innerHtml}</h${level}>`;
              }
              return '';
            })
            .join('\n');
        }
      }
    }

    // Fallback or old method
    const url = `${this.site}/series/${chapterPath.split('~~')[0]}`;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = loadCheerio(body);

    let chapterText = loadedCheerio('div.content-area p')
      .map((i, el) => `<p>${loadCheerio(el).html()}</p>`)
      .get()
      .join('\n');

    if (chapterText) {
      return chapterText;
    }

    // Fallback to SvelteKit JSON if HTML parsing fails or is empty
    try {
      const jsonUrl = `${this.site}/series/${chapterPath.split('~~')[0]}/__data.json?x-sveltekit-invalidated=001`;
      const jsonRes = await fetchApi(jsonUrl);
      const json = await jsonRes.json();

      const nodes = json.nodes;
      const data = nodes?.find((n: any) => n.type === 'data')?.data;
      if (data) {
        const contentStr = data.find(
          (d: any) => typeof d === 'string' && d.includes('{"type":"doc"'),
        );

        if (contentStr) {
          const contentJson = JSON.parse(contentStr);
          if (contentJson.type === 'doc') {
            chapterText = contentJson.content
              .map((node: any) => {
                if (node.type === 'paragraph') {
                  const innerHtml =
                    node.content
                      ?.map((c: any) => {
                        if (c.type === 'text') {
                          let text = c.text;
                          if (c.marks) {
                            for (const mark of c.marks) {
                              if (mark.type === 'bold') text = `<b>${text}</b>`;
                              if (mark.type === 'italic')
                                text = `<i>${text}</i>`;
                            }
                          }
                          return text;
                        }
                        return '';
                      })
                      .join('') || '';
                  return `<p>${innerHtml}</p>`;
                }
                return '';
              })
              .join('\n');
          }
        }
      }
    } catch (e) {
      // ignore
    }

    return chapterText;
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
    this.site + '/series/' + path.split('~~')[0];

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
