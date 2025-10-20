import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';

class Sunovels implements Plugin.PagePlugin {
  id = 'sunovels';
  name = 'Sunovels';
  version = '1.0.0';
  icon = 'src/ar/sunovels/icon.png';
  site = 'https://sunovels.com/';

  parseNovels(loadedCheerio: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const imageUrlList: string[] = [];
    loadedCheerio('script').each((idx, ele) => {
      const regax = /\/uploads\/[^\s"]+/g;
      const scriptText = loadedCheerio(ele).text();
      const imageUrlMatched = scriptText.match(regax);
      if (imageUrlMatched) {
        imageUrlList.push(...imageUrlMatched);
      }
    });
    let counter = 0;
    loadedCheerio('.list-item').each((idx, ele) => {
      loadedCheerio(ele)
        .find('a')
        .each((idx, ele) => {
          const novelName = loadedCheerio(ele).find('h4').text().trim();
          const novelUrl =
            loadedCheerio(ele).attr('href')?.trim().replace(/^\/*/, '') || '';
          let novelCover = defaultCover;
          if (imageUrlList.length > 0) {
            novelCover = this.site + imageUrlList[counter].slice(1);
          } else {
            const imageUrl = loadedCheerio(ele).find('img').attr('src');
            novelCover = this.site + imageUrl?.slice(1);
          }
          const novel = {
            name: novelName,
            cover: novelCover,
            path: novelUrl,
          };
          counter++;
          novels.push(novel);
        });
    });

    return novels;
  }

  async popularNovels(
    page: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    const pageCorrected = page - 1;
    let link = `${this.site}library?`;

    if (filters) {
      if (
        Array.isArray(filters.categories.value) &&
        filters.categories.value.length > 0
      ) {
        filters.categories.value.forEach((genre: string) => {
          link += `&category=${genre}`;
        });
      }
      if (filters.status.value !== '') {
        link += `&status=${filters.status.value}`;
      }
    }
    link += `&page=${pageCorrected}`;
    const body = await fetchApi(link).then(r => r.text());
    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(
    novelUrl: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const result = await fetchApi(new URL(novelUrl, this.site).toString());
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelUrl,
      name: loadedCheerio('div.main-head h3').text().trim() || 'Untitled',
      author: loadedCheerio('.novel-author').text().trim(),
      summary: loadedCheerio('section.info-section div.description p')
        .text()
        .trim(),
      totalPages: 1,
      chapters: [],
    };
    const statusWords = new Set(['مكتمل', 'جديد', 'مستمر']);
    const mainGenres = Array.from(loadedCheerio('div.categories li.tag'))
      .map(el => loadedCheerio(el).text().trim())
      .join(',');
    const statusGenre = Array.from(
      loadedCheerio('div.header-stats span').eq(3).find('strong'),
    )
      .map(el => loadedCheerio(el).text().trim())
      .filter(text => statusWords.has(text));
    novel.genres = `${statusGenre},${mainGenres}`;
    const statusText = Array.from(
      loadedCheerio('div.header-stats span').eq(3).find('strong'),
    )
      .map(el => loadedCheerio(el).text().trim())
      .filter(text => statusWords.has(text))
      .join();
    novel.status =
      {
        'جديد': 'Ongoing',
        'مكتمل': 'Completed',
        'مستمر': 'Ongoing',
      }[statusText] || 'Unknown';
    const imageUrl = loadedCheerio('div.img-container figure.cover img').attr(
      'src',
    );
    const imageUrlFull = this.site + imageUrl?.slice(1);
    novel.cover = imageUrlFull;
    const chapterNumberStr = loadedCheerio('div.header-stats span')
      .first()
      .text()
      .replace(/[^\d]/g, '');
    const chapterNumber = parseInt(chapterNumberStr, 10);
    const pageNumber = Math.ceil(chapterNumber / 50);
    novel.totalPages = pageNumber;

    return novel;
  }
  parseChapters(data: { chapters: ChapterEntry[] }) {
    const chapter: Plugin.ChapterItem[] = [];
    data.chapters.map((item: ChapterEntry) => {
      chapter.push({
        name: item.chapterName,
        releaseTime: new Date(item.releaseTime).toISOString(),
        path: item.chapterUrl,
        chapterNumber: item.chapterNumber,
      });
    });
    return chapter;
  }
  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const numPage = parseInt(page, 10);
    const pageCorrected = numPage - 1;
    const pagePath = novelPath;
    const firstUrl = this.site + pagePath;
    const pageUrl = firstUrl + '?activeTab=chapters&page=' + pageCorrected;
    const body = await fetchApi(pageUrl).then(r => r.text());
    const loadedCheerio = parseHTML(body);
    const dataJson: {
      pages_count: string;
      chapters: ChapterEntry[];
    } = { pages_count: '', chapters: [] };
    const chaptersinfo: {
      chapterName: string;
      chapterUrl: string;
      releaseTime: string;
      chapterNumber: string | number;
    }[] = [];
    loadedCheerio('ul.chaptersList a').each((i, el) => {
      const chapterName: string = loadedCheerio(el).attr('title') ?? '';
      const chapterUrl = loadedCheerio(el)
        .attr('href')
        ?.trim()
        .replace(/^\/*/, '');
      const dateAttr = loadedCheerio(el)
        .find('time.chapter-update')
        .attr('datetime');
      const date = new Date(dateAttr);
      const releaseTime = date.toISOString();
      const chapternumber = loadedCheerio(el)
        .find('strong.chapter-title')
        .text()
        .replace(/[^\d٠-٩]/g, '');
      const chapterNumber = parseInt(chapternumber, 10);
      chaptersinfo.push({
        chapterName: chapterName,
        chapterUrl: chapterUrl || '',
        releaseTime: releaseTime || '',
        chapterNumber: chapterNumber || '',
      });
    });
    const pagecount = loadedCheerio('ul.pagination a.active').text();
    dataJson.pages_count = pagecount;

    dataJson.chapters = chaptersinfo;
    const chapters = this.parseChapters(dataJson);
    return {
      chapters,
    };
  }
  async parseChapter(chapterUrl: string): Promise<string> {
    const result = await fetchApi(new URL(chapterUrl, this.site).toString());
    const body = await result.text();
    const loadedCheerio = parseHTML(body);
    let chapterText = '';
    loadedCheerio('div.chapter-content').each((idx, ele) => {
      loadedCheerio(ele)
        .find('p')
        .not('.d-none')
        .each((idx, textEle) => {
          chapterText +=
            loadedCheerio(textEle)
              .map((_, pEle) => loadedCheerio(pEle).text().trim())
              .get()
              .join(' ') + ' ';
        });
    });
    chapterText = chapterText.trim();
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const searchUrl = `${this.site}search?page=${page}&title=${searchTerm}`;

    const result = await fetchApi(searchUrl);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  filters = {
    categories: {
      value: [],
      label: 'التصنيفات',
      options: [
        { label: 'Wuxia', value: 'Wuxia' },
        { label: 'Xianxia', value: 'Xianxia' },
        { label: 'XUANHUAN', value: 'XUANHUAN' },
        { label: 'أصلية', value: 'أصلية' }, // Original
        { label: 'أكشن', value: 'أكشن' }, // Action
        { label: 'إثارة', value: 'إثارة' }, // Thriller
        { label: 'إنتقال الى عالم أخر', value: 'إنتقال+الى+عالم+أخر' }, // Isekai
        { label: 'إيتشي', value: 'إيتشي' }, // Ecchi
        { label: 'الخيال العلمي', value: 'الخيال+العلمي' }, // Science Fiction
        { label: 'بوليسي', value: 'بوليسي' }, // Detective
        { label: 'تاريخي', value: 'تاريخي' }, // Historical
        { label: 'تقمص شخصيات', value: 'تقمص+شخصيات' }, // Roleplaying
        { label: 'جريمة', value: 'جريمة' }, // Crime
        { label: 'جوسى', value: 'جوسى' }, // Josei
        { label: 'حريم', value: 'حريم' }, // Harem
        { label: 'حياة مدرسية', value: 'حياة+مدرسية' }, // School Life
        { label: 'خارقة للطبيعة', value: 'خارقة+للطبيعة' }, // Supernatural
        { label: 'خيالي', value: 'خيالي' }, // Fantasy
        { label: 'دراما', value: 'دراما' }, // Drama
        { label: 'رعب', value: 'رعب' }, // Horror
        { label: 'رومانسي', value: 'رومانسي' }, // Romance
        { label: 'سحر', value: 'سحر' }, // Magic
        { label: 'سينن', value: 'سينن' }, // Seinen
        { label: 'شريحة من الحياة', value: 'شريحة+من+الحياة' }, // Slice of Life
        { label: 'شونين', value: 'شونين' }, // Shounen
        { label: 'غموض', value: 'غموض' }, // Mystery
        { label: 'فنون القتال', value: 'فنون+القتال' }, // Martial Arts
        { label: 'قوى خارقة', value: 'قوى+خارقة' }, // Super Powers
        { label: 'كوميدى', value: 'كوميدى' }, // Comedy
        { label: 'مأساوي', value: 'مأساوي' }, // Tragedy
        { label: 'ما بعد الكارثة', value: 'ما+بعد+الكارثة' }, // Post-Apocalypse
        { label: 'مغامرة', value: 'مغامرة' }, // Adventure
        { label: 'ميكا', value: 'ميكا' }, // Mecha
        { label: 'ناضج', value: 'ناضج' }, // Mature
        { label: 'نفسي', value: 'نفسي' }, // Psychological
        { label: 'فانتازيا', value: 'فانتازيا' }, // Fantasy
        { label: 'رياضة', value: 'رياضة' }, // Sports
        { label: 'ابراج', value: 'ابراج' }, // Astrology
        { label: 'الالهة', value: 'الالهة' }, // Deities
        { label: 'شياطين', value: 'شياطين' }, // Demons
        { label: 'السفر عبر الزمن', value: 'السفر+عبر+الزمن' }, // Time Travel
        { label: 'رواية صينية', value: 'رواية+صينية' }, // Chinese Novel
        { label: 'رواية ويب', value: 'رواية+ويب' }, // Web Novel
        { label: 'لايت نوفل', value: 'لايت+نوفل' }, // Light Novel
        { label: 'كوري', value: 'كوري' }, // Korean
        { label: '+18', value: '%2B18' }, // +18
        { label: 'إيسكاي', value: 'إيسكاي' }, // Isekai
        { label: 'ياباني', value: 'ياباني' }, // Japanese
        { label: 'مؤلفة', value: 'مؤلفة' }, // Authored
      ],
      type: FilterTypes.CheckboxGroup,
    },
    status: {
      value: '',
      label: 'الحالة',
      options: [
        { label: 'جميع الروايات', value: '' },
        { label: 'مكتمل', value: 'Completed' },
        { label: 'جديد', value: 'New' },
        { label: 'مستمر', value: 'Ongoing' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new Sunovels();

type ChapterEntry = {
  chapterName: string;
  chapterUrl: string;
  releaseTime: string;
  chapterNumber: string | number;
};
