import { Parser } from 'htmlparser2';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

type RanobesOptions = {
  lang?: string;
  path: string;
  down?: boolean;
  downSince?: string;
};

export type RanobesMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  options?: RanobesOptions;
};

class RanobesPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  options: RanobesOptions;

  constructor(metadata: RanobesMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = 'multisrc/ranobes/ranobes/icon.png';
    this.site = metadata.sourceSite;
    this.version = '2.0.2';
    this.options = metadata.options as RanobesOptions;
  }

  async safeFecth(url: string, init: any = {}): Promise<string> {
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
    let tempNovel = {} as Plugin.NovelItem;
    tempNovel.name = '';
    const baseUrl = this.site;
    let isParsingNovel = false;
    let isTitleTag = false;
    let isNovelName = false;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (attribs['class']?.includes('short-cont')) {
          isParsingNovel = true;
        }
        if (isParsingNovel) {
          if (name === 'h2' && attribs['class']?.includes('title')) {
            isTitleTag = true;
          }
          if (isTitleTag && name === 'a') {
            tempNovel.path = attribs['href'].slice(baseUrl.length);
            isNovelName = true;
          }
          if (name === 'figure') {
            tempNovel.cover = attribs['style'].replace(
              /.*url\((.*?)\)./g,
              '$1',
            );
          }
          if (tempNovel.path && tempNovel.cover) {
            novels.push(tempNovel);
            tempNovel = {} as Plugin.NovelItem;
            tempNovel.name = '';
          }
        }
      },
      ontext(data) {
        if (isNovelName) {
          tempNovel.name += data;
        }
      },
      onclosetag(name) {
        if (name === 'h2') {
          isNovelName = false;
          isTitleTag = false;
        }
        if (name === 'figure') {
          isParsingNovel = false;
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
    return chapter.reverse();
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
    const html = await this.safeFecth(baseUrl + novelPath);
    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: '',
      summary: '',
      chapters: [],
      totalPages: 1,
    };
    let isCover = false;
    let isAuthor = false;
    let isSummary = false;
    let isStatus = false;
    let isStatusText = false;
    let isGenres = false;
    let isGenresText = false;
    let isMaxChapters = false;
    let isChapter = false;
    let isChapterTitle = false;
    let isChapterDate = false;
    const genreArray: string[] = [];
    const chapters: Plugin.ChapterItem[] = [];
    let tempchapter: Plugin.ChapterItem = {};
    let maxChapters = 0;
    const fixDate = this.parseDate;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (attribs['class'] === 'poster') {
          isCover = true;
        }
        if (isCover && name === 'img') {
          novel.name = attribs['alt'];
          novel.cover = baseUrl + attribs['src'];
        }
        if (
          (name === 'div' &&
            attribs['class'] === 'moreless cont-text showcont-h') ||
          (attribs['class'] === 'cont-text showcont-h' &&
            attribs['itemprop'] === 'description')
        ) {
          isSummary = true;
        }
        if (
          name === 'li' &&
          attribs['title'] &&
          (attribs['title'].includes('Original status') ||
            attribs['title'].includes('Статус оригинала'))
        ) {
          isStatus = true;
        }
        if (name === 'a' && attribs['rel'] === 'chapter') {
          isChapter = true;
          tempchapter.path = attribs['href'].replace(baseUrl, '');
        }
        if (
          isChapter &&
          name === 'span' &&
          attribs['class'] === 'title ellipses'
        ) {
          isChapterTitle = true;
        }
        if (isChapter && name === 'span' && attribs['class'] === 'grey') {
          isChapterDate = true;
        }
        if (
          name === 'li' &&
          (attribs['title'] ==
            'Glossary + illustrations + division of chapters, etc.' ||
            attribs['title'] ===
              'Глоссарий + иллюстраций + разделение глав и т.д.')
        ) {
          isMaxChapters = true;
        }
      },
      onopentagname(name) {
        if (isSummary && name === 'br') {
          novel.summary += '\n';
        }
        if (isStatus && name === 'a') {
          isStatusText = true;
        }
        if (isGenres && name === 'a') {
          isGenresText = true;
        }
      },
      onattribute(name, value) {
        if (name === 'itemprop' && value === 'creator') {
          isAuthor = true;
        }
        if (name === 'id' && value === 'mc-fs-genre') {
          isGenres = true;
        }
      },
      ontext(data) {
        if (isAuthor) {
          novel.author = data;
        }
        if (isSummary) {
          novel.summary += data.trim();
        }
        if (isStatusText) {
          novel.status =
            data === 'Ongoing' || data == 'В процессе'
              ? NovelStatus.Ongoing
              : NovelStatus.Completed;
        }
        if (isGenresText) {
          genreArray.push(data);
        }
        if (isMaxChapters) {
          const isNumber = data.replace(/\D/g, '');
          if (isNumber) {
            maxChapters = parseInt(isNumber, 10);
          }
        }
        if (isChapter) {
          if (isChapterTitle) tempchapter.name = data.trim();
          if (isChapterDate) tempchapter.releaseTime = fixDate(data.trim());
        }
      },
      onclosetag(name) {
        if (name === 'a') {
          isCover = false;
          isAuthor = false;
          isStatusText = false;
          isGenresText = false;
          isStatus = false;
        }
        if (name === 'div') {
          isSummary = false;
          isGenres = false;
        }
        if (name === 'li') {
          isMaxChapters = false;
        }
        if (name === 'a') {
          isChapter = false;
          if (tempchapter.name) {
            chapters.push({ ...tempchapter, page: '1' });
            tempchapter = {};
          }
        }
        if (name === 'span') {
          if (isChapterTitle) isChapterTitle = false;
          if (isChapterDate) isChapterDate = false;
        }
      },
    });
    parser.write(html);
    parser.end();
    novel.genres = genreArray.join(', ');
    novel.totalPages = Math.ceil((maxChapters || 1) / 25);
    novel.chapters = chapters;

    if (novel.chapters[0].path) {
      novel.latestChapter = novel.chapters[0];
    }

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const pagePath =
      this.id == 'ranobes'
        ? novelPath.split('-')[0]
        : '/' + novelPath.split('-').slice(1).join('-').split('.')[0];
    const firstUrl =
      this.site + '/chapters' + pagePath.replace(this.options.path + '/', '');
    const pageBody = await this.safeFecth(firstUrl + '/page/' + page);

    const baseUrl = this.site;
    let isScript = false;
    let isChapter = false;
    let isChapterInfo = false;
    let isChapterDate = false;

    let chapters: Plugin.ChapterItem[] = [];
    let tempchapter: Plugin.ChapterItem = {};
    const fixDate = this.parseDate;

    let dataJson: {
      pages_count: string;
      chapters: ChapterEntry[];
    } = { pages_count: '', chapters: [] };

    const parser = new Parser({
      onopentag(name, attribs) {
        if (name === 'div' && attribs['class'] === 'cat_block cat_line') {
          isChapter = true;
        }
        if (isChapter && name === 'a' && attribs['title'] && attribs['href']) {
          tempchapter.name = attribs['title'];
          tempchapter.path = attribs['href'].replace(baseUrl, '');
        }
        if (name === 'span' && attribs['class'] === 'grey small') {
          isChapterInfo = true;
        }
        if (name === 'small' && isChapterInfo) {
          isChapterDate = true;
        }
      },
      ontext(data) {
        if (isChapterDate) tempchapter.releaseTime = fixDate(data.trim());
        if (isScript) {
          if (data.includes('window.__DATA__ =')) {
            dataJson = JSON.parse(data.replace('window.__DATA__ =', ''));
          }
        }
      },
      onclosetag(name) {
        if (name === 'a' && tempchapter.name) {
          chapters.push(tempchapter);
          tempchapter = {};
        }
        if (name === 'div') {
          isChapter = false;
        }
        if (name === 'span') {
          isChapterInfo = false;
        }
        if (name === 'small') {
          isChapterDate = false;
        }
        if (name === 'main') {
          isScript = true;
        }
        if (name === 'script') {
          isScript = false;
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
