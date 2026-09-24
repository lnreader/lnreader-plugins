import { Parser } from 'htmlparser2';
import { fetchApi, FetchInit } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';

type RanobesOptions = {
  lang?: string;
  path: string;
};

export type RanobesMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  options?: RanobesOptions;
};

export class RanobesPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  options: RanobesOptions;
  webStorageUtilized = true;

  constructor(metadata: RanobesMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = 'multisrc/ranobes/ranobes/icon.png';
    this.site = metadata.sourceSite;
    this.version = '2.1.0';
    this.options = metadata.options as RanobesOptions;
  }

  async safeFecth(url: string, init?: FetchInit): Promise<string> {
    const r = await fetchApi(url, init);
    if (!r.ok)
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    const data = await r.text();
    const title = data.match(/<title>(.*?)<\/title>/)?.[1]?.trim();

    if (
      title &&
      (title == 'Bot Verification' ||
        title == 'You are being redirected...' ||
        title == 'Un instant...' ||
        title == 'Just a moment...' ||
        title == 'Redirecting...')
    )
      throw new Error('Captcha error, please open in webview');

    return data;
  }

  parseNovels(html: string) {
    const novels: Plugin.NovelItem[] = [];
    let tempNovel: Partial<Plugin.NovelItem> = {};

    const stateStack: ParsingState[] = [ParsingState.Idle];
    const currentState = () => stateStack[stateStack.length - 1];
    const pushState = (state: ParsingState) => stateStack.push(state);
    const popState = () =>
      stateStack.length > 1 ? stateStack.pop() : currentState();

    const parser = new Parser({
      onopentag: (name, attribs) => {
        const state = currentState();
        if (attribs.id === 'dle-content') {
          pushState(ParsingState.NovelList);
          return;
        }
        if (state === ParsingState.Idle) return;

        if (name === 'h2') {
          pushState(ParsingState.NovelItem);
          return;
        }

        if (state === ParsingState.NovelItem) {
          switch (name) {
            case 'a':
              if (!tempNovel.path) {
                tempNovel.path = new URL(attribs.href, this.site).pathname;
                pushState(ParsingState.NovelTitle);
              }
              break;
            case 'figure':
              tempNovel.cover = attribs['style'].replace(
                /.*url\((.*?)\).*/,
                '$1',
              );
              if (tempNovel.path && tempNovel.cover) {
                novels.push({ ...tempNovel } as Plugin.NovelItem);
              }
              tempNovel = {};
              popState();
              break;
          }
        }
      },
      ontext: data => {
        if (currentState() !== ParsingState.NovelTitle) return;
        tempNovel.name = (tempNovel.name || '') + data.trim();
      },
      onclosetag: name => {
        const state = currentState();
        if (name === 'a' && state === ParsingState.NovelTitle) {
          popState();
        }
        if (name === 'main') {
          popState();
        }
      },
    });
    parser.write(html);
    parser.end();
    return novels;
  }

  parseChapters(data: { chapters: ChapterEntry[] }) {
    const chapter: Plugin.ChapterItem[] = [];
    data.chapters.map((item: ChapterEntry) => {
      chapter.push({
        name: item.title,
        releaseTime: new Date(item.date).toISOString(),
        path: item.link.slice(this.site.length),
      });
    });
    return chapter;
  }

  parseDate = (date: string) => {
    const now = new Date();
    if (!date) return now.toISOString();
    if (this.id === 'ranobes-ru') {
      if (date.includes(' в ')) return date.replace(' в ', ' г., ');

      const [when, time] = date.split(', ');
      if (!time) return now.toISOString();
      const [h, m] = time.split(':');

      switch (when) {
        case 'Сегодня':
          now.setHours(parseInt(h, 10));
          now.setMinutes(parseInt(m, 10));
          break;
        case 'Вчера':
          now.setDate(now.getDate() - 1);
          now.setHours(parseInt(h, 10));
          now.setMinutes(parseInt(m, 10));
          break;
        default:
          return now.toISOString();
      }
    } else {
      const [num, xz, ago] = date.split(' ');
      if (ago !== 'ago') return now.toISOString();

      switch (xz) {
        case 'minutes':
          now.setMinutes(parseInt(num, 10));
          break;
        case 'hour':
        case 'hours':
          now.setHours(parseInt(num, 10));
          break;
        case 'day':
        case 'days':
          now.setDate(now.getDate() - parseInt(num, 10));
          break;
        case 'month':
        case 'months':
          now.setMonth(now.getMonth() - parseInt(num, 10));
          break;
        case 'year':
        case 'years':
          now.setFullYear(now.getFullYear() - parseInt(num, 10));
          break;
        default:
          return now.toISOString();
      }
    }
    return now.toISOString();
  };

  async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
    const link = `${this.site}/${this.options.path}/page/${page}/`;
    const body = await this.safeFecth(link);
    return this.parseNovels(body);
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const baseUrl = this.site;
    const baseId = this.id;
    const html = await this.safeFecth(baseUrl + novelPath);
    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: '',
      summary: '',
      chapters: [],
      totalPages: 1,
    };
    const stateStack: ParsingState[] = [ParsingState.Idle];
    const currentState = () => stateStack[stateStack.length - 1];
    const pushState = (state: ParsingState) => stateStack.push(state);
    const popState = () =>
      stateStack.length > 1 ? stateStack.pop() : currentState();

    const summaryArray: string[] = [];
    const authorArray: string[] = [];
    const genreArray: string[] = [];
    const chapters: Plugin.ChapterItem[] = [];
    let tempChapter: Partial<Plugin.ChapterItem> = {};
    let maxChapters = 0;
    const fixDate = this.parseDate;
    const parser = new Parser({
      onopentag(name, attribs) {
        const state = currentState();
        switch (name) {
          case 'div':
            if (attribs.class === 'poster') {
              pushState(ParsingState.Cover);
            }
            if (attribs.class?.includes('r-desription')) {
              pushState(ParsingState.Summary);
            }
            if (attribs.class === 'moreless__short') {
              pushState(ParsingState.Hidden);
            }
            if (attribs.id === 'mc-fs-genre') {
              pushState(ParsingState.Genres);
            }
            if (attribs.id === 'fs-chapters') {
              pushState(ParsingState.ChapterList);
            }
            break;
          case 'img':
            if (state === ParsingState.Cover) {
              novel.name = attribs.alt;
              novel.cover = new URL(attribs.src, baseUrl).href;
              popState();
            }
            break;
          case 'style':
            pushState(ParsingState.Hidden);
            break;
          case 'br':
            if (state === ParsingState.Summary) summaryArray.push('\n');
            break;
          case 'i':
            if (
              state === ParsingState.Summary &&
              attribs.class === 'showcont-hh'
            )
              popState();
            break;
          case 'li':
            if (
              attribs.title?.includes('status') ||
              attribs.title?.includes('Статус оригинала')
            ) {
              pushState(ParsingState.Status);
            } else if (
              attribs.title?.includes('Glossary') ||
              attribs.title?.includes('Глоссарий')
            ) {
              pushState(ParsingState.TotalChapters);
            }
            break;
          case 'span':
            if (attribs.class === 'tag_list') pushState(ParsingState.Author);
            if (state === ParsingState.ChapterItem && attribs.class === 'grey')
              pushState(ParsingState.ChapterDate);
            break;
          case 'a':
            if (attribs.class === 'btn read-continue') {
              storage.set(
                `${baseId}_${novelPath.split('-')[0].split('/').pop()}`,
                new URL(attribs.href, baseUrl).pathname,
              );
            }
            if (
              state === ParsingState.Summary &&
              attribs.class?.includes('moreless__toggle')
            )
              popState();
            if (state === ParsingState.ChapterList) {
              tempChapter.path = new URL(attribs.href, baseUrl).pathname;
              pushState(ParsingState.ChapterItem);
            }
            break;
        }
      },
      ontext: data => {
        switch (currentState()) {
          case ParsingState.Hidden:
            break;
          case ParsingState.Summary:
            summaryArray.push(data.trim());
            break;
          case ParsingState.Status: {
            const statusMap: Record<string, NovelStatus> = {
              'Ongoing': NovelStatus.Ongoing,
              'В процессе': NovelStatus.Ongoing,

              'Completed': NovelStatus.Completed,
              'Завершено': NovelStatus.Completed,

              'Hiatus': NovelStatus.OnHiatus,
              'Остановлен': NovelStatus.OnHiatus,

              'Dropped': NovelStatus.Cancelled,
              'Удален': NovelStatus.Cancelled,
            };
            novel.status = statusMap[data] ?? NovelStatus.Unknown;
            break;
          }
          case ParsingState.Author:
            authorArray.push(data);
            break;
          case ParsingState.Genres:
            genreArray.push(data);
            break;
          case ParsingState.TotalChapters: {
            const isNumber = data.replace(/\D/g, '');
            if (isNumber) {
              maxChapters = parseInt(isNumber, 10);
            }
            break;
          }
          case ParsingState.ChapterItem:
            tempChapter.name = (tempChapter.name || '') + data;
            break;
          case ParsingState.ChapterDate:
            tempChapter.releaseTime =
              (tempChapter.releaseTime || '') +
              data.replace(/[\n\t]/g, '').trim();
            break;
        }
      },
      onclosetag: name => {
        switch (currentState()) {
          case ParsingState.Hidden:
            if (name === 'div' || name === 'style') popState();
            break;
          case ParsingState.Summary:
            if (name === 'div') popState();
            break;
          case ParsingState.Status:
            if (name === 'li') popState();
            break;
          case ParsingState.Author:
            if (name === 'span') popState();
            break;
          case ParsingState.Genres:
            if (name === 'div') popState();
            break;
          case ParsingState.TotalChapters:
            if (name === 'li') popState();
            break;
          case ParsingState.ChapterDate:
            if (name === 'span') popState();
            break;
          case ParsingState.ChapterItem:
            if (name === 'li') {
              tempChapter.name = tempChapter.name.replace(/[\n\t]/g, '').trim();
              tempChapter.releaseTime = fixDate(tempChapter.releaseTime);
              chapters.push({ ...tempChapter } as Plugin.ChapterItem);
              tempChapter = {};
              popState();
            }
            break;
          case ParsingState.ChapterList:
            if (name === 'ul') popState();
            break;
        }
      },
      onend: () => {
        novel.author = authorArray
          .map(str => str.replace(/[\n\t]/g, '').trim())
          .filter(str => str && str !== ',')
          .join(', ');
        novel.genres = genreArray
          .map(str => str.replace(/[\n\t]/g, '').trim())
          .filter(str => str && str !== ',')
          .join(', ');
        novel.summary = summaryArray.join('');
        novel.totalPages = Math.ceil((maxChapters || 1) / 25);
        novel.chapters = chapters;
        if (novel.chapters[0].path) {
          novel.latestChapter = novel.chapters[0];
        }
      },
    });
    parser.write(html);
    parser.end();

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const pagePath = storage.get(
      `${this.id}_${novelPath.split('-')[0].split('/').pop()}`,
    );
    const pageBody = await this.safeFecth(
      this.site + pagePath + 'page/' + page,
    );

    const baseUrl = this.site;
    const stateStack: ParsingState[] = [ParsingState.Idle];
    const currentState = () => stateStack[stateStack.length - 1];
    const pushState = (state: ParsingState) => stateStack.push(state);
    const popState = () =>
      stateStack.length > 1 ? stateStack.pop() : currentState();

    let chapters: Plugin.ChapterItem[] = [];
    let tempChapter: Partial<Plugin.ChapterItem> = {};
    const fixDate = this.parseDate;

    let dataJson: {
      pages_count: string;
      chapters: ChapterEntry[];
    } = { pages_count: '', chapters: [] };

    const parser = new Parser({
      onopentag: (name, attribs) => {
        const state = currentState();

        if (attribs.id === 'dle-content') {
          pushState(ParsingState.ChapterList);
        }
        if (name === 'aside' && state === ParsingState.Script) {
          popState();
          return;
        }

        if (state === ParsingState.Idle) return;

        switch (name) {
          case 'a':
            if (attribs.title && attribs.href) {
              tempChapter.name = attribs.title;
              tempChapter.path = new URL(attribs.href, baseUrl).pathname;
              pushState(ParsingState.ChapterItem);
            }
            break;
          case 'small':
            if (state === ParsingState.ChapterItem) {
              pushState(ParsingState.ChapterDate);
            }
        }
      },
      ontext: data => {
        if (currentState() === ParsingState.ChapterDate)
          tempChapter.releaseTime =
            (tempChapter.releaseTime || '') +
            data.replace(/[\n\t]/g, '').trim();
        if (currentState() === ParsingState.Script) {
          if (data.includes('window.__DATA__ =')) {
            dataJson = JSON.parse(data.replace('window.__DATA__ =', ''));
          }
        }
      },
      onclosetag: name => {
        const state = currentState();
        switch (name) {
          case 'small':
            if (state === ParsingState.ChapterDate) popState();
            break;
          case 'a':
            if (state === ParsingState.ChapterItem) {
              tempChapter.releaseTime = fixDate(tempChapter.releaseTime);
              chapters.push({ ...tempChapter } as Plugin.ChapterItem);
              tempChapter = {};
              popState();
            }
            break;
          case 'main':
            popState();
            pushState(ParsingState.Script);
            break;
          case 'script':
            if (state === ParsingState.Script) popState();
            break;
        }
      },
    });
    parser.write(pageBody);
    parser.end();

    if (dataJson.chapters?.length) {
      chapters = this.parseChapters(dataJson);
    }

    return {
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.safeFecth(this.site + chapterPath);

    const indexA = html.indexOf('<div class="text" id="arrticle">');
    const indexB = html.indexOf('<div class="category grey ellipses">', indexA);

    const chapterText = html.substring(indexA, indexB);
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    let html;
    if (this.id === 'ranobes-ru') {
      html = await this.safeFecth(this.site + '/index.php?do=search', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: this.site + '/',
        },
        method: 'POST',
        body: new URLSearchParams({
          do: 'search',
          subaction: 'search',
          search_start: page.toString(),
          story: searchTerm,
        }).toString(),
      });
    } else {
      const link = `${this.site}/search/${searchTerm}/page/${page}`;
      html = await this.safeFecth(link);
    }
    return this.parseNovels(html);
  }
}

type ChapterEntry = {
  id: number;
  title: string;
  date: string;
  link: string;
};

enum ParsingState {
  Idle,
  Cover,
  Script,
  Genres,
  Hidden,
  Status,
  Author,
  Summary,
  NovelList,
  NovelItem,
  NovelTitle,
  ChapterList,
  ChapterItem,
  ChapterDate,
  TotalChapters,
}
