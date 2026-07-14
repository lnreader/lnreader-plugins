import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';

type SeanovelNovel = {
  slug: string;
  source_id: number;
  title_ar: string;
  title_original: string;
  origin: string;
  author: string;
  status: string;
  genres: string[];
  chapters_count: number;
  last_updated: string;
  description: string;
  rating: number;
  has_volumes: boolean;
  chapters: { id: number; title: string; date: string }[];
  cover_version?: number;
};

type SeanovelNovelListItem = {
  slug: string;
  title_ar: string;
  title_original: string;
  author: string;
  status: string;
  genres: string[];
  chapters_count: number;
  description: string;
};

class Seanovel implements Plugin.PluginBase {
  id = 'seanovel';
  name = 'Seanovel';
  version = '1.0.0';
  icon = 'src/ar/seanovel/icon.png';
  site = 'https://seanovel.org/';

  filters = {
    sort: {
      label: 'Sort By',
      value: 'views',
      options: [
        { label: 'Most Popular', value: 'views' },
        { label: 'Latest', value: 'latest' },
        { label: 'Rating', value: 'rating' },
      ],
      type: FilterTypes.Picker,
    },
    origin: {
      label: 'Origin',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'English', value: 'english' },
        { label: 'Chinese', value: 'chinese' },
        { label: 'Korean', value: 'korean' },
        { label: 'Japanese', value: 'japanese' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private baseUrl = 'https://seanovel.org';

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Could not reach site (${res.status})`);
    }
    return res.json() as Promise<T>;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels ? 'latest' : filters.sort.value;
    const limit = 50;
    const offset = (pageNo - 1) * limit;

    let url = `${this.baseUrl}/api/novels?sort=${sort}&page=${pageNo}&limit=${limit}&offset=${offset}`;
    if (filters.origin.value) {
      url += `&origin=${filters.origin.value}`;
    }

    const novels = await this.fetchJson<SeanovelNovelListItem[]>(url);

    return novels.map(novel => ({
      name: novel.title_original || novel.title_ar,
      path: `/novels/${novel.slug}`,
      cover: `${this.baseUrl}/api/novel/${novel.slug}/cover?type=webp`,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.replace('/novels/', '').replace(/\/$/, '');
    const novel = await this.fetchJson<SeanovelNovel>(
      `${this.baseUrl}/api/novel/${slug}`,
    );

    const statusMap: Record<string, string> = {
      ongoing: NovelStatus.Ongoing,
      completed: NovelStatus.Completed,
      hiatus: NovelStatus.OnHiatus,
      dropped: NovelStatus.Cancelled,
      cancelled: NovelStatus.Cancelled,
    };

    return {
      path: novelPath,
      name: novel.title_original || novel.title_ar,
      cover: `${this.baseUrl}/api/novel/${slug}/cover?type=webp`,
      author: novel.author || 'Unknown',
      genres: novel.genres?.join(', ') || '',
      summary: novel.description || '',
      status: statusMap[novel.status?.toLowerCase()] || NovelStatus.Unknown,
      chapters: (novel.chapters || [])
        .sort((a, b) => a.id - b.id)
        .map((ch, index) => ({
          name: ch.title || `Chapter ${ch.id}`,
          path: `/novels/${slug}/chapters/${ch.id}`,
          chapterNumber: index + 1,
          releaseTime: ch.date?.split('T')[0] || '',
        })),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.baseUrl}${chapterPath}`;
    const res = await fetchApi(url);
    const html = await res.text();

    const allChunks: string[] = [];
    const regex =
      /self\.__next_f\.push\(\s*\[\s*\d+\s*,\s*("(?:[^"\\]|\\.)*")\s*\]/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        allChunks.push(JSON.parse(match[1]));
      } catch {
        // skip unparseable chunks
      }
    }

    if (allChunks.length > 0) {
      const fullPayload = allChunks.join('');
      const initIdx = fullPayload.indexOf('initialParagraphs');
      if (initIdx > 0) {
        const arrStart = fullPayload.indexOf('[', initIdx);
        if (arrStart > 0) {
          let depth = 0;
          let arrEnd = -1;
          for (let i = arrStart; i < fullPayload.length; i++) {
            if (fullPayload[i] === '[') depth++;
            if (fullPayload[i] === ']') {
              depth--;
              if (depth === 0) {
                arrEnd = i + 1;
                break;
              }
            }
          }
          if (arrEnd > 0) {
            const raw = fullPayload.substring(arrStart, arrEnd);
            const unescaped = raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            try {
              const paragraphs: string[] = JSON.parse(unescaped);
              if (paragraphs.length > 0) {
                return paragraphs
                  .filter(p => typeof p === 'string' && p.trim())
                  .map(p => `<p>${p.trim()}</p>`)
                  .join('\n');
              }
            } catch {
              // fallback below
            }
          }
        }
      }
    }

    return '<p>Content not available. Open in webview to read.</p>';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const limit = 50;
    const offset = (pageNo - 1) * limit;
    const allNovels = await this.fetchJson<SeanovelNovelListItem[]>(
      `${this.baseUrl}/api/novels?sort=views&page=1&limit=500&offset=0`,
    );

    const term = searchTerm.toLowerCase();
    const filtered = allNovels.filter(
      n =>
        (n.title_original && n.title_original.toLowerCase().includes(term)) ||
        (n.title_ar && n.title_ar.includes(searchTerm)) ||
        (n.author && n.author.toLowerCase().includes(term)),
    );

    return filtered.slice(offset, offset + limit).map(novel => ({
      name: novel.title_original || novel.title_ar,
      path: `/novels/${novel.slug}`,
      cover: `${this.baseUrl}/api/novel/${novel.slug}/cover?type=webp`,
    }));
  }
}

export default new Seanovel();
