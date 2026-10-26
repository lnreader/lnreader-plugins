import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type Paginated<T> = {
  current_page: number;
  data: T[];
  next_page_url: string | null;
};

type Book = {
  title: string;
  slug: string;
  description: string | null;
  author: string | null;
  illustrator: string | null;
  cover_image: string | null;
  status?: { name: string } | null;
  tags?: { name?: string }[];
};

type Chapter = {
  chapter_title: string;
  chapter_slug: string;
  chapter_weight: number;
  body?: string | null;
  created_at: string | null;
};

class BronsTLPlugin implements Plugin.PluginBase {
  id = 'bronstl';
  name = 'BronsTL';
  icon = 'src/en/bronstl/icon.png';
  site = 'https://bronstl.com';
  version = '1.0.0';

  private headers = {
    'Accept': 'application/json',
    'Referer': 'https://bronstl.com/',
    'X-Requested-With': 'XMLHttpRequest',
  };

  private async api<T>(path: string): Promise<T> {
    const url = path.startsWith('http') ? path : this.site + '/api/' + path;
    const r = await fetchApi(url, { headers: this.headers });
    if (!r.ok) {
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    }
    return (await r.json()) as T;
  }

  private async fetchAll<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | null = path;
    let guard = 0;
    while (next && guard++ < 100) {
      const page: Paginated<T> = await this.api<Paginated<T>>(next);
      items.push(...page.data);
      next = page.next_page_url;
    }
    return items;
  }

  private toItem(book: Book): Plugin.NovelItem {
    return {
      name: book.title,
      path: 'books/' + book.slug,
      cover: book.cover_image || defaultCover,
    };
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const books = await this.fetchAll<Book>('books');
    return books.map(b => this.toItem(b));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const term = searchTerm.toLowerCase().trim();
    const books = await this.fetchAll<Book>('books');
    return books
      .filter(
        b =>
          b.title.toLowerCase().includes(term) ||
          (b.author || '').toLowerCase().includes(term),
      )
      .map(b => this.toItem(b));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.replace(/^\/?books\//, '');
    const book = await this.api<Book>('books/' + slug);

    let status: string = NovelStatus.Unknown;
    switch (book.status?.name) {
      case 'ongoing':
        status = NovelStatus.Ongoing;
        break;
      case 'finished':
        status = NovelStatus.Completed;
        break;
      case 'dropped':
        status = NovelStatus.Cancelled;
        break;
    }

    const chapters = (
      await this.fetchAll<Chapter>('books/' + slug + '/chapters')
    )
      .sort((a, b) => a.chapter_weight - b.chapter_weight)
      .map((c, i) => ({
        name: c.chapter_title,
        path: 'books/' + slug + '/chapters/' + c.chapter_slug,
        releaseTime: c.created_at,
        chapterNumber: i + 1,
      }));

    return {
      path: novelPath,
      name: book.title,
      cover: book.cover_image || defaultCover,
      author: book.author || undefined,
      artist: book.illustrator || undefined,
      summary: book.description || undefined,
      genres: (book.tags || [])
        .map(t => t.name)
        .filter(Boolean)
        .join(', '),
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const chapter = await this.api<Chapter>(chapterPath.replace(/^\//, ''));
    const $ = parseHTML(chapter.body || '');
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src && src.startsWith('/')) $(el).attr('src', this.site + src);
    });
    return $('body').html() || '';
  }

  resolveUrl(path: string): string {
    return this.site + '/' + path.replace(/^\//, '');
  }
}

export default new BronsTLPlugin();
