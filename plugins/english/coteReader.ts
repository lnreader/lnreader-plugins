import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

interface CoteNovelMeta {
  id: string;
  slug?: string;
  title: string;
  author?: string;
  year?: string;
  volumes?: Array<{
    id: string;
    position?: number;
    title: string;
    slug?: string;
    cover?: string;
    url?: string;
    type?: string;
    section?: string;
  }>;
  tags?: string[];
  genres?: string[];
  cover?: string;
  description?: string;
  popularity?: number;
  source?: string;
}

interface VolumeTocItem {
  title: string;
  chapterIndex: number;
}

interface VolumeApiResponse {
  bookId?: string;
  seriesId?: string;
  seriesTitle?: string;
  volumeTitle?: string;
  toc?: VolumeTocItem[];
  chapters?: Record<string, { index: number; title: string; content: string }>;
}

class CoteReader implements Plugin.PagePlugin {
  id = 'cote-reader';
  name = 'COTE Reader';
  site = 'https://cote-reader.me';
  icon = 'src/en/cotereader/icon.png';
  version = '1.0.0';

  private novelCache = new Map<string, CoteNovelMeta>();
  private canonicalIds = new Set([
    'cote',
    'lotm',
    'rezero',
    'bunny-girl',
    'mushoku-tensei',
    'orv',
    'world',
    'reverend-insanity',
    'apothecary-diaries',
    'tensura',
    'tbate',
    'eightysix',
    'monogatari',
  ]);

  private formatCover(cover?: string): string {
    if (!cover) return defaultCover;
    if (cover.startsWith('http://') || cover.startsWith('https://')) return cover;
    if (cover.startsWith('/')) return `${this.site}${cover}`;
    return `${this.site}/${cover}`;
  }

