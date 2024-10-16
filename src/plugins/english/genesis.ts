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
  version = '1.0.5';

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

    // Fetch the novel's data in JSON format
    const json = await fetchApi(url).then(r => r.json());
    const nodes = json.nodes;

    // Extract the main novel data from the nodes
    const data = this.extractNovelData(nodes);

    // Initialize the novel object with default values
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      cover: '',
      summary: '',
      author: '',
      status: 'Unknown',
      chapters: [],
    };

    // Parse and assign novel metadata (title, cover, summary, author, etc.)
    this.populateNovelMetadata(novel, data);

    // Parse the chapters if available and assign them to the novel object
    novel.chapters = this.extractChapters(data);

    return novel;
  }

  // Helper function to extract novel data from nodes
  extractNovelData(nodes: any[]): any {
    return nodes
      .filter((node: { type: string }) => node.type === 'data')
      .map((node: { data: any }) => node.data)[0];
  }

  // Helper function to populate novel metadata
  populateNovelMetadata(novel: Plugin.SourceNovel, data: any): void {
    for (const key in data) {
      const value = data[key];

      if (
        typeof value === 'object' &&
        value !== null &&
        'novel_title' in value
      ) {
        novel.name = data[value.novel_title] || 'Unknown Title';
        novel.cover = data[value.cover] || '';
        novel.summary = data[value.synopsis] || '';
        novel.author = data[value.author] || 'Unknown Author';
        novel.genres =
          (data[value.genres] as number[])
            .map((genreId: number) => data[genreId])
            .join(', ') || 'Unknown Genre';
        novel.status = value.release_days ? 'Ongoing' : 'Completed';
        break; // Break the loop once metadata is found
      }
    }
  }

  // Helper function to extract and format chapters
  extractChapters(data: any): Plugin.ChapterItem[] {
    for (const key in data) {
      const value = data[key];

      // Change string here if the chapters are stored under a different key
      const chapterKey = 'chapters';
      if (typeof value === 'object' && value !== null && chapterKey in value) {
        const chapterData = this.decodeData(data[value[chapterKey]]);

        // Object.values will give us an array of arrays (any[][])
        const chapterArrays: any[][] = Object.values(chapterData);

        // Flatten and format the chapters
        return chapterArrays.flatMap((chapters: any[]) => {
          return chapters
            .map((chapter: any) => this.formatChapter(chapter))
            .filter(
              (chapter): chapter is Plugin.ChapterItem => chapter !== null,
            );
        });
      }
    }

    return [];
  }

  // Helper function to format an individual chapter
  formatChapter(chapter: any): Plugin.ChapterItem | null {
    const { id, chapter_title, chapter_number, required_tier, date_created } =
      chapter;

    // Ensure required fields are present and valid
    if (
      id &&
      chapter_title &&
      chapter_number &&
      required_tier !== null &&
      date_created
    ) {
      const number = parseInt(chapter_number, 10) || 0;
      const requiredTier = parseInt(required_tier, 10) || 0;

      // Only process chapters with a 'requiredTier' of 0
      if (requiredTier === 0) {
        return {
          name: `Chapter ${number}: ${chapter_title}`,
          path: `/viewer/${id}`,
          releaseTime: date_created,
          chapterNumber: number,
        };
      }
    }

    return null;
  }

  decodeData(code: any) {
    const offset = this.getOffsetIndex(code);
    const params = this.getDecodeParams(code);
    const constant = this.getConstant(code);
    const data = this.getStringsArrayRaw(code);

    const getDataAt = (x: number) => data[x - offset];

    //reshuffle data array
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const some_number = this.applyDecodeParams(params, getDataAt);
        if (some_number === constant) break;
        else data.push(data.shift());
      } catch (err) {
        data.push(data.shift());
      }
    }

    return this.getChapterData(code, getDataAt);
  }

  getOffsetIndex(code: string) {
    // @ts-ignore
    const string = /{(\w+)=\1-0x(?<offset>[0-9a-f]+);/.exec(code).groups.offset;
    return parseInt(string, 16);
  }

  /**
   * @returns {string[]}
   */
  getStringsArrayRaw(code: string) {
    // @ts-ignore
    let json = /function \w+\(\){var \w+=(?<array>\['.+']);/.exec(code).groups
      .array;

    //replace string single quotes with double quotes and add escaped chars
    json = json.replace(/'(.+?)'([,\]])/g, (match, p1, p2) => {
      return `"${p1.replace(/\\x([0-9a-z]{2})/g, (match: any, p1: string) => {
        //hexadecimal unicode escape chars
        return String.fromCharCode(parseInt(p1, 16));
      })}"${p2}`;
    });

    return JSON.parse(json);
  }

  /**
   * @returns {{offset: number, divider: number, negated: boolean}[][]}
   */
  getDecodeParams(code: string) {
    // @ts-ignore
    const jsDecodeInt = /while\(!!\[]\){try{var \w+=(?<code>.+?);/.exec(code)
      .groups.code;
    const decodeSections = jsDecodeInt.split('+');
    const params = [];
    for (const section of decodeSections) {
      params.push(this.decodeParamSection(section));
    }
    return params;
  }

  /**
   * @param {string} section
   * @returns {{offset: number, divider: number, negated: boolean}[]}
   */
  decodeParamSection(section: string) {
    const sections = section.split('*');
    const params = [];
    for (const section of sections) {
      // @ts-ignore
      const offsetStr = /parseInt\(\w+\(0x(?<offset>[0-9a-f]+)\)\)/.exec(
        section,
      ).groups.offset;
      const offset = parseInt(offsetStr, 16);
      // @ts-ignore
      const dividerStr = /\/0x(?<divider>[0-9a-f]+)/.exec(section).groups
        .divider;
      const divider = parseInt(dividerStr, 16);
      const negated = section.includes('-');
      params.push({ offset, divider, negated });
    }
    return params;
  }

  getConstant(code: string) {
    // @ts-ignore
    const constantStr = /}}}\(\w+,0x(?<constant>[0-9a-f]+)\),/.exec(code).groups
      .constant;
    return parseInt(constantStr, 16);
  }

  getChapterData(
    code: string,
    getDataAt: { (x: number): any; (arg0: number): any },
  ) {
    let chapterDataStr =
      // @ts-ignore
      /\),\(function\(\){var \w+=\w+;return(?<data>{.+?});/.exec(code).groups
        .data;

    //replace hex with decimal
    chapterDataStr = chapterDataStr.replace(/:0x([0-9a-f]+)/g, (match, p1) => {
      const hex = parseInt(p1, 16);
      return `: ${hex}`;
    });

    //replace ![] with false and !![] with true
    chapterDataStr = chapterDataStr
      .replace(/:!!\[]/g, ':true')
      .replace(/:!\[]/g, ':false');

    //replace string single quotes with double quotes and add escaped chars
    chapterDataStr = chapterDataStr.replace(
      /'(.+?)'([,\]}:])/g,
      (match, p1, p2) => {
        return `"${p1.replace(/\\x([0-9a-z]{2})/g, (match: any, p1: string) => {
          //hexadecimal unicode escape chars
          return String.fromCharCode(parseInt(p1, 16));
        })}"${p2}`;
      },
    );

    //parse the data getting methods
    chapterDataStr = chapterDataStr.replace(
      // @ts-ignore
      /:\w+\(0x(?<offset>[0-9a-f]+)\)/g,
      (match, p1) => {
        const offset = parseInt(p1, 16);
        return `:${JSON.stringify(getDataAt(offset))}`;
      },
    );

    return JSON.parse(chapterDataStr);
  }

  /**
   * @param {{offset: number, divider: number, negated: boolean}[][]} params
   * @param {function(number): string} getDataAt
   */
  applyDecodeParams(
    params: { offset: number; divider: number; negated: boolean }[][],
    getDataAt: { (x: number): any; (arg0: any): string },
  ) {
    let res = 0;
    for (const paramAdd of params) {
      let resInner = 1;
      for (const paramMul of paramAdd) {
        resInner *= parseInt(getDataAt(paramMul.offset)) / paramMul.divider;
        if (paramMul.negated) resInner *= -1;
      }
      res += resInner;
    }
    return res;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.site}${chapterPath}/__data.json?x-sveltekit-invalidated=001`;
    const json = await fetchApi(url).then(r => r.json());
    const nodes = json.nodes;
    const data = nodes
      .filter((node: { type: string }) => node.type === 'data')
      .map((node: { data: any }) => node.data)[0];
    const content = data[data[0].gs] ?? data[19];
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
