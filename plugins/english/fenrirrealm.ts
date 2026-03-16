import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Node } from 'domhandler';
import { load as loadCheerio } from 'cheerio';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { storage } from '@libs/storage';
import { defaultCover } from '@libs/defaultCover';

// Header giả lập trình duyệt để tránh bị trả về mảng rỗng []
const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://fenrirealm.com',
  'Accept-Language': 'en-US,en;q=0.9',
};

type APINovel = {
  title: string;
  slug: string;
  cover: string;
  description: string;
  status: string;
  genres: { name: string }[];
};

type APIChapter = {
  locked: { price: number } | null;
  group: null | {
    index: number;
    slug: string;
  };
  title: string;
  number: number;
  created_at: string;
};

class FenrirRealmPlugin implements Plugin.PluginBase {
  id = 'fenrir';
  name = 'Fenrir Realm';
  icon = 'src/en/fenrirrealm/icon.png';
  site = 'https://fenrirealm.com';
  version = '1.0.14'; // Tăng version để app nhận diện bản mới

  hideLocked = storage.get('hideLocked');

  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: any,
  ): Promise<Plugin.NovelItem[]> {
    let sort = filters.sort.value;
    if (showLatestNovels) sort = 'latest';
    const genresFilter = filters.genres.value
      .map((g: string) => '&genres%5B%5D=' + g)
      .join('');

    const url = `${this.site}/api/series/filter?page=${pageNo}&per_page=20&status=${filters.status.value}&order=${sort}${genresFilter}`;

    const res = await fetchApi(url, { headers: DEFAULT_HEADERS }).then(r =>
      r.json(),
    );
    return (res.data || []).map((r: APINovel) => this.parseNovelFromApi(r));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = `${this.site}/series/${novelPath}`;
    const response = await fetchApi(url, {
      headers: { ...DEFAULT_HEADERS, 'Accept': 'text/html' },
    });
    const html = await response.text();

    if (html.includes('cloudflare') || html.includes('Just a moment...')) {
      throw new Error(
        'Cloudflare bảo vệ. Hãy mở "WebView" (biểu tượng địa cầu) để xác thực người dùng.',
      );
    }

    const $ = loadCheerio(html);
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1.my-2').text().trim(),
      cover: defaultCover,
      summary: $('div.overflow-hidden.p')
        .map((i, el) => $(el).text())
        .get()
        .join('\n\n'),
    };

    // Lấy link cover từ regex (Fenrir hay giấu trong data Svelte)
    const coverMatch = html.match(/cover\s*:\s*"storage\/(.+?)"/);
    if (coverMatch) novel.cover = `${this.site}/storage/${coverMatch[1]}`;

    // Lấy danh sách chương từ API V2
    const apiURL = `${this.site}/api/new/v2/series/${novelPath}/chapters`;
    const chaptersRes = await fetchApi(apiURL, {
      headers: { ...DEFAULT_HEADERS, 'Referer': url },
    }).then(r => r.json());

    const chaptersRaw = Array.isArray(chaptersRes)
      ? chaptersRes
      : chaptersRes?.data || [];

    novel.chapters = chaptersRaw
      .map((c: APIChapter) => ({
        name:
          (c.locked?.price ? '🔒 ' : '') +
          (c.group ? `Vol ${c.group.index} ` : '') +
          `Chapter ${c.number}` +
          (c.title ? ` - ${c.title}` : ''),
        path: `${novelPath}${c.group ? '/' + c.group.slug : ''}/chapter-${c.number}`,
        releaseTime: c.created_at,
        chapterNumber: c.number + (c.group?.index || 0) * 10000,
      }))
      .sort((a: any, b: any) => a.chapterNumber - b.chapterNumber);

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.site}/series/${chapterPath}`;
    const response = await fetchApi(url, {
      headers: { ...DEFAULT_HEADERS, 'Accept': 'text/html' },
    });
    const html = await response.text();
    const $ = loadCheerio(html);

    // Cách 1: Lấy trực tiếp từ reader-area
    let chapterHtml = $('div[id^="reader-area-"]').html();

    // Cách 2: Nếu reader-area trống, tìm trong dữ liệu JSON ẩn (đặc trưng của SvelteKit)
    if (!chapterHtml || chapterHtml.trim().length < 100) {
      const contentMatch = html.match(/"content"\s*:\s*"(.+?)"/);
      if (contentMatch) {
        // Giải mã string JSON (thay thế các ký tự \n, \t...)
        chapterHtml = contentMatch[1]
          .replace(/\\n/g, '<br>')
          .replace(/\\"/g, '"');
      }
    }

    return (
      chapterHtml || 'Nội dung chương trống hoặc yêu cầu đăng nhập trên web.'
    );
  }

  // ... (Giữ nguyên searchNovels và filters của bạn)
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/api/series/filter?page=${pageNo}&per_page=20&search=${encodeURIComponent(searchTerm)}`;
    const res = await fetchApi(url, { headers: DEFAULT_HEADERS }).then(r =>
      r.json(),
    );
    return (res?.data || []).map((novel: APINovel) =>
      this.parseNovelFromApi(novel),
    );
  }

  parseNovelFromApi(apiData: APINovel) {
    return {
      name: apiData.title || '',
      path: apiData.slug || '',
      cover: apiData.cover ? `${this.site}/${apiData.cover}` : defaultCover,
      status: apiData.status === 'completed' ? 'Completed' : 'Ongoing',
      genres: (apiData.genres || []).map(g => g.name).join(','),
    };
  }
}

export default new FenrirRealmPlugin();
