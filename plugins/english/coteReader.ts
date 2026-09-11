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

class CoteReader implements Plugin.PluginBase {
  id = 'cote-reader';
  name = 'COTE Reader';
  site = 'https://cote-reader.me';
  icon = 'src/en/cotereader/icon.png';
  version = '1.0.1';

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

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const id = this.cleanId(novelPath);
    const metaUrl = `${this.site}/api/novels/${id}`;
    const res = await fetchApi(metaUrl);

    if (!res.ok) {
      throw new Error(`Failed to load novel metadata: HTTP ${res.status}`);
    }

    const data = (await res.json()) as CoteNovelMeta;
    const volumes = data.volumes || [];
    const isCanonical = this.canonicalIds.has(id.toLowerCase());

    const chapters: Plugin.ChapterItem[] = volumes.map((volume, index) => {
      const position = volume.position || index + 1;
      const title = volume.title || `Volume ${position}`;
      const path = isCanonical
        ? `/canonical/${id}/${volume.id}`
        : `/api/novels/${id}/volume/${volume.id}`;

      return {
        name: title,
        path,
        chapterNumber: position,
      };
    });

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
      chapters,
    };
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
        throw new Error(`Failed to fetch volume: HTTP ${res.status}`);
      }

      const json = (await res.json()) as Record<string, { title?: string; content?: string }>;
      if (chapterKey && json[chapterKey]) {
        rawHtml = json[chapterKey].content || '';
      } else {
        const keys = Object.keys(json).sort((a, b) => Number(a) - Number(b));
        rawHtml = keys
          .map((k) => {
            const item = json[k];
            const title = item.title || `Chapter ${k}`;
            return `<section class="volume-chapter"><h2 class="volume-chapter-title">${title}</h2>${item.content || ''}</section>`;
          })
          .join('\n<hr class="volume-divider" />\n');
      }
    } else if (chapterPath.startsWith('/api/novels/')) {
      const parts = chapterPath.replace(/^\/api\/novels\//, '').split('/');
      const id = parts[0];
      const volumeId = parts[2];
      const chapterIndex = parts[3];

      const volUrl = `${this.site}/api/novels/${id}/volume/${volumeId}`;
      const res = await fetchApi(volUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch volume: HTTP ${res.status}`);
      }

      const volData = (await res.json()) as VolumeApiResponse;
      if (chapterIndex && volData.chapters?.[chapterIndex]) {
        rawHtml = volData.chapters[chapterIndex].content || '';
      } else {
        const chaptersObj = volData.chapters || {};
        const toc = volData.toc || [];
        if (toc.length > 0) {
          rawHtml = toc
            .map((item) => {
              const ch = chaptersObj[item.chapterIndex];
              return `<section class="volume-chapter"><h2 class="volume-chapter-title">${item.title}</h2>${ch?.content || ''}</section>`;
            })
            .join('\n<hr class="volume-divider" />\n');
        } else {
          const keys = Object.keys(chaptersObj).sort((a, b) => Number(a) - Number(b));
          rawHtml = keys
            .map((k) => `<section class="volume-chapter">${chaptersObj[k]?.content || ''}</section>`)
            .join('\n<hr class="volume-divider" />\n');
        }
      }
    } else {
      const res = await fetchApi(
        chapterPath.startsWith('http') ? chapterPath : `${this.site}${chapterPath}`,
      );
      if (res.ok) {
        rawHtml = await res.text();
      }
    }

    return this.sanitizeChapterHtml(rawHtml);
  }

  private sanitizeChapterHtml(html: string): string {
    if (!html) return '';

    let cleaned = html.replace(
      /(<img[^>]+src=["'])(\/assets\/[^"']+)(["'])/gi,
      `$1${this.site}$2$3`,
    );

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
