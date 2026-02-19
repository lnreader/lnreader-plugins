import { fetchApi } from '@libs/fetch';
import { Filters } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { storage } from '@libs/storage';
import { load as parseHTML } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';

class KavitaPlugin implements Plugin.PluginBase {
  id = 'kavita';
  name = 'Kavita';
  icon = 'src/multi/kavita/icon.png';
  version = '1.0.0';

  site = '';
  apiKey = '';

  pluginSettings = {
    url: {
      value: '',
      label: 'Kavita URL',
      type: 'Text',
    },
    apiKey: {
      value: '',
      label: 'API Key',
      type: 'Text',
    },
  };

  imageRequestInit?: Plugin.ImageRequestInit;

  constructor() {
    this.site = storage.get('url') || '';
    this.apiKey = storage.get('apiKey') || '';
  }

  private async getToken(): Promise<string> {
    const token = storage.get('token');
    if (token) {
      if (!this.imageRequestInit) {
        this.updateImageRequestInit(token);
      }
      return token;
    }

    if (!this.site || !this.apiKey) return '';

    try {
      const authUrl = `${this.site}/api/Plugin/authenticate?apiKey=${this.apiKey}&pluginName=LNReader`;
      const response = await fetchApi(authUrl, { method: 'POST' });
      const data = await response.json();

      if (data && data.token) {
        storage.set('token', data.token);
        this.updateImageRequestInit(data.token);
        return data.token;
      }
    } catch (e) {
      console.error('Kavita login failed', e);
    }
    return '';
  }

  private updateImageRequestInit(token: string) {
    this.imageRequestInit = {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
  }

  async makeRequest(url: string, init?: any): Promise<Response> {
    let token = await this.getToken();
    const headers = new Headers(init?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetchApi(url, { ...init, headers });
    if (res.status === 401) {
        // Token might be expired
        storage.delete('token');
        token = await this.getToken(); // Retry once
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
            this.updateImageRequestInit(token);
            return fetchApi(url, { ...init, headers });
        }
    }
    return res;
  }

  async popularNovels(
    _pageNo: number,
    { filters: _filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/api/Series/all-v2`;

    // Construct filter if needed. For now, empty filter to get everything.
    // If user specified library filter, we could add it here.
    // But since libraryId in query is unused, we'd need FilterV2Dto.
    // Sending empty body to get all series.

    const body = {
        statements: [],
        combination: 1, // AND?
        limitTo: 0
    };

    const res = await this.makeRequest(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
    });

    const seriesList = await res.json();
    const novels: Plugin.NovelItem[] = [];

    for (const series of seriesList) {
        novels.push({
            name: series.name,
            path: series.id.toString(),
            cover: `${this.site}/api/Image/series-cover?seriesId=${series.id}&apiKey=${this.apiKey}`,
        });
    }

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const seriesId = novelPath;
    const seriesUrl = `${this.site}/api/Series/${seriesId}`;
    const metadataUrl = `${this.site}/api/Series/metadata?seriesId=${seriesId}`;
    const volumesUrl = `${this.site}/api/Series/volumes?seriesId=${seriesId}`;

    const [seriesRes, metadataRes, volumesRes] = await Promise.all([
      this.makeRequest(seriesUrl),
      this.makeRequest(metadataUrl),
      this.makeRequest(volumesUrl),
    ]);

    const series = await seriesRes.json();
    const metadata = await metadataRes.json();
    const volumes = await volumesRes.json();

    const novel: Plugin.SourceNovel = {
      path: seriesId,
      name: series.name,
      cover: `${this.site}/api/Image/series-cover?seriesId=${seriesId}&apiKey=${this.apiKey}`,
      summary: metadata.summary || '',
      author:
        metadata.writers?.map((w: any) => w.name).join(', ') || 'Unknown Author',
      status: NovelStatus.Unknown,
      chapters: [],
    };

    if (metadata.genres) {
      novel.genres = metadata.genres.map((g: any) => g.title).join(', ');
    }

    // Map publication status
    // 0: Ongoing, 1: Hiatus, 2: Completed, 3: Cancelled, 4: Ended
    switch (metadata.publicationStatus) {
      case 0:
        novel.status = NovelStatus.Ongoing;
        break;
      case 1:
        novel.status = NovelStatus.OnHiatus;
        break;
      case 2:
      case 4:
        novel.status = NovelStatus.Completed;
        break;
      case 3:
        novel.status = NovelStatus.Cancelled;
        break;
      default:
        novel.status = NovelStatus.Unknown;
    }

    const chapters: Plugin.ChapterItem[] = [];

    for (const volume of volumes) {
      for (const chapter of volume.chapters) {
        chapters.push({
          name: chapter.title || `Chapter ${chapter.number}`,
          path: chapter.id.toString(),
          chapterNumber: parseFloat(chapter.number),
          releaseTime: chapter.releaseDate
            ? new Date(chapter.releaseDate).toISOString()
            : undefined,
        });
      }
    }

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const chapterId = chapterPath;
    const url = `${this.site}/api/Book/${chapterId}/book-page`;

    const res = await this.makeRequest(url);
    const html = await res.text();

    return this.fixHtml(html);
  }

  fixHtml(html: string): string {
    const $ = parseHTML(html);
    const baseUrl = this.site;
    const apiKey = this.apiKey;

    $('img').each((_, element) => {
        const src = $(element).attr('src');
        if (src && !src.startsWith('http')) {
            // Prepend base URL
            let newSrc = src.startsWith('/') ? `${baseUrl}${src}` : `${baseUrl}/${src}`;
            // Append apiKey for auth
            if (apiKey) {
                newSrc += (newSrc.includes('?') ? '&' : '?') + `apiKey=${apiKey}`;
            }
            $(element).attr('src', newSrc);
        }
    });

    // Also fix links?
    $('a').each((_, element) => {
       // Replace links with text or fix href
       // $(element).replaceWith($(element).text());
       // Start with keeping links but fixing href if relative
       const href = $(element).attr('href');
       if (href && !href.startsWith('http')) {
           $(element).attr('href', href.startsWith('/') ? `${baseUrl}${href}` : `${baseUrl}/${href}`);
       }
    });

    return $.html();
  }

  async searchNovels(searchTerm: string, _pageNo: number): Promise<Plugin.NovelItem[]> {
      const url = `${this.site}/api/Search/search?queryString=${encodeURIComponent(searchTerm)}`;
      const res = await this.makeRequest(url);
      const data = await res.json();

      const novels: Plugin.NovelItem[] = [];
      if (data.series) {
          for (const series of data.series) {
              novels.push({
                  name: series.name,
                  path: series.id.toString(),
                  cover: `${this.site}/api/Image/series-cover?seriesId=${series.id}&apiKey=${this.apiKey}`,
              });
          }
      }
      return novels;
  }

  filters = {
      // Define filters if needed, e.g. Library
  } satisfies Filters;
}

export default new KavitaPlugin();
