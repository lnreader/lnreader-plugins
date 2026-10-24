import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
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
  user?: {
    username?: string;
    name?: string;
  };
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

type APIChapterContent = {
  id: number;
  uuid: string | null;
  content: string | null;
  content_format?: string;
  remint_chapter_id: number | null;
};

type ReadTokenResult = {
  token?: string;
  status?: number;
};

type HttpError = Error & { status?: number };

type ChapterInfo = {
  name: string;
  path: string;
  releaseTime: string;
  chapterNumber: number;
};

type Chapter = {
  type: string;
  content: {
    type: string;
    attrs?: Attrs;
    content: {
      type: string;
      text?: string;
      marks?: {
        type: string;
        attrs?: Attrs;
      }[];
    }[];
  }[];
};

type Attrs = {
  textAlign?: string;
  href?: string;
  level?: number;
};

type Nodes = {
  type: string;
  nodes?: {
    type: string;
    // couldnt find the sveltekit so disable eslint here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any[];
  }[];
};

class FenrirRealmPlugin implements Plugin.PluginBase {
  id = 'fenrir';
  name = 'Fenrir Realm';
  icon = 'src/en/fenrirrealm/icon.png';
  site = 'https://fenrirealm.com';
  version = '1.1.4';
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
    const params = new URLSearchParams({
      page: pageNo.toString(),
      per_page: '20',
      sort: showLatestNovels ? 'latest' : filters.sort.value,
    });
    if (filters.status.value) {
      params.append('statuses[]', filters.status.value);
    }
    filters.genres.value.forEach(g => params.append('genres[]', g));

    const res = await fetchApi(
      `${this.site}/api/new/v2/series?${params.toString()}`,
    ).then(r => {
      const failure = () => {
        const error: HttpError = new Error(
          'There was an error fetching the data from the server. Please try to open it in WebView',
        );
        // Keep the real HTTP status so an anti-bot refusal is distinguishable
        // from a parsing failure.
        if (!r.ok) error.status = r.status;
        return error;
      };
      if (!r.ok) throw failure();
      return r.json().catch(() => {
        throw failure();
      });
    });

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
      const searchSlug = slugMatch ? slugMatch[1] : novelPath;
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

    const seriesData: APINovel = await fetchApi(
      `${this.site}/api/new/v2/series/${cleanNovelPath}`,
    ).then(r => r.json());
    const summaryCheerio = loadCheerio(seriesData.description || '');

