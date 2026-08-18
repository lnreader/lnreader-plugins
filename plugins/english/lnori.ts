import { fetchApi } from '@libs/fetch';
import { storage } from '@libs/storage';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as parseHTML } from 'cheerio';
import { Parser } from 'htmlparser2';
import { defaultCover } from '@libs/defaultCover';

class LnorisPlugin implements Plugin.PluginBase {
  id = 'lnori';
  name = 'LNORI';
  icon = 'src/en/lnori/icon.png';
  site = 'https://lnori.com/';
  version = '1.1.0';
  webStorageUtilized = true;

  pluginSettings = {
    clearCache: {
      value: false,
      label: 'Clear page cache on next page load',
      type: 'Switch',
    },
  };

  private libraryCache: CachedNovel[] | null = null;

  private clearCache() {
    if (storage.get('clearCache')) {
      storage.clearAll();
      this.libraryCache = null;
      storage.set('clearCache', false);
    }
  }

  private async fetchPage(
    url: string,
    ttl = 8 * 60 * 60 * 1000,
  ): Promise<string> {
    const cached = storage.get<string>(url);
    if (cached) return cached;
    const body = await (await fetchApi(url)).text();
    storage.set(url, body, ttl);
    return body;
  }

  private async getLibraryNovels(): Promise<CachedNovel[]> {
    if (this.libraryCache) return this.libraryCache;

    const url = this.site + 'library';
    // library gets 1 hour cache
    const body = await this.fetchPage(url, 1 * 60 * 60 * 1000);
    let tempNovel: Partial<Plugin.NovelItem> & {
      author?: string;
      tags?: string;
      year?: string;
      relevance?: string;
      volNo?: string;
    } = {};
    const novels: CachedNovel[] = [];

    const stateStack: ParsingState[] = [ParsingState.Idle];
    const currentState = () => stateStack[stateStack.length - 1];
    const pushState = (state: ParsingState) => stateStack.push(state);
    const popState = () =>
      stateStack.length > 1 ? stateStack.pop() : currentState();

    const parser = new Parser({
      onopentag: (name, attribs) => {
        const state = currentState();
        switch (name) {
          case 'article': {
            pushState(ParsingState.Novel);
            tempNovel.name = attribs['data-t'];
            tempNovel.author = attribs['data-a'];
            tempNovel.tags = attribs['data-tags'];
            tempNovel.year = attribs['data-d'];
            tempNovel.relevance = attribs['data-rel'];
            tempNovel.volNo = attribs['data-v'];
            break;
          }
          case 'a':
            if (state === ParsingState.Novel) {
              tempNovel.path = attribs.href.substring(1);
            }
            break;
          case 'img':
            if (state === ParsingState.Novel) {
              tempNovel.cover = attribs.src;
              if (tempNovel.path && tempNovel.name) {
                novels.push({
                  novel: {
                    name: tempNovel.name,
                    path: tempNovel.path,
                    cover: tempNovel.cover,
                  },
                  author: tempNovel.author || '',
                  tags: tempNovel.tags
                    ? tempNovel.tags
                        .split(',')
                        .map(t => t.trim())
                        .filter(Boolean)
                    : [],
                  year: tempNovel.year,
                  relevance: tempNovel.relevance,
                  volNo: tempNovel.volNo,
                });
              }
              tempNovel = {};
              popState();
            }
        }
      },
    });

    parser.write(body);
    parser.end();

    this.libraryCache = novels;
    return novels;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const parsedList = await this.getLibraryNovels();

    let filtered = [...parsedList];

    const { include = [], exclude = [] } = filters.genre.value;
    if (include.length || exclude.length) {
      filtered = filtered.filter(
        item =>
          (!include.length || include.some(g => item.tags.includes(g))) &&
          (!exclude.length || !exclude.some(g => item.tags.includes(g))),
      );
    }

    const year = filters.year.value;
    if (year) {
      filtered = filtered.filter(item => item.year === year);
    }

    switch (filters.sort.value) {
      case 'title':
        filtered.sort((a, b) => a.novel.name.localeCompare(b.novel.name));
        break;
      case 'date':
        filtered.sort(
          (a, b) => parseInt(b.year || '0', 10) - parseInt(a.year || '0', 10),
        );
        break;
      case 'volumes':
        filtered.sort(
          (a, b) => parseInt(b.volNo || '0', 10) - parseInt(a.volNo || '0', 10),
        );
        break;
      case 'relevance':
        filtered.sort(
          (a, b) =>
            parseInt(b.relevance || '0', 10) - parseInt(a.relevance || '0', 10),
        );
        break;
    }

    const novels = filtered.map(item => item.novel);
    if (filters.reverse.value) novels.reverse();
    const start = (pageNo - 1) * 36;
    return novels.slice(start, start + 36);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    this.clearCache();
    const body = await this.fetchPage(this.site + novelPath);

    const genreArray = new Set<string>();
    const summaryArray: string[] = [];
    const scriptArray: string[] = [];

    const stateStack: ParsingState[] = [ParsingState.Idle];
    const currentState = () => stateStack[stateStack.length - 1];
    const pushState = (s: ParsingState) => stateStack.push(s);
    const popState = () =>
      stateStack.length > 1 ? stateStack.pop() : currentState();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      cover: defaultCover,
      summary: '',
      author: '',
      genres: '',
      chapters: [],
    };
    const volumeMap: Record<string, string> = {};
    let tempVolume: Partial<VolumeType> = {};

