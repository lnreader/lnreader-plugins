import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class WNTLPlugin implements Plugin.PluginBase {
  id = 'wntl';
  name = 'WNTL';
  icon = 'src/en/wntl/icon.png';
  site = 'https://wntl.net/';
  version = '1.0.9';
  filters: Filters | undefined = undefined;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  private async fetchNovels() {
    const url = `${this.site}api/novels?page=1`;
    const response = await fetchApi(url);
    return response.json();
  }

  private getGenres(novels: any[]): string[] {
    const genreSet = new Set<string>();
    novels.forEach((n: any) =>
      (n.genre || []).forEach((g: string) => genreSet.add(g)),
    );
    return Array.from(genreSet).sort();
  }

  private buildFilters(novels: any[]): Filters {
    const genres = this.getGenres(novels);
    return {
      genre: {
        value: [],
        label: 'Genre',
        options: genres.map(g => ({ label: g, value: g })),
        type: FilterTypes.Checkbox,
      },
    };
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];
    const data = await this.fetchNovels();

    if (!this.filters) {
      this.filters = this.buildFilters(data.novels);
    }

    let novels = data.novels;

    if (filters?.genre?.value?.length) {
      novels = novels.filter((novel: any) =>
        (novel.genre || []).some((g: string) =>
          filters.genre.value.includes(g),
        ),
      );
    }

    return novels.map((novel: any) => ({
      name: novel.title,
      cover: novel.cover ? this.site + novel.cover.slice(1) : defaultCover,
      path: novel.id,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const chaptersUrl = `${this.site}api/chapters/${novelPath}`;
    const chaptersResponse = await fetchApi(chaptersUrl);
    const chaptersData = await chaptersResponse.json();

    const novelsUrl = `${this.site}api/novels?page=1`;
    const novelsResponse = await fetchApi(novelsUrl);
    const novelsData = await novelsResponse.json();

    const novelData = novelsData.novels.find((n: any) => n.id === novelPath);

    const statusList = novelData?.status || [];
    let novelStatus: NovelStatus;
    if (statusList.includes('Completed')) {
      novelStatus = NovelStatus.Completed;
    } else if (statusList.includes('Ongoing')) {
      novelStatus = NovelStatus.Ongoing;
    } else if (statusList.includes('On-Break')) {
      novelStatus = NovelStatus.OnHiatus;
    } else {
      novelStatus = NovelStatus.Unknown;
    }

    const chapters: Plugin.ChapterItem[] = chaptersData.chapters.map(
      (ch: any) => ({
        name: ch.title,
        path: `${novelPath}/${ch.file}`,
        releaseTime: ch.date,
        chapterNumber: ch.number,
      }),
    );

    return {
      path: novelPath,
      name: novelData?.title || 'Untitled',
      cover: novelData?.cover
        ? this.site + novelData.cover.slice(1)
        : defaultCover,
      author: novelData?.author || 'Unknown',
      status: novelStatus,
      genres: novelData?.genre?.join(', ') || '',
      summary: novelData?.description || '',
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.site}api/chapter-content/${chapterPath}`;
    const response = await fetchApi(url);
    const content = await response.text();

    return content
      .split('\n\n')
      .map(p => `<p>${p}</p>`)
      .join('\n');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];
    if (!searchTerm || typeof searchTerm !== 'string') return [];
    const data = await this.fetchNovels();

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const searchLower = normalize(searchTerm);
    if (!searchLower) return [];

    const filtered = data.novels.filter(
      (novel: any) =>
        normalize(novel.title).includes(searchLower) ||
        (novel['alternate-title'] || []).some((alt: string) =>
          normalize(alt).includes(searchLower),
        ),
    );

    return filtered.map((novel: any) => ({
      name: novel.title,
      cover: novel.cover ? this.site + novel.cover.slice(1) : defaultCover,
      path: novel.id,
    }));
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    isNovel
      ? this.site + 'series/' + path
      : this.site + 'read/' + path.replace(/\.md$/, '');
}

export default new WNTLPlugin();
