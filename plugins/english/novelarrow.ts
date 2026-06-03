import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

class NovelArrow implements Plugin {
  id = 'novelarrow';
  name = 'Novel Arrow';
  icon = 'https://novelarrow.com/favicon-32.png';
  site = 'https://novelarrow.com/';
  version = '1.0.5';

  // Headers cần thiết để vượt qua Cloudflare và giả lập trình duyệt di động
  headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
    'Referer': 'https://novelarrow.com/',
    'x-client-platform': 'web-mobile',
    'x-device-type': 'mobile',
    'x-version-app': 'web-mobile',
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

    // Sử dụng API web để lấy đầy đủ danh sách chương (Hỗ trợ truyện 3000+ chương)
    const chaptersUrl = `${this.site}api-web/novels/${novelPath}/chapters?sort=asc`;
    try {
        const chaptersJson = await fetchApi(chaptersUrl, { 
            headers: {
                ...this.headers,
                'Accept': 'application/json',
            } 
        }).then(res => res.json());

        if (chaptersJson && chaptersJson.items) {
            novel.chapters = chaptersJson.items.map((item: any) => ({
                name: item.chapter_name,
                path: `${novelPath}/${item.chapter_id}`, // Lưu cả novelId và chapterId
                releaseTime: null,
            }));
        }
    } catch (e) {
        // Fallback: Tìm bằng Regex trong stream JSON của Next.js
        const chapterRegex = /\\?"chapter_id\\?":\\?"([^"]+)\\?",\\?"chapter_name\\?":\\?"([^"]+)\\?"/g;
        let match;
        const chaptersMap = new Map();

        while ((match = chapterRegex.exec(result)) !== null) {
            const path = match[1];
            const name = match[2].replace(/\\"/g, '"');
            if (!chaptersMap.has(path)) {
                chaptersMap.set(path, { name, path: `${novelPath}/${path}`, releaseTime: null });
            }
        }
        novel.chapters = Array.from(chaptersMap.values());
    }

    return novel;
  }

  async parseChapter(chapterPath: string) {
    // chapterPath có dạng "novel-slug/chapter-slug"
    const pathParts = chapterPath.split('/');
    const novelId = pathParts[0];
    const chapterId = pathParts[1];

    // API URL đúng phải có /chapters/ ở giữa
    const url = `${this.site}api-web/novels/${novelId}/chapters/${chapterId}`;
    
    try {
        const json = await fetchApi(url, { 
            headers: {
                ...this.headers,
                'Accept': 'application/json',
                'x-track-reading-progress': 'false',
            } 
        }).then(res => res.json());

        // Kiểm tra đúng cấu trúc JSON trả về: item.chapterInfo.chapter_content
        if (json && json.item && json.item.chapterInfo && json.item.chapterInfo.chapter_content) {
            return json.item.chapterInfo.chapter_content;
        }
    } catch (e) {
        // Fallback: Thử tải trang HTML và quét Regex
        const result = await fetchApi(`${this.site}chapter/${chapterPath}`, { headers: this.headers }).then(res => res.text());
        const contentRegex = /\\u003ch4\\u003e(.*)\\u003c\/p\\u003e/;
        const match = result.match(contentRegex);

        if (match) {
            let chapterHtml = match[0];
            chapterHtml = chapterHtml
                .replace(/\\u003c/g, '<')
                .replace(/\\u003e/g, '>')
                .replace(/\\"/g, '"')
                .replace(/\\n/g, '')
                .replace(/\\t/g, '')
                .replace(/\\r/g, '')
                .replace(/\\\\/g, '\\');

            const lastPTagIndex = chapterHtml.lastIndexOf('</p>');
            if (lastPTagIndex !== -1) {
                chapterHtml = chapterHtml.substring(0, lastPTagIndex + 4);
            }
            return chapterHtml;
        }

        const $ = parseHTML(result);
        return $('.site-reading-copy').html() || "Content not found or premium.";
    }

    return "Content not found or premium.";
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
