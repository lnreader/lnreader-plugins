import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

class NovelBuddy implements Plugin.PluginBase {
  id = 'novelbuddy';
  name = 'NovelBuddy';
  site = 'https://novelbuddy.com/';
  version = '2.0.0'; // Bumped version
  icon = 'src/en/novelbuddy/icon.png';

  headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://novelbuddy.com/',
  };

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const url = `https://api.novelbuddy.com/titles?sort=popular&page=${pageNo}`;

    try {
      const result = await fetchApi(url, { headers: this.headers });
      const json = await result.json();

      if (json?.data?.items) {
        return json.data.items.map((item: any) => ({
          name: item.name,
          cover: item.cover,
          path: item.url.replace(/^\//, ''),
        }));
      }
    } catch (e) {
      // Fallback to HTML
    }

    const htmlUrl = `${this.site}popular?page=${pageNo}`;
    const htmlRes = await fetchApi(htmlUrl, { headers: this.headers });
    const htmlBody = await htmlRes.text();
    const $ = parseHTML(htmlBody);
    const script = $('#__NEXT_DATA__').html();
    if (script) {
      const data = JSON.parse(script);
      const items = data.props.pageProps.items || [];
      return items.map((item: any) => ({
        name: item.name,
        cover: item.cover,
        path: item.url.replace(/^\//, ''),
      }));
    }
    return [];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const response = await fetchApi(this.site + novelPath, {
      headers: this.headers,
    });
    const body = await response.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could not find __NEXT_DATA__');

    const data = JSON.parse(script);
    const initialManga = data.props.pageProps.initialManga;

    if (!initialManga) throw new Error('Could not find initialManga data');

    // Fix summary formatting by preserving line breaks before stripping HTML
    let formattedSummary = initialManga.summary || '';
    formattedSummary = formattedSummary
      .replace(/<br\s*\/?>/gi, '\n') // Replace <br> or <br/> with newline
      .replace(/<\/p>/gi, '\n\n') // Replace </p> with double newline for paragraphs
      .replace(/<[^>]*>?/gm, '') // Strip all remaining HTML tags
      .trim(); // Remove extra whitespace at start/end

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: initialManga.name,
      cover: initialManga.cover,
      summary: formattedSummary,
      author: initialManga.authors?.map((a: any) => a.name).join(', ') || '',
      artist: initialManga.artists?.map((a: any) => a.name).join(', ') || '',
      status: initialManga.status,
      genres: initialManga.genres?.map((g: any) => g.name).join(',') || '',
      chapters: [],
    };

    if (initialManga.ratingStats) {
      novel.rating = initialManga.ratingStats.average;
    }

    // Fetch full chapter list from API
    const chaptersUrl = `https://api.novelbuddy.com/titles/${initialManga.id}/chapters`;
    try {
      const chaptersResponse = await fetchApi(chaptersUrl, {
        headers: this.headers,
      });
      const chaptersJson = await chaptersResponse.json();

      if (chaptersJson?.success && chaptersJson?.data?.chapters) {
        novel.chapters = chaptersJson.data.chapters
          .map((chapter: any) => ({
            name: chapter.name,
            path: chapter.url.replace(/^\//, ''),
            releaseTime: chapter.updated_at,
          }))
          .reverse();
      } else if (initialManga.chapters) {
        novel.chapters = initialManga.chapters
          .map((chapter: any) => ({
            name: chapter.name,
            path: chapter.url.replace(/^\//, ''),
            releaseTime: chapter.updatedAt,
          }))
          .reverse();
      }
    } catch (e) {
      if (initialManga.chapters) {
        novel.chapters = initialManga.chapters
          .map((chapter: any) => ({
            name: chapter.name,
            path: chapter.url.replace(/^\//, ''),
            releaseTime: chapter.updatedAt,
          }))
          .reverse();
      }
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath, {
      headers: this.headers,
    });
    const body = await result.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could not find __NEXT_DATA__');

    const data = JSON.parse(script);
    const initialChapter = data.props.pageProps.initialChapter;
    if (!initialChapter) throw new Error('Could not find chapter content');

    let content = initialChapter.content;

    if (content) {
      // Remove Webnovel watermarks/ads
      content = content.replace(
        /Find authorized novels in Webnovel.*?faster updates, better experience.*?Please click www\.webnovel\.com for visiting\./gi,
        '',
      );
      
      // Remove obfuscated freewebnovel watermarks (e.g., free𝑤𝑒𝑏novel.com)
      content = content.replace(/free.*?novel\.com/gi, '');
    }

    return content;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `https://api.novelbuddy.com/titles?q=${encodeURIComponent(searchTerm)}&page=${page}`;
    const result = await fetchApi(url, { headers: this.headers });
    const json = await result.json();

    if (!json || !json.data || !json.data.items) {
      return [];
    }

    return json.data.items.map((item: any) => ({
      name: item.name,
      cover: item.cover,
      path: item.url.replace(/^\//, ''),
    }));
  }
}

export default new NovelBuddy();
import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

class NovelBuddy implements Plugin.PluginBase {
  id = 'novelbuddy';
  name = 'NovelBuddy';
  site = 'https://novelbuddy.com/';
  version = '2.0.1'; // Bumped version
  icon = 'src/en/novelbuddy/icon.png';

  headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://novelbuddy.com/',
  };

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const url = `https://api.novelbuddy.com/titles?sort=popular&page=${pageNo}`;

    try {
      const result = await fetchApi(url, { headers: this.headers });
      const json = await result.json();

      if (json?.data?.items) {
        return json.data.items.map((item: any) => ({
          name: item.name,
          cover: item.cover,
          path: item.url.replace(/^\//, ''),
        }));
      }
    } catch (e) {
      // Fallback to HTML
    }

    const htmlUrl = `${this.site}popular?page=${pageNo}`;
    const htmlRes = await fetchApi(htmlUrl, { headers: this.headers });
    const htmlBody = await htmlRes.text();
    const $ = parseHTML(htmlBody);
    const script = $('#__NEXT_DATA__').html();
    if (script) {
      const data = JSON.parse(script);
      const items = data.props.pageProps.items || [];
      return items.map((item: any) => ({
        name: item.name,
        cover: item.cover,
        path: item.url.replace(/^\//, ''),
      }));
    }
    return [];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const response = await fetchApi(this.site + novelPath, {
      headers: this.headers,
    });
    const body = await response.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could not find __NEXT_DATA__');

    const data = JSON.parse(script);
    const initialManga = data.props.pageProps.initialManga;

    if (!initialManga) throw new Error('Could not find initialManga data');

    // Fix summary formatting by preserving line breaks before stripping HTML
    let formattedSummary = initialManga.summary || '';
    formattedSummary = formattedSummary
      .replace(/<br\s*\/?>/gi, '\n') // Replace <br> or <br/> with newline
      .replace(/<\/p>/gi, '\n\n') // Replace </p> with double newline for paragraphs
      .replace(/<[^>]*>?/gm, '') // Strip all remaining HTML tags
      .trim(); // Remove extra whitespace at start/end

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: initialManga.name,
      cover: initialManga.cover,
      summary: formattedSummary,
      author: initialManga.authors?.map((a: any) => a.name).join(', ') || '',
      artist: initialManga.artists?.map((a: any) => a.name).join(', ') || '',
      status: initialManga.status,
      genres: initialManga.genres?.map((g: any) => g.name).join(',') || '',
      chapters: [],
    };

    if (initialManga.ratingStats) {
      novel.rating = initialManga.ratingStats.average;
    }

    // Fetch full chapter list from API
    const chaptersUrl = `https://api.novelbuddy.com/titles/${initialManga.id}/chapters`;
    try {
      const chaptersResponse = await fetchApi(chaptersUrl, {
        headers: this.headers,
      });
      const chaptersJson = await chaptersResponse.json();

      if (chaptersJson?.success && chaptersJson?.data?.chapters) {
        novel.chapters = chaptersJson.data.chapters
          .map((chapter: any) => ({
            name: chapter.name,
            path: chapter.url.replace(/^\//, ''),
            releaseTime: chapter.updated_at,
          }))
          .reverse();
      } else if (initialManga.chapters) {
        novel.chapters = initialManga.chapters
          .map((chapter: any) => ({
            name: chapter.name,
            path: chapter.url.replace(/^\//, ''),
            releaseTime: chapter.updatedAt,
          }))
          .reverse();
      }
    } catch (e) {
      if (initialManga.chapters) {
        novel.chapters = initialManga.chapters
          .map((chapter: any) => ({
            name: chapter.name,
            path: chapter.url.replace(/^\//, ''),
            releaseTime: chapter.updatedAt,
          }))
          .reverse();
      }
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath, {
      headers: this.headers,
    });
    const body = await result.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could not find __NEXT_DATA__');

    const data = JSON.parse(script);
    const initialChapter = data.props.pageProps.initialChapter;
    if (!initialChapter) throw new Error('Could not find chapter content');

    let content = initialChapter.content;

    if (content) {
      // Remove Webnovel watermarks/ads
      content = content.replace(
        /Find authorized novels in Webnovel.*?faster updates, better experience.*?Please click www\.webnovel\.com for visiting\./gi,
        '',
      );
      
      // Remove obfuscated freewebnovel watermarks (e.g., free𝑤𝑒𝑏novel.com)
      content = content.replace(/free.*?novel\.com/gi, '');
    }

    return content;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `https://api.novelbuddy.com/titles?q=${encodeURIComponent(searchTerm)}&page=${page}`;
    const result = await fetchApi(url, { headers: this.headers });
    const json = await result.json();

    if (!json || !json.data || !json.data.items) {
      return [];
    }

    return json.data.items.map((item: any) => ({
      name: item.name,
      cover: item.cover,
      path: item.url.replace(/^\//, ''),
    }));
  }
}

export default new NovelBuddy();
