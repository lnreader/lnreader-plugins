import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

class FictionZonePlugin implements Plugin.PluginBase {
  id = 'fictionzone';
  name = 'Fiction Zone';
  icon = 'src/en/fictionzone/icon.png';
  site = 'https://fictionzone.net';
  version = '1.0.2';
  filters: Filters | undefined = undefined;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    return await this.getPage(
      `/platform/browse?page=${pageNo}&page_size=20&sort_by=${showLatestNovels ? 'created_at' : 'bookmark_count'}&sort_order=desc&include_genres=true`,
    );
  }

  async getData(url: string) {
    return await fetchApi(this.site + '/api/__api_party/fictionzone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        'path': url,
        'headers': [
          ['content-type', 'application/json'],
          ['x-request-time', new Date().toISOString()],
        ],
        'method': 'GET',
      }),
    }).then(r => r.json());
  }

  async getPage(url: string) {
    const data = await this.getData(url);

    return data.data.novels.map((n: any) => ({
      name: n.title,
      cover: `https://cdn.fictionzone.net/insecure/rs:fill:165:250/${n.image}.webp`,
      path: `novel/${n.slug}`,
    }));
  }

  async getChapterPage(id: string, novelPath: string) {
    const data = await this.getData('/platform/chapter-lists?novel_id=' + id);

    return data.data.chapters.map((n: any) => ({
      name: n.title,
      number: n.chapter_number,
      date: n.published_date
        ? new Date(n.published_date).toISOString()
        : undefined,
      path: `${novelPath}/${n.chapter_id}|/platform/chapter-content?novel_id=${id}&chapter_id=${n.chapter_id}`,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novelSlug = novelPath.replace('novel/', '');
    const data = await this.getData(
      `/platform/novel-details?slug=${novelSlug}`,
    );

    return {
      path: novelPath,
      name: data.data.title,
      cover: `https://cdn.fictionzone.net/insecure/rs:fill:165:250/${data.data.image}.webp`,
      genres: [
        ...data.data.genres.map((g: any) => g.name),
        ...data.data.tags.map((g: any) => g.name),
      ].join(','),
      status:
        data.data.status == 1
          ? NovelStatus.Ongoing
          : data.data.status == 0
            ? NovelStatus.Completed
            : NovelStatus.Unknown,
      author:
        data.data.contributors.filter((c: any) => c.role == 'author')[0]
          ?.display_name || '',
      summary: data.data.synopsis,
      chapters: await this.getChapterPage(data.data.id, novelPath),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const data = await this.getData(chapterPath.split('|')[1]);
    return '<p>' + data.data.content.replaceAll('\n', '</p><p>') + '</p>';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return await this.getPage(
      `/platform/browse?search=${encodeURIComponent(searchTerm)}&page=${pageNo}&page_size=20&search_in_synopsis=true&sort_by=bookmark_count&sort_order=desc&include_genres=true`,
    );
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + '/' + path.split('|')[0];
}

export default new FictionZonePlugin();
