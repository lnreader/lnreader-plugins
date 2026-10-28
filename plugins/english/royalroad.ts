import { Parser } from 'htmlparser2';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
import { storage } from '@libs/storage';

class RoyalRoad implements Plugin.PluginBase {
  id = 'royalroad';
  name = 'Royal Road';
  version = '2.3.4';
  icon = 'src/en/royalroad/icon.png';
  site = 'https://www.royalroad.com/';

  enableVol = storage.get('enableVol');
  pluginSettings = {
    enableVol: {
      value: '',
      label: 'Enable Pagination / Volume view (not recommended)',
      type: 'Switch',
    },
  };

  // Royal Road puts an Anubis proof-of-work check in front of its pages. Until
  // the client has the Anubis cookie, every page is the check page (HTTP 200).
  // Pass the check the same way a browser does. The app keeps the cookie for
  // later requests, until the IP address changes or the cookie expires.
  async fetchHtml(url: string): Promise<string> {
    // Let a check that is in progress finish, so this request uses its cookie.
    if (anubisCheck) await anubisCheck.catch(() => '');
    const html = await fetchPageHtml(url);
    const challenge = readAnubisChallenge(html);
    if (!challenge) return html;

    let page: string;
    if (anubisCheck) {
      await anubisCheck;
      page = await fetchPageHtml(url);
    } else {
      anubisCheck = passAnubisChallenge(html, challenge, url);
      try {
        page = await anubisCheck;
      } finally {
        anubisCheck = undefined;
      }
    }
    if (readAnubisChallenge(page)) throw new Error(BOT_CHECK_ERROR);
    return page;
  }

