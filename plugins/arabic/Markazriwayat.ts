import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type TheamChapter = {
  label: string;
  url: string;
  num: string;
  time: string;
  date: string;
  views: number;
  comments: number;
  early: boolean;
  ts: number;
};

type TheamChaptersResponse = {
  items: TheamChapter[];
  has_more: boolean;
};

class Markazriwayat implements Plugin.PluginBase {
  id = 'markazriwayat';
  name = 'مركز الروايات';
  version = '1.2.0';
  icon = 'src/ar/markazriwayat/icon.png';
  site = 'https://markazriwayat.com/';
  private restUrl = 'https://markazriwayat.com/wp-json/theam/v1';

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetchApi(url);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async fetchCheerio(url: string) {
    const res = await fetchApi(url);
    return parseHTML(await res.text());
  }

  parseNovels($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    $('a.lib-card, a.novel-card').each((_, el) => {
      const $el = $(el);
      const name = $el.find('.lib-card__title, .novel-card__title').text().trim();
      const href = $el.attr('href') || '';
      const img = $el.find('img');
      const cover =
        img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src') || defaultCover;
      if (name && href) {
        novels.push({
          name,
          path: href.replace(this.site, ''),
          cover,
        });
      }
    });
    return novels;
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site;
    if (showLatestNovels) {
      url += 'new/';
    } else if (filters) {
      const range = filters.sortOptions?.value || 'week';
      url += `popular/?range=${range}&page=${page}`;
    } else {
      url += `popular/?range=week&page=${page}`;
    }
    const $ = await this.fetchCheerio(url);
    return this.parseNovels($);
  }

  async parseNovel(novelUrl: string): Promise<Plugin.SourceNovel> {
    const url = new URL(novelUrl, this.site).toString();
    const $ = await this.fetchCheerio(url);

    const novel: Plugin.SourceNovel = {
      path: novelUrl,
      name: $('h1').first().text().trim() || 'Untitled',
      cover:
        $('img').first().attr('data-src') ||
        $('img').first().attr('data-lazy-src') ||
        $('img').first().attr('src') ||
        defaultCover,
      chapters: [],
    };

    const statusEl = $('span.status-pill');
    if (statusEl.length) {
      const statusText = statusEl.text().trim();
      if (statusText.includes('مكتملة')) novel.status = NovelStatus.Completed;
      else if (statusText.includes('مستمرة')) novel.status = NovelStatus.Ongoing;
      else if (statusText.includes('متوقفة')) novel.status = NovelStatus.OnHiatus;
    }

    const authorEl = $('span:contains("مترجم"), span:contains("المؤلف")');
    if (authorEl.length) {
      novel.author = authorEl.text().replace(/.*:/, '').trim();
    }

    const summaryEl = $('div.summary, .entry-content, .manga-excerpt, p:contains("القصة")');
    if (summaryEl.length) {
      novel.summary = summaryEl.text().trim();
    }

    const genres: string[] = [];
    $('a[href*="genre"], .genres-content a, .wp-manga-genre a').each((_, el) => {
      const genre = $(el).text().trim();
      if (genre) genres.push(genre);
    });
    if (genres.length) novel.genres = genres.join(', ');

    // Get manga_id from page
    const mangaId =
      $('#manga-chapters-list').attr('data-manga-id') ||
      $('[data-manga-id]').first().attr('data-manga-id') ||
      '';

    // Load ALL chapters via theam REST API
    const chapters: Plugin.ChapterItem[] = [];

    if (mangaId) {
      let pg = 1;
      let hasMore = true;

      while (hasMore) {
        try {
          const apiUrl = `${this.restUrl}/manga-chapters?manga_id=${mangaId}&order=ASC&page=${pg}&per_page=100`;
          const data = await this.fetchJson<TheamChaptersResponse>(apiUrl);

          if (data.items && data.items.length > 0) {
            for (const item of data.items) {
              const chapterPath = item.url.replace(this.site, '');
              if (chapterPath) {
                chapters.push({
                  name: item.label || `الفصل ${item.num}`,
                  path: chapterPath,
                  releaseTime: item.date || item.time || null,
                  chapterNumber: parseInt(item.num, 10) || chapters.length + 1,
                });
              }
            }
            hasMore = !!data.has_more && data.items.length === 100;
            pg++;
          } else {
            hasMore = false;
          }
        } catch {
          hasMore = false;
        }
      }
    }

    // Fallback: parse chapters from initial HTML
    if (chapters.length === 0) {
      $('div.ch-row').each((i, el) => {
        const a = $(el).find('a');
        const name = $(el).find('.ch-title').text().trim() || a.text().trim();
        const href = a.attr('href') || '';
        const date = $(el).find('.ch-date').text().trim();
        if (name && href) {
          chapters.push({
            name,
            path: href.replace(this.site, ''),
            releaseTime: date || null,
            chapterNumber: chapters.length + 1,
          });
        }
      });
    }

    novel.chapters = chapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));

    return novel;
  }

  async parseChapter(chapterUrl: string): Promise<string> {
    const url = new URL(chapterUrl, this.site).toString();
    const $ = await this.fetchCheerio(url);
    const content =
      $('.reading-content, .text-left, .entry-content, .chapter-content').html() || '';
    return content || '<p>المحتوى غير متاح.</p>';
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}page/${page}/?s=${encodeURIComponent(searchTerm)}&post_type=novel,wp-manga`;
    const $ = await this.fetchCheerio(url);
    return this.parseNovels($);
  }

  filters = {
    sortOptions: {
      value: 'week',
      label: 'الترتيب حسب',
      options: [
        { label: 'الأسبوع', value: 'week' },
        { label: 'اليوم', value: 'day' },
        { label: 'الشهر', value: 'month' },
        { label: 'كل الوقت', value: 'all' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new Markazriwayat();
