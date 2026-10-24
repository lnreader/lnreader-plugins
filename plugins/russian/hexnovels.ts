import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

type ChapterData = {
  id: string;
  title: string;
  number: number;
  volume: number;
  branchId: string;
  createdAt: string;
};

class HexNovels implements Plugin.PluginBase {
  id = 'hexnovels';
  name = 'HexNovels';
  icon = 'src/ru/hexnovels/icon.png';
  site = 'https://hexnovels.me';
  version = '1.0.0';

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) throw new Error(`Could not reach site (${res.status})`);
    return res.text();
  }

  private parseNovels(html: string): Plugin.NovelItem[] {
    const $ = parseHTML(html);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    $('a[href^="/content/"]').each((_, el) => {
      const a = $(el);
      const path = a.attr('href')?.substring(1);
      const name = a.find('p.line-clamp-2').text().trim();
      const cover = a.find('img').attr('src');
      if (!path || !name || !cover || path.split('/').length !== 2) return;
      if (seen.has(path)) return;
      seen.add(path);
      novels.push({ name, path, cover });
    });
    return novels;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    return this.parseNovels(
      // The site's pages are 0-based
      await this.fetchHtml(`${this.site}/content?page=${pageNo - 1}`),
    );
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      search: searchTerm,
      page: (pageNo - 1).toString(),
    });
    return this.parseNovels(
      await this.fetchHtml(`${this.site}/content?${params.toString()}`),
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await this.fetchHtml(`${this.site}/${novelPath}`);
    const $ = parseHTML(html);
    const slug = novelPath.split('/')[1];

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').first().text().trim(),
      cover: $('meta[property="og:image"]').attr('content'),
      summary: $('meta[name="description"]').attr('content')?.trim(),
      status: NovelStatus.Unknown,
      chapters: [],
    };

    // Book data is embedded in the page's serialized router state
    const bookStart = html.indexOf(`slug:"${slug}",type:`);
    if (bookStart !== -1) {
      const status = html
        .substring(bookStart, bookStart + 4000)
        .match(/status:"(\w+)"/)?.[1];
      novel.status =
        status === 'ONGOING'
          ? NovelStatus.Ongoing
          : status === 'DONE'
            ? NovelStatus.Completed
            : status === 'FROZEN'
              ? NovelStatus.OnHiatus
              : NovelStatus.Unknown;
    }

    // All chapters (for every translation branch) are embedded in the chapters page
    const chaptersHtml = await this.fetchHtml(
      `${this.site}/${novelPath}/chapters`,
    );
    const unescape = (s: string) => JSON.parse(`"${s}"`) as string;
    const re =
      /\{id:"([0-9a-f-]{36})",name:"(?:[^"\\]|\\.)*",title:"((?:[^"\\]|\\.)*)",number:([0-9.]+),volume:(\d+)[^}]*?branchId:"([0-9a-f-]{36})"[^}]*?createdAt:"([^"]+)"/g;
    const byId = new Map<string, ChapterData>();
    for (const m of Array.from(chaptersHtml.matchAll(re))) {
      byId.set(m[1], {
        id: m[1],
        title: unescape(m[2]),
        number: parseFloat(m[3]),
        volume: parseInt(m[4], 10),
        branchId: m[5],
        createdAt: m[6],
      });
    }

    // Several translation branches can exist; use the one with the most chapters
    const branches = new Map<string, ChapterData[]>();
    for (const ch of Array.from(byId.values())) {
      const list = branches.get(ch.branchId) || [];
      list.push(ch);
      branches.set(ch.branchId, list);
    }
    const chapters = Array.from(branches.values()).sort(
      (a, b) => b.length - a.length,
    )[0];

    novel.chapters = (chapters || [])
      .sort((a, b) => a.volume - b.volume || a.number - b.number)
      .map((ch, i) => ({
        name: `Том ${ch.volume}. ${ch.title}`,
        path: `${novelPath}/${ch.id}`,
        releaseTime: ch.createdAt,
        chapterNumber: i + 1,
      }));

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = parseHTML(await this.fetchHtml(`${this.site}/${chapterPath}`));
    const content = $('.typeset-content').first();
    if (!content.length) throw new Error('Chapter content not found');
    // Illustration-only chapters load their (encrypted) images client-side
    if (!content.text().trim() && !content.find('img').length) {
      return '<p>Эта глава содержит только иллюстрации, они недоступны в приложении.</p>';
    }
    return content.html() || '';
  }
}

export default new HexNovels();
