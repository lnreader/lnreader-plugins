import { Parser } from 'htmlparser2';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters } from '@libs/filterInputs';

type ReadNovelFullOptions = {
  lang?: string;
  versionIncrements?: number;
  latestPage: string;
  searchPage: string;
  chapterListing?: string;
  chapterParam?: string;
  pageParam?: string;
  novelListing?: string;
  typeParam?: string;
  genreParam?: string;
  genreKey?: string;
  langParam?: string;
  urlLangCode?: string;
  searchKey?: string;
  postSearch?: boolean;
  noAjax?: boolean;
  noPages?: string[];
  pageAsPath?: boolean;
  down?: boolean;
  downSince?: string;
};

export type ReadNovelFullMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  options: ReadNovelFullOptions;
  filters?: any;
};

class ReadNovelFullPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  options: ReadNovelFullOptions;
  filters?: Filters | undefined;

  constructor(metadata: ReadNovelFullMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = `multisrc/readnovelfull/${metadata.id.toLowerCase()}/icon.png`;
    this.site = metadata.sourceSite;
    const versionIncrements = metadata.options?.versionIncrements || 0;
    this.version = `2.1.${2 + versionIncrements}`;
    this.options = metadata.options;
    this.filters = metadata.filters;
  }

  lastSearch: number | null = null;
  searchInterval = 3400;

  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  parseNovels(html: string) {
    const novels: Plugin.NovelItem[] = [];
    let tempNovel: Partial<Plugin.NovelItem> = {};
    let depth: number;

    const stateStack: ParsingState[] = [ParsingState.Idle];
    const currentState = () => stateStack[stateStack.length - 1];
    const pushState = (state: ParsingState) => stateStack.push(state);
    const popState = () =>
      stateStack.length > 1 ? stateStack.pop() : currentState();

    const parser = new Parser({
      onopentag: (name, attribs) => {
        const state = currentState();
        if (
          attribs.class?.includes('archive') ||
          attribs.class === 'col-content'
        ) {
          pushState(ParsingState.NovelList);
          depth = 0;
        }

        if (
          state !== ParsingState.NovelList &&
          state !== ParsingState.NovelName
        )
          return;

        switch (name) {
          case 'img':
            const cover = attribs['data-src'] || attribs.src;
            if (cover) {
              tempNovel.cover = new URL(cover, this.site).href;
            }
            break;
          case 'h3':
            if (state === ParsingState.NovelList) {
              pushState(ParsingState.NovelName);
            }
            break;
          case 'a':
            if (state === ParsingState.NovelName) {
              const href = attribs.href;
              if (href) {
                tempNovel.path = new URL(href, this.site).pathname.substring(1);
                tempNovel.name = attribs.title;
              }
            }
            break;
          case 'div':
            depth++;
            break;
          default:
            return;
        }
      },

      onclosetag: name => {
        const state = currentState();
        if (name === 'a' && state === ParsingState.NovelName) {
          if (tempNovel.name && tempNovel.path) {
            novels.push({ ...tempNovel } as Plugin.NovelItem);
          }
          tempNovel = {};
          popState();
        }
        if (name === 'div' && state === ParsingState.NovelList) {
          depth--;
          if (depth < 0) popState();
        }
      },
    });

    parser.write(html);
    parser.end();

    return novels;
  }

  async popularNovels(
    pageNo: number,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const {
      pageParam = 'page',
      novelListing,
      typeParam = 'type',
      latestPage,
      genreParam = 'category_novel',
      genreKey = 'id',
      langParam,
      urlLangCode,
      noPages = [],
      pageAsPath = false,
    } = this.options;

    // Skip Pagination for FWN & LR
    if (
      pageNo !== 1 &&
      !showLatestNovels &&
      !filters.genres.value.length &&
      noPages.length > 0 &&
      noPages.includes(filters.type.value)
    ) {
      return [];
    }

    let url = '';

    if (novelListing) {
      // URL structure with parameters
      const params = new URLSearchParams();

      if (showLatestNovels) {
        params.append(typeParam, latestPage);
      } else if (filters.genres.value.length) {
        params.append(typeParam, genreParam);
        params.append(genreKey, filters.genres.value);
      } else {
        params.append(typeParam, filters.type.value);
      }

      // Add language parameter if specified
      if (langParam && urlLangCode) {
        params.append(langParam, urlLangCode);
      }

      params.append(pageParam, pageNo.toString());
      url = `${this.site}${novelListing}?${params.toString()}`;
    } else {
      // URL structure with path segments
      const basePage = showLatestNovels
        ? latestPage
        : filters.genres.value.length
          ? filters.genres.value
          : filters.type.value;

      if (pageAsPath) {
        if (pageNo > 1) {
          url = `${this.site}${basePage}/${pageNo.toString()}`;
        } else {
          url = `${this.site}${basePage}`;
        }
      } else {
        url = `${this.site}${basePage}?${pageParam}=${pageNo.toString()}`;
      }
    }

    const result = await fetchApi(url);
    if (!result.ok) {
      throw new Error(
        `Could not reach site (${result.status}: ${result.statusText}) try to open in webview.`,
      );
    }
    const html = await result.text();
    return this.parseNovels(html);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const result = await fetchApi(url);
    const body = await result.text();

    const novel: Partial<Plugin.SourceNovel> = {
      path: novelPath,
      chapters: [],
    };
    const summaryParts: string[] = [];
    const statusParts: string[] = [];
    const authorParts: string[] = [];
    const genreArray: string[] = [];
    const infoParts: string[] = [];
    const chapters: Plugin.ChapterItem[] = [];
    let novelId: string | null = null;
    let tempChapter: Partial<Plugin.ChapterItem> = {};
    let i = 0;
    let depth: number;

    const stateStack: ParsingState[] = [ParsingState.Idle];
    const currentState = () => stateStack[stateStack.length - 1];
    const pushState = (state: ParsingState) => stateStack.push(state);
    const popState = () =>
      stateStack.length > 1 ? stateStack.pop() : currentState();

    const parser = new Parser({
      onopentag: (name, attribs) => {
        const state = currentState();
        switch (name) {
          case 'div':
            switch (attribs.class) {
              case 'books':
              case 'm-imgtxt':
                pushState(ParsingState.Cover);
                return;
              case 'inner':
              case 'desc-text':
                if (state === ParsingState.Cover) popState();
                pushState(ParsingState.Summary);
                break;
              case 'info':
                pushState(ParsingState.Info);
                depth = 0;
                break;
            }
            if (!this.options.noAjax && attribs.id === 'rating') {
              novelId = attribs['data-novel-id'];
            }
            if (state === ParsingState.Info) depth++;
            break;
          case 'img':
            if (state === ParsingState.Cover) {
              const cover =
                attribs.src ?? attribs['data-cfsrc'] ?? attribs['data-src'];
              const name = attribs.title;
              if (cover) {
                novel.cover = new URL(cover, this.site).href;
              }
              if (name) {
                novel.name = name;
              } else {
                popState();
              }
            }
            break;
          case 'h3':
            if (state === ParsingState.Cover) {
              pushState(ParsingState.NovelName);
            }
            break;
          case 'span':
            if (state === ParsingState.Cover && attribs.title) {
              const newState = {
                'Genre': ParsingState.Genres,
                'Author': ParsingState.Author,
                'Status': ParsingState.Status,
              }[attribs.title];

              if (newState) pushState(newState);
            }
            break;
          case 'br':
            if (state === ParsingState.Summary) {
              summaryParts.push('\n');
            }
            break;
          case 'ul':
            if (attribs.class?.includes('info-meta')) {
              pushState(ParsingState.Info);
            }
            if (this.options.noAjax && attribs.id === 'idData') {
              pushState(ParsingState.ChapterList);
            }
            break;
          case 'a':
            if (state === ParsingState.ChapterList) {
              i++;
              const href = attribs.href;
              pushState(ParsingState.Chapter);

              tempChapter.name = attribs.title || `Chapter ${i}`;
              tempChapter.releaseTime = null;
              tempChapter.chapterNumber = i;
              tempChapter.path =
                href?.substring(1) ||
                novelPath.replace('.html', `/chapter-${i}.html`);
            }
            break;
        }
      },

      ontext: data => {
        const text = data.trim();
        if (!text) return;

        switch (currentState()) {
          case ParsingState.NovelName:
            novel.name = (novel.name || '') + text;
            break;
          case ParsingState.Summary:
            summaryParts.push(data);
            break;
          case ParsingState.Info:
            infoParts.push(text);
            break;
          case ParsingState.Genres:
            genreArray.push(data);
            break;
          case ParsingState.Author:
            authorParts.push(data);
            break;
          case ParsingState.Status:
            statusParts.push(text);
            break;
        }
      },

      onclosetag: name => {
        const state = currentState();
        switch (name) {
          case 'div':
            switch (state) {
              case ParsingState.Info:
                depth--;
                infoParts.push('\n');
                if (depth < 0) {
                  popState();
                }
                break;
              case ParsingState.Genres:
              case ParsingState.Author:
              case ParsingState.Status:
              case ParsingState.Summary:
                popState();
                break;
            }
            break;
          case 'h3':
            if (state === ParsingState.NovelName) {
              popState();
            }
            break;
          case 'a':
            if (state === ParsingState.Chapter) {
              if (tempChapter.name && tempChapter.path) {
                chapters.push({ ...tempChapter } as Plugin.ChapterItem);
              }
              tempChapter = {};
              popState();
            }
            break;
          case 'li':
            if (state === ParsingState.Info) {
              infoParts.push('\n');
            }
            break;
          case 'ul':
            switch (state) {
              case ParsingState.Info:
              case ParsingState.ChapterList:
                popState();
                break;
            }
            break;
          default:
            return;
        }
      },

      onend: () => {
        if (infoParts.length) {
          infoParts
            .join('')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.includes(':'))
            .forEach(line => {
              const parts = line.split(':');
              const detailName = parts[0].trim().toLowerCase();
              const detail = parts[1]
                .split(',')
                .map(g => g.trim())
                .join(', ');

              switch (detailName) {
                case 'author':
                  novel.author = detail;
                  break;
                case 'genre':
                  novel.genres = detail;
                  break;
                case 'status':
                  const map: Record<string, string> = {
                    ongoing: NovelStatus.Ongoing,
                    hiatus: NovelStatus.OnHiatus,
                    dropped: NovelStatus.Cancelled,
                    cancelled: NovelStatus.Cancelled,
                    completed: NovelStatus.Completed,
                  };
                  novel.status =
                    map[detail.toLowerCase()] ?? NovelStatus.Unknown;
                  break;
                default:
                  return;
              }
            });

          if (!novelId) {
            const idMatch = novelPath.match(/\d+/);
            novelId = idMatch ? idMatch[0] : null;
          }
        } else {
          novel.genres = genreArray.join('').trim();
          novel.author = authorParts.join('').trim();
          novel.status = statusParts
            .join('')
            .toLowerCase()
            .replace(/\b\w/g, char => char.toUpperCase());
        }
        novel.summary = summaryParts.join('\n\n').trim();
      },
    });

    parser.write(body);
    parser.end();

    if (this.options.noAjax && chapters.length > 0) {
      novel.chapters = chapters;
    } else if (novelId !== null) {
      const chapterListing =
        this.options.chapterListing || 'ajax/chapter-archive';
      const ajaxParam = this.options.chapterParam || 'novelId';
      const params = new URLSearchParams({ [ajaxParam]: novelId });
      const chaptersUrl = `${this.site}${chapterListing}?${params.toString()}`;

      const ajaxResult = await fetchApi(chaptersUrl);
      if (!ajaxResult.ok) {
        console.error(`Failed to fetch chapters: ${ajaxResult.status}`);
        novel.chapters = [];
      } else {
        const ajaxBody = await ajaxResult.text();
        const ajaxChapters: Plugin.ChapterItem[] = [];
        let tempAjaxChapter: Partial<Plugin.ChapterItem> = {};

        const ajaxParser = new Parser({
          onopentag: (name, attribs) => {
            let chapterHref: string | undefined;
            let initialName: string | undefined;

            if (name === 'a' && attribs.href) {
              chapterHref = attribs.href;
              initialName = attribs.title || '';
              pushState(ParsingState.Chapter);
            } else if (name === 'option' && attribs.value) {
              chapterHref = attribs.value;
              initialName = '';
              pushState(ParsingState.Chapter);
            }

            if (chapterHref !== undefined) {
              const href = new URL(chapterHref, this.site);
              tempAjaxChapter.path = href.pathname.substring(1);
              tempAjaxChapter.name = initialName;
            }
          },

          ontext: data => {
            const text = data.trim();
            if (
              currentState() === ParsingState.Chapter &&
              !tempAjaxChapter.name &&
              text
            ) {
              tempAjaxChapter.name += text;
            }
          },

          onclosetag: name => {
            if (
              (name === 'a' || name === 'option') &&
              currentState() === ParsingState.Chapter
            ) {
              if (tempAjaxChapter.name && tempAjaxChapter.path) {
                tempAjaxChapter.name = tempAjaxChapter.name.trim();
                tempAjaxChapter.releaseTime = null;
                ajaxChapters.push({
                  ...tempAjaxChapter,
                } as Plugin.ChapterItem);
              }
              tempAjaxChapter = {};
              popState();
            }
          },
        });

        ajaxParser.write(ajaxBody);
        ajaxParser.end();
        novel.chapters = ajaxChapters;
      }
    }

    return novel as Plugin.SourceNovel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const response = await fetchApi(this.site + chapterPath);
    const html = await response.text();

    let depth: number;
    let depthHide: number;
    const chapterHtml: string[] = [];
    let skipClosingTag = false;
    let currentTagToSkip = '';

    const stateStack: ParsingState[] = [ParsingState.Idle];
    const currentState = () => stateStack[stateStack.length - 1];
    const pushState = (state: ParsingState) => stateStack.push(state);
    const popState = () =>
      stateStack.length > 1 ? stateStack.pop() : currentState();

    type EscapeChar = '&' | '<' | '>' | '"' | "'" | ' ';
    const escapeRegex = /[&<>"' ]/g;
    const escapeMap: Record<EscapeChar, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      ' ': '&nbsp;',
    };
    const escapeHtml = (text: string): string =>
      text.replace(escapeRegex, char => escapeMap[char as EscapeChar]);

    const parser = new Parser({
      onopentag(name, attribs) {
        const state = currentState();
        const attrib = attribs.class?.trim();
        switch (state) {
          case ParsingState.Idle:
            if (
              attrib === 'txt' ||
              attribs.id === 'chr-content' ||
              attribs.id === 'chapter-content'
            ) {
              pushState(ParsingState.Chapter);
              depth = 0;
            }
            break;
          case ParsingState.Chapter:
            if (name === 'sub') {
              pushState(ParsingState.Hidden);
            } else if (name === 'div') {
              depth++;
              if (
                attrib?.includes('unlock-buttons') ||
                attrib?.includes('ads')
              ) {
                pushState(ParsingState.Hidden);
                depthHide = 0;
              }
            }
            break;
          case ParsingState.Hidden:
            if (name === 'sub') {
              // Allow nesting of hidden states if a sub is inside a div
              pushState(ParsingState.Hidden);
            } else if (name === 'div') {
              depthHide++;
            }
            break;
          default:
            return;
        }

        if (currentState() === ParsingState.Chapter) {
          const attrKeys = Object.keys(attribs);

          if (attrKeys.length === 0) {
            chapterHtml.push(`<${name}>`);
          } else if (attrKeys.every(key => attribs[key].trim() === '')) {
            // Handle tags with empty attributes as text content
            // eg: novel/rising-up-from-a-nobleman-to-intergalactic-warlord/chapter-184
            skipClosingTag = true;
            currentTagToSkip = name;
            const uppercaseName = name.replace(/\b\w/g, char =>
              char.toUpperCase(),
            );
            chapterHtml.push(
              escapeHtml(`<${uppercaseName} ${attrKeys.join(' ')}>`),
            );
          } else {
            // Normal tag with attributes
            const attrString = attrKeys
              .map(key => ` ${key}="${attribs[key].replace(/"/g, '&quot;')}"`)
              .join('');
            chapterHtml.push(`<${name}${attrString}>`);
          }
        }
      },

      ontext(text) {
        if (currentState() === ParsingState.Chapter) {
          chapterHtml.push(escapeHtml(text));
        }
      },

      onclosetag(name) {
        const state = currentState();

        if (state === ParsingState.Hidden) {
          if (name === 'sub') {
            popState();
          } else if (name === 'div') {
            depthHide--;
            if (depthHide < 0) {
              popState();
              depth--;
            }
          }
        }

        if (state !== ParsingState.Chapter) {
          return;
        }

        if (!parser['isVoidElement'](name)) {
          if (skipClosingTag && name === currentTagToSkip) {
            skipClosingTag = false;
            currentTagToSkip = '';
          } else {
            chapterHtml.push(`</${name}>`);
          }
        }

        if (name === 'div') {
          depth--;
          if (depth < 0) {
            pushState(ParsingState.Stopped);
          }
        }
      },
    });

    parser.write(html);
    parser.end();

    return chapterHtml.join('');
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const now = Date.now();
    if (this.lastSearch && now - this.lastSearch <= this.searchInterval) {
      await this.sleep(this.searchInterval);
    }

    const {
      pageParam = 'page',
      searchKey = 'keyword',
      postSearch,
      langParam,
      urlLangCode,
      searchPage,
    } = this.options;

    const params = new URLSearchParams({
      [searchKey]: searchTerm,
      ...(langParam && urlLangCode && { [langParam]: urlLangCode }),
      ...(!postSearch && { [pageParam]: page.toString() }),
    });

    const url = `${this.site}${searchPage}${!postSearch ? `?${params.toString()}` : ''}`;

    const fetchOptions: RequestInit | undefined = postSearch
      ? {
          method: 'POST',
          body: params.toString(),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      : undefined;

    const result = await fetchApi(url, fetchOptions);
    this.lastSearch = Date.now();

    if (!result.ok) {
      throw new Error(
        `Could not reach site ('${result.status}') try to open in webview.`,
      );
    }

    const html = await result.text();

    // Check for alert error messages, ported over from cheerio TODO: confirm behaviour
    const alertText = html.match(/alert\((.*?)\)/)?.[1] || '';
    if (alertText) throw new Error(alertText);

    return this.parseNovels(html);
  }
}

enum ParsingState {
  Idle,
  Info,
  Cover,
  Author,
  Genres,
  Status,
  Hidden,
  Summary,
  Stopped,
  Chapter,
  ChapterList,
  NovelName,
  NovelList,
}
