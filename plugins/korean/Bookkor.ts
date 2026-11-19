import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';
import { load as parseHTML } from 'cheerio';

type $Root = ReturnType<typeof parseHTML>;
type RawChapter = { name: string; path: string; releaseTime?: string };

const NAV_SLUGS = new Set([
  '일반소설',
  '성인소설',
  'BLGL',
  '완결소설',
  'bookmark',
  'signin',
  'signup',
  'live.html',
]);

class BookkorPlugin implements Plugin.PluginBase {
  id = 'bookkor';
  name = 'Bookkor (북코)';
  icon = 'src/korean/bookkor/icon.png';
  site = 'https://011.bookkor.com';
  version = '1.0.0';

  filters = {
    category: {
      label: '카테고리',
      value: '/',
      options: [
        { label: '전체', value: '/' },
        { label: '일반소설', value: '/일반소설' },
        { label: '성인소설', value: '/성인소설' },
        { label: 'BL/GL', value: '/BLGL' },
        { label: '완결소설', value: '/완결소설' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  // ---------- helpers ----------

  private async getHtml(path: string): Promise<string> {
    const res = await fetchApi(this.site + path);
    return res.text();
  }

  /** absolute/relative href -> "/path?query" (empty string if external) */
  private toPath(href?: string): string {
    if (!href) return '';
    let h = href.trim();
    if (/^https?:\/\//i.test(h)) {
      if (!h.startsWith(this.site)) return '';
      h = h.slice(this.site.length);
    }
    return h.startsWith('/') ? h : '';
  }

  /** "/slug" only (single segment, not a menu link) */
  private novelPath(href?: string): string {
    const p = this.toPath(href);
    if (!/^\/[^/?#]+$/.test(p)) return '';
    let slug = p.slice(1);
    try {
      slug = decodeURIComponent(slug);
    } catch {}
    return NAV_SLUGS.has(slug) ? '' : p;
  }

  private absImg(src?: string): string {
    if (!src) return defaultCover;
    if (src.startsWith('http')) return src;
    if (src.startsWith('//')) return 'https:' + src;
    if (src.startsWith('/')) return this.site + src;
    return defaultCover;
  }

  // ---------- list parsing ----------

  private parseList(html: string): Plugin.NovelItem[] {
    const $ = parseHTML(html);
    const map = new Map<string, Plugin.NovelItem>();

    $('a[href]').each((_, a) => {
      const $a = $(a);
      if ($a.closest('header, nav, footer').length) return;

      const path = this.novelPath($a.attr('href'));
      if (!path) return;

      const img = $a.find('img').first();
      const alt = (img.attr('alt') || '').trim();
      let name = alt && alt.toLowerCase() !== 'banner' ? alt : '';
      if (!name) {
        name = $a
          .find('h1,h2,h3,h4,h5,strong,[class*="title"]')
          .first()
          .text()
          .trim();
      }
      if (!name) {
        name = $a
          .text()
          .replace(/\s+/g, ' ')
          .trim()
          .split(/\s+(?:\d+H|완결|BL완결|\d+화|외전)/)[0]
          .trim();
      }

      const src =
        img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src');
      const cover = src ? this.absImg(src) : '';

      const prev = map.get(path);
      if (prev) {
        if (!prev.name && name) prev.name = name;
        if ((!prev.cover || prev.cover === defaultCover) && cover) {
          prev.cover = cover;
        }
      } else {
        map.set(path, { name, path, cover: cover || defaultCover });
      }
    });

    return [...map.values()].filter(n => n.name);
  }

  // ---------- popular / latest ----------

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const category = (filters?.category?.value as string) || '/';
    const html = await this.getHtml(`${encodeURI(category)}?page=${pageNo}`);
    return this.parseList(html);
  }

  // ---------- novel ----------

  private parseChapterPage($: $Root): RawChapter[] {
    const out: RawChapter[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_, a) => {
      const $a = $(a);
      const path = this.toPath($a.attr('href'));
      
      // Dynamic routing validation rule checks deep links safely
      if (!path || path.split('/').length < 3 || seen.has(path)) return;

      const raw = $a.text().replace(/\s+/g, ' ').trim();
      if (!raw || /보기|이전|다음/.test(raw)) return;

      const name = raw.replace(/^(.+?화)\s+\d+$/, '$1');
      const date = /\d{4}-\d{2}-\d{2}/.exec($a.closest('li').text())?.[0];

      seen.add(path);
      out.push({
        name,
        path,
        releaseTime: date ? new Date(`${date}T00:00:00+09:00`).toISOString() : undefined,
      });
    });

    return out;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await this.getHtml(novelPath);
    const $ = parseHTML(html);
    const og = (p: string) =>
      ($(`meta[property="og:${p}"]`).attr('content') || '').trim();

    const name = $('h1').first().text().trim() || og('title');
    const cover = og('image') ? this.absImg(og('image')) : defaultCover;

    // summary: longest paragraph near the title, else cleaned og:description
    const ogSummary = og('description').replace(/^.*?웹소설\.\s*/, '');
    let summary = ogSummary;
    $('h1')
      .first()
      .parents('div')
      .eq(1)
      .find('p')
      .each((_, p) => {
        const t = $(p).text().trim();
        if (t.length > summary.length && !/별점/.test(t)) summary = t;
      });

    // genres + tags
    const genres: string[] = [];
    $('a[href*="genre="], a[href*="tag="]').each((_, a) => {
      const t = $(a).text().replace(/^#/, '').trim();
      if (t && !genres.includes(t)) genres.push(t);
    });

    // status
    const info = $('h1').first().parents('div').eq(1).text();
    const status = /완결/.test(info)
      ? NovelStatus.Completed
      : NovelStatus.Ongoing;

    // chapters (page 1 + every further page)
    const chapters: RawChapter[] = this.parseChapterPage($);
    const seen = new Set(chapters.map(c => c.path));

    const total = parseInt(
      (/총\s*([\d,]+)\s*화/.exec($('body').text())?.[1] || '0').replace(/,/g, ''),
      10,
    );
    let maxLinked = 1;
    $('a[href*="page="]').each((_, a) => {
      const m = /[?&]page=(\d+)/.exec($(a).attr('href') || '');
      if (m) maxLinked = Math.max(maxLinked, parseInt(m[1], 10));
    });

    const BATCH = 5;
    const MAX_PAGE = 300;
    let page = 2;
    while (page <= MAX_PAGE && (seen.size < total || page <= maxLinked)) {
      const nums = Array.from({ length: BATCH }, (_, i) => page + i);
      const results = await Promise.all(
        nums.map(n =>
          this.getHtml(`${novelPath}?page=${n}`)
            .then(h => this.parseChapterPage(parseHTML(h)))
            .catch(() => [] as RawChapter[]),
        ),
      );
      let added = 0;
      for (const list of results) {
        for (const ch of list) {
          if (!seen.has(ch.path)) {
            seen.add(ch.path);
            chapters.push(ch);
            added++;
          }
        }
      }
      if (!added) break;
      page += BATCH;
    }

    chapters.reverse(); // site lists newest first -> app wants oldest first

    return {
      path: novelPath,
      name,
      cover,
      summary,
      genres: genres.join(', '),
      status,
      chapters: chapters.map((c, i) => ({ ...c, chapterNumber: i + 1 })),
    };
  }

  // ---------- chapter ----------

  private extractContent($: $Root): string {
    const known = [
      '#novel-content',
      '.novel-content',
      '#chapter-content',
      '.chapter-content',
      '.viewer-text',
      '#viewer',
      '.viewer',
    ];
    let best: ReturnType<typeof $> | null = null;

    for (const s of known) {
      const c = $(s).first();
      if (c.length && c.text().trim().length > 200) {
        best = c;
        break;
      }
    }

    if (!best) {
      let bestScore = 0;
      $('div, article, section, main').each((_, el) => {
        const $el = $(el);
        const score =
          $el.children('p, br').length +
          $el
            .contents()
            .filter((_, n) => n.type === 'text' && $(n).text().trim().length > 0)
            .length;
        if (score > bestScore) {
          bestScore = score;
          best = $el;
        }
      });
      if (!best || bestScore < 5) best = $('main').length ? $('main') : $('body');
    }

    const el = best as ReturnType<typeof $>;
    el.find(
      'script, style, ins, iframe, noscript, nav, header, footer, form, button, select, a[href^="http"], img[alt="banner"]',
    ).remove();

    let out = el.html() || '';
    if (!/<p[\s>]|<br/i.test(out)) {
      out = el
        .text()
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => `<p>${l}</p>`)
        .join('');
    }
    return out;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.getHtml(chapterPath);
    return this.extractContent(parseHTML(html));
  }

  // ---------- search ----------

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = encodeURIComponent(searchTerm);
    const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    const wanted = norm(searchTerm);

    const candidates = [
      `/?q=${term}`,
      `/?search=${term}`,
      `/?keyword=${term}`,
      `/?s=${term}`,
      `/search?q=${term}`,
    ];

    for (const c of candidates) {
      try {
        const novels = this.parseList(await this.getHtml(`${c}&page=${pageNo}`));
        if (novels.some(n => norm(n.name).includes(wanted))) return novels;
      } catch {}
    }
    return [];
  }
}

export default new BookkorPlugin();
