import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';

class WuxiaDreams implements Plugin.PagePlugin {
  id = 'wuxiadreams';
  name = 'Wuxia Dreams';
  icon = 'src/en/wuxiadreams/icon.png';
  site = 'https://wuxiadreams.com/';
  version = '1.0.0';

  parseNovels(loadedCheerio: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('div.grid > a[href^="/novel/"]').each((idx, ele) => {
      const name = loadedCheerio(ele).find('h3').text().trim();
      const cover = loadedCheerio(ele).find('img').attr('src');
      const url = loadedCheerio(ele).attr('href');

      if (name && url) {
        novels.push({
          name,
          cover: cover?.startsWith('http')
            ? cover
            : cover
              ? this.site + cover.replace(/^\//, '')
              : undefined,
          path: url.replace(/^\//, ''),
        });
      }
    });

    return novels;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${this.site}novels?page=${pageNo}`;

    if (filters.sort?.value) {
      url += `&sort=${filters.sort.value}`;
    }

    const response = await fetchApi(url);
    const body = await response.text();
    const $ = parseHTML(body);

    return this.parseNovels($);
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const response = await fetchApi(`${this.site}${novelPath}`);
    const body = await response.text();
    const $ = parseHTML(body);

    const cover = $('main img').first().attr('src');
    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: $('h1').text().trim() || 'Untitled',
      cover: cover?.startsWith('http')
        ? cover
        : cover
          ? this.site + cover.replace(/^\//, '')
          : undefined,
      summary: '',
      chapters: [],
      totalPages: 1,
    };

    // Summary
    const summaryElement = $('h3:contains("Synopsis")').next();
    summaryElement.find('br').replaceWith('\n');
    novel.summary = summaryElement
      .text()
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .trim();

    // Author
    const authorLink = $('a[href^="/author/"]');
    if (authorLink.length) {
      novel.author = authorLink.text().trim();
    } else {
      novel.author = $('span:contains("Author:")').next().text().trim();
    }

    if (!novel.author) {
      novel.author = $('div:contains("Author")').next().text().trim();
    }

    // Status
    const statusText = $('span:contains("completed"), span:contains("ongoing")')
      .first()
      .text()
      .toLowerCase();

    if (statusText.includes('completed')) {
      novel.status = NovelStatus.Completed;
    } else if (statusText.includes('ongoing')) {
      novel.status = NovelStatus.Ongoing;
    } else {
      novel.status = NovelStatus.Unknown;
    }

    // Tags as Genres
    const tags: string[] = [];
    $('div:contains("Tags")')
      .next()
      .find('a[href^="/tag/"]')
      .each((i, e) => {
        tags.push($(e).text().trim());
      });
    novel.genres = tags.join(',');

    // Chapters
    novel.chapters = this.parseChapters($);

    // Pagination
    const lastPageLink = $('a[aria-label="Last page"]').attr('href');
    if (lastPageLink) {
      const match = lastPageLink.match(/page=(\d+)/);
      if (match) {
        novel.totalPages = parseInt(match[1], 10);
      }
    } else {
      const pageText = $('div:contains("Page")').text();
      const match = pageText.match(/Page\s+\d+\s+of\s+(\d+)/);
      if (match) {
        novel.totalPages = parseInt(match[1], 10);
      }
    }

    return novel;
  }

  parseChapters($: CheerioAPI): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];

    $('a[href*="/chapter-"]').each((i, e) => {
      const href = $(e).attr('href');
      if (href?.includes('/chapter-index-drawer')) return;

      const name =
        $(e).find('span').first().text().trim() || $(e).text().trim();

      if (name.toLowerCase().includes('start reading')) return;

      const path = href?.replace(/^\//, '');
      const releaseTime = $(e)
        .find('span:contains("202")')
        .first()
        .text()
        .trim();

      if (name && path) {
        chapters.push({
          name,
          path,
          releaseTime,
        });
      }
    });

    return chapters;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const response = await fetchApi(`${this.site}${novelPath}?page=${page}`);
    const body = await response.text();
    const $ = parseHTML(body);

    return {
      chapters: this.parseChapters($),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const response = await fetchApi(`${this.site}${chapterPath}`);
    const body = await response.text();
    const $ = parseHTML(body);

    const content = $('article.chapter-content-container').html();
    return content || 'Content not found.';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}novels?q=${encodeURIComponent(searchTerm)}&page=${pageNo}`;

    const response = await fetchApi(url);
    const body = await response.text();
    const $ = parseHTML(body);

    return this.parseNovels($);
  }

  filters = {
    sort: {
      label: 'Sort by',
      value: 'update',
      options: [
        { label: 'Latest Update', value: 'update' },
        { label: 'Highest Rated', value: 'score' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new WuxiaDreams();