    const parser = new Parser({
      onopentag: (name, attribs) => {
        const cls = attribs.class || '';
        const state = currentState();

        switch (name) {
          case 'article':
            switch (cls) {
              case 'hero-card':
                pushState(ParsingState.HeroCard);
                return;
              case 'card':
              case 'card.card-loaded':
              case 'card.card-loaded.popup-left':
              case 'card.card-loaded.popup-right':
                pushState(ParsingState.VolArticle);
                return;
            }
            break;
          case 'img':
            if (state === ParsingState.HeroCard) {
              novel.cover = attribs.src;
            }
            break;
          case 'p':
            if (cls === 'author') {
              pushState(ParsingState.Author);
              return;
            }
            if (
              cls?.includes('description') &&
              state === ParsingState.HeroCard
            ) {
              pushState(ParsingState.Description);
              return;
            }
            break;
          case 'a':
            if (cls === 'tag') {
              pushState(ParsingState.Genres);
              return;
            }
            if (state === ParsingState.VolArticle && cls) {
              tempVolume.href = attribs.href.substring(1);
              tempVolume.name = attribs['aria-label'];
            }
            break;
          case 'script':
            if (attribs.type === 'application/ld+json') {
              pushState(ParsingState.JsonLd);
              return;
            }
            break;
          case 'footer':
            if (state === ParsingState.VolArticle) {
              pushState(ParsingState.VolCardMeta);
            }
            break;
          case 'button':
            if (state === ParsingState.HeroCard) {
              novel.name = attribs['data-series-title'];
            }
            break;
        }
      },

      ontext: text => {
        switch (currentState()) {
          case ParsingState.JsonLd:
            scriptArray.push(text);
            break;
          case ParsingState.Author:
            novel.author = (novel.author || '') + text;
            break;
          case ParsingState.Genres:
            genreArray.add(text);
            break;
          case ParsingState.Description:
            summaryArray.push(text);
            break;
          case ParsingState.VolCardMeta:
            if (text === '.5') {
              tempVolume.name += '.5';
            }
            break;
        }
      },

      onclosetag: name => {
        const state = currentState();
        switch (name) {
          case 'script':
            if (state === ParsingState.JsonLd) popState();
            break;
          case 'article':
            popState();
            if (tempVolume.href) {
              volumeMap[tempVolume.href] = tempVolume.name || '';
            }
            tempVolume = {};
            break;
          case 'footer':
            if (state === ParsingState.VolCardMeta) popState();
            break;
          case 'a':
            if (state === ParsingState.Genres) popState();
            break;
          case 'p':
            if (
              state === ParsingState.Author ||
              state === ParsingState.Description
            )
              popState();
            break;
        }
      },
      onend: () => {
        // Parse JSON-LD
        let parsed: {
          name?: string;
          image?: string;
          description?: string;
          author?: { name?: string } | { name?: string }[];
          genre?: string;
          hasPart?: { url?: string; name?: string }[];
        } = {};
        try {
          parsed = JSON.parse(scriptArray.join(''));
        } catch {
          // eslint
        }

        novel.name = novel.name ?? parsed.name ?? 'Untitled';
        novel.cover = novel.cover ?? parsed.image ?? defaultCover;
        novel.summary = summaryArray.join('') ?? parsed.description;
        const authorFromLd = [parsed.author]
          .flat()
          .map(a => a?.name)
          .filter(Boolean)
          .join(', ');
        if (authorFromLd) {
          novel.author = authorFromLd;
        }
        novel.genres = parsed.genre || Array.from(genreArray).join(',');

        if (Object.keys(volumeMap).length === 0) {
          if (parsed.hasPart && Array.isArray(parsed.hasPart)) {
            for (const part of parsed.hasPart) {
              if (part?.url) {
                const volPath = part.url.startsWith(this.site)
                  ? part.url.slice(this.site.length)
                  : part.url;
                volumeMap[volPath] = part.name || '';
              }
            }
          }
        }
        for (const key of Object.keys(volumeMap))
          if (novel.name && volumeMap[key].startsWith(novel.name))
            volumeMap[key] = '-' + volumeMap[key].slice(novel.name.length);
      },
    });

