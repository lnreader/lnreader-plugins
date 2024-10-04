import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';

/**
 * Example for novel API:
 * https://genesistudio.com/novels/dlh/__data.json?x-sveltekit-invalidated=001
 * -> to view novel remove '__data.json?x-sveltekit-invalidated=001'
 *
 * Example for chapter API:
 * https://genesistudio.com/viewer/2443/__data.json?x-sveltekit-invalidated=001
 * -> to view chapter remove '__data.json?x-sveltekit-invalidated=001'
 */

class Genesis implements Plugin.PluginBase {
  id = 'genesistudio';
  name = 'Genesis';
  icon = 'src/en/genesis/icon.png';
  customCSS = 'src/en/genesis/customCSS.css';
  site = 'https://genesistudio.com';
  version = '1.0.4';

  imageRequestInit?: Plugin.ImageRequestInit | undefined = {
    headers: {
      'referrer': this.site,
    },
  };

  async parseNovels(json: any[]): Promise<Plugin.SourceNovel[]> {
    return json.map((novel: any) => ({
      name: novel.novel_title,
      path: `/novels/${novel.abbreviation}`,
      cover: novel.cover,
    }));
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.SourceNovel[]> {
    if (pageNo !== 1) return [];
    let link = `${this.site}/api/search?`;
    if (showLatestNovels) {
      link += 'sort=Recent';
    } else {
      if (filters!.genres.value) {
        link += filters!.genres.value;
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

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      cover: '',
      summary: '',
      author: '',
      status: 'Unknown',
      chapters: [],
    };

    for (const key in data) {
      const value = data[key];
      if (typeof value === 'object' && value !== null) {
        if ('novel_title' in value) {
          novel.name = data[value.novel_title];
          novel.cover = data[value.cover];
          novel.summary = data[value.synopsis];
          novel.author = data[value.author];
          novel.genres = (data[value.genres] as number[])
            .map((genreId: number) => data[genreId])
            .join(', ');
          novel.status = value.release_days ? 'Ongoing' : 'Completed';
        } else if ('chapters_list' in value) {
          const chaptersFunction = data[value.chapters_list];
          const chapterMatches = chaptersFunction.match(
            /'id':((?!_)\w+),'chapter_title':(?:'([^'\\]*(?:\\.[^'\\]*)*)'|(\w+\([^\)]+\))),'chapter_number':(\w+),'required_tier':(\w+),'date_created':([^,]*),/g,
          );

          if (chapterMatches) {
            novel.chapters = chapterMatches
              .map((match: string) => {
                const [, id, title, , number, requiredTier, dateCreated] =
                  match.match(
                    /'id':(\w+),'chapter_title':(?:'([^'\\]*(?:\\.[^'\\]*)*)'|(\w+\([^\)]+\))),'chapter_number':(\w+),'required_tier':(\w+),'date_created':([^,]*),/,
                  )!;

                if (parseInt(requiredTier, 16) === 0) {
                  return {
                    name: `Chapter ${parseInt(number, 16)}: ${title || 'Unknown Title'}`,
                    path: `/viewer/${parseInt(id, 16)}`,
                    releaseTime: dateCreated.replace(/^'|'$/g, ''),
                    chapterNumber: parseInt(number, 16),
                  };
                }
                return null;
              })
              .filter(
                (
                  chapter: Plugin.ChapterItem | null,
                ): chapter is Plugin.ChapterItem => chapter !== null,
              );
          }
        }
      }
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.site}${chapterPath}/__data.json?x-sveltekit-invalidated=001`;
    const json = await fetchApi(url).then(r => r.json());
    const nodes = json.nodes;
    const data = nodes
      .filter((node: { type: string }) => node.type === 'data')
      .map((node: { data: any }) => node.data)[0];
    const content = data[19];
    const footnotes = data[data[0].footnotes];
    return content + (footnotes ?? '');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.SourceNovel[]> {
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
