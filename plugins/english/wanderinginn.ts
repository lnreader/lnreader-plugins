import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';

const SITE_HOST = /^(?:www\.)?wanderinginn\.com$/i;
const NOVEL_PATH = '/table-of-contents/';
const NOVEL_NAME = 'The Wandering Inn';
const NOVEL_AUTHOR = 'pirateaba';
const NOVEL_COVER =
  'https://wanderinginn.com/wp-content/uploads/2026/03/WanderingInn_Series_rev3-683x1024.jpg';
// Chapter addresses start with the publication date: /2017/03/03/rw1-00/
const DATE_IN_PATH = /^\/(\d{4})\/(\d{2})\/(\d{2})\//;
// "Next Chapter" / "Previous Chapter" links the author appends to each post.
const CHAPTER_NAVIGATION = /^\s*(?:next|previous|prev)\s+chapter\s*$/i;

class WanderingInn implements Plugin.PluginBase {
  id = 'wanderinginn';
  name = 'The Wandering Inn';
  icon = 'src/en/wanderinginn/icon.png';
  site = 'https://wanderinginn.com';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  private async loadPage(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`The Wandering Inn: HTTP ${response.status}.`);
    }
    return loadCheerio(await response.text());
  }

  /** Site-relative path of a link into this site, or undefined for others. */
  private pathOf(href: string | undefined): string | undefined {
    if (!href) return undefined;
    try {
      const url = new URL(href, this.site);
      if (!SITE_HOST.test(url.hostname)) return undefined;
      return url.pathname;
    } catch {
      return undefined;
    }
  }

  private novelItem(): Plugin.NovelItem {
    return { name: NOVEL_NAME, path: NOVEL_PATH, cover: NOVEL_COVER };
  }

  // The site publishes a single serial, so the catalogue has one entry.
  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    return pageNo === 1 ? [this.novelItem()] : [];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.loadPage(this.resolveUrl(novelPath));

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    $('.chapter-entry .body-web a').each((_, el) => {
      const anchor = $(el);
      const path = this.pathOf(anchor.attr('href'));
      const name = anchor.text().replace(/\s+/g, ' ').trim();
      if (!path || !name || seen.has(path)) return;
      seen.add(path);
      const date = DATE_IN_PATH.exec(path);
      chapters.push({
        name,
        path,
        chapterNumber: chapters.length + 1,
        releaseTime: date ? `${date[1]}-${date[2]}-${date[3]}` : undefined,
      });
    });
    if (!chapters.length) {
      throw new Error('The Wandering Inn: no chapters found.');
    }

    return {
      path: NOVEL_PATH,
      name: NOVEL_NAME,
      cover: NOVEL_COVER,
      author: NOVEL_AUTHOR,
      status: NovelStatus.Ongoing,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.loadPage(this.resolveUrl(chapterPath));
    const content = $('#reader-content article.twi-article').first();
    if (!content.length) {
      if ($('.patreon-protected-post').length) {
        throw new Error(
          'The Wandering Inn: this chapter is Patreon-exclusive and is not available without a Patreon subscription.',
        );
      }
      throw new Error('The Wandering Inn: no readable chapter text found.');
    }
    content.find('script,style,iframe,noscript').remove();
    // Drop the trailing divider and navigation links.
    content.find('a').each((_, el) => {
      const anchor = $(el);
      if (CHAPTER_NAVIGATION.test(anchor.text())) {
        const paragraph = anchor.closest('p');
        (paragraph.length ? paragraph : anchor).remove();
      }
    });
    content.find('hr').last().remove();
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      if (!paragraph.find('img').length && !paragraph.text().trim())
        paragraph.remove();
    });
    const chapter = content.html() || '';
    if (!content.find('img').length && content.text().trim().length < 200) {
      throw new Error('The Wandering Inn: no readable chapter text found.');
    }
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (pageNo !== 1 || !terms.length) return [];
    // There is only one novel, so match its title.
    const title = NOVEL_NAME.toLowerCase();
    return terms.every(term => title.includes(term)) ? [this.novelItem()] : [];
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (!SITE_HOST.test(url.hostname)) {
      throw new Error('The Wandering Inn: invalid page address.');
    }
    return `${this.site}${url.pathname}${url.search}`;
  }
}

export default new WanderingInn();
