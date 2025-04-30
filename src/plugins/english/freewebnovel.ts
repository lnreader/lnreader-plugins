import { Plugin } from '@typings/plugin';
import { fetchApi } from '@libs/fetch';
import { Parser } from 'htmlparser2';
import { Filters, FilterTypes } from '@libs/filterInputs';

class FreeWebNovel implements Plugin.PluginBase {
  id = 'FWN.com';
  name = 'Free Web Novel';
  site = 'https://freewebnovel.com/';
  version = '2.0.2';
  icon = 'src/en/freewebnovel/icon.png';

  lastSearch: number | null = null;
  searchInterval = 3400;

  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getHtml(url: string): Promise<string> {
    const r = await fetchApi(url);
    if (!r.ok)
      throw new Error(
        `Could not reach site (${r.status}: ${r.statusText}) try to open in webview.`,
      );
    return await r.text();
  }

  parseNovels(html: string) {
    const baseUrl = this.site;
    const novels: Plugin.NovelItem[] = [];
    let tempNovel: Partial<Plugin.NovelItem> = {};
    let state: ParsingState = ParsingState.Idle;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (attribs.class === 'li-row') {
          state = ParsingState.Novel;
        }
        if (state !== ParsingState.Novel) return;

        switch (name) {
          case 'a':
            tempNovel.path = attribs.href?.split('/').slice(1, 3).join('/');
            break;
          case 'img':
            const coverSrc = attribs.src || '';
            tempNovel.name = attribs.title;
            tempNovel.cover = coverSrc.startsWith('http')
              ? coverSrc
              : baseUrl + coverSrc;
            break;
        }
      },

