import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type ListNovel = {
  title: string;
  slug: string;
  cover?: string;
};

type ListPage = {
  page: number;
  has_more: boolean;
  data: ListNovel[];
};

type SearchEntry = ListNovel & {
  alternative_titles?: string;
};

type NovelDetail = {
  id: number;
  title: string;
  slug: string;
  author?: string;
  description?: string;
  cover?: string;
  genres?: string[];
  status?: string;
};

type ChapterEntry = {
  title: string;
  index: number;
};

type ChapterContent = {
  title?: string;
  content?: string;
};

const searchPageSize = 50;

class NovelBinPlugin implements Plugin.PluginBase {
  id = 'novelbin';
  name = 'Novel Bin';
  icon = 'src/en/novelbin/icon.png';
  site = 'https://novelbin.xyz/';
  version = '3.0.0';

  // The site's JSON lives on a CDN that refuses requests from other origins;
  // the site's own /api/cdn/ route serves the same files.
  apiBase = this.site + 'api/cdn/';

  private searchIndex: Promise<SearchEntry[]> | null = null;
  private novelIds: Record<string, number> = {};

  filters = {
    genre: {
      type: FilterTypes.Picker,
      label: 'Genre',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Eastern', value: 'eastern' },
        { label: 'Fan Fiction', value: 'fan-fiction' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Game', value: 'game' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'Litrpg', value: 'litrpg' },
        { label: 'Magic', value: 'magic' },
        { label: 'Magical Realism', value: 'magical-realism' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Modern Life', value: 'modern-life' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Other', value: 'other' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci Fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Slice Of Life', value: 'slice-of-life' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'System', value: 'system' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban', value: 'urban' },
        { label: 'War', value: 'war' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: 'Status (ignored when a genre is selected)',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
      ],
    },
  } satisfies Filters;

  async fetchJson<T>(file: string): Promise<T | null> {
    const response = await fetchApi(this.apiBase + file);
    const contentType = response.headers.get('content-type') || '';
    if (
      response.headers.get('cf-mitigated') === 'challenge' ||
      (response.status === 403 && !contentType.includes('json'))
    ) {
      throw new Error(
        'Site is showing a security check, please open it in WebView and complete it.',
      );
    }
    // Missing files (unknown slugs, pages past the end) come back as 403/404.
    if (response.status === 403 || response.status === 404) return null;
    if (!response.ok) {
      throw new Error(
        `Could not reach site (${response.status}: ${response.statusText}) try to open in webview.`,
      );
    }
    return (await response.json()) as T;
  }

  // The site reads `web_` lists first and falls back to the plain ones.
  async fetchList<T>(name: string): Promise<T | null> {
    return (
      (await this.fetchJson<T>(`lists/web_${name}.json`)) ||
      this.fetchJson<T>(`lists/${name}.json`)
    );
  }

  toNovelItem(novel: ListNovel): Plugin.NovelItem {
    return {
      name: novel.title,
      path: 'novel/' + novel.slug,
      cover: novel.cover || defaultCover,
    };
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let listName = '';
    if (filters?.genre.value) {
      listName = `genre_${filters.genre.value}_${pageNo}`;
    } else if (filters?.status.value) {
      listName = `status_${filters.status.value}_${pageNo}`;
    } else if (showLatestNovels) {
      listName = `latest_${pageNo}`;
    }

    if (!listName) {
      // The popular list is a single, unpaged list.
      if (pageNo > 1) return [];
      const popular = await this.fetchList<ListNovel[]>('popular');
      return (popular || []).map(novel => this.toNovelItem(novel));
    }

    const page = await this.fetchList<ListPage>(listName);
    return (page?.data || []).map(novel => this.toNovelItem(novel));
  }

  // Accepts current paths (novel/<slug>, read/<slug>/chapter-<n>) and paths
  // saved by the previous novelbin.com plugin (b/<slug>, b/<slug>/<chapter>).
  getSlug(path: string): string {
    return path.replace(/^\//, '').split('/')[1];
  }

  async getNovel(slug: string): Promise<NovelDetail> {
    const novel = await this.fetchJson<NovelDetail>(`novel/${slug}.json`);
    if (!novel) {
      throw new Error(
        'Novel not found, it may have been removed from this source.',
      );
    }
    this.novelIds[slug] = novel.id;
    return novel;
  }

  async getChapterList(novelId: number): Promise<ChapterEntry[]> {
    const chapters = await this.fetchJson<ChapterEntry[]>(
      `chapters/${novelId}.json`,
    );
    return chapters || [];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = this.getSlug(novelPath);
    const detail = await this.getNovel(slug);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: detail.title,
      cover: detail.cover || defaultCover,
      author: detail.author,
      summary: detail.description,
      genres: (detail.genres || []).join(', '),
    };

    if (detail.status === 'Ongoing') novel.status = NovelStatus.Ongoing;
    else if (detail.status === 'Completed') {
      novel.status = NovelStatus.Completed;
    }

    const chapters = await this.getChapterList(detail.id);
    novel.chapters = chapters
      .sort((a, b) => a.index - b.index)
      .map(chapter => ({
        name: chapter.title,
        path: `read/${slug}/chapter-${chapter.index + 1}`,
        chapterNumber: chapter.index + 1,
      }));

    return novel;
  }

  // Old novelbin.com chapter paths end in a slug of the chapter title,
  // e.g. "chapter-10-first-man-down"; find that chapter's index here.
  async findLegacyChapterIndex(
    novelId: number,
    chapterSlug: string,
  ): Promise<number> {
    const toSlug = (title: string) =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const chapters = await this.getChapterList(novelId);

    const bySlug = chapters.find(
      chapter => toSlug(chapter.title) === chapterSlug,
    );
    if (bySlug) return bySlug.index;

    const chapterNumber = chapterSlug.match(/^chapter-(\d+)/)?.[1];
    const byNumber = chapterNumber
      ? chapters.find(
          chapter =>
            toSlug(chapter.title).match(/^chapter-(\d+)/)?.[1] ===
            chapterNumber,
        )
      : undefined;
    if (byNumber) return byNumber.index;

    throw new Error(
      'Chapter not found, refresh the novel to load its current chapter list.',
    );
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const slug = this.getSlug(chapterPath);
    const chapterSlug = chapterPath.split('/').pop() || '';
    const novelId = this.novelIds[slug] ?? (await this.getNovel(slug)).id;

    const index = chapterPath.startsWith('read/')
      ? Number(chapterSlug.replace('chapter-', '')) - 1
      : await this.findLegacyChapterIndex(novelId, chapterSlug);

    const chapter = await this.fetchJson<ChapterContent>(
      `read/${novelId}/${index}.json`,
    );
    if (!chapter?.content) {
      throw new Error(
        'Chapter not found, it may have been removed from this source.',
      );
    }
    return chapter.content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site searches one ~7.5 MB index on the client; load it once, and
    // share the pending download between overlapping searches.
    if (!this.searchIndex) {
      this.searchIndex = this.fetchList<SearchEntry[]>('search').then(index => {
        if (!index) throw new Error('Could not load the search index.');
        return index;
      });
      // Let a later search retry after a failed download.
      this.searchIndex.catch(() => {
        this.searchIndex = null;
      });
    }
    const searchIndex = await this.searchIndex;

    const term = searchTerm.toLowerCase().trim();
    return searchIndex
      .filter(
        novel =>
          novel.title.toLowerCase().includes(term) ||
          (novel.alternative_titles || '').toLowerCase().includes(term),
      )
      .slice((pageNo - 1) * searchPageSize, pageNo * searchPageSize)
      .map(novel => this.toNovelItem(novel));
  }

  resolveUrl = (path: string) => {
    // Covers (and defaultCover) are already absolute.
    if (/^https?:\/\//i.test(path)) return path;
    // Old novelbin.com paths have no page on this site; open the novel instead.
    if (path.startsWith('b/')) {
      return this.site + 'novel/' + this.getSlug(path);
    }
    return this.site + path;
  };
}

export default new NovelBinPlugin();
