import { Parser } from 'htmlparser2';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import dayjs from 'dayjs';

class LightNovelPub implements Plugin.PagePlugin {
  id = 'lightnovelpub';
  name = 'LightNovelPub';
  version = '2.2.0';
  icon = 'src/en/lightnovelpub/icon.png';
  site = 'https://www.lightnovelpub.com/';
  headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  parseNovels(html: string) {
    const novels: Plugin.NovelItem[] = [];
    let tempNovel: Partial<Plugin.NovelItem> = {};
    let state: ParsingState = ParsingState.Idle;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (attribs['class'] === 'novel-item') {
          state = ParsingState.Novel;
        }
        if (state !== ParsingState.Novel) return;

        switch (name) {
          case 'a':
            tempNovel.path = attribs['href'].slice(1);
            tempNovel.name = attribs['title'];
            break;
          case 'img':
            tempNovel.cover = attribs['data-src'] || attribs['src'];
            break;
        }
      },
      onclosetag(name) {
        if (name === 'li') {
          if (tempNovel.path && tempNovel.cover) {
            novels.push(tempNovel as Plugin.NovelItem);
            tempNovel = {};
          }
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
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const linkParts = [
      this.site + 'browse',
      filters.genres.value,
      filters.order.value,
      filters.status.value,
      page.toString(),
    ];

    const body = await fetchApi(linkParts.join('/')).then(r => r.text());

    return this.parseNovels(body);
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());
    const novel: Partial<Plugin.SourceNovel> & Partial<{ totalPages: number }> =
      {
        path: novelPath,
        chapters: [],
      };
    let state: ParsingState = ParsingState.Idle;
    const summaryParts: string[] = [];
    const genreArray: string[] = [];
    const parser = new Parser({
      onopentag(name, attribs) {
        switch (name) {
          case 'h1':
            if (attribs['class']?.includes('novel-title')) {
              state = ParsingState.NovelName;
            }
            break;
          case 'figure':
            if (attribs['class'] === 'cover') {
              state = ParsingState.Cover;
            }
            break;
          case 'img':
            if (state === ParsingState.Cover) {
              novel.cover = attribs['data-src'] || attribs['src'];
            }
            break;
          case 'strong':
            if (state === ParsingState.HeaderStats) {
              if (attribs['class']) {
                state = ParsingState.Status;
              } else {
                state = ParsingState.TotalChapters;
              }
            }
            break;
          case 'br':
            if (state === ParsingState.Summary) {
              summaryParts.push('<LINE_BREAK>');
            }
            break;
          case 'a':
            if (state === ParsingState.Genres) {
              state = ParsingState.Tags;
            }
            break;
          case 'div':
            if (attribs['class']) {
              if (attribs['class'].includes('content')) {
                state = ParsingState.Summary;
              } else {
                const map: Record<string, ParsingState> = {
                  'categories': ParsingState.Genres,
                  'header-stats': ParsingState.HeaderStats,
                  'expand': ParsingState.Idle,
                };
                state = map[attribs['class']] ?? state;
              }
            }
            break;
          default:
            if (attribs['itemprop'] === 'author') {
              state = ParsingState.AuthorName;
            }
            break;
        }
      },
      ontext(data) {
        switch (state) {
          case ParsingState.TotalChapters:
            if (!novel.totalPages) {
              novel.totalPages = Math.ceil(parseInt(data, 10) / 100);
            }
            break;
          case ParsingState.Status:
            novel.status = data.trim();
            break;
          case ParsingState.NovelName:
            novel.name = (novel.name || '') + data.trim();
            break;
          case ParsingState.AuthorName:
            novel.author = data;
            break;
          case ParsingState.Summary:
            summaryParts.push(data);
            break;
          case ParsingState.Tags:
            genreArray.push(data);
            break;
        }
      },
      onclosetag(name) {
        switch (name) {
          case 'strong':
            if (state === ParsingState.TotalChapters) {
              state = ParsingState.HeaderStats;
            } else if (state === ParsingState.Status) {
              state = ParsingState.Idle;
            }
            break;
          case 'i':
            if (state === ParsingState.Status) {
              state = ParsingState.Idle;
            }
            break;
          case 'h1':
            if (state === ParsingState.NovelName) {
              state = ParsingState.Idle;
            }
            break;
          case 'span':
            if (state === ParsingState.AuthorName) {
              state = ParsingState.Idle;
            }
            break;
          case 'div':
            if (
              state === ParsingState.Summary ||
              state === ParsingState.Genres
            ) {
              state = ParsingState.Idle;
            }
            break;
          case 'a':
            if (state === ParsingState.Tags) {
              state = ParsingState.Genres;
            }
            break;
          case 'figure':
            if (state === ParsingState.Cover) {
              state = ParsingState.Idle;
            }
            break;
          case 'p':
            if (state === ParsingState.Summary) {
              summaryParts.push('<PARAGRAPH_BREAK>');
            }
            break;
        }
      },
      onend() {
        const text = summaryParts
          .join('')
          .replace(/<PARAGRAPH_BREAK>/g, '\n\n')
          .replace(/<LINE_BREAK>/g, '\n')
          .replace(/\r\n/g, '\n')
          .replace(/&nbsp;/g, ' ');

        const paragraphs = text
          .split('\n\n')
          .map(p => p.trim().replace(/[ \t]+/g, ' '))
          .filter(p => p.length > 0);

        novel.summary = paragraphs.join('\n\n');
        summaryParts.length = 0;

        novel.genres = genreArray.join(', ');
      },
    });

    parser.write(body);
    parser.end();

    return novel as Plugin.SourceNovel & { totalPages: number };
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const url = this.site + novelPath + '/chapters/page-' + page;
    const body = await fetchApi(url).then(res => res.text());
    const chapters: Plugin.ChapterItem[] = [];
    let tempChapter: Partial<Plugin.ChapterItem> = {};
    let state: ParsingState = ParsingState.Idle;

    const parser = new Parser({
      onopentag(name, attribs) {
        if (attribs['class'] === 'chapter-list') {
          state = ParsingState.ChapterList;
          return;
        }

        switch (state) {
          case ParsingState.ChapterList:
            if (name === 'li') {
              state = ParsingState.ChapterItem;
              tempChapter = {
                chapterNumber: Number(attribs['data-orderno'] || 0),
              };
            }
            break;
          case ParsingState.ChapterItem:
            switch (name) {
              case 'a':
                tempChapter.name = attribs['title'];
                tempChapter.path = attribs['href']?.slice(1);
                break;
              case 'time':
                tempChapter.releaseTime = dayjs(
                  attribs['datetime'],
                ).toISOString();
                break;
            }
            break;
        }
      },
      onclosetag(name) {
        switch (state) {
          case ParsingState.ChapterItem:
            if (name === 'li') {
              if (
                tempChapter.chapterNumber !== undefined &&
                tempChapter.path &&
                tempChapter.releaseTime
              ) {
                chapters.push(tempChapter as Plugin.ChapterItem);
              }
              state = ParsingState.ChapterList;
            }
            break;
          case ParsingState.ChapterList:
            if (name === 'ul') {
              state = ParsingState.Idle;
            }
            break;
        }
      },
    });

    parser.write(body);
    parser.end();

    return { chapters };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await fetchApi(this.site + chapterPath).then(r => r.text());

    let depth = 0;
    let state: ParsingState = ParsingState.Idle;
    const chapterHtml: string[] = [];

    type EscapeChar = '&' | '<' | '>' | '"' | "'";
    const escapeRegex = /[&<>"']/g;
    const escapeMap: Record<EscapeChar, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    const escapeHtml = (text: string): string =>
      text.replace(escapeRegex, char => escapeMap[char as EscapeChar]);

    const parser = new Parser({
      onopentag(name, attribs) {
        switch (state) {
          case ParsingState.Idle:
            if (name === 'div' && attribs['id'] === 'chapter-container') {
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

      ontext(text) {
        if (state === ParsingState.Chapter) {
          chapterHtml.push(escapeHtml(text));
        }
      },

      onclosetag(name) {
        if (state === ParsingState.Chapter) {
          if (!parser['isVoidElement'](name)) {
            chapterHtml.push(`</${name}>`);
          }
          if (name === 'div') depth--;
          if (depth === 0) {
            state = ParsingState.Stopped;
          }
        }
      },
    });

    parser.write(html);
    parser.end();

    return chapterHtml.join('');
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}lnsearchlive`;
    const link = `${this.site}search`;
    const response = await fetchApi(link).then(r => r.text());
    let verifytoken = '';
    const parser = new Parser({
      onopentag(name, attribs) {
        if (
          name === 'input' &&
          attribs['name']?.includes('LNRequestVerifyToken')
        ) {
          verifytoken = attribs['value'];
        }
      },
    });
    parser.write(response);
    parser.end();

    const formData = new FormData();
    formData.append('inputContent', searchTerm);

    const body = await fetchApi(url, {
      method: 'POST',
      headers: { LNRequestVerifyToken: verifytoken! },
      body: formData,
    }).then(r => r.json());

    return this.parseNovels(body.resultview);
  }

  filters = {
    order: {
      value: 'popular',
      label: 'Order by',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Popular', value: 'popular' },
        { label: 'Updates', value: 'updated' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Completed', value: 'completed' },
        { label: 'Ongoing', value: 'ongoing' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      value: 'all',
      label: 'Genre',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Drama', value: 'drama' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Harem', value: 'harem' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Romance', value: 'romance' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Josei', value: 'josei' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Horror', value: 'horror' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Historical', value: 'historical' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Adult', value: 'adult' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Sports', value: 'sports' },
        { label: 'Lolicon', value: 'lolicon' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Video Games', value: 'video-games' },
        { label: 'Smut', value: 'smut' },
        { label: 'Magical Realism', value: 'magical-realism' },
        { label: 'Eastern Fantasy', value: 'eastern-fantasy' },
        { label: 'Contemporary Romance', value: 'contemporary-romance' },
        { label: 'Fantasy Romance', value: 'fantasy-romance' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new LightNovelPub();

enum ParsingState {
  Idle,
  Novel,
  HeaderStats,
  Status,
  Stopped,
  Chapter,
  ChapterItem,
  ChapterList,
  TotalChapters,
  NovelName,
  AuthorName,
  Summary,
  Genres,
  Tags,
  Cover,
}
