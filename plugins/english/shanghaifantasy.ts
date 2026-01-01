import { fetchApi, fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type APINovel = {
  title?: string;
  post_title?: string;
  name?: string;
  novelImage?: string;
  thumbnail?: string;
  image?: string;
  permalink?: string;
  link?: string;
  url?: string;
  novelIntro?: string;
  novelGenres?: string;
  novelStat?: string;
  id?: number;
};

type APIChapter = {
  post_title?: string;
  title?: string;
  name?: string;
  permalink?: string;
  guid?: string;
  url?: string;
  link?: string;
  post_date?: string;
  date?: string;
};

class ShanghaiFantasy implements Plugin.PluginBase {
  id = 'shanghaifantasy';
  name = 'Shanghai Fantasy';
  icon = 'src/en/shanghaifantasy/icon.png';
  site = 'https://shanghaifantasy.com';
  version = '1.2.5';
  webStorageUtilized = false;

  filters = {} satisfies Filters;

  private getNovelId(html: string): string | null {
    const dataCatMatch = html.match(/data-cat=["'](\d+)["']/);
    if (dataCatMatch) return dataCatMatch[1];
    
    const shortlinkMatch = html.match(/[?&]p=(\d+)/);
    if (shortlinkMatch) return shortlinkMatch[1];

    return null;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>?/gm, '').trim();
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    const apiUrl = `${this.site}/wp-json/fiction/v1/novels/`;
    
    const params = new URLSearchParams();
    params.append('page', pageNo.toString());
    params.append('novelstatus', '');
    params.append('term', '');
    params.append('orderby', 'date');
    params.append('order', 'desc');
    params.append('query', '');

    try {
        const response = await fetchApi(`${apiUrl}?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Referer': `${this.site}/library/?pages=${pageNo}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
        });
        
        const data = await response.json();
        const list = (Array.isArray(data) ? data : (data.data || [])) as APINovel[];

        list.forEach((novel) => {
            if (novel.title) {
                novels.push({
                    name: novel.title,
                    cover: novel.novelImage || novel.thumbnail || defaultCover,
                    path: (novel.permalink || '').replace(this.site, ''),
                });
            }
        });

    } catch (e: unknown) {
        if (e instanceof Error) {
            console.error("ShanghaiFantasy Popular Error:", e.message);
        }
    }

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const body = await fetchText(url);
    const $ = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Untitled',
      cover: defaultCover,
      status: NovelStatus.Unknown,
      chapters: [],
    };

    novel.name = $('p.text-lg.font-bold').text().trim() || 
                 $('meta[property="og:title"]').attr('content') || 
                 'Untitled';

    const coverUrl = $('img.rounded-lg, img.aspect-\\[3\\/4\\]').attr('src');
    if (coverUrl) novel.cover = coverUrl;

    $('span.font-bold').each((i, el) => {
        const label = $(el).text().trim();
        const value = $(el).parent().text().replace(label, '').trim();
        
        if (label.includes('Author')) novel.author = value;
    });

    const statusText = $('a[href*="status"]').text().trim().toLowerCase();
    if (statusText.includes('ongoing')) novel.status = NovelStatus.Ongoing;
    else if (statusText.includes('completed')) novel.status = NovelStatus.Completed;
    else if (statusText.includes('hiatus')) novel.status = NovelStatus.OnHiatus;

    const genres: string[] = [];
    $('a[href*="genre"]').each((i, el) => {
        genres.push($(el).text().trim());
    });
    if (genres.length > 0) novel.genres = genres.join(', ');

    const summaryDiv = $('div[x-show="activeTab===\'Synopsis\'"]');
    if (summaryDiv.length > 0) {
        novel.summary = summaryDiv.find('p').map((i, el) => $(el).text().trim()).get().join('\n\n');
    } else {
        novel.summary = $('meta[property="og:description"]').attr('content') || "";
    }

    const novelId = this.getNovelId(body); 

    if (novelId) {
        const chapterApiUrl = `${this.site}/wp-json/fiction/v1/chapters`;
        const params = new URLSearchParams();
        params.append('category', novelId); 
        params.append('order', 'asc');
        params.append('page', '1');
        params.append('per_page', '9999'); 

        try {
            const response = await fetchApi(`${chapterApiUrl}?${params.toString()}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Referer': url,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
            });

            const data = await response.json();
            const chapterList = (Array.isArray(data) ? data : (data.data || [])) as APIChapter[];

            if (chapterList.length > 0) {
                novel.chapters = [];
                chapterList.forEach((chap, index) => {
                    const title = chap.post_title || chap.title || `Chapter ${index + 1}`;
                    const link = chap.permalink || chap.url || chap.link;
                    const date = chap.post_date || chap.date || '';
                    
                    if (link) {
                        novel.chapters?.push({
                            name: title,
                            path: link.replace(this.site, ''),
                            chapterNumber: index + 1,
                            releaseTime: date
                        });
                    }
                });
            }
        } catch (e: unknown) {
            if (e instanceof Error) {
                console.error("ShanghaiFantasy Chapter API Error:", e.message);
            }
        }
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const body = await fetchText(url);
    const $ = loadCheerio(body);

    const contentDiv = $('.contenta, .entry-content, .reading-content').first();
    
    contentDiv.find('.ai-viewport-1, .ai-viewport-2, .ai-viewport-3, .code-block').remove();
    contentDiv.find('script, ins, button, template, div[x-data]').remove(); 
    
    return contentDiv.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    const apiUrl = `${this.site}/wp-json/fiction/v1/novels/`;

    const params = new URLSearchParams();
    params.append('page', pageNo.toString());
    params.append('novelstatus', '');
    params.append('term', '');  
    params.append('query', searchTerm); 
    params.append('orderby', ''); 
    params.append('order', '');

    try {
        const response = await fetchApi(`${apiUrl}?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Referer': `${this.site}/library/`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
        });
        
        const data = await response.json();
        const list = (Array.isArray(data) ? data : (data.data || [])) as APINovel[];

        list.forEach((novel) => {
            const title = novel.title || novel.post_title || novel.name;
            const cover = novel.novelImage || novel.thumbnail || novel.image || defaultCover;
            const link = novel.permalink || novel.link || novel.url;

            if (title && link) {
                novels.push({
                    name: title,
                    cover: cover,
                    path: link.replace(this.site, ''),
                });
            }
        });

    } catch (e: unknown) {
        if (e instanceof Error) {
            console.error("ShanghaiFantasy Search Error:", e.message);
        }
    }

    return novels;
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new ShanghaiFantasy();