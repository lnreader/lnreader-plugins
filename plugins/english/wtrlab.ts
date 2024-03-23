import { Plugin } from '@typings/plugin';
import { fetchApi, fetchFile } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { load as parseHTML } from 'cheerio';

class WTRLAB implements Plugin.PluginBase {
  id = 'WTRLAB';
  name = 'WTR-LAB';
  site = 'https://wtr-lab.com/';
  version = '1.0.0';
  icon = 'src/en/wtrlab/icon.png';
  sourceLang = 'en/';

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site + this.sourceLang + 'novel-list?';
    link += `orderBy=${filters.order.value}`;
    link += `&order=${filters.sort.value}`;
    link += `&filter=${filters.storyStatus.value}`;
    link += `&page=${page}`; //TODO Genre & Advance Searching Filter. Ez to implement, too much manual work, too lazy.

    if (showLatestNovels) {
      const response = await fetch('https://wtr-lab.com/api/home/recent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ page: page }),
      });

      const recentNovel: JsonNovel = await response.json();

      // Parse novels from JSON
      const novels: Plugin.NovelItem[] = recentNovel.data.map(
        (datum: Datum) => ({
          name: datum.serie.data.title || '',
          cover: datum.serie.data.image,
          path:
            this.sourceLang +
              'serie-' +
              datum.serie.raw_id +
              '/' +
              datum.serie.slug || '',
        }),
      );

      return novels;
    } else {
      const body = await fetchApi(link).then(res => res.text());
      const loadedCheerio = parseHTML(body);
      //console.log(link);
      const novels: Plugin.NovelItem[] = loadedCheerio('.serie-item')
        .map((index, element) => ({
          name:
            loadedCheerio(element)
              .find('.title-wrap > a')
              .text()
              .replace(loadedCheerio(element).find('.rawtitle').text(), '') ||
            '',
          cover: loadedCheerio(element).find('img').attr('src'),
          path: loadedCheerio(element).find('a').attr('href') || '',
        }))
        .get()
        .filter(novel => novel.name && novel.path);
      return novels;
    }
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(res => res.text());
    const loadedCheerio = parseHTML(body);
    //console.log(this.site + novelPath);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.text-uppercase').text(),
      cover: loadedCheerio('.img-wrap > img').attr('src'),
      summary: loadedCheerio('.lead').text().trim(),
    };

    novel.genres = loadedCheerio('td:contains("Genre")')
      .next()
      .find('a')
      .map((i, el) => loadedCheerio(el).text())
      .toArray()
      .join(',');

    novel.author = loadedCheerio('td:contains("Author")')
      .next()
      .text()
      .replace(/[\t\n]/g, '');

    novel.status = loadedCheerio('td:contains("Status")')
      .next()
      .text()
      .replace(/[\t\n]/g, '');

    const chapterJson = loadedCheerio('#__NEXT_DATA__').html() + '';
    const jsonData: NovelJson = JSON.parse(chapterJson);

    const chapters: Plugin.ChapterItem[] =
      jsonData.props.pageProps.serie.chapters.map(
        (jsonChapter, chapterIndex) => ({
          name: 'Chapter ' + jsonChapter.slug + ' ' + jsonChapter.title,
          path:
            this.sourceLang +
            'serie-' +
            jsonData.props.pageProps.serie.serie_data.raw_id +
            '/' +
            jsonData.props.pageProps.serie.serie_data.slug +
            '/chapter-' +
            jsonChapter.slug, // Assuming 'slug' is the intended path
          releaseTime: jsonChapter.created_at.substring(0, 10),
          chapterNumber: chapterIndex + 1,
        }),
      );

    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);
    const chapterJson = loadedCheerio('#__NEXT_DATA__').html() + '';
    const jsonData: NovelJson = JSON.parse(chapterJson);

    //console.log(body);

    const chapterContent = JSON.stringify(
      jsonData.props.pageProps.serie.chapter_data.data.body,
    );
    //console.log(chapterContent);
    const parsedArray = JSON.parse(chapterContent);
    let htmlString = '';

    for (const text of parsedArray) {
      htmlString += `<p>${text}</p>`;
    }

    return htmlString;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const response = await fetch(this.site + 'api/search', {
      headers: {
        'Content-Type': 'application/json',
        Referer: this.site + this.sourceLang,
        Origin: this.site,
      },
      method: 'POST',
      body: JSON.stringify({ text: searchTerm }),
    });

    const recentNovel: JsonNovel = await response.json();

    // Parse novels from JSON
    const novels: Plugin.NovelItem[] = recentNovel.data.map((datum: Datum) => ({
      name: datum.data.title || '',
      cover: datum.data.image,
      path: this.sourceLang + 'serie-' + datum.raw_id + '/' + datum.slug || '',
    }));

    return novels;
  }

  fetchImage = fetchFile;
  filters = {
    order: {
      value: 'chapter',
      label: 'Order by',
      options: [
        { label: 'View', value: 'view' },
        { label: 'Name', value: 'name' },
        { label: 'Addition Date', value: 'date' },
        { label: 'Reader', value: 'reader' },
        { label: 'Chapter', value: 'chapter' },
      ],
      type: FilterTypes.Picker,
    },
    sort: {
      value: 'desc',
      label: 'Sort by',
      options: [
        { label: 'Descending', value: 'desc' },
        { label: 'Ascending', value: 'asc' },
      ],
      type: FilterTypes.Picker,
    },
    storyStatus: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

interface NovelJson {
  props: Props;
  page: string;
}

interface Props {
  pageProps: PageProps;
  __N_SSP: boolean;
}

interface PageProps {
  serie: Serie;
  server_time: Date;
}

interface Serie {
  serie_data: SerieData;
  chapters: Chapter[];
  recommendation: SerieData[];
  chapter_data: ChapterData;
  id: number;
  raw_id: number;
  slug: string;
  data: Data;
  is_default: boolean;
  raw_type: string;
}

interface Chapter {
  serie_id: number;
  id: number;
  slug: string;
  title: string;
  name: string;
  created_at: string;
}
interface ChapterData {
  data: ChapterContent;
}
interface ChapterContent {
  title: string;
  body: string;
}

interface SerieData {
  serie_id?: number;
  recommendation_id?: number;
  score?: string;
  id: number;
  slug: string;
  search_text: string;
  status: number;
  data: Data;
  created_at: string;
  updated_at: string;
  view: number;
  in_library: number;
  rating: number | null;
  chapter_count: number;
  power: number;
  total_rate: number;
  user_status: number;
  verified: boolean;
  from: null;
  raw_id: number;
  genres?: number[];
}

interface Data {
  title: string;
  author: string;
  description: string;
  image: string;
}

interface JsonNovel {
  success: boolean;
  data: Datum[];
}
interface Datum {
  serie: Serie;
  chapters: Chapter[];
  updated_at: Date;
  raw_id: number;
  slug: string;
  data: Data;
}

export default new WTRLAB();
