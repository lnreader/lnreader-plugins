import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type Section = 'active' | 'completed' | 'on-hold' | 'dropped';
type NovelEntry = { name: string; path: string; section?: Section };

// The blog moved from nyxtranslation.home.blog; older contents links still use
// the previous host, and the same paths are served from the current one.
const SITE_HOST =
  /^(?:(?:www\.)?nyx-translation\.com|nyxtranslation\.home\.blog)$/i;
// Menu pages that are indexes or site pages rather than novels.
const NON_NOVEL_PATHS = new Set([
  '/novel-list',
  '/jp-novel',
  '/kr-novel',
  '/active',
  '/completed',
  '/on-hold',
  '/dropped',
  '/patronage',
  '/contact',
]);
const SECTIONS: Record<string, Section> = {
  '/active': 'active',
  '/completed': 'completed',
  '/on-hold': 'on-hold',
  '/dropped': 'dropped',
};
const SECTION_STATUS: Record<Section, string> = {
  active: NovelStatus.Ongoing,
  completed: NovelStatus.Completed,
  'on-hold': NovelStatus.OnHiatus,
  dropped: NovelStatus.Cancelled,
};
// Chapters are dated posts, e.g. /2024/01/03/some-novel-chapter-30.
const CHAPTER_PATH = /^\/(\d{4})\/(\d{2})\/(\d{2})\/[^/]+$/;
// Chapter links such as "Part 2" or "Prologue" that only make sense together
// with the volume / chapter label printed before them in the contents.
const GENERIC_CHAPTER_NAME =
  /^(?:part\s*\d+|chapter\s*\d+|prologue|epilogue|afterword|illustrations?|interlude|extra)$/i;
const VOLUME_LABEL = /^(?:volume|vol\.?)\s*\d+\s*:?$/i;
const NAVIGATION_LINK = /^(?:<<|«)?\s*(?:previous|next|table of contents?)/i;
const PAGE_SIZE = 20;

class NyxTranslationPlugin implements Plugin.PluginBase {
  id = 'nyxtranslation';
  name = 'NyX Translation';
  icon = 'src/en/nyxtranslation/icon.png';
  site = 'https://nyx-translation.com';
  version = '1.0.0';

  filters = {
    section: {
      label: 'Status',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Active', value: 'active' },
        { label: 'Completed', value: 'completed' },
        { label: 'On Hold', value: 'on-hold' },
        { label: 'Dropped', value: 'dropped' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private async loadPage(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`NyX Translation: HTTP ${response.status}.`);
    }
    return loadCheerio(await response.text());
  }

  /** Site-relative path of an on-site link, or undefined for anything else. */
  private pathOf(href: string | undefined): string | undefined {
    if (!href) return undefined;
    try {
      const url = new URL(href, this.site);
      if (!SITE_HOST.test(url.hostname)) return undefined;
      return url.pathname.replace(/\/+$/, '') || undefined;
    } catch {
      return undefined;
    }
  }

  /** The novels are the pages linked from the top menu, grouped by status. */
  private async novelList(): Promise<NovelEntry[]> {
    const $ = await this.loadPage(this.site);
    const novels: NovelEntry[] = [];
    const seen = new Set<string>();
    $('#top-menu a').each((_, el) => {
      const anchor = $(el);
      const path = this.pathOf(anchor.attr('href'));
      // Novel pages live at a single-segment address.
      if (!path || path.split('/').length !== 2) return;
      if (NON_NOVEL_PATHS.has(path) || seen.has(path)) return;
      const name = anchor.text().replace(/\s+/g, ' ').trim();
      if (!name) return;
      seen.add(path);
      let section: Section | undefined;
      anchor.parents('li').each((__, li) => {
        const parentPath = this.pathOf(
          $(li).children('a').first().attr('href'),
        );
        if (!section && parentPath) section = SECTIONS[parentPath];
      });
      novels.push({ name, path, section });
    });
    return novels;
  }

  private coverOf($: ReturnType<typeof loadCheerio>): string {
    const src = $('.entry-content img').first().attr('src') || '';
    return src.startsWith('http') ? src : defaultCover;
  }

  private async toNovelItems(
    novels: NovelEntry[],
  ): Promise<Plugin.NovelItem[]> {
    return Promise.all(
      novels.map(async novel => {
        const $ = await this.loadPage(this.resolveUrl(novel.path)).catch(
          () => undefined,
        );
        return {
          name: novel.name,
          path: novel.path,
          cover: $ ? this.coverOf($) : defaultCover,
        };
      }),
    );
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const wanted = filters?.section?.value;
    const novels = (await this.novelList())
      .filter(novel => !wanted || wanted === 'all' || novel.section === wanted)
      .slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);
    return this.toNovelItems(novels);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const [$, entries] = await Promise.all([
      this.loadPage(this.resolveUrl(novelPath)),
      this.novelList().catch(() => [] as NovelEntry[]),
    ]);
    const entry = entries.find(item => item.path === novelPath);
    const content = $('.entry-content').first();
    content.find('script,style,noscript,.sharedaddy,#jp-post-flair').remove();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        entry?.name ||
        $('h1.entry-title').first().text().replace(/\s+/g, ' ').trim(),
      cover: this.coverOf($),
      status: entry?.section
        ? SECTION_STATUS[entry.section]
        : NovelStatus.Unknown,
    };

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    const summary: string[] = [];
    let volume = '';
    let label = '';
    let inDescription = false;
    let inContents = false;

