import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi } from '@libs/fetch';
import { defaultCover } from '@libs/defaultCover';
import { load as parseHTML } from 'cheerio';

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

class RanobeMe implements Plugin.PluginBase {
  id = 'ranobeme';
  name = 'Ranobe.me';
  site = 'https://ranobe.me';
  version = '1.0.0';
  icon = 'src/ru/ranobeme/icon.png';

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + '/catalog';
    if (filters?.genre?.value) {
      url += '/genre/' + filters.genre.value;
    } else if (filters?.completed?.value) {
      url += '/completed';
    }
    // without a sort parameter the catalog is ordered by last update
    const sort = showLatestNovels ? '' : filters?.sort?.value || '';
    url += '?' + (sort ? 'sort=' + sort + '&' : '') + 'page=' + pageNo;

    return this.parseNovelList(await this.fetchPage(url));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site +
      '/index.php?section=search&str=' +
      encodeURIComponent(searchTerm) +
      '&page=' +
      pageNo;
    return this.parseNovelList(await this.fetchPage(url));
  }

  parseNovelList(html: string): Plugin.NovelItem[] {
    const $ = parseHTML(html);
    const novels: Plugin.NovelItem[] = [];

    $('div.FicTable').each((index, element) => {
      const link = $(element).find('.FicTable_Title > a[href^="/ranobe"]');
      const path = link.attr('href');
      if (!path) return;
      const cover = $(element).find('.FicTable_Cover img').attr('src');

      novels.push({
        name: link.text().trim(),
        path,
        cover: cover ? this.site + cover : defaultCover,
      });
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = parseHTML(await this.fetchPage(this.site + novelPath));
    const head = $('.FicHead');
    const cover = head.find('.FicCover img');

    const info: Record<string, string> = {};
    head.find('.FicHeadRight .tr').each((index, element) => {
      const title = $(element).find('.title').text().trim();
      info[title] = $(element).find('.content').text().trim();
    });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: head.find('h1').first().text().trim(),
      cover:
        cover.attr('data-src') || cover.attr('src')
          ? this.site + (cover.attr('data-src') || cover.attr('src'))
          : defaultCover,
      author: info['Автор:'] || undefined,
      genres: head
        .find('.FicHeadRight a[href^="/catalog/genre/"]')
        .map((index, element) => $(element).text().trim())
        .get()
        .join(','),
      summary: this.htmlToText($('.summary_text_fic3').first().html() || ''),
    };

    const chapters: Plugin.ChapterItem[] = [];
    $('ul.FicContents li').each((index, element) => {
      const link = $(element).find('.FicContentsChapterName a');
      const path = link.attr('href');
      if (!path) return;

      chapters.push({
        name: link.text().trim(),
        path,
        // "24 апреля 2020 / 11 т.с."
        releaseTime: this.parseDate($(element).find('.small_light').text()),
        chapterNumber: chapters.length + 1,
      });
    });

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = parseHTML(await this.fetchPage(this.site + chapterPath));
    const chapter = $('div.chapter').first();
    if (!chapter.length) throw new Error('Текст главы недоступен');

    chapter.find('a[name]').remove();
    chapter.find('img').each((index, element) => {
      const src = $(element).attr('src');
      if (src?.startsWith('/')) $(element).attr('src', this.site + src);
    });
    return chapter.html() || '';
  }

  async fetchPage(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error('Не удалось открыть страницу (' + res.status + ')');
    }
    return res.text();
  }

  parseDate(dateString: string): string | null {
    const [, day, month, year] =
      dateString.match(/(\d{1,2})\s+([а-я]+)\s+(\d{4})/) || [];
    if (!day || !months[month]) return null;
    const pad = (part: number | string) => ('0' + part).slice(-2);
    return year + '-' + pad(months[month]) + '-' + pad(day);
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

  resolveUrl = (path: string) =>
    /^https?:\/\//i.test(path) ? path : this.site + path;

  filters = {
    sort: {
      label: 'Сортировка',
      value: 'stat',
      options: [
        { label: 'По обновлению', value: '' },
        { label: 'По просмотрам', value: 'stat' },
        { label: 'По читателям', value: 'readers' },
        { label: 'По рекомендациям', value: 'recommend' },
        { label: 'По размеру', value: 'size' },
        { label: 'По названию', value: 'title' },
      ],
      type: FilterTypes.Picker,
    },
    completed: {
      label: 'Только завершённые',
      value: false,
      type: FilterTypes.Switch,
    },
    genre: {
      label: 'Жанр (без учёта «Только завершённые»)',
      value: '',
      options: [
        { label: 'Любой', value: '' },
        { label: '16+', value: '15' },
        { label: '18+', value: '2' },
        { label: 'Боевые искусства', value: '14' },
        { label: 'В прошлом', value: '10' },
        { label: 'Гарем', value: '9' },
        { label: 'Детектив', value: '41' },
        { label: 'Дзёсэй', value: '12' },
        { label: 'Драма', value: '5' },
        { label: 'Игра', value: '38' },
        { label: 'Лоли', value: '13' },
        { label: 'Мехи', value: '16' },
        { label: 'Мистика', value: '17' },
        { label: 'Научная фантастика', value: '21' },
        { label: 'Переодевания', value: '8' },
        { label: 'Повседневность', value: '28' },
        { label: 'Постапокалипсис', value: '40' },
        { label: 'Приключения', value: '3' },
        { label: 'Психология', value: '18' },
        { label: 'Романтика', value: '19' },
        { label: 'Сверхспособности', value: '31' },
        { label: 'Сёдзё', value: '24' },
        { label: 'Сёдзё Ай', value: '25' },
        { label: 'Сёнэн', value: '26' },
        { label: 'Сёнэн Ай', value: '27' },
        { label: 'Сётакон', value: '23' },
        { label: 'Смат', value: '29' },
        { label: 'Спорт', value: '30' },
        { label: 'Сэйнэн', value: '39' },
        { label: 'Сюаньхуа', value: '35' },
        { label: 'Сянься', value: '34' },
        { label: 'Трагедия', value: '32' },
        { label: 'Ужасы', value: '11' },
        { label: 'Уся', value: '33' },
        { label: 'Фэнтези', value: '7' },
        { label: 'Шенён', value: '22' },
        { label: 'Школьные будни', value: '20' },
        { label: 'Экшн', value: '1' },
        { label: 'Этти', value: '6' },
        { label: 'Юмор', value: '4' },
        { label: 'Юри', value: '37' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new RanobeMe();
