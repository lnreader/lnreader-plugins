import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type NovelEntry = { name: string; path: string; cover: string };

const SITE_HOST = 'adcaelumtranslations.wordpress.com';

/** Chapters are dated posts: /YYYY/MM/DD/slug (some links are /MM/DD/YYYY/slug). */
const POST_PATH =
  /^\/(?:(\d{4})\/(\d{2})\/(\d{2})|(\d{2})\/(\d{2})\/(\d{4}))\/[^/]+$/;

/** Labelled lines of the details block that end the synopsis. */
const END_OF_SYNOPSIS =
  /^(Raws?\b|Available here|Fan Discord|Official English|Link to|Shortcuts|Source:|Previous fan-translated)/i;

class TowardsTheSkyPlugin implements Plugin.PluginBase {
  id = 'towardsthesky';
  name = 'Towards the Sky';
  icon = 'src/en/towardsthesky/icon.png';
  site = `https://${SITE_HOST}`;
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  private async loadPage(path: string) {
    const response = await fetchApi(this.resolveUrl(path));
    if (!response.ok) {
      throw new Error(`Towards the Sky: HTTP ${response.status}.`);
    }
    return loadCheerio(await response.text());
  }

  private pathOf(href: string): string | undefined {
    try {
      const url = new URL(href, this.site);
      if (url.hostname !== SITE_HOST) return undefined;
      const parts = POST_PATH.exec(url.pathname.replace(/\/+$/, ''));
      if (parts?.[4]) {
        // Normalise /MM/DD/YYYY/slug to the canonical /YYYY/MM/DD/slug.
        const slug = url.pathname.replace(/\/+$/, '').split('/').pop();
        return `/${parts[6]}/${parts[4]}/${parts[5]}/${slug}`;
      }
      return url.pathname.replace(/\/+$/, '') || undefined;
    } catch {
      return undefined;
    }
  }

  /** Novels are the entries of the "Translations" and "Dropped" index pages. */
  private async novelList(indexPath: string): Promise<NovelEntry[]> {
    const $ = await this.loadPage(indexPath);
    const novels: NovelEntry[] = [];
    const seen = new Set<string>();
    $('.entry-content .wp-block-media-text').each((_, el) => {
      const block = $(el);
      const anchor = block.find('h2 a').first();
      const path = this.pathOf(anchor.attr('href') || '');
      const name = anchor.text().replace(/\s+/g, ' ').trim();
      if (!path || !name || seen.has(path)) return;
      seen.add(path);
      const src = block.find('img').first().attr('src') || '';
      novels.push({
        name,
        path,
        cover: src.startsWith('http') ? src : defaultCover,
      });
    });
    return novels;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The whole catalogue fits on a single page.
    if (pageNo > 1) return [];
    const [translations, dropped] = await Promise.all([
      this.novelList('/translations'),
      this.novelList('/dropped'),
    ]);
    return [...translations, ...dropped];
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    // The site's own search returns chapter posts, so match novel titles instead.
    const novels = await this.popularNovels(pageNo);
    return novels.filter(novel =>
      terms.every(term => novel.name.toLowerCase().includes(term)),
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const [$, translations, dropped] = await Promise.all([
      this.loadPage(novelPath),
      this.novelList('/translations'),
      this.novelList('/dropped'),
    ]);
    const content = $('.entry-content').first();
    // Prefer the catalogue's title and cover so they match the browse list.
    const droppedEntry = dropped.find(item => item.path === novelPath);
    const entry =
      droppedEntry || translations.find(item => item.path === novelPath);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        entry?.name ||
        $('title')
          .first()
          .text()
          .replace(/\s*[–-]\s*Towards the Sky\s*$/, '')
          .replace(/\s+/g, ' ')
          .trim(),
      cover:
        entry?.cover || content.find('img').first().attr('src') || defaultCover,
      status: droppedEntry ? NovelStatus.Cancelled : NovelStatus.Ongoing,
      chapters: [],
    };

    // Details block: the paragraphs before the first rule.
    const details: string[] = [];
    for (const el of content.children().toArray()) {
      if (el.tagName === 'hr') break;
      if (el.tagName !== 'p') continue;
      const paragraph = $(el).clone();
      paragraph.find('br').replaceWith('\n');
      details.push(...paragraph.text().split('\n'));
    }
    const summary: string[] = [];
    let inSynopsis = false;
    for (const rawLine of details) {
      const line = rawLine.replace(/\s+/g, ' ').trim();
      if (!line) continue;
      const author = /^Author:\s*(.+)$/i.exec(line);
      const genre = /^Genre:\s*(.+)$/i.exec(line);
      const synopsis = /^Synopsis:\s*(.*)$/i.exec(line);
      if (author) {
        novel.author = author[1].replace(/;.*$/, '').trim();
      } else if (genre) {
        novel.genres = genre[1].trim();
      } else if (synopsis) {
        inSynopsis = true;
        if (synopsis[1]) summary.push(synopsis[1]);
      } else if (END_OF_SYNOPSIS.test(line)) {
        inSynopsis = false;
      } else if (inSynopsis) {
        summary.push(line);
      }
    }
    novel.summary = summary.join('\n') || undefined;

    // Chapter table of contents: dated post links, grouped by volume headings.
    const seen = new Set<string>();
    let volume = '';
    let previous = '';
    content.find('p').each((_, paragraphEl) => {
      $(paragraphEl)
        .contents()
        .each((__, node) => {
          const item = $(node);
          if (node.type === 'tag' && node.tagName === 'strong') {
            const heading = /^Volume\s+(\d+)/i.exec(item.text().trim());
            if (heading) volume = `Vol. ${heading[1]} - `;
            return;
          }
          if (node.type !== 'tag' || node.tagName !== 'a') return;
          const path = this.pathOf(item.attr('href') || '');
          if (!path || !POST_PATH.test(path) || seen.has(path)) return;
          let name = item.text().replace(/\s+/g, ' ').trim();
          if (!name) return;
          // "Chapter 1 Part 1・Part 2": a bare part continues the previous title.
          if (/^Part\s*\d+$/i.test(name) && previous) {
            name = `${previous.replace(/\s*Part\s*\d+$/i, '')} ${name}`;
          } else {
            previous = name;
          }
          seen.add(path);
          const date = POST_PATH.exec(path);
          novel.chapters.push({
            name: `${volume}${name}`,
            path,
            releaseTime: date
              ? new Date(
                  Date.UTC(+date[1], +date[2] - 1, +date[3]),
                ).toISOString()
              : undefined,
          });
        });
    });

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.loadPage(chapterPath);
    const content = $('.entry-content').first();
    content.find('script,style,iframe,noscript,form,.sharedaddy').remove();
    content.find('[id^="more-"],[id^="wordads"]').remove();
    // Footer with Previous Part / Table of Contents / Next Part links.
    content.find('div').each((_, el) => {
      const block = $(el);
      const text = block.text();
      if (
        text.length < 300 &&
        /(Previous|Next)\s+(Part|Chapter)|Table of Contents/i.test(text)
      ) {
        block.prev('hr').remove();
        block.remove();
      }
    });
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      if (!paragraph.text().trim() && !paragraph.find('img').length)
        paragraph.remove();
    });
    const chapter = content.html()?.trim() || '';
    if (!content.find('img').length && content.text().trim().length < 200)
      throw new Error('Towards the Sky: no readable chapter text found.');
    return chapter;
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (url.hostname !== SITE_HOST)
      throw new Error('Towards the Sky: invalid page address.');
    return `${this.site}${url.pathname}${url.search}`;
  }
}

export default new TowardsTheSkyPlugin();
