import { fetchText, fetchApi } from '@libs/fetch';
import { load as loadCheerio } from 'cheerio';
import { Plugin } from '@typings/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';

export class LightNovelWorldPlugin implements Plugin.PluginBase {
  id = 'lightnovelworld';
  name = 'LightNovelWorld';
  icon = 'src/en/lightnovelworld/icon.png';
  site = 'https://lightnovelworld.org/';
  version = '1.1.8';

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const page = Math.max(1, pageNo || 1);
    const genre = filters?.genre?.value || 'all';
    const status = filters?.status?.value || 'all';
    const order = showLatestNovels
      ? 'updates'
      : filters?.order?.value || 'popular';
    const url = `${this.site}genre-${genre}/?status=${status}&order=${order}&page=${page}`;
    const html = await fetchText(url);
    return this.parseNovelList(html);
  }

  async fetchAllChapters(slug: string): Promise<Plugin.ChapterItem[]> {
    const LIMIT = 500;
    const apiBase = `${this.site}api/novel/${slug}/chapters/?limit=${LIMIT}`;

    const firstRes = await fetchApi(`${apiBase}&offset=0`);
    const firstJson = (await firstRes.json()) as {
      chapters: Array<{ number: number; title: string; display_name?: string }>;
      total_chapters: number;
      has_more: boolean;
    };

    const total = firstJson.total_chapters || firstJson.chapters.length;
    const allChapters: Plugin.ChapterItem[] = [];

    const offsets: number[] = [];
    for (let offset = LIMIT; offset < total; offset += LIMIT) {
      offsets.push(offset);
    }

    const remainingResults = await Promise.all(
      offsets.map(async offset => {
        try {
          const res = await fetchApi(`${apiBase}&offset=${offset}`);
          const json = (await res.json()) as {
            chapters: Array<{
              number: number;
              title: string;
              display_name?: string;
            }>;
          };
          return json.chapters || [];
        } catch (err) {
          console.error(`Failed to fetch chapters at offset ${offset}:`, err);
          return [];
        }
      }),
    );

    const rawChapters = [...firstJson.chapters, ...remainingResults.flat()];

    for (const ch of rawChapters) {
      const num = ch.number;
      const name = (ch.title || `Chapter ${num}`).trim();
      allChapters.push({
        name,
        path: `novel/${slug}/chapter/${num}/`,
        chapterNumber: num,
      });
    }

    allChapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
    return allChapters;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    let cleanPath = novelPath.replace(/^\//, '');
    if (!cleanPath.endsWith('/')) cleanPath += '/';

    const fullUrl = cleanPath.startsWith('http')
      ? cleanPath
      : `${this.site}${cleanPath}`;

    const html = await fetchText(fullUrl);
    const $ = loadCheerio(html);

    const title =
      $('.novel-title, h1.title, .novel-name, h1, .book-title')
        .first()
        .text()
        .trim() || 'Untitled Novel';

    const imgEl = $(
      '.cover img, .novel-cover img, .book-cover img, img.cover, .card-cover img, .novel-cover-container img',
    ).first();
    const rawCover =
      imgEl.attr('src') ||
      imgEl.attr('data-src') ||
      imgEl.attr('data-lazy-src') ||
      '';
    const cover = rawCover ? new URL(rawCover, this.site).href : '';

    const summaryEl = $(
      '.summary-content, .novel-summary, .synopsis, .summary .content',
    ).first();
    summaryEl.find('br').replaceWith('\n');
    const paragraphs = summaryEl
      .find('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    let summary = '';
    if (paragraphs.length > 0) {
      for (const p of paragraphs) {
        if (summary && (p.startsWith('–') || p.startsWith('-'))) {
          summary += ' ' + p;
        } else {
          summary += (summary ? '\n\n' : '') + p;
        }
      }
    } else {
      summary = summaryEl.text().trim();
    }

    const author =
      $('.author a, .novel-author a, .author-name, .novel-author')
        .first()
        .text()
        .trim() || 'Unknown Author';
    const rawStatus = $('.status-badge, .novel-status, .status-label, .status')
      .first()
      .text()
      .trim()
      .toLowerCase();
    let status = NovelStatus.Unknown;
    if (rawStatus.includes('ongoing')) status = NovelStatus.Ongoing;
    else if (rawStatus.includes('completed') || rawStatus.includes('complete'))
      status = NovelStatus.Completed;
    else if (rawStatus.includes('hiatus') || rawStatus.includes('paused'))
      status = NovelStatus.OnHiatus;

    const genres: string[] = [];
    $('.genres a, .categories a, .genre-item, .tags a, .genre-tag').each(
      (_, el) => {
        const g = $(el).text().trim();
        if (g && !genres.includes(g)) {
          genres.push(g);
        }
      },
    );

    const slug = cleanPath.replace(/^novel\//, '').replace(/\/$/, '');
    let chapters: Plugin.ChapterItem[] = [];

    if (slug) {
      try {
        chapters = await this.fetchAllChapters(slug);
      } catch (error) {
        console.error('Failed to fetch chapter list:', error);
      }
    }

    return {
      path: cleanPath,
      name: title,
      cover,
      summary,
      author,
      status,
      genres: genres.join(', '),
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const cleanChapPath = chapterPath.replace(/^\//, '');
    const fullUrl = cleanChapPath.startsWith('http')
      ? cleanChapPath
      : `${this.site}${cleanChapPath}`;

    const html = await fetchText(fullUrl);
    const $ = loadCheerio(html);

    const container = $(
      '#chapterText, .chapter-text, #chapter-container, .chapter-content, #chapter-body, .chr-c, #chr-content',
    ).first();
    if (!container.length) {
      return '<p>No content found.</p>';
    }

    container
      .find(
        'script, style, ins, .ads, .ad-container, .ad-wrapper, .watermark, #ad-banner, iframe, .ad-box, .pub-ad, .chapter-ad-container',
      )
      .remove();
    container.find('*').each((_, el) => {
      const attribs = el.attribs || {};
      for (const attr in attribs) {
        if (attr.startsWith('on') || attr === 'style') {
          $(el).removeAttr(attr);
        }
      }
    });

    const content = container.html()?.trim() || '<p>No content found.</p>';
    return content.replace(/[\u200B-\u200D\uFEFF]/g, '');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (!searchTerm || !searchTerm.trim()) return [];
    const url = `${this.site}api/search/?q=${encodeURIComponent(searchTerm.trim())}`;
    try {
      const res = await fetchApi(url);
      const json = (await res.json()) as { novels?: Array<any> };
      if (!json || !Array.isArray(json.novels)) {
        return [];
      }
      return json.novels
        .map((item: any) => {
          const rawCover = item.cover_path || '';
          const cover = rawCover ? new URL(rawCover, this.site).href : '';
          const slug = item.slug || '';
          const path = slug ? `novel/${slug}/` : '';

          return {
            name: item.title || 'Untitled',
            cover,
            path,
          };
        })
        .filter((item: Plugin.NovelItem) => !!item.path && !!item.name);
    } catch {
      return [];
    }
  }

  parseNovelList(html: string): Plugin.NovelItem[] {
    const $ = loadCheerio(html);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $(
      '.ranking-card, .recommendation-card, .boost-shelf-card, .novel-item, .novel-card',
    ).each((_, el) => {
      const item = $(el);
      const linkEl = item.is('a[href*="/novel/"]')
        ? item
        : item.find("a[href*='/novel/']").first();
      const rawPath =
        linkEl.attr('href') || item.find('a.card-link').attr('href') || '';

      if (!rawPath) return;

      const titleEl = item
        .find('.card-title, .novel-title, .boost-shelf-title, .title, h3')
        .first();
      const name =
        linkEl.attr('title')?.trim() ||
        item.find('a[title]').first().attr('title')?.trim() ||
        item.find('img[alt]').first().attr('alt')?.trim() ||
        titleEl.text().trim() ||
        '';

      const imgEl = item.find('img.skel-img, .card-cover img, img').first();
      const rawCover =
        imgEl.attr('src') ||
        imgEl.attr('data-src') ||
        imgEl.attr('data-lazy-src') ||
        item.find('[data-bg-image]').attr('data-bg-image') ||
        '';

      if (name && rawPath) {
        let cleanPath = rawPath.startsWith('http')
          ? new URL(rawPath).pathname
          : rawPath;
        cleanPath = cleanPath.replace(/^\//, '');
        if (!cleanPath.endsWith('/')) cleanPath += '/';
        if (seen.has(cleanPath)) return;
        seen.add(cleanPath);

        const cover = rawCover ? new URL(rawCover, this.site).href : '';

        novels.push({
          name,
          cover,
          path: cleanPath,
        });
      }
    });

    return novels;
  }

  filters = {
    order: {
      value: 'popular',
      label: 'Order by',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'New', value: 'new' },
        { label: 'Updates', value: 'updates' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      value: 'all',
      label: 'Genre',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Action', value: 'action' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Anime', value: 'anime' },
        { label: 'Arts', value: 'arts' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Eastern', value: 'eastern' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fan-fiction', value: 'fan-fiction' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Game', value: 'game' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'LGBT+', value: 'lgbt+' },
        { label: 'Magic', value: 'magic' },
        { label: 'Magical Realism', value: 'magical-realism' },
        { label: 'Manhua', value: 'manhua' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Modern Life', value: 'modern-life' },
        { label: 'Movies', value: 'movies' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Other', value: 'other' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Realistic Fiction', value: 'realistic-fiction' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'System', value: 'system' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban', value: 'urban' },
        { label: 'Urban Life', value: 'urban-life' },
        { label: 'Video Games', value: 'video-games' },
        { label: 'War', value: 'war' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new LightNovelWorldPlugin();
