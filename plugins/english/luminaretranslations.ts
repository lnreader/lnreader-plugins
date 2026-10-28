import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type SeriesListItem = {
  id: number;
  slug: string;
  title: string;
  cover_image?: string | null;
  excerpt?: string | null;
  type?: string | null;
  status?: string | null;
  author?: string | null;
  artist?: string | null;
  genres?: string[];
  rating?: number;
  latest_chapter?: { id: number } | null;
};

type SeriesPage = {
  data: SeriesListItem[];
  meta: { total: number; page: number; per_page: number; total_pages: number };
};

type SearchHit = {
  id: number;
  title: string;
  slug: string;
  cover_image?: string | null;
  cover_url?: string | null;
};

type WpRendered = { rendered?: string };
type WpSeries = {
  id: number;
  slug: string;
  title: WpRendered;
  content: WpRendered;
  excerpt: WpRendered;
  featured_media: number;
  meta?: { author?: string; artist?: string };
  class_list?: string[];
};

type GroupedChapter = {
  id: number;
  title: string | null;
  number: number;
  url: string;
  published_at?: string | null;
  date?: string | null;
};

type GroupedChapters = {
  groups: { slug: string; name: string; chapters: GroupedChapter[] }[];
};

type ChapterData = {
  id: number;
  title: string;
  content?: string | null;
  pages?: string[] | null;
  url?: string;
};

class LuminareTranslationsPlugin implements Plugin.PluginBase {
  id = 'luminaretranslations';
  name = 'Luminare Translations';
  icon = 'src/en/luminaretranslations/icon.png';
  site = 'https://luminaretranslations.com';
  version = '1.0.0';

  private headers = {
    Accept: 'application/json',
    Referer: 'https://luminaretranslations.com/',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  };

