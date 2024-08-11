import { Parser } from 'htmlparser2';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

class RoyalRoad implements Plugin.PluginBase {
  id = 'royalroad';
  name = 'Royal Road';
  version = '2.1.0';
  icon = 'src/en/royalroad/icon.png';
  site = 'https://www.royalroad.com/';

  parseNovels(html: string) {
    const novels: Plugin.NovelItem[] = [];
    let tempNovel = {} as Plugin.NovelItem;
    tempNovel.name = '';
    let isParsingNovel = false;
    let isNovelName = false;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (attribs['class']?.includes('fiction-list-item')) {
          isParsingNovel = true;
        }
        if (isParsingNovel) {
          if (name === 'a' && attribs['class']?.includes('bold')) {
            tempNovel.path = attribs['href'].slice(1);
            isNovelName = true;
          }
          if (name === 'img') {
            tempNovel.cover = attribs['src'];
          }
          if (tempNovel.path && tempNovel.name) {
            novels.push(tempNovel);
            tempNovel = {} as Plugin.NovelItem;
            tempNovel.name = '';
          }
        }
      },
      ontext(data) {
        if (isNovelName) {
          tempNovel.name += data;
        }
      },
      onclosetag(name) {
        if (name === 'h2') {
          isNovelName = false;
          isParsingNovel = false;
        }
      },
    });
    parser.write(html);
    parser.end();
    return novels;
  }

  async popularNovels(
    page: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}fictions/search`;
    link += `?page=${page}`;
    if (!filters) filters = this.filters || {};
    if (showLatestNovels) link += '&orderBy=last_update';
    for (const key in filters) {
      if (filters[key as keyof typeof filters].value === '') continue;
      if (key === 'genres' || key === 'tags' || key === 'content_warnings') {
        if (filters[key].value.include)
          for (const include of filters[key].value.include) {
            link += `&tagsAdd=${include}`;
          }
        if (filters[key].value.exclude)
          for (const exclude of filters[key].value.exclude) {
            link += `&tagsRemove=${exclude}`;
          }
      } else if (typeof filters[key as keyof typeof filters] === 'object')
        link += `&${key}=${filters[key as keyof typeof filters].value}`;
    }

    const body = await fetchApi(link).then(r => r.text());

    return this.parseNovels(body);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const html = await result.text();
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      summary: '',
      chapters: [],
    };
    let isNovelName = false;
    let isAuthorName = false;
    let isDescription = false;
    let isH4 = false;
    let isSpan = 0;
    let isTags = false;
    let isGenres = false;
    const genreArray: string[] = [];
    let isFooter = false;
    let isScript = false;
    let chapterJson: ChapterEntry[] = [];
    let volumeJson: VolumeEntry[] = [];
    const parser = new Parser({
      onopentag(name, attribs) {
        if (name === 'img' && attribs['class']?.includes('thumbnail')) {
          novel.cover = attribs['src'];
        }
        if (name === 'span' && attribs['class']?.includes('label-sm')) {
          isSpan++;
        }
        if (name === 'span' && attribs['class']?.includes('tags')) {
          isTags = true;
        }
      },
      onopentagname(name) {
        if (name === 'h1') {
          isNovelName = true;
        }
        if (isH4 && name === 'a') {
          isAuthorName = true;
        }
        if (isTags && name === 'a') {
          isGenres = true;
        }
        if (name === 'label') {
          isDescription = false;
          isTags = false;
        }
        if (isFooter && name === 'script') {
          isScript = true;
        }
      },
      onattribute(name, value) {
        if (name === 'class' && value === 'description') {
          isDescription = true;
        }
        if (name === 'class' && value === 'page-footer footer') {
          isFooter = true;
        }
      },
      ontext(data) {
        if (isNovelName) {
          novel.name = novel.name + data;
        }
        if (isAuthorName) {
          novel.author = data;
          isAuthorName = false;
        }
        if (isDescription) {
          novel.summary += data;
        }
        if (isSpan === 2) {
          novel.status = data.trim();
          isSpan++;
        }
        if (isGenres) {
          genreArray.push(data);
        }
        if (isScript) {
          if (data.includes('window.chapters =')) {
            chapterJson = JSON.parse(
              data.match(/window.chapters = (.+])(?=;)/)![1],
            );
            volumeJson = JSON.parse(
              data.match(/window.volumes = (.+])(?=;)/)![1],
            );
          }
        }
      },
      onclosetag(name) {
        if (name === 'h1') {
          isNovelName = false;
          isH4 = true;
        }
        if (name === 'h4') {
          isH4 = false;
        }
        if (name === 'a') {
          isGenres = false;
        }
        if (name === 'script') {
          isScript = false;
        }
        if (name === 'body') {
          isFooter = false;
        }
      },
    });
    parser.write(html);
    parser.end();
    novel.summary = novel.summary?.trim();
    novel.genres = genreArray.join(', ');
    switch (novel.status) {
      case 'ONGOING':
        novel.status = NovelStatus.Ongoing;
        break;
      case 'HIATUS':
        novel.status = NovelStatus.OnHiatus;
        break;
      case 'COMPLETED':
        novel.status = NovelStatus.Completed;
        break;
      default:
        novel.status = NovelStatus.Unknown;
    }

    const chapter: Plugin.ChapterItem[] = chapterJson.map(
      (chapter: ChapterEntry) => {
        const matchingVolume = volumeJson.find(
          (volume: VolumeEntry) => volume.id === chapter.volumeId,
        );
        return {
          name: chapter.title,
          path: chapter.url.slice(1),
          releaseTime: chapter.date,
          chapterNumber: chapter?.order,
          page: matchingVolume?.title,
        };
      },
    );

    novel.chapters = chapter;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const html = await result.text();
    const parts: string[] = [];
    const regexPatterns: RegExp[] = [
      /(<div class="portlet solid author-note-portlet"[^]+)<div class="margin-bottom-20/,
      /(<div class="chapter-inner chapter-content"[^]+)<div class="portlet light t-center-3/,
      /(<\/div>\s+<div class="portlet solid author-note-portlet"[^]+)<div class="row margin-bottom-10/,
    ];

    const extractContent = (patterns: RegExp[]) => {
      patterns.forEach(regex => {
        const match = html.match(regex)?.[1];
        if (match) parts.push(match);
      });
    };
    extractContent(regexPatterns);
    const chapterText = parts.join('<hr>');
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const searchUrl = `${this.site}fictions/search?page=${page}&title=${searchTerm}`;

    const body = await fetchApi(searchUrl).then(r => r.text());
    return this.parseNovels(body);
  }

  filters = {
    'keyword': {
      'type': FilterTypes.TextInput,
      'label': 'Keyword (title or description)',
      'value': '',
    },
    'author': {
      'type': FilterTypes.TextInput,
      'label': 'Author',
      'value': '',
    },
    'genres': {
      'type': FilterTypes.ExcludableCheckboxGroup,
      'label': 'Genres',
      'value': {
        'include': [],
        'exclude': [],
      },
      'options': [
        {
          'label': 'Action',
          'value': 'action',
        },
        {
          'label': 'Adventure',
          'value': 'adventure',
        },
        {
          'label': 'Comedy',
          'value': 'comedy',
        },
        {
          'label': 'Contemporary',
          'value': 'contemporary',
        },
        {
          'label': 'Drama',
          'value': 'drama',
        },
        {
          'label': 'Fantasy',
          'value': 'fantasy',
        },
        {
          'label': 'Historical',
          'value': 'historical',
        },
        {
          'label': 'Horror',
          'value': 'horror',
        },
        {
          'label': 'Mystery',
          'value': 'mystery',
        },
        {
          'label': 'Psychological',
          'value': 'psychological',
        },
        {
          'label': 'Romance',
          'value': 'romance',
        },
        {
          'label': 'Satire',
          'value': 'satire',
        },
        {
          'label': 'Sci-fi',
          'value': 'sci_fi',
        },
        {
          'label': 'Short Story',
          'value': 'one_shot',
        },
        {
          'label': 'Tragedy',
          'value': 'tragedy',
        },
      ],
    },
    'tags': {
      'type': FilterTypes.ExcludableCheckboxGroup,
      'label': 'Tags',
      'value': {
        'include': [],
        'exclude': [],
      },
      'options': [
        {
          'label': 'Anti-Hero Lead',
          'value': 'anti-hero_lead',
        },
        {
          'label': 'Artificial Intelligence',
          'value': 'artificial_intelligence',
        },
        {
          'label': 'Attractive Lead',
          'value': 'attractive_lead',
        },
        {
          'label': 'Cyberpunk',
          'value': 'cyberpunk',
        },
        {
          'label': 'Dungeon',
          'value': 'dungeon',
        },
        {
          'label': 'Dystopia',
          'value': 'dystopia',
        },
        {
          'label': 'Female Lead',
          'value': 'female_lead',
        },
        {
          'label': 'First Contact',
          'value': 'first_contact',
        },
        {
          'label': 'GameLit',
          'value': 'gamelit',
        },
        {
          'label': 'Gender Bender',
          'value': 'gender_bender',
        },
        {
          'label': 'Genetically Engineered',
          'value': 'genetically_engineered ',
        },
        {
          'label': 'Grimdark',
          'value': 'grimdark',
        },
        {
          'label': 'Hard Sci-fi',
          'value': 'hard_sci-fi',
        },
        {
          'label': 'Harem',
          'value': 'harem',
        },
        {
          'label': 'High Fantasy',
          'value': 'high_fantasy',
        },
        {
          'label': 'LitRPG',
          'value': 'litrpg',
        },
        {
          'label': 'Low Fantasy',
          'value': 'low_fantasy',
        },
        {
          'label': 'Magic',
          'value': 'magic',
        },
        {
          'label': 'Male Lead',
          'value': 'male_lead',
        },
        {
          'label': 'Martial Arts',
          'value': 'martial_arts',
        },
        {
          'label': 'Multiple Lead Characters',
          'value': 'multiple_lead',
        },
        {
          'label': 'Mythos',
          'value': 'mythos',
        },
        {
          'label': 'Non-Human Lead',
          'value': 'non-human_lead',
        },
        {
          'label': 'Portal Fantasy / Isekai',
          'value': 'summoned_hero',
        },
        {
          'label': 'Post Apocalyptic',
          'value': 'post_apocalyptic',
        },
        {
          'label': 'Progression',
          'value': 'progression',
        },
        {
          'label': 'Reader Interactive',
          'value': 'reader_interactive',
        },
        {
          'label': 'Reincarnation',
          'value': 'reincarnation',
        },
        {
          'label': 'Ruling Class',
          'value': 'ruling_class',
        },
        {
          'label': 'School Life',
          'value': 'school_life',
        },
        {
          'label': 'Secret Identity',
          'value': 'secret_identity',
        },
        {
          'label': 'Slice of Life',
          'value': 'slice_of_life',
        },
        {
          'label': 'Soft Sci-fi',
          'value': 'soft_sci-fi',
        },
        {
          'label': 'Space Opera',
          'value': 'space_opera',
        },
        {
          'label': 'Sports',
          'value': 'sports',
        },
        {
          'label': 'Steampunk',
          'value': 'steampunk',
        },
        {
          'label': 'Strategy',
          'value': 'strategy',
        },
        {
          'label': 'Strong Lead',
          'value': 'strong_lead',
        },
        {
          'label': 'Super Heroes',
          'value': 'super_heroes',
        },
        {
          'label': 'Supernatural',
          'value': 'supernatural',
        },
        {
          'label': 'Technologically Engineered',
          'value': 'technologically_engineered',
        },
        {
          'label': 'Time Loop',
          'value': 'loop',
        },
        {
          'label': 'Time Travel',
          'value': 'time_travel',
        },
        {
          'label': 'Urban Fantasy',
          'value': 'urban_fantasy',
        },
        {
          'label': 'Villainous Lead',
          'value': 'villainous_lead',
        },
        {
          'label': 'Virtual Reality',
          'value': 'virtual_reality',
        },
        {
          'label': 'War and Military',
          'value': 'war_and_military',
        },
        {
          'label': 'Wuxia',
          'value': 'wuxia',
        },
        {
          'label': 'Xianxia',
          'value': 'xianxia',
        },
      ],
    },
    'content_warnings': {
      'type': FilterTypes.ExcludableCheckboxGroup,
      'label': 'Content Warnings',
      'value': {
        'include': [],
        'exclude': [],
      },
      'options': [
        {
          'label': 'Profanity',
          'value': 'profanity',
        },
        {
          'label': 'Sexual Content',
          'value': 'sexuality',
        },
        {
          'label': 'Graphic Violence',
          'value': 'graphic_violence',
        },
        {
          'label': 'Sensitive Content',
          'value': 'sensitive',
        },
        {
          'label': 'AI-Assisted Content',
          'value': 'ai_assisted',
        },
        {
          'label': 'AI-Generated Content',
          'value': 'ai_generated',
        },
      ],
    },
    'minPages': {
      'type': FilterTypes.TextInput,
      'label': 'Min Pages',
      'value': '0',
    },
    'maxPages': {
      'type': FilterTypes.TextInput,
      'label': 'Max Pages',
      'value': '20000',
    },
    'minRating': {
      'type': FilterTypes.TextInput,
      'label': 'Min Rating (0.0 - 5.0)',
      'value': '0.0',
    },
    'maxRating': {
      'type': FilterTypes.TextInput,
      'label': 'Max Rating (0.0 - 5.0)',
      'value': '5.0',
    },
    'status': {
      'type': FilterTypes.Picker,
      'label': 'Status',
      'value': 'ALL',
      'options': [
        {
          'label': 'All',
          'value': 'ALL',
        },
        {
          'label': 'Completed',
          'value': 'COMPLETED',
        },
        {
          'label': 'Dropped',
          'value': 'DROPPED',
        },
        {
          'label': 'Ongoing',
          'value': 'ONGOING',
        },
        {
          'label': 'Hiatus',
          'value': 'HIATUS',
        },
        {
          'label': 'Stub',
          'value': 'STUB',
        },
      ],
    },
    'orderBy': {
      'type': FilterTypes.Picker,
      'label': 'Order by',
      'value': 'relevance',
      'options': [
        {
          'label': 'Relevance',
          'value': 'relevance',
        },
        {
          'label': 'Popularity',
          'value': 'popularity',
        },
        {
          'label': 'Average Rating',
          'value': 'rating',
        },
        {
          'label': 'Last Update',
          'value': 'last_update',
        },
        {
          'label': 'Release Date',
          'value': 'release_date',
        },
        {
          'label': 'Followers',
          'value': 'followers',
        },
        {
          'label': 'Number of Pages',
          'value': 'length',
        },
        {
          'label': 'Views',
          'value': 'views',
        },
        {
          'label': 'Title',
          'value': 'title',
        },
        {
          'label': 'Author',
          'value': 'author',
        },
      ],
    },
    'dir': {
      'type': FilterTypes.Picker,
      'label': 'Direction',
      'value': 'desc',
      'options': [
        {
          'label': 'Ascending',
          'value': 'asc',
        },
        {
          'label': 'Descending',
          'value': 'desc',
        },
      ],
    },
    'type': {
      'type': FilterTypes.Picker,
      'label': 'Type',
      'value': 'ALL',
      'options': [
        {
          'label': 'All',
          'value': 'ALL',
        },
        {
          'label': 'Fan Fiction',
          'value': 'fanfiction',
        },
        {
          'label': 'Original',
          'value': 'original',
        },
      ],
    },
  } satisfies Filters;
}

export default new RoyalRoad();

interface ChapterEntry {
  id: number;
  volumeId: number;
  title: string;
  date: string;
  order: number;
  url: string;
}

interface VolumeEntry {
  id: number;
  title: string;
  cover: string;
  order: number;
}
