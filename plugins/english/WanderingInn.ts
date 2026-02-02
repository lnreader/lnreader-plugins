import { fetchApi, fetchProto, fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';

class TemplatePlugin implements Plugin.PluginBase {
  id = 'wanderinginn';
  name = 'Wandering Inn';
  icon = 'src/en/wanderinginn/icon.jpg';
  site = 'https://wanderinginn.com/table-of-contents/';
  version = '1.0.0';
  filters: Filters | undefined = undefined;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  COVER =
    'https://openbook.biz/wp-content/uploads/2025/06/The-Wandering-Inn-by-Pirate-Aba-217x300.jpg';
  BASE_NOVEL: Plugin.NovelItem = {
    name: 'Wandering Inn',
    path: 'https://wanderinginn.com/table-of-contents/',
    cover: this.COVER,
  };

  async popularNovels(): Promise<Plugin.NovelItem[]> {
    return [
      {
        name: 'Wandering Inn',
        path: 'https://wanderinginn.com/table-of-contents/',
        cover: this.COVER,
      },
    ];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      ...this.BASE_NOVEL,
      artist: 'Pirateaba',
      chapters: [],
    };

    const resp = await fetchApi(novelPath);

    if (!resp.ok)
      throw new Error(`Could not fetch the chapter list: [${resp.status}`);

    const $ = loadCheerio(await resp.text());

    $('.volume-wrapper').each((id, el) => {
      const chapters = $(el).extract({
        chapters: [
          {
            selector: '.chapter-entry',
            value: {
              name: 'a',
              path: {
                selector: 'a',
                value: 'href',
              },
              page: {
                selector: 'a',
                value: () => id + 1,
              },
            },
          },
        ],
      }).chapters as Plugin.ChapterItem[];

      novel.chapters = [...novel.chapters!, ...chapters];
    });

    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const resp = await fetchApi(chapterPath);

    if (!resp.ok)
      throw new Error(`Could not fetch the chapter list: [${resp.status}`);

    const $ = loadCheerio(await resp.text());

    const chapterText = $('#main-content > article')
      .prepend($('div.elementor h2.elementor-heading-title').first())
      .html();
    return chapterText ?? '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    if (searchTerm.length < 3) return [];

    const hit = searchTerm
      .replace(/[^a-z]+/i, ' ')
      .split(' ')
      .filter(e => {
        const regex = new RegExp(`\\b${e}`, 'i');
        console.log(regex);
        return regex.test('Wandering Inn');
      })
      .some(e => e);

    if (!hit) return [];

    return [this.BASE_NOVEL];
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/book/' : '/chapter/') + path;
}

export default new TemplatePlugin();
