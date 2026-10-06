import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

/**
 * Beast Novels (beastnovels.com) LNReader plugin
 *
 * A custom Laravel site, not a WordPress theme:
 *
 * - Catalog:      `/novels` embeds the whole catalog as a JSON array
 *                 (`allBooks: [...]`) that the page filters and sorts
 *                 client-side, so browsing, search and filters all work
 *                 on that one array.
 * - Novel page:   `/series/<slug>` — cover, author, synopsis, genres and
 *                 every chapter (`a.chapter-row`, oldest first). The
 *                 status badge is commented out, so status comes from
 *                 the catalog entry.
 * - Chapter page: `/series/<slug>/<n>` — text in `.chapter-content`.
 *                 Premium chapters (`data-premium="1"`) redirect to the
 *                 login page, so only free chapters are listed.
 */

type BeastBook = {
  bookname: string;
  bookslug: string;
  author: string | null;
  novel_status: string;
  totalview: number | null;
  genres: string[] | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

class BeastNovels implements Plugin.PluginBase {
  id = 'beastnovels';
  name = 'Beast Novels';
  version = '1.0.0';
  icon = 'src/en/beastnovels/icon.png';
  site = 'https://beastnovels.com/';

  private async fetchText(url: string): Promise<string> {
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

  private async fetchCatalog(): Promise<BeastBook[]> {
    const html = await this.fetchText(this.site + 'novels');
    const marker = html.search(/allBooks\s*:\s*\[/);
    if (marker === -1) throw new Error('Could not find the novel catalog');
    const start = html.indexOf('[', marker);

    // Find the matching `]` while skipping brackets inside JSON strings,
    // so the parse does not depend on the array's layout or what follows.
    let depth = 0;
    let inString = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === '[' || ch === '{') {
        depth++;
      } else if (ch === ']' || ch === '}') {
        depth--;
        if (depth === 0) return JSON.parse(html.slice(start, i + 1));
      }
    }
    throw new Error('Could not parse the novel catalog');
  }

  private toNovelItem(book: BeastBook): Plugin.NovelItem {
    return {
      name: book.bookname,
      path: 'series/' + book.bookslug,
      cover: book.image_url || defaultCover,
    };
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // The whole catalog is served on one page.
    if (pageNo > 1) return [];

    const sort = showLatestNovels ? 'updated' : filters.sort.value;
    const status = filters.status.value;
    const genres = filters.genres.value;

    const books = (await this.fetchCatalog()).filter(book => {
      if (status !== 'all' && book.novel_status !== status) return false;
      const bookGenres = (book.genres || []).map(String);
      return genres.every(g => bookGenres.includes(g));
    });

    if (sort === 'popular') {
      books.sort((a, b) => (b.totalview || 0) - (a.totalview || 0));
    } else {
      const key = sort === 'updated' ? 'updated_at' : 'created_at';
      books.sort((a, b) => Date.parse(b[key]) - Date.parse(a[key]));
    }

    return books.map(book => this.toNovelItem(book));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    // The catalog only supplies the status, so a failed catalog request
    // must not stop the novel page from loading.
    const [html, catalog] = await Promise.all([
      this.fetchText(this.site + novelPath),
      this.fetchCatalog().catch((): BeastBook[] => []),
    ]);
    const $ = parseHTML(html);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').first().text().trim() || 'Untitled',
      cover: $('#heroImg').attr('src') || defaultCover,
      author: $('h1').first().next('p').find('span').text().trim(),
      summary: $('h2:contains("Synopsis")').next().find('p').text().trim(),
      genres: $('a[href*="/novels?genre="]')
        .map((_, el) => $(el).text().trim())
        .get()
        .join(', '),
    };

    const slug = novelPath.split('/').pop();
    const book = catalog.find(b => b.bookslug === slug);
    switch (book?.novel_status) {
      case 'ongoing':
        novel.status = NovelStatus.Ongoing;
        break;
      case 'completed':
        novel.status = NovelStatus.Completed;
        break;
      case 'hiatus':
        novel.status = NovelStatus.OnHiatus;
        break;
    }

    const chapters: Plugin.ChapterItem[] = [];
    $('a.chapter-row[data-premium="0"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const num = $(el).find('.chapter-card__num').text().trim();
      const number = parseFloat($(el).attr('data-chapter-number') || '');
      chapters.push({
        name: $(el).find('.chapter-card__title').text().trim() || num,
        path: href.replace(this.site, ''),
        chapterNumber: isNaN(number) ? undefined : number,
      });
    });
    novel.chapters = chapters;

    return novel;
  }

  // Browsers ignore ASCII control characters and whitespace inside a URL
  // scheme (`java&#10;script:`), so drop them before checking the scheme.
  // The parser has already decoded entities in attribute values.
  private isUnsafeUrl(value: string): boolean {
    // eslint-disable-next-line no-control-regex
    const url = value.replace(/[\u0000- \u007f]/g, '').toLowerCase();
    return (
      url.startsWith('javascript:') ||
      url.startsWith('vbscript:') ||
      (url.startsWith('data:') && !url.startsWith('data:image/'))
    );
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchText(this.site + chapterPath);
    const $ = parseHTML(html);
    const content = $('.chapter-content');
    content.find('script, style, iframe').remove();
    content.find('*').each((_, el) => {
      if (el.type !== 'tag') return;
      for (const attr of Object.keys(el.attribs)) {
        if (/^on/i.test(attr) || this.isUnsafeUrl(el.attribs[attr])) {
          $(el).removeAttr(attr);
        }
      }
    });
    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    // The site's /search/books endpoint caps results at 7, so search the
    // full catalog by title or author instead.
    const term = searchTerm.trim().toLowerCase();
    return (await this.fetchCatalog())
      .filter(
        book =>
          book.bookname.toLowerCase().includes(term) ||
          (book.author || '').toLowerCase().includes(term),
      )
      .map(book => this.toNovelItem(book));
  }

  resolveUrl = (path: string) => this.site + path;

  filters = {
    sort: {
      label: 'Sort By',
      value: 'popular',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'Latest', value: 'latest' },
        { label: 'Updated', value: 'updated' },
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
        { label: 'Hiatus', value: 'hiatus' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'Genres',
      value: [],
      options: [
        { label: 'Action', value: '3' },
        { label: 'Adventure', value: '6' },
        { label: 'Comedy', value: '8' },
        { label: 'Fantasy', value: '5' },
        { label: 'Shounen', value: '7' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new BeastNovels();
