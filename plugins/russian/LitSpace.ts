import { Plugin } from '@typings/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi, fetchFile } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import dayjs from 'dayjs';

class freedlit implements Plugin.PluginBase {
  id = 'freedlit.space';
  name = 'LitSpace';
  site = 'https://freedlit.space';
  version = '1.0.0';
  icon = 'src/ru/freedlit/icon.png';

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + '/get-books/all/list/' + page + '?sort=';
    url += showLatestNovels ? 'recent' : filters?.sort?.value || 'popular';
    url += '&status=' + (filters?.status?.value || 'all');
    url += '&access=' + (filters?.access?.value || 'all');
    url += '&adult=' + (filters?.adult?.value || 'hide');

    if (filters?.genre?.value?.include?.length) {
      url += filters.genre.value.include
        .map(id => '&genres_included[]=' + id)
        .join('');
    }

    if (filters?.genre?.value?.exclude?.length) {
      url += filters.genre.value.exclude
        .map(id => '&genres_excluded[]=' + id)
        .join('');
    }

    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('#bookListBlock > div > div').each((index, element) => {
      const name = loadedCheerio(element).find('div > h4 > a').text()?.trim();
      const cover = loadedCheerio(element)
        .find('div > a > img')
        .attr('src')
        ?.trim();
      const url = loadedCheerio(element)
        .find('div > h4 > a')
        .attr('href')
        ?.trim();
      if (!name || !url) return;

      novels.push({ name, cover, path: url.replace(this.site, '') });
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.book-info h4').text(),
      cover: loadedCheerio('.book-cover > div > img').attr('src')?.trim(),
      summary: loadedCheerio('#nav-home').text()?.trim(),
      author: loadedCheerio('.book-info h5 > a').text(),
      genres: loadedCheerio('.genre-list > a')
        .map((index, element) => loadedCheerio(element).text())
        .get()
        .join(','),
    };

    const chapters: Plugin.ChapterItem[] = [];

    loadedCheerio('a.chapter-line').each((chapterIndex, element) => {
      const name = loadedCheerio(element).find('h6').text();
      const url = loadedCheerio(element).attr('href');
      if (!name || !url) return;

      const releaseDate = loadedCheerio(element)
        .find('span[class="date"]')
        .text();
      chapters.push({
        name,
        path: url.replace(this.site, ''),
        releaseTime: this.parseDate(releaseDate),
        chapterNumber: chapterIndex + 1,
      });
    });

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);

    loadedCheerio('div.mobile-block').remove();
    loadedCheerio('div.standart-block').remove();

    const chapterText = loadedCheerio('div[class="chapter"]').html() || '';
    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = this.site + '/search?query=' + searchTerm + '&type=all';
    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('#bookGridBlock > div').each((index, element) => {
      const name = loadedCheerio(element).find('h4 > a').text()?.trim();
      const cover = loadedCheerio(element).find('a > img').attr('src')?.trim();
      const url = loadedCheerio(element).find('h4 > a').attr('href')?.trim();
      if (!name || !url) return;

      novels.push({ name, cover, path: url.replace(this.site, '') });
    });

