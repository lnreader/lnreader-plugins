import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Parser } from 'htmlparser2';
import dayjs from 'dayjs';

export type IfreedomMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  filters?: Filters;
};

class IfreedomPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  filters?: Filters;

  constructor(metadata: IfreedomMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = `multisrc/ifreedom/${metadata.id.toLowerCase()}/icon.png`;
    this.site = metadata.sourceSite;
    this.version = '1.1.0';
    this.filters = metadata.filters;
  }

  parseNovels(url: string) {
    return fetchApi(url)
      .then(res => res.text())
      .then(html => {
        const novels: Plugin.NovelItem[] = [];
        let tempNovel = {} as Plugin.NovelItem;
        let isInsideNovelCard = false;
        const site = this.site;

        const parser = new Parser({
          onopentag(name, attribs) {
            const className = attribs['class'] || '';
            if (
              name === 'div' &&
              (className.includes('one-book-home') ||
                className.includes('item-book-slide'))
            ) {
              isInsideNovelCard = true;
            }

            if (isInsideNovelCard) {
              if (name === 'img') {
                tempNovel.cover = attribs['src'];
                if (attribs['alt']) tempNovel.name = attribs['alt'];
              }
              if (name === 'a' && attribs['href']) {
                tempNovel.path = attribs['href'].replace(site, '');
                if (attribs['title']) tempNovel.name = attribs['title'];
              }
            }
          },
          onclosetag(name) {
            if (name === 'div' && isInsideNovelCard) {
              isInsideNovelCard = false;
              if (tempNovel.path) novels.push(tempNovel);
              tempNovel = {} as Plugin.NovelItem;
            }
          },
        });
        parser.write(html);
        parser.end();
        return novels;
      });
  }

  async popularNovels(
    page: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${this.site}/vse-knigi/?sort=${showLatestNovels ? 'По дате обновления' : filters?.sort?.value || 'По рейтингу'}`;

    Object.entries(filters || {}).forEach(([type, { value }]) => {
      if (Array.isArray(value) && value.length) {
        url += `&${type}[]=${value.join(`&${type}[]=`)}`;
      }
    });

    url += `&bpage=${page}`;
    return this.parseNovels(url);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await fetchApi(this.site + novelPath).then(res => res.text());
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      author: '',
      summary: '',
      status: NovelStatus.Unknown,
    };
    const chapters: Plugin.ChapterItem[] = [];
    const genres: string[] = [];
    const site = this.site;

    let isReadingName = false;
    let isReadingSummary = false;
    let isCoverContainer = false;

    let metaContext: 'author' | 'status' | 'genre' | null = null;
    let isMetaRow = false;
    let isMetaValue = false;

    let isInsideChapterRow = false;
    let isReadingChapterName = false;
    let isReadingChapterDate = false;
    let tempChapter = {} as Plugin.ChapterItem;

    const parser = new Parser({
      onopentag(name, attribs) {
        const className = attribs['class'] || '';

        if (name === 'h1') isReadingName = true;

        if (name === 'div') {
          if (
            className.includes('block-book-slide-img') ||
            className.includes('img-ranobe')
          ) {
            isCoverContainer = true;
          }
          if (
            className === 'descr-ranobe' ||
            (className === 'active' && attribs['data-name'] === 'Описание')
          ) {
            isReadingSummary = true;
          }
        }

        if (
          isReadingSummary &&
          name === 'span' &&
          className.includes('open-desc')
        ) {
          const onclick = attribs['onclick'];
          if (onclick) {
            const match = onclick.match(/innerHTML\s*=\s*'([\s\S]+?)'/);
            if (match && match[1]) {
              let fullText = match[1];
              fullText = fullText
                .replace(/&lt;br&gt;/gi, '\n')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .replace(/&amp;/g, '&');

              novel.summary = fullText;
              isReadingSummary = false;
            }
          }
        }

        if (name === 'img' && isCoverContainer && !novel.cover) {
          novel.cover = attribs['src'];
        }

        if (name === 'div') {
          if (className.includes('data-ranobe')) {
            isMetaRow = true;
            metaContext = null;
          }
          if (className.includes('data-value')) {
            isMetaValue = true;
          }

          if (className.includes('book-info-list')) {
            isMetaRow = true;
            metaContext = null;
          }
          if (className.includes('genreslist')) {
            metaContext = 'genre';
          }
        }

        if (isMetaRow) {
          if (name === 'span') {
            if (
              className.includes('dashicons-book') &&
              !className.includes('book-alt')
            )
              metaContext = 'genre';
            else if (className.includes('admin-users')) metaContext = 'author';
            else if (className.includes('megaphone')) metaContext = 'status';
          }
          if (name === 'svg') {
            if (className.includes('icon-tabler-tag')) metaContext = 'genre';
            else if (
              className.includes('mood-edit') ||
              className.includes('icon-tabler-user')
            )
              metaContext = 'author';
            else if (
              className.includes('chart-infographic') ||
              className.includes('megaphone')
            )
              metaContext = 'status';
          }
        }

        if (
          name === 'div' &&
          (className === 'li-ranobe' || className === 'chapterinfo')
        ) {
          isInsideChapterRow = true;
        }
        if (name === 'a' && isInsideChapterRow) {
          tempChapter.path = attribs['href'].replace(site, '');
          isReadingChapterName = true;
        }
        if (
          (name === 'div' || name === 'span') &&
          (className === 'li-col2-ranobe' || className === 'timechapter')
        ) {
          isReadingChapterDate = true;
        }
      },
      ontext(data) {
        const text = data.trim();
        if (!text) return;

        if (isReadingName) novel.name = text.replace(/®/g, '').trim();
        if (isReadingSummary && text !== 'Прочесть полностью') {
          novel.summary += text + '\n';
        }

        if (metaContext) {
          const shouldRead = isMetaValue || (isMetaRow && !isMetaValue);
          if (shouldRead) {
            if (metaContext === 'author') {
              if (
                text !== 'Автор' &&
                text !== 'Переводчик' &&
                text !== 'Не указан' &&
                !text.includes('Просмотров')
              ) {
                novel.author = text;
              }
            } else if (metaContext === 'status') {
              if (!text.includes('Статус')) novel.status = parseStatus(text);
            } else if (metaContext === 'genre') {
              if (text !== ',' && text !== 'Жанры') genres.push(text);
            }
          }
        }

        if (isReadingChapterName) tempChapter.name = text;
        if (isReadingChapterDate) tempChapter.releaseTime = parseDate(text);
      },
      onclosetag(name) {
        if (name === 'h1') isReadingName = false;
        if (name === 'div') {
          if (isReadingSummary) isReadingSummary = false;
          if (isCoverContainer) isCoverContainer = false;
          if (isMetaValue) isMetaValue = false;
        }

        if (name === 'a') isReadingChapterName = false;
        if ((name === 'div' || name === 'span') && isReadingChapterDate) {
          isReadingChapterDate = false;
          if (tempChapter.path) {
            chapters.push(tempChapter);
          }
          tempChapter = {} as Plugin.ChapterItem;
          isInsideChapterRow = false;
        }
      },
    });

    parser.write(html);
    parser.end();

    novel.genres = genres.join(',');
    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );

    const startTag =
      this.id === 'bookhamster'
        ? '<div class="entry-content">'
        : '<div class="chapter-content">';
    const endTag =
      this.id === 'bookhamster'
        ? '<!-- .entry-content -->'
        : '<div class="chapter-setting">';

    const chapterStart = body.indexOf(startTag);
    if (chapterStart === -1) return '';

    const chapterEnd = body.indexOf(endTag, chapterStart);
    let chapterText = body.slice(
      chapterStart,
      chapterEnd !== -1 ? chapterEnd : undefined,
    );

    chapterText = chapterText.replace(/<script[^>]*>[\s\S]*?<\/script>/gim, '');

    if (chapterText.includes('<img')) {
      chapterText = chapterText.replace(/srcset="([^"]+)"/g, (match, src) => {
        if (!src) return match;
        const bestLink = src
          .split(' ')
          .filter((s: string) => s.startsWith('http'))
          .pop();
        return bestLink ? `src="${bestLink}"` : match;
      });
    }

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number = 1,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/vse-knigi/?searchname=${encodeURIComponent(searchTerm)}&bpage=${page}`;
    return this.parseNovels(url);
  }
}

