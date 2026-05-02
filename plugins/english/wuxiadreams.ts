import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class WuxiaDreams implements Plugin.PluginBase {
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

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = `${this.site}novel/${novelPath}`;
    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
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
      summary: loadedCheerio('h3:contains("Synopsis")').next().text().trim(),
      status: NovelStatus.Unknown,
    };

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

    // Chapters
    const chapters: Plugin.ChapterItem[] = [];

    // Handle pagination
    let totalPages = 1;

    const pageInfo = loadedCheerio('div:contains("Page")').text();
    const match = pageInfo.match(/Page\s+\d+\s+of\s+(\d+)/i);
    if (match) {
      totalPages = parseInt(match[1]);
    }

    for (let p = 1; p <= totalPages; p++) {
      let pageCheerio = loadedCheerio;
      if (p > 1) {
        const pageUrl = `${url}?page=${p}`;
        const pageBody = await fetchApi(pageUrl).then(r => r.text());
        pageCheerio = parseHTML(pageBody);
      }

      pageCheerio('a[href^="/novel/' + novelPath + '/chapter-"]').each(
        (i, ele) => {
          const chapterName = pageCheerio(ele)
            .find('span')
            .first()
            .text()
            .trim();
          const chapterUrl = pageCheerio(ele).attr('href');
          const releaseDate = pageCheerio(ele)
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
    }

    novel.chapters = chapters;
    return novel;
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
