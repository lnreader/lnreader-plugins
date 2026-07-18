import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';

type ChapterJSON = {
  id: number;
  position: number;
  number: string;
  label: string;
  title: string;
  url: string;
  content_api: string;
  date_iso: string;
};

type ChaptersIndex = {
  novel_id: number;
  total: number;
  chapters: ChapterJSON[];
};

type ChapterContentResponse = {
  schema: number;
  data: {
    content_html: string;
    display_title: string;
    navigation: { next_url: string; previous_url: string };
  };
};

class GalaxyNovels implements Plugin.PluginBase {
  id = 'galaxynovels';
  name = 'Galaxy Novels';
  version = '1.1.0';
  icon = 'src/ar/galaxynovels/icon.png';
  site = 'https://galaxynovels.com/';

  filters = {
    sort: {
      label: 'Sort By',
      value: 'popular',
      options: [
        { label: 'Most Popular', value: 'popular' },
        { label: 'Newest', value: 'new' },
        { label: 'Recently Updated', value: 'recent' },
      ],
      type: FilterTypes.Picker,
    },
    period: {
      label: 'Period',
      value: 'month',
      options: [
        { label: 'Month', value: 'month' },
        { label: 'Week', value: 'week' },
        { label: 'All Time', value: 'all' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private baseUrl = 'https://galaxynovels.com';

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Could not reach site (${res.status})`);
    }
    return res.text();
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Could not reach site (${res.status})`);
    }
    return res.json() as Promise<T>;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels ? 'new' : filters.sort.value;
    const period = filters.period.value;

    let url: string;
    if (sort === 'new') {
      url = `${this.baseUrl}/novels/?sort=new&page=${pageNo}`;
    } else if (sort === 'recent') {
      url = `${this.baseUrl}/recent/?page=${pageNo}`;
    } else {
      url = `${this.baseUrl}/novels/?sort=popular&period=${period}&page=${pageNo}`;
    }

    const html = await this.fetchHtml(url);
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];
    $('article.wor-novel-card').each((_, el) => {
      const $el = $(el);
      const coverLink = $el.find('a.wor-novel-card__cover');
      const href = coverLink.attr('href');
      const img = $el.find('img.wor-cover-img');
      const cover =
        img.attr('data-src') || img.attr('src') || undefined;
      const title = $el.find('h3 a').text().trim();

      if (!href || !title) return;

      const path = new URL(href, this.site).pathname;

      novels.push({
        name: title,
        path,
        cover,
      });
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = `${this.baseUrl}${novelPath}`;
    const html = await this.fetchHtml(url);
    const $ = loadCheerio(html);

    const title = $('h1').first().text().trim();
    const img = $('img.wor-cover-img').first();
    const cover = img.attr('data-src') || img.attr('src');
    const author = $('p.wor-single-hero__meta-text span').text().trim();
    const summary = $('.wor-single-summary__text').text().trim();

    const genres: string[] = [];
    $('a.wor-tag-pill').each((_, el) => {
      genres.push($(el).text().trim());
    });

    const statusText = $('span.wor-cover-status').text().trim();
    const statusMap: Record<string, string> = {
      'مستمرة': NovelStatus.Ongoing,
      'مكتملة': NovelStatus.Completed,
      'متوقفة': NovelStatus.OnHiatus,
    };
    const status = statusMap[statusText] || NovelStatus.Unknown;

    const chaptersContainer = $('[data-wor-chapters-container]');
    const chaptersIndexUrl = chaptersContainer.attr('data-index-url');

    let chapters: Plugin.ChapterItem[] = [];

    if (chaptersIndexUrl) {
      try {
        const indexUrl = chaptersIndexUrl.startsWith('http')
          ? chaptersIndexUrl
          : `${this.baseUrl}${chaptersIndexUrl}`;
        const index = await this.fetchJson<ChaptersIndex>(indexUrl);

        chapters = index.chapters.map(ch => ({
          name: ch.label + (ch.title ? `: ${ch.title}` : ''),
          path: `${novelPath}chapter-${ch.id}/`,
          chapterNumber: ch.position,
          releaseTime: ch.date_iso?.split('T')[0] || '',
        }));
      } catch {
        // fallback to HTML parsing
      }
    }

    if (chapters.length === 0) {
      $('article.wor-novel-chapter-item').each((_, el) => {
        const $el = $(el);
        const chapterLink = $el.find('h3 a').attr('href') || $el.find('a.wor-novel-chapter-item__num').attr('href');
        const chapterName = $el.find('h3 a').text().trim() || $el.find('a.wor-novel-chapter-item__num').text().trim();
        const chapterId = $el.attr('data-chapter-id');
        const timeEl = $el.find('time');
        const releaseTime = timeEl.attr('datetime')?.split('T')[0] || '';

        if (!chapterLink) return;

        const path = chapterId
          ? `${novelPath}chapter-${chapterId}/`
          : new URL(chapterLink, this.site).pathname;
        const numMatch = path.match(/chapter-(\d+)/);
        const chapterNumber = numMatch ? parseInt(numMatch[1]) : 0;

        chapters.push({
          name: chapterName,
          path,
          chapterNumber,
          releaseTime,
        });
      });
    }

    return {
      path: novelPath,
      name: title,
      cover,
      author: author || 'Unknown',
      genres: genres.join(', '),
      summary,
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const idMatch = chapterPath.match(/chapter-(\d+)/);
    const chapterId = idMatch?.[1];

    if (chapterId) {
      const apiUrl = `${this.baseUrl}/wp-json/wor-reader-app/v1/chapters/${chapterId}`;
      try {
        const response = await this.fetchJson<ChapterContentResponse>(apiUrl);
        if (response.data?.content_html) {
          return response.data.content_html;
        }
      } catch {
        // fallback to HTML
      }
    }

    const url = `${this.baseUrl}${chapterPath}`;
    const html = await this.fetchHtml(url);
    const $ = loadCheerio(html);
    const content =
      $('article.wor-chapter-content, .wor-chapter-text, .entry-content').html();
    return content || '<p>Content not available.</p>';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const manifestUrl =
      'https://galaxynovels.com/wp-content/uploads/wor-reader-cache/search/manifest.json';
    const manifest = await this.fetchJson<{
      index: string;
    }>(manifestUrl);

    const searchIndex = await this.fetchJson<{
      items: {
        t: string;
        u: string;
        c: string;
        s: string;
      }[];
    }>(manifest.index);

    const term = searchTerm.toLowerCase();
    const filtered = searchIndex.items.filter(
      n =>
        n.t.toLowerCase().includes(term) ||
        n.s.toLowerCase().includes(term),
    );

    const limit = 20;
    const offset = (pageNo - 1) * limit;

    return filtered.slice(offset, offset + limit).map(novel => ({
      name: novel.t,
      path: novel.u,
      cover: novel.c.startsWith('http')
        ? novel.c
        : `${this.baseUrl}${novel.c}`,
    }));
  }
}

export default new GalaxyNovels();