function parseStatus(statusString: string): string {
  const s = statusString.toLowerCase().trim();

  if (
    s.includes('активен') ||
    s.includes('продолжается') ||
    s.includes('онгоинг')
  ) {
    return NovelStatus.Ongoing;
  }

  if (s.includes('завершен') || s.includes('конец') || s.includes('закончен')) {
    return NovelStatus.Completed;
  }

  if (s.includes('приостановлен') || s.includes('заморожен')) {
    return NovelStatus.OnHiatus;
  }

  return NovelStatus.Unknown;
}

function parseDate(dateString: string = ''): string | null {
  const months: Record<string, number> = {
    января: 1,
    февраля: 2,
    марта: 3,
    апреля: 4,
    мая: 5,
    июня: 6,
    июля: 7,
    августа: 8,
    сентября: 9,
    октября: 10,
    ноября: 11,
    декабря: 12,
  };

  // Checking the format "X ч. назад"
  const relativeTimeRegex = /(d+)s*ч.?s*назад/;
  const match = dateString.match(relativeTimeRegex);
  if (match) {
    const hoursAgo = parseInt(match[1], 10);
    return dayjs().subtract(hoursAgo, 'hour').format('LL');
  }

  if (dateString.includes('.')) {
    const [day, month, year] = dateString.split('.');
    const fullYear = year?.length === 2 ? '20' + year : year;
    return dayjs(fullYear + '-' + month + '-' + day).format('LL');
  } else if (dateString.includes(' ')) {
    const [day, month] = dateString.split(' ');
    if (day && months[month]) {
      const year = new Date().getFullYear();
      return dayjs(year + '-' + months[month] + '-' + day).format('LL');
    }
  }

  return dateString || null;
}
