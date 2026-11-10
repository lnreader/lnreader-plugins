import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

/** One novel on the blog's `/index/` page. */
type NovelEntry = {
  slug: string;
  name: string;
  cover: string;
  summary: string;
  status: string;
};

/** The few `public-api.wordpress.com` post fields the chapter list needs. */
type Post = {
  ID: number;
  URL: string;
  title: string;
  date: string;
  categories: Record<string, unknown>;
};

type PostIndex = {
  found: number;
  posts: Post[];
};

/**
 * How to recognise one novel: its heading on the index page, the blog
 * categories its posts are filed under and the words its post titles use. Many
 * chapters were never categorised, so the title words are the fallback.
 */
type NovelRule = {
  slug: string;
  heading: RegExp;
  categories: string[];
  title: RegExp;
};

/** Abbreviations the blog uses for the novels, shared by matching and cleanup. */
const ABBREVIATIONS = {
  samePlace: 'sp[nsb]{3,4}',
  nuptial: 'ncnd',
  lovingYou: 'lyitd',
  ifYouDont: 'ifydgth|ifygth|iydgth|iydth|iydgh',
};

const NOVELS: NovelRule[] = [
  {
    slug: 'rolling-love',
    heading: /rolling\s*love/i,
    categories: ['Rolling Love'],
    title: /rolling\s*love/i,
  },
  {
    slug: 'same-place-not-same-bed',
    heading: /same\s*place/i,
    categories: ['Same bed'],
    title: new RegExp(
      'same\\s*place|\\b(?:' + ABBREVIATIONS.samePlace + ')\\b',
      'i',
    ),
  },
  {
    slug: 'nuptial-chamber-next-door',
    heading: /nuptial/i,
    categories: ['Nuptial Chamber', 'NCND'],
    title: new RegExp('nuptial|' + ABBREVIATIONS.nuptial, 'i'),
  },
  {
    slug: 'loving-you-is-too-difficult',
    heading: /loving\s*you/i,
    categories: ['Love you'],
    title: new RegExp('loving\\s*you|' + ABBREVIATIONS.lovingYou, 'i'),
  },
  {
    slug: 'if-you-dont-go-to-hell-who-will',
    heading: /go\s*to\s*hell/i,
    categories: ['IYDGTH', 'If you'],
    title: new RegExp('go\\s*to\\s*hell|' + ABBREVIATIONS.ifYouDont, 'i'),
  },
];

/** Novel names and abbreviations repeated in front of / behind chapter titles. */
const TAGS =
  '(?:rolling\\s*love|nuptial\\s*chamber\\s*next\\s*door|same\\s*place\\s*not\\s*same\\s*bed|loving\\s*you\\s*is\\s*too\\s*difficult|if\\s*you\\s*don.?t\\s*go\\s*to\\s*hell,?\\s*who\\s*will\\s*\\??|' +
  [
    ABBREVIATIONS.samePlace,
    ABBREVIATIONS.nuptial,
    ABBREVIATIONS.lovingYou,
    ABBREVIATIONS.ifYouDont,
  ].join('|') +
  ')';
const LEADING_TAG = new RegExp('^' + TAGS + '\\s*[–—:-]*\\s*', 'i');
const TRAILING_TAG = new RegExp('\\s*[–—:-]+\\s*' + TAGS + '$', 'i');

/** A post title that names a chapter, as opposed to an intro or announcement. */
const CHAPTER_TITLE = /prologue|epilogue|side\s*story|\bss\b|\d/i;

/**
 * Miumiu's musings (miumiu596.wordpress.com) is a small WordPress.com blog of
 * translated Chinese romance novels:
 *
 * - The `/index/` page lists every novel: a bold heading such as
 *   "Rolling love ( 82 + epilogue. Completed )", the synopsis and a cover.
 *   Its hand-made chapter links are incomplete (Loving You lists two of
 *   nineteen), so they are not used.
 * - Every chapter is a dated post (`/2017/02/01/chapter-1-1/`). The blog's
 *   public WordPress.com API lists all of them, together with the categories
 *   they were filed under, which is how a novel's chapters are collected.
 * - Posts were not always published in reading order (the first chapters of
 *   If You Don't Go To Hell, Who Will? came after chapter 32), so chapters are
 *   ordered by the number in their title rather than by date.
 * - The blog has no novel search, so search filters the novel list by name.
 */
