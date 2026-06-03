import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

class NovelArrow implements Plugin {
  id = 'novelarrow';
  name = 'Novel Arrow';
  icon = 'https://novelarrow.com/favicon-32.png';
  site = 'https://novelarrow.com/';
  version = '1.0.1';

  // Headers cần thiết để vượt qua Cloudflare và giả lập trình duyệt di động
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

    // Tìm tất cả các chương bằng Regex vì chúng nằm trong stream JSON của Next.js
    const chapterRegex = /\\?"chapter_id\\?":\\?"([^"]+)\\?",\\?"chapter_name\\?":\\?"([^"]+)\\?"/g;
    let match;
    const chaptersMap = new Map();

    while ((match = chapterRegex.exec(result)) !== null) {
      const path = match[1];
      const name = match[2].replace(/\\"/g, '"');
      if (!chaptersMap.has(path)) {
        chaptersMap.set(path, {
          name,
          path,
          releaseTime: null,
        });
      }
    }

    // Lấy chương đầu và chương cuối từ meta tags (đề phòng danh sách bị thiếu)
    const firstChapterUrl = $('meta[property="og:novel:read_url"]').attr('content');
    const latestChapterUrl = $('meta[property="og:novel:latest_chapter_url"]').attr('content');
    const latestChapterName = $('meta[property="og:novel:latest_chapter_name"]').attr('content');

    if (firstChapterUrl) {
        const path = firstChapterUrl.replace(/.*\/chapter\//, '').split('/').pop() || '';
        if (path && !chaptersMap.has(path)) {
            chaptersMap.set(path, { name: 'Chapter 1', path, releaseTime: null });
        }
    }

    if (latestChapterUrl && latestChapterName) {
        const path = latestChapterUrl.replace(/.*\/chapter\//, '').split('/').pop() || '';
        if (path && !chaptersMap.has(path)) {
            chaptersMap.set(path, { name: latestChapterName, path, releaseTime: null });
        }
    }

    novel.chapters = Array.from(chaptersMap.values());

    // Nếu không tìm thấy bằng Regex, thử dùng fallback Cheerio
    if (novel.chapters.length === 0) {
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
    }

    return novel;
  }

  async parseChapter(novelPath: string, chapterPath: string) {
    const url = `${this.site}chapter/${novelPath}/${chapterPath}`;
    const result = await fetchApi(url, { headers: this.headers }).then(res => res.text());

    // Tìm nội dung chương trong stream Next.js
    // Sử dụng Regex tham lam để lấy từ <h4> đầu tiên đến </p> cuối cùng trong block
    const contentRegex = /\\u003ch4\\u003e(.*)\\u003c\/p\\u003e/;
    const match = result.match(contentRegex);

    if (!match) {
      const $ = parseHTML(result);
      return $('.site-reading-copy').html() || "Content not found or premium.";
    }

    let chapterHtml = match[0];
    
    // Giải mã Unicode và các ký tự thoát
    chapterHtml = chapterHtml
      .replace(/\\u003c/g, '<')
      .replace(/\\u003e/g, '>')
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '')
      .replace(/\\t/g, '')
      .replace(/\\r/g, '')
      .replace(/\\\\/g, '\\');

    // Làm sạch nội dung (loại bỏ các chuỗi thừa nếu Regex tham lam lấy quá nhiều)
    // Nội dung thật thường kết thúc bằng </p> và sau đó là các ký tự điều khiển JSON
    const lastPTagIndex = chapterHtml.lastIndexOf('</p>');
    if (lastPTagIndex !== -1) {
        chapterHtml = chapterHtml.substring(0, lastPTagIndex + 4);
    }

    return chapterHtml;
  }

  async searchNovels(searchTerm: string, page: number) {
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
