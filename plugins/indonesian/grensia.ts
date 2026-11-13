import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

const BASE = 'https://grensia.blogspot.com';
const SEARCH_PAGE_SIZE = 150;
const LIST_LABEL = `${BASE}/search/label/novel?max-results=${SEARCH_PAGE_SIZE}`;
const MAX_PAGES = 30;
const LIST_PAGES = 3;

type Post = {
  title: string;
  description?: string;
  url: string;
  published: string;
  cover?: string;
};

type Landing = {
  name: string;
  url: string;
  cover?: string;
};

const normalize = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '');

// Blogger chapter titles look like "Series V4 Chapter 12 Part 3", so the series
// name is everything before the volume, chapter, part, or epilogue marker.
const seriesName = (title: string) =>
  title
    .replace(/^Novel\s+/i, '')
    .replace(/\s*\((LN|WN)\)/gi, '')
    .replace(/\s+(Bahasa\s+)?Indonesia\b.*$/i, '')
    .replace(
      /\s+(V\d+|Vol\.?\s*\d+|Volume\s*\d+|Chapter\b|Ch\.?\s*\d|Epilog|Epilogue|Prolog|Prologue|Kata Penutup|Part\s*\d|Side Story|Extra|Bonus|\d+(\.\d+)?$|-\s*\d).*$/i,
      '',
    )
    .replace(/[\s\-–:]+$/, '')
    .trim();

// The "List Novel" index posts are titled "Novel <name> (LN) Indonesia" etc.
const landingName = (title: string) =>
  title
    .replace(/^Novel\s+/i, '')
    .replace(/\s*\((LN|WN)\)/gi, '')
    .replace(/\s+(Bahasa\s+)?Indonesia\b.*$/i, '')
    .replace(/\s+Bahasa.*$/i, '')
    .trim();

// Some series headlines use a romanized alias ("Isekai wa Heiwa deshita Chapter 1"),
// but the structured description repeats the catalog title ("Novel <name> Indonesia").
const descriptionSeries = (description?: string) => {
  const match = /^Novel\s+(.+?)\s+Indonesia\b/i.exec(description || '');
  return match ? match[1].trim() : undefined;
};

// A post belongs to every series its headline or description names.
const seriesNames = (post: Post) => {
  const names = [seriesName(post.title)];
  const fromDescription = descriptionSeries(post.description);
  if (fromDescription) names.push(fromDescription);
  return names;
};

// Some headlines drop words from the catalog title, but the description begins with it.
const belongsTo = (post: Post, key: string) => {
  if (seriesNames(post).some(name => normalize(name) === key)) return true;
  const description = normalize(decodeEntities(post.description || ''));
  return description.replace(/^novel/, '').indexOf(key) === 0;
};

// Some posts point at Blogger's generic "Shoebox" logo (base64 "U2hvZWJveA")
// instead of artwork, so those are treated as having no cover.
const usableCover = (url?: string) =>
  url && url.indexOf('U2hvZWJveA') < 0 ? url : undefined;

// Headlines in the structured data keep HTML entities such as &#9733; for ★.
const decodeEntities = (text: string) => parseHTML(`<p>${text}</p>`).text();

const chapterNumberOf = (title: string) => {
  const match = /Chapter\s*(\d+(?:\.\d+)?)/i.exec(title);
  return match ? Number(match[1]) : undefined;
};

/**
 * Reads the post cards on a Blogger listing or search page. Each card carries a
 * JSON-LD block with the headline, publish date, canonical URL and image.
 * The "Older Posts" link is followed by the caller to reach every page.
 */
async function readPage(url: string) {
  const body = await (await fetchApi(url)).text();
  const $ = parseHTML(body);
  const posts: Post[] = [];

  $("script[type='application/ld+json']").each((i, el) => {
    try {
      const data = JSON.parse($(el).html() || '{}');
      const link = data.mainEntityOfPage && data.mainEntityOfPage['@id'];
      if (!data.headline || !link) return;
      posts.push({
        title: decodeEntities(String(data.headline)).trim(),
        description: data.description && String(data.description),
        url: link,
        published: data.datePublished,
        cover: usableCover(data.image && data.image.url),
      });
    } catch (error) {
      // Skip malformed structured data rather than failing the whole page.
    }
  });

  const older = $('a.blog-pager-older-link').attr('href');
  return { posts, next: older };
}

