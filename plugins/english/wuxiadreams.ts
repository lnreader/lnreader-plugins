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
  version = '1.0.1';

  private resolveUrl(path?: string) {
    if (!path) return undefined;
    return path.startsWith('http') ? path : this.site + path.replace(/^\//, '');
  }

  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    if (!r.ok)
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    const $ = parseHTML(await r.text());

    if ($('title').text().includes('Cloudflare')) {
      throw new Error('Cloudflare is blocking requests. Try again later.');
    }

    return $;
  }

  parseNovels(loadedCheerio: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('div.grid > a[href^="/novel/"]').each((idx, ele) => {
      const name = loadedCheerio(ele).find('h3').text().trim();
      const cover = loadedCheerio(ele).find('img').attr('src');
      const url = loadedCheerio(ele).attr('href');

      if (name && url) {
        novels.push({
          name,
          cover: this.resolveUrl(cover),
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

    const $ = await this.getCheerio(url);
    return this.parseNovels($);
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const $ = await this.getCheerio(`${this.site}${novelPath}`);

    const cover = $('main img').first().attr('src');
    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: $('h1').text().trim() || 'Untitled',
      cover: this.resolveUrl(cover),
      summary: '',
      chapters: [],
      totalPages: 1,
    };

    // Summary
    const summaryElement = $('h3:contains("Synopsis")').next();
    summaryElement.find('br').replaceWith('\n');

    // Wrap in <div> to prevent selector parsing errors on plain text
    const summary = $('<div>' + (summaryElement.html() || '') + '</div>');
    novel.summary = summary
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

    const statusMap: Record<string, NovelStatus> = {
      'completed': NovelStatus.Completed,
      'ongoing': NovelStatus.Ongoing,
    };

    novel.status = NovelStatus.Unknown;
    for (const key in statusMap) {
      if (statusText.includes(key)) {
        novel.status = statusMap[key];
        break;
      }
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
    const $ = await this.getCheerio(`${this.site}${novelPath}?page=${page}`);

    return {
      chapters: this.parseChapters($),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(`${this.site}${chapterPath}`);

    const content = $('article.chapter-content-container').html();
    if (!content) {
      throw new Error('Chapter content not found.');
    }
    return content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}novels?q=${encodeURIComponent(searchTerm)}&page=${pageNo}`;

    const $ = await this.getCheerio(url);

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
