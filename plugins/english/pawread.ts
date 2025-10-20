import { Parser } from 'htmlparser2';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';

class PawRead implements Plugin.PluginBase {
  id = 'pawread';
  name = 'PawRead';
  version = '2.1.0';
  icon = 'src/en/pawread/icon.png';
  site = 'https://m.pawread.com/';

  parseNovels(html: string) {
    const novels: Plugin.NovelItem[] = [];
    let tempNovel: Partial<Plugin.NovelItem> = {};
    let state: ParsingState = ParsingState.Idle;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (
          attribs.class &&
          (attribs.class.includes('list-comic') ||
            attribs.class.includes('itemBox'))
        ) {
          state = ParsingState.Novel;
        }

        if (state !== ParsingState.Novel) return;

        switch (name) {
          case 'a':
            if (attribs.class === 'txtA' || attribs.class === 'title') {
              tempNovel.path = attribs.href.split('/').slice(1, 3).join('/');
              state = ParsingState.NovelName;
            }
            break;
          case 'img':
            tempNovel.cover = attribs.src;
            break;
        }
      },

      ontext(text) {
        if (state === ParsingState.NovelName) {
          tempNovel.name = (tempNovel.name || '') + text;
        }
      },

      onclosetag(name) {
        if (name === 'a') {
          if (tempNovel.name && tempNovel.cover) {
            novels.push(tempNovel as Plugin.NovelItem);
            tempNovel = {};
            state = ParsingState.Idle;
          }
        }
      },
    });

    parser.write(html);
    parser.end();

    return novels;
  }

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}list/`;

    const filterValues = [
      filters.genre.value,
      filters.status.value,
      filters.lang.value,
    ].filter(value => value !== '');

    if (filterValues.length > 0) {
      link += filterValues.join('-') + '/';
    }

    link += (filters.order.value ? '-' : '') + filters.sort.value;
    link += `/?page=${page}`;

    const body = await fetchApi(link).then(r => r.text());
    return this.parseNovels(body);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slash = novelPath.endsWith('/') ? '' : '/';
    const result = await fetchApi(this.site + novelPath + slash);
    const body = await result.text();

    const novel: Partial<Plugin.SourceNovel> = {
      path: novelPath,
    };

    let depth = 0;
    let state = ParsingState.Idle;
    let tempChapter: Partial<Plugin.ChapterItem> = {};
    const chapter: Plugin.ChapterItem[] = [];
    const summaryParts: string[] = [];
    const genreArray: string[] = [];

    const parser = new Parser({
      onopentag(name, attribs) {
        switch (name) {
          case 'div':
            if (attribs.id === 'Cover') {
              state = ParsingState.Cover;
            }
            if (attribs.class?.includes('item-box')) {
              state = ParsingState.Chapter;
              const path = attribs.onclick.match(/\d+/)![0];
              tempChapter.path = `${novelPath}${slash}${path}.html`;
              return;
            }
            if (state === ParsingState.Chapter) depth++;
            break;
          case 'img':
            if (state === ParsingState.Cover) {
              novel.name = attribs.title;
              novel.cover = attribs.src;
            }
            break;
          case 'p':
            if (attribs.class === 'txtItme') {
              if (!novel.status) {
                state = ParsingState.Status;
              } else if (!novel.author) {
                state = ParsingState.Author;
              }
            } else if (attribs.id === 'full-des') {
              state = ParsingState.Summary;
            }
            break;
          case 'br':
            summaryParts.push('\n');
            break;
          case 'a':
            if (attribs.class?.includes('btn-default')) {
              state = ParsingState.Genres;
            }
            break;
          case 'span':
            if (state === ParsingState.Chapter) depth++;
            if (depth === 2) {
              state = ParsingState.ChapterName;
            } else if (depth === 1) {
              state = ParsingState.ChapterTime;
            }
            break;
        }
      },

      ontext(text) {
        switch (state) {
          case ParsingState.Status:
            novel.status = (novel.status || '') + text.trim();
            break;
          case ParsingState.Author:
            novel.author = (novel.author || '') + text.trim();
            break;
          case ParsingState.Genres:
            genreArray.push(text.trim());
            break;
          case ParsingState.Summary:
            summaryParts.push(text);
            break;
          case ParsingState.ChapterName:
            tempChapter.name = (tempChapter.name || '') + text.trim();
            break;
          case ParsingState.ChapterTime:
            if (text?.includes('Advanced')) return;
            const releaseDate = text.split('.').map(x => Number(x));
            if (releaseDate.length === 3) {
              tempChapter.releaseTime = new Date(
                releaseDate[0],
                releaseDate[1] - 1,
                releaseDate[2],
              ).toISOString();
            }
            break;
        }
      },

      onclosetag(name) {
        switch (name) {
          case 'div':
            if (state === ParsingState.Cover) {
              state = ParsingState.Idle;
            }
            if (state === ParsingState.Chapter) {
              depth--;
              if (depth < 0) {
                if (
                  tempChapter.path &&
                  tempChapter.name &&
                  tempChapter.releaseTime
                ) {
                  chapter.push(tempChapter as Plugin.ChapterItem);
                }
                tempChapter = {};
                depth = 0;
                state = ParsingState.Idle;
              }
            }
            break;
          case 'p':
            if (
              state === ParsingState.Status ||
              state === ParsingState.Author ||
              state === ParsingState.Summary
            ) {
              state = ParsingState.Idle;
            }
            break;
          case 'a':
            if (state === ParsingState.Genres) {
              state = ParsingState.Idle;
            }
            break;
          case 'span':
            if (
              state === ParsingState.ChapterName ||
              state === ParsingState.ChapterTime
            ) {
              state = ParsingState.Chapter;
              depth--;
            }
            break;
        }
      },

      onend() {
        novel.genres = genreArray.join(', ');
        novel.summary = summaryParts.join('');
        novel.chapters = chapter;
      },
    });

    parser.write(body);
    parser.end();

    return novel as Plugin.SourceNovel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await fetchApi(this.site + chapterPath).then(r => r.text());

    let depth = 0;
    let state: ParsingState = ParsingState.Idle;
    const chapterHtml: string[] = [];

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
        switch (state) {
          case ParsingState.Idle:
            if (name === 'div' && attribs.class === 'main') {
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
          const attr = Object.keys(attribs).map(key => {
            const value = attribs[key].replace(/"/g, '&quot;');
            return ` ${key}="${value}"`;
          });
          chapterHtml.push(`<${name}${attr.join('')}>`);
        }
      },

      ontext(data) {
        if (state === ParsingState.Chapter) {
          const text = escapeHtml(data);
          const icontains = ['pawread', 'tinyurl', 'bit.ly'];

          if (icontains.some(pattern => text?.includes(pattern))) {
            state = ParsingState.Hidden;
            chapterHtml.pop();
          } else {
            chapterHtml.push(text);
          }
        }
      },

      onclosetag(name) {
        switch (state) {
          case ParsingState.Chapter:
            if (!parser['isVoidElement'](name)) {
              chapterHtml.push(`</${name}>`);
            }
            if (name === 'div') depth--;
            if (depth === 0) {
              state = ParsingState.Stopped;
            }
            break;
          case ParsingState.Hidden:
            state = ParsingState.Chapter;
            break;
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
    const params = new URLSearchParams({
      keywords: searchTerm,
      page: page.toString(),
    });

    const result = await fetchApi(`${this.site}search/?${params.toString()}`);
    const body = await result.text();

    return this.parseNovels(body);
  }

  filters = {
    status: {
      value: '',
      label: 'Status',
      options: [
        { label: 'All', value: '' },
        { label: 'Completed', value: 'wanjie' },
        { label: 'Ongoing', value: 'lianzai' },
        { label: 'Hiatus', value: 'hiatus' },
      ],
      type: FilterTypes.Picker,
    },
    lang: {
      value: '',
      label: 'Languages',
      options: [
        { label: 'All', value: '' },
        { label: 'Chinese', value: 'chinese' },
        { label: 'Korean', value: 'korean' },
        { label: 'Japanese', value: 'japanese' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      value: '',
      label: 'Genres',
      options: [
        { label: 'All', value: '' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Action', value: 'Action' },
        { label: 'Xuanhuan', value: 'Xuanhuan' },
        { label: 'Romance', value: 'Romance' },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Mystery', value: 'Mystery' },
        { label: 'Mature', value: 'Mature' },
        { label: 'Harem', value: 'Harem' },
        { label: 'Wuxia', value: 'Wuxia' },
        { label: 'Xianxia', value: 'Xianxia' },
        { label: 'Tragedy', value: 'Tragedy' },
        { label: 'Sci-fi', value: 'Scifi' },
        { label: 'Historical', value: 'Historical' },
        { label: 'Ecchi', value: 'Ecchi' },
        { label: 'Adventure', value: 'Adventure' },
        { label: 'Adult', value: 'Adult' },
        { label: 'Supernatural', value: 'Supernatural' },
        { label: 'Psychological', value: 'Psychological' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Horror', value: 'Horror' },
        { label: 'Josei', value: 'Josei' },
        { label: 'Mecha', value: 'Mecha' },
        { label: 'Seinen', value: 'Seinen' },
        { label: 'Shoujo', value: 'Shoujo' },
        { label: 'Shounen', value: 'Shounen' },
        { label: 'Smut', value: 'Smut' },
        { label: 'Yaoi', value: 'Yaoi' },
        { label: 'Yuri', value: 'Yuri' },
        { label: 'Martial Arts', value: 'MartialArts' },
        { label: 'School Life', value: 'SchoolLife' },
        { label: 'Shoujo Ai', value: 'ShoujoAi' },
        { label: 'Shounen Ai', value: 'ShounenAi' },
        { label: 'Slice of Life', value: 'SliceofLife' },
        { label: 'Gender Bender', value: 'GenderBender' },
        { label: 'Sports', value: 'Sports' },
        { label: 'Urban', value: 'Urban' },
        { label: 'Adventurer', value: 'Adventurer' },
      ],
      type: FilterTypes.Picker,
    },
    sort: {
      value: 'click',
      label: 'Sort By',
      options: [
        { label: 'Time Updated', value: 'update' },
        { label: 'Time Posted', value: 'post' },
        { label: 'Clicks', value: 'click' },
      ],
      type: FilterTypes.Picker,
    },
    order: {
      value: false,
      label: 'Order ↑ ↓',
      type: FilterTypes.Switch,
    },
  } satisfies Filters;
}

export default new PawRead();

enum ParsingState {
  Idle,
  Cover,
  Genres,
  Author,
  Status,
  Hidden,
  Summary,
  Stopped,
  Chapter,
  ChapterName,
  ChapterTime,
  NovelName,
  Novel,
}
