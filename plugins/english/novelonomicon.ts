import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type CatalogueEntry = {
  name: string;
  path: string;
  cover: string;
  status: string;
  added: number;
  updated: number;
};

/**
 * Novelonomicon is a custom WordPress theme. The whole catalogue is on one
 * page (`/novels/`), a novel page lists every chapter, and the chapter text is
 * plain `<p>` tags inside `.ag-content-body`.
 *
 * - search:   the site's own search (`/?s=`) returns chapter posts rather than
 *             novels, so the catalogue is filtered by title instead.
 * - locked:   chapters released early for paying members are time-locked and
 *             render a paywall instead of text. The novel page lists them in
 *             an inline `aguqChapterList` script, so they are left out of the
 *             chapter list until they unlock.
 * - limits:   the site blocks a connection for about an hour when it opens
 *             many different chapters in a short time, so bulk downloads can
 *             be refused; reading one chapter at a time is unaffected.
 */
class NovelonomiconPlugin implements Plugin.PluginBase {
  id = 'novelonomicon';
  name = 'Novelonomicon';
  icon = 'src/en/novelonomicon/icon.png';
  site = 'https://novelonomicon.com/';
  version = '1.0.0';

  private cataloguePromise: Promise<CatalogueEntry[]> | null = null;

  private async fetchHtml(url: string): Promise<string> {
    const response = await fetchApi(url);
    if (!response.ok) {
      // The site temporarily blocks a connection that opens many different
      // chapters in a short time (about an hour) and says so on a 403 page.
      const blocked =
        response.status === 403 &&
        /access temporarily blocked/i.test(await response.text());
      throw Object.assign(
        new Error(
          blocked
            ? 'Novelonomicon temporarily blocked this connection for opening too many chapters in a short time. Wait about an hour and try again.'
            : `Novelonomicon returned HTTP ${response.status}`,
        ),
        { status: response.status },
      );
    }
    return response.text();
  }

  private toPath(url: string) {
    return url.replace(this.site, '');
  }

  /**
   * Lazy-loaded images keep the real URL in `data-src`, `src` is a pixel.
   * Novels without artwork point at the site's own "missingcover" placeholder.
   */
  private imageUrl(img: ReturnType<ReturnType<typeof parseHTML>>) {
    const url = img.attr('data-src') || img.attr('src') || '';
    return url.startsWith('http') && !url.includes('missingcover')
      ? url
      : defaultCover;
  }

  /** Fetches the catalogue once per session; retried if the request fails. */
  private getCatalogue(): Promise<CatalogueEntry[]> {
    if (!this.cataloguePromise) {
      this.cataloguePromise = this.fetchCatalogue().catch(error => {
        this.cataloguePromise = null;
        throw error;
      });
    }
    return this.cataloguePromise;
  }

  private async fetchCatalogue(): Promise<CatalogueEntry[]> {
    const $ = parseHTML(await this.fetchHtml(this.site + 'novels/'));
    const novels: CatalogueEntry[] = [];

    $('.ag-hub-card[data-ag-hub-type="novel"]').each((_, el) => {
      const card = $(el);
      const link = card.attr('data-ag-hub-link');
      const name = card.find('.ag-hub-card-title').text().trim();
      if (!link || !name) return;

      const statusClass =
        card.find('.ag-novel-home-status').attr('class') || '';
      novels.push({
        name,
        path: this.toPath(link),
        cover: this.imageUrl(card.find('.ag-hub-card-media img').first()),
        status: statusClass.replace(/^.*ag-novel-status-(\S+).*$/, '$1'),
        added: Number(card.attr('data-ag-hub-added')) || 0,
        updated: Number(card.attr('data-ag-hub-updated')) || 0,
      });
    });

    if (!novels.length) throw new Error('Could not parse the novel catalogue');
    return novels;
  }

  private toNovelItem(entry: CatalogueEntry): Plugin.NovelItem {
    return { name: entry.name, path: entry.path, cover: entry.cover };
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // The whole catalogue is served on one page.
    if (pageNo > 1) return [];

    const sort = showLatestNovels ? 'updated' : filters.sort.value;
    const status = filters.status.value;

    const novels = (await this.getCatalogue()).filter(
      novel => status === 'all' || novel.status === status,
    );

    if (sort === 'name') {
      novels.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      const key = sort === 'new' ? 'added' : 'updated';
      novels.sort((a, b) => b[key] - a[key]);
    }

    return novels.map(novel => this.toNovelItem(novel));
  }

