import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type ChapterGroup = {
  label: string;
  chapters: {
    slug: string;
    chapter_no: string;
    subtitle?: string | null;
    locked?: boolean;
  }[];
};

/**
 * KDT Novels replaced its LightNovelWP WordPress theme with its own Next.js
 * site, so it no longer fits the lightnovelwp multisrc template.
 *
 * - Listing/search: `/search/?page=<n>&genre=<slug>&q=<term>`, 24 cards
 *                   (`a.group`) per page, most recently updated first.
 * - Novel page:     `/series/<slug>/`. The HTML only lists the chapters of
 *                   the expanded volume; every volume's chapters are in the
 *                   embedded React Server Components payload.
 * - Chapter page:   `/<chapter-slug>/`, text in `article.reader-content`.
 *                   VIP chapters render an unlock prompt instead.
 */
class KDTNovels implements Plugin.PluginBase {
  id = 'kdtnovels';
  name = 'KDT Novels';
  version = '2.0.0';
  icon = 'src/en/kdtnovels/icon.png';
  site = 'https://kdtnovels.net/';

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url);
    // Throw (carrying the HTTP status) so a runner-side block is reported
    // INCONCLUSIVE per docs/testing.md instead of an empty-result FAIL.
    if (!res.ok) {
      throw Object.assign(new Error('Request failed: ' + res.status), {
        status: res.status,
      });
    }
    return res.text();
  }

  private async fetchPage(url: string): Promise<CheerioAPI> {
    return parseHTML(await this.fetchHtml(url));
  }

  private absolute(url: string | undefined): string | undefined {
    if (!url) return undefined;
    return url.startsWith('/') ? this.site + url.slice(1) : url;
  }

  private parseCards($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    $('a.group[href^="/series/"]').each((_, el) => {
      const card = $(el);
      const title = card.find('h3');
      novels.push({
        name: title.attr('title') || title.text().trim(),
        path: card.attr('href')!.slice(1),
        cover: this.absolute(card.find('img').attr('src')) || defaultCover,
      });
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + 'search/?page=' + pageNo;
    if (!showLatestNovels && filters.genre.value) {
      url += '&genre=' + filters.genre.value;
    }
    return this.parseCards(await this.fetchPage(url));
  }

  /**
   * Reads the volume groups from the Next.js flight payload, which the page
   * streams as `self.__next_f.push([1, "<chunk>"])` script calls.
   */
  private parseChapterGroups(html: string): ChapterGroup[] | undefined {
    const pushRegex = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
    let flight = '';
    let match;
    while ((match = pushRegex.exec(html))) {
      flight += JSON.parse(match[1]);
    }
    for (const line of flight.split('\n')) {
      if (!line.includes('"groups":[')) continue;
      let row;
      try {
        row = JSON.parse(line.slice(line.indexOf(':') + 1));
      } catch {
        continue; // a text row, not a JSON one
      }
      const found = findGroups(row);
      if (found) return found;
    }
    return undefined;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await this.fetchHtml(this.site + novelPath);
    const $ = parseHTML(html);
    const title = $('main h1').first();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: title.text().trim() || 'Untitled',
      cover:
        this.absolute($('meta[property="og:image"]').attr('content')) ||
        defaultCover,
      genres: $('main a[href^="/search/?genre="]')
        .map((_, el) => $(el).text().trim())
        .get()
        .join(', '),
    };

    const summary = $('main .reader-content').first();
    const paragraphs = summary
      .find('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    novel.summary = paragraphs.length
      ? paragraphs.join('\n\n')
      : summary.text().trim();

    // "<author> · Art: <artist>", right below the title; empty when the site
    // has no credits for the series.
    // The view counter that follows is a `.flex` paragraph.
    const credits = title
      .parent()
      .next('p:not(.flex)')
      .text()
      .split(' · Art: ');
    if (credits[0].trim()) novel.author = credits[0].trim();
    if (credits[1]?.trim()) novel.artist = credits[1].trim();

    // Only finished or paused series carry a badge next to the title; the
    // site's series index lists the rest as ongoing.
    const badge = title.siblings('span').first().text().trim().toLowerCase();
    switch (badge) {
      case '':
        novel.status = NovelStatus.Ongoing;
        break;
      case 'completed':
        novel.status = NovelStatus.Completed;
        break;
      case 'hiatus':
        novel.status = NovelStatus.OnHiatus;
        break;
      default:
        novel.status = NovelStatus.Unknown;
    }

    const groups = this.parseChapterGroups(html);
    if (!groups) throw new Error('Could not find the chapter list.');
    const chapters: Plugin.ChapterItem[] = [];
    for (const group of groups) {
      for (const chapter of group.chapters) {
        let name = group.label + ' · Ch. ' + chapter.chapter_no;
        if (chapter.subtitle) name += ': ' + chapter.subtitle;
        chapters.push({
          name: chapter.locked ? '🔒 ' + name : name,
          path: chapter.slug + '/',
          chapterNumber: chapters.length + 1,
        });
      }
    }
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.fetchPage(this.site + chapterPath);
    const content = $('article.reader-content').first();
    if (!content.length) {
      if ($('main h2').text().includes('This chapter is locked')) {
        throw new Error(
          'This chapter is locked. Unlock it on KDT Novels to read it.',
        );
      }
      throw new Error('Could not find the chapter text.');
    }

    content.find('script, style, noscript').remove();
    // Illustrations are placeholders that the site's script swaps for images.
    content.find('.kdt-ilus[data-ilus]').each((_, el) => {
      const src = this.absolute($(el).attr('data-ilus'));
      $(el).replaceWith(src ? $('<img>').attr('src', src) : '');
    });

    // The app renders this HTML as is, so drop event handlers and URLs that
    // would run script.
    content.find('*').each((_, el) => {
      const node = $(el);
      for (const name of Object.keys(el.attribs)) {
        if (/^on/i.test(name)) {
          node.removeAttr(name);
        } else if (name === 'href' || name === 'src') {
          const value = el.attribs[name]
            .split('')
            .filter(c => c.charCodeAt(0) > 32)
            .join('')
            .toLowerCase();
          if (
            /^(javascript|vbscript):/.test(value) ||
            (value.startsWith('data:') && !value.startsWith('data:image/'))
          ) {
            node.removeAttr(name);
          }
        }
      }
    });
    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const $ = await this.fetchPage(
      this.site +
        'search/?q=' +
        encodeURIComponent(searchTerm.trim()) +
        '&page=' +
        pageNo,
    );
    return this.parseCards($);
  }

  resolveUrl = (path: string) => this.site + path;

  filters = {
    genre: {
      label: 'Genre',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Action', value: 'action' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Battle Royale', value: 'battle-royale' },
        { label: 'Childhood Friends', value: 'childhood-friends' },
        { label: 'Cohabitation', value: 'cohabitation' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Genderswap', value: 'genderswap' },
        { label: 'Gore', value: 'gore' },
        { label: 'Harem', value: 'harem' },
        { label: 'Horror', value: 'horror' },
        { label: 'Idol', value: 'idol' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Isekai reincarnation', value: 'isekai-reincarnation' },
        { label: 'Magic', value: 'magic' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Monster Girls', value: 'monster-girls' },
        { label: 'Monsters', value: 'monsters' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Parallel world', value: 'parallel-world' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Psychological drama', value: 'psychological-drama' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romance', value: 'romance' },
        { label: 'Romance school', value: 'romance-school' },
        { label: 'Romantic Comedy', value: 'romantic-comedy' },
        { label: 'School', value: 'school' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Sexual Violence', value: 'sexual-violence' },
        { label: 'Shonen', value: 'shonen' },
        { label: 'Shota', value: 'shota' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Survival', value: 'survival' },
        { label: 'Time Travel', value: 'time-travel' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Villainess Otome Game', value: 'villainess-otome-game' },
        { label: 'Yamikawa', value: 'yamikawa' },
        { label: 'Youth', value: 'youth' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

/** Finds the first `groups` array of chapter groups in a flight row. */
function findGroups(node: unknown): ChapterGroup[] | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const record = node as Record<string, unknown>;
  const groups = record.groups;
  if (
    Array.isArray(groups) &&
    groups.every(group => Array.isArray(group?.chapters))
  ) {
    return groups as ChapterGroup[];
  }
  for (const key in record) {
    const found = findGroups(record[key]);
    if (found) return found;
  }
  return undefined;
}

export default new KDTNovels();
