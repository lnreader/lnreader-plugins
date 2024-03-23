import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';

class RoyalRoad implements Plugin.PluginBase {
  id = 'royalroad';
  name = 'Royal Road';
  version = '1.0.1';
  icon = 'src/en/royalroad/icon.png';
  site = 'https://www.royalroad.com/';

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.fiction-list-item').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('a.bold').text();
      const novelCover = loadedCheerio(ele).find('img').attr('src');
      const novelUrl = loadedCheerio(ele).find('a.bold').attr('href')?.slice(1);

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl,
      };

      novels.push(novel);
    });

    return novels;
  }

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}fictions/`;

    link += filters.order.value;
    link += `?page=${page}`;

    if (filters.genre.value !== '') link += `&genre=${filters.genre.value}`;

    const body = await fetchApi(link).then(r => r.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1').text() || 'Untitled',
      cover: loadedCheerio('.cover-art-container img').attr('src'),
      author: loadedCheerio('h4 a').text(),
      summary: loadedCheerio('.description').text().trim(),
      status: loadedCheerio('span.label-sm:last').text().trim(),
      chapters: [],
    };

    novel.genres = loadedCheerio('span.tags a')
      .map((i, el) => loadedCheerio(el).text())
      .toArray()
      .join(',');

    const chapterJson = JSON.parse(
      loadedCheerio('script:contains("window.chapters")')
        .html()
        ?.match(/window.chapters = (.+])(?=;)/)![1] || '',
    );

    const volumeJson = JSON.parse(
      loadedCheerio('script:contains("window.chapters")')
        .html()
        ?.match(/window.volumes = (.+])(?=;)/)![1] || '',
    );

    const chapter: Plugin.ChapterItem[] = chapterJson.map(
      (chapter: ChapterEntry) => {
        const matchingVolume = volumeJson.find(
          (volume: VolumeEntry) => volume.id === chapter.volumeId,
        );
        return {
          name: chapter.title,
          path: chapter.url.slice(1),
          releaseTime: chapter.date,
          chapterNumber: chapter?.order,
          page: matchingVolume ? matchingVolume.title : null,
        };
      },
    );

    novel.chapters = chapter;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('.chapter-content').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const searchUrl = `${this.site}fictions/search?page=${page}&title=${searchTerm}`;

    const result = await fetchApi(searchUrl);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }

  filters = {
    order: {
      value: 'weekly-popular',
      label: 'Order By',
      options: [
        { label: 'Best Rated', value: 'best-rated' },
        { label: 'Trending', value: 'trending' },
        { label: 'Ongoing Fictions', value: 'active-popular' },
        { label: 'Complete', value: 'complete' },
        { label: 'Popular this week', value: 'weekly-popular' },
        { label: 'Latest Updates', value: 'latest-updates' },
        { label: 'Newest Fictions', value: 'new' },
        { label: 'Rising Stars', value: 'rising-stars' },
        { label: 'Writathon', value: 'writathon' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      value: '',
      label: 'Genres',
      options: [
        { label: 'ALL', value: '' },
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Contemporary', value: 'contemporary' },
        { label: 'Drama', value: 'drama' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Romance', value: 'romance' },
        { label: 'Satire', value: 'satire' },
        { label: 'Sci-fi', value: 'sci_fi' },
        { label: 'Short Story', value: 'one_shot' },
        { label: 'Tragedy', value: 'tragedy' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new RoyalRoad();

interface ChapterEntry {
  id: number;
  volumeId: number;
  title: string;
  date: string;
  order: number;
  url: string;
}

interface VolumeEntry {
  id: number;
  title: string;
  cover: string;
  order: number;
}
