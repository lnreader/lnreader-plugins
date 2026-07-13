import { CheerioAPI, load as parseHTML } from 'cheerio';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';

class FuckNovelpia implements Plugin.PluginBase {
  id = 'FuckNovelpia';
  name = 'FuckNovelpia';
  icon = 'src/en/fucknovelpia/icon.png';
  site = 'https://fucknovelpia.com/';
  version = '1.1.0';

  // Returns false once the site has silently clamped us past the real last page.
  hasRequestedPage(cheerio: CheerioAPI, requestedPage: number): boolean {
    if (requestedPage <= 1) return true;
    const activeText = cheerio('div.pagination a.active').first().text().trim();
    const activePage = parseInt(activeText, 10);
    // No pagination at all, or active page doesn't match what we asked for
    // -> the site redirected us (usually back to page 1). Stop here.
    return !isNaN(activePage) && activePage === requestedPage;
  }

  parseNovelsList(cheerio: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    cheerio('.card-book a').each((i, el) => {
      const $el = cheerio(el);

      const href = $el.attr('href');
      if (!href) return;

      const path = href.startsWith('/') ? href.slice(1) : href;
      if (seen.has(path)) return;

      const img = $el.find('img').attr('src');
      const title =
        $el.find('img').attr('alt') || $el.find('.title').text().trim();

      seen.add(path);
      novels.push({
        path,
        name: title,
        cover: img || defaultCover,
      });
    });

    return novels;
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();

    params.set('q', '');

    if (showLatestNovels) {
      params.set('sort', 'latest');
    } else {
      params.set('sort', filters.sort.value);
    }

    // Search metadata filters (appears all the time)
    for (const key of [
      'author',
      'uploader',
      'translator_group',
      'country',
      'year_from',
      'year_to',
    ] as const) {
      params.set(key, filters[key].value);
    }

    params.set('status', filters.status.value);
    params.set('language', filters.lang.value);
    params.set('read_only', filters.read_only.value);

    if (filters.has_images?.value) {
      params.set('has_images', '1');
    }

    // Genre filters
    params.set('genre_mode', filters.genres_include_operator.value);
    for (const value of filters.genres?.value?.include ?? []) {
      params.append('genres_include[]', value);
    }
    for (const value of filters.genres?.value?.exclude ?? []) {
      params.append('genres_exclude[]', value);
    }

    // Tag filters
    params.set('tag_mode', filters.tags_include_operator.value);
    for (const value of filters.tags?.value?.include ?? []) {
      params.append('tags_include[]', value);
    }
    for (const value of filters.tags?.value?.exclude ?? []) {
      params.append('tags_exclude[]', value);
    }

    if (page > 1) {
      params.set('page', String(page));
    }

    const link = this.site + 'search.php?' + params.toString();

    const result = await fetchApi(link);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    if (!this.hasRequestedPage(loadedCheerio, page)) return [];
    return this.parseNovelsList(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novelInfo = loadedCheerio(
      'script[type="application/ld+json"]',
    ).text();

    let parsed: {
      name?: string;
      image?: string;
      description?: string;
      author?: { name?: string } | { name?: string }[];
      genre?: string[];
    } = {};
    try {
      parsed = JSON.parse(novelInfo);
    } catch {
      // JSON-LD missing or malformed — fields will fall back to defaults
    }

    const name = parsed.name || loadedCheerio('h1').text().trim();
    const cover = parsed.image || defaultCover;
    const summary =
      parsed.description || loadedCheerio('.hero-summary').text().trim();
    let author = [parsed.author]
      .flat()
      .map(a => a?.name)
      .filter(Boolean)
      .join(', ');
    if (!author) {
      author = loadedCheerio('.info-list li')
        .first()
        .text()
        .replace(/^Author:\s*/i, '')
        .trim();
    }

    let genres = [parsed.genre].flat().filter(Boolean).join(',');
    if (!genres) {
      genres = loadedCheerio('.genre-pill')
        .map((_, el) => loadedCheerio(el).text().trim())
        .get()
        .filter(Boolean)
        .join(',');
    }

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: name || 'Untitled',
      cover,
      summary,
      author,
      genres,
      chapters: [],
    };

    const rawStatus = loadedCheerio('.status-badge').text().trim();
    const statusMap: Record<string, string | undefined> = {
      ongoing: NovelStatus.Ongoing,
      completed: NovelStatus.Completed,
      hiatus: NovelStatus.OnHiatus,
      dropped: NovelStatus.Cancelled,
    };
    novel.status = statusMap[rawStatus.toLowerCase()] || NovelStatus.Unknown;

    const chapters: Plugin.ChapterItem[] = [];
    loadedCheerio('#chapter-list li').each((i, el) => {
      const $el = loadedCheerio(el);
      const href = ($el.find('a').attr('href') || '').trim();
      const path = href.startsWith('/') ? href.slice(1) : href;
      const name = $el.find('.chapter-item-main').text().trim();
      if (!path || !name) return;

      chapters.push({
        name: name + ($el.find('.chapter-item-flag').length ? ' [IMG]' : ''),
        path,
        chapterNumber: Number($el.attr('data-ch')),
      });
    });

    // Chapters on the novel page are already listed oldest -> newest.
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();
    const $ = parseHTML(body);

    const chapter = $('.reader').first();

    if (!chapter.length) {
      return '';
    }

    // Remove things that aren't part of the chapter
    chapter.find('.reader-nav').remove();
    chapter.find('script').remove();
    chapter.find('style').remove();

    return chapter.html()?.replace(/&nbsp;/g, ' ') ?? '';
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();

    params.set('q', searchTerm);
    params.set('author', '');
    params.set('uploader', '');
    params.set('translator_group', '');
    params.set('country', '');
    params.set('year_from', '');
    params.set('year_to', '');
    params.set('status', '');
    params.set('language', '');
    params.set('read_only', 'any');
    params.set('sort', 'newest');
    params.set('tag_mode', 'AND');
    params.set('genre_mode', 'AND');

    if (page > 1) {
      params.set('page', String(page));
    }

    const link = this.site + 'search.php?' + params.toString();

    const result = await fetchApi(link);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    if (!this.hasRequestedPage(loadedCheerio, page)) return [];
    return this.parseNovelsList(loadedCheerio);
  }

