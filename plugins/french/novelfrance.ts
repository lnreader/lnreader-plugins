import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';

const PAGE_SIZE = 24;

type NovelListItem = {
  title: string;
  slug: string;
  coverImage?: string | null;
};

type NovelListResponse = {
  novels: NovelListItem[];
};

type NovelDetail = {
  title: string;
  description?: string | null;
  coverImage?: string | null;
  author?: string | null;
  translatorName?: string | null;
  status?: string | null;
  genres?: { name: string; slug: string }[];
};

type ChapterDetail = {
  title?: string | null;
  paragraphs?: { index: number; content: string }[];
};

type ChapterListItem = {
  chapterNumber: number;
  title?: string | null;
  slug: string;
  createdAt?: string | null;
};

type ChapterListResponse = {
  chapters: ChapterListItem[];
  total?: number;
  hasMore?: boolean;
};

type LatestHomeItem = {
  title: string;
  slug: string;
  coverImage?: string | null;
};

type LatestHomeResponse = {
  data?: LatestHomeItem[];
};

class NovelFrancePlugin implements Plugin.PluginBase {
  id = 'novelfrance';
  name = 'NovelFrance';
  icon = 'src/fr/novelfrance/icon.png';
  site = 'https://novelfrance.fr/';
  version = '1.0.0';

  private async fetchJson<T>(url: string): Promise<T> {
    const r = await fetchApi(url);
    if (!r.ok) throw new Error('Failed to load page (open in web view)');
    return (await r.json()) as T;
  }

  private buildCoverUrl(coverImage?: string | null): string {
    if (!coverImage) return defaultCover;
    return new URL(coverImage, this.site).href;
  }

  private mapStatus(apiStatus?: string): string {
    switch (apiStatus) {
      case 'ONGOING':
        return NovelStatus.Ongoing;
      case 'COMPLETED':
        return NovelStatus.Completed;
      case 'HIATUS':
        return NovelStatus.OnHiatus;
      case 'DROPPED':
        return NovelStatus.Cancelled;
      default:
        return NovelStatus.Unknown;
    }
  }

  private async fetchChapterList(
    novelSlug: string,
  ): Promise<Plugin.ChapterItem[]> {
    const TAKE = 100;
    const MAX_CALLS = 100; // garde-fou : 10 000 chapitres max
    const chapters: Plugin.ChapterItem[] = [];

    for (let i = 0; i < MAX_CALLS; i++) {
      const skip = i * TAKE;
      const url = `${this.site}api/chapters/${novelSlug}?skip=${skip}&take=${TAKE}&order=asc`;
      const data = await this.fetchJson<ChapterListResponse>(url);
      const list = data.chapters || [];

      for (const c of list) {
        const number = c.chapterNumber ?? 0;
        const title = (c.title || '').trim();
        const name = title
          ? `Chapitre ${number} - ${title}`
          : `Chapitre ${number}`;
        chapters.push({
          name,
          path: `${novelSlug}/${c.slug}`,
          chapterNumber: number,
          releaseTime: c.createdAt || undefined,
        });
      }

      if (data.hasMore === false) break;
      if (list.length < TAKE) break;
    }

    chapters.sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
    return chapters;
  }

  async popularNovels(
    pageNo: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (showLatestNovels) {
      const params = new URLSearchParams({
        offset: String((pageNo - 1) * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      const data = await this.fetchJson<LatestHomeResponse>(
        `${this.site}api/chapters/latest-home?${params.toString()}`,
      );
      return (data.data || []).map(n => ({
        name: n.title,
        path: n.slug,
        cover: this.buildCoverUrl(n.coverImage),
      }));
    }

    const params = new URLSearchParams({
      skip: String((pageNo - 1) * PAGE_SIZE),
      take: String(PAGE_SIZE),
    });

    const genre = filters?.genre?.value;
    if (typeof genre === 'string' && genre) params.set('genres', genre);

    const status = filters?.status?.value;
    if (typeof status === 'string' && status) params.set('status', status);

    const data = await this.fetchJson<NovelListResponse>(
      `${this.site}api/search?${params.toString()}`,
    );

    return (data.novels || []).map(n => ({
      name: n.title,
      path: n.slug,
      cover: this.buildCoverUrl(n.coverImage),
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const data = await this.fetchJson<NovelDetail>(
      `${this.site}api/novels/${novelPath}`,
    );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: data.title || 'Untitled',
      cover: this.buildCoverUrl(data.coverImage),
      summary: data.description || undefined,
      author: data.author || undefined,
      artist: data.translatorName || undefined,
      genres: data.genres?.map(g => g.name).join(',') || undefined,
      status: this.mapStatus(data.status || undefined),
    };

    novel.chapters = await this.fetchChapterList(novelPath);
    return novel;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const data = await this.fetchJson<ChapterDetail>(
      `${this.site}api/chapters/${chapterPath}`,
    );

    const title = data.title || '';
    const parts: string[] = [];
    if (title) parts.push(`<h1>${this.escapeHtml(title)}</h1>`);

    for (const p of data.paragraphs || []) {
      if (title && p.index === 0) continue;
      const content = (p.content || '').trim();
      if (!content) continue;
      parts.push(`<p>${this.escapeHtml(content)}</p>`);
    }

    return parts.join('');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      q: searchTerm,
      skip: String((pageNo - 1) * PAGE_SIZE),
      take: String(PAGE_SIZE),
    });

    const data = await this.fetchJson<NovelListResponse>(
      `${this.site}api/search?${params.toString()}`,
    );

    return (data.novels || []).map(n => ({
      name: n.title,
      path: n.slug,
      cover: this.buildCoverUrl(n.coverImage),
    }));
  }

  resolveUrl = (path: string) => new URL(`novel/${path}`, this.site).href;

  filters = {
    genre: {
      type: FilterTypes.Picker,
      label: 'Genre',
      value: '',
      options: [
        { label: 'Tous', value: '' },
        { label: 'Action', value: 'action' },
        { label: 'Adulte', value: 'adulte' },
        { label: 'Anti-Héros', value: 'anti-h-ros' },
        { label: 'Arts Martiaux', value: 'arts-martiaux' },
        { label: 'Aventure', value: 'aventure' },
        { label: 'Comédie', value: 'com-die' },
        { label: 'Drame', value: 'drama' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fantaisie', value: 'fantaisie' },
        { label: 'Fantastique', value: 'fantastique' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historique', value: 'historical' },
        { label: 'Horreur', value: 'horreur' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'Magie', value: 'magie' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mécha', value: 'mcha' },
        { label: 'Mystère', value: 'myst-re' },
        { label: 'Psychologique', value: 'psychologique' },
        { label: 'Réincarnation', value: 'r-incarnation' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Sport', value: 'sport' },
        { label: 'Surnaturel', value: 'surnaturel' },
        { label: 'Système', value: 'syst-me' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Tragédie', value: 'trag-die' },
        { label: 'Transmigration', value: 'transmigration' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: 'Statut',
      value: '',
      options: [
        { label: 'Tous', value: '' },
        { label: 'En cours', value: 'ONGOING' },
        { label: 'Terminé', value: 'COMPLETED' },
        { label: 'En pause', value: 'HIATUS' },
        { label: 'Abandonné', value: 'DROPPED' },
      ],
    },
  } satisfies Filters;
}

export default new NovelFrancePlugin();
