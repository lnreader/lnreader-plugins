import { Plugin } from '@typings/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi, fetchFile } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import dayjs from 'dayjs';

class Jaomix implements Plugin.PluginBase {
  id = 'jaomix.ru';
  name = 'Jaomix';
  site = 'https://jaomix.ru';
  version = '1.0.0';
  icon = 'src/ru/jaomix/icon.png';

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + '/?searchrn';

    if (filters?.lang?.value?.length) {
      url += filters.lang.value
        .map((lang, idx) => `&lang[${idx}]=${lang}`)
        .join('');
    }

    if (filters?.genre?.value?.include?.length) {
      url += filters.genre.value.include
        .map((genre, idx) => `&genre[${idx}]=${genre}`)
        .join('');
    }

    if (filters?.genre?.value?.exclude?.length) {
      url += filters.genre.value.exclude
        .map((genre, idx) => `&delgenre[${idx}]=del ${genre}`)
        .join('');
    }

    url += '&sortcountchapt=' + (filters?.sortcountchapt?.value || '1');
    url += '&sortdaycreate=' + (filters?.sortdaycreate?.value || '1');
    url +=
      '&sortby=' +
      (showLatestNovels ? 'upd' : filters?.sortby?.value || 'topweek');
    url += '&gpage=' + pageNo;

    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('div[class="block-home"] > div[class="one"]').each(
      (index, element) => {
        const name = loadedCheerio(element)
          .find('div[class="img-home"] > a')
          .attr('title');
        const cover = loadedCheerio(element)
          .find('div[class="img-home"] > a > img')
          .attr('src')
          ?.replace('-150x150', '');
        const url = loadedCheerio(element)
          .find('div[class="img-home"] > a')
          .attr('href');

        if (!name || !url) return;

        novels.push({ name, cover, path: url.replace(this.site, '') });
      },
    );

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('div[class="desc-book"] > h1').text().trim(),
      cover: loadedCheerio('div[class="img-book"] > img').attr('src'),
      summary: loadedCheerio('div[id="desc-tab"]').text().trim(),
    };

    loadedCheerio('#info-book > p').each(function () {
      let text = loadedCheerio(this).text().replace(/,/g, '').split(' ');
      if (text[0] === 'Автор:') {
        novel.author = text.splice(1).join(' ');
      } else if (text[0] === 'Жанры:') {
        novel.genres = text.splice(1).join(',');
      } else if (text[0] === 'Статус:') {
        novel.status = text.includes('продолжается')
          ? NovelStatus.Ongoing
          : NovelStatus.Completed;
      }
    });

    const chapters: Plugin.ChapterItem[] = [];
    const totalChapters = loadedCheerio('.download-chapter div.title').length;

    loadedCheerio('.download-chapter div.title').each(
      (chapterIndex, element) => {
        const name = loadedCheerio(element).find('a').attr('title');
        const url = loadedCheerio(element).find('a').attr('href');
        if (!name || !url) return;

        const releaseDate = loadedCheerio(element).find('time').text();
        chapters.push({
          name,
          path: url.replace(this.site, ''),
          releaseTime: this.parseDate(releaseDate),
          chapterNumber: totalChapters - chapterIndex,
        });
      },
    );

    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);

    loadedCheerio('div[class="adblock-service"]').remove();
    const chapterText = loadedCheerio('div[class="entry-content"]').html();

    return chapterText || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number | undefined = 1,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site +
      '/?searchrn=' +
      searchTerm +
      '&but=Поиск по названию&sortby=upd&gpage=' +
      pageNo;
    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('div[class="block-home"] > div[class="one"]').each(
      (index, element) => {
        const name = loadedCheerio(element)
          .find('div[class="img-home"] > a')
          .attr('title');
        const cover = loadedCheerio(element)
          .find('div[class="img-home"] > a > img')
          .attr('src')
          ?.replace('-150x150', '');
        const url = loadedCheerio(element)
          .find('div[class="img-home"] > a')
          .attr('href');

        if (!name || !url) return;

        novels.push({ name, cover, path: url.replace(this.site, '') });
      },
    );

    return novels;
  }

  parseDate = (dateString: string | undefined = '') => {
    const months: { [key: string]: number } = {
      Янв: 1,
      Фев: 2,
      Мар: 3,
      Апр: 4,
      Май: 5,
      Июн: 6,
      Июл: 7,
      Авг: 8,
      Сен: 9,
      Окт: 10,
      Ноя: 11,
      Дек: 12,
    };

    const [time, day, month, year] = dateString.split(' ');
    if (time && day && months[month] && year) {
      return dayjs(year + '-' + months[month] + '-' + day + ' ' + time).format(
        'LLL',
      );
    }

    return dateString || null;
  };

  fetchImage = fetchFile;

  filters = {
    sortby: {
      label: 'Сортировка:',
      value: 'topweek',
      options: [
        { label: 'Топ недели', value: 'topweek' },
        { label: 'По алфавиту', value: 'alphabet' },
        { label: 'По дате обновления', value: 'upd' },
        { label: 'По дате создания', value: 'new' },
        { label: 'По просмотрам', value: 'count' },
        { label: 'Топ года', value: 'topyear' },
        { label: 'Топ дня', value: 'topday' },
        { label: 'Топ за все время', value: 'alltime' },
        { label: 'Топ месяца', value: 'topmonth' },
      ],
      type: FilterTypes.Picker,
    },
    sortdaycreate: {
      label: 'Дата добавления:',
      value: '1',
      options: [
        { label: 'Любое', value: '1' },
        { label: 'От 120 до 180 дней', value: '1218' },
        { label: 'От 180 до 365 дней', value: '1836' },
        { label: 'От 30 до 60 дней', value: '3060' },
        { label: 'От 365 дней', value: '365' },
        { label: 'От 60 до 90 дней', value: '6090' },
        { label: 'От 90 до 120 дней', value: '9012' },
        { label: 'Послед. 30 дней', value: '30' },
      ],
      type: FilterTypes.Picker,
    },
    sortcountchapt: {
      label: 'Количество глав:',
      value: '1',
      options: [
        { label: 'Любое кол-во глав', value: '1' },
        { label: 'До 500', value: '500' },
        { label: 'От 1000 до 2000', value: '1020' },
        { label: 'От 2000 до 3000', value: '2030' },
        { label: 'От 3000 до 4000', value: '3040' },
        { label: 'От 4000', value: '400' },
        { label: 'От 500 до 1000', value: '510' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Жанры:',
      value: { include: [], exclude: [] },
      options: [
        { label: 'Боевые Искусства', value: 'Боевые Искусства' },
        { label: 'Виртуальный Мир', value: 'Виртуальный Мир' },
        { label: 'Гарем', value: 'Гарем' },
        { label: 'Детектив', value: 'Детектив' },
        { label: 'Драма', value: 'Драма' },
        { label: 'Игра', value: 'Игра' },
        { label: 'Истории из жизни', value: 'Истории из жизни' },
        { label: 'Исторический', value: 'Исторический' },
        { label: 'История', value: 'История' },
        { label: 'Исэкай', value: 'Исэкай' },
        { label: 'Комедия', value: 'Комедия' },
        { label: 'Меха', value: 'Меха' },
        { label: 'Мистика', value: 'Мистика' },
        { label: 'Научная Фантастика', value: 'Научная Фантастика' },
        { label: 'Повседневность', value: 'Повседневность' },
        { label: 'Постапокалипсис', value: 'Постапокалипсис' },
        { label: 'Приключения', value: 'Приключения' },
        { label: 'Психология', value: 'Психология' },
        { label: 'Романтика', value: 'Романтика' },
        { label: 'Сверхъестественное', value: 'Сверхъестественное' },
        { label: 'Сёнэн', value: 'Сёнэн' },
        { label: 'Сёнэн-ай', value: 'Сёнэн-ай' },
        { label: 'Спорт', value: 'Спорт' },
        { label: 'Сэйнэн', value: 'Сэйнэн' },
        { label: 'Сюаньхуа', value: 'Сюаньхуа' },
        { label: 'Трагедия', value: 'Трагедия' },
        { label: 'Триллер', value: 'Триллер' },
        { label: 'Фантастика', value: 'Фантастика' },
        { label: 'Фэнтези', value: 'Фэнтези' },
        { label: 'Хоррор', value: 'Хоррор' },
        { label: 'Школьная жизнь', value: 'Школьная жизнь' },
        { label: 'Шоунен', value: 'Шоунен' },
        { label: 'Экшн', value: 'Экшн' },
        { label: 'Этти', value: 'Этти' },
        { label: 'Юри', value: 'Юри' },
        { label: 'Adult', value: 'Adult' },
        { label: 'Ecchi', value: 'Ecchi' },
        { label: 'Josei', value: 'Josei' },
        { label: 'Lolicon', value: 'Lolicon' },
        { label: 'Mature', value: 'Mature' },
        { label: 'Shoujo', value: 'Shoujo' },
        { label: 'Wuxia', value: 'Wuxia' },
        { label: 'Xianxia', value: 'Xianxia' },
        { label: 'Xuanhuan', value: 'Xuanhuan' },
        { label: 'Yaoi', value: 'Yaoi' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    lang: {
      label: 'Выбрать языки:',
      value: [],
      options: [
        { label: 'Английский', value: 'Английский' },
        { label: 'Китайский', value: 'Китайский' },
        { label: 'Корейский', value: 'Корейский' },
        { label: 'Японский', value: 'Японский' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new Jaomix();