  filters = {
    sort: {
      label: 'Sort',
      value: 'newest',
      options: [
        { label: 'Newest', value: 'newest' },
        { label: 'Popular', value: 'popular' },
        { label: 'Oldest', value: 'oldest' },
        { label: 'Title A-Z', value: 'title' },
        { label: 'Year (Descending)', value: 'year_desc' },
        { label: 'Year (Ascending)', value: 'year_asc' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Status',
      value: '',
      options: [
        { label: 'Any', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'Dropped', value: 'dropped' },
      ],
      type: FilterTypes.Picker,
    },
    lang: {
      label: 'Language',
      value: '',
      options: [
        { label: 'Any', value: '' },
        { label: 'EN', value: 'en' },
        { label: 'ES', value: 'es' },
        { label: 'KO', value: 'ko' },
        { label: 'JA', value: 'ja' },
        { label: 'ZH', value: 'zh' },
      ],
      type: FilterTypes.Picker,
    },
    has_images: {
      label: 'Image Chapters',
      value: false,
      type: FilterTypes.Switch,
    },
    read_only: {
      label: 'Read Mode',
      value: 'and',
      options: [
        { label: 'Any', value: 'any' },
        { label: 'Read Only', value: 'yes' },
        { label: 'Downloadable', value: 'no' },
      ],
      type: FilterTypes.Picker,
    },
    genres_include_operator: {
      label: 'Include Genres',
      value: 'and',
      options: [
        { label: 'AND', value: 'and' },
        { label: 'OR', value: 'or' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'Genres',
      value: {
        include: [],
        exclude: [],
      },
      options: [
        { label: 'Academy', value: '1' },
        { label: 'Action', value: '2' },
        { label: 'Adventure', value: '3' },
        { label: 'Fantasy', value: '4' },
        { label: 'Horror', value: '5' },
        { label: 'Mystery', value: '6' },
        { label: 'Romance', value: '7' },
        { label: 'School', value: '8' },
        { label: 'Martial', value: '9' },
        { label: 'Smut', value: '10' },
        { label: 'Adult', value: '11' },
        { label: 'Harem', value: '12' },
        { label: 'Historical', value: '13' },
        { label: 'Sci-Fi', value: '14' },
        { label: 'Slice of Life', value: '15' },
        { label: 'Sports', value: '16' },
        { label: 'Uncategorized', value: '17' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    tags_include_operator: {
      label: 'Include Tags',
      value: 'and',
      options: [
        { label: 'AND', value: 'and' },
        { label: 'OR', value: 'or' },
      ],
      type: FilterTypes.Picker,
    },
    tags: {
      label: 'Tags',
      value: {
        include: [],
        exclude: [],
      },
      options: [
        { label: '583', value: '583' },
        { label: '600', value: '600' },
        { label: '606', value: '606' },
        { label: '621', value: '621' },
        { label: '644', value: '644' },
        { label: 'Academy Setting', value: 'academy setting' },
        { label: 'Adventurer Guild', value: 'adventurer guild' },
        { label: 'Age Gap', value: 'age gap' },
        { label: 'AI', value: 'ai' },
        { label: 'Alchemy', value: 'alchemy' },
        { label: 'Aliens', value: 'aliens' },
        { label: 'Alternate History', value: 'alternate history' },
        { label: 'Androids', value: 'androids' },
        { label: 'Angels', value: 'angels' },
        { label: 'Anti-Hero', value: 'anti-hero' },
        { label: 'Apocalypse System', value: 'apocalypse system' },
        { label: 'Army Building', value: 'army building' },
        { label: 'Arranged Marriage', value: 'arranged marriage' },
        { label: 'Artifact User', value: 'artifact user' },
        { label: 'Assassin', value: 'assassin' },
        { label: 'Awakening', value: 'awakening' },
        { label: 'Bad Girl', value: 'bad girl' },
        { label: 'Battle Heavy', value: 'battle heavy' },
        { label: 'Beast Taming', value: 'beast taming' },
        { label: 'Beastfolk', value: 'beastfolk' },
        { label: 'Berserker', value: 'berserker' },
        { label: 'Betrayal', value: 'betrayal' },
        { label: 'Bisexual Protagonist', value: 'bisexual protagonist' },
        { label: 'Blackmail', value: 'blackmail' },
        { label: 'Blood Magic', value: 'blood magic' },
        { label: 'Body Horror', value: 'body horror' },
        { label: 'Brainwashing', value: 'brainwashing' },
        { label: 'Breakup', value: 'breakup' },
        { label: 'Broken Protagonist', value: 'broken protagonist' },
        { label: 'Bureaucracy', value: 'bureaucracy' },
        { label: 'Cat Girl', value: 'cat girl' },
        { label: 'Cheat Ability', value: 'cheat ability' },
        { label: 'Childhood Friends', value: 'childhood friends' },
        { label: 'Chosen One', value: 'chosen one' },
        { label: 'Church', value: 'church' },
        { label: 'City Building', value: 'city building' },
        { label: 'Class System', value: 'class system' },
        { label: 'Cold Protagonist', value: 'cold protagonist' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Conspiracy', value: 'conspiracy' },
        { label: 'Contract Marriage', value: 'contract marriage' },
        { label: 'Cooking', value: 'cooking' },
        { label: 'Corporate War', value: 'corporate war' },
        { label: 'Corruption', value: 'corruption' },
        { label: 'Courtroom', value: 'courtroom' },
        { label: 'Crafting', value: 'crafting' },
        { label: 'Crime', value: 'crime' },
        { label: 'Criminal Organization', value: 'criminal organization' },
        { label: 'Cult', value: 'cult' },
        { label: 'Cultivation', value: 'cultivation' },
        { label: 'Cursed Power', value: 'cursed power' },
        { label: 'Cyberpunk', value: 'cyberpunk' },
        { label: 'Daily Life', value: 'daily life' },
        { label: 'Dark Fantasy', value: 'dark fantasy' },
        { label: 'Dark Magic', value: 'dark magic' },
        { label: 'Demon Lord', value: 'demon lord' },
        { label: 'Demon Powers', value: 'demon powers' },
        { label: 'Demon Protagonist', value: 'demon protagonist' },
        { label: 'Demons', value: 'demons' },
        { label: 'Depression', value: 'depression' },
        { label: 'Detective', value: 'detective' },
        { label: 'Detective Setting', value: 'detective setting' },
        { label: 'Diplomacy', value: 'diplomacy' },
        { label: 'Divine Powers', value: 'divine powers' },
        { label: 'Domestic Life', value: 'domestic life' },
        { label: 'Dragon Protagonist', value: 'dragon protagonist' },
        { label: 'Dragonkin', value: 'dragonkin' },
        { label: 'Dungeon', value: 'dungeon' },
        { label: 'Dungeon World', value: 'dungeon world' },
        { label: 'Dwarves', value: 'dwarves' },
        { label: 'Dystopia', value: 'dystopia' },
        { label: 'Economy', value: 'economy' },
        { label: 'Elemental Magic', value: 'elemental magic' },
        { label: 'Elves', value: 'elves' },
        { label: 'Empire Building', value: 'empire building' },
        { label: 'Enemies To Lovers', value: 'enemies to lovers' },
        { label: 'Erotic', value: 'erotic' },
        { label: 'Experiments', value: 'experiments' },
        { label: 'Explicit Sex', value: 'explicit sex' },
        { label: 'Fake Dating', value: 'fake dating' },
        { label: 'Family Drama', value: 'family drama' },
        { label: 'Farming', value: 'farming' },
        { label: 'Female Protagonist', value: 'female protagonist' },
        { label: 'Forbidden Love', value: 'forbidden love' },
        { label: 'Forbidden Magic', value: 'forbidden magic' },
        { label: 'Forensics', value: 'forensics' },
        { label: 'Found Family', value: 'found family' },
        { label: 'Fox Girl', value: 'fox girl' },
        { label: 'Friends To Lovers', value: 'friends to lovers' },
        { label: 'Game World', value: 'game world' },
        { label: 'Game-Like World', value: 'game-like world' },
        { label: 'Gangs', value: 'gangs' },
        { label: 'Gaslighting', value: 'gaslighting' },
        { label: 'Gender Bender', value: 'gender bender' },
        { label: 'Genetic Engineering', value: 'genetic engineering' },
        { label: 'Genius Protagonist', value: 'genius protagonist' },
        { label: 'Girl', value: 'girl' },
        { label: 'Goblins', value: 'goblins' },
        { label: 'Gods', value: 'gods' },
        { label: 'Gore', value: 'gore' },
        { label: 'Grief', value: 'grief' },
        { label: 'Hacking', value: 'hacking' },
        { label: 'Harem', value: 'harem' },
        { label: 'Healer', value: 'healer' },
        { label: 'Healing Story', value: 'healing story' },
        { label: 'Heist', value: 'heist' },
        { label: 'Hero', value: 'hero' },
        { label: 'Historical Setting', value: 'historical setting' },
        { label: 'Holy Magic', value: 'holy magic' },
        { label: 'Horror Elements', value: 'horror elements' },
        { label: 'Hypnosis', value: 'hypnosis' },
        { label: 'Imperial Court', value: 'imperial court' },
        { label: 'Investigation', value: 'investigation' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Kemonomimi', value: 'kemonomimi' },
        { label: 'Kidnapping', value: 'kidnapping' },
        { label: 'Kind Protagonist', value: 'kind protagonist' },
        { label: 'Kingdom Building', value: 'kingdom building' },
        { label: 'Kingdom Setting', value: 'kingdom setting' },
        { label: 'Leadership', value: 'leadership' },
        { label: 'Leveling', value: 'leveling' },
        { label: 'LitRPG', value: 'litrpg' },
        { label: 'Love Triangle', value: 'love triangle' },
        { label: 'Madness', value: 'madness' },
        { label: 'Mafia', value: 'mafia' },
        { label: 'Mage Protagonist', value: 'mage protagonist' },
        { label: 'Magic', value: 'magic' },
        { label: 'Male Protagonist', value: 'male protagonist' },
        { label: 'Management', value: 'management' },
        { label: 'Manipulation', value: 'manipulation' },
        { label: 'Marriage', value: 'marriage' },
        { label: 'Martial Arts', value: 'martial arts' },
        { label: 'Mastermind Protagonist', value: 'mastermind protagonist' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Medieval Fantasy', value: 'medieval fantasy' },
        { label: 'Mental Breakdown', value: 'mental breakdown' },
        { label: 'Mercenaries', value: 'mercenaries' },
        { label: 'Merchant Life', value: 'merchant life' },
        { label: 'Military', value: 'military' },
        { label: 'Military Setting', value: 'military setting' },
        { label: 'Mind Break', value: 'mind break' },
        { label: 'Modern World', value: 'modern world' },
        { label: 'Monster Girls', value: 'monster girls' },
        { label: 'Monster Protagonist', value: 'monster protagonist' },
        { label: 'Moral Dilemmas', value: 'moral dilemmas' },
        {
          label: 'Morally Gray Protagonist',
          value: 'morally gray protagonist',
        },
        { label: 'Multiple Protagonists', value: 'multiple protagonists' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Naive Protagonist', value: 'naive protagonist' },
        { label: 'Necromancy', value: 'necromancy' },
        { label: 'Negotiation', value: 'negotiation' },
        { label: 'Nobles', value: 'nobles' },
        { label: 'Non-Consensual', value: 'non-consensual' },
        { label: 'Non-Human Protagonist', value: 'non-human protagonist' },
        { label: 'NTR', value: 'ntr' },
        { label: 'Obsession', value: 'obsession' },
        { label: 'Obsessive Love', value: 'obsessive love' },
        { label: 'Orcs', value: 'orcs' },
        { label: 'Orphan Protagonist', value: 'orphan protagonist' },
        { label: 'Overpowered Protagonist', value: 'overpowered protagonist' },
        { label: 'Parallel World', value: 'parallel world' },
        { label: 'Parody', value: 'parody' },
        { label: 'Police', value: 'police' },
        { label: 'Political Intrigue', value: 'political intrigue' },
        { label: 'Political Marriage', value: 'political marriage' },
        { label: 'Politics', value: 'politics' },
        { label: 'Polyamory', value: 'polyamory' },
        { label: 'Possessive Love', value: 'possessive love' },
        { label: 'Post-Apocalyptic', value: 'post-apocalyptic' },
        { label: 'Prince Protagonist', value: 'prince protagonist' },
        { label: 'Princess Protagonist', value: 'princess protagonist' },
        { label: 'Progression Fantasy', value: 'progression fantasy' },
        { label: 'Prostitution', value: 'prostitution' },
        { label: 'Prostitution Arc', value: 'prostitution arc' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Rape', value: 'rape' },
        { label: 'Rebels', value: 'rebels' },
        { label: 'Reconciliation', value: 'reconciliation' },
        { label: 'Redemption', value: 'redemption' },
        { label: 'Regression', value: 'regression' },
        { label: 'Reincarnated Villainess', value: 'reincarnated villainess' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Revenge', value: 'revenge' },
        { label: 'Revenge Driven', value: 'revenge driven' },
        { label: 'Reverse Harem', value: 'reverse harem' },
        { label: 'Romance', value: 'romance' },
        { label: 'Royalty', value: 'royalty' },
        { label: 'Ruthless Protagonist', value: 'ruthless protagonist' },
        { label: 'Saintess Protagonist', value: 'saintess protagonist' },
        { label: 'Satire', value: 'satire' },
        { label: 'Scheming', value: 'scheming' },
        { label: 'School Setting', value: 'school setting' },
        { label: 'Sci-Fi', value: 'sci-fi' },
        { label: 'Sci-Fi Setting', value: 'sci-fi setting' },
        { label: 'Second Chance', value: 'second chance' },
        { label: 'Secret Organization', value: 'secret organization' },
        { label: 'Serial Killer', value: 'serial killer' },
        { label: 'Sex Slavery', value: 'sex slavery' },
        { label: 'Sex Work', value: 'sex work' },
        { label: 'Shop Owner', value: 'shop owner' },
        { label: 'Simulation', value: 'simulation' },
        { label: 'Skill System', value: 'skill system' },
        { label: 'Slave Heroine', value: 'slave heroine' },
        { label: 'Slice of Life', value: 'slice of life' },
        { label: 'Slime', value: 'slime' },
        { label: 'Slow Burn', value: 'slow burn' },
        { label: 'Smut', value: 'smut' },
        { label: 'Soulmate', value: 'soulmate' },
        { label: 'Space Opera', value: 'space opera' },
        { label: 'Space Travel', value: 'space travel' },
        { label: 'Spider', value: 'spider' },
        { label: 'Spies', value: 'spies' },
        { label: 'Spirits', value: 'spirits' },
        { label: 'Stats Window', value: 'stats window' },
        { label: 'Steampunk', value: 'steampunk' },
        { label: 'Strategy', value: 'strategy' },
        { label: 'Summoner', value: 'summoner' },
        { label: 'Summoning', value: 'summoning' },
        { label: 'Super Soldiers', value: 'super soldiers' },
        { label: 'Superhero Setting', value: 'superhero setting' },
        { label: 'Survival Combat', value: 'survival combat' },
        { label: 'Suspense', value: 'suspense' },
        { label: 'Swordsmanship', value: 'swordsmanship' },
        { label: 'System', value: 'system' },
        { label: 'Tactics', value: 'tactics' },
        { label: 'Talent Growth', value: 'talent growth' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Time Loop', value: 'time loop' },
        { label: 'Time Travel', value: 'time travel' },
        { label: 'Torture', value: 'torture' },
        { label: 'Tower', value: 'tower' },
        { label: 'Toxic Relationship', value: 'toxic relationship' },
        { label: 'Trade', value: 'trade' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Tragic Protagonist', value: 'tragic protagonist' },
        { label: 'Training Arc', value: 'training arc' },
        { label: 'Transmigration', value: 'transmigration' },
        { label: 'Trauma', value: 'trauma' },
        { label: 'TS', value: 'ts' },
        { label: 'Undead', value: 'undead' },
        { label: 'Undead Protagonist', value: 'undead protagonist' },
        { label: 'Underworld', value: 'underworld' },
        { label: 'Underworld Setting', value: 'underworld setting' },
        { label: 'Urban Fantasy', value: 'urban fantasy' },
        { label: 'Vampire', value: 'vampire' },
        { label: 'Villain Protagonist', value: 'villain protagonist' },
        { label: 'Violence', value: 'violence' },
        { label: 'Virtual Reality', value: 'virtual reality' },
        { label: 'Virtual World', value: 'virtual world' },
        { label: 'War Arc', value: 'war arc' },
        { label: 'War Strategy', value: 'war strategy' },
        { label: 'Warrior Protagonist', value: 'warrior protagonist' },
        { label: 'Weak To Strong', value: 'weak to strong' },
        { label: 'Werewolf', value: 'werewolf' },
        { label: 'Wholesome', value: 'wholesome' },
        { label: 'Wolf Girl', value: 'wolf girl' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    author: {
      label: 'Author',
      value: '',
      type: FilterTypes.TextInput,
    },
    uploader: {
      label: 'Uploader',
      value: '',
      type: FilterTypes.TextInput,
    },
    translator_group: {
      label: 'Translator Group',
      value: '',
      type: FilterTypes.TextInput,
    },
    country: {
      label: 'Country',
      value: '',
      type: FilterTypes.TextInput,
    },
    year_from: {
      label: 'Year From',
      value: '',
      type: FilterTypes.TextInput,
    },
    year_to: {
      label: 'Year To',
      value: '',
      type: FilterTypes.TextInput,
    },
  } satisfies Filters;
}

export default new FuckNovelpia();
