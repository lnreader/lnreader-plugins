import { fetchApi } from '@libs/fetch';
import type { Plugin } from '@/types/plugin';
import { FilterTypes, type Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const GENRE_OPTIONS = [
  { label: 'Action', value: 'action' },
  { label: 'Adult', value: 'adult' },
  { label: 'Adventure', value: 'adventure' },
  { label: 'Comedy', value: 'comedy' },
  { label: 'Drama', value: 'drama' },
  { label: 'Eastern', value: 'eastern' },
  { label: 'Ecchi', value: 'ecchi' },
  { label: 'Fan-Fiction', value: 'fan-fiction' },
  { label: 'Fantasy', value: 'fantasy' },
  { label: 'Game', value: 'game' },
  { label: 'Gender Bender', value: 'gender bender' },
  { label: 'Harem', value: 'harem' },
  { label: 'Historical', value: 'historical' },
  { label: 'Horror', value: 'horror' },
  { label: 'Isekai', value: 'isekai' },
  { label: 'Josei', value: 'josei' },
  { label: 'LGBT+', value: 'lgbt+' },
  { label: 'LitRPG', value: 'litrpg' },
  { label: 'Magic', value: 'magic' },
  { label: 'Magical Realism', value: 'magical realism' },
  { label: 'Manhua', value: 'manhua' },
  { label: 'Martial Arts', value: 'martial arts' },
  { label: 'Mature', value: 'mature' },
  { label: 'Mecha', value: 'mecha' },
  { label: 'Military', value: 'military' },
  { label: 'Modern Life', value: 'modern life' },
  { label: 'Mystery', value: 'mystery' },
  { label: 'Other', value: 'other' },
  { label: 'Psychological', value: 'psychological' },
  { label: 'Reincarnation', value: 'reincarnation' },
  { label: 'Romance', value: 'romance' },
  { label: 'School Life', value: 'school life' },
  { label: 'Sci-Fi', value: 'sci-fi' },
  { label: 'Seinen', value: 'seinen' },
  { label: 'Shoujo', value: 'shoujo' },
  { label: 'Shoujo Ai', value: 'shoujo ai' },
  { label: 'Shounen', value: 'shounen' },
  { label: 'Shounen Ai', value: 'shounen ai' },
  { label: 'Slice Of Life', value: 'slice of life' },
  { label: 'Smut', value: 'smut' },
  { label: 'Sports', value: 'sports' },
  { label: 'Supernatural', value: 'supernatural' },
  { label: 'System', value: 'system' },
  { label: 'Thriller', value: 'thriller' },
  { label: 'Tragedy', value: 'tragedy' },
  { label: 'Urban', value: 'urban' },
  { label: 'Urban Life', value: 'urban life' },
  { label: 'Video Games', value: 'video games' },
  { label: 'War', value: 'war' },
  { label: 'Wuxia', value: 'wuxia' },
  { label: 'Xianxia', value: 'xianxia' },
  { label: 'Xuanhuan', value: 'xuanhuan' },
  { label: 'Yaoi', value: 'yaoi' },
  { label: 'Yuri', value: 'yuri' },
] as const;

type NovelArchiveNovel = {
  id?: string;
  title?: string;
  author?: string;
  genres?: string;
  description?: string;
  cover_url?: string;
  novel_image?: string;
  image_url?: string;
  total_chapters?: string | number;
  release_status?: string;
  ongoing?: string;
  chapter_names?: string[];
};

type NovelsResponse = {
  novels?: NovelArchiveNovel[];
};

type NovelResponse = {
  novel?: NovelArchiveNovel;
};

type ChapterResponse = {
  chapter?: {
    number?: number;
    name?: string;
    content?: string;
  };
};

class NovelArchivePlugin implements Plugin.PluginBase {
  id = 'novelarchive';
  name = 'NovelArchive';
  icon = 'src/en/novelarchive/icon.png';
  site = 'https://novelarchive.cc';
  version = '1.0.0';
  filters = {
    sort: {
      type: FilterTypes.Picker,
      value: 'recent',
      label: 'Sort by',
      options: [
        { label: 'Recent', value: 'recent' },
        { label: 'Popular', value: 'popular' },
        { label: 'Top Rated', value: 'rating' },
        { label: 'Chapters', value: 'chapters' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
      ],
    },
    genre: {
      type: FilterTypes.ExcludableCheckboxGroup,
      value: {
        include: [],
        exclude: [],
      },
      label: 'Genres',
      options: GENRE_OPTIONS,
    },
  } satisfies Filters;
  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site,
    },
  };

  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const endpoint = this.getPopularEndpoint(pageNo, showLatestNovels, filters);
    const response = await this.apiGet<NovelsResponse>(endpoint);

    return this.toNovelItems(response.novels);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const id = this.extractNovelId(novelPath);
    const response = await this.apiGet<NovelResponse>(
      `/api/novels/${encodeURIComponent(id)}`,
    );
    const source = response.novel;

    if (!source) {
      throw new Error(`NovelArchive novel not found: ${id}`);
    }

    const author = this.cleanText(source.author);
    const novel: Plugin.SourceNovel = {
      path: id,
      name: this.cleanText(source.title) || 'Untitled',
      author: author || undefined,
      artist: author || undefined,
      cover: this.absoluteUrl(
        source.cover_url || source.novel_image || source.image_url,
      ),
      genres: this.normalizeGenres(source.genres),
      status: this.toNovelStatus(source.release_status || source.ongoing),
      summary: this.cleanText(source.description) || undefined,
      chapters: this.toChapters(id, source),
    };

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const { novelId, chapterNumber } = this.parseChapterPath(chapterPath);
    const response = await this.apiGet<ChapterResponse>(
      `/api/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(
        chapterNumber,
      )}`,
    );
    const content = response.chapter?.content;

    if (!content) {
      throw new Error(`NovelArchive chapter not found: ${chapterPath}`);
    }

    return this.toChapterHtml(content);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const query = searchTerm.trim();

    if (!query) {
      return [];
    }

    const params = new URLSearchParams({
      search: query,
      page: String(Math.max(1, pageNo)),
      per_page: '20',
      fuzzy: '1',
    });
    const response = await this.apiGet<NovelsResponse>(
      `/api/novels?${params.toString()}`,
    );

    return this.toNovelItems(response.novels);
  }

  resolveUrl = (path: string, isNovel?: boolean) => {
    if (isNovel) {
      return `${this.site}/novel?id=${encodeURIComponent(
        this.extractNovelId(path),
      )}`;
    }

    const { novelId, chapterNumber } = this.parseChapterPath(path);
    return `${this.site}/reader?novel=${encodeURIComponent(
      novelId,
    )}&chapter=${encodeURIComponent(chapterNumber)}`;
  };

  private async apiGet<T>(path: string): Promise<T> {
    const response = await fetchApi(`${this.site}${path}`, {
      headers: {
        Accept: 'application/json',
        Referer: this.site,
      },
    });

    if ('ok' in response && !response.ok) {
      throw new Error(`NovelArchive request failed: ${path}`);
    }

    return response.json();
  }

  private getPopularEndpoint(
    pageNo: number,
    showLatestNovels: boolean,
    filters: Plugin.PopularNovelsOptions<typeof this.filters>['filters'],
  ): string {
    if (showLatestNovels) {
      return '/api/novels/recently-updated?limit=20';
    }

    if (!this.hasActiveBrowseFilters(filters)) {
      return '/api/novels/trending?limit=20';
    }

    const params = new URLSearchParams({
      page: String(Math.max(1, pageNo)),
      per_page: '20',
    });
    const sort = this.cleanText(filters?.sort.value);
    const status = this.cleanText(filters?.status.value);
    const includedGenres = this.toStringList(filters?.genre.value.include);
    const excludedGenres = this.toStringList(filters?.genre.value.exclude);

    if (sort && sort !== 'recent') {
      params.set('sort', sort);
    }

    if (status && status !== 'all') {
      params.set('status', status);
    }

    if (includedGenres.length) {
      params.set('genres_include', includedGenres.join(','));
    }

    if (excludedGenres.length) {
      params.set('genres_exclude', excludedGenres.join(','));
    }

    return `/api/novels?${params.toString()}`;
  }

  private hasActiveBrowseFilters(
    filters: Plugin.PopularNovelsOptions<typeof this.filters>['filters'],
  ): boolean {
    if (!filters) {
      return false;
    }

    const sort = this.cleanText(filters.sort.value);
    const status = this.cleanText(filters.status.value);
    const includedGenres = this.toStringList(filters.genre.value.include);
    const excludedGenres = this.toStringList(filters.genre.value.exclude);

    return (
      (sort !== '' && sort !== 'recent') ||
      (status !== '' && status !== 'all') ||
      includedGenres.length > 0 ||
      excludedGenres.length > 0
    );
  }

  private toNovelItems(
    novels: NovelArchiveNovel[] | undefined,
  ): Plugin.NovelItem[] {
    return (novels || [])
      .filter(novel => novel.id && novel.title)
      .map(novel => ({
        name: this.cleanText(novel.title) || 'Untitled',
        path: String(novel.id),
        cover: this.absoluteUrl(
          novel.cover_url || novel.novel_image || novel.image_url,
        ),
      }));
  }

  private toChapters(
    novelId: string,
    novel: NovelArchiveNovel,
  ): Plugin.ChapterItem[] {
    const names = Array.isArray(novel.chapter_names) ? novel.chapter_names : [];
    const fallbackTotal = this.toPositiveInteger(novel.total_chapters);
    const chapterNames = names.length
      ? names
      : Array.from({ length: fallbackTotal }, (_value, index) => {
          return `Chapter ${index + 1}`;
        });

    return chapterNames.map((name, index) => {
      const fallback = index + 1;
      const chapterNumber = this.chapterNumberFromName(name, fallback);

      return {
        name: this.cleanText(name) || `Chapter ${chapterNumber}`,
        path: `${novelId}/${chapterNumber}`,
        chapterNumber,
      };
    });
  }

  private absoluteUrl(value: string | undefined): string {
    const url = this.cleanText(value);

    if (!url) {
      return defaultCover;
    }

    if (/^https?:\/\//i.test(url)) {
      return url;
    }

    return `${this.site}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  private normalizeGenres(value: string | undefined): string | undefined {
    const genres = String(value || '')
      .split(',')
      .map(genre => genre.trim())
      .filter(Boolean);

    if (!genres.length) {
      return undefined;
    }

    return Array.from(new Set(genres)).join(', ');
  }

  private toNovelStatus(value: string | undefined): string {
    const status = String(value || '').toLowerCase();

    if (status.includes('completed')) {
      return NovelStatus.Completed;
    }

    return NovelStatus.Ongoing;
  }

  private parseChapterPath(chapterPath: string) {
    const [rawNovelId, rawChapterNumber] = chapterPath.split('/');
    const novelId = this.extractNovelId(rawNovelId);
    const chapterNumber = this.toPositiveInteger(rawChapterNumber);

    if (!novelId || !chapterNumber) {
      throw new Error(`Invalid NovelArchive chapter path: ${chapterPath}`);
    }

    return {
      novelId,
      chapterNumber: String(chapterNumber),
    };
  }

  private extractNovelId(path: string): string {
    const value = this.cleanText(path);
    const match = value.match(/[?&]id=([^&]+)/);

    return decodeURIComponent(match?.[1] || value);
  }

  private chapterNumberFromName(name: string, fallback: number): number {
    const match = String(name || '').match(/chapter\s*(\d+)/i);
    const parsed = match ? Number.parseInt(match[1], 10) : NaN;

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private toPositiveInteger(value: unknown): number {
    const parsed = Number.parseInt(String(value ?? '').replace(/[^\d]/g, ''), 10);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private toStringList(value: unknown): string[] {
    return Array.isArray(value)
      ? value.map(item => this.cleanText(item)).filter(Boolean)
      : [];
  }

  private toChapterHtml(text: string): string {
    return String(text || '')
      .split(/\n{2,}/)
      .map(paragraph => paragraph.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .map(paragraph => `<p>${this.escapeHtml(paragraph)}</p>`)
      .join('');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private cleanText(value: unknown): string {
    return String(value || '').trim();
  }
}

export default new NovelArchivePlugin();