class MiumiuPlugin implements Plugin.PluginBase {
  id = 'miumiu';
  name = "Miumiu's musings";
  icon = 'src/en/miumiu/icon.png';
  site = 'https://miumiu596.wordpress.com';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The index page holds the whole catalogue; there is no pagination.
    if (pageNo > 1) {
      return [];
    }
    return (await this.fetchCatalogue()).map(this.toNovelItem);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = this.toSlug(novelPath);
    const entry = (await this.fetchCatalogue()).find(
      item => item.slug === slug,
    );
    if (!entry) {
      throw new Error(`Miumiu: novel ${slug} is not listed on the index page`);
    }

    const chapters = await this.fetchChapters(slug);
    if (chapters.length === 0) {
      throw new Error(`Miumiu: no chapters found for ${entry.name}`);
    }

    const novel: Plugin.SourceNovel = {
      path: this.novelPath(slug),
      name: entry.name,
      cover: entry.cover,
      chapters,
    };
    if (entry.summary) {
      novel.summary = entry.summary;
    }
    if (entry.status) {
      novel.status = entry.status;
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const path = this.toChapterPath(chapterPath);
    const $ = loadCheerio(await this.fetchText(this.site + path));
    const content = $('.entry-content').first();
    if (content.length === 0) {
      throw new Error(`Miumiu: no chapter text at ${path}`);
    }

    content.find('script, style, .sharedaddy, .jp-relatedposts').remove();
    content.find('[id^="atatags"], #wordads-inline-marker').remove();
    content.find('p').each((_, el) => {
      if (!$(el).text().replace(/\s+/g, '') && $(el).find('img').length === 0) {
        $(el).remove();
      }
    });
    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) {
      return [];
    }
    const term = searchTerm.trim().toLowerCase();
    return (await this.fetchCatalogue())
      .filter(novel => novel.name.toLowerCase().indexOf(term) !== -1)
      .map(this.toNovelItem);
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/index/#' + this.toSlug(path) : path);

  private toNovelItem = (novel: NovelEntry): Plugin.NovelItem => ({
    name: novel.name,
    path: this.novelPath(novel.slug),
    cover: novel.cover,
  });

  private novelPath(slug: string): string {
    return '/index/#' + slug;
  }

  private toSlug(novelPath: string): string {
    return novelPath.split('#')[1] || novelPath.replace(/^\/+|\/+$/g, '');
  }

  /** Site-relative path of a chapter post, from a path or absolute URL. */
  private toChapterPath(href: string): string {
    return href.replace(/^https?:\/\/miumiu596\.wordpress\.com/i, '');
  }

  /** Novels in index-page order, each with its cover and synopsis. */
  private async fetchCatalogue(): Promise<NovelEntry[]> {
    const $ = loadCheerio(await this.fetchText(this.site + '/index/'));
    const entries: NovelEntry[] = [];
    let current: NovelEntry | undefined;
    let summary: string[] = [];

    const finish = () => {
      if (current) {
        current.summary = summary.join('\n');
        entries.push(current);
      }
      summary = [];
    };

    $('.entry-content')
      .first()
      .children('p')
      .each((_, el) => {
        const element = $(el);
        const text = this.normalizeText(element.text());

        const rule = element.find('b, strong').length
          ? NOVELS.find(item => item.heading.test(text))
          : undefined;
        if (rule && text.length < 150) {
          finish();
          current = {
            slug: rule.slug,
            name: this.headingName(text),
            cover: defaultCover,
            summary: '',
            status: this.headingStatus(text),
          };
          return;
        }
        if (!current) {
          return;
        }

        const image = element.find('img[src]').first().attr('src');
        if (image) {
          if (current.cover === defaultCover) {
            current.cover = image;
          }
          return;
        }
        // Chapter links and blank lines are not part of the synopsis.
        if (text && element.find('a[href]').length === 0) {
          summary.push(this.cleanSummaryLine(text));
        }
      });
    finish();

    if (entries.length === 0) {
      throw new Error('Miumiu: no novels found on the index page');
    }
    return entries;
  }

