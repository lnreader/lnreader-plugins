import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';
import { load as loadCheerio } from 'cheerio';

class Novels2 implements Plugin.PluginBase {
  id = 'novels2';
  name = 'Novels2';
  site = 'https://www.novels2.com';
  version = '1.0.0';
  icon = 'src/es/novels2/icon.png';

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Could not reach site (${res.status})`);
    }
    return res.text();
  }

  /**
   * Covers without an image are served as the site's `*_failed.png`
   * placeholder, so those fall back to the default cover. Other paths can be
   * relative, so they are resolved against the site.
   */
  private toCover(src?: string): string {
    if (!src || /_failed\.png$/.test(src)) {
      return defaultCover;
    }
    return src.startsWith('http') ? src : `${this.site}${src}`;
  }

  /** Novel cards share one markup on the listing and search pages. */
  private parseNovelCards(html: string): Plugin.NovelItem[] {
    const $ = loadCheerio(html);
    const novels: Plugin.NovelItem[] = [];
    const seen: Record<string, boolean> = {};

    $('h3 a[href^="/novel/"]').each((_, el) => {
      const path = $(el).attr('href') || '';
      if (!path || seen[path]) {
        return;
      }
      seen[path] = true;
      novels.push({
        name: $(el).text().trim(),
        path,
        cover: this.toCover($(`a.novel-cover[href="${path}"] img`).attr('src')),
      });
    });

    return novels;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const html = await this.fetchHtml(`${this.site}/?page=${pageNo}`);
    return this.parseNovelCards(html);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await this.fetchHtml(`${this.site}${novelPath}`);
    const $ = loadCheerio(html);

    /** Value of a `<div class="text-md"><span>Label:</span><span>Value</span>` row. */
    const metaValue = (label: string) => {
      let value = '';
      $('div.text-md').each((_, el) => {
        const spans = $(el).children('span');
        if (spans.first().text().trim() === label) {
          value = spans.eq(1).text().trim();
        }
      });
      return value;
    };

    /** The block that follows an `<h3>` heading such as Synopsis or Genre. */
    const sectionByHeading = (heading: string) =>
      $('h3')
        .filter((_, el) => $(el).text().trim() === heading)
        .first()
        .parent();

    const summary = sectionByHeading('Synopsis')
      .find('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join('\n');

    const genres = sectionByHeading('Genre')
      .find('a')
      .map((_, el) => $(el).text().trim())
      .get()
      .join(', ');

    const status = metaValue('Status:').toLowerCase();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h2.text-xl').first().text().trim(),
      cover: this.toCover($('.novel-cover img').first().attr('src')),
      author: metaValue('Author:') || undefined,
      summary: summary || undefined,
      genres: genres || undefined,
      status: status.includes('ongoing')
        ? NovelStatus.Ongoing
        : status.includes('complet')
          ? NovelStatus.Completed
          : NovelStatus.Unknown,
    };

    novel.chapters = this.parseChapterList(html, novelPath);
    return novel;
  }

  /**
   * The novel page renders only the first 20 chapters in its markup. The full
   * list (every chapter, ascending by number) is serialized in the Next.js RSC
   * payload as escaped JSON, so it is read from the raw HTML instead.
   */
  private parseChapterList(
    html: string,
    novelPath: string,
  ): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const chapterRe =
      /\\"id\\":(\d+),\\"title\\":\\"((?:[^"\\]|\\.)*?)\\",\\"number\\":(\d+),\\"createdAt\\":\\"\$D([^"\\]+)\\"/g;

    let match = chapterRe.exec(html);
    while (match !== null) {
      const title = this.unescapeRsc(match[2]);
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      chapters.push({
        name: title,
        path: `${novelPath}/${slug || 'chapter'}-${match[1]}`,
        releaseTime: match[4],
        chapterNumber: parseInt(match[3], 10),
      });
      match = chapterRe.exec(html);
    }

    if (chapters.length === 0 && /\\"number\\":\d/.test(html)) {
      throw new Error(`Could not parse chapter list for ${novelPath}`);
    }

    return chapters;
  }

  /** Undo the JSON string escaping used inside the RSC payload. */
  private unescapeRsc(value: string): string {
    const rowEscaped: string = JSON.parse(`"${value}"`);
    return JSON.parse(`"${rowEscaped}"`);
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchHtml(`${this.site}${chapterPath}`);
    const $ = loadCheerio(html);

    const paragraphs = $('article p')
      .map((_, el) => {
        const text = $(el).text().trim();
        return text ? `<p>${$(el).html()}</p>` : '';
      })
      .get()
      .filter(Boolean)
      .join('');

    if (!paragraphs) {
      throw new Error('Chapter text not found');
    }
    return paragraphs;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const html = await this.fetchHtml(
      `${this.site}/search?keyword=${encodeURIComponent(searchTerm)}&page=${pageNo}`,
    );
    return this.parseNovelCards(html);
  }

  /** Absolute URLs (such as cover images) are returned as they are. */
  resolveUrl = (path: string): string =>
    /^https?:\/\//.test(path) ? path : this.site + path;
}

export default new Novels2();