    return novels;
  }

  parseDate = (dateString: string | undefined = '') => {
    const months: { [key: string]: number } = {
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

    const [day, month, year] = dateString.split(' ');
    if (day && months[month] && year) {
      return dayjs(year + '-' + months[month] + '-' + day).format('LL');
    }
    return dateString || null;
  };

  fetchImage = fetchFile;

  filters = {
    sort: {
      label: 'Сортировка:',
      value: 'popular',
      options: [
        { label: 'По популярности', value: 'popular' },
        { label: 'По количеству комментариев', value: 'comments' },
        { label: 'По количеству лайков', value: 'likes' },
        { label: 'По новизне', value: 'recent' },
        { label: 'По просмотрам', value: 'views' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Жанры:',
      value: { include: [], exclude: [] },
      options: [
        { label: 'Любой жанр', value: 'all' },
        { label: 'Альтернативная история', value: 'alternative-history' },
        { label: 'Антиутопия', value: 'dystopia' },
        { label: 'Бизнес-литература', value: 'business-literature' },
        { label: 'Боевая фантастика', value: 'combat-fiction' },
        { label: 'Боевик', value: 'action' },
        { label: 'Боевое фэнтези', value: 'combat-fantasy' },
        { label: 'Бояръ-Аниме', value: 'boyar-anime' },
        { label: 'Героическая фантастика', value: 'heroic-fiction' },
        { label: 'Героическое фэнтези', value: 'heroic-fantasy' },
        { label: 'Городское фэнтези', value: 'urban-fantasy' },
        { label: 'Гримдарк', value: 'grimdark' },
        { label: 'Детектив', value: 'mystery' },
        { label: 'Детская литература', value: 'kids-literature' },
        { label: 'Документальная проза', value: 'biography' },
        { label: 'Историческая проза', value: 'historical-fiction' },
        { label: 'Исторический детектив', value: 'historical-mystery' },
        {
          label: 'Исторический любовный роман',
          value: 'historical-romantic-novel',
        },
        { label: 'Историческое фэнтези', value: 'historical-fantasy' },
        { label: 'Киберпанк', value: 'cyberpunk' },
        { label: 'Космическая фантастика', value: 'cosmic-fiction' },
        { label: 'ЛитРПГ', value: 'litrpg' },
        { label: 'Лоу / Низкое фэнтези', value: 'low-fantasy' },
        { label: 'Любовное фэнтези', value: 'romantic-fantasy' },
        { label: 'Любовный роман', value: 'romantic-novel' },
        { label: 'Мистика', value: 'mystic' },
        { label: 'Мистический детектив', value: 'mystic-detective' },
        { label: 'Научная фантастика', value: 'science-fiction' },
        { label: 'Подростковая проза', value: 'young-adult' },
        { label: 'Политический роман', value: 'political-romance' },
        { label: 'Попаданцы', value: 'accidental-travel' },
        { label: 'Попаданцы в магические миры', value: 'magic-worlds-travel' },
        { label: 'Попаданцы во времени', value: 'time-travel' },
        { label: 'Порнотика', value: 'pornotica' },
        { label: 'Постапокалипсис', value: 'post-apocalypse' },
        { label: 'Поэзия', value: 'poetry' },
        { label: 'Приключения', value: 'adventure' },
        { label: 'Публицистика', value: 'journalism' },
        { label: 'Пьеса', value: 'play' },
        { label: 'Развитие личности', value: 'how-to-book' },
        { label: 'Разное', value: 'other' },
        { label: 'Реализм', value: 'Realism' },
        { label: 'РеалРПГ', value: 'realrpg' },
        { label: 'Репликация', value: 'replication' },
        { label: 'Романтическая эротика', value: 'romantic-erotic-fiction' },
        { label: 'Сказка', value: 'fairy-tale' },
        { label: 'Слэш', value: 'slash' },
        { label: 'Современная проза', value: 'modern-prose' },
        { label: 'Современный любовный роман', value: 'modern-romantic-novel' },
        { label: 'Социальная фантастика', value: 'social-fiction' },
        { label: 'Стимпанк', value: 'steampunk' },
        { label: 'Сценарий', value: 'scenario' },
        { label: 'Сюаньхуань', value: 'xuanhuan' },
        { label: 'Сянься', value: 'xianxia' },
        { label: 'Тёмное фэнтези', value: 'dark-fantasy' },
        { label: 'Триллер', value: 'thriller' },
        { label: 'Уся', value: 'wuxia' },
        { label: 'Фантастика', value: 'fiction' },
        { label: 'Фантастический детектив', value: 'mystery-fiction' },
        { label: 'Фанфик', value: 'fan-fiction' },
        { label: 'Фемслэш', value: 'femslash' },
        { label: 'Фэнтези', value: 'fantasy' },
        { label: 'Хоррор', value: 'horror' },
        { label: 'Шпионский детектив', value: 'spy-crime' },
        { label: 'Эпическое фэнтези', value: 'epic-fantasy' },
        { label: 'Эротика', value: 'erotic-fiction' },
        { label: 'Эротическая фантастика', value: 'erotic-fiction' },
        { label: 'Эротический фанфик', value: 'erotic-fan-fiction' },
        { label: 'Эротическое фэнтези', value: 'erotic-fantasy' },
        { label: 'Этническое фэнтези', value: 'ethnic-fantasy' },
        { label: 'Юмор', value: 'humor' },
        { label: 'Юмористическая фантастика', value: 'humor-fiction' },
        { label: 'Юмористическое фэнтези', value: 'humor-fantasy' },
        { label: 'RPS', value: 'rps' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    status: {
      label: 'Статус:',
      value: 'all',
      options: [
        { label: 'Любой статус', value: 'all' },
        { label: 'В процессе', value: 'in-process' },
        { label: 'Завершено', value: 'finished' },
      ],
      type: FilterTypes.Picker,
    },
    access: {
      label: 'Доступ:',
      value: 'all',
      options: [
        { label: 'Любой доступ', value: 'all' },
        { label: 'Бесплатные', value: 'free' },
        { label: 'Платные', value: 'paid' },
      ],
      type: FilterTypes.Picker,
    },
    adult: {
      label: 'Возрастные ограничения:',
      value: 'hide',
      options: [
        { label: 'Скрыть 18+', value: 'hide' },
        { label: 'Показать +18', value: 'show' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new freedlit();
