import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const SITE_HOST = /^(?:www\.)?machineslicedbread\.xyz$/i;
// Pages that are linked from a novel page but are not chapters.
const NOT_CHAPTER = /glossary|whats-with-the-passwords/i;
const DIRECT_LINK = /^\(?\s*direct link\s*\)?$/i;
const SOCIAL_LINK = /patreon|discord|ko-fi|syosetu|amazon|twitter|x\.com/i;
const SUMMARY_LIMIT = 2500;
const MAX_REST_PAGES = 15;
const PLACEHOLDER_COVER = /notavailable/i;
// Credit lines, headings and notes that are not part of a synopsis.
const SYNOPSIS_SKIP =
  /^(?:raw|translat(?:ion|or|ed)|edit(?:or|ed)|proofread|author|autor|chapters?|table of contents|toc|note)\b/i;
// "Previous chapter | TOC | Next chapter" style lines inside chapters.
const NAV_SEPARATOR = '[\\s|‹›«»<>\\[\\]()\\-–—·]';
const NAV_WORD =
  '(?:(?:previous|prev|next|back)(?:\\s+chapter)?|toc|table of contents|index|top)';
const CHAPTER_NAVIGATION = new RegExp(
  `^${NAV_SEPARATOR}*(?:${NAV_WORD}${NAV_SEPARATOR}*)+$`,
  'i',
);

type Section = 'caught-up' | 'completed' | 'ongoing' | 'hiatus' | 'originals';
type ListedNovel = Plugin.NovelItem & { section?: Section; status?: string };

const SECTION_STATUS: Record<Section, string> = {
  'caught-up': NovelStatus.Ongoing,
  completed: NovelStatus.Completed,
  ongoing: NovelStatus.Ongoing,
  hiatus: NovelStatus.OnHiatus,
  originals: NovelStatus.Unknown,
};

const sectionFromHeading = (heading: string): Section | undefined => {
  const text = heading.toLowerCase();
  if (/hiatus|dropped/.test(text)) return 'hiatus';
  if (/completed/.test(text)) return 'completed';
  if (/ongoing/.test(text)) return 'ongoing';
  if (/caught up/.test(text)) return 'caught-up';
  if (/original/.test(text)) return 'originals';
  return undefined;
};

class MachineSlicedBread implements Plugin.PluginBase {
  id = 'machineslicedbread';
  name = 'Machine Sliced Bread';
  site = 'https://machineslicedbread.xyz';
  icon = 'src/en/machineslicedbread/icon.png';
  version = '1.0.0';