  filters = {
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort',
      value: 'popular',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'Latest', value: 'latest' },
        { label: 'Rating', value: 'rating' },
      ],
    },
    type: {
      type: FilterTypes.Picker,
      label: 'Type',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Light Novel', value: 'light-novel' },
        { label: 'Light Novel (alt)', value: 'light_novel' },
        { label: 'Manga', value: 'manga' },
      ],
    },
    genres: {
      type: FilterTypes.CheckboxGroup,
      label: 'Genres',
      value: [],
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Adaptation', value: 'adaptation' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Harem', value: 'harem' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Tragedy', value: 'tragedy' },
      ],
    },
  } satisfies Filters;

  private async api<T>(path: string): Promise<T> {
    const url = path.startsWith('http')
      ? path
      : this.site + '/wp-json/' + path.replace(/^\//, '');
    const r = await fetchApi(url, { headers: this.headers });
    if (!r.ok) {
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    }
    return (await r.json()) as T;
  }

  private stripHtml(html: string): string {
    return parseHTML('<div>' + html + '</div>')('div')
      .text()
      .trim();
  }

  private decodeEntities(text: string): string {
    return parseHTML('<textarea>' + text + '</textarea>')('textarea').text();
  }

  private toItem(s: SeriesListItem | SearchHit): Plugin.NovelItem {
    const cover =
      ('cover_image' in s && s.cover_image) ||
      ('cover_url' in s && s.cover_url) ||
      defaultCover;
    return {
      name: this.decodeEntities(s.title),
      path: 'series/' + s.slug,
      cover: cover || defaultCover,
    };
  }

  private mapStatus(raw?: string | null, classList?: string[]): string {
    const fromClass = (classList || [])
      .find(c => c.startsWith('series_status-'))
      ?.replace('series_status-', '');
    const value = (raw || fromClass || '').toLowerCase();
    if (value.includes('complete') || value === 'end' || value === 'finished') {
      return NovelStatus.Completed;
    }
    if (value.includes('ongoing') || value.includes('on-going')) {
      return NovelStatus.Ongoing;
    }
    if (value.includes('hiatus') || value.includes('hold')) {
      return NovelStatus.OnHiatus;
    }
    if (value.includes('cancel') || value.includes('drop')) {
      return NovelStatus.Cancelled;
    }
    return NovelStatus.Unknown;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();
    params.set('page', String(pageNo));
    params.set('per_page', '20');
    params.set(
      'sort',
      showLatestNovels ? 'latest' : filters?.sort?.value || 'popular',
    );
    if (filters?.type?.value) params.set('type', filters.type.value);
    for (const g of filters?.genres?.value || []) {
      params.append('genres', g);
    }
    const page = await this.api<SeriesPage>(
      'yarnovel/v1/series?' + params.toString(),
    );
    return (page.data || []).map(s => this.toItem(s));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();
    params.set('q', searchTerm.trim());
    params.set('page', String(pageNo));
    const hits = await this.api<SearchHit[]>(
      'yarnovel/v1/search?' + params.toString(),
    );
    return (hits || []).map(s => this.toItem(s));
  }

  private async findSeriesListItem(
    slug: string,
    titleHint?: string,
  ): Promise<SeriesListItem | null> {
    const queries = [
      titleHint,
      slug.split('-').slice(0, 4).join(' '),
      slug.split('-').find(p => p.length > 5),
    ].filter((q): q is string => !!q && q.trim().length > 2);

    for (const q of queries) {
      const params = new URLSearchParams();
      params.set('search', q);
      params.set('per_page', '50');
      params.set('page', '1');
      const page = await this.api<SeriesPage>(
        'yarnovel/v1/series?' + params.toString(),
      );
      const match = (page.data || []).find(s => s.slug === slug);
      if (match) return match;
    }

    // Fallback: page through the catalog (site is small).
    for (let pageNo = 1; pageNo <= 10; pageNo++) {
      const page = await this.api<SeriesPage>(
        'yarnovel/v1/series?page=' + pageNo + '&per_page=50&sort=latest',
      );
      const match = (page.data || []).find(s => s.slug === slug);
      if (match) return match;
      if (!page.meta || pageNo >= page.meta.total_pages) break;
    }
    return null;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.replace(/^\/?series\//, '').replace(/\/$/, '');
    const wp = await this.api<WpSeries[]>(
      'wp/v2/series?slug=' + encodeURIComponent(slug),
    );
    if (!wp?.length) {
      throw new Error('Novel not found.');
    }
    const series = wp[0];
    const title = this.stripHtml(series.title?.rendered || slug);
    const summary =
      this.stripHtml(series.content?.rendered || '') ||
      this.stripHtml(series.excerpt?.rendered || '') ||
      undefined;

    let cover = defaultCover;
    if (series.featured_media) {
      try {
        const media = await this.api<{ source_url?: string }>(
          'wp/v2/media/' + series.featured_media,
        );
        if (media?.source_url) cover = media.source_url;
      } catch {
        // keep defaultCover
      }
    }

    const listItem = await this.findSeriesListItem(slug, title);
    if (listItem?.cover_image) cover = listItem.cover_image;

    const genres = (listItem?.genres || [])
      .map(g => g)
      .filter(Boolean)
      .join(', ');

    const chapters: Plugin.ChapterItem[] = [];
    const chapterId = listItem?.latest_chapter?.id;
    if (chapterId) {
      const grouped = await this.api<GroupedChapters>(
        'yarnovel/v1/chapters/' + chapterId + '/grouped-chapters',
      );
      let n = 0;
      for (const group of grouped.groups || []) {
        const groupName =
          group.slug && group.slug !== '__ungrouped__' ? group.name : '';
        for (const ch of group.chapters || []) {
          n += 1;
          const rawTitle = ch.title
            ? this.decodeEntities(ch.title)
            : 'Chapter ' + (ch.number ?? n);
          const name = groupName ? groupName + ': ' + rawTitle : rawTitle;
          chapters.push({
            name,
            path: 'chapter/' + ch.id,
            releaseTime: ch.published_at || ch.date || undefined,
            chapterNumber: typeof ch.number === 'number' ? ch.number : n,
          });
        }
      }
    }

    return {
      path: 'series/' + slug,
      name: title,
      cover,
      author: series.meta?.author || listItem?.author || undefined,
      artist: series.meta?.artist || listItem?.artist || undefined,
      summary,
      genres: genres || undefined,
      status: this.mapStatus(listItem?.status, series.class_list),
      rating: listItem?.rating || undefined,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const id = chapterPath.replace(/^\/?chapter\//, '').replace(/\/$/, '');
    const res = await this.api<{ data: ChapterData }>(
      'yarnovel/v1/chapters/' + id,
    );
    const chapter = res.data;
    let html = chapter.content || '';

    // Comic / image chapters: ensure pages are visible even if content is sparse.
    const pages = chapter.pages || [];
    if (pages.length) {
      const hasImg = /<img[\s>]/i.test(html);
      if (!hasImg) {
        html += pages.map(src => '<img src="' + src + '" />').join('') || '';
      }
    }

    if (!html.trim()) {
      return '<p>This chapter is empty or locked.</p>';
    }

    const $ = parseHTML(html);
    $('script, style, noscript').remove();
    $('img').each((_, el) => {
      const img = $(el);
      const src = img.attr('src') || img.attr('data-src') || '';
      if (src.startsWith('/')) img.attr('src', this.site + src);
      else if (src) img.attr('src', src);
    });
    return $.root().html() || html;
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    const clean = path.replace(/^\//, '');
    if (clean.startsWith('chapter/')) {
      const id = clean.replace(/^chapter\//, '').replace(/\/$/, '');
      return this.site + '/?p=' + id;
    }
    if (clean.startsWith('series/')) {
      return this.site + '/' + clean.replace(/\/$/, '');
    }
    return this.site + (isNovel ? '/series/' : '/') + clean;
  }
}

export default new LuminareTranslationsPlugin();
