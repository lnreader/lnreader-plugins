import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class WuxiaDreams implements Plugin.PagePlugin {
  id = 'wuxiadreams';
  name = 'Wuxia Dreams';
  version = '1.0.0';
  icon = 'src/en/wuxiadreams/icon.png';
  site = 'https://wuxiadreams.com/';

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${this.site}novels?page=${page}`;

    if (filters?.ranking?.value) {
      url = `${this.site}ranking/${filters.ranking.value}?page=${page}`;
    } else if (filters?.tag?.value) {
      url = `${this.site}tag/${filters.tag.value}?page=${page}`;
    }

    if (filters?.status?.value) {
      url += `&status=${filters.status.value}`;
    }

    if (filters?.sort?.value) {
      url += `&sort=${filters.sort.value}`;
    } else if (showLatestNovels) {
      url += `&sort=update`;
    }

    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    return this.parseNovels(loadedCheerio);
  }

  parseNovels(loadedCheerio: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('a[href^="/novel/"]').each((i, ele) => {
      const novelName = loadedCheerio(ele).find('h3').text().trim();
      const novelCover = loadedCheerio(ele).find('img').attr('src');
      const novelUrl = loadedCheerio(ele).attr('href');

      if (novelName && novelUrl) {
        const path = novelUrl.replace('/novel/', '');
        if (!novels.find(n => n.path === path)) {
          novels.push({
            name: novelName,
            cover: novelCover || defaultCover,
            path: path,
          });
        }
      }
    });

    return novels;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const url = `${this.site}novel/${novelPath}`;
    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name:
        loadedCheerio('h1').text().trim() ||
        loadedCheerio('title')
          .text()
          .replace(' (novel)', '')
          .split(' - ')[0]
          .trim(),
      cover:
        loadedCheerio('meta[property="og:image"]').attr('content') ||
        defaultCover,
      summary: '',
      status: NovelStatus.Unknown,
      totalPages: 1,
      chapters: [],
    };

    // Try to get summary from JSON-LD first (cleanest)
    const jsonLD = loadedCheerio('script[type="application/ld+json"]').html();
    if (jsonLD) {
      try {
        const data = JSON.parse(jsonLD);
        novel.summary = data.description;
      } catch (e) {
        // Fallback to HTML parsing if JSON is invalid
      }
    }

    if (!novel.summary) {
      novel.summary = loadedCheerio('h3:contains("Synopsis")')
        .next()
        .html()
        ?.replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n /g, '\n')
        .replace(/ \n/g, '\n')
        .replace(/\n\n+/g, '\n\n')
        .trim();
    }

    // Author
    novel.author = loadedCheerio('span:contains("Author:")')
      .next('a')
      .find('span')
      .first()
      .text()
      .trim();

    // Genres & Tags
    const genres: string[] = [];
    loadedCheerio('div:contains("Genres")')
      .next()
      .find('a[href^="/genre/"]')
      .each((i, ele) => {
        genres.push(loadedCheerio(ele).text().trim());
      });

    loadedCheerio('div:contains("Tags")')
      .next()
      .find('a[href^="/tag/"]')
      .each((i, ele) => {
        genres.push(loadedCheerio(ele).text().trim());
      });
    novel.genres = Array.from(new Set(genres)).join(', ');

    // Status
    const statusLabel = loadedCheerio('span:contains("Status")')
      .next()
      .text()
      .trim()
      .toLowerCase();

    novel.status = statusLabel.includes('completed')
      ? NovelStatus.Completed
      : statusLabel.includes('ongoing')
        ? NovelStatus.Ongoing
        : NovelStatus.Unknown;

    // Handle pagination
    const pageInfo = loadedCheerio('div:contains("Page")').text();
    const match = pageInfo.match(/Page\s+\d+\s+of\s+(\d+)/i);
    if (match) {
      novel.totalPages = parseInt(match[1]);
    }

    novel.chapters = this.parseChapters(loadedCheerio, novelPath);

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const url = `${this.site}novel/${novelPath}?page=${page}`;
    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    return {
      chapters: this.parseChapters(loadedCheerio, novelPath),
    };
  }

  parseChapters(loadedCheerio: CheerioAPI, novelPath: string) {
    const chapters: Plugin.ChapterItem[] = [];

    loadedCheerio('a[href^="/novel/' + novelPath + '/chapter-"]').each(
      (i, ele) => {
        const chapterName = loadedCheerio(ele)
          .find('span')
          .first()
          .text()
          .trim();
        const chapterUrl = loadedCheerio(ele).attr('href');
        const releaseDate = loadedCheerio(ele)
          .find('div > span:first-child')
          .text()
          .trim();

        if (chapterName && chapterUrl) {
          chapters.push({
            name: chapterName,
            path: chapterUrl.substring(1), // remove leading slash
            releaseTime: releaseDate,
          });
        }
      },
    );

    return chapters;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.site}${chapterPath}`;
    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    // Remove ads or unwanted elements if necessary
    loadedCheerio('script').remove();
    loadedCheerio('style').remove();

    const chapterContent =
      loadedCheerio('article.chapter-content-container').html() || '';
    return chapterContent;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}novels?q=${encodeURIComponent(searchTerm)}&page=${page}`;
    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    return this.parseNovels(loadedCheerio);
  }

  filters = {
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort By',
      value: 'update',
      options: [
        { label: 'Latest Update', value: 'update' },
        { label: 'Highest Rated', value: 'score' },
        { label: 'Most Viewed', value: 'views' },
        { label: 'Trending', value: 'trending' },
      ],
    },
    ranking: {
      type: FilterTypes.Picker,
      label: 'Ranking',
      value: '',
      options: [
        { label: 'None', value: '' },
        { label: 'Editor Pick', value: 'editor_pick' },
        { label: 'Most Viewed', value: 'view' },
        { label: 'Most Rated', value: 'score' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
      ],
    },
    tag: {
      type: FilterTypes.Picker,
      label: 'Tag',
      value: '',
      options: [
        { label: 'None', value: '' },
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Beautiful Female Lead', value: 'beautiful-female-lead' },
        { label: 'Calm Protagonist', value: 'calm-protagonist' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Cultivation', value: 'cultivation' },
        { label: 'Drama', value: 'drama' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Handsome Male Lead', value: 'handsome-male-lead' },
        { label: 'Harem', value: 'harem' },
        { label: 'Male Protagonist', value: 'male-protagonist' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Romance', value: 'romance' },
        { label: 'Science Fiction', value: 'science-fiction' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Weak to Strong', value: 'weak-to-strong' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
      ],
    },
  } satisfies Filters;
}

export default new WuxiaDreams();
