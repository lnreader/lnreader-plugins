import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';

class BakaInUa implements Plugin.PluginBase {
  id = 'bakainua';
  name = 'BakaInUA';
  icon = 'src/uk/bakainua/icon.png';
  site = 'https://baka.in.ua';
  version = '2.0.0';

  async popularNovels(
    pageNo: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const fictionIds: string[] = [];

    const url: URL = new URL(this.site + '/fictions/alphabetical');

    if (pageNo > 1) url.searchParams.append('page', pageNo.toString());
    if (showLatestNovels || (filters && filters.only_new.value))
      url.searchParams.append('only_new', '1');
    if (filters) {
      if (filters.longreads.value) url.searchParams.append('longreads', '1');
      if (filters.finished.value) url.searchParams.append('finished', '1');
      if (filters.genre.value !== '')
        url.searchParams.append('genre', filters.genre.value);
    }

    const result = await fetchApi(url.toString());
    const body = await result.text();
    const $ = parseHTML(body);

    // get the ids of the popular novels
    $('div#fiction-list-page > div > div > div > img').each((index, elem) => {
      const fictionId = $(elem).attr('data-fiction-picker-id-param');
      if (fictionId) {
        fictionIds.push(fictionId);
      }
    });

    // fetch the details of the popular novels asynchronously
    const requests: Promise<Plugin.NovelItem>[] = fictionIds.map(async id => {
      const res = await fetchApi(`${this.site}/fictions/${id}/details`, {
        headers: {
          accept: 'text/vnd.turbo-stream.html',
        },
      });
      const $ = parseHTML(await res.text());
      const elem = $('a').first();

      return {
        name: $('h3').text().trim(),
        path: elem.attr('href') || '',
        cover: this.site + $(elem).find('img').attr('src'),
      };
    });

    return await Promise.all(requests);
  }

  async parseNovel(novelUrl: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + '/' + novelUrl);
    const body = await result.text();
    const $ = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelUrl,
      name: $('main div > h1').text().trim(),
      author: $('button#fictions-author-search').text().trim(),
      cover: this.site + $('main div > img').attr('src'),
      summary: $('main div > h3').first().parent().find('div').text().trim(),
      genres: $('h4:contains("Жанри")')
        .last()
        .siblings()
        .last()
        .find('span')
        .map((_, el) => $(el).text().trim())
        .get()
        .join(', '),
    };

    switch ($('div:contains("Статус")').last().siblings().text().trim()) {
      case 'Видаєт.':
        novel.status = NovelStatus.Ongoing;
        break;
      case 'Заверш.':
        novel.status = NovelStatus.Completed;
        break;
      case 'Покину.':
        novel.status = NovelStatus.OnHiatus;
        break;
      default:
        novel.status = NovelStatus.Unknown;
        break;
    }

    const chapters: Plugin.ChapterItem[] = [];
    $('li.group a').each((index, elem) => {
      const chapter: Plugin.ChapterItem = {
        name: $(elem).find('span').eq(1).text().trim(),
        path: $(elem).attr('href') || '',
        chapterNumber: parseInt($(elem).find('span').eq(0).text().trim()),
        releaseTime: $(elem).find('span').eq(2).text().trim(),
      };
      chapters.push(chapter);
    });

    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterUrl: string): Promise<string> {
    const result = await fetchApi(this.site + '/' + chapterUrl);
    const body = await result.text();
    const $ = parseHTML(body);
    return $('#user-content').html() || '';
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];

    const result = await fetchApi(
      this.site + '/search?search%5B%5D=' + searchTerm + '&only_fictions=true',
    );
    const body = await result.text();
    const $ = parseHTML(body);
    $('ul > section').each((index, elem) => {
      novels.push({
        path: $(elem).find('a').first().attr('href') || '',
        name: $(elem).find('a > h2').first().text().trim(),
        cover: this.site + $(elem).find('img').first().attr('src'),
      });
    });
    return novels;
  }

  filters = {
    genre: {
      type: FilterTypes.Picker,
      label: 'Жанр',
      value: '',
      options: [
        { label: 'Всі жанри', value: '' },
        { label: 'BL', value: '19' },
        { label: 'GL', value: '20' },
        { label: 'Авторське', value: '32' },
        { label: 'Бойовик', value: '2' },
        { label: 'Вуся', value: '16' },
        { label: 'Гарем', value: '5' },
        { label: 'Детектив', value: '22' },
        { label: 'Драма', value: '12' },
        { label: 'Жахи', value: '10' },
        { label: 'Ісекай', value: '13' },
        { label: 'Історичне', value: '15' },
        { label: 'Комедія', value: '11' },
        { label: 'ЛГБТ', value: '3' },
        { label: 'Містика', value: '18' },
        { label: 'Омегаверс', value: '30' },
        { label: 'Повсякденність', value: '17' },
        { label: 'Пригоди', value: '7' },
        { label: 'Психологія', value: '28' },
        { label: 'Романтика', value: '1' },
        { label: 'Спорт', value: '9' },
        { label: 'Сюаньхвань', value: '27' },
        { label: 'Сянься', value: '26' },
        { label: 'Трагедія', value: '24' },
        { label: 'Трилер', value: '21' },
        { label: 'Фантастика', value: '8' },
        { label: 'Фанфік', value: '23' },
        { label: 'Фентезі', value: '4' },
        { label: 'Школа', value: '6' },
      ],
    },
    only_new: {
      type: FilterTypes.Switch,
      label: 'Новинки',
      value: false,
    },
    longreads: {
      type: FilterTypes.Switch,
      label: 'Довгочити',
      value: false,
    },
    finished: {
      type: FilterTypes.Switch,
      label: 'Завершене',
      value: false,
    },
  } satisfies Filters;
}

export default new BakaInUa();
