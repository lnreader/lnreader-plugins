import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import dayjs, { ManipulateType } from 'dayjs';

class VyNovel implements Plugin.PluginBase {
  id = 'vynovel';
  name = 'VyNovel';
  site = 'https://vynovel.com';
  version = '1.0.1';
  icon = 'src/en/vynovel/icon.png';

  async fetchNovels(
    page: number,
    showLatestNovels?: boolean,
    filters?: Plugin.PopularNovelsOptions<typeof this.filters>['filters'],
    searchTerm?: string,
  ): Promise<Plugin.NovelItem[]> {
    const data = new URLSearchParams({
      sort: showLatestNovels ? 'updated_at' : filters?.sort?.value || 'viewed',
      page: page.toString(),
    });
    if (searchTerm) data.append('q', searchTerm);

    const url = this.site + '/search?' + data.toString();

    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('div[class="comic-item"] > a').each((_, element) => {
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

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ) {
    return this.fetchNovels(page, showLatestNovels, filters);
  }

  async searchNovels(searchTerm: string, page: number) {
    return this.fetchNovels(page, false, undefined, searchTerm);
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
          releaseTime: this.parseAgoDate(releaseDate),
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

  private parseAgoDate(date: string | undefined) {
    //parseMadaraDate
    const parsed = dayjs(date);
    if (date && parsed.isValid()) {
      return parsed.toISOString();
    }

    const [amt, time, ago] = date?.toLowerCase().trim().split(/\s+/) || [];
    const decade = time?.includes('decade'); // dayjs no support, but just in case
    const amount = (amt === 'a' || amt === 'an' ? 1 : +amt) * (decade ? 10 : 1);
    const unit = (decade ? 'year' : time) as ManipulateType;

    const validUnits = [
      'millisecond', // waow
      'second',
      'minute',
      'hour',
      'day',
      'week',
      'month',
      'year',
    ];

    if (ago !== 'ago' || isNaN(amount) || !validUnits.includes(unit)) {
      return null;
    }

    return dayjs().subtract(amount, unit).toISOString();
  }

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
