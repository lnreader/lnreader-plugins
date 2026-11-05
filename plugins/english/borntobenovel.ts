import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

/**
 * BornToBeNovel (borntobenovel.com) LNReader plugin
 *
 * A custom server-rendered site (not a known theme):
 *
 * - Catalog:      `/library/` lists every novel as an `a.novel-card` with
 *                 `data-genre`, `data-status` and `data-search-text`; the
 *                 site filters and searches that one page client-side.
 * - Ordering:     `/static/sliders.json` holds the site's `popular` and
 *                 `recent` (latest updates) slugs, used to order the catalog.
 * - Novel page:   `/novel/<slug>/` — title, genre tags, status tag and
 *                 description are in the markup; the chapter list is the
 *                 inline `window.chapters = {...}` object
 *                 (`{ "<n>": { url, is_free, date } }`).
 * - Chapter page: `/novel/<slug>/chapters/ch-<n>` — the text is a base64
 *                 string in `const contentData` that the page renders as a
 *                 light markdown (`**bold**`, `*italic*`, `* * *` rules).
 *                 Premium chapters carry a paywall notice instead.
 */

const PREMIUM_NOTICE = 'This chapter is available only with premium';

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64);
  let percentEncoded = '';
  for (let i = 0; i < binary.length; i++) {
    percentEncoded +=
      '%' + ('00' + binary.charCodeAt(i).toString(16)).slice(-2);
  }
  try {
    return decodeURIComponent(percentEncoded);
  } catch {
    return binary;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
}

function markdownToHtml(text: string): string {
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.replace(/\r/g, '').trim();
      if (!trimmed) return '';
      if (/^\*\s*\*\s*\*$/.test(trimmed)) return '<hr>';
      return (
        '<p>' + formatInline(trimmed.replace(/^~|~$/g, '').trim()) + '</p>'
      );
    })
    .filter(Boolean)
    .join('\n');
}

class BornToBeNovel implements Plugin.PluginBase {
  id = 'borntobenovel';
  name = 'BornToBeNovel';
  icon = 'src/en/borntobenovel/icon.png';
  site = 'https://borntobenovel.com';
  version = '1.0.0';

