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
  version = '1.0.2';

  // Paths are site-relative with a leading slash. Library entries saved by
  // 1.0.0 lack it, so accept both forms.
  private normalizePath(path: string): string {
    return '/' + path.replace(this.site, '').replace(/^\/+/, '');
  }

  resolveUrl = (path: string) => this.site + this.normalizePath(path);

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) throw new Error(`Could not reach site (${res.status})`);
    // The app runtime truncates `res.text()` at the first NUL byte, and the
    // site's Next.js router payload embeds NUL-separated keys. Read the body
    // as raw bytes and decode UTF-8 manually so the chapter data survives.
    const bytes = new Uint8Array(await res.arrayBuffer());
    return this.decodeUtf8(bytes);
  }

  private decodeUtf8(bytes: Uint8Array): string {
    const parts: string[] = [];
    let codes: number[] = [];
    let i = 0;
    while (i < bytes.length) {
      const b = bytes[i];
      // NUL bytes only appear inside the serialized router state; dropping
      // them keeps the surrounding HTML and JSON intact.
      if (b === 0) {
        i++;
        continue;
      }
      if (b < 0x80) {
        codes.push(b);
        i++;
      } else if (b < 0xe0) {
        codes.push(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
        i += 2;
      } else if (b < 0xf0) {
        codes.push(
          ((b & 0x0f) << 12) |
            ((bytes[i + 1] & 0x3f) << 6) |
            (bytes[i + 2] & 0x3f),
        );
        i += 3;
      } else {
        const code =
          ((b & 0x07) << 18) |
          ((bytes[i + 1] & 0x3f) << 12) |
          ((bytes[i + 2] & 0x3f) << 6) |
          (bytes[i + 3] & 0x3f);
        const surrogate = code - 0x10000;
        codes.push(0xd800 + (surrogate >> 10), 0xdc00 + (surrogate & 0x3ff));
        i += 4;
      }
      if (codes.length >= 1024) {
        parts.push(String.fromCharCode.apply(undefined, codes));
        codes = [];
      }
    }
    if (codes.length) {
      parts.push(String.fromCharCode.apply(undefined, codes));
    }
    return parts.join('');
  }

  private parseNovels(html: string): Plugin.NovelItem[] {
    const $ = parseHTML(html);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    $('a[href^="/content/"]').each((_, el) => {
      const a = $(el);
      const path = a.attr('href');
      const name = a.find('p.line-clamp-2').text().trim();
      const cover = a.find('img').attr('src');
      if (!path || !name || !cover || path.split('/').length !== 3) return;
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

  async parseNovel(path: string): Promise<Plugin.SourceNovel> {
    const novelPath = this.normalizePath(path);
    const html = await this.fetchHtml(this.resolveUrl(novelPath));
    const $ = parseHTML(html);
    const slug = novelPath.split('/')[2];

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
      `${this.resolveUrl(novelPath)}/chapters`,
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
    const $ = parseHTML(await this.fetchHtml(this.resolveUrl(chapterPath)));
    const content = $('.typeset-content').first();
    if (!content.length) throw new Error('Chapter content not found');
    // Illustration-only chapters load their (encrypted) images client-side
    if (!content.text().trim() && !content.find('img').length) {
      return '<p>Эта глава содержит только иллюстрации. Сайт загружает и расшифровывает изображения на стороне клиента, поэтому LNReader не может их показать. Откройте главу через WebView, чтобы увидеть изображения.</p>';
    }
    return content.html() || '';
  }
}

export default new HexNovels();
