import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi } from '@libs/fetch';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';

class RanobeLife implements Plugin.PluginBase {
  id = 'ranobelife';
  name = 'Ranobe.life';
  site = 'https://ranobe.life';
  version = '1.0.0';
  icon = 'src/ru/ranobelife/icon.png';

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const genre = filters?.genre?.value;
    const url =
      this.site +
      '/catalog/' +
      (genre ? 'g=' + genre + '/' : '') +
      (pageNo > 1 ? 'page/' + pageNo + '/' : '');
    const sort = showLatestNovels ? 'editdate' : filters?.sort?.value;

    // DataLife Engine applies a sort sent with the request
    const html = await this.fetchPage(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        dlenewssortby: sort || 'rating',
        dledirection: sort === 'title' ? 'asc' : 'desc',
        set_new_sort: 'dle_sort_xfilter',
        set_direction_sort: 'dle_direction_xfilter',
      }).toString(),
    });
    return this.parseNovelList(html);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site +
      '/search/' +
      encodeURIComponent(searchTerm) +
      '/' +
      (pageNo > 1 ? 'page/' + pageNo + '/' : '');
    return this.parseNovelList(await this.fetchPage(url));
  }

  parseNovelList(html: string): Plugin.NovelItem[] {
    const $ = parseHTML(html);
    const novels: Plugin.NovelItem[] = [];

    $('div.short').each((index, element) => {
      const link = $(element).find('h3 a').first();
      const href = link.attr('href');
      if (!href) return;
      const image = $(element).find('img').first();
      const cover = image.attr('data-src') || image.attr('src');

      novels.push({
        name: link.text().trim(),
        path: href.replace(this.site, ''),
        cover:
          cover && !cover.startsWith('data:')
            ? this.absolute(cover)
            : defaultCover,
      });
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await this.fetchPage(this.site + novelPath);
    const $ = parseHTML(html);

    const info: Record<string, string> = {};
    $('.page__list li').each((index, element) => {
      const title = $(element).children('div').first().text().trim();
      $(element).children('div').first().remove();
      info[title] = $(element).text().trim();
    });

    const cover = $('.page__poster img').first().attr('src');
    const status = info['Статус:'] || '';
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').first().text().trim(),
      cover: cover ? this.absolute(cover) : defaultCover,
      summary: this.htmlToText($('.page__text').first().html() || ''),
      status: status.includes('Заверш')
        ? NovelStatus.Completed
        : status.includes('Онгоинг')
          ? NovelStatus.Ongoing
          : NovelStatus.Unknown,
      genres: this.readGenres($),
    };

    // the chapter list is embedded as JSON for the page's Vue component
    // A missing block means the markup changed: fail instead of showing a
    // novel without chapters (a real empty list is still accepted).
    const json = html.match(/window\.__DATA__ = (\{[\s\S]*?\});?\s*<\/script>/);
    const data: PageData | undefined = json ? JSON.parse(json[1]) : undefined;
    if (!data || !Array.isArray(data.chapters)) {
      throw new Error('Не удалось загрузить список глав');
    }
    const novelId = data.news_id || novelPath.match(/^\/(\d+)-/)?.[1];
    novel.chapters = data.chapters
      .slice()
      .sort((a, b) => a.posi - b.posi)
      .map(chapter => ({
        name: chapter.title,
        path: '/reader/' + novelId + '/' + chapter.id,
        releaseTime: this.parseDate(chapter.date),
        chapterNumber: chapter.posi,
      }));

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = parseHTML(await this.fetchPage(this.site + chapterPath));
    const text = $('div.rl-text').first();
    if (!text.length) throw new Error('Текст главы недоступен');

    text.find('img').each((index, element) => {
      const src = $(element).attr('data-src') || $(element).attr('src');
      if (src) $(element).attr('src', this.absolute(src));
    });
    return text.html() || '';
  }

  // the site answers with a redirect to its own browser check (/_c?t=...)
  // until it has been passed once in the WebView
  async fetchPage(url: string, init?: Parameters<typeof fetchApi>[1]) {
    const res = await fetchApi(url, init);
    const body = await res.text();
    if (res.url.includes('/_c?') || body.includes('var targetUrl')) {
      throw new Error('Пройдите проверку: откройте сайт в WebView');
    }
    if (!res.ok) {
      throw new Error('Не удалось открыть страницу (' + res.status + ')');
    }
    return body;
  }

  readGenres($: ReturnType<typeof parseHTML>): string | undefined {
    for (const element of $('script[type="application/ld+json"]').toArray()) {
      try {
        const graph = JSON.parse($(element).text())['@graph'] || [];
        const series = graph.find((item: { genre?: string[] }) =>
          Array.isArray(item.genre),
        );
        if (series) return series.genre.join(',');
      } catch {
        // not the structured data block we need
      }
    }
    return undefined;
  }

  parseDate(date: string): string | null {
    // "10.08.2026"
    const [, day, month, year] =
      date.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/) || [];
    if (!day) return null;
    const pad = (part: string) => ('0' + part).slice(-2);
    return year + '-' + pad(month) + '-' + pad(day);
  }

  // the app shows summaries as plain text
  htmlToText(html: string): string | undefined {
    const $ = parseHTML(html);
    $('br').replaceWith('\n');
    $('p, div, li').after('\n\n');
    return (
      $.root()
        .text()
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim() || undefined
    );
  }

  absolute = (url: string) =>
    url.startsWith('http')
      ? url
      : this.site + (url.startsWith('/') ? '' : '/') + url;

  resolveUrl = (path: string) => this.absolute(path);

  filters = {
    sort: {
      label: 'Сортировка',
      value: 'rating',
      options: [
        { label: 'По популярности', value: 'rating' },
        { label: 'По посещаемости', value: 'news_read' },
        { label: 'По дате изменения', value: 'editdate' },
        { label: 'По дате добавления', value: 'date' },
        { label: 'По комментариям', value: 'comm_num' },
        { label: 'По алфавиту', value: 'title' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Жанр',
      value: '',
      options: [
        { label: 'Любой', value: '' },
        { label: 'Арт', value: '279' },
        { label: 'Безумие', value: '273' },
        { label: 'Боевик', value: '241' },
        { label: 'Боевые искусства', value: '252' },
        { label: 'Вампиры', value: '264' },
        { label: 'Военное', value: '251' },
        { label: 'Гарем', value: '242' },
        { label: 'Героическое фэнтези', value: '265' },
        { label: 'Демоны', value: '256' },
        { label: 'Детектив', value: '277' },
        { label: 'Детское', value: '289' },
        { label: 'Дзёсэй', value: '270' },
        { label: 'Драма', value: '243' },
        { label: 'Игра', value: '269' },
        { label: 'Исекай', value: '255' },
        { label: 'История', value: '274' },
        { label: 'Киберпанк', value: '284' },
        { label: 'Кодомо', value: '288' },
        { label: 'Комедия', value: '244' },
        { label: 'Космос', value: '271' },
        { label: 'Магия', value: '250' },
        { label: 'Махо-сёдзё', value: '285' },
        { label: 'Машины', value: '280' },
        { label: 'Меха', value: '278' },
        { label: 'Мистика', value: '261' },
        { label: 'Музыка', value: '281' },
        { label: 'Научная фантастика', value: '253' },
        { label: 'Омегаверс', value: '287' },
        { label: 'Пародия', value: '283' },
        { label: 'Повседневность', value: '257' },
        { label: 'Полиция', value: '282' },
        { label: 'Постапокалиптика', value: '258' },
        { label: 'Приключения', value: '254' },
        { label: 'Психология', value: '267' },
        { label: 'Романтика', value: '245' },
        { label: 'Самурайский боевик', value: '286' },
        { label: 'Сверхъестественное', value: '246' },
        { label: 'Спорт', value: '272' },
        { label: 'Супер сила', value: '276' },
        { label: 'Сэйнэн', value: '247' },
        { label: 'Сёдзё', value: '275' },
        { label: 'Сёнэн', value: '259' },
        { label: 'Трагедия', value: '268' },
        { label: 'Триллер', value: '266' },
        { label: 'Ужасы', value: '262' },
        { label: 'Фантастика', value: '263' },
        { label: 'Фэнтези', value: '248' },
        { label: 'Школа', value: '260' },
        { label: 'Этти', value: '249' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

type PageData = {
  news_id?: number;
  chapters: {
    id: number;
    posi: number;
    title: string;
    date: string;
  }[];
};

export default new RanobeLife();
