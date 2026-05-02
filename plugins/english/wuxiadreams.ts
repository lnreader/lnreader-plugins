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
    let url = this.site;

    if (showLatestNovels) {
      if (page > 1) {
        url = `${this.site}novels?page=${page}`;
      } else {
        url = this.site;
      }
    } else if (filters?.genre?.value) {
      url = `${this.site}genre/${filters.genre.value}?page=${page}`;
    } else {
      if (page > 1) {
        url = `${this.site}novels?page=${page}`;
      } else {
        url = this.site;
      }
    }

    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    if (url === this.site) {
      const sectionTitle = showLatestNovels ? 'Latest updates' : 'Most Viewed';
      loadedCheerio('section').each((i, section) => {
        const title = loadedCheerio(section).find('h2').text().trim();
        if (title.includes(sectionTitle)) {
          loadedCheerio(section)
            .find('a[href^="/novel/"]')
            .each((j, ele) => {
              const novelName = loadedCheerio(ele).find('h3').text().trim();
              const novelCover = loadedCheerio(ele).find('img').attr('src');
              const novelUrl = loadedCheerio(ele).attr('href');

              if (novelName && novelUrl) {
                novels.push({
                  name: novelName,
                  cover: novelCover || defaultCover,
                  path: novelUrl.replace('/novel/', ''),
                });
              }
            });
        }
      });
    } else {
      loadedCheerio('a[href^="/novel/"]').each((i, ele) => {
        const novelName = loadedCheerio(ele).find('h3').text().trim();
        const novelCover = loadedCheerio(ele).find('img').attr('src');
        const novelUrl = loadedCheerio(ele).attr('href');

        if (novelName && novelUrl) {
          // Avoid duplicates if same novel is linked multiple times
          if (!novels.find(n => n.path === novelUrl.replace('/novel/', ''))) {
            novels.push({
              name: novelName,
              cover: novelCover || defaultCover,
              path: novelUrl.replace('/novel/', ''),
            });
          }
        }
      });
    }

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

    // Genres
    const genres: string[] = [];
    loadedCheerio('div:contains("Genres")')
      .parent()
      .find('a[href^="/genre/"]')
      .each((i, ele) => {
        genres.push(loadedCheerio(ele).text().trim());
      });
    novel.genres = genres.join(', ');

    // Status
    const statusLabel = loadedCheerio('span:contains("Status")')
      .next()
      .text()
      .trim();
    if (statusLabel.toLowerCase().includes('completed')) {
      novel.status = NovelStatus.Completed;
    } else if (statusLabel.toLowerCase().includes('ongoing')) {
      novel.status = NovelStatus.Ongoing;
    }

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

    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('a[href^="/novel/"]').each((i, ele) => {
      const novelName = loadedCheerio(ele).find('h3').text().trim();
      const novelCover = loadedCheerio(ele).find('img').attr('src');
      const novelUrl = loadedCheerio(ele).attr('href');

      if (novelName && novelUrl) {
        if (!novels.find(n => n.path === novelUrl.replace('/novel/', ''))) {
          novels.push({
            name: novelName,
            cover: novelCover || defaultCover,
            path: novelUrl.replace('/novel/', ''),
          });
        }
      }
    });

    return novels;
  }

  filters = {
    genre: {
      type: FilterTypes.Picker,
      label: 'Genre',
      value: '',
      options: [
        { label: 'None', value: '' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Historical', value: 'historical' },
        { label: 'Romance', value: 'romance' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Action', value: 'action' },
      ],
    },
  } satisfies Filters;
}

export default new WuxiaDreams();
