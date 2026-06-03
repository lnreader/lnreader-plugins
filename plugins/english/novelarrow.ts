import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

class NovelArrow implements Plugin {
  id = 'novelarrow';
  name = 'Novel Arrow';
  icon = 'https://novelarrow.com/favicon-32.png';
  site = 'https://novelarrow.com/';
  version = '1.0.0';

  // Headers cần thiết để vượt qua Cloudflare và giả lập trình duyệt di động như bạn đã cung cấp
  headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
    'Referer': 'https://novelarrow.com/',
  };

  async popularNovels(page: number) {
    const url = `${this.site}novels/latest?page=${page}`;
    const result = await fetchApi(url, { headers: this.headers }).then(res => res.text());
    const $ = parseHTML(result);
    const novels: any[] = [];

    $('article').each((i, el) => {
      const title = $(el).find('h2').text().trim();
      const cover = $(el).find('img').attr('src');
      const href = $(el).find('a').attr('href');

      if (title && href) {
        novels.push({
          name: title,
          cover,
          path: href.replace('/novel/', ''),
        });
      }
    });

    return novels;
  }

  async parseNovel(novelPath: string) {
    const url = `${this.site}novel/${novelPath}`;
    const result = await fetchApi(url, { headers: this.headers }).then(res => res.text());
    const $ = parseHTML(result);

    const novel: any = {
      path: novelPath,
      name: $('meta[property="og:novel:novel_name"]').attr('content') || $('h1').first().text().trim(),
      cover: $('meta[property="og:image"]').attr('content'),
      author: $('meta[property="og:novel:author"]').attr('content'),
      status: $('meta[property="og:novel:status"]').attr('content') === 'Ongoing' ? NovelStatus.Ongoing : NovelStatus.Completed,
      summary: $('meta[name="description"]').attr('content'),
      chapters: [],
    };

    // Trích xuất danh sách chương từ script Next.js (thường nằm trong self.__next_f.push)
    // Lưu ý: Next.js App Router đôi khi render danh sách chương qua API riêng hoặc nhúng sâu trong script
    // Đây là logic fallback lấy từ các link có sẵn trong HTML
    $('a[href^="/chapter/"]').each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href');
      if (name && href) {
        novel.chapters.push({
          name,
          path: href.replace('/chapter/', ''),
          releaseTime: null,
        });
      }
    });

    return novel;
  }

  async parseChapter(novelPath: string, chapterPath: string) {
    const url = `${this.site}chapter/${novelPath}/${chapterPath}`;
    const result = await fetchApi(url, { headers: this.headers }).then(res => res.text());

    // Vì nội dung chương nằm trong self.__next_f.push, chúng ta dùng Regex để trích xuất HTML
    const contentMatch = result.match(/\\u003ch4\u003e(.*?)\\u003c\/p\u003e/);
    
    if (!contentMatch) {
        // Fallback: Thử tìm trong thẻ HTML thông thường nếu server-side render
        const $ = parseHTML(result);
        return $('.site-reading-copy').html() || "Content not found or premium.";
    }

    let chapterHtml = contentMatch[0];
    
    // Giải mã các ký tự Unicode/Escaped của JSON Next.js
    chapterHtml = chapterHtml
      .replace(/\\u003c/g, '<')
      .replace(/\\u003e/g, '>')
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '')
      .replace(/\\t/g, '');

    return chapterHtml;
  }

  async searchNovels(searchTerm: string, page: number) {
    // NovelArrow thường dùng query param cho search
    const url = `${this.site}novels/search?q=${encodeURIComponent(searchTerm)}&page=${page}`;
    const result = await fetchApi(url, { headers: this.headers }).then(res => res.text());
    const $ = parseHTML(result);
    const novels: any[] = [];

    $('article').each((i, el) => {
      const title = $(el).find('h2').text().trim();
      const cover = $(el).find('img').attr('src');
      const href = $(el).find('a').attr('href');

      if (title && href) {
        novels.push({
          name: title,
          cover,
          path: href.replace('/novel/', ''),
        });
      }
    });

    return novels;
  }
}

export default new NovelArrow();
