import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

class Genesis implements Plugin.PluginBase {
  id = 'genesistudio';
  name = 'Genesis';
  icon = 'src/en/genesis/icon.png';
  customCSS = 'src/en/genesis/customCSS.css';
  site = 'https://genesistudio.com';
  api = 'https://api.genesistudio.com';
  version = '1.1.2';

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
      //TODO: Fix cover to allow gifs
    }));
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // There is only one page of results, and no known page function, so do not try
    if (pageNo !== 1) return [];
    // Only 14 results, no use in sorting or status
    // Also all novels are Ongoing with no Completed, can't test status filter
    const link = `${this.site}/api/directus/novels?status=published&fields=["novel_title","cover","abbreviation"]&limit=-1`;
    const json = await fetchApi(link).then(r => r.json());
    return this.parseNovelJSON(json);
  }

  // Helper function to extract novel data from nodes
  extractData(nodes: any[]): any {
    return nodes
      .filter((node: { type: string }) => node.type === 'data')
      .map((node: { data: any }) => node.data)[0];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const abbreviation = novelPath.toString().replace('/novels/', '');
    const url = `${this.site}/api/directus/novels/by-abbreviation/${abbreviation.toString()}`;

    // Fetch the novel's data in JSON format
    const raw = await fetchApi(url);
    const json = await raw.json();
    // const nodes = json.nodes;

    // Extract the main novel data from the nodes
    // const data = this.extractData(nodes);

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

    // Parse the chapters if available and assign them to the novel object
    // novel.chapters = this.extractChapters(json);
    novel.chapters = [];

    return novel;
  }

  // Helper function to extract and format chapters
  extractChapters(data: any): Plugin.ChapterItem[] {
    const chapterKey = 'chapters';
    const chapters: Plugin.ChapterItem[] = [];

    // Iterate over each property in data to find chapter containers
    for (const key in data) {
      const value = data[key];

      // Look for an object with a 'chapters' key
      if (value && typeof value === 'object' && chapterKey in value) {
        const chaptersIndexKey = value[chapterKey];
        const chapterData = data[chaptersIndexKey];
        if (!chapterData || typeof chapterData !== 'object') continue;

        // Dynamically get chapter indices from every category (free, premium, etc.)
        let allChapterIndices: number[] = [];
        for (const category of Object.keys(chapterData)) {
          const chapterIndices = data[chapterData[category]];
          if (Array.isArray(chapterIndices)) {
            allChapterIndices = allChapterIndices.concat(chapterIndices);
          }
        }

        // Format each chapter and add only valid ones
        const formattedChapters = allChapterIndices
          .map((index: number) => data[index])
          .map((chapter: any) => this.formatChapter(chapter, data))
          .filter((chapter): chapter is Plugin.ChapterItem => chapter !== null);

        chapters.push(...formattedChapters);
      }
    }

    return chapters;
  }

  // Helper function to format an individual chapter
  formatChapter(chapter: any, data: any): Plugin.ChapterItem | null {
    const { id, chapter_title, chapter_number, required_tier, date_created } =
      chapter;

    // Destructure from data using computed property names based on chapter keys
    const {
      [id]: chapterId,
      [chapter_title]: chapterTitle,
      [chapter_number]: chapterNumberVal,
      [required_tier]: requiredTierVal,
      [date_created]: dateCreated,
    } = data;

    // Validate required fields
    if (
      chapterId &&
      chapterTitle &&
      chapterNumberVal >= 0 &&
      requiredTierVal !== null &&
      dateCreated
    ) {
      const chapterNumber = parseInt(String(chapterNumberVal), 10) || 0;
      const requiredTier = parseInt(String(requiredTierVal), 10) || 0;

      // Only process chapters that do not require a premium tier
      if (requiredTier === 0) {
        return {
          name: `Chapter ${chapterNumber} - ${chapterTitle}`,
          path: `/viewer/${chapterId}`,
          releaseTime: dateCreated,
          chapterNumber: chapterNumber,
        };
      }
    }

    return null;
  }

  // // Helper function to extract and format chapters
  // extractChapters(data: any): Plugin.ChapterItem[] {
  //   for (const key in data) {
  //     const value = data[key];
  //
  //     // Change string here if the chapters are stored under a different key
  //     const chapterKey = 'chapters';
  //     if (typeof value === 'object' && value !== null && chapterKey in value) {
  //       const chapterData = this.decodeData(data[value[chapterKey]]);
  //
  //       // Object.values will give us an array of arrays (any[][])
  //       const chapterArrays: any[][] = Object.values(chapterData);
  //
  //       // Flatten and format the chapters
  //       return chapterArrays.flatMap((chapters: any[]) => {
  //         return chapters
  //           .map((chapter: any) => this.formatChapter(chapter))
  //           .filter(
  //             (chapter): chapter is Plugin.ChapterItem => chapter !== null,
  //           );
  //       });
  //     }
  //   }
  //
  //   return [];
  // }
  //
  // // Helper function to format an individual chapter
  // formatChapter(chapter: any): Plugin.ChapterItem | null {
  //   const { id, chapter_title, chapter_number, required_tier, date_created } =
  //     chapter;
  //
  //   // Ensure required fields are present and valid
  //   if (
  //     id &&
  //     chapter_title &&
  //     chapter_number >= 0 &&
  //     required_tier !== null &&
  //     date_created
  //   ) {
  //     const number = parseInt(chapter_number, 10) || 0;
  //     const requiredTier = parseInt(required_tier, 10) || 0;
  //
  //     // Only process chapters with a 'requiredTier' of 0
  //     if (requiredTier === 0) {
  //       return {
  //         name: `Chapter ${number}: ${chapter_title}`,
  //         path: `/viewer/${id}`,
  //         releaseTime: date_created,
  //         chapterNumber: number,
  //       };
  //     }
  //   }
  //
  //   return null;
  // }
  //
  // decodeData(code: any) {
  //   const offset = this.getOffsetIndex(code);
  //   const params = this.getDecodeParams(code);
  //   const constant = this.getConstant(code);
  //   const data = this.getStringsArrayRaw(code);
  //
  //   const getDataAt = (x: number) => data[x - offset];
  //
  //   //reshuffle data array
  //   // eslint-disable-next-line no-constant-condition
  //   while (true) {
  //     try {
  //       const some_number = this.applyDecodeParams(params, getDataAt);
  //       if (some_number === constant) break;
  //       else data.push(data.shift());
  //     } catch (err) {
  //       data.push(data.shift());
  //     }
  //   }
  //
  //   return this.getChapterData(code, getDataAt);
  // }
  //
  // getOffsetIndex(code: string) {
  //   // @ts-ignore
  //   const string = /{(\w+)=\1-0x(?<offset>[0-9a-f]+);/.exec(code).groups.offset;
  //   return parseInt(string, 16);
  // }
  //
  // /**
  //  * @returns {string[]}
  //  */
  // getStringsArrayRaw(code: string) {
  //   // @ts-ignore
  //   let json = /function \w+\(\){var \w+=(?<array>\['.+']);/.exec(code).groups
  //     .array;
  //
  //   //replace string single quotes with double quotes and add escaped chars
  //   json = json.replace(/'(.+?)'([,\]])/g, (match, p1, p2) => {
  //     return `"${p1.replace(/\\x([0-9a-z]{2})/g, (match: any, p1: string) => {
  //       //hexadecimal unicode escape chars
  //       return String.fromCharCode(parseInt(p1, 16));
  //     })}"${p2}`;
  //   });
  //
  //   return JSON.parse(json);
  // }
  //
  // /**
  //  * @returns {{offset: number, divider: number, negated: boolean}[][]}
  //  */
  // getDecodeParams(code: string) {
  //   // @ts-ignore
  //   const jsDecodeInt = /while\(!!\[]\){try{var \w+=(?<code>.+?);/.exec(code)
  //     .groups.code;
  //   const decodeSections = jsDecodeInt.split('+');
  //   const params = [];
  //   for (const section of decodeSections) {
  //     params.push(this.decodeParamSection(section));
  //   }
  //   return params;
  // }
  //
  // /**
  //  * @param {string} section
  //  * @returns {{offset: number, divider: number, negated: boolean}[]}
  //  */
  // decodeParamSection(section: string) {
  //   const sections = section.split('*');
  //   const params = [];
  //   for (const section of sections) {
  //     // @ts-ignore
  //     const offsetStr = /parseInt\(\w+\(0x(?<offset>[0-9a-f]+)\)\)/.exec(
  //       section,
  //     ).groups.offset;
  //     const offset = parseInt(offsetStr, 16);
  //     // @ts-ignore
  //     const dividerStr = /\/0x(?<divider>[0-9a-f]+)/.exec(section).groups
  //       .divider;
  //     const divider = parseInt(dividerStr, 16);
  //     const negated = section.includes('-');
  //     params.push({ offset, divider, negated });
  //   }
  //   return params;
  // }
  //
  // getConstant(code: string) {
  //   // @ts-ignore
  //   const constantStr = /}}}\(\w+,0x(?<constant>[0-9a-f]+)\),/.exec(code).groups
  //     .constant;
  //   return parseInt(constantStr, 16);
  // }
  //
  // getChapterData(
  //   code: string,
  //   getDataAt: { (x: number): any; (arg0: number): any },
  // ) {
  //   let chapterDataStr =
  //     // @ts-ignore
  //     /\),\(function\(\){var \w+=\w+;return(?<data>{.+?});/.exec(code).groups
  //       .data;
  //
  //   //replace hex with decimal
  //   chapterDataStr = chapterDataStr.replace(/:0x([0-9a-f]+)/g, (match, p1) => {
  //     const hex = parseInt(p1, 16);
  //     return `: ${hex}`;
  //   });
  //
  //   //replace ![] with false and !![] with true
  //   chapterDataStr = chapterDataStr
  //     .replace(/:!!\[]/g, ':true')
  //     .replace(/:!\[]/g, ':false');
  //
  //   //replace string single quotes with double quotes and add escaped chars
  //   chapterDataStr = chapterDataStr.replace(
  //     /'(.+?)'([,\]}:])/g,
  //     (match, p1, p2) => {
  //       return `"${p1.replace(/\\x([0-9a-z]{2})/g, (match: any, p1: string) => {
  //         //hexadecimal unicode escape chars
  //         return String.fromCharCode(parseInt(p1, 16));
  //       })}"${p2}`;
  //     },
  //   );
  //
  //   //parse the data getting methods
  //   chapterDataStr = chapterDataStr.replace(
  //     // @ts-ignore
  //     /:\w+\(0x(?<offset>[0-9a-f]+)\)/g,
  //     (match, p1) => {
  //       const offset = parseInt(p1, 16);
  //       return `:${JSON.stringify(getDataAt(offset))}`;
  //     },
  //   );
  //
  //   return JSON.parse(chapterDataStr);
  // }
  //
  // /**
  //  * @param {{offset: number, divider: number, negated: boolean}[][]} params
  //  * @param {function(number): string} getDataAt
  //  */
  // applyDecodeParams(
  //   params: { offset: number; divider: number; negated: boolean }[][],
  //   getDataAt: { (x: number): any; (arg0: any): string },
  // ) {
  //   let res = 0;
  //   for (const paramAdd of params) {
  //     let resInner = 1;
  //     for (const paramMul of paramAdd) {
  //       resInner *= parseInt(getDataAt(paramMul.offset)) / paramMul.divider;
  //       if (paramMul.negated) resInner *= -1;
  //     }
  //     res += resInner;
  //   }
  //   return res;
  // }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.site}${chapterPath}/__data.json?x-sveltekit-invalidated=001`;

    // Fetch the novel's data in JSON format
    const json = await fetchApi(url).then(r => r.json());
    const nodes = json.nodes;

    // Extract the main novel data from the nodes
    const data = this.extractData(nodes);

    // Look for chapter container with required fields
    const contentKey = 'content';
    const notesKey = 'notes';
    const footnotesKey = 'footnotes';

    // Iterate over each property in data to find chapter containers
    for (const key in data) {
      const mapping = data[key];

      // Check container for keys that match the required fields
      if (
        mapping &&
        typeof mapping === 'object' &&
        contentKey in mapping &&
        notesKey in mapping &&
        footnotesKey in mapping
      ) {
        // Retrieve the chapter's content, notes, and footnotes using the mapping.
        const content = data[mapping[contentKey]];
        const notes = data[mapping[notesKey]];
        const footnotes = data[mapping[footnotesKey]];

        // Return the combined parts with appropriate formatting
        return (
          content +
          (notes ? `<h2>Notes</h2><br>${notes}` : '') +
          (footnotes ?? '')
        );
      }
    }

    // If no mapping object was found, return an empty string or handle appropriately.
    return '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.SourceNovel[]> {
    if (pageNo !== 1) return [];
    const url = `${this.site}/api/novels/search?serialization=All&sort=Popular&title=${encodeURIComponent(searchTerm)}`;
    const json = await fetchApi(url).then(r => r.json());
    return this.parseNovelJSON(json);
  }

  filters = {
    sort: {
      label: 'Sort Results By',
      value: 'Popular',
      options: [
        { label: 'Popular', value: 'Popular' },
        { label: 'Recent', value: 'Recent' },
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
