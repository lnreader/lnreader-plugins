import { fetchApi, fetchText } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';

interface SeriesChaptersResponse {
  chapters: Chapter[];
}

interface Chapter {
  id: number;
  series_id: number;
  slug: string;
  title: null | string;
  name: string;
  number: number;
  price: number;
  unlocked_at: string | null;
  index_at: string;
  created_at: string;
  group_id: null;
  index: number;
  is_premium: boolean;
  group: null;
}

interface InertiaResponse<TProps> {
  component: string;
  props: TProps;
  url: string;
  version: string;
  clearHistory: boolean;
  encryptHistory: boolean;
}

interface BaseNovel {
  id: number;
  slug: string;
  title: string;
  coverImage: string;
  bookmarks_count: number;
  chapters_count: number;
  genres: string[];
}

interface Cover {
  url: string;
}

interface Tag {
  name: string;
  slug: string;
  description: string;
}

interface Series {
  id: number;
  title: string;
  slug: string;
  description: string;
  alt_title: string;
  type: string;
  state: string;
  story_state: string;
  release_year: string;
  origin_id: number;
  user_id: number;
  global_note: string;
  global_note_position: string;
  default_price: number;
  cover_id: number;
  banner_id: null;
  index_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: null;
  content: string;
  cover: Cover | null;
  genres: Tag[];
  tags: Tag[];
  // maybe lets just fetch this separately entirely since this is only partial
  // chapters: Chapter[];
}

interface SeriesProps {
  seriesList: {
    data: Series[];
  };
}

interface ChapterShowProps {
  chapter: {
    id: number;
    title: string;
    slug: string;
    number: number;
    content: string;
    index_at: string;
    price: number;
    note: string;
    is_premium: boolean;
  };
}

interface SeriesShowProps {
  series: Series;
}

interface WelcomeProps {
  popularNovels: BaseNovel[];
  latestUpdates: {
    data: {
      id: number;
      series_slug: string;
      title: string;
      coverImage: string;
    }[];
  };
}

interface SearchResult {
  data: {
    series: {
      id: number;
      title: string;
      slug: string;
      cover_id: number;
      cover: Cover;
    }[];
  };
}

class StellarRealm implements Plugin.PluginBase {
  id = 'stellar-realm';
  name = 'Stellar Realm';
  icon = '';
  site = 'https://stellarrealm.net';
  version = '1.0.0';
  filters: Filters | undefined = {
    tags: {
      label: 'Tags',
      value: [],
      type: FilterTypes.CheckboxGroup,
      options: TAGS.map(x => ({
        label: x.name,
        value: x.slug,
      })),
    },
    genres: {
      label: 'Genres',
      value: [],
      type: FilterTypes.CheckboxGroup,
      options: GENRES.map(x => ({
        label: x.name,
        value: x.slug,
      })),
    },
  };
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;
  apiRequestInit: Parameters<typeof fetchApi>[1] = {
    headers: {
      'x-inertia': 'true',
      'x-inertia-version': 'a0a90b8455f880d062cb24f0a678accb',
      'x-requested-with': 'XMLHttpRequest',
    },
  };

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  ensureCoverImage(url: string) {
    return isUrlAbsolute(url) ? url : this.site + url;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
    isRetry = false,
  ): Promise<Plugin.NovelItem[]> {
    try {
      const query = new URLSearchParams({
        order: 'desc',
        page: pageNo.toString(),
      });

      if (showLatestNovels) {
        query.set('sort', 'new');
      } else {
        query.delete('order');
        query.set('sort', 'trending');

        if (!!filters && !!filters['tags']) {
          const tagsFilter = filters['tags'];
          if (tagsFilter.value instanceof Array)
            query.set('tags', tagsFilter.value.join(','));
        }

        if (!!filters && !!filters['genres']) {
          const genresFilter = filters['genres'];
          if (genresFilter.value instanceof Array)
            query.set('genres', genresFilter.value.join(','));
        }
      }

      const {
        props: {
          seriesList: { data: series },
        },
      } = (await (
        await fetchApi(
          `${this.site}/series?${query.toString()}`,
          this.apiRequestInit,
        )
      ).json()) as InertiaResponse<SeriesProps>;

      const novels: Plugin.NovelItem[] = series.map(x => ({
        name: x.title,
        path: x.slug,
        cover: !!x.cover ? this.ensureCoverImage(x.cover.url) : defaultCover,
      }));

      return novels;
    } catch (error) {
      if (isRetry) throw error;

      return this.popularNovels(
        pageNo,
        {
          filters,
          showLatestNovels,
        },
        true,
      );
    }
  }

  async parseNovel(
    novelPath: string,
    isRetry = false,
  ): Promise<Plugin.SourceNovel> {
    try {
      const {
        props: { series },
      } = (await (
        await fetchApi(`${this.site}/series/${novelPath}`, this.apiRequestInit)
      ).json()) as InertiaResponse<SeriesShowProps>;
      const novel: Plugin.SourceNovel = {
        path: novelPath,
        name: series.title,
        cover: !!series.cover
          ? this.ensureCoverImage(series.cover.url)
          : defaultCover,
        summary: series.description,
        status: series.story_state,
        genres: [
          ...series.genres.map(x => x.name),
          series.tags.map(x => x.name),
        ].join(','),
      };

      const { chapters } = (await (
        await fetchApi(
          `${this.site}/series/${novelPath}/chapters`,
          this.apiRequestInit,
        )
      ).json()) as SeriesChaptersResponse;
      novel.chapters = chapters
        .map(chapter => ({
          name: chapter.name,
          path: `${novelPath}/${chapter.slug}`,
          chapterNumber: chapter.number,
          releaseTime: chapter.created_at,
        }))
        .sort((a, b) => a.chapterNumber - b.chapterNumber);

      return novel;
    } catch (error) {
      if (isRetry) throw error;

      return this.parseNovel(novelPath, true);
    }
  }