      onclosetag(name) {
        if (name === 'div') {
          if (tempNovel.name && tempNovel.path) {
            novels.push({ ...tempNovel } as Plugin.NovelItem);
          }
          tempNovel = {};
          state = ParsingState.Idle;
        }
      },
    });

    parser.write(html);
    parser.end();

    return novels;
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let path: string;

    if (showLatestNovels) {
      path = 'sort/latest-novels/';
    } else if (filters?.genres?.value) {
      path = filters.genres.value;
    } else {
      if (page !== 1) return [];
      path = 'most-popular/';
      page = 0;
    }

    const url = `${this.site}${path}${page}`;
    const body = await this.getHtml(url);
    return this.parseNovels(body);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const baseUrl = this.site;
    const body = await this.getHtml(this.site + novelPath);
    const novel: Partial<Plugin.SourceNovel> = {
      path: novelPath,
    };

    let i = 0;
    let state: ParsingState = ParsingState.Idle;
    let tempChapter: Partial<Plugin.ChapterItem> = {};
    const chapter: Plugin.ChapterItem[] = [];
    const summaryParts: string[] = [];
    const statusParts: string[] = [];
    const authorParts: string[] = [];
    const genreArray: string[] = [];

    const parser = new Parser({
      onopentag(name, attribs) {
        switch (name) {
          case 'div':
            switch (attribs.class) {
              case 'm-imgtxt':
                state = ParsingState.NovelInfo;
                break;
              case 'inner':
                state = ParsingState.Summary;
                break;
              case 'm-desc':
                state = ParsingState.Idle;
                break;
            }
            break;
          case 'img':
            if (state === ParsingState.NovelInfo) {
              novel.name = attribs.title;
              novel.cover = baseUrl + attribs.src;
            }
            break;
          case 'span':
            if (state === ParsingState.NovelInfo) {
              if (attribs.title) {
                const map: Record<string, ParsingState> = {
                  'Genre': ParsingState.Genre,
                  'Author': ParsingState.Author,
                  'Status': ParsingState.Status,
                };
                state = map[attribs.title] ?? state;
              }
            }
            break;
          case 'ul':
            if (attribs.id === 'idData') {
              state = ParsingState.ChapterList;
            }
            break;
          case 'a':
            if (state === ParsingState.ChapterList) {
              i++;
              const href = attribs.href;
              state = ParsingState.Chapter;

              tempChapter.name = attribs.title || `Chapter ${i}`;
              tempChapter.releaseTime = null;
              tempChapter.chapterNumber = i;
              tempChapter.path =
                href?.slice(1) ||
                novelPath.replace('.html', `/chapter-${i}.html`);
            }
            break;
          default:
            return;
        }
      },

      ontext(text) {
        switch (state) {
          case ParsingState.Genre:
            genreArray.push(text);
            break;
          case ParsingState.Author:
            authorParts.push(text);
            break;
          case ParsingState.Status:
            statusParts.push(text.trim());
            break;
          case ParsingState.Summary:
            summaryParts.push(text.trim());
            break;
          default:
            return;
        }
      },

      onclosetag(name) {
        switch (name) {
          case 'div':
            switch (state) {
              case ParsingState.Genre:
              case ParsingState.Author:
              case ParsingState.Status:
                state = ParsingState.NovelInfo;
                break;
              case ParsingState.Summary:
                state = ParsingState.Idle;
            }
          case 'a':
            if (state === ParsingState.Chapter) {
              if (tempChapter.name && tempChapter.path) {
                chapter.push({ ...tempChapter } as Plugin.ChapterItem);
              }
              tempChapter = {};
              state = ParsingState.ChapterList;
            }
            break;
          case 'ul':
            if (state === ParsingState.ChapterList) {
              state = ParsingState.Idle;
            }
            break;
          default:
            return;
        }
      },

      onend() {
        novel.chapters = chapter;
        novel.genres = genreArray.join('').trim();
        novel.author = authorParts.join('').trim();
        novel.summary = summaryParts.join('\n\n');
        novel.status = statusParts
          .join('')
          .toLowerCase()
          .replace(/\b\w/g, char => char.toUpperCase());
      },
    });

    parser.write(body);
    parser.end();

    return novel as Plugin.SourceNovel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.getHtml(this.site + chapterPath);
    const match = html.match(/e\("([^]+?)"/);
    const check = match ? match[1] : '';
    const body = check ? html.replace(check, '') : html;

    let depth = 0;
    let state: ParsingState = ParsingState.Idle;
    const chapterHtml: string[] = [];
    let skipClosingTag = false;
    let currentTagToSkip = '';

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
        const attrib = attribs.class?.trim();
        switch (state) {
          case ParsingState.Idle:
            if (attrib === 'txt') {
              state = ParsingState.Chapter;
              depth++;
            }
            break;
          case ParsingState.Chapter:
            if (name === 'div') depth++;
            break;
          default:
            return;
        }

        if (state === ParsingState.Chapter) {
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
        if (state === ParsingState.Chapter) {
          chapterHtml.push(escapeHtml(text));
        }
      },

      onclosetag(name) {
        if (state !== ParsingState.Chapter) return;

        if (!parser['isVoidElement'](name)) {
          if (skipClosingTag && name === currentTagToSkip) {
            skipClosingTag = false;
            currentTagToSkip = '';
          } else {
            chapterHtml.push(`</${name}>`);
          }
        }

        if (name === 'div') depth--;
        if (depth === 0) state = ParsingState.Stopped;
      },
    });

    parser.write(body);
    parser.end();

    return chapterHtml.join('');
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const now = Date.now();
    if (this.lastSearch && now - this.lastSearch <= this.searchInterval) {
      await this.sleep(this.searchInterval);
    }

    const r = await fetchApi(this.site + 'search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ searchkey: searchTerm }).toString(),
    });

    this.lastSearch = Date.now();

    if (!r.ok) {
      throw new Error(
        `Could not reach site ('${r.status}') try to open in webview.`,
      );
    }

    const body = await r.text();
    const alertText = body.match(/alert\((.*?)\)/)?.[1] || '';
    if (alertText) throw new Error(alertText);

    return this.parseNovels(body);
  }

  filters = {
    genres: {
      type: FilterTypes.Picker,
      label: 'Genre',
      value: '',
      options: [
        { label: 'Action', value: 'genre/Action/' },
        { label: 'Adult', value: 'genre/Adult/' },
        { label: 'Adventure', value: 'genre/Adventure/' },
        { label: 'Comedy', value: 'genre/Comedy/' },
        { label: 'Drama', value: 'genre/Drama/' },
        { label: 'Eastern', value: 'genre/Eastern' },
        { label: 'Ecchi', value: 'genre/Ecchi/' },
        { label: 'Fantasy', value: 'genre/Fantasy/' },
        { label: 'Gender Bender', value: 'genre/Gender+Bender/' },
        { label: 'Harem', value: 'genre/Harem/' },
        { label: 'Historical', value: 'genre/Historical/' },
        { label: 'Horror', value: 'genre/Horror/' },
        { label: 'Josei', value: 'genre/Josei/' },
        { label: 'Game', value: 'genre/Game/' },
        { label: 'Martial Arts', value: 'genre/Martial+Arts/' },
        { label: 'Mature', value: 'genre/Mature/' },
        { label: 'Mecha', value: 'genre/Mecha/' },
        { label: 'Mystery', value: 'genre/Mystery/' },
        { label: 'Psychological', value: 'genre/Psychological/' },
        { label: 'Reincarnation', value: 'genre/Reincarnation' },
        { label: 'Romance', value: 'genre/Romance/' },
        { label: 'School Life', value: 'genre/School+Life/' },
        { label: 'Sci-fi', value: 'genre/Sci-fi/' },
        { label: 'Seinen', value: 'genre/Seinen/' },
        { label: 'Shoujo', value: 'genre/Shoujo/' },
        { label: 'Shounen Ai', value: 'genre/Shounen+Ai/' },
        { label: 'Shounen', value: 'genre/Shounen/' },
        { label: 'Slice of Life', value: 'genre/Slice+of+Life/' },
        { label: 'Smut', value: 'genre/Smut/' },
        { label: 'Sports', value: 'genre/Sports/' },
        { label: 'Supernatural', value: 'genre/Supernatural/' },
        { label: 'Tragedy', value: 'genre/Tragedy/' },
        { label: 'Wuxia', value: 'genre/Wuxia/' },
        { label: 'Xianxia', value: 'genre/Xianxia/' },
        { label: 'Xuanhuan', value: 'genre/Xuanhuan/' },
        { label: 'Yaoi', value: 'genre/Yaoi/' },
      ],
    },
  } satisfies Filters;
}

export default new FreeWebNovel();

enum ParsingState {
  Idle,
  Novel,
  Genre,
  Author,
  Status,
  Summary,
  NovelInfo,
  ChapterList,
  Chapter,
  Stopped,
}