    parser.write(body);
    parser.end();

    const getVolumeName = (_href: string, text: string) => {
      const match = text.match(/(Vol(?:ume)?\.?\s*\d+(?:[-.\s]\d+)?)/i);
      return match ? match[1] : text;
    };

    const volumeUrls = Object.keys(volumeMap);

    const chapters2D: Plugin.ChapterItem[][] = [];
    for (const volUrl of volumeUrls) {
      let volHtml: string;
      try {
        volHtml = await this.fetchPage(this.site + volUrl);
      } catch (err) {
        throw new Error(
          `Failed to fetch volume: ${volumeMap[volUrl]} (${volUrl}) — ${String(err)}`,
        );
      }
      const volTitle = getVolumeName(volUrl, volumeMap[volUrl]);
      const volChapters: Plugin.ChapterItem[] = [];

      try {
        let inTocList = false;
        const tocParser = new Parser({
          onopentag: (name, attribs) => {
            if (name === 'nav' && attribs.id === 'toc-list') {
              inTocList = true;
              return;
            }
            if (!inTocList) return;
            if (name === 'a') {
              const href = attribs.href;
              if (!href) return;
              const chapName = attribs.title
                ? attribs.title.trim().replace(/\s+/g, ' ')
                : '';
              volChapters.push({
                name: `${volTitle} - ${chapName}`,
                path: volUrl + href,
              });
            }
          },
          onclosetag: name => {
            if (!inTocList) return;
            if (inTocList && name === 'nav') {
              inTocList = false;
            }
          },
        });

        tocParser.write(volHtml);
        tocParser.end();
      } catch (err) {
        throw new Error(
          `Failed to parse volume page: ${volumeMap[volUrl]} (${volUrl}) — ${String(err)}`,
        );
      }

      if (!volChapters.length) {
        throw new Error(
          `No chapters found in volume: ${volumeMap[volUrl]} (${volUrl})`,
        );
      }
      chapters2D.push(volChapters);
    }
    const chapters = chapters2D.flat();

    novel.chapters = chapters.map((chap, idx) => ({
      ...chap,
      chapterNumber: idx + 1,
    }));

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [base, anchor] = chapterPath.split('#');
    const $ = parseHTML(await this.fetchPage(this.site + base));

    $('.chapter-title').remove();
    const nextId = $(`#toc-list a[href="#${anchor}"]`)
      .parent()
      .next()
      .find('a')
      .attr('href')
      ?.slice(1);
    const allSections = $('section[id*=page]');
    const start = allSections.index($(`section#${anchor}`));
    if (start === -1) return '';

    const end = nextId ? allSections.index($(`section#${nextId}`)) : -1;

    return allSections
      .slice(start, end !== -1 ? end : allSections.length)
      .map((_, el) => $(el).html() || '')
      .get()
      .join('<hr>');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.toLowerCase();
    const parsedList = await this.getLibraryNovels();
    const filtered = parsedList
      .filter(
        item =>
          item.novel.name.toLowerCase().includes(term) ||
          item.author.toLowerCase().includes(term) ||
          item.tags.some(t => t.includes(term)),
      )
      .map(item => item.novel);

