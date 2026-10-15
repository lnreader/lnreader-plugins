import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';

type ApiNovel = {
  id: string;
  title: string;
  author: string;
  description: string;
  cover_url: string;
  novel_image: string;
  genres: string;
  total_chapters: string;
  views_number: number;
  rating: number;
  release_status: string;
  ongoing: string;
  chapter_names: string[];
};

type ApiList = {
  novels?: ApiNovel[];
};

type ApiNovelDetail = { novel?: ApiNovel };

type ApiChapter = {
  chapter?: { number: number; name: string; content: string };
};

/**
 * Novel Archive (novelarchive.cc)
 *
 * The site renders client-side and its pages only ever contain a
 * "Fetching Novel Data..." placeholder, but it exposes a complete JSON API that
 * needs no authentication:
 *
 *   /api/novels?page=&per_page=&search=&sort=&status=
 *   /api/novels/<id>
 *   /api/novels/<id>/chapters/<n>
 *
 * so nothing here parses markup. A scraper aimed at the rendered HTML would
 * have nothing to select against.
 */
class NovelArchive implements Plugin.PluginBase {
  id = 'novelarchive';
  name = 'Novel Archive';
  version = '1.0.0';
  icon = 'src/en/novelarchive/icon.png';
  site = 'https://novelarchive.cc';

  filters = {
    sort: {
      value: 'popular',
      label: 'Sort by',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'Recent', value: 'recent' },
        { label: 'Most viewed', value: 'views' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Completed', value: 'completed' },
        { label: 'Ongoing', value: 'ongoing' },
      ],
      type: FilterTypes.Picker,
    },
  } as Filters;

  private api(path: string): string {
    return `${this.site}/api${path}`;
  }

  private toItem(novel: ApiNovel): Plugin.NovelItem {
    return {
      name: novel.title,
      path: `/novel?id=${novel.id}`,
      cover: novel.cover_url || novel.novel_image || defaultCover,
    };
  }

  private statusOf(raw: string | undefined): string {
    const value = (raw || '').trim().toLowerCase();
    if (value === 'completed' || value === 'finished') {
      return NovelStatus.Completed;
    }
    // Hiatus is its own status, not a flavour of "ongoing". Folding it into
    // Ongoing (or letting it fall through to Unknown) tells a reader a novel
    // that stopped updating is still being written.
    if (value === 'hiatus' || value === 'paused' || value === 'on hiatus') {
      return NovelStatus.OnHiatus;
    }
    if (value === 'ongoing' || value === 'releasing') {
      return NovelStatus.Ongoing;
    }
    return NovelStatus.Unknown;
  }

  private async list(query: string): Promise<ApiNovel[]> {
    const response = await fetchApi(this.api(`/novels?${query}`));
    if (!response.ok) return [];
    const data = (await response.json()) as ApiList;
    return Array.isArray(data.novels) ? data.novels : [];
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels ? 'recent' : filters?.sort.value || 'popular';
    const status = filters?.status.value || 'all';
    const novels = await this.list(
      `page=${pageNo}&per_page=24&sort=${sort}&status=${status}`,
    );
    return novels.map(novel => this.toItem(novel));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const novels = await this.list(
      `page=${pageNo}&per_page=24&search=${encodeURIComponent(searchTerm)}`,
    );
    return novels.map(novel => this.toItem(novel));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const id = novelPath.split('id=')[1] || novelPath;
    const response = await fetchApi(this.api(`/novels/${id}`));
    if (!response.ok) throw new Error(`Novel Archive: ${response.status}`);
    const data = (await response.json()) as ApiNovelDetail;
    const novel = data.novel;
    if (!novel) throw new Error('Novel Archive: no such novel');

    const names = Array.isArray(novel.chapter_names) ? novel.chapter_names : [];
    const total = Number(novel.total_chapters) || names.length;

    const chapters: Plugin.ChapterItem[] = Array.from(
      { length: total },
      (_, index) => {
        const number = index + 1;
        const name = (names[index] || '').trim();
        return {
          // A numbered fallback keeps the row readable where the site has no
          // title; an empty name renders as a blank entry.
          name: name || `Chapter ${number}`,
          chapterNumber: number,
          path: `/reader?novel=${id}&chapter=${number}`,
        };
      },
    );

    return {
      path: novelPath,
      name: novel.title,
      author: novel.author,
      cover: novel.cover_url || novel.novel_image || defaultCover,
      genres: novel.genres,
      status: this.statusOf(novel.release_status || novel.ongoing),
      summary: (novel.description || '').trim(),
      // The site rates out of 10; the app's scale is 5.
      rating: Number.isFinite(novel.rating) ? novel.rating / 2 : 0,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // The stored path is `/reader?novel=<id>&chapter=<n>`. Only the query is
    // wanted: handing the whole thing to URLSearchParams would make the first
    // key `reader?novel` rather than `novel`, so the id would read as empty.
    const query = chapterPath.includes('?')
      ? chapterPath.slice(chapterPath.indexOf('?') + 1)
      : chapterPath;
    const params = new URLSearchParams(query);
    const novelId = params.get('novel') || '';
    const number = Number(params.get('chapter')) || 1;

    const response = await fetchApi(
      this.api(`/novels/${novelId}/chapters/${number}`),
    );
    if (!response.ok) throw new Error(`Novel Archive: ${response.status}`);
    const data = (await response.json()) as ApiChapter;
    const content = data.chapter?.content;
    if (!content) throw new Error('Novel Archive: empty chapter');

    // The API returns plain text with blank-line paragraph breaks, not markup,
    // so it is escaped before being wrapped in <p> - otherwise a stray `<` in
    // the prose would be read as a tag by the reader.
    return content
      .split(/\n{2,}/)
      .map((para: string) => para.trim())
      .filter(Boolean)
      .map(
        (para: string) => `<p>${escapeHtml(para).replace(/\n/g, '<br/>')}</p>`,
      )
      .join('');
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default new NovelArchive();
