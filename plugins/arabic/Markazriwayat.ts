import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@libs/types';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';

class Markazriwayat implements Plugin.PluginBase {
  id = 'markazriwayat';
  name = 'مركز الروايات';
  version = '1.0.0';
  icon = 'src/ar/markazriwayat/icon.png';
  site = 'https://markazriwayat.com/';

  private UA =
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';

  filters: Filters = {
    order: {
      type: FilterTypes.Picker,
      label: 'الترتيب',
      value: '',
      options: [
        { label: 'الأكثر شعبية', value: 'popular' },
        { label: 'الأحدث', value: 'new' },
        { label: 'الأعلى تقييماً', value: 'rating' },
      ],
    },
  };

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url, {
      headers: { 'User-Agent': this.UA },
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.text();
  }

  private parseNovelCards(html: string): Plugin.NovelItem[] {
    const $ = parseHTML(html);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('a.lib-card').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const path = href.replace(this.site, '').replace(/\/$/, '');
      const name = $el.find('.lib-card__title').text().trim();
      const cover =
        $el.find('img').attr('data-src') ||
        $el.find('img').attr('data-defer-src') ||
        defaultCover;

      if (name && path && !seen.has(path)) {
        seen.add(path);
        novels.push({ name, path, cover });
      }
    });

    return novels;
  }

  async popularNovels(
    page: number,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${this.site}`;
    if (showLatestNovels) {
      url += 'new/';
    } else {
      const order = filters?.order?.value || 'popular';
      if (order === 'new') url += 'new/';
      else if (order === 'rating') url += 'ranking/';
      else url += 'popular/';
    }
    if (page > 1) url += `page/${page}/`;

    const html = await this.fetchHtml(url);
    return this.parseNovelCards(html);
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    try {
      const apiUrl = `${this.site}wp-json/theam/v1/novel-search?term=${encodeURIComponent(searchTerm)}&per_page=20`;
      const res = await fetchApi(apiUrl, {
        headers: { 'User-Agent': this.UA },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items || []).map((item: any) => ({
        name: item.title,
        path: item.link.replace(this.site, ''),
        cover: item.cover || defaultCover,
      }));
    } catch {
      // Fallback: use library search HTML
      try {
        const url = `${this.site}library/?search=${encodeURIComponent(searchTerm)}`;
        const html = await this.fetchHtml(url);
        return this.parseNovelCards(html);
      } catch {
        return [];
      }
    }
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await this.fetchHtml(`${this.site}${novelPath}`);
    const $ = parseHTML(html);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').first().text().trim() || 'Untitled',
      cover: defaultCover,
      summary: '',
      author: '',
      status: NovelStatus.Unknown,
      genres: '',
      chapters: [],
    };

    // Cover
    const coverImg = $('img')
      .filter(function () {
        const src = $(this).attr('data-src') || $(this).attr('src') || '';
        return src.includes('wp-content/uploads') && !src.includes('cropped-');
      })
      .first();
    novel.cover =
      coverImg.attr('data-src') ||
      coverImg.attr('data-defer-src') ||
      defaultCover;

    // Status
    const statusEl = $('.status-pill').first();
    const statusClass = statusEl.attr('class') || '';
    if (statusClass.includes('is-ongoing')) novel.status = NovelStatus.Ongoing;
    else if (statusClass.includes('is-complete'))
      novel.status = NovelStatus.Completed;
    else if (statusClass.includes('is-stopped'))
      novel.status = NovelStatus.OnHiatus;

    // Author
    const authorLink = $('a[href*="/author/"]').first();
    if (authorLink.length) novel.author = authorLink.text().trim();

    // Summary
    novel.summary = $('#manga-summary').text().trim();

    // Genres
    const genreParts: string[] = [];
    $('a.pill, a[href*="/genre/"], a[href*="/tasnif/"]').each((_, el) => {
      const t = $(el).text().trim();
      if (t) genreParts.push(t);
    });
    novel.genres = genreParts.join(', ');

    // Chapters: read total from HTML, generate paths directly (fast, no API)
    const chapters: Plugin.ChapterItem[] = [];

    const totalText = $('.manga-stat__value').last().text().trim();
    const totalMatch = totalText.match(/(\d+)/);
    const totalChapters = totalMatch ? parseInt(totalMatch[1], 10) : 0;

    const firstRow = $('div.ch-row').first();
    const firstLink = firstRow.find('a').first().attr('href') || '';
    const firstNum = firstRow.attr('data-ch-num') || '';

    if (totalChapters > 0 && firstLink && firstNum) {
      const escapedNum = firstNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const basePath = firstLink.replace(new RegExp(`${escapedNum}/?$`), '');
      const basePathRelative = basePath.replace(this.site, '');

      for (let i = 1; i <= totalChapters; i++) {
        chapters.push({
          name: `الفصل ${i}`,
          path: basePathRelative + i + '/',
          chapterNumber: i,
        });
      }
    } else {
      $('div.ch-row').each((_, el) => {
        const a = $(el).find('a').first();
        const name =
          $(el).find('.ch-title').text().trim() || a.attr('aria-label') || '';
        const href = a.attr('href') || '';
        const date = $(el).find('.ch-date').text().trim();
        const chNum = $(el).attr('data-ch-num') || '';
        if (name && href) {
          chapters.push({
            name,
            path: href.replace(this.site, ''),
            releaseTime: date || null,
            chapterNumber: chNum ? parseInt(chNum, 10) : chapters.length + 1,
          });
        }
      });
    }

    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchHtml(`${this.site}${chapterPath}`);
    const $ = parseHTML(html);

    $(
      'script, style, .sharedaddy, .jp-relatedposts, .wp-block-spacer, .reading-nav, .ads, .advertisement, .nav-links, .comments-area',
    ).remove();

    $(
      '[style*="display:none"], [style*="display: none"], [hidden], .hidden',
    ).remove();

    const content =
      $('.reading-content, .entry-content, .chapter-content, .text-left')
        .first()
        .html() || '';

    return content || '<p>المحتوى غير متاح.</p>';
  }
}

export default new Markazriwayat();