  /** Decodes base64 without relying on `atob`/`Buffer` being available. */
  private decodeBase64(data: string): string {
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let output = '';
    let buffer = 0;
    let bits = 0;
    for (const char of data.replace(/=+$/, '')) {
      const value = alphabet.indexOf(char);
      if (value < 0) continue;
      buffer = (buffer << 6) | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output += String.fromCharCode((buffer >> bits) & 0xff);
        buffer &= (1 << bits) - 1;
      }
    }
    return output;
  }

  /**
   * Chapter URLs that are still locked for non-members, read from the
   * `aguqChapterList` script the novel page embeds (base64 `data:` URL or
   * inline text depending on the site's optimiser).
   */
  private getLockedPaths($: ReturnType<typeof parseHTML>): Set<string> {
    const locked = new Set<string>();
    try {
      const script = $('#aguq-chapter-list-js-extra');
      const src = script.attr('src') || '';
      const base64 = src.match(/^data:[^,]*;base64,(.*)$/);
      const source = base64
        ? this.decodeBase64(base64[1])
        : script.html() || '';

      const pattern = /"href":"([^"]+)","unlockAt":(\d+)/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source))) {
        if (Number(match[2]) > Date.now()) {
          locked.add(this.toPath(match[1].replace(/\\\//g, '/')));
        }
      }
    } catch {
      // Without the list every chapter is shown; locked ones report an error.
    }
    return locked;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = parseHTML(await this.fetchHtml(this.site + novelPath));

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('.ag-novel-home-title').first().text().trim() || 'Untitled',
      cover: this.imageUrl($('.ag-novel-home-cover img').first()),
      genres: $('.ag-novel-home-info .ag-novel-home-tag')
        .map((_, el) => $(el).text().trim())
        .get()
        .join(', '),
      summary: $('.ag-novel-home-synopsis-body > p')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean)
        .join('\n\n'),
    };

    $('.ag-novel-home-meta > div').each((_, el) => {
      const label = $(el).find('dt').text().trim().toLowerCase();
      const value = $(el).find('dd').text().trim();
      if (label === 'author') novel.author = value;
      if (label === 'status') {
        novel.status =
          {
            ongoing: NovelStatus.Ongoing,
            completed: NovelStatus.Completed,
            hiatus: NovelStatus.OnHiatus,
            dropped: NovelStatus.Cancelled,
          }[value.toLowerCase()] || NovelStatus.Unknown;
      }
    });

    const locked = this.getLockedPaths($);
    const chapters: Plugin.ChapterItem[] = [];
    $('.ag-novel-chapter-card').each((_, el) => {
      const card = $(el);
      const href = card.attr('href');
      if (!href) return;
      const path = this.toPath(href);
      if (locked.has(path)) return;

      const timestamp = Number(
        card.find('[data-ag-timestamp]').attr('data-ag-timestamp'),
      );
      const chapterNumber = parseFloat(card.attr('data-number') || '');
      chapters.push({
        name:
          card.find('.ag-novel-chapter-card-num').text().trim() ||
          card.attr('title') ||
          path,
        path,
        releaseTime: timestamp
          ? new Date(timestamp * 1000).toISOString()
          : null,
        chapterNumber: isNaN(chapterNumber) ? undefined : chapterNumber,
      });
    });
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = parseHTML(await this.fetchHtml(this.site + chapterPath));
    const content = $('.ag-content-body').first();

    if (!content.length) {
      throw new Error('Could not find the chapter text.');
    }
    if (content.find('.aguq-paywall').length) {
      throw new Error(
        "This chapter isn't unlocked yet. Check back later or unlock it on Novelonomicon.",
      );
    }

    // Ad slots and scripts sit between the paragraphs.
    content.find('.ag-ad-zone, ins, script, style, iframe, noscript').remove();
    content.find('img').each((_, el) => {
      const img = $(el);
      const src = img.attr('data-src');
      if (src) img.attr('src', src);
    });

    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const term = searchTerm.trim().toLowerCase();
    return (await this.getCatalogue())
      .filter(novel => novel.name.toLowerCase().includes(term))
      .map(novel => this.toNovelItem(novel));
  }

  resolveUrl = (path: string) => this.site + path;

  filters = {
    sort: {
      label: 'Sort By',
      value: 'updated',
      options: [
        { label: 'Latest Updated', value: 'updated' },
        { label: 'Newest', value: 'new' },
        { label: 'Name (A-Z)', value: 'name' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Status',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'On Hiatus', value: 'hiatus' },
        { label: 'Dropped', value: 'dropped' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new NovelonomiconPlugin();
