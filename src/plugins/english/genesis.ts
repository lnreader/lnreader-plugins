/* eslint-disable no-case-declarations */
import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';

class Genesis implements Plugin.PluginBase {
  id = 'genesistudio';
  name = 'Genesis';
  icon = 'src/en/genesis/icon.png';
  customCSS = 'src/en/genesis/customCSS.css';
  site = 'https://genesistudio.com';
  version = '1.0.2';
  imageRequestInit?: Plugin.ImageRequestInit | undefined = {
    headers: {
      'referrer': this.site,
    },
  };

  async parseNovels(json: any[]): Promise<Plugin.NovelItem[]> {
    return json.map((novel: any) => {
      return {
        name: novel.novel_title,
        path: `/novels/${novel.abbreviation}`,
        cover: novel.cover,
      };
    });
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];

    let link = `https://genesistudio.com/api/search?`;
    if (showLatestNovels) {
      link += 'sort=Recent';
    } else {
      if (filters!.genres.value.length) {
        link += filters!.genres.value.join('&');
      }
      link += `&${filters!.storyStatus.value}&${filters!.sort.value}`;
    }

    const json = await fetchApi(link).then(r => r.json());

    return this.parseNovels(json);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = `${this.site}${novelPath}/__data.json?x-sveltekit-invalidated=001`;
    const json = await fetchApi(url).then(r => r.json());

    const nodes = json.nodes;
    const data = nodes
      .filter((node: { type: string }) => node.type === 'data')
      .map((node: { data: any }) => node.data)[0];
    const novelData = data[data[0].novel];

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: data[novelData.novel_title],
      cover: data[novelData.cover],
      summary: data[novelData.synopsis],
      author: data[novelData.author],
    };

    novel.genres = data[novelData.genres]
      .map((index: number) => data[index])
      .join(',');

    novel.status = data[novelData.release_days] ? 'Ongoing' : 'Completed';

    const chapterData = data[data[0].chapters];
    const freeChapterData = chapterData.free;
    // const premiumChapterData = chapterData.premium;

    novel.chapters = data[freeChapterData]
      .map((index: number) => data[index])
      .map((chapter: any) => {
        return {
          name: `Chapter ${data[chapter.chapter_number]}: ${data[chapter.chapter_title]}`,
          path: `/viewer/${data[chapter.id]}`,
          releaseTime: data[chapter.date_created],
          chapterNumber: data[chapter.chapter_number],
        };
      });

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.site}${chapterPath}/__data.json?x-sveltekit-invalidated=001`;
    const json = await fetchApi(url).then(r => r.json());

    const nodes = json.nodes;
    const data = nodes
      .filter((node: { type: string }) => node.type === 'data')
      .map((node: { data: any }) => node.data)[0];

    return data[data[0].content] + data[data[0].footnotes] ?? '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];

    const url = `${this.site}/api/search?serialization=All&sort=Popular&title=${searchTerm}`;
    const json = await fetchApi(url).then(r => r.json());

    return this.parseNovels(json);
  }

  filters = {
    sort: {
      label: 'Sort Results By',
      value: 'sort=Popular',
      options: [
        { label: 'Popular', value: 'sort=Popular' },
        { label: 'Recent', value: 'sort=Recent' },
        { label: 'Views', value: 'sort=Views' },
      ],
      type: FilterTypes.Picker,
    },
    storyStatus: {
      label: 'Status',
      value: 'serialization=All',
      options: [
        { label: 'All', value: 'serialization=All' },
        { label: 'Ongoing', value: 'serialization=Ongoing' },
        { label: 'Completed', value: 'serialization=Completed' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'Genres',
      value: [],
      options: [
        { label: 'Action', value: 'genres=Action' },
        { label: 'Comedy', value: 'genres=Comedy' },
        { label: 'Drama', value: 'genres=Drama' },
        { label: 'Fantasy', value: 'genres=Fantasy' },
        { label: 'Harem', value: 'genres=Harem' },
        { label: 'Martial Arts', value: 'genres=Martial+Arts' },
        { label: 'Modern', value: 'genres=Modern' },
        { label: 'Mystery', value: 'genres=Mystery' },
        { label: 'Psychological', value: 'genres=Psychological' },
        { label: 'Romance', value: 'genres=Romance' },
        { label: 'Slice of life', value: 'genres=Slice+of+Life' },
        { label: 'Tragedy', value: 'genres=Tragedy' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new Genesis();
