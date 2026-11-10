import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio, CheerioAPI } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

// Hand-written WordPress.com blog. Every series is a post category and every
// chapter is a post in that category. The site has no series catalogue of its
// own that covers every novel, so the sidebar category list is the catalogue.
const NON_NOVEL_CATEGORIES = /^\/category\/news\/?$/;
const MAX_ARCHIVE_PAGES = 50;
// Upper bound on series pages fetched while looking for a novel's cover.
const MAX_SERIES_PAGES = 12;

class RinkageTranslationPlugin implements Plugin.PluginBase {
  id = 'rinkagetranslation';
  name = 'RinkageTranslation';
  icon = 'src/en/rinkagetranslation/icon.png';
  site = 'https://rinkagetranslation.com';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  private async getHtml(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`RinkageTranslation: HTTP ${response.status} for ${url}`);
    }
    return response.text();
  }

  private clean(text: string) {
    return text.replace(/\s+/g, ' ').trim();
  }

  private pathOf(href: string) {
    return new URL(href, this.site).pathname;
  }

  /** Every translated series, taken from the sidebar category widget. */
  private async listNovels(): Promise<Plugin.NovelItem[]> {
    const $ = loadCheerio(await this.getHtml(this.site + '/'));
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    $('.widget_categories li.cat-item > a').each((_, el) => {
      const href = $(el).attr('href');
      const name = this.clean($(el).text());
      if (!href || !name) return;
      const path = this.pathOf(href);
      if (NON_NOVEL_CATEGORIES.test(path) || seen.has(path)) return;
      seen.add(path);
      novels.push({ name, path, cover: defaultCover });
    });
    return novels;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The category list is a single page.
    if (pageNo > 1) return [];
    return this.listNovels();
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site's own search returns individual chapter posts, not series, so
    // series are matched by name instead.
    if (pageNo > 1) return [];
    const term = searchTerm.toLowerCase().trim();
    return (await this.listNovels()).filter(novel =>
      novel.name.toLowerCase().includes(term),
    );
  }

  /** "Series (WN) Chapter 12" -> "Chapter 12"; other titles are kept. */
  private chapterName(title: string) {
    const name = this.clean(title);
    const marker = /\((?:WN|LN)\)\s*/i.exec(name);
    const rest = marker ? name.slice(marker.index + marker[0].length) : name;
    return rest.replace(/^[\s–—-]+/, '') || name;
  }

  /** Series pages linked from the site menu (illustration/character pages skipped). */
  private menuLinks($: CheerioAPI) {
    const links = new Set<string>();
    $('#site-navigation a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (!href.startsWith(this.site) || /character|illustration/i.test(href)) {
        return;
      }
      links.add(href);
    });
    return Array.from(links);
  }

  /**
   * Categories carry no artwork, but the hand-written series page of the same
   * novel does. A series page is recognised by linking to the category's
   * chapters. Failures only cost the cover, never the chapter list.
   */
  private async findCover(candidates: string[], chapterPaths: Set<string>) {
    for (const link of candidates.slice(0, MAX_SERIES_PAGES)) {
      try {
        const $ = loadCheerio(await this.getHtml(link));
        const content = $('.entry-content').first();
        const linksToChapter = content
          .find('a[href]')
          .toArray()
          .some(a => chapterPaths.has(this.pathOf($(a).attr('href') || '')));
        if (!linksToChapter) continue;
        const src = content.find('img').first().attr('src');
        return src ? new URL(src, this.site).href.split('?')[0] : defaultCover;
      } catch {
        // Try the next candidate.
      }
    }
    return defaultCover;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    let name = '';
    let seriesLinks: string[] = [];
    let url: string | undefined = this.resolveUrl(novelPath);

    // The archive lists newest posts first and links to the next older page.
    for (let page = 0; url && page < MAX_ARCHIVE_PAGES; page++) {
      const $ = loadCheerio(await this.getHtml(url));
      if (!name) {
        seriesLinks = this.menuLinks($);
        name = this.clean($('.page-title, h1.archive-title').first().text())
          .replace(/^Category:\s*/i, '')
          .trim();
      }
      $('article').each((_, article) => {
        const link = $(article).find('.entry-title a').first();
        const href = link.attr('href');
        if (!href) return;
        const path = this.pathOf(href);
        if (seen.has(path)) return;
        seen.add(path);
        const published = $(article)
          .find('time.entry-date.published')
          .first()
          .attr('datetime');
        chapters.push({
          name: this.chapterName(link.text()),
          path,
          releaseTime: published ? new Date(published).toISOString() : null,
        });
      });
      const older = $('.posts-navigation .nav-previous a').first().attr('href');
      url = older ? new URL(older, this.site).href : undefined;
    }

    if (!chapters.length) {
      throw new Error('RinkageTranslation: no chapters found for this series.');
    }

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: name || novelPath,
      cover: await this.findCover(seriesLinks, seen),
      // Archive pages are newest first; the reader wants oldest first.
      chapters: chapters.reverse(),
    };
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = loadCheerio(await this.getHtml(this.resolveUrl(chapterPath)));
    const content = $('article .entry-content').first();
    if (!content.length) {
      throw new Error('RinkageTranslation: chapter text not found.');
    }
    content
      .find(
        'script, style, noscript, iframe, .sharedaddy, #jp-post-flair, .wpcnt, [id^="atatags"], span[id^="more-"], #wordads-inline-marker',
      )
      .remove();
    // Previous / Main Page / Next Chapter navigation row.
    content.find('p, div').each((_, el) => {
      const text = this.clean($(el).text());
      if (
        /^(?:Previous Chapter\s*\|\s*)?Main Page(?:\s*\|\s*Next Chapter)?$/i.test(
          text,
        )
      ) {
        $(el).remove();
      }
    });
    return content.html() || '';
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new RinkageTranslationPlugin();