    content.find('p, h1, h2, h3, h4, h5, h6').each((_, el) => {
      const block = $(el);
      // Nested blocks are visited on their own.
      if (block.find('p, h1, h2, h3, h4, h5, h6').length) return;
      const text = block.text().replace(/\s+/g, ' ').trim();

      let hasChapter = false;
      block.find('a[href]').each((__, a) => {
        const anchor = $(a);
        const path = this.pathOf(anchor.attr('href'));
        const linkText = anchor.text().replace(/\s+/g, ' ').trim();
        if (!path || !linkText || !CHAPTER_PATH.test(path)) return;
        hasChapter = true;
        if (seen.has(path)) return;
        seen.add(path);
        const parts: string[] = [];
        if (GENERIC_CHAPTER_NAME.test(linkText)) {
          // "Volume 2 Epilogue" already names its volume.
          if (volume && !label.toLowerCase().startsWith(volume.toLowerCase()))
            parts.push(volume);
          if (label) parts.push(label);
          if (!label.toLowerCase().includes(linkText.toLowerCase()))
            parts.push(linkText);
        } else {
          parts.push(linkText);
        }
        const [, year, month, day] = CHAPTER_PATH.exec(path)!;
        chapters.push({
          name: parts.join(' – '),
          path,
          releaseTime: `${year}-${month}-${day}`,
        });
      });
      if (hasChapter || !text) return;

      if (inContents) {
        // Context printed between chapter links: volumes and chapter groups.
        if (VOLUME_LABEL.test(text)) {
          volume = text.replace(/\s*:$/, '');
          label = '';
        } else if (text.length <= 80 && !/^you can read/i.test(text)) {
          label = text;
        }
        return;
      }

      // Everything before the first chapter is the novel's description.
      if (/^(?:type|genre|author|artist)\s*:/i.test(text)) {
        const html = block.html() || '';
        const lines = html
          .split(/<br\s*\/?>/i)
          .map(line =>
            loadCheerio(`<p>${line}</p>`)('p')
              .text()
              .replace(/\s+/g, ' ')
              .trim(),
          );
        for (const line of lines) {
          const field = /^(type|genre|author|artist)\s*:\s*(.+)$/i.exec(line);
          if (!field) continue;
          const key = field[1].toLowerCase();
          if (key === 'genre')
            novel.genres = field[2]
              .split(',')
              .map(genre => genre.trim())
              .filter(Boolean)
              .join(',');
          else if (key === 'author') novel.author = field[2].trim();
          else if (key === 'artist' && field[2].trim())
            novel.artist = field[2].trim();
        }
        return;
      }
      if (/^description$/i.test(text)) {
        inDescription = true;
        return;
      }
      if (/^(?:alternative names?|table of contents?)/i.test(text)) {
        inDescription = false;
        inContents = /^table of contents?/i.test(text);
        return;
      }
      if (inDescription) summary.push(text);
    });

    novel.chapters = chapters;
    novel.summary = summary.join('\n\n') || undefined;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.loadPage(this.resolveUrl(chapterPath));
    const content = $('.entry-content').first();
    content
      .find(
        'script,style,iframe,noscript,form,.sharedaddy,#jp-post-flair,.wp-block-spacer,#wordads-inline-marker',
      )
      .remove();
    // "<< Previous | Table of Content | Next >>" line at the end.
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      const links = paragraph.find('a');
      if (
        links.length &&
        links
          .toArray()
          .every(a =>
            NAVIGATION_LINK.test($(a).text().replace(/\s+/g, ' ').trim()),
          )
      ) {
        paragraph.remove();
      } else if (!paragraph.text().trim() && !paragraph.find('img').length) {
        paragraph.remove();
      }
    });
    const chapter = content.html() || '';
    if (!content.find('img').length && content.text().trim().length < 200)
      throw new Error('NyX Translation: no readable chapter text found.');
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    // The site's own search returns chapter posts, so match novel titles
    // against the menu instead.
    const novels = (await this.novelList()).filter(novel =>
      terms.every(term => novel.name.toLowerCase().includes(term)),
    );
    return this.toNovelItems(
      novels.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE),
    );
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (!SITE_HOST.test(url.hostname))
      throw new Error('NyX Translation: invalid page address.');
    return `${this.site}${url.pathname}${url.search}`;
  }
}

export default new NyxTranslationPlugin();
