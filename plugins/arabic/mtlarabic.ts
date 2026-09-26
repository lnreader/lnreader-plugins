import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';

type ListingItem = {
  id: number;
  name: string;
  slug: string;
  image: string;
};

type ListingPage = {
  items: ListingItem[];
  pagination: { currentPage: number; totalPages: number; pageSize: number };
};

type Chapter = {
  number: number;
  title: string;
  approvalDate?: string;
};

type NovelDetail = {
  name: string;
  description: string;
  type: string;
  status: string;
  image: string;
};

/**
 * The site renders every page as a `<script type="application/json">` island
 * rather than server-side markup, so the parser here reads JSON out of HTML
 * rather than walking the DOM.
 */
const ISLAND = (id: string) =>
  new RegExp(
    `<script id="${id}" type="application/json">([\\s\\S]*?)</script>`,
  );

const BASE_URL = 'https://mtlarabic.com';

/** `image` is a bare filename; the file itself lives under /images/novels/. */
const coverUrl = (image?: string | null) =>
  image ? `${BASE_URL}/images/novels/${image}` : defaultCover;

const statusFrom = (status: string): Plugin.SourceNovel['status'] => {
  if (status.includes('مستمرة')) return NovelStatus.Ongoing;
  if (status.includes('مكتمل')) return NovelStatus.Completed;
  return NovelStatus.Unknown;
};

class MtlaArabic implements Plugin.PluginBase {
  id = 'mtlarabic';
  name = 'مكتبة الخيال';
  version = '1.0.0';
  icon = 'src/ar/mtlarabic/icon.png';
  site = 'https://mtlarabic.com';

  private baseUrl = BASE_URL;

  /**
   * The site's own `<select id="filterCategory">` renders exactly these five.
   * Any other value is accepted by the endpoint but filtered to nothing.
   */
  private readonly categories = [
    { label: 'تاريخي', value: 'تاريخي' },
    { label: 'حضري', value: 'حضري' },
    { label: 'خيال', value: 'خيال' },
    { label: 'خيال علمي', value: 'خيال علمي' },
    { label: 'رياضي', value: 'رياضي' },
  ];

  /**
   * `sort` is accepted for any value but only applied for these two — the two
   * options in the site's `<select id="filterSort">`. Anything else silently
   * returns the default `latest_update` listing.
   */
  filters = {
    sort: {
      label: 'الترتيب حسب',
      type: FilterTypes.Picker,
      value: 'latest_update',
      options: [
        { label: 'آخر تحديث', value: 'latest_update' },
        { label: 'عدد الفصول - من أعلى لأقل', value: '-num_chapters' },
      ],
    },
    category: {
      label: 'التصنيفات',
      type: FilterTypes.Picker,
      value: '',
      options: [{ label: 'الكل', value: '' }, ...this.categories],
    },
  } satisfies Filters;

  private async fetchText(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Could not reach site (${res.status})`);
    }
    return res.text();
  }

  /** Read one of the page's JSON islands out of the HTML. */
  private parseIsland<T>(html: string, id: string): T {
    const match = html.match(ISLAND(id));
    if (!match) {
      throw new Error(`Could not find "${id}" data on the page`);
    }
    return JSON.parse(match[1]) as T;
  }

  private toNovelItem(novel: ListingItem): Plugin.NovelItem {
    return {
      name: novel.name,
      path: `/${novel.slug}`,
      cover: coverUrl(novel.image),
    };
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sort = filters?.sort.value || 'latest_update';
    const category = filters?.category.value || '';

    const query =
      `?sort=${encodeURIComponent(sort)}` +
      (category ? `&category=${encodeURIComponent(category)}` : '') +
      `&page=${pageNo}`;

    const html = await this.fetchText(`${this.baseUrl}/novels${query}`);
    const listing = this.parseIsland<ListingPage>(html, '__NOVELS__');

    // The server clamps out-of-range pages to an empty listing; let the app
    // know there is nothing more to fetch.
    if (pageNo > listing.pagination.totalPages) return [];

    return listing.items.map(item => this.toNovelItem(item));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (!term) return [];

    const html = await this.fetchText(
      `${this.baseUrl}/novels?q=${encodeURIComponent(term)}&page=${pageNo}`,
    );
    const listing = this.parseIsland<ListingPage>(html, '__NOVELS__');

    if (pageNo > listing.pagination.totalPages) return [];

    return listing.items.map(item => this.toNovelItem(item));
  }

  /**
   * A novel's own page is `/{slug}` (there is no `/novel-details` route here),
   * and that page embeds only the first 100 chapters. The reader page
   * `/{slug}/1`, however, carries the *complete* chapter list in its
   * `__NOVEL__` island in a single request — the site rate-limits to 100
   * requests per 15 minutes per IP (`ratelimit-policy: 100;w=900`), and the
   * paginated `/api/novels/{id}/chapters` endpoint would cost 13 requests just
   * to open the site's largest novel (6104 chapters). Reading the list off the
   * reader page keeps `parseNovel` at one request for every novel.
   *
   * The reader island has no `approvalDate`, so chapters from this path carry
   * no release time.
   */
  private async fetchChapterList(slug: string): Promise<Chapter[]> {
    const html = await this.fetchText(
      `${this.baseUrl}/${encodeURIComponent(slug)}/1`,
    );
    const reader = this.parseIsland<{ chapters: Chapter[] }>(html, '__NOVEL__');
    return reader.chapters || [];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = decodeURIComponent(novelPath.replace(/^\//, ''));

    const html = await this.fetchText(
      `${this.baseUrl}/${encodeURIComponent(slug)}`,
    );
    const detail = this.parseIsland<NovelDetail>(html, '__NOVEL__');

    const chapters = await this.fetchChapterList(slug);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: detail.name,
      cover: coverUrl(detail.image),
      // The site exposes the Chinese source title but never an author name, so
      // `author` stays unset rather than being filled with something invented.
      genres: detail.type || undefined,
      status: statusFrom(detail.status),
      summary: detail.description || undefined,
      chapters: chapters.map(chapter => ({
        name: chapter.title || `الفصل ${chapter.number}`,
        path: `/${encodeURIComponent(slug)}/${chapter.number}`,
        releaseTime: chapter.approvalDate || undefined,
        chapterNumber: chapter.number,
      })),
    };

    return novel;
  }

  /**
   * The reader page is `/{slug}/{number}` and carries two islands: `__CHAPTER__`
   * with the body as plain text, and `__NOVEL__` with the chapter list.
   * The text has no `<p>` tags — paragraphs are separated by blank lines, and
   * some chapters use CRLF instead of LF.
   */
  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchText(`${this.baseUrl}${chapterPath}`);

    const chapter = this.parseIsland<{ content: string }>(html, '__CHAPTER__');

    return (chapter.content || '')
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean)
      .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  // Novel paths are `/slug` and chapter paths `/slug/number` — both are
  // already site-absolute once the site is prepended, so `isNovel` adds nothing.
  resolveUrl = (path: string) => this.site + path;
}

export default new MtlaArabic();