  filters = {
    section: {
      label: 'Section',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Caught up with the author', value: 'caught-up' },
        { label: 'Ongoing translations', value: 'ongoing' },
        { label: 'Completed translations', value: 'completed' },
        { label: 'Hiatus / dropped', value: 'hiatus' },
        { label: 'Originals', value: 'originals' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private async request(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw Object.assign(
        new Error(`Machine Sliced Bread: HTTP ${response.status}.`),
        { status: response.status },
      );
    }
    return response;
  }

  /**
   * Converts an href into a site-relative path (`/slug/` or `/?page_id=1`).
   * Returns undefined for links to other sites, the home page or anchors.
   */
  private sitePath(href: string | undefined): string | undefined {
    if (!href) return undefined;
    let url: URL;
    try {
      url = new URL(href, this.site);
    } catch {
      return undefined;
    }
    if (!SITE_HOST.test(url.hostname)) return undefined;
    const path = url.pathname.replace(/\/{2,}/g, '/');
    const pageId = url.searchParams.get('page_id');
    if (path === '/' && pageId) return `/?page_id=${pageId}`;
    if (path === '/' || url.search) return undefined;
    return path;
  }

  private canonical(path: string): string {
    return path.replace(/\/+$/, '').toLowerCase();
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * The home page is the whole catalogue: one list per section heading, with
   * only the series that are hosted on this site (the rest link to other sites
   * and have no chapters that can be read here).
   */
  private async catalogue(): Promise<ListedNovel[]> {
    const $ = loadCheerio(await (await this.request(this.site)).text());
    const novels: ListedNovel[] = [];
    const seen = new Set<string>();
    let section: Section | undefined;
    $('.entry-content')
      .first()
      .find('h2, h3, ul')
      .each((_, el) => {
        if ($(el).is('h2, h3')) {
          section = sectionFromHeading($(el).text()) || section;
          return;
        }
        $(el)
          .children('li')
          .each((_, item) => {
            const link = $(item).children('a[href]').first();
            const path = this.sitePath(link.attr('href'));
            const name = this.cleanText(link.text());
            if (!path || !name || seen.has(this.canonical(path))) return;
            seen.add(this.canonical(path));
            novels.push({
              name,
              path,
              cover: defaultCover,
              section,
              status: section ? SECTION_STATUS[section] : undefined,
            });
          });
      });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // The catalogue is a single page without pagination.
    if (pageNo > 1) return [];
    const wanted = filters?.section?.value;
    const novels = await this.catalogue();
    return novels
      .filter(novel => !wanted || wanted === 'all' || novel.section === wanted)
      .map(({ name, path, cover }) => ({ name, path, cover }));
  }

  /**
   * Some contents pages are not kept up to date (Half-Elves stops at chapter
   * 350 while chapter 996 is published). Newer chapters follow the same slug
   * pattern as the last listed one, so they are looked up through the site's
   * WordPress REST API and appended in order.
   */
  private async newerChapters(
    last: Plugin.ChapterItem,
  ): Promise<Plugin.ChapterItem[]> {
    const match = /^(.*-)(\d+)\/?$/.exec(
      last.path.split('/').filter(Boolean).pop() || '',
    );
    if (!match) return [];
    const [, prefix, lastNumber] = match;
    const found = new Map<number, Plugin.ChapterItem>();
    try {
      for (let page = 1; page <= MAX_REST_PAGES; page++) {
        const response = await fetchApi(
          `${this.site}/wp-json/wp/v2/pages?search=${encodeURIComponent(
            prefix.replace(/-/g, ' '),
          )}&per_page=100&page=${page}&orderby=date&order=desc&_fields=link,date,title`,
        );
        if (!response.ok) break;
        const items: {
          link: string;
          date: string;
          title: { rendered: string };
        }[] = await response.json();
        let reachedListed = false;
        for (const item of items) {
          const path = this.sitePath(item.link);
          const slug = path?.split('/').filter(Boolean).pop() || '';
          if (!path || !slug.startsWith(prefix)) continue;
          const number = /^\d+$/.test(slug.slice(prefix.length))
            ? Number(slug.slice(prefix.length))
            : NaN;
          if (isNaN(number)) continue;
          if (number <= Number(lastNumber)) {
            reachedListed = true;
            continue;
          }
          found.set(number, {
            // "Half elves fall in love chapter 996" -> "chapter 996"
            name:
              this.cleanText(loadCheerio(item.title?.rendered || '').text())
                .replace(/^.*?(?=chapter\s+\d)/i, '')
                .replace(/^chapter/, 'Chapter') || `Chapter ${number}`,
            path,
            chapterNumber: number,
            releaseTime: item.date
              ? new Date(item.date + 'Z').toISOString()
              : undefined,
          });
        }
        if (reachedListed || items.length < 100) break;
      }
    } catch {
      return [];
    }
    return Array.from(found.keys())
      .sort((a, b) => a - b)
      .map(number => found.get(number)!);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = loadCheerio(
      await (await this.request(this.resolveUrl(novelPath))).text(),
    );
    const content = $('.entry-content').first();
    content.find('script, style, .sharedaddy, #jp-post-flair').remove();
    content.find('br').replaceWith('\n');

    const name =
      this.cleanText($('h1.entry-title').first().text()) || 'Untitled';

    const selfPath = this.canonical(this.sitePath(novelPath) || novelPath);
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>([selfPath]);
    content.find('a[href]').each((_, link) => {
      const path = this.sitePath($(link).attr('href'));
      if (!path || NOT_CHAPTER.test(path)) return;
      const key = this.canonical(path);
      if (seen.has(key)) return;
      let chapterName = this.cleanText($(link).text());
      // Some lists pair a title link (to an ad redirect) with a "(Direct Link)"
      // to the chapter itself: the title is the previous link.
      if (!chapterName || DIRECT_LINK.test(chapterName)) {
        chapterName = this.cleanText($(link).prevAll('a').first().text());
      }
      if (!chapterName || NOT_CHAPTER.test(chapterName)) return;
      seen.add(key);
      const number = /^(?:chapter\s+)?(\d+(?:\.\d+)?)\b/i.exec(
        chapterName,
      )?.[1];
      chapters.push({
        name: chapterName,
        path,
        chapterNumber: number ? Number(number) : undefined,
      });
    });

    if (chapters.length) {
      const listed = new Set(
        chapters.map(chapter => this.canonical(chapter.path)),
      );
      for (const chapter of await this.newerChapters(
        chapters[chapters.length - 1],
      )) {
        if (!listed.has(this.canonical(chapter.path))) chapters.push(chapter);
      }
    }

    // A few series are a single long page of text with updates appended to it.
    const singlePage =
      !chapters.length &&
      this.cleanText(content.text()).length > 8000 &&
      content
        .find('a[href]')
        .filter((_, link) => !SOCIAL_LINK.test($(link).attr('href') || ''))
        .length <= 2;
    if (singlePage) {
      chapters.push({ name, path: novelPath });
    }
    if (!chapters.length) {
      throw new Error('Machine Sliced Bread: no chapters were found.');
    }

    // The synopsis is the plain text that comes before the first chapter link.
    const chapterPaths = new Set(chapters.map(chapter => chapter.path));
    const lines: string[] = [];
    for (const el of content.children('p, div').toArray()) {
      const hasChapterLink = $(el)
        .find('a[href]')
        .toArray()
        .some(link => chapterPaths.has(this.sitePath($(link).attr('href'))!));
      if (hasChapterLink) break;
      if ($(el).find('a[href]').length) continue;
      const line = this.cleanText($(el).text());
      if (!line || SYNOPSIS_SKIP.test(line)) continue;
      lines.push(line);
    }
    let summary = '';
    for (const line of singlePage ? [] : lines) {
      if (summary && summary.length + line.length > SUMMARY_LIMIT) break;
      summary += (summary ? '\n\n' : '') + line;
    }

    const author = content
      .text()
      .split('\n')
      .map(line => /^\s*Aut(?:h)?or\s*:\s*(.+?)\s*$/i.exec(line)?.[1])
      .find(Boolean);

    const coverSrc = content
      .find('img[src]')
      .toArray()
      .map(img => $(img).attr('src')!)
      .find(src => !PLACEHOLDER_COVER.test(src) && !src.startsWith('data:'));
    const cover = coverSrc ? new URL(coverSrc, this.site).href : defaultCover;

    const listed = await this.catalogue()
      .then(novels =>
        novels.find(novel => this.canonical(novel.path) === selfPath),
      )
      .catch(() => undefined);

    return {
      path: novelPath,
      name,
      cover,
      author,
      status: listed?.status,
      summary: summary || undefined,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = loadCheerio(
      await (await this.request(this.resolveUrl(chapterPath))).text(),
    );
    if ($('form.post-password-form').length) {
      throw new Error(
        'Machine Sliced Bread: this chapter is password protected. See "What\'s with the Passwords?" on the site.',
      );
    }

    const content = $('.entry-content').first();
    content
      .find(
        'script, style, noscript, iframe, form, nav, .tap-nav, .sharedaddy, #jp-post-flair, .wpcnt, .adsbygoogle, .post-navigation, .nav-links',
      )
      .remove();
    // Drop "Previous | TOC | Next" lines.
    content.find('p, div').each((_, el) => {
      const text = this.cleanText($(el).text());
      if (text && text.length < 60 && CHAPTER_NAVIGATION.test(text)) {
        $(el).remove();
      }
    });

    const chapter = content.html()?.trim() || '';
    if (this.cleanText(loadCheerio(chapter).text()).length < 100) {
      throw new Error('Machine Sliced Bread: no readable chapter text found.');
    }
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site's own search only finds individual chapter posts, so series are
    // matched against the catalogue's titles instead (a single page).
    const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length || pageNo > 1) return [];
    const novels = await this.catalogue();
    return novels
      .filter(novel => {
        const name = novel.name.toLowerCase();
        return tokens.every(token => name.includes(token));
      })
      .map(({ name, path, cover }) => ({ name, path, cover }));
  }

  resolveUrl = (path: string) => new URL(path, this.site).href;
}

export default new MachineSlicedBread();
