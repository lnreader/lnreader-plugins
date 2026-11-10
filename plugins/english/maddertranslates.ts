import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type NovelEntry = { name: string; path: string; status: string };

const HOST = 'maddertranslates.com';
const SERIES_PATH = '/wn';
const AUTHOR_LINE = /^(?:作者|作家\(Author\)|Author)\s*[：:]\s*(.+)$/i;
const NAV_LINKS = /^(?:<<\s*BACK|NEXT\s*>>|TOC|\s)+$/i;
const SKIP_SUMMARY_LINE =
  /^(?:原作|Original Work|Light Novel|Support the Author|Amazon$|Booklive$|Bookwalker$)/i;

class MadderTranslates implements Plugin.PluginBase {
  id = 'maddertranslates';
  name = 'Madder Translates';
  icon = 'src/en/maddertranslates/icon.png';
  site = `https://www.${HOST}`;
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  private async loadPage(path: string) {
    const response = await fetchApi(this.resolveUrl(path));
    if (!response.ok) {
      throw new Error(`Madder Translates: HTTP ${response.status}.`);
    }
    return loadCheerio(await response.text());
  }

  /** Normalizes a link into a path without host or trailing slash. */
  private pathOf(href: string): string | undefined {
    try {
      const url = new URL(href, this.site);
      if (url.hostname.replace(/^www\./, '') !== HOST) return undefined;
      return url.pathname.replace(/\/+$/, '') || undefined;
    } catch {
      return undefined;
    }
  }

  /** The "Web Novel" page links every series under an Ongoing/Hiatus heading. */
  private async novelList(): Promise<NovelEntry[]> {
    const $ = await this.loadPage(SERIES_PATH);
    const novels: NovelEntry[] = [];
    const seen = new Set<string>();
    let status: string = NovelStatus.Ongoing;
    $('.td-page-content')
      .first()
      .children()
      .each((_, el) => {
        const block = $(el);
        const heading = block.children('strong').first().text();
        if (/hiatus/i.test(heading)) status = NovelStatus.OnHiatus;
        else if (/ongoing/i.test(heading)) status = NovelStatus.Ongoing;
        else if (/completed?/i.test(heading)) status = NovelStatus.Completed;
        block.find('a[href]').each((__, a) => {
          const anchor = $(a);
          const path = this.pathOf(anchor.attr('href') || '');
          // Series pages sit at /wnNN; chapters are one level deeper.
          if (!path || !/^\/wn\d+$/i.test(path) || seen.has(path)) return;
          // The link text is "・English title<br>「romaji」<br>「Japanese」".
          const name = anchor
            .clone()
            .find('br')
            .replaceWith('\n')
            .end()
            .text()
            .split('\n')[0]
            .replace(/^[・\s]+/, '')
            .trim();
          if (!name) return;
          seen.add(path);
          novels.push({ name, path, status });
        });
      });
    return novels;
  }

  private toNovelItems(novels: NovelEntry[]): Plugin.NovelItem[] {
    // The site publishes no cover art for its series.
    return novels.map(novel => ({
      name: novel.name,
      path: novel.path,
      cover: defaultCover,
    }));
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The whole catalogue is a single short page.
    if (pageNo > 1) return [];
    return this.toNovelItems(await this.novelList());
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const [$, entries] = await Promise.all([
      this.loadPage(novelPath),
      this.novelList(),
    ]);
    const entry = entries.find(item => item.path === novelPath);
    const content = $('.td-page-content').first();
    content.find('script,style,noscript,.code-block').remove();

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    const chapterPrefix = new RegExp(`^${novelPath}/c[^/]+$`, 'i');
    content.find('a[href]').each((_, el) => {
      const anchor = $(el);
      const path = this.pathOf(anchor.attr('href') || '');
      const name = anchor.text().replace(/\s+/g, ' ').trim();
      if (!path || !name || seen.has(path) || !chapterPrefix.test(path)) return;
      seen.add(path);
      chapters.push({ name, path });
    });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        entry?.name ||
        $('h1.entry-title').first().text().replace(/\s+/g, ' ').trim(),
      cover: defaultCover,
      chapters,
      status: entry?.status || NovelStatus.Unknown,
    };

    // Everything above the first rule is the synopsis and credits.
    const summary: string[] = [];
    const intro = content.children().first().nextUntil('hr').addBack();
    intro.each((_, el) => {
      const block = $(el);
      if (!block.is('p')) return;
      block.find('br').replaceWith('\n');
      const text = block
        .text()
        .split('\n')
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const joined = text.join('\n');
      if (!joined) return;
      const author = AUTHOR_LINE.exec(joined);
      if (author) {
        novel.author = author[1].trim();
        return;
      }
      if (SKIP_SUMMARY_LINE.test(joined)) return;
      summary.push(joined);
    });
    novel.summary = summary.join('\n\n') || undefined;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.loadPage(chapterPath);
    const content = $('.td-page-content').first();
    content
      .find(
        'script,style,iframe,noscript,form,ins,.code-block,#disqus_thread,.td-post-sharing',
      )
      .remove();
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      const text = paragraph.text().replace(/\s+/g, ' ').trim();
      // Drop empty paragraphs and the closing "<<BACK NEXT>> TOC" link row.
      if ((!text && !paragraph.find('img').length) || NAV_LINKS.test(text))
        paragraph.remove();
    });
    // Lazy-loaded images keep their real address in data-lazy-src.
    content.find('img[data-lazy-src]').each((_, el) => {
      $(el).attr('src', $(el).attr('data-lazy-src') || '');
    });
    if (!content.find('img').length && content.text().trim().length < 200)
      throw new Error('Madder Translates: no readable chapter text found.');
    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length || pageNo > 1) return [];
    // The site's own search returns individual chapters, so match the series
    // titles on the Web Novel page instead.
    const novels = (await this.novelList()).filter(novel =>
      terms.every(term => novel.name.toLowerCase().includes(term)),
    );
    return this.toNovelItems(novels);
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (url.hostname.replace(/^www\./, '') !== HOST)
      throw new Error('Madder Translates: invalid page address.');
    return `${this.site}${url.pathname}${url.search}`;
  }
}

export default new MadderTranslates();
