import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';

class RewayatClub implements Plugin.PagePlugin {
  id = 'rewayatclub';
  name = 'Rewayat Club';
  version = '1.0.2';
  icon = 'src/ar/rewayatclub/icon.png';
  site = 'https://rewayat.club/';

  parseNovels(data: NovelData): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    if (data.results === undefined) return novels;
    data.results.map((item: NovelEntry) => {
      novels.push({
        name: item.arabic || item.novel?.arabic || 'novel',
        path: item.slug
          ? `novel/${item.slug}`
          : item.novel
            ? `novel/${item.novel.slug}`
            : 'novel',
        cover: item.poster_url
          ? `https://api.rewayat.club/${item.poster_url.slice(1)}`
          : item.novel
            ? `https://api.rewayat.club/${item.novel.poster_url.slice(1)}`
            : defaultCover,
      });
    });
    return novels;
  }

  async popularNovels(
    page: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `https://api.rewayat.club/api/novels/`;
    let body: NovelData = {
      count: 0,
      next: '',
      previous: '',
      results: [],
    };
    if (showLatestNovels) {
      link = `${this.site}api/chapters/weekly/list/?page=${page}`;
      body = await fetchApi(link).then(r => r.json());
    } else if (filters) {
      if (filters.categories.value !== '') {
        link += `?type=${filters.categories.value}`;
      }
      if (filters.sortOptions.value !== '') {
        link += `&ordering=${filters.sortOptions.value}`;
      }
      if (filters.genre.value.length > 0) {
        filters.genre.value.forEach((genre: string) => {
          link += `&genre=${genre}`;
        });
      }
      link += `&page=${page}`;
      body = await fetchApi(link).then(r => r.json());
    }
    return this.parseNovels(body);
  }

  async parseNovel(
    novelUrl: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const result = await fetchApi(new URL(novelUrl, this.site).toString());
    const body = await result.text();
    const loadedCheerio = parseHTML(body);
    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelUrl,
      name: loadedCheerio('h1.primary--text span').text().trim() || 'Untitled',
      author: loadedCheerio('.novel-author').text().trim(),
      summary: loadedCheerio('div.text-pre-line span').text().trim(),
      totalPages: 1,
      chapters: [],
    };
    const statusWords = new Set(['مكتملة', 'متوقفة', 'مستمرة']);
    const mainGenres = Array.from(loadedCheerio('.v-slide-group__content a'))
      .map(el => loadedCheerio(el).text().trim())
      .join(',');
    const statusGenre = Array.from(
      loadedCheerio('div.v-slide-group__content span.v-chip__content'),
    )
      .map(el => loadedCheerio(el).text().trim())
      .filter(text => statusWords.has(text));
    novel.genres = `${statusGenre},${mainGenres}`;
    const statusText = Array.from(
      loadedCheerio('div.v-slide-group__content span.v-chip__content'),
    )
      .map(el => loadedCheerio(el).text().trim())
      .filter(text => statusWords.has(text))
      .join();
    novel.status =
      {
        'متوقفة': 'On Hiatus',
        'مكتملة': 'Completed',
        'مستمرة': 'Ongoing',
      }[statusText] || 'Unknown';
    const imageRaw = loadedCheerio('body script:contains("__NUXT__")')
      .first()
      .text();
    const imageUrlRegex = /poster_url:"(\\u002F[^"]+)"/;
    const imageUrlMatch = imageRaw?.match(imageUrlRegex);
    const ImageUrlShort = imageUrlMatch
      ? imageUrlMatch[1].replace(/\\u002F/g, '/').replace(/^\/*/, '')
      : defaultCover;
    const imageUrl = `https://api.rewayat.club/${ImageUrlShort}`;
    novel.cover = imageUrl;
    const chapterNumberStr = loadedCheerio('div.v-tab--active span.mr-1')
      .text()
      .replace(/[^\d]/g, '');
    const chapterNumber = parseInt(chapterNumberStr, 10);
    const pageNumber = Math.ceil(chapterNumber / 24);
    novel.totalPages = pageNumber;

    return novel;
  }
  parseChapters(data: ChapterData, novelPath: string) {
    const chapter: Plugin.ChapterItem[] = [];
    data.results.map((item: ChapterEntry) => {
      chapter.push({
        name: item.title,
        releaseTime: new Date(item.date).toISOString(),
        path: `${novelPath}/${item.number}`,
        chapterNumber: item.number,
      });
    });
    return chapter;
  }
  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const pagePath = novelPath.slice(6);
    const pageUrl = `https://api.rewayat.club/api/chapters/${pagePath}/?ordering=number&page=${page}`;
    const dataJson = await fetchApi(pageUrl).then(r => r.json());
    const chapters = this.parseChapters(dataJson, novelPath);
    return {
      chapters,
    };
  }
  async parseChapter(chapterUrl: string): Promise<string> {
    const link = this.site + 'api/chapters/' + chapterUrl.slice(6);
    const result = await fetchApi(link).then(r => r.json());
    let chapterText = result.content
      .flat()
      .join('<br>')
      .replace(/\n/g, '')
      .replace(/<p>/g, '\n');
    chapterText = chapterText.trim();
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const searchUrl = `https://api.rewayat.club/api/novels/?type=0&ordering=-num_chapters&page=${page}&search=${searchTerm}`;

    const result = await fetchApi(searchUrl).then(r => r.json());
    return this.parseNovels(result);
  }

  filters = {
    genre: {
      value: [],
      label: 'Genres',
      options: [
        { label: 'كوميديا', value: '1' }, // Comedy
        { label: 'أكشن', value: '2' }, // Action
        { label: 'دراما', value: '3' }, // Drama
        { label: 'فانتازيا', value: '4' }, // Fantasy
        { label: 'مهارات القتال', value: '5' }, // Combat Skills
        { label: 'مغامرة', value: '6' }, // Adventure
        { label: 'رومانسي', value: '7' }, // Romance
        { label: 'خيال علمي', value: '8' }, // Science Fiction
        { label: 'الحياة المدرسية', value: '9' }, // School Life
        { label: 'قوى خارقة', value: '10' }, // Super Powers
        { label: 'سحر', value: '11' }, // Magic
        { label: 'رياضة', value: '12' }, // Sports
        { label: 'رعب', value: '13' }, // Horror
        { label: 'حريم', value: '14' }, // Harem
      ],
      type: FilterTypes.CheckboxGroup,
    },
    categories: {
      value: '0',
      label: 'الفئات',
      options: [
        { label: 'جميع الروايات', value: '0' },
        { label: 'مترجمة', value: '1' },
        { label: 'مؤلفة', value: '2' },
        { label: 'مكتملة', value: '3' },
      ],
      type: FilterTypes.Picker,
    },
    sortOptions: {
      value: '-num_chapters',
      label: 'الترتيب',
      options: [
        { label: 'عدد الفصول - من أقل ﻷعلى', value: 'num_chapters' },
        { label: 'عدد الفصول - من أعلى ﻷقل', value: '-num_chapters' },
        { label: 'الاسم - من أقل ﻷعلى', value: 'english' },
        { label: 'الاسم - من أعلى ﻷقل', value: '-english' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new RewayatClub();

type NovelEntry = {
  arabic: string;
  english: string;
  about: string;
  poster_url: string;
  slug: string;
  original: boolean;
  complete: boolean;
  num_chapters: number;
  genre: {
    id: number;
    arabic: string;
    english: string;
  };
  novel?: {
    arabic: string;
    english: string;
    slug: string;
    poster: string;
    id: number;
    poster_url: string;
    original: boolean;
  };
};
type NovelData = {
  count?: number;
  next?: string;
  previous?: string;
  results: NovelEntry[];
};
type ChapterEntry = {
  number: number;
  title: string;
  date: string;
  uploader: {
    username: string;
    id: number;
  };
  hitcounts: {
    hits: number;
    id: number;
  };
  read: any[];
};

type ChapterData = {
  count: number;
  next: string;
  previous: string;
  results: ChapterEntry[];
};
