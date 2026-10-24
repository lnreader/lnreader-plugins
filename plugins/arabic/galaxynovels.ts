
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

class GalaxyNovels implements Plugin.PluginBase {
  id = 'galaxynovels';
  name = 'Galaxy Novels';
  version = '1.1.2';
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
      const href = $el.find('a.wor-novel-card__cover').attr('href');
      const img = $el.find('img.wor-cover-img');
      const cover = img.attr('data-src') || img.attr('src') || undefined;
      const title = $el.find('h3 a').text().trim();

      if (!href || !title) return;

      novels.push({
        name: title,
        path: new URL(href, this.site).pathname,
        cover,
      });
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = new URL(novelPath, this.site).toString();
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
      مستمرة: NovelStatus.Ongoing,
      مكتملة: NovelStatus.Completed,
      متوقفة: NovelStatus.OnHiatus,
    };

    const status = statusMap[statusText] || NovelStatus.Unknown;
    const chaptersContainer = $('[data-wor-chapters-container]');
    const chaptersIndexUrl = chaptersContainer.attr('data-index-url');

    let chapters: Plugin.ChapterItem[] = [];

    if (chaptersIndexUrl) {
      try {
        const indexUrl = new URL(chaptersIndexUrl, this.site).toString();
        const index = await this.fetchJson<ChaptersIndex>(indexUrl);

        if (Array.isArray(index.chapters)) {
          chapters = index.chapters
            .filter(ch => ch.url || ch.content_api || ch.id)
            .map(ch => {
              const chapterUrl = new URL(
                ch.url || `chapter-${ch.id}/`,
                url,
              );

              return {
                name: ch.label + (ch.title ? `: ${ch.title}` : ''),
                path: chapterUrl.pathname + chapterUrl.search,
                chapterNumber: ch.position,
                releaseTime: ch.date_iso?.split('T')[0] || '',
              };
            });
        }
      } catch {
        // Use the chapter links available in the page.
      }
    }

    if (chapters.length === 0) {
      $('article.wor-novel-chapter-item').each((_, el) => {
        const $el = $(el);
        const href =
          $el.find('h3 a').attr('href') ||
          $el.find('a.wor-novel-chapter-item__num').attr('href');

        const name =
          $el.find('h3 a').text().trim() ||
          $el.find('a.wor-novel-chapter-item__num').text().trim();

        const releaseTime =
          $el.find('time').attr('datetime')?.split('T')[0] || '';

        if (!href) return;

        const chapterUrl = new URL(href, url);
        const match = chapterUrl.pathname.match(/chapter-(\d+)/i);

        chapters.push({
          name,
          path: chapterUrl.pathname + chapterUrl.search,
          chapterNumber: match ? Number(match[1]) : 0,
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
    const chapterUrl = new URL(chapterPath, this.site);
    const chapterMatch = chapterUrl.pathname.match(/chapter-(\d+)/i);
    const chapterId = chapterMatch?.[1];

    // Find the chapter's actual content_api in the novel's chapter index.
    const novelPath = chapterUrl.pathname.replace(
      /\/chapter-\d+\/.*$/i,
      '/',
    );

    if (chapterId && novelPath !== chapterUrl.pathname) {
      try {
        const novelHtml = await this.fetchHtml(
          new URL(novelPath, this.site).toString(),
        );
        const $novel = loadCheerio(novelHtml);
        const indexPath = $novel
          .find('[data-wor-chapters-container]')
          .attr('data-index-url');

        if (indexPath) {
          const indexUrl = new URL(indexPath, this.site).toString();
          const index = await this.fetchJson<ChaptersIndex>(indexUrl);

          const current = index.chapters?.find(ch => {
            if (String(ch.id) === chapterId) return true;
            if (!ch.url) return false;

            const indexedUrl = new URL(ch.url, this.site);
            return indexedUrl.pathname === chapterUrl.pathname;
          });

          if (current?.content_api) {
            const contentUrl = new URL(
              current.content_api,
              this.site,
            ).toString();

            const response = await fetchApi(contentUrl);

            if (response.ok) {
              const raw = await response.text();

              try {
                const data = JSON.parse(raw);
                const content =
                  data?.data?.content_html ??
                  data?.content_html ??
                  data?.data?.content ??
                  data?.content;

                if (typeof content === 'string' && content.trim()) {
                  return content;
                }
              } catch {
                if (raw.trim()) {
                  const $content = loadCheerio(raw);
                  const extracted = $content(
                    'article.wor-chapter-content, .wor-chapter-text, .entry-content',
                  ).html();

                  return extracted || raw;
                }
              }
            }
          }
        }
      } catch {
        // Fall back to the public chapter page.
      }
    }

    // Fallback: load the chapter page using its complete URL.
    const html = await this.fetchHtml(chapterUrl.toString());
    const $ = loadCheerio(html);

    const content = $(
      'article.wor-chapter-content, .wor-chapter-text, .entry-content',
    ).html();

    if (content) return content;

    throw new Error('Chapter content was not found on the page.');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const manifestUrl =
      `${this.baseUrl}/wp-content/uploads/wor-reader-cache/search/manifest.json`;

    const manifest = await this.fetchJson<{ index: string }>(manifestUrl);
    const indexUrl = new URL(manifest.index, this.site).toString();

    const searchIndex = await this.fetchJson<{
      items: {
        t: string;
        u: string;
        c: string;
        s: string;
      }[];
    }>(indexUrl);

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
      cover: new URL(novel.c, this.site).toString(),
    }));
  }
}

export default new GalaxyNovels();
