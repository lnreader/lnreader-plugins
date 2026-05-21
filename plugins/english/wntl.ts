import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class WNTLPlugin implements Plugin.PluginBase {
  id = 'wntl';
  name = 'WNTL';
  icon = 'src/en/wntl/icon.png';
  site = 'https://wntl.net/';
  version = '1.0.0';
  filters: Filters | undefined = undefined;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];
    const url = `${this.site}api/novels?page=1`;
    const response = await fetchApi(url);
    const data = await response.json();

    return data.novels.map((novel: any) => ({
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

    const status = novelData?.status?.[0];
    let novelStatus: NovelStatus;
    switch (status) {
      case 'Completed':
        novelStatus = NovelStatus.Completed;
        break;
      case 'Ongoing':
        novelStatus = NovelStatus.Ongoing;
        break;
      default:
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
    const url = `${this.site}api/novels?page=1`;
    const response = await fetchApi(url);
    const data = await response.json();

    const filtered = data.novels.filter((novel: any) =>
      novel.title.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    return filtered.map((novel: any) => ({
      name: novel.title,
      cover: novel.cover ? this.site + novel.cover.slice(1) : defaultCover,
      path: novel.id,
    }));
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/novel/' : '/chapter/') + path;
}

export default new WNTLPlugin();
