import { Plugin } from '@/types/plugin';
import { fetchApi } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { load as parseHTML } from 'cheerio';

class WTRLAB implements Plugin.PluginBase {
  id = 'WTRLAB';
  name = 'WTR-LAB';
  site = 'https://wtr-lab.com/';
  version = '1.0.1';
  icon = 'src/en/wtrlab/icon.png';
  sourceLang = 'en/';

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site + this.sourceLang + 'novel-list';
    link += `orderBy=${filters.order.value}`;
    link += `&order=${filters.sort.value}`;
    link += `&filter=${filters.storyStatus.value}`;
    link += `&page=${page}`; //TODO Genre & Advance Searching Filter. Ez to implement, too much manual work, too lazy.

    if (showLatestNovels) {
      const response = await fetchApi(this.site + 'api/home/recent', {
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

  const url = `${this.site}${novelPath}`;
  const html = await fetchApi(url).then(res => res.text());

  const $ = parseHTML(html);
  const jsonText = $('#__NEXT_DATA__').html() ?? '{}';
  const jsonData: any = JSON.parse(jsonText);

  const serie = jsonData?.props?.pageProps?.serie ?? {};

  const novel: Plugin.SourceNovel = {
    path: novelPath,
    name: serie.serie_data?.data?.title ?? '',
    cover: serie.serie_data?.data?.image ?? '',
    summary: serie.serie_data?.data?.description ?? '',
    author: serie.serie_data?.data?.author ?? '',
    genres: Array.isArray(serie.genres) ? serie.genres.join(', ') : '',
    status: '',
  };

  const totalChapters = serie.serie_data.raw_chapter_count;
  const rawId = serie.serie_data.raw_id;
  const slug = serie.serie_data?.slug ?? '';
  const chapters: Plugin.ChapterItem[] = [];

  for (let i = 1; i <= totalChapters; i++) {
    chapters.push({
      name: `Chapter ${i}`,
      path: `${this.sourceLang}novel/${rawId}/${slug}/chapter-${i}`,
      releaseTime: '',
      chapterNumber: i,
    });
  }

  novel.chapters = chapters;
  return novel;
}





async parseChapter(chapterPath: string): Promise<string> {
  const parts = chapterPath.split('/');
  const novelId = parts[parts.indexOf('novel') + 1];
  const chapterNoPart = parts[parts.length - 1];
  const chapterNo = parseInt(chapterNoPart.replace('chapter-', ''), 10);

 
  const apiUrl = 'https://wtr-lab.com/api/reader/get';
  const body = {
    translate: 'ai',
    retry: false,
    force_retry: false,
    language: this.sourceLang.replace('/', ''),
    raw_id: novelId,
    chapter_no: chapterNo
  };


  const res = await fetchApi(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8'
    },
    body: JSON.stringify(body),
    credentials: 'include' as any
  });

  const json = await res.json();
  const data = json?.data?.data;
  if (!data || !Array.isArray(data.body)) {
    return '';
  }

  let htmlString = '';
  let imgIndex = 0;
  for (const item of data.body) {
    if (item === '[image]') {
      const src = data.images?.[imgIndex++] ?? '';
      if (src) htmlString += `<img src="${src}"/>`;
    } else {
      htmlString += `<p>${item}</p>`;
    }
  }

  return htmlString;
}




  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const response = await fetchApi(this.site + 'api/search', {
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

type NovelJson = {
  props: Props;
  page: string;
};

type Props = {
  pageProps: PageProps;
  __N_SSP: boolean;
};

type PageProps = {
  serie: Serie;
  server_time: Date;
};

type Serie = {
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
};

type Chapter = {
  serie_id: number;
  id: number;
  order: number;
  slug: string;
  title: string;
  name: string;
  created_at: string;
  updated_at: string;
};
type ChapterData = {
  data: ChapterContent;
};
type ChapterContent = {
  title: string;
  body: string;
};

type SerieData = {
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
};

type Data = {
  title: string;
  author: string;
  description: string;
  image: string;
};

type JsonNovel = {
  success: boolean;
  data: Datum[];
};
type Datum = {
  serie: Serie;
  chapters: Chapter[];
  updated_at: Date;
  raw_id: number;
  slug: string;
  data: Data;
};

export default new WTRLAB();
