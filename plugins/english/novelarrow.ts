import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';

class NovelArrow implements Plugin {
  id = 'novelarrow';
  name = 'Novel Arrow';
  icon = 'https://novelarrow.com/favicon-32.png';
  site = 'https://novelarrow.com/';
  version = '1.1.0';

  // Headers cần thiết để vượt qua Cloudflare và giả lập trình duyệt di động
  headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
    'Referer': 'https://novelarrow.com/',
    'x-client-platform': 'web-mobile',
    'x-device-type': 'mobile',
    'x-version-app': 'web-mobile',
  };

  async popularNovels(page: number, { filters, showLatestNovels }: Plugin.PopularNovelsOptions<typeof this.filters>) {
    let url = this.site;
    
    // Ưu tiên hiển thị danh sách Latest Updates (Giống v1.0.7) hoặc Hot/Popular nếu được chọn
    if (showLatestNovels) {
        url += `novels/latest?page=${page}`;
    } else if (filters?.genre && filters.genre !== '') {
        // Chế độ lọc nâng cao: Bắt buộc chọn Genre
        url += `genre/${filters.genre}?page=${page}`;
        if (filters.language) url += `&language=${filters.language}`;
        if (filters.sort) url += `&sort=${filters.sort}`;
    } else {
        // Mặc định cho Popular tab (v1.0.7 dùng latest, ở đây ta dùng hot/popular cho đúng nghĩa Popular)
        url += `novels/popular?page=${page}`;
    }

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
          path: href.substring(1), 
        });
      }
    });

    return novels;
  }

  async parseNovel(novelPath: string) {
    const url = `${this.site}${novelPath}`;
    const result = await fetchApi(url, { headers: this.headers }).then(res => res.text());
    const $ = parseHTML(result);

    const novelId = novelPath.replace('novel/', '');
    const novel: any = {
      path: novelPath,
      name: $('meta[name="og:novel:novel_name"]').attr('content') || 
            $('meta[property="og:title"]').attr('content')?.split(' Novel')[0] || 
            $('h1').text().trim(),
      cover: $('meta[property="og:image"]').attr('content'),
      author: $('meta[name="og:novel:author"]').attr('content') || $('meta[name="author"]').attr('content'),
      status: $('meta[name="og:novel:status"]').attr('content') === 'Ongoing' ? NovelStatus.Ongoing : NovelStatus.Completed,
      summary: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content'),
      chapters: [],
    };

    const chaptersUrl = `${this.site}api-web/novels/${novelId}/chapters?sort=asc`;
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
                path: `chapter/${novelId}/${item.chapter_id}`,
                releaseTime: null,
            }));
        }
    } catch (e) {
        const chapterRegex = /\\?"chapter_id\\?":\\?"([^"]+)\\?",\\?"chapter_name\\?":\\?"([^"]+)\\?"/g;
        let match;
        const chaptersMap = new Map();

        while ((match = chapterRegex.exec(result)) !== null) {
            const path = match[1];
            const name = match[2].replace(/\\"/g, '"');
            const fullPath = `chapter/${novelId}/${path}`;
            if (!chaptersMap.has(fullPath)) {
                chaptersMap.set(fullPath, { name, path: fullPath, releaseTime: null });
            }
        }
        novel.chapters = Array.from(chaptersMap.values());
    }

    return novel;
  }

  async parseChapter(chapterPath: string) {
    const pathParts = chapterPath.replace('chapter/', '').split('/');
    const novelId = pathParts[0];
    const chapterId = pathParts[1];

    const url = `${this.site}api-web/novels/${novelId}/chapters/${chapterId}`;
    
    try {
        const json = await fetchApi(url, { 
            headers: {
                ...this.headers,
                'Accept': 'application/json',
                'x-track-reading-progress': 'false',
            } 
        }).then(res => res.json());

        if (json && json.item && json.item.chapterInfo && json.item.chapterInfo.chapter_content) {
            return json.item.chapterInfo.chapter_content;
        }
    } catch (e) {
        const result = await fetchApi(`${this.site}${chapterPath}`, { headers: this.headers }).then(res => res.text());
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
    const url = `${this.site}novels/search?keyword=${encodeURIComponent(searchTerm)}&page=${page}`;
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
          path: href.substring(1), 
        });
      }
    });

    return novels;
  }

  readonly filters = {
    genre: {
      label: 'Genre (Mandatory for filtering)',
      type: FilterTypes.Picker,
      options: [
        { label: 'None', value: '' },
        { label: 'Action', value: 'action' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Anime & Comics', value: 'anime-&-comics' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Eastern', value: 'eastern' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fan-fiction', value: 'fan-fiction' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Game', value: 'game' },
        { label: 'Gender bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'Lgbt+', value: 'lgbt+' },
        { label: 'Litrpg', value: 'litrpg' },
        { label: 'Magic', value: 'magic' },
        { label: 'Magical realism', value: 'magical-realism' },
        { label: 'Martial arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Modern life', value: 'modern-life' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Other', value: 'other' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Realistic', value: 'realistic' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romance', value: 'romance' },
        { label: 'School life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen ai', value: 'shounen-ai' },
        { label: 'Slice of life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'System', value: 'system' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban', value: 'urban' },
        { label: 'Video games', value: 'video-games' },
        { label: 'War', value: 'war' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
    },
    sort: {
      label: 'Sort By',
      type: FilterTypes.Picker,
      options: [
        { label: 'Latest', value: 'LASTEST' },
        { label: 'New', value: 'NEW' },
        { label: 'All Time', value: 'ALL_TIME' },
        { label: 'Popular', value: 'POPULAR' },
        { label: 'Rating', value: 'RATING' },
        { label: 'Chapters', value: 'CHAPTERS' },
      ],
    },
    language: {
      label: 'Filter by Language',
      type: FilterTypes.Picker,
      options: [
        { label: 'All', value: 'ALL' },
        { label: 'English', value: 'EN' },
        { label: 'Chinese', value: 'CN' },
        { label: 'Japanese', value: 'JP' },
        { label: 'Korean', value: 'KR' },
      ],
    },
  } satisfies Filters;
}

export default new NovelArrow();
