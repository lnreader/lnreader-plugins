import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

const SITE_HOST = /^(?:www\.)?decodednovels\.ca$/i;
const NOVEL_PATH = /^\/novels\/[^/]+\/?$/i;
const PAGE_SIZE = 20;

type ListedNovel = Plugin.NovelItem & { status: string };

class DecodedNovels implements Plugin.PluginBase {
  id = 'decodednovels';
  name = 'Decoded Novels';
  icon = 'src/en/decodednovels/icon.png';
  site = 'https://decodednovels.ca';
  version = '1.0.0';

  filters = {
    status: {
      label: 'Status',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Completed', value: NovelStatus.Completed },
        { label: 'Dropped', value: NovelStatus.Cancelled },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private async request(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw Object.assign(
        new Error(`Decoded Novels: HTTP ${response.status}.`),
        {
          status: response.status,
        },
      );
    }
    return response;
  }

  private async loadPage(url: string) {
    return loadCheerio(await (await this.request(url)).text());
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /** Site-relative path of a link to this site, or undefined for any other. */
  private sitePath(href: string | undefined): string | undefined {
    if (!href) return undefined;
    try {
      const url = new URL(href, this.site);
      return SITE_HOST.test(url.hostname) ? url.pathname : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * The "Novel Lists" page is the whole catalogue: one cover, title and short
   * blurb per novel. A closing line on the blurb says "Completed: <month>" or
   * "DROPPED"; novels without one have no stated status.
   */
  private async catalogue(): Promise<ListedNovel[]> {
    const $ = await this.loadPage(`${this.site}/novels/`);
    const novels: ListedNovel[] = [];
    const seen = new Set<string>();
    $('.entry-content .wp-block-column').each((_, el) => {
      const column = $(el);
      const link = column.find('figure a[href]').first();
      const path = this.sitePath(link.attr('href'));
      const name = this.cleanText(column.find('h2').first().text());
      if (!path || !NOVEL_PATH.test(path) || !name || seen.has(path)) return;
      seen.add(path);
      const note = column.find('p').last().text().replace(/\s+/g, ' ').trim();
      let status: string = NovelStatus.Unknown;
      if (/^completed\b/i.test(note)) status = NovelStatus.Completed;
      else if (/^dropped\b/i.test(note)) status = NovelStatus.Cancelled;
      novels.push({
        name,
        path,
        cover: link.find('img').first().attr('src') || defaultCover,
        status,
      });
    });
    return novels;
  }

  private toItems(novels: ListedNovel[], pageNo: number): Plugin.NovelItem[] {
    return novels
      .slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE)
      .map(({ name, path, cover }) => ({ name, path, cover }));
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const wanted = filters?.status?.value || 'all';
    const novels = (await this.catalogue()).filter(
      novel => wanted === 'all' || novel.status === wanted,
    );
    return this.toItems(novels, pageNo);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const [$, listed] = await Promise.all([
      this.loadPage(this.resolveUrl(novelPath)),
      this.catalogue().catch(() => [] as ListedNovel[]),
    ]);
    const entry = listed.find(
      novel => novel.path.replace(/\/+$/, '') === novelPath.replace(/\/+$/, ''),
    );
    const content = $('.entry-content').first();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        entry?.name ||
        this.cleanText($('meta[property="og:title"]').attr('content') || '') ||
        this.cleanText(
          $('title')
            .text()
            .replace(/\s+[–-]\s+[^–-]*$/, ''),
        ),
      cover: content.find('figure img').first().attr('src') || defaultCover,
      status: entry?.status || NovelStatus.Unknown,
    };

    // "Author: ...", "Genre: ..." lines sit beside the cover.
    content.find('p').each((_, el) => {
      const text = this.cleanText($(el).text());
      const field = /^(Author|Artist|Genre)s?\s*:\s*(.+)$/i.exec(text);
      if (!field) return;
      const value = field[2].trim();
      const key = field[1].toLowerCase();
      if (key === 'author') novel.author = value;
      else if (key === 'artist') novel.artist = value;
      else novel.genres = value.split(/\s*,\s*/).join(',');
    });

    // The blurb is every paragraph after the "Summary:" label in its box.
    const label = content
      .find('p')
      .filter((_, el) => /^Summary\s*:?$/i.test(this.cleanText($(el).text())))
      .first();
    const summary = label
      .nextAll('p')
      .map((_, el) => this.cleanText($(el).text()))
      .get()
      .filter(Boolean);
    novel.summary = summary.join('\n\n') || undefined;

    // The chapter list is newest first; the app wants reading order.
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    content.find('.collapsible-container .content a[href]').each((_, el) => {
      const anchor = $(el);
      const path = this.sitePath(anchor.attr('href'));
      if (!path || seen.has(path)) return;
      seen.add(path);
      const date = /^\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(path);
      chapters.push({
        name:
          this.cleanText(anchor.text()).replace(/\s*:$/, '') ||
          path.split('/').filter(Boolean).pop() ||
          path,
        path,
        releaseTime: date ? `${date[1]}-${date[2]}-${date[3]}` : undefined,
      });
    });
    chapters.reverse();
    chapters.forEach((chapter, index) => {
      chapter.chapterNumber = index + 1;
    });
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.loadPage(this.resolveUrl(chapterPath));
    const content = $('.entry-content .post-content').first();
    // A chapter selector and TOC button, plus previous/next links, frame the
    // text at the top and bottom.
    content.children('div').has('select').remove();
    content
      .find('script,style,iframe,noscript,form,.wp-post-navigation,.sharedaddy')
      .remove();
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      if (!paragraph.text().trim() && !paragraph.find('img').length)
        paragraph.remove();
    });
    const text = content.html() || '';
    if (!content.find('img').length && content.text().trim().length < 200)
      throw new Error('Decoded Novels: no readable chapter text found.');
    return text;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = this.cleanText(searchTerm);
    if (!term) return [];
    const listed = await this.catalogue();
    // The site's own search returns chapter posts, but its page search
    // returns the matching novel pages.
    let matches: ListedNovel[];
    try {
      const response = await this.request(
        `${this.site}/wp-json/wp/v2/pages?per_page=100&_fields=link&search=${encodeURIComponent(
          term,
        )}`,
      );
      const pages: { link: string }[] = await response.json();
      const found = new Set(
        pages.map(page => this.sitePath(page.link)?.replace(/\/+$/, '')),
      );
      matches = listed.filter(novel =>
        found.has(novel.path.replace(/\/+$/, '')),
      );
    } catch {
      const words = term.toLowerCase().split(' ');
      matches = listed.filter(novel =>
        words.every(word => novel.name.toLowerCase().includes(word)),
      );
    }
    return this.toItems(matches, pageNo);
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (!SITE_HOST.test(url.hostname))
      throw new Error('Decoded Novels: invalid page address.');
    return `${this.site}${url.pathname}${url.search}`;
  }
}

export default new DecodedNovels();