    const novel: Plugin.SourceNovel = {
      path: cleanNovelPath,
      name: seriesData.title || '',
      summary:
        summaryCheerio('p').length > 0
          ? summaryCheerio('p')
              .map((_, el) => loadCheerio(el).text())
              .get()
              .join('\n\n')
          : summaryCheerio.text() || '',
      author: seriesData.user?.name || seriesData.user?.username || '',
      cover: seriesData.cover
        ? this.site + '/' + seriesData.cover
        : defaultCover,
      genres: (seriesData.genres || []).map(g => g.name).join(','),
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
      let json = await this.fetchChapterContent(url);

      if (json.content_format === 'locked') {
        // Free chapters are gated behind a Cloudflare Turnstile check. Once it
        // has been passed in WebView, the session can mint a read token for
        // this chapter the same way the site's own reader does.
        const readToken = await this.mintReadToken(json);
        if (readToken.token) {
          json = await this.fetchChapterContent(url, readToken.token);
        }
        if (json.content_format === 'locked') {
          const error: HttpError = new Error(
            'Fenrir Realm requires a human verification check to read this chapter. Open it in WebView, complete the check, then try again.',
          );
          // Keep the read-token status (403 without a verified session) so
          // callers can tell an anti-bot refusal from a parsing failure.
          error.status = readToken.status;
          throw error;
        }
      }

      const content = json.content;

      if (content) {
        try {
          // Attempt 1: Handle legacy stringified TipTap JSON AST schema
          const parsedContent: Chapter = JSON.parse(content);
          if (
            parsedContent.type === 'doc' ||
            parsedContent.type === 'systemWindow'
          ) {
            return parsedContent.content
              .map(node => {
                if (node.type === 'paragraph') {
                  const innerHtml =
                    node.content
                      ?.map(c => {
                        if (c.type === 'text') {
                          let text = c.text;
                          if (c.marks) {
                            for (const mark of c.marks) {
                              if (mark.type === 'bold') text = `<b>${text}</b>`;
                              if (mark.type === 'italic')
                                text = `<i>${text}</i>`;
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
                    node.content?.map(c => c.text).join('') || '';
                  return `<h${level}>${innerHtml}</h${level}>`;
                }
                return '';
              })
              .join('\n');
          }
        } catch {
          /**
           * HTML Response Cleaner:
           * Fenrir Realm inserts anti-scraping & watermark elements:
           * 1. Scramble hidden divs (`div[aria-hidden="true"]`)
           * 2. Inline `<style>` blocks
           * 3. Reader attributions / Copy references (`.reader-attribution`, `[data-fr-attr]`)
           */
          const $ = loadCheerio(content);

          // Remove anti-scraping tags and inline CSS
          $('div[aria-hidden="true"]').remove();
          $('p[aria-hidden="true"]').remove();
          $('.reader-attribution').remove();
          $('[data-fr-attr]').remove();
          $('style').remove();

          // Target any remaining text elements containing copy references or bookmarks
          $('p, div, span, small').each((_, el) => {
            const text = $(el).text().trim();
            if (
              text.startsWith('Copy reference:') ||
              text.startsWith('Bookmark:')
            ) {
              $(el).remove();
            }
          });

          return $.html() || content;
        }
      }
    }

    // Fallback or old method
    const url = this.resolveUrl(chapterPath);
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = loadCheerio(body);

    // Clean up anti-scraping and watermark elements first
    loadedCheerio('[aria-hidden="true"]').remove();
    loadedCheerio('.reader-attribution').remove();
    loadedCheerio('[data-fr-attr]').remove();

    let chapterText = loadedCheerio(
      '.reader-area p, div.content-area p, [id^="reader-area"] p',
    )
      .map((_, el) => {
        const html = loadedCheerio(el).html()?.trim();
        return html ? `<p>${html}</p>` : '';
      })
      .get()
      .filter(Boolean)
      .join('\n');

    if (chapterText) {
      return chapterText;
    }

    // Fallback to SvelteKit JSON if HTML parsing fails or is empty
    try {
      const jsonUrl = `${this.resolveUrl(chapterPath)}/__data.json?x-sveltekit-invalidated=001`;
      const jsonRes = await fetchApi(jsonUrl);
      const json: Nodes = await jsonRes.json();

      const nodes = json.nodes;
      const data = nodes?.find(n => n.type === 'data')?.data;
      if (data) {
        const contentStr = data.find(
          d => typeof d === 'string' && d.includes('{"type":"doc"'),
        );

        if (contentStr) {
          const contentJson: Chapter = JSON.parse(contentStr);
          if (contentJson.type === 'doc') {
            chapterText = contentJson.content
              .map(node => {
                if (node.type === 'paragraph') {
                  const innerHtml =
                    node.content
                      ?.map(c => {
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

  async fetchChapterContent(
    url: string,
    readToken?: string,
  ): Promise<APIChapterContent> {
    const res = await fetchApi(url, {
      headers: readToken ? { Authorization: `Bearer ${readToken}` } : {},
    });
    if (!res.ok) {
      if ([401, 403, 429, 503].includes(res.status)) {
        const error: HttpError = new Error(
          `Failed to load chapter (HTTP ${res.status}). Open it in WebView and try again.`,
        );
        error.status = res.status;
        throw error;
      }
      return { id: 0, uuid: null, content: null, remint_chapter_id: null };
    }
    return res.json();
  }

  async mintReadToken(chapter: APIChapterContent): Promise<ReadTokenResult> {
    const chapterId = chapter.remint_chapter_id || chapter.uuid || chapter.id;
    try {
      const res = await fetchApi(`${this.site}/api/read-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ chapter_id: String(chapterId) }),
      });
      if (!res.ok) return { status: res.status };
      const json = await res.json();
      return json.active && json.token ? { token: json.token } : {};
    } catch {
      return {};
    }
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

  resolveUrl(path: string): string {
    // Volume chapter slugs now include the volume (e.g. "vol1/1"), so paths
    // built as novel/vol1/vol1/1 must drop the repeated volume segment.
    const chapterPath = path
      .split('~~')[0]
      .replace(/^([^/]+)\/([^/]+)\/\2\//, '$1/$2/');
    return `${this.site}/series/${chapterPath}`;
  }

  filters = {
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'on-going' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'On Hold', value: 'on-hold' },
        { label: 'Dropped', value: 'dropped' },
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
