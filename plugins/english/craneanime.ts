import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

// Hand-built WordPress site. Every novel is a WordPress page holding the
// synopsis and a table of contents of plain links; every chapter is a post.
// Pages that are linked from a table of contents but are not chapters.
const NOT_CHAPTER =
  /^\/(?:[\w-]*gallery|early-access|support-us|library|home|about-us|contact-us|patreon-flow)\/?$/i;
const SUMMARY_LIMIT = 2500;

class CraneAnimePlugin implements Plugin.PluginBase {
  id = 'craneanime';
  name = 'CraneAnime Translation';
  icon = 'src/en/craneanime/icon.png';
  site = 'https://translation.craneanime.xyz';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  private async getText(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`CraneAnime: HTTP ${response.status} for ${url}`);
    }
    return response.text();
  }

  private clean(text: string) {
    return text.replace(/\s+/g, ' ').trim();
  }

  private pathOf(href: string) {
    const url = new URL(href, this.site);
    return url.host === new URL(this.site).host ? url.pathname : undefined;
  }

  /** Real image address of a lazy-loaded <img>. */
  private imageSrc(src?: string, lazySrc?: string) {
    const value = lazySrc || (src && !src.startsWith('data:') ? src : '');
    return value ? new URL(value, this.site).href : undefined;
  }

  /** Slugs of the story categories that really hold chapters. */
  private async storiesWithChapters(): Promise<Set<string> | undefined> {
    try {
      const response = await fetchApi(
        this.site + '/wp-json/wp/v2/categories?per_page=100&_fields=slug,count',
      );
      if (!response.ok) return undefined;
      const categories: { slug: string; count: number }[] =
        await response.json();
      return new Set(categories.filter(c => c.count > 0).map(c => c.slug));
    } catch {
      return undefined;
    }
  }

  /** Cover image of every novel shown on the Library page, by novel path. */
  private async libraryCovers(): Promise<Map<string, string>> {
    const covers = new Map<string, string>();
    try {
      const $ = loadCheerio(await this.getText(this.site + '/library/'));
      $('.entry-content figure a[href]').each((_, el) => {
        const path = this.pathOf($(el).attr('href') || '');
        const img = $(el).find('img').first();
        const cover = this.imageSrc(img.attr('src'), img.attr('data-src'));
        if (path && cover) covers.set(path, cover);
      });
    } catch {
      // Covers are optional.
    }
    return covers;
  }

  /** Every novel linked from the site's "Novels" menu. */
  private async listNovels(): Promise<Plugin.NovelItem[]> {
    const [homeHtml, withChapters, covers] = await Promise.all([
      this.getText(this.site + '/'),
      this.storiesWithChapters(),
      this.libraryCovers(),
    ]);
    const $ = loadCheerio(homeHtml);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    $('#primary-menu li.menu-item-has-children > ul.sub-menu a[href]').each(
      (_, el) => {
        const path = this.pathOf($(el).attr('href') || '');
        const name = this.clean($(el).text());
        if (!path || !name || seen.has(path)) return;
        // Menu entries for series without any published chapter are skipped.
        const slug = path.replace(/^\/|\/$/g, '').replace(/-toc$/, '');
        if (withChapters && !withChapters.has(slug)) return;
        seen.add(path);
        novels.push({ name, path, cover: covers.get(path) || defaultCover });
      },
    );
    // Novels missing from the Library page take the cover from their own page.
    await Promise.all(
      novels
        .filter(novel => novel.cover === defaultCover)
        .map(async novel => {
          try {
            const $page = loadCheerio(
              await this.getText(this.resolveUrl(novel.path)),
            );
            const img = $page('article .entry-content img').first();
            novel.cover =
              this.imageSrc(img.attr('src'), img.attr('data-src')) ||
              defaultCover;
          } catch {
            // Covers are optional.
          }
        }),
    );
    return novels;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The menu is a single, complete list.
    if (pageNo > 1) return [];
    return this.listNovels();
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site's own search returns individual chapter posts, not novels, so
    // novels are matched by name instead.
    if (pageNo > 1) return [];
    const term = searchTerm.toLowerCase().trim();
    return (await this.listNovels()).filter(novel =>
      novel.name.toLowerCase().includes(term),
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = loadCheerio(await this.getText(this.resolveUrl(novelPath)));
    const content = $('article .entry-content').first();
    if (!content.length) {
      throw new Error('CraneAnime: novel page not found.');
    }
    const ownPath = this.pathOf(this.resolveUrl(novelPath));

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: this.clean($('h1.entry-title').first().text()) || novelPath,
    };

    const img = content.find('img').first();
    novel.cover =
      this.imageSrc(img.attr('src'), img.attr('data-src')) || defaultCover;

    // Credits and synopsis are plain paragraphs above the links block.
    const summary: string[] = [];
    let reachedLinks = false;
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      const text = this.clean(paragraph.text());
      const author = /^Author\s*:\s*(.+)$/i.exec(text);
      const artist = /^Artist\s*:\s*(.+)$/i.exec(text);
      if (author) novel.author = author[1];
      else if (artist) novel.artist = artist[1];
      else if (paragraph.find('a[href]').length) reachedLinks = true;
      else if (
        !reachedLinks &&
        text &&
        !/^(?:English|Japanese|Englisth) Title\s*:/i.test(text)
      ) {
        summary.push(text);
      }
    });
    const summaryText = summary.join('\n\n');
    if (summaryText) novel.summary = summaryText.slice(0, SUMMARY_LIMIT);

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    content.find('a[href]').each((_, el) => {
      const link = $(el);
      const path = this.pathOf(link.attr('href') || '');
      const name = this.clean(link.text());
      if (
        !path ||
        !name ||
        path === '/' ||
        path === ownPath ||
        NOT_CHAPTER.test(path) ||
        seen.has(path)
      ) {
        return;
      }
      seen.add(path);
      chapters.push({ name, path });
    });

    if (!chapters.length) {
      throw new Error('CraneAnime: no chapters found for this novel.');
    }
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = loadCheerio(await this.getText(this.resolveUrl(chapterPath)));
    const content = $('article .entry-content').first();
    if (!content.length) {
      throw new Error('CraneAnime: chapter text not found.');
    }
    if (content.find('.patreon-campaign-banner').length) {
      throw new Error('CraneAnime: this chapter is Patreon-only.');
    }
    content.find('script, style, noscript, iframe, .wpulike').remove();
    content.find('.wp-post-navigation').remove();
    // Footer: "TOC" link, rule and the Early Access / Patreon advert.
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      const text = this.clean(paragraph.text());
      if (
        /^(?:TOC|Table of Contents)$/i.test(text) ||
        /\[Early Access\]/i.test(text)
      ) {
        paragraph.remove();
      } else if (!text && !paragraph.find('img').length) {
        paragraph.remove();
      }
    });
    content.find('hr').remove();
    content.find('img').each((_, el) => {
      const image = $(el);
      const src = this.imageSrc(image.attr('src'), image.attr('data-src'));
      if (src) {
        image.attr('src', src);
      }
      image
        .removeAttr('data-src')
        .removeAttr('data-srcset')
        .removeAttr('data-sizes')
        .removeAttr('srcset')
        .removeAttr('sizes');
    });
    return content.html() || '';
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new CraneAnimePlugin();
