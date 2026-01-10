import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';

class Genesis implements Plugin.PluginBase {
  id = 'genesistudio';
  name = 'Genesis';
  icon = 'src/en/genesis/icon.png';
  customCSS = 'src/en/genesis/customCSS.css';
  site = 'https://genesistudio.com';
  api = 'https://api.genesistudio.com';
  version = '2.0.0';

  hideLocked = storage.get('hideLocked');
  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  imageRequestInit?: Plugin.ImageRequestInit | undefined = {
    headers: {
      'referrer': this.site,
    },
  };

  async parseNovelJSON(json: any[]): Promise<Plugin.SourceNovel[]> {
    return json.map((novel: any) => ({
      name: novel.novel_title,
      path: `/novels/${novel.abbreviation}`.trim(),
      cover: `${this.api}/storage/v1/object/public/directus/${novel.cover}.png`,
    }));
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // There is only one page of results, and no known page function, so do not try
    if (pageNo !== 1) return [];
    // Only 14 results, no use in sorting or status
    // Also all novels are Ongoing with no Completed, can't test status filter
    const link = `${this.site}/api/directus/novels?status=published&fields=["cover","novel_title","cover","abbreviation"]&limit=-1`;
    const json = await fetchApi(link).then(r => r.json());
    return this.parseNovelJSON(json);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const abbreviation = novelPath.replace('/novels/', '');
    const url = `${this.site}/api/directus/novels/by-abbreviation/${abbreviation}`;

    // Fetch the novel's data in JSON format
    const raw = await fetchApi(url);
    const json = await raw.json();

    // Initialize the novel object with default values
    const parse = await this.parseNovelJSON([json]);
    const novel: Plugin.SourceNovel = parse[0];
    novel.summary = json.synopsis;
    novel.author = json.author;
    const map: Record<string, string> = {
      ongoing: NovelStatus.Ongoing,
      hiatus: NovelStatus.OnHiatus,
      dropped: NovelStatus.Cancelled,
      cancelled: NovelStatus.Cancelled,
      completed: NovelStatus.Completed,
      unknown: NovelStatus.Unknown,
    };
    novel.status = map[json.serialization.toLowerCase()] ?? NovelStatus.Unknown;
    if (json.cover) {
      const url = `${this.site}/api/directus-file/${json.cover}`;
      const imgJson = await (await fetchApi(url)).json();
      console.log(imgJson.type);
      novel.cover = `${this.api}/storage/v1/object/public/directus/${json.cover}.png`;
      if (imgJson.type == 'image/gif') {
        novel.cover = novel.cover?.replace('.png', '.gif');
      } else if (imgJson.type !== 'image/png') {
        novel.cover = novel.cover?.replace(
          '.png',
          '.' + imgJson.type.toString().split('/')[1],
        );
      }
    }

    // Parse the chapters if available and assign them to the novel object
    novel.chapters = await this.extractChapters(json.id);

    return novel;
  }

  // Helper function to extract and format chapters
  async extractChapters(id: string): Plugin.ChapterItem[] {
    const url = `${this.site}/api/novels-chapter/${id}`;

    // Fetch the chapter data in JSON format
    const raw = await fetchApi(url);
    const json = await raw.json();

    // Format each chapter and add only valid ones
    const chapters = json.data.chapters
      .map(index => {
        const title = index.chapter_title;
        const chapterPath = `/viewer/${index.id}`;
        const isLocked = !index.isUnlocked;
        if (this.hideLocked && isLocked) return null;
        const chapterName = isLocked ? '🔒 ' + title : title;
        const chapterNum = index.chapter_number;

        if (!chapterPath) return null;

        return {
          name: chapterName,
          path: chapterPath,
          chapterNumber: Number(chapterNum),
        };
      })
      .filter(chapter => chapter !== null) as Plugin.ChapterItem[];

    return chapters;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.site}${chapterPath}`;
    const id = chapterPath.replace('/viewer/', '');

    // Fetch the novel's data in JSON format
    const raw = await fetchApi(url);
    const $ = load(await raw.text());
    let external_api;
    let apikey;

    let URLs = [];
    let code;

    // Find URL with API Key
    const srcs = $('head')
      .find('script')
      .map(function () {
        const src = $(this).attr('src');
        if (src in URLs) {
          return null;
        }
        URLs.push(src);
      })
      .toArray();
    for (let src of URLs) {
      const script = await fetchApi(`${this.site}${src}`);
      const raw = await script.text();
      if (raw.includes('sb_publishable')) {
        code = raw;
        break;
      }
    }
    if (!code) {
      throw new Error('Failed to find API Key');
    }
    // Find right segment of code
    let arr = code.split(';');
    for (const seg of arr) {
      if (seg.includes('sb_publishable')) {
        code = seg;
        break;
      }
    }
    arr = code.split('"');
    for (const seg of arr) {
      if (seg.includes('https')) {
        external_api = seg;
        continue;
      }
      if (seg.includes('sb_publishable')) {
        apikey = seg;
        continue;
      }
    }

    const path = `${external_api}/rest/v1/chapters?select=id,chapter_title,chapter_number,chapter_content,status,novel&id=eq.${id}&status=eq.released`;

    const chQuery = await fetchApi(path, {
      method: 'GET',
      headers: {
        // Cookie: 'csrftoken=' + csrftoken,
        Referer: this.site,
        'apikey': apikey,
        'x-client-info': 'supabase-ssr/0.7.0 createBrowserClient',
      },
    });
    const json = await chQuery.json();
    const ch = json[0].chapter_content.replaceAll('\n', '<br/>');
    return ch;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.SourceNovel[]> {
    if (pageNo !== 1) return [];
    // TODO: Figure out how to search
    const url = `${this.site}/api/novels/search?title=${encodeURIComponent(searchTerm)}`;
    const json = await fetchApi(url).then(r => r.json());
    return this.parseNovelJSON(json);
  }

  filters = {
    sort: {
      label: 'Sort Results By',
      value: 'Date',
      options: [
        { label: 'Date', value: 'Date' },
        { label: 'Views', value: 'Views' },
      ],
      type: FilterTypes.Picker,
    },
    storyStatus: {
      label: 'Status',
      value: 'All',
      options: [
        { label: 'All', value: 'All' },
        { label: 'Ongoing', value: 'Ongoing' },
        { label: 'Completed', value: 'Completed' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'Genres',
      value: [],
      options: [
        { label: 'Action', value: 'Action' },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Harem', value: 'Harem' },
        { label: 'Martial Arts', value: 'Martial Arts' },
        { label: 'Modern', value: 'Modern' },
        { label: 'Mystery', value: 'Mystery' },
        { label: 'Psychological', value: 'Psychological' },
        { label: 'Romance', value: 'Romance' },
        { label: 'Slice of life', value: 'Slice of Life' },
        { label: 'Tragedy', value: 'Tragedy' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new Genesis();