  /** "洞房花烛，隔壁 ~ Nuptial Chamber Next Door ( 54 + 2 SS Completed)" -> name. */
  private headingName(heading: string): string {
    const name = heading.replace(/\(.*$/, '').split('~').pop() || '';
    return this.normalizeText(name);
  }

  private headingStatus(heading: string): string {
    if (/completed/i.test(heading)) {
      return NovelStatus.Completed;
    }
    if (/in progress/i.test(heading)) {
      return NovelStatus.Ongoing;
    }
    return '';
  }

  private cleanSummaryLine(line: string): string {
    return line.replace(/^.*~\s*synopsis\s*:\s*/i, '');
  }

  /** Every post of the blog, via the public WordPress.com API (100 a page). */
  private async fetchPosts(): Promise<Post[]> {
    const posts: Post[] = [];
    let found = 0;
    for (let page = 1; page <= 20; page++) {
      const url =
        'https://public-api.wordpress.com/rest/v1.1/sites/miumiu596.wordpress.com/posts/' +
        `?number=100&page=${page}&order=ASC&order_by=date&fields=ID,URL,title,date,categories`;
      const data: PostIndex = JSON.parse(await this.fetchText(url));
      if (!Array.isArray(data.posts)) {
        throw new Error('Miumiu: the post list could not be read');
      }
      found = data.found;
      posts.push(...data.posts);
      if (data.posts.length < 100 || posts.length >= found) {
        break;
      }
    }
    return posts;
  }

  private async fetchChapters(slug: string): Promise<Plugin.ChapterItem[]> {
    const rule = NOVELS.find(item => item.slug === slug);
    if (!rule) {
      return [];
    }

    const items: {
      name: string;
      path: string;
      date: string;
      id: number;
      order: number;
    }[] = [];
    for (const post of await this.fetchPosts()) {
      const title = this.normalizeText(loadCheerio(post.title).text());
      if (!CHAPTER_TITLE.test(title) || this.novelOf(post, title) !== slug) {
        continue;
      }
      items.push({
        name: this.chapterName(title),
        path: this.toChapterPath(post.URL),
        date: post.date,
        id: post.ID,
        order: this.chapterOrder(title),
      });
    }

    items.sort(
      (a, b) =>
        a.order - b.order ||
        (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
        a.id - b.id,
    );
    return items.map((item, index) => ({
      name: item.name,
      path: item.path,
      releaseTime: item.date.slice(0, 10),
      chapterNumber: index + 1,
    }));
  }

  /** The novel a post belongs to: its category first, then words in its title. */
  private novelOf(post: Post, title: string): string {
    const categories = Object.keys(post.categories || {});
    const byCategory = NOVELS.find(rule =>
      rule.categories.some(name => categories.indexOf(name) !== -1),
    );
    if (byCategory) {
      return byCategory.slug;
    }
    const byTitle = NOVELS.find(rule => rule.title.test(title));
    return byTitle ? byTitle.slug : '';
  }

  /** Reading position from a title: "Ch 16/3 and 17" -> 16.3, "Epilogue" last. */
  private chapterOrder(title: string): number {
    if (/prologue/i.test(title)) {
      return -1;
    }
    const match = /(\d+)(?:[./](\d+))?/.exec(title);
    const number = match ? parseFloat(match[1] + '.' + (match[2] || '0')) : 0;
    if (/side\s*story|\bss\b/i.test(title)) {
      return 10000 + number;
    }
    if (/epilogue/i.test(title)) {
      return 5000;
    }
    return number;
  }

  /** "NCND – Ch 41.1" -> "Chapter 41.1": drop the repeated novel name. */
  private chapterName(title: string): string {
    const name = title
      .replace(LEADING_TAG, '')
      .replace(TRAILING_TAG, '')
      .trim();
    const chapter = /^(?:chapter|ch|c)\.?\s*[–—:-]*\s*(\d.*)$/i.exec(name);
    if (chapter) {
      return 'Chapter ' + chapter[1];
    }
    const label = name || title;
    return /^\d/.test(label)
      ? 'Chapter ' + label
      : label.charAt(0).toUpperCase() + label.slice(1);
  }

  private async fetchText(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) {
      // Carry the status so tooling can tell a refused/blocked request
      // (403/503) apart from a genuine parsing failure.
      throw Object.assign(
        new Error(`HTTP ${res.status} while fetching ${url}`),
        {
          status: res.status,
        },
      );
    }
    return res.text();
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
}

export default new MiumiuPlugin();
