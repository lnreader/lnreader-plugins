import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

// ─── WP REST Types ────────────────────────────────────────────────────────────

type WPCategory = {
  id: number;
  name: string;
  slug: string;
  count: number;
  description: string; // contains <img src="cover-url" />
  link: string;
};

type WPPost = {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt?: { rendered: string };
  categories: number[];
  date: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 18;

/** Extract the pathname from a full URL, e.g. "/novel-slug/" */
function toPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Parse the cover image URL out of a WP category description field. */
function coverFromDesc(description: string): string {
  const m = description.match(/src=["']([^"'>]+)/);
  return m ? m[1] : defaultCover;
}

/** Map a WP category to a NovelItem. */
function catToNovel(cat: WPCategory): Plugin.NovelItem {
  return {
    name: cat.name,
    path: toPath(cat.link),
    cover: coverFromDesc(cat.description),
  };
}

/** Fetch categories from WP REST API with the given query params. */
async function fetchCategories(
  rest: string,
  params: Record<string, string | number>,
): Promise<WPCategory[]> {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return fetchApi(`${rest}/categories?${qs}`).then(r => r.json());
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

class Novel7sPlugin implements Plugin.PluginBase {
  id = 'novel7s';
  name = 'Novel7s';
  icon = 'src/en/novel7s/icon.png';
  site = 'https://novel7s.com';
  rest = `${this.site}/wp-json/wp/v2`;
  version = '1.0.0';

  filters = {
    sort: {
      label: 'Sort by',
      value: 'count',
      options: [
        { label: 'Most chapters (popular)', value: 'count' },
        { label: 'Trending (views)', value: 'trending' },
        { label: 'Latest uploaded', value: 'id' },
        { label: 'A → Z', value: 'name_asc' },
        { label: 'Z → A', value: 'name_desc' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  // ── popularNovels ───────────────────────────────────────────────────────────

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels ? 'id' : (filters?.sort?.value ?? 'count');

    // "Trending" still relies on the custom admin-ajax endpoint (view count based)
    if (sort === 'trending') {
      const offset = (pageNo - 1) * PAGE_SIZE;
      const data = await fetchApi(
        `${this.site}/wp-admin/admin-ajax.php?action=n7_load_more&type=trending&offset=${offset}`,
      ).then(r => r.json());
      return (data.items ?? []).map(
        (item: { name: string; url: string; cover: string }) => ({
          name: item.name,
          path: toPath(item.url),
          cover: item.cover || defaultCover,
        }),
      );
    }

    // A→Z / Z→A use orderby=name; count and id are always desc (most/newest first).
    const isAlpha = sort === 'name_asc' || sort === 'name_desc';
    const orderby = isAlpha ? 'name' : sort;
    const finalOrder = sort === 'name_asc' ? 'asc' : 'desc';

    const cats = await fetchCategories(this.rest, {
      orderby,
      order: finalOrder,
      per_page: PAGE_SIZE,
      page: pageNo,
      hide_empty: 1,
      _fields: 'id,name,slug,count,description,link',
    });

    return cats.map(catToNovel);
  }

  // ── parseNovel ──────────────────────────────────────────────────────────────

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.replace(/^\/|\/$/g, '');

    // Fetch category metadata: name, cover, chapter count, and category ID
    const cats = await fetchCategories(this.rest, {
      slug,
      _fields: 'id,name,count,description',
    });

    if (!cats || cats.length === 0) {
      return { path: novelPath, name: slug };
    }

    const cat = cats[0];

    // Now fetch all chapters. WP REST max per_page = 100.
    // Use X-WP-TotalPages to determine if we need more requests.
    const chaptersUrl = `${this.rest}/posts?categories=${cat.id}&orderby=date&order=asc&per_page=100&_fields=id,title,slug,link,date,excerpt`;
    const firstRes = await fetchApi(chaptersUrl);
    const totalPages = parseInt(
      firstRes.headers.get('X-WP-TotalPages') || '1',
      10,
    );
    const firstChapters: WPPost[] = await firstRes.json();

    const allPosts: WPPost[] = [...firstChapters];

    // Fetch remaining pages in parallel if needed
    if (totalPages > 1) {
      const extra = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          fetchApi(`${chaptersUrl}&page=${i + 2}`).then(
            r => r.json() as Promise<WPPost[]>,
          ),
        ),
      );
      extra.forEach(page => allPosts.push(...page));
    }

    const chapters: Plugin.ChapterItem[] = allPosts.map((post, i) => {
      const title = post.title.rendered;
      const numMatch = title.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      return {
        name: numMatch ? `Chapter ${numMatch[1]}` : title,
        path: toPath(post.link),
        chapterNumber: numMatch ? parseFloat(numMatch[1]) : i + 1,
        releaseTime: post.date,
      };
    });

    let summary = '';
    if (allPosts.length > 0 && allPosts[0].excerpt) {
      summary = loadCheerio(allPosts[0].excerpt.rendered).text().trim();
      // Remove chapter title repetition from start of summary if present
      summary = summary
        .replace(/^.*?Chapter\s+\d+(?:\.\d+)?(?:[:-]|\s)+/i, '')
        .trim();
    }

    return {
      path: novelPath,
      name: cat.name,
      cover: coverFromDesc(cat.description),
      author: 'Novel7s',
      summary,
      status: NovelStatus.Completed,
      chapters,
    };
  }

  // ── parseChapter ────────────────────────────────────────────────────────────

  async parseChapter(chapterPath: string): Promise<string> {
    const slug = chapterPath.replace(/^\/|\/$/g, '');

    const posts: WPPost[] = await fetchApi(
      `${this.rest}/posts?slug=${slug}&_fields=content`,
    ).then(r => r.json());

    if (!posts || posts.length === 0) return '';

    const rawHtml = posts[0].content.rendered;
    const $ = loadCheerio(rawHtml);

    // Remove the first <p> that only contains <strong> (repeated chapter title)
    $('p:has(strong)').first().remove();

    // Merge broken paragraphs (translated from the site's own JS fix)
    const paragraphs = $('p').toArray();
    for (let i = 0; i < paragraphs.length - 1; i++) {
      const current = paragraphs[i];
      const next = paragraphs[i + 1];

      if ($(current).next()[0] !== next) continue;

      const text = $(current).text().trim();
      if (!text) continue;

      // If it ends like a complete sentence, keep separate
      if (/[.!?…]["'"']?$/.test(text)) continue;

      $(current).append(' ');
      $(current).append($(next).contents());
      $(next).remove();
      paragraphs.splice(i + 1, 1);
      i--;
    }

    return $.html();
  }

  // ── searchNovels ────────────────────────────────────────────────────────────

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // Guard: empty term would return the default category list, not search results.
    if (!searchTerm.trim()) return [];

    // WP REST categories?search= searches novel names directly, returns covers.
    const cats = await fetchCategories(this.rest, {
      search: searchTerm.trim(),
      per_page: PAGE_SIZE,
      page: pageNo,
      hide_empty: 1,
      _fields: 'id,name,slug,count,description,link',
    });

    return cats.map(catToNovel);
  }

  // ── resolveUrl ──────────────────────────────────────────────────────────────

  resolveUrl = (path: string): string => this.site + path;
}

export default new Novel7sPlugin();