async function readAll(startUrl: string, maxPages: number) {
  const posts: Post[] = [];
  let url: string | undefined = startUrl;
  for (let i = 0; url && i < maxPages; i++) {
    const page = await readPage(url);
    posts.push(...page.posts);
    url = page.next;
  }
  return posts;
}

class GrensiaPlugin implements Plugin.PluginBase {
  id = 'grensia';
  name = 'Grensia';
  icon = 'src/id/grensia/icon.png';
  site = `${BASE}/`;
  version = '1.0.0';
  filters = undefined;

  private landingCache?: Promise<Landing[]>;

  // The site's own "List Novel" index: one post per series.
  private getLandings() {
    if (!this.landingCache) {
      this.landingCache = readAll(LIST_LABEL, LIST_PAGES)
        .then(posts => {
          const landings: Landing[] = [];
          posts.forEach(post => {
            if (post.url.indexOf('novel-translate-indonesia') >= 0) return;
            const name = landingName(post.title);
            if (name) landings.push({ name, url: post.url, cover: post.cover });
          });
          return landings;
        })
        .catch(error => {
          // Let the next call retry instead of caching a failed request.
          this.landingCache = undefined;
          throw error;
        });
    }
    return this.landingCache;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    const landings = await this.getLandings();
    const seen: Record<string, boolean> = {};
    const novels: Plugin.NovelItem[] = [];
    landings.forEach(landing => {
      const key = normalize(landing.name);
      if (seen[key]) return;
      seen[key] = true;
      novels.push({
        name: landing.name,
        path: encodeURIComponent(landing.name),
        cover: landing.cover || defaultCover,
      });
    });
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const name = decodeURIComponent(novelPath);
    const landings = await this.getLandings();
    const landing = landings.find(
      item => normalize(item.name) === normalize(name),
    );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name,
    };

    // Chapters are every post whose series name matches this novel's name.
    // The reader's search is used because it returns the full history, unlike
    // the Atom feed, which truncates long label runs.
    const posts = await readAll(
      `${BASE}/search?q=${encodeURIComponent(name)}&max-results=${SEARCH_PAGE_SIZE}`,
      MAX_PAGES,
    );
    const key = normalize(name);
    // The List Novel posts share the series name but are index pages, not chapters.
    const indexUrls = landings.map(item => item.url);
    const matching = posts.filter(
      post => indexUrls.indexOf(post.url) < 0 && belongsTo(post, key),
    );
    // Oldest first; posts published in the same minute keep chapter order.
    matching.sort(
      (a, b) =>
        Date.parse(a.published) - Date.parse(b.published) ||
        (chapterNumberOf(a.title) || 0) - (chapterNumberOf(b.title) || 0),
    );

    const withCover = matching.find(post => !!post.cover);
    novel.cover =
      (landing && landing.cover) ||
      (withCover && withCover.cover) ||
      defaultCover;

    novel.chapters = matching.map(post => ({
      name: post.title,
      path: post.url.replace(BASE, ''),
      releaseTime: new Date(post.published).toISOString(),
      chapterNumber: chapterNumberOf(post.title),
    }));

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await (await fetchApi(BASE + chapterPath)).text();
    const $ = parseHTML(body);
    $(
      '.post-body script, .post-body style, .post-body ins, .post-body iframe, .post-body a[name="more"]',
    ).remove();
    return $('.post-body').first().html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    const posts = await readAll(
      `${BASE}/search?q=${encodeURIComponent(searchTerm)}&max-results=${SEARCH_PAGE_SIZE}`,
      1,
    );
    const landings = await this.getLandings();
    const term = normalize(searchTerm);
    const seen: Record<string, boolean> = {};
    const novels: Plugin.NovelItem[] = [];

    const indexUrls = landings.map(item => item.url);
    posts.forEach(post => {
      if (indexUrls.indexOf(post.url) >= 0) return;
      seriesNames(post).forEach(name => {
        const key = normalize(name);
        if (!key || seen[key] || key.indexOf(term) < 0) return;
        seen[key] = true;

        // Prefer the series' own index cover, then the first chapter's image.
        const landing = landings.find(item => normalize(item.name) === key);
        novels.push({
          name,
          path: encodeURIComponent(name),
          cover: (landing && landing.cover) || post.cover || defaultCover,
        });
      });
    });

    return novels;
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    isNovel ? `${BASE}/search?q=${path}` : BASE + path;
}

export default new GrensiaPlugin();
