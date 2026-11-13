import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

// The blog is hosted on WordPress.com: every novel is a category and every
// chapter is a post of that category, so the public REST API lists them all.
const API =
  'https://public-api.wordpress.com/wp/v2/sites/pinkmuffinyum.wordpress.com';
// Categories that hold announcements and random posts, not novels.
const NOT_NOVEL = new Set(['all', 'announcements', 'random', 'uncategorized']);
// Posts with one of these words in the title are chapters. The one post of a
// category without such a word is the novel's introduction page.
const CHAPTER_TITLE =
  /\b(?:chapter|episode|prologue|epilogue|side\s*story|extra|special|interlude|afterword)\b/i;
const CHAPTER_NUMBER = /\b(?:chapter|episode)\s*(\d+(?:\.\d+)?)/i;
const CHAPTER_START =
  /\b(?:chapter|episode|prologue|epilogue|side\s*story|extra|special|interlude|afterword)\b.*$/i;
const STATUS: Record<string, string> = {
  completed: NovelStatus.Completed,
  complete: NovelStatus.Completed,
  ongoing: NovelStatus.Ongoing,
  hiatus: NovelStatus.OnHiatus,
  'on hiatus': NovelStatus.OnHiatus,
  dropped: NovelStatus.Cancelled,
};
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

type Category = {
  id: number;
  name: string;
  slug: string;
  count: number;
  description: string;
};
type PostSummary = {
  id: number;
  date_gmt: string;
  link: string;
  title: { rendered: string };
};

class PinkMuffinTLPlugin implements Plugin.PluginBase {
  id = 'pinkmuffintl';
  name = 'Pink Muffin TL';
  icon = 'src/en/pinkmuffintl/icon.png';
  site = 'https://pinkmuffinyum.wordpress.com';
  version = '1.0.0';

  private async api<T>(path: string): Promise<{ data: T; pages: number }> {
    const response = await fetchApi(`${API}${path}`);
    if (!response.ok) {
      throw new Error(`Pink Muffin TL: HTTP ${response.status}.`);
    }
    return {
      data: (await response.json()) as T,
      pages: Number(response.headers.get('x-wp-totalpages')) || 1,
    };
  }

  /**
   * Reads every page of a list endpoint. A list longer than MAX_PAGES pages is
   * refused instead of being returned truncated.
   */
  private async allPages<T>(query: string): Promise<T[]> {
    const first = await this.api<T[]>(`${query}&page=1`);
    if (first.pages > MAX_PAGES) {
      throw new Error('Pink Muffin TL: the list is too long to load.');
    }
    const items = [...first.data];
    for (let page = 2; page <= first.pages; page++) {
      items.push(...(await this.api<T[]>(`${query}&page=${page}`)).data);
    }
    return items;
  }