  private cleanId(novelPath: string): string {
    return novelPath
      .replace(/^\/?novel\//i, '')
      .replace(/^\//, '')
      .split('/')[0]
      .trim();
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${this.site}/api/novels?page=${pageNo}&limit=20`;
    if (filters?.tag?.value) {
      url += `&tag=${encodeURIComponent(filters.tag.value)}`;
    }

    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Failed to load popular novels: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { items?: CoteNovelMeta[] };
    const items = data.items || [];

    return items.map((novel) => ({
      name: novel.title,
      path: `/novel/${novel.id}`,
      cover: this.formatCover(novel.cover),
    }));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/api/novels?q=${encodeURIComponent(searchTerm)}&page=${pageNo}&limit=20`;
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Failed to search novels: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { items?: CoteNovelMeta[] };
    const items = data.items || [];

    return items.map((novel) => ({
      name: novel.title,
      path: `/novel/${novel.id}`,
      cover: this.formatCover(novel.cover),
    }));
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const id = this.cleanId(novelPath);
    const metaUrl = `${this.site}/api/novels/${id}`;
    const res = await fetchApi(metaUrl);

    if (!res.ok) {
      throw new Error(`Failed to load novel metadata: HTTP ${res.status}`);
    }

    const data = (await res.json()) as CoteNovelMeta;
    this.novelCache.set(id, data);

    const volumes = data.volumes || [];
    const totalPages = Math.max(1, volumes.length);

    let initialChapters: Plugin.ChapterItem[] = [];
    if (totalPages > 0) {
      const firstPage = await this.parsePage(novelPath, '1');
      initialChapters = firstPage.chapters;
    }

    const genres = Array.isArray(data.tags)
      ? data.tags.join(', ')
      : Array.isArray(data.genres)
      ? data.genres.join(', ')
      : undefined;

    return {
      path: `/novel/${data.id || id}`,
      name: data.title,
      cover: this.formatCover(data.cover),
      summary: data.description,
      author: data.author,
      genres,
      status: NovelStatus.Ongoing,
      totalPages,
      chapters: initialChapters,
    };
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const id = this.cleanId(novelPath);
    let novelMeta = this.novelCache.get(id);

    if (!novelMeta) {
      const res = await fetchApi(`${this.site}/api/novels/${id}`);
      if (res.ok) {
        novelMeta = (await res.json()) as CoteNovelMeta;
        this.novelCache.set(id, novelMeta);
      }
    }

    const volumes = novelMeta?.volumes || [];
    const pageNum = parseInt(page, 10);
    const volIndex = isNaN(pageNum) || pageNum < 1 ? 0 : pageNum - 1;
    const volume = volumes[volIndex];

    if (!volume) {
      return { chapters: [] };
    }

    const chapters: Plugin.ChapterItem[] = [];
    const isCanonical = this.canonicalIds.has(id.toLowerCase());

    if (isCanonical) {
      const cacheUrl = `${this.site}/assets/cache/${id}/${volume.id}.json`;
      const res = await fetchApi(cacheUrl);

      if (res.ok) {
        const json = (await res.json()) as Record<
          string,
          { title?: string; content?: string }
        >;
        const keys = Object.keys(json).sort((a, b) => Number(a) - Number(b));

        for (const key of keys) {
          const item = json[key];
          chapters.push({
            name: `${volume.title} - ${item.title || `Chapter ${key}`}`,
            path: `/canonical/${id}/${volume.id}/${key}`,
            chapterNumber: Number(key),
          });
        }
        return { chapters };
      }
    }

    // Non-canonical novel (or canonical fallback)
    const volApiUrl = `${this.site}/api/novels/${id}/volume/${volume.id}`;
    const res = await fetchApi(volApiUrl);

    if (res.ok) {
      const volData = (await res.json()) as VolumeApiResponse;
      const toc = volData.toc || [];

      for (const item of toc) {
        chapters.push({
          name: `${volume.title} - ${item.title}`,
          path: `/api/novels/${id}/volume/${volume.id}/${item.chapterIndex}`,
          chapterNumber: item.chapterIndex,
        });
      }
    }

    return { chapters };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    let rawHtml = '';

    if (chapterPath.startsWith('/canonical/')) {
      const parts = chapterPath.replace(/^\/canonical\//, '').split('/');
      const id = parts[0];
      const volumeId = parts[1];
      const chapterKey = parts[2];

      const cacheUrl = `${this.site}/assets/cache/${id}/${volumeId}.json`;
      const res = await fetchApi(cacheUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch chapter: HTTP ${res.status}`);
      }

      const json = (await res.json()) as Record<string, { content?: string }>;
      rawHtml = json[chapterKey]?.content || '';
    } else if (chapterPath.startsWith('/api/novels/')) {
      const parts = chapterPath.replace(/^\/api\/novels\//, '').split('/');
      const id = parts[0];
      const volumeId = parts[2];
      const chapterIndex = parts[3];

      const volUrl = `${this.site}/api/novels/${id}/volume/${volumeId}`;
      const res = await fetchApi(volUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch chapter: HTTP ${res.status}`);
      }

      const volData = (await res.json()) as VolumeApiResponse;
      rawHtml = volData.chapters?.[chapterIndex]?.content || '';
    } else {
      const res = await fetchApi(
        chapterPath.startsWith('http') ? chapterPath : `${this.site}${chapterPath}`,
      );
      if (res.ok) {
        rawHtml = await res.text();
      }
    }

    // Sanitize image paths and picture tags
    return this.sanitizeChapterHtml(rawHtml);
  }

  private sanitizeChapterHtml(html: string): string {
    if (!html) return '';

    // Replace relative images /assets/... with full domain URL
    let cleaned = html.replace(
      /(<img[^>]+src=["'])(\/assets\/[^"']+)(["'])/gi,
      `$1${this.site}$2$3`,
    );

    // Some chapters use <picture><source srcset="..."><img src="..."></picture>
    // Ensure standard <img> has the best accessible URL (JPG/PNG/WebP)
    cleaned = cleaned.replace(
      /<picture>[\s\S]*?<img([^>]+src=["']https?:\/\/[^"']+["'][^>]*)>[\s\S]*?<\/picture>/gi,
      '<img$1>',
    );

    return cleaned;
  }

  filters = {
    tag: {
      value: '',
      label: 'Genre / Tag',
      options: [
        { label: 'All', value: '' },
        { label: 'Action', value: 'Action' },
        { label: 'Adventure', value: 'Adventure' },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Dark Fantasy', value: 'Dark Fantasy' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Historical', value: 'Historical' },
        { label: 'Isekai', value: 'Isekai' },
        { label: 'Mystery', value: 'Mystery' },
        { label: 'Psychological', value: 'Psychological' },
        { label: 'Romance', value: 'Romance' },
        { label: 'School', value: 'School' },
        { label: 'Sci-Fi', value: 'Sci-Fi' },
        { label: 'Slice of Life', value: 'Slice of Life' },
        { label: 'Supernatural', value: 'Supernatural' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new CoteReader();