    const start = (pageNo - 1) * 36;
    return filtered.slice(start, start + 36);
  }

  // resolveUrl = (path: string, _isNovel?: boolean) => {
  //   return new URL(path, this.site).href;
  // };

  filters = {
    sort: {
      label: 'Sort By',
      value: 'relevance',
      options: [
        { label: 'Relevance', value: 'relevance' },
        { label: 'Title', value: 'title' },
        { label: 'Year Released', value: 'date' },
        { label: 'Volumes', value: 'volumes' },
      ],
      type: FilterTypes.Picker,
    },
    reverse: {
      label: 'Reverse Results',
      value: false,
      type: FilterTypes.Switch,
    },
    genre: {
      label: 'Genre',
      value: {
        include: [],
        exclude: [],
      },
      options: [
        { label: 'All', value: '' },
        { label: 'Academy', value: 'academy' },
        { label: 'Action', value: 'action' },
        { label: 'Adult Protagonist', value: 'adult protagonist' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Age Gap', value: 'age gap' },
        { label: 'Airhead', value: 'airhead' },
        { label: 'Alchemy', value: 'alchemy' },
        { label: 'Animals', value: 'animals' },
        { label: 'Anime Tie-In', value: 'anime tie-in' },
        { label: 'Aristocracy', value: 'aristocracy' },
        { label: 'Battle', value: 'battle' },
        { label: 'Books', value: 'books' },
        { label: 'Boys Love', value: 'boys love' },
        { label: 'Business', value: 'business' },
        { label: 'Camping', value: 'camping' },
        { label: 'Childhood Friend', value: 'childhood friend' },
        { label: 'Chinese Ambience', value: 'chinese ambience' },
        { label: 'Chuunibyou', value: 'chuunibyou' },
        { label: 'Combat', value: 'combat' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Contract Marriage', value: 'contract marriage' },
        { label: 'Cooking', value: 'cooking' },
        { label: 'Crime', value: 'crime' },
        { label: 'Cross-Dressing', value: 'cross-dressing' },
        { label: 'Dark', value: 'dark' },
        { label: 'Dark Fantasy', value: 'dark fantasy' },
        { label: 'Demon Lord', value: 'demon lord' },
        { label: 'Demons', value: 'demons' },
        { label: 'Dragons', value: 'dragons' },
        { label: 'Drama', value: 'drama' },
        { label: 'Dungeon', value: 'dungeon' },
        { label: 'Dungeon Diving', value: 'dungeon diving' },
        { label: 'Dystopian', value: 'dystopian' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Elf', value: 'elf' },
        { label: 'Enemies to Lovers', value: 'enemies to lovers' },
        { label: 'Fairies', value: 'fairies' },
        { label: 'Familiars', value: 'familiars' },
        { label: 'Family', value: 'family' },
        { label: 'Fanservice', value: 'fanservice' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Fantasy World', value: 'fantasy world' },
        { label: 'Female Protagonist', value: 'female protagonist' },
        { label: 'First Person', value: 'first person' },
        { label: 'Fish Out of Water', value: 'fish out of water' },
        { label: 'Food', value: 'food' },
        { label: 'Friendship', value: 'friendship' },
        { label: 'Futuristic', value: 'futuristic' },
        { label: 'Game Elements', value: 'game elements' },
        { label: 'Gamer Protagonist', value: 'gamer protagonist' },
        { label: 'Gender Bender', value: 'gender bender' },
        { label: 'Genius', value: 'genius' },
        { label: 'Girls Love', value: 'girls love' },
        { label: 'Guns', value: 'guns' },
        { label: 'Harem', value: 'harem' },
        { label: 'Heartwarming', value: 'heartwarming' },
        { label: 'High Fantasy', value: 'high fantasy' },
        { label: 'High School', value: 'high school' },
        { label: 'Historical', value: 'historical' },
        { label: 'Historical Fantasy', value: 'historical fantasy' },
        { label: 'Horror', value: 'horror' },
        { label: 'Humor', value: 'humor' },
        { label: 'Invention', value: 'invention' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'Knights', value: 'knights' },
        { label: 'LGBTQ+', value: 'lgbtq' },
        { label: 'Lighthearted', value: 'lighthearted' },
        { label: 'Literary', value: 'literary' },
        { label: 'Magic', value: 'magic' },
        { label: 'Magic Academy', value: 'magic academy' },
        { label: 'Magical Weapons', value: 'magical weapons' },
        { label: 'Maid', value: 'maid' },
        { label: 'Male Protagonist', value: 'male protagonist' },
        { label: 'Manga Tie-In', value: 'manga tie-in' },
        { label: 'Marriage', value: 'marriage' },
        { label: 'Martial Arts', value: 'martial arts' },
        { label: 'Master and Servant', value: 'master and servant' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Medieval', value: 'medieval' },
        { label: 'Military', value: 'military' },
        { label: 'Modern Day', value: 'modern day' },
        { label: 'Moe', value: 'moe' },
        { label: 'Monster Girls', value: 'monster girls' },
        { label: 'Monster Taming', value: 'monster taming' },
        { label: 'Monsters', value: 'monsters' },
        { label: 'Multiple POV', value: 'multiple pov' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Nobility', value: 'nobility' },
        { label: 'Not the Hero', value: 'not the hero' },
        { label: 'OP Power', value: 'op power' },
        { label: 'OP Protagonist', value: 'op protagonist' },
        { label: 'Ordinary Protagonist', value: 'ordinary protagonist' },
        { label: 'Otaku', value: 'otaku' },
        { label: 'Otome', value: 'otome' },
        { label: 'Otome Game', value: 'otome game' },
        { label: 'Overpowered', value: 'overpowered' },
        { label: 'Paranormal', value: 'paranormal' },
        { label: 'Past Life', value: 'past life' },
        { label: 'Period Piece', value: 'period piece' },
        { label: 'Personal Growth', value: 'personal growth' },
        { label: 'Political Marriage', value: 'political marriage' },
        { label: 'Politics', value: 'politics' },
        { label: 'Princess', value: 'princess' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Revenge', value: 'revenge' },
        { label: 'Reverse Harem', value: 'reverse harem' },
        { label: 'Rewriting History', value: 'rewriting history' },
        { label: 'Romance', value: 'romance' },
        { label: 'Romantic Fantasy', value: 'romantic fantasy' },
        { label: 'RPG', value: 'rpg' },
        { label: 'Satire', value: 'satire' },
        { label: 'School', value: 'school' },
        { label: 'School Life', value: 'school life' },
        { label: 'Sci-Fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Slice of Life', value: 'slice of life' },
        { label: 'Slow Life', value: 'slow life' },
        { label: 'Snarky Protagonist', value: 'snarky protagonist' },
        { label: 'Sorcery', value: 'sorcery' },
        { label: 'Strategy', value: 'strategy' },
        { label: 'Strong Female Lead', value: 'strong female lead' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Superpowers', value: 'superpowers' },
        { label: 'Survival', value: 'survival' },
        { label: 'Sword and Sorcery', value: 'sword and sorcery' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Time Travel', value: 'time travel' },
        { label: 'Tsundere', value: 'tsundere' },
        { label: 'Underdog', value: 'underdog' },
        { label: 'Unique Ability', value: 'unique ability' },
        { label: 'Vampire', value: 'vampire' },
        { label: 'Video Game', value: 'video game' },
        { label: 'Video Game Related', value: 'video game related' },
        { label: 'Video Game Tie-In', value: 'video game tie-in' },
        { label: 'Villainess', value: 'villainess' },
        { label: 'Violence', value: 'violence' },
        { label: 'VRMMO', value: 'vrmmo' },
        { label: 'War', value: 'war' },
        { label: 'Weak Protagonist', value: 'weak protagonist' },
        { label: 'Witch', value: 'witch' },
        { label: 'Zero to Hero', value: 'zero to hero' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    year: {
      label: 'Year',
      value: '',
      options: [
        { label: 'Any', value: '' },
        { label: '9999', value: '9999' },
        { label: '2026', value: '2026' },
        { label: '2025', value: '2025' },
        { label: '2024', value: '2024' },
        { label: '2023', value: '2023' },
        { label: '2022', value: '2022' },
        { label: '2021', value: '2021' },
        { label: '2020', value: '2020' },
        { label: '2019', value: '2019' },
        { label: '2018', value: '2018' },
        { label: '2017', value: '2017' },
        { label: '2016', value: '2016' },
        { label: '2015', value: '2015' },
        { label: '2014', value: '2014' },
        { label: '2013', value: '2013' },
        { label: '2012', value: '2012' },
        { label: '2011', value: '2011' },
        { label: '2010', value: '2010' },
        { label: '2009', value: '2009' },
        { label: '2008', value: '2008' },
        { label: '2007', value: '2007' },
        { label: '2006', value: '2006' },
        { label: '2004', value: '2004' },
        { label: '2003', value: '2003' },
        { label: '2002', value: '2002' },
        { label: '2001', value: '2001' },
        { label: '1999', value: '1999' },
        { label: '1998', value: '1998' },
        { label: '1997', value: '1997' },
        { label: '1996', value: '1996' },
        { label: '1994', value: '1994' },
        { label: '1988', value: '1988' },
        { label: '1987', value: '1987' },
        { label: '1983', value: '1983' },
        { label: '1982', value: '1982' },
        { label: '1980', value: '1980' },
        { label: '1979', value: '1979' },
        { label: '1973', value: '1973' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new LnorisPlugin();

enum ParsingState {
  Idle,
  Novel,
  JsonLd,
  // parseNovel: novel page HTML fallback states
  HeroCard,
  SInfo,
  CollectTitle,
  Author,
  InTagsBox,
  Genres,
  DescBox,
  Description,
  CoverFigure,
  VolGrid,
  VolArticle,
  VolCardTitle,
  VolCardMeta,
}

type CachedNovel = {
  novel: Plugin.NovelItem;
  author: string;
  tags: string[];
  year?: string;
  relevance?: string;
  volNo?: string;
};

type VolumeType = {
  href: string;
  name: string;
};