  private decode(text: string): string {
    return loadCheerio(`<p>${text}</p>`)('p')
      .text()
      .replace(/\uFFFC/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toNovel(category: Category): Plugin.NovelItem {
    return {
      name: this.decode(category.name),
      path: `/category/${category.slug}/`,
      cover: defaultCover,
    };
  }

  private async categories(search?: string): Promise<Category[]> {
    const query =
      '/categories?orderby=count&order=desc&_fields=id,name,slug,count,description' +
      `&per_page=${PAGE_SIZE}` +
      (search ? `&search=${encodeURIComponent(search)}` : '');
    const found = await this.allPages<Category>(query);
    return found.filter(
      category => category.count > 0 && !NOT_NOVEL.has(category.slug),
    );
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    // Every novel of the blog fits in one request.
    if (pageNo > 1) return [];
    const categories = await this.categories();
    if (showLatestNovels) {
      // Novels ordered by their most recent chapter: walk the posts from the
      // newest until every listed novel has been seen.
      const listed = new Set(categories.map(category => category.id));
      const rank = new Map<number, number>();
      for (let page = 1; page <= MAX_PAGES && rank.size < listed.size; page++) {
        const { data, pages } = await this.api<{ categories: number[] }[]>(
          `/posts?per_page=${PAGE_SIZE}&orderby=date&order=desc&_fields=categories&page=${page}`,
        );
        for (const post of data) {
          for (const id of post.categories) {
            if (listed.has(id) && !rank.has(id)) rank.set(id, rank.size);
          }
        }
        if (page >= pages) break;
      }
      categories.sort(
        (a, b) =>
          (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) ||
          b.count - a.count,
      );
    }
    return categories.map(category => this.toNovel(category));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (!term || pageNo > 1) return [];
    return (await this.categories(term)).map(category =>
      this.toNovel(category),
    );
  }

  private async allPosts(categoryId: number): Promise<PostSummary[]> {
    const query =
      `/posts?categories=${categoryId}&orderby=date&order=asc&per_page=${PAGE_SIZE}` +
      '&_fields=id,date_gmt,link,title';
    return this.allPages<PostSummary>(query);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.split('/').filter(Boolean).pop() || '';
    const { data: categories } = await this.api<Category[]>(
      `/categories?slug=${encodeURIComponent(slug)}&_fields=id,name,slug,count,description`,
    );
    const category = categories[0];
    if (!category) throw new Error('Pink Muffin TL: novel not found.');

    const posts = await this.allPosts(category.id);
    const entries = posts.map(post => ({
      post,
      title: this.decode(post.title.rendered),
    }));

    const chapters = entries
      .filter(entry => CHAPTER_TITLE.test(entry.title))
      .map((entry, index) => {
        const number = CHAPTER_NUMBER.exec(entry.title)?.[1];
        const path = new URL(entry.post.link).pathname;
        // "Reason Chapter 1" -> "Chapter 1": drop the novel's abbreviation.
        const name =
          CHAPTER_START.exec(entry.title)?.[0].replace(/^\w/, c =>
            c.toUpperCase(),
          ) || entry.title;
        return {
          index,
          // Prologues come first and side stories last; numbered chapters are
          // ordered by number because some were posted out of order.
          order: number
            ? Number(number)
            : /prologue/i.test(entry.title)
              ? -1
              : Infinity,
          chapter: {
            name,
            path,
            releaseTime: new Date(entry.post.date_gmt + 'Z').toISOString(),
            chapterNumber: number ? Number(number) : undefined,
          } as Plugin.ChapterItem,
        };
      })
      .sort((a, b) =>
        a.order === b.order ? a.index - b.index : a.order < b.order ? -1 : 1,
      )
      .map(item => item.chapter);

    // The introduction page carries the cover and the synopsis.
    const intro = entries.find(entry => !CHAPTER_TITLE.test(entry.title));
    let cover = defaultCover;
    let summary = category.description.trim() || undefined;
    let status: string | undefined;
    if (intro) {
      const { data } = await this.api<{ content: { rendered: string } }>(
        `/posts/${intro.post.id}?_fields=content`,
      );
      const $ = loadCheerio(data.content.rendered);
      const image = $('img[src]').first().attr('src');
      if (image) cover = image.split('?')[0];
      $('script, style, img, figure').remove();
      $('br').replaceWith('\n');
      const lines = $('p')
        .toArray()
        .flatMap(p => $(p).text().split('\n'))
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      // Some introductions end with "Status: Completed" and empty headings.
      const statusText = lines
        .map(line => /^status\s*:\s*(.+)$/i.exec(line)?.[1])
        .find(Boolean);
      status = statusText ? STATUS[statusText.toLowerCase()] : undefined;
      const text = lines
        .filter(line => !/^(?:status|main story|side stories?)\s*:/i.test(line))
        .join('\n');
      summary = text || summary;
    }

    return {
      path: novelPath,
      name: this.decode(category.name),
      cover,
      summary,
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const slug = chapterPath.split('/').filter(Boolean).pop() || '';
    const { data } = await this.api<
      { link: string; content: { rendered: string } }[]
    >(`/posts?slug=${encodeURIComponent(slug)}&_fields=link,content`);
    const post =
      data.find(item => new URL(item.link).pathname === chapterPath) || data[0];
    if (!post) throw new Error('Pink Muffin TL: chapter not found.');

    const $ = loadCheerio(`<div id="chapter">${post.content.rendered}</div>`);
    const content = $('#chapter');
    content.find('script, style, iframe, .wp-block-spacer').remove();
    // "Last | TOC | Next" navigation line and the separator above it.
    content.find('p').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (/^(?:(?:last|prev(?:ious)?|toc|next)\s*\|?\s*)+$/i.test(text)) {
        $(el).prev('hr').remove();
        $(el).remove();
      } else if (!text && !$(el).find('img').length) {
        $(el).remove();
      }
    });
    const html = content.html()?.trim() || '';
    if (loadCheerio(html).text().trim().length < 50 && !/<img/.test(html)) {
      throw new Error('Pink Muffin TL: no readable chapter text found.');
    }
    return html;
  }

  resolveUrl = (path: string) => new URL(path, this.site).href;
}

export default new PinkMuffinTLPlugin();