  async parseChapter(chapterPath: string, isRetry = false): Promise<string> {
    try {
      const {
        props: { chapter },
      } = (await (
        await fetchApi(
          `${this.site}/series/${chapterPath}`,
          this.apiRequestInit,
        )
      ).json()) as InertiaResponse<ChapterShowProps>;
      return chapter.content;
    } catch (error) {
      if (isRetry) throw error;

      return this.parseChapter(chapterPath, true);
    }
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
    isRetry = false,
  ): Promise<Plugin.NovelItem[]> {
    // site doesn't have pagination for search
    if (pageNo > 1) return [];

    try {
      const searchResponse = await fetchApi(
        `${this.site}/api/search?query=${searchTerm}`,
      );
      const searchResults: SearchResult = await searchResponse.json();

      const novels: Plugin.NovelItem[] = searchResults.data.series.map(
        serie => ({
          name: serie.title,
          path: serie.slug,
          cover: this.ensureCoverImage(serie.cover.url),
        }),
      );

      return novels;
    } catch (error) {
      if (isRetry) throw error;

      return this.searchNovels(searchTerm, pageNo, true);
    }
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + '/series/' + path;
}

const TAGS = [
  {
    'name': 'Abandoned Children',
    'slug': 'abandoned-children',
  },
  {
    'name': 'Ability Steal',
    'slug': 'ability-steal',
  },
  {
    'name': 'Absent Parents',
    'slug': 'absent-parents',
  },
  {
    'name': 'Abusive Characters',
    'slug': 'abusive-characters',
  },
  {
    'name': 'Academy',
    'slug': 'academy',
  },
  {
    'name': 'Accelerated Growth',
    'slug': 'accelerated-growth',
  },
  {
    'name': 'Acting',
    'slug': 'acting',
  },
  {
    'name': 'Adapted from Manga',
    'slug': 'adapted-from-manga',
  },
  {
    'name': 'Adapted from Manhua',
    'slug': 'adapted-from-manhua',
  },
  {
    'name': 'Adapted to Anime',
    'slug': 'adapted-to-anime',
  },
  {
    'name': 'Adapted to Drama',
    'slug': 'adapted-to-drama',
  },
  {
    'name': 'Adapted to Game',
    'slug': 'adapted-to-game',
  },
  {
    'name': 'Adapted to Manga',
    'slug': 'adapted-to-manga',
  },
  {
    'name': 'Adapted to Manhua',
    'slug': 'adapted-to-manhua',
  },
  {
    'name': 'Adapted to Manhwa',
    'slug': 'adapted-to-manhwa',
  },
  {
    'name': 'Adopted Children',
    'slug': 'adopted-children',
  },
  {
    'name': 'Adopted Protagonist',
    'slug': 'adopted-protagonist',
  },
  {
    'name': 'Adultery',
    'slug': 'adultery',
  },
  {
    'name': 'Adventurers',
    'slug': 'adventurers',
  },
  {
    'name': 'Affair',
    'slug': 'affair',
  },
  {
    'name': 'Age Progression',
    'slug': 'age-progression',
  },
  {
    'name': 'Age Regression',
    'slug': 'age-regression',
  },
  {
    'name': 'Aggressive Characters',
    'slug': 'aggressive-characters',
  },
  {
    'name': 'Alchemy',
    'slug': 'alchemy',
  },
  {
    'name': 'Aliens',
    'slug': 'aliens',
  },
  {
    'name': 'Alternate World',
    'slug': 'alternate-world',
  },
  {
    'name': 'Amnesia',
    'slug': 'amnesia',
  },
  {
    'name': 'Anal',
    'slug': 'anal',
  },
  {
    'name': 'Ancient China',
    'slug': 'ancient-china',
  },
  {
    'name': 'Ancient Times',
    'slug': 'ancient-times',
  },
  {
    'name': 'Angels',
    'slug': 'angels',
  },
  {
    'name': 'Animal Characteristics',
    'slug': 'animal-characteristics',
  },
  {
    'name': 'Animal Rearing',
    'slug': 'animal-rearing',
  },
  {
    'name': 'Anti-Magic',
    'slug': 'anti-magic',
  },
  {
    'name': 'Anti-social Protagonist',
    'slug': 'anti-social-protagonist',
  },
  {
    'name': 'Antihero Protagonist',
    'slug': 'antihero-protagonist',
  },
  {
    'name': 'Antique Shop',
    'slug': 'antique-shop',
  },
  {
    'name': 'Apartment Life',
    'slug': 'apartment-life',
  },
  {
    'name': 'Apathetic Protagonist',
    'slug': 'apathetic-protagonist',
  },
  {
    'name': 'Apocalypse',
    'slug': 'apocalypse',
  },
  {
    'name': 'Appearance Changes',
    'slug': 'appearance-changes',
  },
  {
    'name': 'Appearance Different from Actual Age',
    'slug': 'appearance-different-from-actual-age',
  },
  {
    'name': 'Archery',
    'slug': 'archery',
  },
  {
    'name': 'Aristocracy',
    'slug': 'aristocracy',
  },
  {
    'name': 'Army',
    'slug': 'army',
  },
  {
    'name': 'Army Building',
    'slug': 'army-building',
  },
  {
    'name': 'Arranged Marriage',
    'slug': 'arranged-marriage',
  },
  {
    'name': 'Arrogant Characters',
    'slug': 'arrogant-characters',
  },
  {
    'name': 'Artifact Crafting',
    'slug': 'artifact-crafting',
  },
  {
    'name': 'Artifacts',
    'slug': 'artifacts',
  },
  {
    'name': 'Artificial Intelligence',
    'slug': 'artificial-intelligence',
  },
  {
    'name': 'Artists',
    'slug': 'artists',
  },
  {
    'name': 'Assassins',
    'slug': 'assassins',
  },
  {
    'name': 'Automatons',
    'slug': 'automatons',
  },
  {
    'name': 'Average-looking Protagonist',
    'slug': 'average-looking-protagonist',
  },
  {
    'name': 'Awkward Protagonist',
    'slug': 'awkward-protagonist',
  },
  {
    'name': 'Based on a Movie',
    'slug': 'based-on-a-movie',
  },
  {
    'name': 'Based on a TV Show',
    'slug': 'based-on-a-tv-show',
  },
  {
    'name': 'Based on a Video Game',
    'slug': 'based-on-a-video-game',
  },
  {
    'name': 'Based on a Visual Novel',
    'slug': 'based-on-a-visual-novel',
  },
  {
    'name': 'Based on an Anime',
    'slug': 'based-on-an-anime',
  },
  {
    'name': 'Battle Academy',
    'slug': 'battle-academy',
  },
  {
    'name': 'Battle Competition',
    'slug': 'battle-competition',
  },
  {
    'name': 'BDSM',
    'slug': 'bdsm',
  },
  {
    'name': 'Beast Companions',
    'slug': 'beast-companions',
  },
  {
    'name': 'Beastkin',
    'slug': 'beastkin',
  },
  {
    'name': 'Beasts',
    'slug': 'beasts',
  },
  {
    'name': 'Beautiful Female Lead',
    'slug': 'beautiful-female-lead',
  },
  {
    'name': 'Betrayal',
    'slug': 'betrayal',
  },
  {
    'name': 'Bickering Couple',
    'slug': 'bickering-couple',
  },
  {
    'name': 'Black Belly',
    'slug': 'black-belly',
  },
  {
    'name': 'Blackmail',
    'slug': 'blackmail',
  },
  {
    'name': 'Blacksmith',
    'slug': 'blacksmith',
  },
  {
    'name': 'Blind Protagonist',
    'slug': 'blind-protagonist',
  },
  {
    'name': 'Bloodlines',
    'slug': 'bloodlines',
  },
  {
    'name': 'Body Swap',
    'slug': 'body-swap',
  },
  {
    'name': 'Body Tempering',
    'slug': 'body-tempering',
  },
  {
    'name': 'Body-double',
    'slug': 'body-double',
  },
  {
    'name': 'Bodyguards',
    'slug': 'bodyguards',
  },
  {
    'name': 'Books',
    'slug': 'books',
  },
  {
    'name': 'Boss-Subordinate Relationship',
    'slug': 'boss-subordinate-relationship',
  },
  {
    'name': 'Brainwashing',
    'slug': 'brainwashing',
  },
  {
    'name': 'Breast Fetish',
    'slug': 'breast-fetish',
  },
  {
    'name': 'Broken Engagement',
    'slug': 'broken-engagement',
  },
  {
    'name': 'Brother Complex',
    'slug': 'brother-complex',
  },
  {
    'name': 'Brotherhood',
    'slug': 'brotherhood',
  },
  {
    'name': 'Buddhism',
    'slug': 'buddhism',
  },
  {
    'name': 'Bullying',
    'slug': 'bullying',
  },
  {
    'name': 'Business Management',
    'slug': 'business-management',
  },
  {
    'name': 'Businessmen',
    'slug': 'businessmen',
  },
  {
    'name': 'Calm Protagonist',
    'slug': 'calm-protagonist',
  },
  {
    'name': 'Card Games',
    'slug': 'card-games',
  },
  {
    'name': 'Carefree Protagonist',
    'slug': 'carefree-protagonist',
  },
  {
    'name': 'Caring Protagonist',
    'slug': 'caring-protagonist',
  },
  {
    'name': 'Cautious Protagonist',
    'slug': 'cautious-protagonist',
  },
  {
    'name': 'Celebrities',
    'slug': 'celebrities',
  },
  {
    'name': 'Character Growth',
    'slug': 'character-growth',
  },
  {
    'name': 'Charismatic Protagonist',
    'slug': 'charismatic-protagonist',
  },
  {
    'name': 'Charming Protagonist',
    'slug': 'charming-protagonist',
  },
  {
    'name': 'Chat Rooms',
    'slug': 'chat-rooms',
  },
  {
    'name': 'Cheats',
    'slug': 'cheats',
  },
  {
    'name': 'Chefs',
    'slug': 'chefs',
  },
  {
    'name': 'Child Abuse',
    'slug': 'child-abuse',
  },
  {
    'name': 'Child Protagonist',
    'slug': 'child-protagonist',
  },
  {
    'name': 'Childcare',
    'slug': 'childcare',
  },
  {
    'name': 'Childhood Friends',
    'slug': 'childhood-friends',
  },
  {
    'name': 'Childhood Love',
    'slug': 'childhood-love',
  },
  {
    'name': 'Childhood Promise',
    'slug': 'childhood-promise',
  },
  {
    'name': 'Childish Protagonist',
    'slug': 'childish-protagonist',
  },
  {
    'name': 'Clan Building',
    'slug': 'clan-building',
  },
  {
    'name': 'Classic',
    'slug': 'classic',
  },
  {
    'name': 'Clever Protagonist',
    'slug': 'clever-protagonist',
  },
  {
    'name': 'Clingy Lover',
    'slug': 'clingy-lover',
  },
  {
    'name': 'Clones',
    'slug': 'clones',
  },
  {
    'name': 'Clubs',
    'slug': 'clubs',
  },
  {
    'name': 'Clumsy Love Interests',
    'slug': 'clumsy-love-interests',
  },
  {
    'name': 'Cohabitation',
    'slug': 'cohabitation',
  },
  {
    'name': 'Cold Love Interests',
    'slug': 'cold-love-interests',
  },
  {
    'name': 'Cold Protagonist',
    'slug': 'cold-protagonist',
  },
  {
    'name': 'College/University',
    'slug': 'collegeuniversity',
  },
  {
    'name': 'Coma',
    'slug': 'coma',
  },
  {
    'name': 'Comedic Undertone',
    'slug': 'comedic-undertone',
  },
  {
    'name': 'Coming of Age',
    'slug': 'coming-of-age',
  },
  {
    'name': 'Complex Family Relationships',
    'slug': 'complex-family-relationships',
  },
  {
    'name': 'Conditional Power',
    'slug': 'conditional-power',
  },
  {
    'name': 'Confident Protagonist',
    'slug': 'confident-protagonist',
  },
  {
    'name': 'Confinement',
    'slug': 'confinement',
  },
  {
    'name': 'Contracts',
    'slug': 'contracts',
  },
  {
    'name': 'Cooking',
    'slug': 'cooking',
  },
  {
    'name': 'Corruption',
    'slug': 'corruption',
  },
  {
    'name': 'Cosmic Wars',
    'slug': 'cosmic-wars',
  },
  {
    'name': 'Couple Growth',
    'slug': 'couple-growth',
  },
  {
    'name': 'Court Official',
    'slug': 'court-official',
  },
  {
    'name': 'Cousins',
    'slug': 'cousins',
  },
  {
    'name': 'Crafting',
    'slug': 'crafting',
  },
  {
    'name': 'Crime',
    'slug': 'crime',
  },
  {
    'name': 'Criminals',
    'slug': 'criminals',
  },
  {
    'name': 'Cross-dressing',
    'slug': 'cross-dressing',
  },
  {
    'name': 'Crossover',
    'slug': 'crossover',
  },
  {
    'name': 'Cruel Characters',
    'slug': 'cruel-characters',
  },
  {
    'name': 'Cultivation',
    'slug': 'cultivation',
  },
  {
    'name': 'Cunnilingus',
    'slug': 'cunnilingus',
  },
  {
    'name': 'Cunning Protagonist',
    'slug': 'cunning-protagonist',
  },
  {
    'name': 'Curious Protagonist',
    'slug': 'curious-protagonist',
  },
  {
    'name': 'Curses',
    'slug': 'curses',
  },
  {
    'name': 'Cute Children',
    'slug': 'cute-children',
  },
  {
    'name': 'Cute Protagonist',
    'slug': 'cute-protagonist',
  },
  {
    'name': 'Cute Story',
    'slug': 'cute-story',
  },
  {
    'name': 'Dao Companion',
    'slug': 'dao-companion',
  },
  {
    'name': 'Dao Comprehension',
    'slug': 'dao-comprehension',
  },
  {
    'name': 'Daoism',
    'slug': 'daoism',
  },
  {
    'name': 'Dark',
    'slug': 'dark',
  },
  {
    'name': 'Dead Protagonist',
    'slug': 'dead-protagonist',
  },
  {
    'name': 'Death',
    'slug': 'death',
  },
  {
    'name': 'Death of Loved Ones',
    'slug': 'death-of-loved-ones',
  },
  {
    'name': 'Delusions',
    'slug': 'delusions',
  },
  {
    'name': 'Demi-Humans',
    'slug': 'demi-humans',
  },
  {
    'name': 'Demon Lord',
    'slug': 'demon-lord',
  },
  {
    'name': 'Demonic Cultivation Technique',
    'slug': 'demonic-cultivation-technique',
  },
  {
    'name': 'Demons',
    'slug': 'demons',
  },
  {
    'name': 'Dense Protagonist',
    'slug': 'dense-protagonist',
  },
  {
    'name': 'Depictions of Cruelty',
    'slug': 'depictions-of-cruelty',
  },
  {
    'name': 'Destiny',
    'slug': 'destiny',
  },
  {
    'name': 'Detectives',
    'slug': 'detectives',
  },
  {
    'name': 'Determined Protagonist',
    'slug': 'determined-protagonist',
  },
  {
    'name': 'Devoted Love Interests',
    'slug': 'devoted-love-interests',
  },
  {
    'name': 'Different Social Status',
    'slug': 'different-social-status',
  },
  {
    'name': 'Disabilities',
    'slug': 'disabilities',
  },
  {
    'name': 'Dishonest Protagonist',
    'slug': 'dishonest-protagonist',
  },
  {
    'name': 'Distrustful Protagonist',
    'slug': 'distrustful-protagonist',
  },
  {
    'name': 'Divination',
    'slug': 'divination',
  },
  {
    'name': 'Divine Protection',
    'slug': 'divine-protection',
  },
  {
    'name': 'Divorce',
    'slug': 'divorce',
  },
  {
    'name': 'Domestic Affairs',
    'slug': 'domestic-affairs',
  },
  {
    'name': 'Doting Love Interests',
    'slug': 'doting-love-interests',
  },
  {
    'name': 'Doting Older Siblings',
    'slug': 'doting-older-siblings',
  },
  {
    'name': 'Doting Parents',
    'slug': 'doting-parents',
  },
  {
    'name': 'Dragon Riders',
    'slug': 'dragon-riders',
  },
  {
    'name': 'Dragons',
    'slug': 'dragons',
  },
  {
    'name': 'Dreams',
    'slug': 'dreams',
  },
  {
    'name': 'Dungeon Master',
    'slug': 'dungeon-master',
  },
  {
    'name': 'Dungeons',
    'slug': 'dungeons',
  },
  {
    'name': 'Dwarfs',
    'slug': 'dwarfs',
  },
  {
    'name': 'Dystopia',
    'slug': 'dystopia',
  },
  {
    'name': 'e-Sports',
    'slug': 'e-sports',
  },
  {
    'name': 'Early Romance',
    'slug': 'early-romance',
  },
  {
    'name': 'Earth Invasion',
    'slug': 'earth-invasion',
  },
  {
    'name': 'Easy Going Life',
    'slug': 'easy-going-life',
  },
  {
    'name': 'Economics',
    'slug': 'economics',
  },
  {
    'name': 'Editors',
    'slug': 'editors',
  },
  {
    'name': 'Eidetic Memory',
    'slug': 'eidetic-memory',
  },
  {
    'name': 'Elderly Protagonist',
    'slug': 'elderly-protagonist',
  },
  {
    'name': 'Elemental Magic',
    'slug': 'elemental-magic',
  },
  {
    'name': 'Elves',
    'slug': 'elves',
  },
  {
    'name': 'Emotionally Weak Protagonist',
    'slug': 'emotionally-weak-protagonist',
  },
  {
    'name': 'Empires',
    'slug': 'empires',
  },
  {
    'name': 'Enemies Become Allies',
    'slug': 'enemies-become-allies',
  },
  {
    'name': 'Enemies Become Lovers',
    'slug': 'enemies-become-lovers',
  },
  {
    'name': 'Engagement',
    'slug': 'engagement',
  },
  {
    'name': 'Enlightenment',
    'slug': 'enlightenment',
  },
  {
    'name': 'European Ambience',
    'slug': 'european-ambience',
  },
  {
    'name': 'Evil Gods',
    'slug': 'evil-gods',
  },
  {
    'name': 'Evil Organizations',
    'slug': 'evil-organizations',
  },
  {
    'name': 'Evil Protagonist',
    'slug': 'evil-protagonist',
  },
  {
    'name': 'Evil Religions',
    'slug': 'evil-religions',
  },
  {
    'name': 'Evolution',
    'slug': 'evolution',
  },
  {
    'name': 'Exhibitionism',
    'slug': 'exhibitionism',
  },
  {
    'name': 'Exorcism',
    'slug': 'exorcism',
  },
  {
    'name': 'Eye Powers',
    'slug': 'eye-powers',
  },
  {
    'name': 'Fairies',
    'slug': 'fairies',
  },
  {
    'name': 'Fallen Angels',
    'slug': 'fallen-angels',
  },
  {
    'name': 'Fallen Nobility',
    'slug': 'fallen-nobility',
  },
  {
    'name': 'Familial Love',
    'slug': 'familial-love',
  },
  {
    'name': 'Familiars',
    'slug': 'familiars',
  },
  {
    'name': 'Family',
    'slug': 'family',
  },
  {
    'name': 'Family Business',
    'slug': 'family-business',
  },
  {
    'name': 'Family Conflict',
    'slug': 'family-conflict',
  },
  {
    'name': 'Famous Parents',
    'slug': 'famous-parents',
  },
  {
    'name': 'Famous Protagonist',
    'slug': 'famous-protagonist',
  },
  {
    'name': 'Fanaticism',
    'slug': 'fanaticism',
  },
  {
    'name': 'Fanfiction',
    'slug': 'fanfiction',
  },
  {
    'name': 'Fantasy Creatures',
    'slug': 'fantasy-creatures',
  },
  {
    'name': 'Fantasy World',
    'slug': 'fantasy-world',
  },
  {
    'name': 'Farming',
    'slug': 'farming',
  },
  {
    'name': 'Fast Cultivation',
    'slug': 'fast-cultivation',
  },
  {
    'name': 'Fast Learner',
    'slug': 'fast-learner',
  },
  {
    'name': 'Fat to Fit',
    'slug': 'fat-to-fit',
  },
  {
    'name': 'Fated Lovers',
    'slug': 'fated-lovers',
  },
  {
    'name': 'Fearless Protagonist',
    'slug': 'fearless-protagonist',
  },
  {
    'name': 'Fellatio',
    'slug': 'fellatio',
  },
  {
    'name': 'Female Master',
    'slug': 'female-master',
  },
  {
    'name': 'Female Protagonist',
    'slug': 'female-protagonist',
  },
  {
    'name': 'Female to Male',
    'slug': 'female-to-male',
  },
  {
    'name': 'Firearms',
    'slug': 'firearms',
  },
  {
    'name': 'First Love',
    'slug': 'first-love',
  },
  {
    'name': 'First-time Intercourse',
    'slug': 'first-time-intercourse',
  },
  {
    'name': 'Flashbacks',
    'slug': 'flashbacks',
  },
  {
    'name': 'Fleet Battles',
    'slug': 'fleet-battles',
  },
  {
    'name': 'Folklore',
    'slug': 'folklore',
  },
  {
    'name': 'Forced into a Relationship',
    'slug': 'forced-into-a-relationship',
  },
  {
    'name': 'Forced Living Arrangements',
    'slug': 'forced-living-arrangements',
  },
  {
    'name': 'Forced Marriage',
    'slug': 'forced-marriage',
  },
  {
    'name': 'Forgetful Protagonist',
    'slug': 'forgetful-protagonist',
  },
  {
    'name': 'Former Hero',
    'slug': 'former-hero',
  },
  {
    'name': 'Found Family',
    'slug': 'found-family',
  },
  {
    'name': 'Friends Become Enemies',
    'slug': 'friends-become-enemies',
  },
  {
    'name': 'Friendship',
    'slug': 'friendship',
  },
  {
    'name': 'Fujoshi',
    'slug': 'fujoshi',
  },
  {
    'name': 'Futuristic Setting',
    'slug': 'futuristic-setting',
  },
  {
    'name': 'Game Elements',
    'slug': 'game-elements',
  },
  {
    'name': 'Game Ranking System',
    'slug': 'game-ranking-system',
  },
  {
    'name': 'Gamers',
    'slug': 'gamers',
  },
  {
    'name': 'Gangs',
    'slug': 'gangs',
  },
  {
    'name': 'Gate to Another World',
    'slug': 'gate-to-another-world',
  },
  {
    'name': 'Generals',
    'slug': 'generals',
  },
  {
    'name': 'Genetic Modifications',
    'slug': 'genetic-modifications',
  },
  {
    'name': 'Genius Protagonist',
    'slug': 'genius-protagonist',
  },
  {
    'name': 'Ghosts',
    'slug': 'ghosts',
  },
  {
    'name': 'Glasses-wearing Love Interests',
    'slug': 'glasses-wearing-love-interests',
  },
  {
    'name': 'Glasses-wearing Protagonist',
    'slug': 'glasses-wearing-protagonist',
  },
  {
    'name': 'Goblins',
    'slug': 'goblins',
  },
  {
    'name': 'God Protagonist',
    'slug': 'god-protagonist',
  },
  {
    'name': 'God-human Relationship',
    'slug': 'god-human-relationship',
  },
  {
    'name': 'Goddesses',
    'slug': 'goddesses',
  },
  {
    'name': 'Godly Powers',
    'slug': 'godly-powers',
  },
  {
    'name': 'Gods',
    'slug': 'gods',
  },
  {
    'name': 'Golems',
    'slug': 'golems',
  },
  {
    'name': 'Gore',
    'slug': 'gore',
  },
  {
    'name': 'Guilds',
    'slug': 'guilds',
  },
  {
    'name': 'Gunfighters',
    'slug': 'gunfighters',
  },
  {
    'name': 'Hackers',
    'slug': 'hackers',
  },
  {
    'name': 'Half-human Protagonist',
    'slug': 'half-human-protagonist',
  },
  {
    'name': 'Handjob',
    'slug': 'handjob',
  },
  {
    'name': 'Handsome Male Lead',
    'slug': 'handsome-male-lead',
  },
  {
    'name': 'Hard-Working Protagonist',
    'slug': 'hard-working-protagonist',
  },
  {
    'name': 'Harem-seeking Protagonist',
    'slug': 'harem-seeking-protagonist',
  },
  {
    'name': 'Harsh Training',
    'slug': 'harsh-training',
  },
  {
    'name': 'Hated Protagonist',
    'slug': 'hated-protagonist',
  },
  {
    'name': 'Healers',
    'slug': 'healers',
  },
  {
    'name': 'Heartwarming',
    'slug': 'heartwarming',
  },
  {
    'name': 'Heaven',
    'slug': 'heaven',
  },
  {
    'name': 'Heavenly Tribulation',
    'slug': 'heavenly-tribulation',
  },
  {
    'name': 'Hell',
    'slug': 'hell',
  },
  {
    'name': 'Helpful Protagonist',
    'slug': 'helpful-protagonist',
  },
  {
    'name': 'Herbalist',
    'slug': 'herbalist',
  },
  {
    'name': 'Heroes',
    'slug': 'heroes',
  },
  {
    'name': 'Hidden Abilities',
    'slug': 'hidden-abilities',
  },
  {
    'name': 'Hiding True Abilities',
    'slug': 'hiding-true-abilities',
  },
  {
    'name': 'Hiding True Identity',
    'slug': 'hiding-true-identity',
  },
  {
    'name': 'Honest Protagonist',
    'slug': 'honest-protagonist',
  },
  {
    'name': 'Hot-blooded Protagonist',
    'slug': 'hot-blooded-protagonist',
  },
  {
    'name': 'Human-Nonhuman Relationship',
    'slug': 'human-nonhuman-relationship',
  },
  {
    'name': 'Humanoid Protagonist',
    'slug': 'humanoid-protagonist',
  },
  {
    'name': 'Hunters',
    'slug': 'hunters',
  },
  {
    'name': 'Hypnotism',
    'slug': 'hypnotism',
  },
  {
    'name': 'Immortals',
    'slug': 'immortals',
  },
  {
    'name': 'Imperial Harem',
    'slug': 'imperial-harem',
  },
  {
    'name': 'Incest',
    'slug': 'incest',
  },
  {
    'name': 'Indecisive Protagonist',
    'slug': 'indecisive-protagonist',
  },
  {
    'name': 'Industrialization',
    'slug': 'industrialization',
  },
  {
    'name': 'Inheritance',
    'slug': 'inheritance',
  },
  {
    'name': 'Insects',
    'slug': 'insects',
  },
  {
    'name': 'Interdimensional Travel',
    'slug': 'interdimensional-travel',
  },
  {
    'name': 'Jack of All Trades',
    'slug': 'jack-of-all-trades',
  },
  {
    'name': 'Jealousy',
    'slug': 'jealousy',
  },
  {
    'name': 'Kind Love Interests',
    'slug': 'kind-love-interests',
  },
  {
    'name': 'Kingdom Building',
    'slug': 'kingdom-building',
  },
  {
    'name': 'Kingdoms',
    'slug': 'kingdoms',
  },
  {
    'name': 'Knights',
    'slug': 'knights',
  },
  {
    'name': 'Lack of Common Sense',
    'slug': 'lack-of-common-sense',
  },
  {
    'name': 'Late Romance',
    'slug': 'late-romance',
  },
  {
    'name': 'Lazy Protagonist',
    'slug': 'lazy-protagonist',
  },
  {
    'name': 'Leadership',
    'slug': 'leadership',
  },
  {
    'name': 'Legends',
    'slug': 'legends',
  },
  {
    'name': 'Level System',
    'slug': 'level-system',
  },
  {
    'name': 'Limited Lifespan',
    'slug': 'limited-lifespan',
  },
  {
    'name': 'Livestreaming',
    'slug': 'livestreaming',
  },
  {
    'name': 'Living Alone',
    'slug': 'living-alone',
  },
  {
    'name': 'Loneliness',
    'slug': 'loneliness',
  },
  {
    'name': 'Loner Protagonist',
    'slug': 'loner-protagonist',
  },
  {
    'name': 'Lottery',
    'slug': 'lottery',
  },
  {
    'name': 'Love at First Sight',
    'slug': 'love-at-first-sight',
  },
  {
    'name': 'Love Interest Falls in Love First',
    'slug': 'love-interest-falls-in-love-first',
  },
  {
    'name': 'Love Rivals',
    'slug': 'love-rivals',
  },
  {
    'name': 'Love Triangles',
    'slug': 'love-triangles',
  },
  {
    'name': 'Lovers Reunited',
    'slug': 'lovers-reunited',
  },
  {
    'name': 'Low-key Protagonist',
    'slug': 'low-key-protagonist',
  },
  {
    'name': 'Loyal Subordinates',
    'slug': 'loyal-subordinates',
  },
  {
    'name': 'Lucky Protagonist',
    'slug': 'lucky-protagonist',
  },
  {
    'name': 'Magic',
    'slug': 'magic',
  },
  {
    'name': 'Magic Beasts',
    'slug': 'magic-beasts',
  },
  {
    'name': 'Magic Formations',
    'slug': 'magic-formations',
  },
  {
    'name': 'Magical Girls',
    'slug': 'magical-girls',
  },
  {
    'name': 'Magical Space',
    'slug': 'magical-space',
  },
  {
    'name': 'Magical Technology',
    'slug': 'magical-technology',
  },
  {
    'name': 'Maids',
    'slug': 'maids',
  },
  {
    'name': 'Male Protagonist',
    'slug': 'male-protagonist',
  },
  {
    'name': 'Male to Female',
    'slug': 'male-to-female',
  },
  {
    'name': 'Male Yandere',
    'slug': 'male-yandere',
  },
  {
    'name': 'Management',
    'slug': 'management',
  },
  {
    'name': 'Manipulative Characters',
    'slug': 'manipulative-characters',
  },
  {
    'name': 'Manly Gay Couple',
    'slug': 'manly-gay-couple',
  },
  {
    'name': 'Marriage',
    'slug': 'marriage',
  },
  {
    'name': 'Marriage of Convenience',
    'slug': 'marriage-of-convenience',
  },
  {
    'name': 'Martial Spirits',
    'slug': 'martial-spirits',
  },
  {
    'name': 'Masochistic Characters',
    'slug': 'masochistic-characters',
  },
  {
    'name': 'Master-Disciple Relationship',
    'slug': 'master-disciple-relationship',
  },
  {
    'name': 'Master-Servant Relationship',
    'slug': 'master-servant-relationship',
  },
  {
    'name': 'Masturbation',
    'slug': 'masturbation',
  },
  {
    'name': 'Matriarchy',
    'slug': 'matriarchy',
  },
  {
    'name': 'Mature Protagonist',
    'slug': 'mature-protagonist',
  },
  {
    'name': 'Medical Knowledge',
    'slug': 'medical-knowledge',
  },
  {
    'name': 'Medieval',
    'slug': 'medieval',
  },
  {
    'name': 'Mercenaries',
    'slug': 'mercenaries',
  },
  {
    'name': 'Merchants',
    'slug': 'merchants',
  },
  {
    'name': 'Military',
    'slug': 'military',
  },
  {
    'name': 'Mind Break',
    'slug': 'mind-break',
  },
  {
    'name': 'Mind Control',
    'slug': 'mind-control',
  },
  {
    'name': 'Mistaken Identity',
    'slug': 'mistaken-identity',
  },
  {
    'name': 'Misunderstandings',
    'slug': 'misunderstandings',
  },
  {
    'name': 'MMORPG',
    'slug': 'mmorpg',
  },
  {
    'name': 'Mob Protagonist',
    'slug': 'mob-protagonist',
  },
  {
    'name': 'Modern Day',
    'slug': 'modern-day',
  },
  {
    'name': 'Modern Knowledge',
    'slug': 'modern-knowledge',
  },
  {
    'name': 'Money Grubber',
    'slug': 'money-grubber',
  },
  {
    'name': 'Monster Tamer',
    'slug': 'monster-tamer',
  },
  {
    'name': 'Monsters',
    'slug': 'monsters',
  },
  {
    'name': 'Movies',
    'slug': 'movies',
  },
  {
    'name': 'Mpreg',
    'slug': 'mpreg',
  },
  {
    'name': 'Multiple Identities',
    'slug': 'multiple-identities',
  },
  {
    'name': 'Multiple Personalities',
    'slug': 'multiple-personalities',
  },
  {
    'name': 'Multiple POV',
    'slug': 'multiple-pov',
  },
  {
    'name': 'Multiple Protagonists',
    'slug': 'multiple-protagonists',
  },
  {
    'name': 'Multiple Realms',
    'slug': 'multiple-realms',
  },
  {
    'name': 'Multiple Reincarnated Individuals',
    'slug': 'multiple-reincarnated-individuals',
  },
  {
    'name': 'Multiple Timelines',
    'slug': 'multiple-timelines',
  },
  {
    'name': 'Multiple Transported Individuals',
    'slug': 'multiple-transported-individuals',
  },
  {
    'name': 'Murders',
    'slug': 'murders',
  },
  {
    'name': 'Music',
    'slug': 'music',
  },
  {
    'name': 'Mutated Creatures',
    'slug': 'mutated-creatures',
  },
  {
    'name': 'Mute Character',
    'slug': 'mute-character',
  },
  {
    'name': 'Mysterious Family Background',
    'slug': 'mysterious-family-background',
  },
  {
    'name': 'Mysterious Illness',
    'slug': 'mysterious-illness',
  },
  {
    'name': 'Mysterious Past',
    'slug': 'mysterious-past',
  },
  {
    'name': 'Mystery Solving',
    'slug': 'mystery-solving',
  },
  {
    'name': 'Mythical Beasts',
    'slug': 'mythical-beasts',
  },
  {
    'name': 'Mythology',
    'slug': 'mythology',
  },
  {
    'name': 'Naive Protagonist',
    'slug': 'naive-protagonist',
  },
  {
    'name': 'Narcissistic Protagonist',
    'slug': 'narcissistic-protagonist',
  },
  {
    'name': 'Nationalism',
    'slug': 'nationalism',
  },
  {
    'name': 'Near-Death Experience',
    'slug': 'near-death-experience',
  },
  {
    'name': 'Necromancer',
    'slug': 'necromancer',
  },
  {
    'name': 'Nightmares',
    'slug': 'nightmares',
  },
  {
    'name': 'Ninjas',
    'slug': 'ninjas',
  },
  {
    'name': 'Nobles',
    'slug': 'nobles',
  },
  {
    'name': 'Non-humanoid Protagonist',
    'slug': 'non-humanoid-protagonist',
  },
  {
    'name': 'Nudity',
    'slug': 'nudity',
  },
  {
    'name': 'Nurses',
    'slug': 'nurses',
  },
  {
    'name': 'Obsessive Love',
    'slug': 'obsessive-love',
  },
  {
    'name': 'Office Romance',
    'slug': 'office-romance',
  },
  {
    'name': 'Older Love Interests',
    'slug': 'older-love-interests',
  },
  {
    'name': 'Omegaverse',
    'slug': 'omegaverse',
  },
  {
    'name': 'Online Romance',
    'slug': 'online-romance',
  },
  {
    'name': 'Orcs',
    'slug': 'orcs',
  },
  {
    'name': 'Organized Crime',
    'slug': 'organized-crime',
  },
  {
    'name': 'Orgy',
    'slug': 'orgy',
  },
  {
    'name': 'Orphans',
    'slug': 'orphans',
  },
  {
    'name': 'Otome Game',
    'slug': 'otome-game',
  },
  {
    'name': 'Outdoor Intercourse',
    'slug': 'outdoor-intercourse',
  },
  {
    'name': 'Outer Space',
    'slug': 'outer-space',
  },
  {
    'name': 'Overpowered Protagonist',
    'slug': 'overpowered-protagonist',
  },
  {
    'name': 'Overprotective Siblings',
    'slug': 'overprotective-siblings',
  },
  {
    'name': 'Pacifist Protagonist',
    'slug': 'pacifist-protagonist',
  },
  {
    'name': 'Paizuri',
    'slug': 'paizuri',
  },
  {
    'name': 'Parallel Worlds',
    'slug': 'parallel-worlds',
  },
  {
    'name': 'Parent Complex',
    'slug': 'parent-complex',
  },
  {
    'name': 'Parody',
    'slug': 'parody',
  },
  {
    'name': 'Part-Time Job',
    'slug': 'part-time-job',
  },
  {
    'name': 'Past Plays a Big Role',
    'slug': 'past-plays-a-big-role',
  },
  {
    'name': 'Past Trauma',
    'slug': 'past-trauma',
  },
  {
    'name': 'Persistent Love Interests',
    'slug': 'persistent-love-interests',
  },
  {
    'name': 'Personality Changes',
    'slug': 'personality-changes',
  },
  {
    'name': 'Perverted Protagonist',
    'slug': 'perverted-protagonist',
  },
  {
    'name': 'Pets',
    'slug': 'pets',
  },
  {
    'name': 'Pharmacist',
    'slug': 'pharmacist',
  },
  {
    'name': 'Phoenixes',
    'slug': 'phoenixes',
  },
  {
    'name': 'Pill Based Cultivation',
    'slug': 'pill-based-cultivation',
  },
  {
    'name': 'Pill Concocting',
    'slug': 'pill-concocting',
  },
  {
    'name': 'Playboys',
    'slug': 'playboys',
  },
  {
    'name': 'Playful Protagonist',
    'slug': 'playful-protagonist',
  },
  {
    'name': 'Poetry',
    'slug': 'poetry',
  },
  {
    'name': 'Poisons',
    'slug': 'poisons',
  },
  {
    'name': 'Police',
    'slug': 'police',
  },
  {
    'name': 'Polite Protagonist',
    'slug': 'polite-protagonist',
  },
  {
    'name': 'Politics',
    'slug': 'politics',
  },
  {
    'name': 'Polyandry',
    'slug': 'polyandry',
  },
  {
    'name': 'Polygamy',
    'slug': 'polygamy',
  },
  {
    'name': 'Poor Protagonist',
    'slug': 'poor-protagonist',
  },
  {
    'name': 'Poor to Rich',
    'slug': 'poor-to-rich',
  },
  {
    'name': 'Popular Love Interests',
    'slug': 'popular-love-interests',
  },
  {
    'name': 'Possession',
    'slug': 'possession',
  },
  {
    'name': 'Possessive Characters',
    'slug': 'possessive-characters',
  },
  {
    'name': 'Post-apocalyptic',
    'slug': 'post-apocalyptic',
  },
  {
    'name': 'Power Couple',
    'slug': 'power-couple',
  },
  {
    'name': 'Power Struggle',
    'slug': 'power-struggle',
  },
  {
    'name': 'Pragmatic Protagonist',
    'slug': 'pragmatic-protagonist',
  },
  {
    'name': 'Precognition',
    'slug': 'precognition',
  },
  {
    'name': 'Pregnancy',
    'slug': 'pregnancy',
  },
  {
    'name': 'Pretend Lovers',
    'slug': 'pretend-lovers',
  },
  {
    'name': 'Previous Life Talent',
    'slug': 'previous-life-talent',
  },
  {
    'name': 'Priestesses',
    'slug': 'priestesses',
  },
  {
    'name': 'Priests',
    'slug': 'priests',
  },
  {
    'name': 'Prison',
    'slug': 'prison',
  },
  {
    'name': 'Proactive Protagonist',
    'slug': 'proactive-protagonist',
  },
  {
    'name': 'Programmer',
    'slug': 'programmer',
  },
  {
    'name': 'Prophecies',
    'slug': 'prophecies',
  },
  {
    'name': 'Protagonist Falls in Love First',
    'slug': 'protagonist-falls-in-love-first',
  },
  {
    'name': 'Protagonist Strong from the Start',
    'slug': 'protagonist-strong-from-the-start',
  },
  {
    'name': 'Psychic Powers',
    'slug': 'psychic-powers',
  },
  {
    'name': 'Psychopaths',
    'slug': 'psychopaths',
  },
  {
    'name': 'Quiet Characters',
    'slug': 'quiet-characters',
  },
  {
    'name': 'Quirky Characters',
    'slug': 'quirky-characters',
  },
  {
    'name': 'R-15',
    'slug': 'r-15',
  },
  {
    'name': 'R-18',
    'slug': 'r-18',
  },
  {
    'name': 'Rape',
    'slug': 'rape',
  },
  {
    'name': 'Rape Victim Becomes Lover',
    'slug': 'rape-victim-becomes-lover',
  },
  {
    'name': 'Rebellion',
    'slug': 'rebellion',
  },
  {
    'name': 'Reincarnated as a Monster',
    'slug': 'reincarnated-as-a-monster',
  },
  {
    'name': 'Reincarnated in a Game World',
    'slug': 'reincarnated-in-a-game-world',
  },
  {
    'name': 'Reincarnated in Another World',
    'slug': 'reincarnated-in-another-world',
  },
  {
    'name': 'Reincarnation',
    'slug': 'reincarnation',
  },
  {
    'name': 'Religions',
    'slug': 'religions',
  },
  {
    'name': 'Reluctant Protagonist',
    'slug': 'reluctant-protagonist',
  },
  {
    'name': 'Restaurant',
    'slug': 'restaurant',
  },
  {
    'name': 'Returning from Another World',
    'slug': 'returning-from-another-world',
  },
  {
    'name': 'Revenge',
    'slug': 'revenge',
  },
  {
    'name': 'Reverse Harem',
    'slug': 'reverse-harem',
  },
  {
    'name': 'Reverse Rape',
    'slug': 'reverse-rape',
  },
  {
    'name': 'Righteous Protagonist',
    'slug': 'righteous-protagonist',
  },
  {
    'name': 'Rivalry',
    'slug': 'rivalry',
  },
  {
    'name': 'Romantic Subplot',
    'slug': 'romantic-subplot',
  },
  {
    'name': 'Roommates',
    'slug': 'roommates',
  },
  {
    'name': 'Royalty',
    'slug': 'royalty',
  },
  {
    'name': 'Ruthless Protagonist',
    'slug': 'ruthless-protagonist',
  },
  {
    'name': 'Sadistic Characters',
    'slug': 'sadistic-characters',
  },
  {
    'name': 'Saints',
    'slug': 'saints',
  },
  {
    'name': 'Saving the World',
    'slug': 'saving-the-world',
  },
  {
    'name': 'Schemes And Conspiracies',
    'slug': 'schemes-and-conspiracies',
  },
  {
    'name': 'Scientists',
    'slug': 'scientists',
  },
  {
    'name': 'Sealed Power',
    'slug': 'sealed-power',
  },
  {
    'name': 'Second Chance',
    'slug': 'second-chance',
  },
  {
    'name': 'Secret Crush',
    'slug': 'secret-crush',
  },
  {
    'name': 'Secret Identity',
    'slug': 'secret-identity',
  },
  {
    'name': 'Secret Organizations',
    'slug': 'secret-organizations',
  },
  {
    'name': 'Secret Relationship',
    'slug': 'secret-relationship',
  },
  {
    'name': 'Secretive Protagonist',
    'slug': 'secretive-protagonist',
  },
  {
    'name': 'Secrets',
    'slug': 'secrets',
  },
  {
    'name': 'Sect Development',
    'slug': 'sect-development',
  },
  {
    'name': 'Seduction',
    'slug': 'seduction',
  },
  {
    'name': "Seeing Things Other Humans Can't",
    'slug': 'seeing-things-other-humans-cant',
  },
  {
    'name': 'Selfish Protagonist',
    'slug': 'selfish-protagonist',
  },
  {
    'name': 'Selfless Protagonist',
    'slug': 'selfless-protagonist',
  },
  {
    'name': 'Seme Protagonist',
    'slug': 'seme-protagonist',
  },
  {
    'name': 'Sentient Objects',
    'slug': 'sentient-objects',
  },
  {
    'name': 'Sentimental Protagonist',
    'slug': 'sentimental-protagonist',
  },
  {
    'name': 'Servants',
    'slug': 'servants',
  },
  {
    'name': 'Seven Deadly Sins',
    'slug': 'seven-deadly-sins',
  },
  {
    'name': 'Seven Virtues',
    'slug': 'seven-virtues',
  },
  {
    'name': 'Sex Friends',
    'slug': 'sex-friends',
  },
  {
    'name': 'Sex Slaves',
    'slug': 'sex-slaves',
  },
  {
    'name': 'Sexual Abuse',
    'slug': 'sexual-abuse',
  },
  {
    'name': 'Sexual Cultivation Technique',
    'slug': 'sexual-cultivation-technique',
  },
  {
    'name': 'Shameless Protagonist',
    'slug': 'shameless-protagonist',
  },
  {
    'name': 'Shapeshifters',
    'slug': 'shapeshifters',
  },
  {
    'name': 'Sharing A Body',
    'slug': 'sharing-a-body',
  },
  {
    'name': 'Sharp-tongued Characters',
    'slug': 'sharp-tongued-characters',
  },
  {
    'name': 'Short Story',
    'slug': 'short-story',
  },
  {
    'name': 'Shoujo-Ai Subplot',
    'slug': 'shoujo-ai-subplot',
  },
  {
    'name': 'Showbiz',
    'slug': 'showbiz',
  },
  {
    'name': 'Shy Characters',
    'slug': 'shy-characters',
  },
  {
    'name': 'Sibling Rivalry',
    'slug': 'sibling-rivalry',
  },
  {
    'name': "Sibling's Care",
    'slug': 'siblings-care',
  },
  {
    'name': 'Siblings',
    'slug': 'siblings',
  },
  {
    'name': 'Siblings Not Related by Blood',
    'slug': 'siblings-not-related-by-blood',
  },
  {
    'name': 'Sickly Characters',
    'slug': 'sickly-characters',
  },
  {
    'name': 'Singers',
    'slug': 'singers',
  },
  {
    'name': 'Single Parent',
    'slug': 'single-parent',
  },
  {
    'name': 'Sister Complex',
    'slug': 'sister-complex',
  },
  {
    'name': 'Skill Assimilation',
    'slug': 'skill-assimilation',
  },
  {
    'name': 'Skill Books',
    'slug': 'skill-books',
  },
  {
    'name': 'Skill Creation',
    'slug': 'skill-creation',
  },
  {
    'name': 'Slave Harem',
    'slug': 'slave-harem',
  },
  {
    'name': 'Slave Protagonist',
    'slug': 'slave-protagonist',
  },
  {
    'name': 'Sleeping',
    'slug': 'sleeping',
  },
  {
    'name': 'Slow Growth at Start',
    'slug': 'slow-growth-at-start',
  },
  {
    'name': 'Slow Romance',
    'slug': 'slow-romance',
  },
  {
    'name': 'Smart Couple',
    'slug': 'smart-couple',
  },
  {
    'name': 'Soldiers',
    'slug': 'soldiers',
  },
  {
    'name': 'Soul Power',
    'slug': 'soul-power',
  },
  {
    'name': 'Souls',
    'slug': 'souls',
  },
  {
    'name': 'Spatial Manipulation',
    'slug': 'spatial-manipulation',
  },
  {
    'name': 'Spear Wielder',
    'slug': 'spear-wielder',
  },
  {
    'name': 'Special Abilities',
    'slug': 'special-abilities',
  },
  {
    'name': 'Spies',
    'slug': 'spies',
  },
  {
    'name': 'Spirit Advisor',
    'slug': 'spirit-advisor',
  },
  {
    'name': 'Spirit Users',
    'slug': 'spirit-users',
  },
  {
    'name': 'Spirits',
    'slug': 'spirits',
  },
  {
    'name': 'Stockholm Syndrome',
    'slug': 'stockholm-syndrome',
  },
  {
    'name': 'Stoic Characters',
    'slug': 'stoic-characters',
  },
  {
    'name': 'Store Owner',
    'slug': 'store-owner',
  },
  {
    'name': 'Straight Seme',
    'slug': 'straight-seme',
  },
  {
    'name': 'Strategic Battles',
    'slug': 'strategic-battles',
  },
  {
    'name': 'Strategist',
    'slug': 'strategist',
  },
  {
    'name': 'Strength-based Social Hierarchy',
    'slug': 'strength-based-social-hierarchy',
  },
  {
    'name': 'Strong Love Interests',
    'slug': 'strong-love-interests',
  },
  {
    'name': 'Strong to Stronger',
    'slug': 'strong-to-stronger',
  },
  {
    'name': 'Stubborn Protagonist',
    'slug': 'stubborn-protagonist',
  },
  {
    'name': 'Student Council',
    'slug': 'student-council',
  },
  {
    'name': 'Student-Teacher Relationship',
    'slug': 'student-teacher-relationship',
  },
  {
    'name': 'Succubus',
    'slug': 'succubus',
  },
  {
    'name': 'Sudden Strength Gain',
    'slug': 'sudden-strength-gain',
  },
  {
    'name': 'Sudden Wealth',
    'slug': 'sudden-wealth',
  },
  {
    'name': 'Suicides',
    'slug': 'suicides',
  },
  {
    'name': 'Summoned Hero',
    'slug': 'summoned-hero',
  },
  {
    'name': 'Summoning Magic',
    'slug': 'summoning-magic',
  },
  {
    'name': 'Survival',
    'slug': 'survival',
  },
  {
    'name': 'Survival Game',
    'slug': 'survival-game',
  },
  {
    'name': 'Sword And Magic',
    'slug': 'sword-and-magic',
  },
  {
    'name': 'Sword Wielder',
    'slug': 'sword-wielder',
  },
  {
    'name': 'System Administrator',
    'slug': 'system-administrator',
  },
  {
    'name': 'Teachers',
    'slug': 'teachers',
  },
  {
    'name': 'Teamwork',
    'slug': 'teamwork',
  },
  {
    'name': 'Technological Gap',
    'slug': 'technological-gap',
  },
  {
    'name': 'Tentacles',
    'slug': 'tentacles',
  },
  {
    'name': 'Threesome',
    'slug': 'threesome',
  },
  {
    'name': 'Thriller',
    'slug': 'thriller',
  },
  {
    'name': 'Time Loop',
    'slug': 'time-loop',
  },
  {
    'name': 'Time Manipulation',
    'slug': 'time-manipulation',
  },
  {
    'name': 'Time Paradox',
    'slug': 'time-paradox',
  },
  {
    'name': 'Time Skip',
    'slug': 'time-skip',
  },
  {
    'name': 'Time Travel',
    'slug': 'time-travel',
  },
  {
    'name': 'Timid Protagonist',
    'slug': 'timid-protagonist',
  },
  {
    'name': 'Tomboyish Female Lead',
    'slug': 'tomboyish-female-lead',
  },
  {
    'name': 'Torture',
    'slug': 'torture',
  },
  {
    'name': 'Toys',
    'slug': 'toys',
  },
  {
    'name': 'Tragic Past',
    'slug': 'tragic-past',
  },
  {
    'name': 'Transformation Ability',
    'slug': 'transformation-ability',
  },
  {
    'name': 'Transmigration',
    'slug': 'transmigration',
  },
  {
    'name': 'Transplanted Memories',
    'slug': 'transplanted-memories',
  },
  {
    'name': 'Transported into a Game World',
    'slug': 'transported-into-a-game-world',
  },
  {
    'name': 'Transported to Another World',
    'slug': 'transported-to-another-world',
  },
  {
    'name': 'Tsundere',
    'slug': 'tsundere',
  },
  {
    'name': 'Twins',
    'slug': 'twins',
  },
  {
    'name': 'Twisted Personality',
    'slug': 'twisted-personality',
  },
  {
    'name': 'Unconditional Love',
    'slug': 'unconditional-love',
  },
  {
    'name': 'Underestimated Protagonist',
    'slug': 'underestimated-protagonist',
  },
  {
    'name': 'Unique Cultivation Technique',
    'slug': 'unique-cultivation-technique',
  },
  {
    'name': 'Unique Weapon User',
    'slug': 'unique-weapon-user',
  },
  {
    'name': 'Unique Weapons',
    'slug': 'unique-weapons',
  },
  {
    'name': 'Unlimited Flow',
    'slug': 'unlimited-flow',
  },
  {
    'name': 'Unrequited Love',
    'slug': 'unrequited-love',
  },
  {
    'name': 'Valkyries',
    'slug': 'valkyries',
  },
  {
    'name': 'Vampires',
    'slug': 'vampires',
  },
  {
    'name': 'Villainess Noble Girls',
    'slug': 'villainess-noble-girls',
  },
  {
    'name': 'Virtual Reality',
    'slug': 'virtual-reality',
  },
  {
    'name': 'Voice Actors',
    'slug': 'voice-actors',
  },
  {
    'name': 'Wars',
    'slug': 'wars',
  },
  {
    'name': 'Weak Protagonist',
    'slug': 'weak-protagonist',
  },
  {
    'name': 'Weak to Strong',
    'slug': 'weak-to-strong',
  },
  {
    'name': 'Wealthy Characters',
    'slug': 'wealthy-characters',
  },
  {
    'name': 'Werebeasts',
    'slug': 'werebeasts',
  },
  {
    'name': 'Witches',
    'slug': 'witches',
  },
  {
    'name': 'Wizards',
    'slug': 'wizards',
  },
  {
    'name': 'World Hopping',
    'slug': 'world-hopping',
  },
  {
    'name': 'World Travel',
    'slug': 'world-travel',
  },
  {
    'name': 'World Tree',
    'slug': 'world-tree',
  },
  {
    'name': 'Writers',
    'slug': 'writers',
  },
  {
    'name': 'Yandere',
    'slug': 'yandere',
  },
  {
    'name': 'Younger Brothers',
    'slug': 'younger-brothers',
  },
  {
    'name': 'Younger Love Interests',
    'slug': 'younger-love-interests',
  },
  {
    'name': 'Younger Sisters',
    'slug': 'younger-sisters',
  },
  {
    'name': 'Yuri',
    'slug': 'yuri',
  },
  {
    'name': 'Zombies',
    'slug': 'zombies',
  },
];

const GENRES = [
  {
    'name': 'Action',
    'slug': 'action',
  },
  {
    'name': 'Adult',
    'slug': 'adult',
  },
  {
    'name': 'Adventure',
    'slug': 'adventure',
  },
  {
    'name': 'Comedy',
    'slug': 'comedy',
  },
  {
    'name': 'Drama',
    'slug': 'drama',
  },
  {
    'name': 'Ecchi',
    'slug': 'ecchi',
  },
  {
    'name': 'Fantasy',
    'slug': 'fantasy',
  },
  {
    'name': 'Gender Bender',
    'slug': 'gender-bender',
  },
  {
    'name': 'Harem',
    'slug': 'harem',
  },
  {
    'name': 'Historical',
    'slug': 'historical',
  },
  {
    'name': 'Horror',
    'slug': 'horror',
  },
  {
    'name': 'Josei',
    'slug': 'josei',
  },
  {
    'name': 'Martial Arts',
    'slug': 'martial-arts',
  },
  {
    'name': 'Mature',
    'slug': 'mature',
  },
  {
    'name': 'Mecha',
    'slug': 'mecha',
  },
  {
    'name': 'Mystery',
    'slug': 'mystery',
  },
  {
    'name': 'Psychological',
    'slug': 'psychological',
  },
  {
    'name': 'Romance',
    'slug': 'romance',
  },
  {
    'name': 'School Life',
    'slug': 'school-life',
  },
  {
    'name': 'Sci-fi',
    'slug': 'sci-fi',
  },
  {
    'name': 'Seinen',
    'slug': 'seinen',
  },
  {
    'name': 'Shoujo',
    'slug': 'shoujo',
  },
  {
    'name': 'Shoujo Ai',
    'slug': 'shoujo-ai',
  },
  {
    'name': 'Shounen',
    'slug': 'shounen',
  },
  {
    'name': 'Shounen Ai',
    'slug': 'shounen-ai',
  },
  {
    'name': 'Slice of Life',
    'slug': 'slice-of-life',
  },
  {
    'name': 'Smut',
    'slug': 'smut',
  },
  {
    'name': 'Sports',
    'slug': 'sports',
  },
  {
    'name': 'Supernatural',
    'slug': 'supernatural',
  },
  {
    'name': 'Tragedy',
    'slug': 'tragedy',
  },
  {
    'name': 'Wuxia',
    'slug': 'wuxia',
  },
  {
    'name': 'Xianxia',
    'slug': 'xianxia',
  },
  {
    'name': 'Xuanhuan',
    'slug': 'xuanhuan',
  },
  {
    'name': 'Yaoi',
    'slug': 'yaoi',
  },
  {
    'name': 'Yuri',
    'slug': 'yuri',
  },
];

export default new StellarRealm();
