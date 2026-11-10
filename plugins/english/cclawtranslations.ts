import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type Section = 'ongoing' | 'completed';
type ListedNovel = Plugin.NovelItem & { section: Section };

// Chapters are dated posts: /2023/07/11/<slug>/
const CHAPTER_PATH = /^\/(\d{4})\/(\d{2})\/(\d{2})\/[^/]+\/?$/;
const SECTIONS: { section: Section; path: string }[] = [
  { section: 'ongoing', path: '/ongoing-projects/' },
  { section: 'completed', path: '/completed-projects/' },
];

/**
 * CClaw Translations (cclawtranslations.home.blog) is a WordPress.com blog.
 * Two catalogue pages ("Ongoing Projects", "Completed Projects") list every
 * novel with a cover and a link to its own table-of-contents page. That page
 * groups dated chapter posts under "Volume N" headings. Neither the catalogue
 * nor the table of contents has a synopsis, so none is returned.
 */
class CClawTranslationsPlugin implements Plugin.PluginBase {
  id = 'cclawtranslations';
  name = 'CClaw Translations';
  icon = 'src/en/cclawtranslations/icon.png';
  site = 'https://cclawtranslations.home.blog';
  version = '1.0.0';

  filters = {
    section: {
      label: 'Section',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing projects', value: 'ongoing' },
        { label: 'Completed projects', value: 'completed' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private async getHtml(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) {
      // Carry the status so tooling can tell a refused request from a
      // genuine parsing failure.
      throw Object.assign(
        new Error(`CClaw Translations: HTTP ${res.status} for ${url}`),
        { status: res.status },
      );
    }
    return res.text();
  }

  private clean(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /** Site-relative path with a trailing slash; undefined for other hosts. */
  private sitePath(href: string | undefined): string | undefined {
    if (!href) return undefined;
    let url: URL;
    try {
      url = new URL(href, this.site);
    } catch {
      return undefined;
    }
    if (url.hostname.replace(/^www\./, '') !== 'cclawtranslations.home.blog') {
      return undefined;
    }
    const path = url.pathname.replace(/\/{2,}/g, '/');
    return path.charAt(path.length - 1) === '/' ? path : path + '/';
  }

  private coverOf(img: ReturnType<ReturnType<typeof loadCheerio>>): string {
    const src = img.attr('data-orig-file') || img.attr('src');
    return src ? src.split('?')[0] : defaultCover;
  }

  private async listSection(
    section: Section,
    path: string,
  ): Promise<ListedNovel[]> {
    const $ = loadCheerio(await this.getHtml(this.site + path));
    const novels: ListedNovel[] = [];
    const seen = new Set<string>();
    // Each novel is an <h2> holding the ToC link, followed by its cover.
    $('.entry-content h2').each((_, el) => {
      const link = $(el).find('a').first();
      const novelPath = this.sitePath(link.attr('href'));
      const name = this.clean(link.text());
      if (!novelPath || !name || seen.has(novelPath)) return;
      seen.add(novelPath);
      const img = $(el).nextUntil('h2').find('img').first();
      novels.push({
        name,
        path: novelPath,
        cover: img.length ? this.coverOf(img) : defaultCover,
        section,
      });
    });
    return novels;
  }

  private async catalogue(
    wanted: string | undefined,
  ): Promise<Plugin.NovelItem[]> {
    const novels: ListedNovel[] = [];
    for (const { section, path } of SECTIONS) {
      if (wanted && wanted !== 'all' && wanted !== section) continue;
      novels.push(...(await this.listSection(section, path)));
    }
    return novels.map(({ name, path, cover }) => ({ name, path, cover }));
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // The catalogue pages are not paginated.
    if (pageNo > 1) return [];
    return this.catalogue(filters?.section?.value);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    // The site's own search covers posts, not novels, so filter the catalogue.
    const needle = this.clean(searchTerm).toLowerCase();
    const novels = await this.catalogue('all');
    return novels.filter(
      novel => this.clean(novel.name).toLowerCase().indexOf(needle) !== -1,
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = this.sitePath(novelPath);
    if (!path)
      throw new Error(`CClaw Translations: bad novel path ${novelPath}`);
    const $ = loadCheerio(await this.getHtml(this.site + path));
    const content = $('.entry-content').first();

    const title = this.clean($('h1.entry-title').first().text());
    const novel: Plugin.SourceNovel = {
      path,
      name: title.replace(/\s*\(?\bToC\b\)?\s*$/i, '') || title,
      cover: defaultCover,
      chapters: [],
    };

    const img = content.find('img').first();
    if (img.length) novel.cover = this.coverOf(img);

    // Walk headings and links in document order so each chapter knows its
    // volume.
    let volume = '';
    const seen = new Set<string>();
    content.find('h2, h3, a').each((_, el) => {
      if (el.tagName !== 'a') {
        const heading = this.clean($(el).text());
        if (/^(?:volume|vol\.?|book|part|arc)\b/i.test(heading)) {
          volume = heading;
        }
        return;
      }
      const href = this.sitePath($(el).attr('href'));
      const date = href && href.match(CHAPTER_PATH);
      // Some entries are split over several anchors to the same post
      // ("Epi" + "logue"), so name them after the whole line.
      const line = $(el).closest('p');
      const hrefs = new Set(
        line
          .find('a')
          .map((_, a) => this.sitePath($(a).attr('href')))
          .get(),
      );
      const label = this.clean(
        (hrefs.size === 1 ? line : $(el)).text() || $(el).text(),
      );
      if (!href || !date || !label || seen.has(href)) return;
      seen.add(href);
      novel.chapters!.push({
        name: volume ? `${volume} - ${label}` : label,
        path: href,
        releaseTime: `${date[1]}-${date[2]}-${date[3]}`,
        chapterNumber: novel.chapters!.length + 1,
      });
    });

    const completed = await this.isCompleted(path);
    novel.status = completed ? NovelStatus.Completed : NovelStatus.Ongoing;
    return novel;
  }

  private async isCompleted(path: string): Promise<boolean> {
    try {
      const done = await this.listSection('completed', '/completed-projects/');
      return done.some(novel => novel.path === path);
    } catch {
      return false;
    }
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const path = this.sitePath(chapterPath);
    if (!path)
      throw new Error(`CClaw Translations: bad chapter ${chapterPath}`);
    const $ = loadCheerio(await this.getHtml(this.site + path));
    const content = $('.entry-content').first();
    content
      .find(
        'script, style, .sharedaddy, #jp-post-flair, .jp-relatedposts, #wordads-inline-marker',
      )
      .remove();
    const html = content.html()?.trim();
    if (!html) {
      throw new Error(`CClaw Translations: no chapter text at ${chapterPath}`);
    }
    return html;
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new CClawTranslationsPlugin();
