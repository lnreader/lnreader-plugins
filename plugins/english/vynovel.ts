import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import dayjs from 'dayjs';

class VyNovel implements Plugin.PluginBase {
  id = 'vynovel';
  name = 'VyNovel';
  site = 'https://vynovel.com';
  version = '1.0.0';
  icon = 'src/en/vynovel/icon.png';

  async fetchNovels(
    page: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
    searchTerm?: string,
  ): Promise<Plugin.NovelItem[]> {
    const data = new URLSearchParams({
      sort: showLatestNovels ? 'updated_at' : filters?.sort?.value || 'viewed',
      page,
    });
    if (searchTerm) data.append('q', searchTerm);

    const url = this.site + '/search?' + data.toString();

    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('div[class="comic-item"] > a').each((index, element) => {
      const name = loadedCheerio(element)
        .find('div[class="comic-title"]')
        .text()
        ?.trim();
      const cover =
        loadedCheerio(element)
          .find('div[class="comic-image lozad "]')
          .attr('data-background-image') || defaultCover;
      const url = loadedCheerio(element).attr('href');

      if (!name || !url) return;

      novels.push({ name, cover, path: url.replace('/novel/', '') });
    });

    return novels;
  }

  popularNovels = this.fetchNovels;

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const defaultOptions: any = {
      filters: undefined,
      showLatestNovels: false,
    };
    return this.fetchNovels(page, defaultOptions, searchTerm);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.resolveUrl(novelPath, true)).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1[class="title"]').text().trim(),
      cover:
        loadedCheerio('div[class="img-manga"] > img').attr('src') ||
        defaultCover,
      summary: loadedCheerio('div[class="summary"] > p[class="content"]')
        .text()
        .trim(),
      author: loadedCheerio('div[class="col-md-7"] > p:nth-child(5) > a')
        .text()
        .trim(),
      status:
        loadedCheerio('span[class="text-ongoing"]').text() === 'Ongoing'
          ? NovelStatus.Ongoing
          : NovelStatus.Completed,
    };

    const chapters: Plugin.ChapterItem[] = [];
    const totalChapters = loadedCheerio('div[class="list-group"] > a').length;

    loadedCheerio('div[class="list-group"] > a').each(
      (chapterIndex, element) => {
        const name = loadedCheerio(element).find('span').text().trim();
        const id = loadedCheerio(element).attr('id')?.replace(/\D/g, '');
        if (!name || !id) return;

        const releaseDate = loadedCheerio(element).find('p').text();
        chapters.push({
          name,
          path: novelPath + '/' + id,
          releaseTime: this.parseDate(releaseDate?.trim()),
          chapterNumber: totalChapters - chapterIndex,
        });
      },
    );

    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.resolveUrl(chapterPath)).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('.content').html();
    return chapterText || '';
  }

  parseDate = (date = '') => {
    if (!date) return null;
    if (date.includes('ago')) {
      const [value, type] = date.split(' ');
      if (!value || !type) return null;

      switch (type.toLowerCase()) {
        case 'minutes': {
          const minutes = parseInt(value, 10);
          date = Date.now() - minutes * 60 * 1000;
          break;
        }
        case 'hour':
        case 'hours': {
          const hours = parseInt(value, 10);
          date = Date.now() - hours * 60 * 60 * 1000;
          break;
        }
        case 'day':
        case 'days': {
          const days = parseInt(value, 10);
          date = Date.now() - days * 24 * 60 * 60 * 1000;
          break;
        }
        default:
          console.log(date);
          date = undefined;
      }
      return dayjs(date).format('LLL');
    }
    return date;
  };

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/novel/' : '/read/') + path;

  filters = {
    sort: {
      label: 'Sort By:',
      value: 'viewed',
      options: [
        { label: 'Viewed', value: 'viewed' },
        { label: 'Scored', value: 'scored' },
        { label: 'Newest', value: 'created_at' },
        { label: 'Latest Update', value: 'updated_at' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new VyNovel();
