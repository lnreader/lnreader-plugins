import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';
import { defaultCover } from '@libs/defaultCover';

class Genesis implements Plugin.PluginBase {
  id = 'genesistudio';
  name = 'Genesis';
  icon = 'src/en/genesis/icon.png';
  customCSS = 'src/en/genesis/customCSS.css';
  site = 'https://genesistudio.com';
  api = 'https://api.genesistudio.com';
  version = '2.0.3';

  hideLocked = storage.get('hideLocked');
  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  imageRequestInit?: Plugin.ImageRequestInit = {
    headers: {
      'referrer': this.site,
    },
  };

  async parseNovelJSON(): Promise<Plugin.SourceNovel[]> {
    // Thought about caching this,
    // but not sure what would happen if a new novel were to be
    // added to the library, so, fetch everytime it is
    //
    // fields param literally gives you the JSON you want
    // maybe TODO: add filtering
    const params = new URLSearchParams({
      status: 'published',
      fields: '["id","novel_title","cover","abbreviation"]',
      limit: '-1',
    });
    const link = `${this.site}/api/directus/novels?${params.toString()}`;
    const json: NovelJSON[] = await fetchApi(link).then(r => r.json());
    return json.map(novel => ({
      name: novel.novel_title,
      path: `/novels/${novel.abbreviation}`.trim(),
      cover: `${this.api}/storage/v1/object/public/directus/${novel.cover}.png`,
    }));
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // There is only one page of results, and no known page function, so do not try
    if (pageNo !== 1) return [];
    return this.parseNovelJSON();
  }

  async getCoverUrl(coverId: string): Promise<string> {
    // genesis doesn't actually use jpegs but just in case
    const ext = await fetchApi(`${this.site}/api/directus-file/${coverId}`)
      .then(res => res.json())
      .then(data =>
        data.type ? data.type.split('/')[1].replace('jpeg', 'jpg') : 'png',
      )
      .catch(() => 'png');

    return `${this.api}/storage/v1/object/public/directus/${coverId}.${ext}`;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const abbreviation = novelPath.replace('/novels/', '');
    const url = `${this.site}/api/directus/novels/by-abbreviation/${abbreviation}`;

    // Fetch the novel's data in JSON format
    const raw = await fetchApi(url);
    const json: NovelJSON = await raw.json();

    const novel: Plugin.SourceNovel = {
      name: json.novel_title,
      path: novelPath,
      summary: json.synopsis,
      author: json.author,
      cover: json.cover ? await this.getCoverUrl(json.cover) : defaultCover,
      genres: json.genres
        ?.map(g => g.genres_id?.label)
        .filter(l => l)
        .join(','),
    };

    const map: Record<string, string> = {
      ongoing: NovelStatus.Ongoing,
      hiatus: NovelStatus.OnHiatus,
      dropped: NovelStatus.Cancelled,
      cancelled: NovelStatus.Cancelled,
      completed: NovelStatus.Completed,
      unknown: NovelStatus.Unknown,
    };
    novel.status =
      map[json.serialization?.toLowerCase() || ''] ?? NovelStatus.Unknown;

    // Parse the chapters if available and assign them to the novel object
    novel.chapters = await this.extractChapters(json.id);

    return novel;
  }

  // Helper function to extract and format chapters
  async extractChapters(id: string): Promise<Plugin.ChapterItem[]> {
    const url = `${this.site}/api/novels-chapter/${id}`;

    // Fetch the chapter data in JSON format
    const raw = await fetchApi(url);
    const json: ChapterJSON = await raw.json();

    // Only released chapters are listed; the pre-2.0.1 Supabase query filtered on status=eq.released
    // (every chapter observed had status released: 5 of 5 and 157 of 157 in the listing, 2026-10-15)
    const chapters = json.data.chapters
      .filter(index => index.status === 'released')
      .map(index => {
        const title = index.chapter_title;
        const isLocked = !index.isUnlocked;
        const chapterPath = isLocked
          ? `/viewer/locked/${index.id}`
          : `/viewer/${index.id}`;
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
      .filter(chapter => chapter !== null);

    return chapters;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    if (chapterPath.startsWith('/viewer/locked/')) {
      throw new Error('This chapter is locked on the site');
    }
    const id = chapterPath.replace('/viewer/', '');

    // Anonymous requests for paid chapters get HTTP 401, error "Authentication required",
    // and chapter_content "None" (checked 2026-10-15), so a refusal is treated as locked
    const res = await fetchApi(`${this.site}/api/chapters/${id}/content`);
    const json: ChapterContentJSON = await res.json();

    const content = json.data?.chapter_content;
    if (!res.ok || json.error || !content || content === 'None') {
      throw new Error('This chapter is locked on the site');
    }
    return content.replaceAll('\n', '<br/>');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.SourceNovel[]> {
    if (pageNo !== 1) return [];
    // Since only 26 novels, fetch all the novels
    // then filter out the novels which match the criteria
    const novels = await this.parseNovelJSON();
    const query = this.normalize(searchTerm);

    return novels.filter(novel => this.normalize(novel.name).includes(query));
  }

  // grabbed from Witch Cult Translations
  private normalize(str: string) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // due to the low amount of novels, using filters kinda overkill
  // unless we apply filters to cached results
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
    // storyStatus: {
    //   label: 'Status',
    //   value: 'All',
    //   options: [
    //     { label: 'All', value: 'All' },
    //     { label: 'Ongoing', value: 'Ongoing' },
    //     { label: 'Completed', value: 'Completed' },
    //   ],
    //   type: FilterTypes.Picker,
    // },
    genres: {
      label: 'Genres',
      value: [],
      options: [
        { 'label': 'Academy', 'value': '21' },
        { 'label': 'Action', 'value': '1' },
        { 'label': 'Adventure', 'value': '15' },
        { 'label': 'Calm Protagonist', 'value': '22' },
        { 'label': 'Comedy', 'value': '2' },
        { 'label': 'Cultivation', 'value': '25' },
        { 'label': 'Drama', 'value': '3' },
        { 'label': 'Fantasy', 'value': '5' },
        { 'label': 'Harem', 'value': '11' },
        { 'label': 'Idol', 'value': '20' },
        { 'label': 'Martial Arts', 'value': '6' },
        { 'label': 'Modern', 'value': '4' },
        { 'label': 'Modern Fantasy', 'value': '27' },
        { 'label': 'Mystery', 'value': '8' },
        { 'label': 'Psychological', 'value': '10' },
        { 'label': 'Romance', 'value': '9' },
        { 'label': 'School Life', 'value': '13' },
        { 'label': 'Sci-fi', 'value': '24' },
        { 'label': 'Slice of Life', 'value': '7' },
        { 'label': 'Supernatural', 'value': '14' },
        { 'label': 'Tragedy', 'value': '12' },
        { 'label': 'Transmigration', 'value': '23' },
        { 'label': 'Yandere', 'value': '26' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new Genesis();

type NovelJSON = {
  id: string;
  novel_title: string;
  abbreviation: string;
  cover: string;
  synopsis?: string;
  author?: string;
  serialization?: string;
  genres?: {
    genres_id?: {
      id?: number;
      label?: string;
    };
  }[];
};

type ChapterJSON = {
  data: {
    chapters: {
      id: string;
      chapter_number: number;
      chapter_title: string;
      status: string;
      isUnlocked: boolean;
    }[];
  };
};

type ChapterContentJSON = {
  error?: string;
  data?: {
    chapter_content?: string | null;
  };
};