  private async fetchPage(path: string): Promise<string> {
    const res = await fetchApi(this.site + path, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': this.site + '/',
      },
    });
    if (!res.ok) {
      const error = new Error(
        'Could not load ' + path + ' (HTTP ' + res.status + ')',
      ) as Error & { status: number };
      error.status = res.status;
      throw error;
    }
    return res.text();
  }

  private async fetchHtml(path: string) {
    return parseHTML(await this.fetchPage(path));
  }

  private async fetchCatalog(): Promise<
    (Plugin.NovelItem & { genre: string; status: string; search: string })[]
  > {
    const $ = await this.fetchHtml('/library/');
    return $('a.novel-card')
      .map((_, el) => {
        const card = $(el);
        const src = card.find('img.cover-icon').attr('src');
        return {
          name: card.find('.novel-title').text().trim(),
          path: card.attr('href') || '',
          cover: src ? this.resolveAsset(src) : undefined,
          genre: card.attr('data-genre') || '',
          status: card.attr('data-status') || '',
          search: (card.attr('data-search-text') || '').toLowerCase(),
        };
      })
      .get()
      .filter(novel => novel.path && novel.name);
  }

  private resolveAsset(src: string) {
    return /^https?:\/\//.test(src) ? src : this.site + src;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // The whole catalog is a single page.
    if (pageNo > 1) return [];
    const genre = filters?.genre?.value || 'all';
    const status = filters?.status?.value || 'all';
    const catalog = await this.fetchCatalog();
    const ranked = await this.fetchRanking(
      showLatestNovels ? 'recent' : 'popular',
    );
    const rank = (path: string) => {
      const index = ranked.indexOf(path);
      return index < 0 ? ranked.length : index;
    };
    return catalog
      .filter(
        novel =>
          (genre === 'all' || novel.genre === genre) &&
          (status === 'all' || novel.status === status),
      )
      .map((novel, index) => ({ novel, index }))
      .sort(
        (a, b) => rank(a.novel.path) - rank(b.novel.path) || a.index - b.index,
      )
      .map(({ novel: { name, path, cover } }) => ({ name, path, cover }));
  }

  private async fetchRanking(list: 'popular' | 'recent'): Promise<string[]> {
    try {
      const res = await fetchApi(this.site + '/static/sliders.json');
      const data = await res.json();
      return (data[list] || []).map(
        (item: { id: string }) => '/novel/' + item.id + '/',
      );
    } catch {
      return [];
    }
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const term = searchTerm.trim().toLowerCase();
    return (await this.fetchCatalog())
      .filter(novel => novel.search.includes(term))
      .map(({ name, path, cover }) => ({ name, path, cover }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = novelPath.endsWith('/') ? novelPath : novelPath + '/';
    const html = await this.fetchPage(path);
    if (!html.trim()) {
      throw new Error('The site returned an empty page for ' + path);
    }
    const $ = parseHTML(html);

    const title = $('h1.desktop-title').first().clone();
    title.find('.alt-names').remove();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: title.text().trim() || 'Untitled',
    };

    const cover = $('img.desktop-cover').attr('src');
    if (cover) novel.cover = this.resolveAsset(cover);

    const tags = $('#desktopGenres .genre-tag');
    const statusClass = tags.filter('.status-tag').attr('class') || '';
    if (statusClass.includes('status-completed')) {
      novel.status = NovelStatus.Completed;
    } else if (statusClass.includes('status-ongoing')) {
      novel.status = NovelStatus.Ongoing;
    } else if (statusClass.includes('status-dropped')) {
      novel.status = NovelStatus.Cancelled;
    }

    novel.genres = tags
      .filter(
        (_, el) =>
          !$(el).is('.rating-tag, .status-tag, .chapters-tag') &&
          !$(el).hasClass('genre-more-button'),
      )
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join(', ');

    const summary = $('.desktop-description .novel-description').first();
    summary.find('br').replaceWith('\n');
    novel.summary = summary.text().trim() || undefined;

    novel.chapters = this.parseChapterList(html);
    return novel;
  }

  private parseChapterList(html: string): Plugin.ChapterItem[] {
    const marker = 'window.chapters = ';
    const start = html.indexOf(marker);
    if (start < 0) return [];
    const begin = html.indexOf('{', start);
    // The object is flat JSON that ends at the first `};` after it.
    const end = html.indexOf('};', begin);
    if (begin < 0 || end < 0) return [];

    let data: Record<string, { url: string; is_free: boolean; date: string }>;
    try {
      data = JSON.parse(html.slice(begin, end + 1));
    } catch {
      return [];
    }

    return Object.keys(data)
      .map(Number)
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b)
      .map(n => {
        const item = data[String(n)];
        const [day, month, year] = (item.date || '').split('.');
        return {
          name: 'Chapter ' + n + (item.is_free === false ? ' (Premium)' : ''),
          path: item.url,
          releaseTime: year ? year + '-' + month + '-' + day : undefined,
          chapterNumber: n,
        };
      });
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchPage(chapterPath);
    const match = html.match(/const contentData = '([^']*)'/);
    if (!match || !match[1]) {
      throw new Error('Chapter text not found: ' + chapterPath);
    }
    const text = decodeBase64Utf8(match[1]);
    if (text.startsWith(PREMIUM_NOTICE)) {
      throw new Error(
        'Premium chapter: a BornToBeNovel subscription is required to read it.',
      );
    }
    return markdownToHtml(text);
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + path + (isNovel && !path.endsWith('/') ? '/' : '');

  filters = {
    genre: {
      label: 'Genre',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Yaoi', value: 'Yaoi' },
        { label: 'Erotica', value: 'Erotica' },
        { label: 'Shounen', value: 'Shounen' },
        { label: 'Shoujo', value: 'Shoujo' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Status',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Dropped', value: 'dropped' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new BornToBeNovel();