  parseNovels(html: string) {
    const baseUrl = this.site;
    const novels: Plugin.NovelItem[] = [];
    let tempNovel: Partial<Plugin.NovelItem> = {};
    let state: ParsingState = ParsingState.Idle;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (attribs['class']?.includes('fiction-list-item')) {
          state = ParsingState.Novel;
        }
        if (state !== ParsingState.Novel) return;

        switch (name) {
          case 'a':
            if (attribs['href']) {
              tempNovel.path = attribs['href'].split('/').slice(1, 3).join('/');
            }
            break;
          case 'img':
            if (attribs['src']) {
              tempNovel.name = attribs['alt'] || '';
              tempNovel.cover = !isUrlAbsolute(attribs['src'])
                ? baseUrl + attribs['src'].slice(1)
                : attribs['src'];
            }
            break;
        }
      },
      onclosetag(name) {
        if (name === 'figure') {
          if (tempNovel.path && tempNovel.name) {
            novels.push(tempNovel as Plugin.NovelItem);
            tempNovel = {};
          }
          state = ParsingState.Idle;
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
    const params = new URLSearchParams({
      page: page.toString(),
    });
    if (showLatestNovels) {
      params.append('orderBy', 'last_update');
    }
    if (!filters) filters = this.filters || {};
    for (const key in filters) {
      if (filters[key as keyof typeof filters].value === '') continue;
      if (key === 'genres' || key === 'tags' || key === 'content_warnings') {
        if (filters[key].value.include) {
          for (const include of filters[key].value.include) {
            params.append('tagsAdd', include);
          }
        }
        if (filters[key].value.exclude) {
          for (const exclude of filters[key].value.exclude) {
            params.append('tagsRemove', exclude);
          }
        }
      } else {
        params.append(key, String(filters[key as keyof typeof filters].value));
      }
    }

    const link = `${this.site}fictions/search?${params.toString()}`;
    const body = await this.fetchHtml(link);

    return this.parseNovels(body);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await this.fetchHtml(this.site + novelPath);
    const novel: Partial<Plugin.SourceNovel> = {
      path: novelPath,
    };
    const baseUrl = this.site;
    const parseChapters = (scriptContent: string) =>
      this.parseChapters(scriptContent);

    let state: ParsingState = ParsingState.Idle;
    let statusText = '';
    let statusSpanCounter = 0;

    const nameParts: string[] = [];
    const summaryParts: string[] = [];
    const scriptContentParts: string[] = [];
    const genreArray: string[] = [];

    const parser = new Parser({
      onopentag(name, attribs) {
        switch (name) {
          case 'h1':
            state = ParsingState.InTitle;
            break;
          case 'a':
            if (attribs['href']?.startsWith('/profile/') && !novel.author) {
              state = ParsingState.InAuthor;
            } else if (state === ParsingState.InTags) {
              state = ParsingState.InTagLink;
            }
            break;
          case 'div':
            if (attribs['class'] === 'description') {
              state = ParsingState.InDescription;
            }
            break;
          case 'hr':
            if (state === ParsingState.InDescription) {
              summaryParts.push('\n\n---\n\n');
            }
            break;
          case 'br':
            if (state === ParsingState.InDescription) {
              summaryParts.push('\n\n');
            }
            break;
          case 'span':
            if (attribs['class']?.includes('tags')) {
              state = ParsingState.InTags;
            } else if (attribs['class']?.includes('label-sm')) {
              statusSpanCounter++;
              if (statusSpanCounter === 2) {
                state = ParsingState.InStatusSpan;
                statusText = '';
              }
            }
            break;
          case 'img':
            if (attribs['class']?.includes('thumbnail')) {
              novel.cover = attribs['src'];
              if (novel.cover && !isUrlAbsolute(novel.cover)) {
                novel.cover = baseUrl + novel.cover.slice(1);
              }
            }
            break;
          case 'script':
            state = ParsingState.InScript;
            break;
        }
      },
      ontext(text) {
        const trimmedText = text.trim();
        if (!trimmedText && state !== ParsingState.InScript) return;

        switch (state) {
          case ParsingState.InTitle:
            nameParts.push(text);
            break;
          case ParsingState.InAuthor:
            novel.author = trimmedText;
            break;
          case ParsingState.InDescription:
            summaryParts.push(text);
            break;
          case ParsingState.InStatusSpan:
            statusText = trimmedText;
            break;
          case ParsingState.InTagLink:
            genreArray.push(trimmedText);
            break;
          case ParsingState.InScript:
            scriptContentParts.push(text);
            break;
        }
      },
      onclosetag(name) {
        switch (name) {
          case 'h1':
            if (state === ParsingState.InTitle) {
              novel.name = nameParts.join('').trim();
              state = ParsingState.Idle;
            }
            break;
          case 'a':
            if (state === ParsingState.InTagLink) {
              state = ParsingState.InTags;
            } else if (state === ParsingState.InAuthor) {
              state = ParsingState.Idle;
            }
            break;
          case 'p':
            if (state === ParsingState.InDescription) {
              summaryParts.push('\n\n');
            }
            break;
          case 'div':
            if (state === ParsingState.InDescription) {
              novel.summary = summaryParts
                .join('')
                .replace(/&nbsp;/g, ' ')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
              summaryParts.length = 0;
              state = ParsingState.Idle;
            }
            break;
          case 'span':
            if (state === ParsingState.InTags) {
              novel.genres = genreArray.join(', ');
              state = ParsingState.Idle;
            } else if (state === ParsingState.InStatusSpan) {
              state = ParsingState.Idle;
            }
            break;
          case 'script':
            if (state === ParsingState.InScript) {
              state = ParsingState.Idle;
            }
            break;
        }
      },
      onend() {
        switch (statusText) {
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

        novel.chapters = parseChapters(scriptContentParts.join(''));
      },
    });

    parser.write(html);
    parser.end();

    return novel as Plugin.NovelItem;
  }

  parseChapters(scriptContent: string): Plugin.ChapterItem[] {
    const chapterMatch = scriptContent.match(
      /window\.chapters\s*=\s*(\[.*?\]);/,
    );
    const volumeMatch = scriptContent.match(/window\.volumes\s*=\s*(\[.*?\]);/);
    const chapterJson: ChapterEntry[] = chapterMatch?.[1]
      ? JSON.parse(chapterMatch[1])
      : [];
    const volumeJson: VolumeEntry[] =
      volumeMatch?.[1] && this.enableVol ? JSON.parse(volumeMatch[1]) : [];

    return chapterJson.map((chapter: ChapterEntry) => {
      const matchingVolume = volumeJson.find(
        (volume: VolumeEntry) => volume.id === chapter.volumeId,
      );
      return {
        name: chapter.title,
        path: (() => {
          const parts = chapter.url.split('/');
          return `${parts[1]}/${parts[2]}/${parts[4]}/${parts[5]}`;
        })(),
        releaseTime: chapter.date,
        chapterNumber: chapter?.order,
        page: matchingVolume?.title,
      };
    });
  }

  // LNReader asks for a page when it has no stored chapters for it, e.g. a novel
  // that was saved without its chapter list. Every chapter is on the fiction page.
  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const chapters = this.parseChapters(
      await this.fetchHtml(this.site + novelPath),
    );
    // Page "1" is asked for when the app has no stored pages at all, so give it
    // the whole list; any other page is a volume title.
    return {
      chapters:
        page === '1'
          ? chapters
          : chapters.filter(chapter => chapter.page === page),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchHtml(this.site + chapterPath);

    let state = ParsingState.Idle;
    let stateDepth = 0;
    let depth = 0;

    const chapterHtmlParts: string[] = [];
    const notesHtmlParts: string[] = [];
    const beforeNotesParts: string[] = [];
    const afterNotesParts: string[] = [];
    let isBeforeChapter = true;

    const match = html.match(/<style>\n\s+.(.+?){[^{]+?display: none;/);
    const hiddenClass = match?.[1]?.trim();
    let stateBeforeHidden: {
      state: ParsingState;
      depth: number;
    } | null = null;

    type EscapeChar = '&' | '<' | '>' | '"' | "'";
    const escapeRegex = /[&<>"']/g;
    const escapeMap: Record<EscapeChar, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    const escapeHtml = (text: string): string =>
      escapeRegex.test(text)
        ? ((escapeRegex.lastIndex = 0),
          text.replace(escapeRegex, char => escapeMap[char as EscapeChar]))
        : text;

    const parser = new Parser({
      onopentag(name, attribs) {
        depth++;
        const classes = attribs['class'] || '';

        if (
          state !== ParsingState.InHidden &&
          hiddenClass &&
          classes.includes(hiddenClass)
        ) {
          stateBeforeHidden = { state: state, depth: stateDepth };
          state = ParsingState.InHidden;
          stateDepth = depth;
          return;
        }

        switch (state) {
          case ParsingState.Idle:
            if (classes.includes('chapter-content')) {
              state = ParsingState.InChapter;
              stateDepth = depth;
              isBeforeChapter = false;
            } else if (classes.includes('author-note-portlet')) {
              state = ParsingState.InNote;
              stateDepth = depth;
            }
            break;
          case ParsingState.InHidden:
            return;
        }

        if (state === ParsingState.InChapter || state === ParsingState.InNote) {
          let tag = `<${name}`;
          for (const attr in attribs) {
            const value = attribs[attr].replace(/"/g, '&quot;');
            tag += ` ${attr}="${value}"`;
          }
          tag += '>';

          if (state === ParsingState.InChapter) {
            chapterHtmlParts.push(tag);
          } else {
            notesHtmlParts.push(tag);
          }
        }
      },
      ontext(text) {
        switch (state) {
          case ParsingState.InChapter:
            chapterHtmlParts.push(escapeHtml(text));
            break;
          case ParsingState.InNote:
            notesHtmlParts.push(escapeHtml(text));
            break;
        }
      },
      onclosetag(name) {
        if (depth === stateDepth) {
          switch (state) {
            case ParsingState.InHidden:
              if (!stateBeforeHidden) {
                state = ParsingState.Idle; // Attempt recovery
                stateDepth = 0;
              } else {
                state = stateBeforeHidden.state;
                stateDepth = stateBeforeHidden.depth;
                stateBeforeHidden = null;
              }
              depth--;
              return;
            case ParsingState.InChapter:
              chapterHtmlParts.push(`</div>`);
              state = ParsingState.Idle;
              stateDepth = 0;
              depth--;
              return;
            case ParsingState.InNote:
              {
                const noteClass = `author-note-${isBeforeChapter ? 'before' : 'after'}`;
                const notesHtml = notesHtmlParts.join('').trim();
                const fullNote = `<div class="${noteClass}">${notesHtml}</div>`;
                if (isBeforeChapter) {
                  beforeNotesParts.push(fullNote);
                } else {
                  afterNotesParts.push(fullNote);
                }
                notesHtmlParts.length = 0;
                state = ParsingState.Idle;
                stateDepth = 0;
                depth--;
              }
              return;
          }
        } else if (
          state === ParsingState.InChapter ||
          state === ParsingState.InNote
        ) {
          if (!parser['isVoidElement'](name)) {
            const closingTag = `</${name}>`;
            if (state === ParsingState.InChapter) {
              chapterHtmlParts.push(closingTag);
            } else {
              notesHtmlParts.push(closingTag);
            }
          }
        }
        depth--;
      },
    });

    parser.write(html);
    parser.end();

    return [
      beforeNotesParts.length > 0 ? beforeNotesParts.join('') : null,
      chapterHtmlParts.length > 0 ? chapterHtmlParts.join('').trim() : null,
      afterNotesParts.length > 0 ? afterNotesParts.join('') : null,
    ]
      .filter(Boolean)
      .join('\n<hr class="notes-separator">\n');
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      page: page.toString(),
      title: searchTerm,
      globalFilters: 'true',
    });
    const searchUrl = `${this.site}fictions/search?${params.toString()}`;
    const body = await this.fetchHtml(searchUrl);

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

type ChapterEntry = {
  id: number;
  volumeId: number;
  title: string;
  date: string;
  order: number;
  url: string;
};

type VolumeEntry = {
  id: number;
  title: string;
  cover: string;
  order: number;
};

enum ParsingState {
  Idle,
  InTitle,
  InAuthor,
  InDescription,
  InTags,
  InTagLink,
  InStatusSpan,
  InScript,
  InNote,
  InChapter,
  InHidden,
  Novel,
}

type AnubisChallenge = {
  rules: { algorithm: string; difficulty: number };
  challenge: { id: string; randomData: string };
};

const BOT_CHECK_ERROR =
  "Royal Road's bot check could not be passed. Open a novel from Royal Road in WebView, wait for it to load, then try again.";

// Difficulty 4 needs about 65,000 hashes: a few seconds on a phone. Each step
// up is 16 times more work, so stop and ask for WebView instead.
const MAX_ANUBIS_DIFFICULTY = 4;

let anubisCheck: Promise<string> | undefined;

async function fetchPageHtml(
  url: string,
  passingChallenge = false,
): Promise<string> {
  const response = await fetchApi(url);
  const cloudflareChallenge =
    response.headers.get('cf-mitigated') === 'challenge';

  if (cloudflareChallenge || !response.ok) {
    throw Object.assign(
      new Error(
        cloudflareChallenge || passingChallenge
          ? BOT_CHECK_ERROR
          : `Royal Road request failed (HTTP ${response.status}). Try again later.`,
      ),
      { response },
    );
  }
  return response.text();
}

function readAnubisChallenge(html: string): AnubisChallenge | undefined {
  const json = readJsonScript(html, 'anubis_challenge');
  return json ? JSON.parse(json) : undefined;
}

function readJsonScript(html: string, id: string): string | undefined {
  const match = html.match(
    new RegExp(
      '<script id="' + id + '" type="application/json">([\\s\\S]*?)</script>',
    ),
  );
  return match?.[1];
}

// Solve the check and send the answer. Anubis then sets its cookie and
// redirects to `url`, so the result is the page that was asked for.
async function passAnubisChallenge(
  html: string,
  { rules, challenge }: AnubisChallenge,
  url: string,
): Promise<string> {
  if (
    (rules.algorithm !== 'fast' && rules.algorithm !== 'slow') ||
    typeof rules.difficulty !== 'number' ||
    rules.difficulty < 0 ||
    rules.difficulty % 1 !== 0 ||
    rules.difficulty > MAX_ANUBIS_DIFFICULTY
  ) {
    throw new Error(BOT_CHECK_ERROR);
  }
  const basePrefix = JSON.parse(
    readJsonScript(html, 'anubis_base_prefix') || '""',
  );
  const start = Date.now();
  const { nonce, hash } = await solveProofOfWork(
    challenge.randomData,
    rules.difficulty,
  );
  const params = new URLSearchParams({
    id: challenge.id,
    response: hash,
    nonce: String(nonce),
    redir: url,
    elapsedTime: String(Date.now() - start),
  });
  const origin = url.match(/^https?:\/\/[^/]+/)?.[0];
  return fetchPageHtml(
    `${origin}${basePrefix}/.within.website/x/cmd/anubis/api/pass-challenge?${params.toString()}`,
    true,
  );
}

// Find the nonce for which sha256(data + nonce), in hex, starts with
// `difficulty` zeros. The app has no SHA-256 for plugins, so it is done here.
async function solveProofOfWork(
  data: string,
  difficulty: number,
): Promise<{ nonce: number; hash: string }> {
  const search = nonceSearch(data, difficulty);
  for (let from = 0; ; from += 4096) {
    const found = search(from, from + 4096);
    if (found) return found;
    // Let the app do other work between batches of hashes.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

// Return a function that tries the nonces from `from` to `to` (exclusive).
// The full 64-byte blocks of `data` are hashed only once; each nonce then
// hashes only the last block or two. The search loop is synchronous, because
// a loop inside an async function is slow after the ES5 build.
function nonceSearch(data: string, difficulty: number) {
  const schedule: number[] = new Array(64);
  const prefixState = SHA256_INIT.slice();
  const fullBlocks = data.length >> 6;
  const words: number[] = new Array(32);
  for (let block = 0; block < fullBlocks; block++) {
    writeAscii(words, data.slice(block * 64, block * 64 + 64), 16);
    sha256Block(prefixState, words, 0, schedule);
  }
  const tail = data.slice(fullBlocks * 64);
  const state: number[] = new Array(8);
  const zeroBits = 32 - 4 * difficulty;

  return (from: number, to: number) => {
    for (let nonce = from; nonce < to; nonce++) {
      const rest = tail + nonce;
      const blocks = rest.length + 9 > 64 ? 2 : 1;
      writeAscii(words, rest, blocks * 16);
      words[rest.length >> 2] |= 0x80 << (24 - (rest.length & 3) * 8);
      words[blocks * 16 - 1] = (fullBlocks * 64 + rest.length) * 8;
      for (let i = 0; i < 8; i++) state[i] = prefixState[i];
      for (let block = 0; block < blocks; block++) {
        sha256Block(state, words, block * 16, schedule);
      }
      if (difficulty === 0 || state[0] >>> zeroBits === 0) {
        return { nonce, hash: toHex(state) };
      }
    }
    return undefined;
  };
}

// Write `text` as big-endian 32-bit words and zero the rest of `count` words.
function writeAscii(words: number[], text: string, count: number) {
  for (let i = 0; i < count; i++) words[i] = 0;
  for (let i = 0; i < text.length; i++) {
    words[i >> 2] |= text.charCodeAt(i) << (24 - (i & 3) * 8);
  }
}

function toHex(state: number[]): string {
  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += ('0000000' + (state[i] >>> 0).toString(16)).slice(-8);
  }
  return hex;
}

// SHA-256 compression of the 16 words at `offset` into `state`.
function sha256Block(
  state: number[],
  words: number[],
  offset: number,
  w: number[],
) {
  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  let f = state[5];
  let g = state[6];
  let h = state[7];
  for (let i = 0; i < 64; i++) {
    if (i < 16) {
      w[i] = words[offset + i] | 0;
    } else {
      const x = w[i - 15];
      const y = w[i - 2];
      w[i] =
        ((((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) +
          w[i - 7] +
          (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) +
          w[i - 16]) |
        0;
    }
    const t1 =
      (h +
        (((e >>> 6) | (e << 26)) ^
          ((e >>> 11) | (e << 21)) ^
          ((e >>> 25) | (e << 7))) +
        ((e & f) ^ (~e & g)) +
        SHA256_K[i] +
        w[i]) |
      0;
    const t2 =
      ((((a >>> 2) | (a << 30)) ^
        ((a >>> 13) | (a << 19)) ^
        ((a >>> 22) | (a << 10))) +
        ((a & b) ^ (a & c) ^ (b & c))) |
      0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  state[0] = (state[0] + a) | 0;
  state[1] = (state[1] + b) | 0;
  state[2] = (state[2] + c) | 0;
  state[3] = (state[3] + d) | 0;
  state[4] = (state[4] + e) | 0;
  state[5] = (state[5] + f) | 0;
  state[6] = (state[6] + g) | 0;
  state[7] = (state[7] + h) | 0;
}

const SHA256_INIT = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
];

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
