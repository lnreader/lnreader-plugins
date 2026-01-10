import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

const parseUrl = (url?: string): URL | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url, 'https://www.quanben.io');
  } catch {
    return undefined;
  }
};

const getStandardNovelPath = (url?: string): string | undefined => {
  const parsedUrl = parseUrl(url);
  if (!parsedUrl) return undefined;
  const match = parsedUrl.pathname.match(/^(\/amp)?(\/n\/[^\/]+\/)/);
  return match?.[2];
};

const getChapterFileName = (url?: string): string | undefined => {
  const parsedUrl = parseUrl(url);
  if (!parsedUrl) return undefined;
  const fileName = parsedUrl.pathname.split('/').pop();
  if (fileName && /^\d+\.html$/.test(fileName)) return fileName;
  return undefined;
};

const makeAbsolute = (
  relativeUrl?: string,
  baseUrl?: string,
): string | undefined => {
  if (!relativeUrl || !baseUrl) return undefined;
  try {
    if (relativeUrl.startsWith('//')) return 'https:' + relativeUrl;
    if (/^https?:\/\//.test(relativeUrl)) return relativeUrl;
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return undefined;
  }
};

class QuanbenPlugin implements Plugin.PluginBase {
  id = 'quanben';
  name = 'Quanben';
  site = 'https://www.quanben.io/';
  version = '1.0.1';
  icon = 'src/cn/quanben/icon.png';
  defaultCover = defaultCover;

  // filters
  filters = {
    genre: {
      label: '分类',
      value: 'all',
      options: [
        { label: '全部', value: 'all' },
        { label: '玄幻', value: 'xuanhuan' },
        { label: '都市', value: 'dushi' },
        { label: '言情', value: 'yanqing' },
        { label: '穿越', value: 'chuanyue' },
        { label: '青春', value: 'qingchun' },
        { label: '仙侠', value: 'xianxia' },
        { label: '灵异', value: 'lingyi' },
        { label: '悬疑', value: 'xuanyi' },
        { label: '历史', value: 'lishi' },
        { label: '军事', value: 'junshi' },
        { label: '游戏', value: 'youxi' },
        { label: '竞技', value: 'jingji' },
        { label: '科幻', value: 'kehuan' },
        { label: '职场', value: 'zhichang' },
        { label: '官场', value: 'guanchang' },
        { label: '现言', value: 'xianyan' },
        { label: '耽美', value: 'danmei' },
        { label: '其它', value: 'qita' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  // homepage, when you first open the extension (with the applied filters if any)
  async popularNovels(
    _pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      filters.genre.value === 'all'
        ? this.site
        : `${this.site}c/${filters.genre.value}.html`;

    const res = await fetchApi(url);
    if (!res.ok)
      throw new Error(`[Quanben] Failed to fetch: ${url} - ${res.status}`);

    const $ = parseHTML(await res.text());
    const novels: Plugin.NovelItem[] = [];

    $('div.list2').each((_i, list2) => {
      const $list2 = $(list2);
      const $link = $list2.find('h3 > a').first();
      const href = $link.attr('href')?.trim();
      const name = $link.text().trim();
      const rawCover =
        $list2.find('img').attr('src')?.trim() ||
        $list2.find('img').attr('data-src')?.trim();
      const cover = makeAbsolute(rawCover, this.site) || this.defaultCover;

      if (href && name) {
        const path = getStandardNovelPath(href);
        if (path) novels.push({ name, path, cover });
      }
    });

    // only first entry bcs the others dont have an image
    $('ul.list').each((_i, ul) => {
      const $firstLi = $(ul).find('li').first();
      const $a = $firstLi.find('a').first();
      const href = $a.attr('href')?.trim();
      const name =
        $a.text().trim() || $firstLi.find('span.author').text().trim();
      const cover = this.defaultCover;

      if (href && name) {
        const path = getStandardNovelPath(href);
        if (path) novels.push({ name, path, cover });
      }
    });

    return novels;
  }

  // novel details and metadata
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const standardPath = novelPath.replace(/^\/amp/, '');
    if (!standardPath.startsWith('/n/') || !standardPath.endsWith('/'))
      throw new Error(`[Quanben parseNovel] Invalid path: ${novelPath}`);

    const fullUrl = makeAbsolute(standardPath, this.site);
    if (!fullUrl)
      throw new Error(`[Quanben parseNovel] Could not construct full URL`);

    const res = await fetchApi(fullUrl);
    if (!res.ok)
      throw new Error(`[Quanben parseNovel] Failed to fetch: ${fullUrl}`);

    const $ = parseHTML(await res.text());
    const $info = $('div.list2').first();
    const $desc = $('div.description').first();

    const novel: Plugin.SourceNovel = {
      path: standardPath,
      name: $info.find('h3').text().trim() || 'Unknown Novel',
      cover:
        makeAbsolute($info.find('img').attr('src'), this.site) ||
        this.defaultCover,
      summary:
        $desc.find('p').text().trim() || $desc.text().trim() || undefined,
      author: $info.find("p:contains('作者:') span").text().trim() || undefined,
      status: NovelStatus.Unknown,
      genres: $info.find("p:contains('类别:') span").text().trim() || undefined,
      chapters: await this.parseChapterList(standardPath),
    };

    novel.status = NovelStatus.Completed;

    return novel;
  }

  async parseChapterList(novelPath: string): Promise<Plugin.ChapterItem[]> {
    if (!novelPath.startsWith('/n/') || !novelPath.endsWith('/')) return [];

    const url = makeAbsolute(novelPath + 'list.html', this.site);
    if (!url) return [];

    const res = await fetchApi(url);
    if (!res.ok) return [];

    const $ = parseHTML(await res.text());
    const chapters: Plugin.ChapterItem[] = [];
    const novelName = novelPath.match(/\/n\/([^\/]+)\//)?.[1];
    if (!novelName) return [];

    $('ul.list3 li a').each((_i, el) => {
      const $el = $(el);
      const name = $el.text().trim();
      const href = $el.attr('href');
      if (!name || !href) return;

      const fileName = getChapterFileName(makeAbsolute(href, this.site));
      if (!fileName) return;

      chapters.push({
        name,
        path: `${novelName}/${fileName}`,
      });
    });

    const uniqueChapters = Array.from(
      new Map(chapters.map(c => [c.path, c])).values(),
    );
    uniqueChapters.sort((a, b) => {
      const numA = parseInt(a.path.match(/(\d+)\.html$/)?.[1] || '0', 10);
      const numB = parseInt(b.path.match(/(\d+)\.html$/)?.[1] || '0', 10);
      return numA - numB;
    });

    return uniqueChapters.map((c, idx) => ({ ...c, chapterNumber: idx + 1 }));
  }

  async parseChapter(chapterPath: string): Promise<string> {
    if (!chapterPath.includes('/') || chapterPath.endsWith('/'))
      throw new Error(`[Quanben] Invalid chapter path: "${chapterPath}"`);

    const url = `${this.site}n/${chapterPath}`;
    const res = await fetchApi(url);
    if (!res.ok) throw new Error(`[Quanben] Failed to fetch chapter: ${url}`);

    return this.extractChapterContent(await res.text());
  }

  // Helper function to extract and clean chapter content from HTML body
  private extractChapterContent(body: string): string {
    const $ = parseHTML(body);
    let $content = $('#contentbody, #content, .content').first();
    if (!$content.length) return 'Error: Chapter content not found.';

    $content
      .find(
        'script, style, ins, iframe, [class*="ads"], [id*="ads"], [class*="google"], [id*="google"], [class*="recommend"], div[align="center"]',
      )
      .remove();

    return (
      ($content.html() || '').replace(/[\t ]+/g, ' ').trim() ||
      'Error: Chapter content empty.'
    );
  }

  // add search
  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}index.php?c=book&a=search&keywords=${encodeURIComponent(searchTerm)}`;
    const res = await fetchApi(url);
    if (!res.ok) return [];

    const $ = parseHTML(await res.text());
    const novels: Plugin.NovelItem[] = [];

    $('div.list2').each((_i, el) => {
      const $el = $(el);
      const $link = $el.find('h3 > a').first();
      const href = $link.attr('href');
      const name = $link.text().trim();
      const cover = makeAbsolute(
        $el.find('img').attr('src') || $el.find('img').attr('data-src'),
        this.site,
      );

      if (href && name) {
        const path = getStandardNovelPath(makeAbsolute(href, this.site));
        if (path)
          novels.push({
            name,
            path: '/amp' + path,
            cover: cover || this.defaultCover,
          });
      }
    });
    return novels;
  }

  async fetchImage(url: string): Promise<Response> {
    return fetchApi(url);
  }
}

export default new QuanbenPlugin();
