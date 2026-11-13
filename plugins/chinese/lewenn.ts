import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchText } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

const SITE = 'https://www.lewenn.com/';

// novel: lw11754/ ; chapter: lw11754/30307582.html
const NOVEL_PATH = /^lw\d+\/$/;
const CHAPTER_PATH = /^lw\d+\/\d+\.html$/;

// promotional lines that the chapter body carries after the text
const AD_LINE = /乐文小说网|lewenn\.com|^\(https?:\/\//;

const toPath = (href?: string): string | undefined => {
  if (!href) return undefined;
  try {
    return new URL(href, SITE).pathname.replace(/^\//, '');
  } catch {
    return undefined;
  }
};

class LeWennPlugin implements Plugin.PluginBase {
  id = 'lewenn';
  name = '乐文小说网';
  site = SITE;
  version = '1.0.0';
  icon = 'src/cn/lewenn/icon.png';
  defaultCover = defaultCover;

  filters = {
    genre: {
      label: '分类',
      value: 'home',
      options: [
        { label: '首页', value: 'home' },
        { label: '玄幻魔法', value: '1' },
        { label: '武侠修真', value: '2' },
        { label: '都市言情', value: '3' },
        { label: '历史军事', value: '4' },
        { label: '侦探推理', value: '5' },
        { label: '网游动漫', value: '6' },
        { label: '科幻小说', value: '7' },
        { label: '恐怖灵异', value: '8' },
        { label: '其他类型', value: '10' },
        { label: '全本小说', value: 'full' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  resolveUrl = (path: string) => this.site + path;

  // collects every book link on a page; the chapter links in the update
  // rows point at /lwN/<id>.html and are skipped by the NOVEL_PATH check
  private parseNovelList($: ReturnType<typeof parseHTML>): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_i, el) => {
      const $a = $(el);
      const name = $a
        .text()
        .replace(/\u00a0/g, ' ')
        .trim();
      const path = toPath($a.attr('href'));
      if (!name || !path || !NOVEL_PATH.test(path) || seen.has(path)) return;
      seen.add(path);
      novels.push({ name, path, cover: defaultCover });
    });

    return novels;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // the site serves each listing as a single page (/class/1_2.html is 404)
    if (pageNo > 1) return [];

    const genre = filters.genre.value;
    const url =
      genre === 'home'
        ? this.site
        : genre === 'full'
          ? `${this.site}full.html`
          : `${this.site}class/${genre}_1.html`;

    const body = await fetchText(url, undefined, 'gbk');
    if (!body) throw new Error(`[LeWenn] Failed to fetch: ${url}`);

    return this.parseNovelList(parseHTML(body));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    if (!NOVEL_PATH.test(novelPath))
      throw new Error(`[LeWenn] Invalid novel path: ${novelPath}`);

    const url = this.resolveUrl(novelPath);
    const body = await fetchText(url, undefined, 'gbk');
    if (!body) throw new Error(`[LeWenn] Failed to fetch: ${url}`);

    const $ = parseHTML(body);
    const getMeta = (prop: string) =>
      $(`meta[property="${prop}"]`).attr('content')?.trim() || '';

    const statusText = getMeta('og:novel:status');

    return {
      path: novelPath,
      name: getMeta('og:novel:book_name'),
      cover: getMeta('og:image') || defaultCover,
      summary:
        $('#intro')
          .text()
          .replace(/\u00a0/g, ' ')
          .trim() || undefined,
      author: getMeta('og:novel:author') || undefined,
      genres: getMeta('og:novel:category') || undefined,
      status: statusText.includes('完结')
        ? NovelStatus.Completed
        : statusText
          ? NovelStatus.Ongoing
          : NovelStatus.Unknown,
      chapters: this.parseChapterList($),
    };
  }

  // the page lists the newest 12 chapters under a 最新章节 heading, then the
  // whole book under 正文卷 in reading order; only the 正文卷 block is kept
  private parseChapterList(
    $: ReturnType<typeof parseHTML>,
  ): Plugin.ChapterItem[] {
    const mainText = new Map<string, Plugin.ChapterItem>();
    let inMainText = false;

    $('.listmain dl')
      .children()
      .each((_i, el) => {
        const $el = $(el);
        if ($el.is('dt')) {
          inMainText = $el.text().includes('正文');
          return;
        }
        if (!$el.is('dd') || !inMainText) return;

        const path = toPath($el.find('a').attr('href'));
        const name = $el.find('a').text().trim();
        if (!path || !name || !CHAPTER_PATH.test(path)) return;

        mainText.set(path, { name, path });
      });

    const list: Plugin.ChapterItem[] = [];
    mainText.forEach(chapter =>
      list.push({ ...chapter, chapterNumber: list.length + 1 }),
    );
    return list;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    if (!CHAPTER_PATH.test(chapterPath))
      throw new Error(`[LeWenn] Invalid chapter path: ${chapterPath}`);

    const url = this.resolveUrl(chapterPath);
    const body = await fetchText(url, undefined, 'gbk');
    if (!body) throw new Error(`[LeWenn] Failed to fetch chapter: ${url}`);

    const $ = parseHTML(body);
    const $content = $('#content');
    $content.find('script, ins, iframe').remove();

    const paragraphs = ($content.html() || '')
      .split(/<br\s*\/?>/i)
      .map(part =>
        parseHTML(part)
          .text()
          .replace(/\u00a0/g, ' ')
          .trim(),
      )
      .filter(line => line && !AD_LINE.test(line))
      .map(
        line =>
          `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
      );

    if (!paragraphs.length)
      throw new Error(`[LeWenn] Chapter content not found: ${url}`);

    return paragraphs.join('');
  }

  // lewenn.com has no search of its own; its search provider
  // (so.biqusoso.com) redirects to a region-blocked domain, so search returns
  // nothing rather than calling it
  async searchNovels(): Promise<Plugin.NovelItem[]> {
    return [];
  }
}

export default new LeWennPlugin();
