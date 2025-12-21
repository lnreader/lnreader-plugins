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

    // Parse the chapters if available and assign them to the novel object
    novel.chapters = await this.extractChapters(json.id);
    // novel.chapters = [];

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
        const chapterName = index.chapter_title;
        const chapterPath = index.id;
        const chapterNum = `/viewer/${index.chapter_number}`;
        const unlocked = index.isUnlocked;

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
