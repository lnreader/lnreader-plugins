import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type MWPage = {
  title: string;
  missing?: boolean;
  extract?: string;
  thumbnail?: { source: string };
  categories?: { title: string }[];
  revisions?: { timestamp: string }[];
};

type MWResponse = {
  query?: {
    pages?: MWPage[];
    categorymembers?: { title: string }[];
    search?: { title: string }[];
    prefixsearch?: { title: string }[];
    recentchanges?: { title: string }[];
    allpages?: { title: string }[];
  };
  parse?: { title: string; text: string };
  continue?: Record<string, string>;
  error?: { code: string; info: string };
};

class BakaTsuki implements Plugin.PluginBase {
  id = 'bakatsuki';
  name = 'Baka-Tsuki';
  version = '1.1.0';
  icon = 'src/en/bakatsuki/icon.png';
  site = 'https://www.baka-tsuki.org/project/';

  private readonly apiUrl = this.site + 'api.php';
  private readonly pageSize = 40;

  /**
   * The catalogue is exactly the wiki's own English light novel listing —
   * titles verbatim, romanised as Baka-Tsuki writes them.
   */
  private readonly catalogueCategory = 'Light novel (English)';

  /**
   * Read for status only, not for catalogue membership. These are
   * language-agnostic and would otherwise pull in translation siblings
   * ("Absolute Duo - Français").
   */
  private readonly statusCategories: Record<string, string> = {
    'Active Projects': NovelStatus.Ongoing,
    'Completed Project': NovelStatus.Completed,
    'Stalled Projects': NovelStatus.OnHiatus,
    'Inactive Projects': NovelStatus.Inactive,
    'Hosted Projects': NovelStatus.Ongoing,
  };

  private readonly nonEnglishPattern =
    /(?:^|[\s([~\-_])(?:fran[cç]ais|espa[nñ]ol|spanish|french|german|deutsch|italian|italiano|polski|polish|portugu[eê]s|portuguese|brazilian|russian|swedish|svenska|indonesia|indonesian|vietnamese|chinese|thai|turkish|t[uü]rk[cç]e|arabic|korean|japanese|dutch|nederlands|hungarian|magyar|romanian|greek|hebrew|persian|farsi|czech|bulgarian|serbian|croatian|finnish|danish|norwegian|ukrainian|latvian|lithuanian|estonian|slovak|slovenian|catalan|filipino|tagalog|malay|hindi|bengali|tamil|urdu)(?:$|[\s)\]~\-_:])|[\s\-~_](?:FR|PL|ES|DE|IT|PT|RU|VN|CN|TH|TR|AR|KR|JP|NL|HU|RO|GR|CZ|BG|RS|HR|FI|DK|NO|UA|SE|ID)$/i;

  /**
   * Sub-pages of a project (chapters, illustrations, staff pages). Used to keep
   * them out of novel lists — matching on a bare ":" would be wrong, since real
   * projects contain colons ("Anohana: The Flower We Saw That Day").
   */
  private readonly subPagePattern =
    /:(?:\s*)(?:Volume|Vol\.?|Chapter|Part|Book|Full[_ ]Text|Illustrations?|Prologue|Epilogue|Afterword|Side[_ ]Stor(?:y|ies)|Short[_ ]Stor(?:y|ies)|Names[_ ]and[_ ]Terminology|Registration|Registry|Updates?|Staff|Guidelines|Format|Historique|Enregistrement)/i;

  /**
   * Project scaffolding that shares the chapter prefix but isn't readable
   * content ("Absolute Duo:Registration", "…:Names and Terminology").
   */
  private readonly nonChapterPattern =
    /^(?:Registration|Registry|Archives?|Staff|Guidelines?|Updates?|Format|Names[\s_]and[\s_]Terminology|Terminology|Translation|Translators?|Editors?|Discussion|Sandbox|Talk|Status|References?|Credits?|To-?do|Feedback|Preview|Announcements?)/i;

  private readonly genrePattern = /^Category:Genre\s*-\s*(.+)$/i;

  /**
   * Publisher imprints and structural categories, excluded when guessing the
   * author from a page's category list.
   */
  private readonly nonAuthorCategoryPattern =
    /^(?:Light novel|Web novel|Original light novel|Visual novel|Audio novel|Genre|Hosted|Active|Completed|Inactive|Stalled|Teaser|Licensed|Pages? |Candidates|Articles|Project|Series|Novel|Manga)|(?:Bunko|Books|Publishing|Shoten|Shuppan|Kadokawa|Shueisha|Kodansha|Shogakukan|ASCII|Media Factory|Enterbrain|Hobby Japan|Overlap|SoftBank|Fujimi|Dengeki|Gagaga|Sneaker|Ichijinsha|Earth Star|Micro Magazine|TO Books|Alphapolis|Famitsu|Fantasia|Dash|Kobunsha|Takeshobo|Houbunsha|Media Works)/i;

  /**
   * Catalogue entries that had no sub-pages at all when last surveyed — nothing
   * to read, so they are hidden from search. Treated as *suspicion* only: each
   * is re-checked once per session before being hidden, so a project that gains
   * chapters reappears on its own rather than staying hidden until this list is
   * regenerated.
   */
  private readonly possiblyEmpty = new Set([
    'Allison',
    'Ark',
    'Clotaku Club!',
    'CtG—Zero Kara Sodateru Dennou Shoujo',
    'Etsusa Bridge',
    'Famima!',
    'Hikaru ga Chikyuu ni Itakoro......',
    'Hitotsu no Tairiki no Monogatari',
    "I'm a High School Boy and a Bestselling Light Novel author, strangled by my female classmate who is my junior and a voice actress",
    'Kamisu Reina Series',
    'Kill No More',
    'Lillia to Treize',
    'Maru-MA',
    'Meg to Seron',
    'Mushi to Medama',
    'Ojamajo Doremi 16',
    'Onii-chan Dakedo Ai Sae Areba Kankei Nai yo ne—',
    'Ore ga Ojou-Sama Gakkou ni ‘Shomin Sample’ Toshite Usarareta Ken',
    'Ore no Kanojo to Osananajimi ga Shuraba Sugiru ~Brazilian Portuguese~',
    'Ore no Nounai Sentakushi ga, Gakuen Love Come o Zenryoku de Jama Shiteiru',
    'Puppetmaster',
    'Remembrances for a certain pilot',
    'Sayonara Piano Sonata',
    'Sekai Ichi no Imouto-sama',
    'Sword of the Emperor',
    'Tabi ni Deyou, Horobiyuku Sekai no Hate Made',
    'Tsuki Tsuki!',
    'Tsukumodo Antique Shop',
    'Una Simple Revisión en Español',
    'Vamp!',
    "We Don't Open Anywhere -There are no facts, only interpretations.-",
    'White Album 2 Omake',
  ]);

  private contentCache = new Map<string, boolean>();

  private cataloguePromise: Promise<string[]> | null = null;
  private catalogue: string[] = [];
  private catalogueSet = new Set<string>();
  private statusByTitle = new Map<string, string>();

  filters = {
    status: {
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Active', value: NovelStatus.Ongoing },
        { label: 'Completed', value: NovelStatus.Completed },
        { label: 'Stalled', value: NovelStatus.OnHiatus },
        { label: 'Inactive', value: NovelStatus.Inactive },
      ],
      type: FilterTypes.Picker,
    },
    order: {
      label: 'Order',
      value: 'asc',
      options: [
        { label: 'A → Z', value: 'asc' },
        { label: 'Z → A', value: 'desc' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  /* ------------------------------------------------------------------ */
  /* API plumbing                                                        */
  /* ------------------------------------------------------------------ */

  private async query(params: Record<string, string>): Promise<MWResponse> {
    const search = new URLSearchParams({
      format: 'json',
      formatversion: '2',
      ...params,
    });

    const response = await fetchApi(`${this.apiUrl}?${search.toString()}`);
    if (!response.ok) {
      throw new Error(
        `Baka-Tsuki returned ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as MWResponse;
    if (json.error) {
      throw new Error(`Baka-Tsuki API error: ${json.error.info}`);
    }
    return json;
  }

  /** Page titles use underscores in URLs but spaces in the API. */
  private toTitle = (path: string) => path.replace(/_/g, ' ').trim();
  private toPath = (title: string) => title.replace(/ /g, '_');

  private async categoryMembers(category: string): Promise<string[]> {
    const titles: string[] = [];
    let cmcontinue: string | undefined;

    do {
      const json: MWResponse = await this.query({
        action: 'query',
        list: 'categorymembers',
        cmtitle: `Category:${category}`,
        cmnamespace: '0',
        cmtype: 'page',
        cmlimit: '500',
        ...(cmcontinue ? { cmcontinue } : {}),
      });

      for (const member of json.query?.categorymembers ?? []) {
        titles.push(member.title);
      }
      cmcontinue = json.continue?.cmcontinue;
    } while (cmcontinue);

    return titles;
  }

  /* ------------------------------------------------------------------ */
  /* Catalogue                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * The catalogue is the wiki's English light novel category, taken as-is.
   * Status categories are read alongside it purely to populate the status map.
   * Cached for the session — six requests to build.
   */
  private async getCatalogue(): Promise<string[]> {
    if (this.cataloguePromise) return this.cataloguePromise;

    this.cataloguePromise = (async () => {
      const titles = new Set<string>();

      for (const title of await this.categoryMembers(this.catalogueCategory)) {
        if (!this.subPagePattern.test(title)) titles.add(title);
      }

      for (const [category, status] of Object.entries(this.statusCategories)) {
        for (const title of await this.categoryMembers(category)) {
          if (!this.statusByTitle.has(title)) {
            this.statusByTitle.set(title, status);
          }
        }
      }

      this.catalogue = Array.from(titles).sort((a, b) => a.localeCompare(b));
      this.catalogueSet = new Set(this.catalogue);
      return this.catalogue;
    })();

    try {
      return await this.cataloguePromise;
    } catch (error) {
      this.cataloguePromise = null; // allow a retry after a transient failure
      throw error;
    }
  }

  /** Attaches cover thumbnails to a slice of titles. `titles` accepts 50/request. */
  private async withCovers(titles: string[]): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = titles.map(title => ({
      name: title,
      path: this.toPath(title),
      cover: defaultCover,
    }));

    for (let i = 0; i < titles.length; i += 50) {
      const batch = titles.slice(i, i + 50);
      try {
        const json = await this.query({
          action: 'query',
          titles: batch.join('|'),
          prop: 'pageimages',
          piprop: 'thumbnail',
          pithumbsize: '300',
          pilimit: '50',
        });

        const covers = new Map<string, string>();
        for (const page of json.query?.pages ?? []) {
          if (page.thumbnail?.source)
            covers.set(page.title, page.thumbnail.source);
        }
        for (const novel of novels) {
          const cover = covers.get(novel.name);
          if (cover) novel.cover = cover;
        }
      } catch {
        // Covers are cosmetic — a failed batch keeps the placeholder.
      }
    }

    return novels;
  }

  /* ------------------------------------------------------------------ */
  /* Browse                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * "Latest" maps to recently edited pages. Chapter edits are rolled up to
   * their parent project, which is what actually signals a new release.
   */
  private async latestTitles(): Promise<string[]> {
    const catalogue = await this.getCatalogue();
    const json = await this.query({
      action: 'query',
      list: 'recentchanges',
      rcnamespace: '0',
      rclimit: '500',
      rctype: 'edit|new',
      rcprop: 'title',
    });

    const seen = new Set<string>();
    const ordered: string[] = [];

    for (const change of json.query?.recentchanges ?? []) {
      const parent = change.title.split(':')[0].trim();
      const project = this.catalogueSet.has(change.title)
        ? change.title
        : this.catalogueSet.has(parent)
          ? parent
          : null;

      if (project && !seen.has(project)) {
        seen.add(project);
        ordered.push(project);
      }
    }

    // Pad with the catalogue so the list never dead-ends on a quiet wiki.
    for (const title of catalogue) {
      if (!seen.has(title)) {
        seen.add(title);
        ordered.push(title);
      }
    }

    return ordered;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let titles = showLatestNovels
      ? await this.latestTitles()
      : [...(await this.getCatalogue())];

    const status = filters?.status?.value;
    if (status) {
      titles = titles.filter(title => this.statusByTitle.get(title) === status);
    }

    // Recency order is the point of the "latest" feed, so don't re-sort it.
    if (!showLatestNovels && filters?.order?.value === 'desc') {
      titles.reverse();
    }

    const start = (pageNo - 1) * this.pageSize;
    if (start >= titles.length) return [];

    return this.withCovers(titles.slice(start, start + this.pageSize));
  }

  /* ------------------------------------------------------------------ */
  /* Search                                                              */
  /* ------------------------------------------------------------------ */

  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /**
   * Title-first relevance, so partial and out-of-order queries behave the way a
   * reader expects. The wiki's own full-text search ranks any page mentioning
   * the words, which buries the project page under its own chapters.
   */
  private score(title: string, term: string): number {
    const a = this.normalize(title);
    const b = this.normalize(term);
    if (!a || !b) return 0;

    if (a === b) return 1000;
    if (a.startsWith(b)) return 900 - Math.min(a.length - b.length, 99);
    if (a.includes(b)) return 800 - Math.min(a.length - b.length, 99);

    const queryTokens = b.split(' ').filter(Boolean);
    const titleTokens = a.split(' ').filter(Boolean);
    const matched = queryTokens.filter(token =>
      titleTokens.some(candidate => candidate.startsWith(token)),
    ).length;

    if (matched === queryTokens.length) return 700 - Math.min(a.length, 99);
    if (matched > 0) return Math.round((matched / queryTokens.length) * 500);
    return 0;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (!term) return [];

    const catalogue = await this.getCatalogue().catch(() => [] as string[]);

    // Deeper pages fall through to the wiki's full-text search, since the local
    // ranked matches are exhausted by page one.
    if (pageNo > 1) {
      const json = await this.query({
        action: 'query',
        list: 'search',
        srsearch: term,
        srnamespace: '0',
        srlimit: String(this.pageSize),
        sroffset: String((pageNo - 1) * this.pageSize),
      });

      const titles = (json.query?.search ?? [])
        .map(result => result.title)
        .filter(title => this.isNovelTitle(title));

      return this.withCovers(await this.dropEmptyProjects(titles));
    }

    const scored = new Map<string, number>();

    for (const title of catalogue) {
      const score = this.score(title, term);
      if (score > 0) scored.set(title, score);
    }

    // Network passes add anything the catalogue missed, at a lower base score.
    const [prefix, fullText] = await Promise.all([
      this.query({
        action: 'query',
        list: 'prefixsearch',
        pssearch: term,
        psnamespace: '0',
        pslimit: '50',
      }).catch(() => ({}) as MWResponse),
      this.query({
        action: 'query',
        list: 'search',
        srsearch: term,
        srnamespace: '0',
        srlimit: '50',
      }).catch(() => ({}) as MWResponse),
    ]);

    const remote = [
      ...(prefix.query?.prefixsearch ?? []).map(r => r.title),
      ...(fullText.query?.search ?? []).map(r => r.title),
    ];

    for (const title of remote) {
      if (!this.isNovelTitle(title) || scored.has(title)) continue;
      const score = this.score(title, term);
      if (score > 0) scored.set(title, score - 50);
    }

    const ranked = Array.from(scored.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, this.pageSize)
      .map(([title]) => title);

    return this.withCovers(await this.dropEmptyProjects(ranked));
  }

  /**
   * Chapter pages share namespace 0 with project pages. Catalogue membership is
   * the reliable test; the structural pattern is the fallback so uncategorised
   * projects stay findable.
   */
  /**
   * A handful of catalogue entries are project pages with no chapters behind
   * them, which are noise in search results. Verified with one cheap existence
   * probe, and only for titles already on the suspicion list — so a typical
   * search costs no extra requests.
   */
  private async hasReadableContent(title: string): Promise<boolean> {
    // The short form is a superset: sub-pages of the full title begin with it
    // too, and it also covers projects filed under a shortened prefix.
    const prefix = `${title.split(':')[0].trim()}:`;

    try {
      const json = await this.query({
        action: 'query',
        list: 'allpages',
        apprefix: prefix,
        apnamespace: '0',
        aplimit: '1',
      });
      const hasContent = (json.query?.allpages?.length ?? 0) > 0;
      this.contentCache.set(title, hasContent);
      return hasContent;
    } catch {
      return true; // Never hide a novel because a probe failed.
    }
  }

  /**
   * A catalogue entry not on the suspicion list is known-good and costs nothing.
   * Everything else gets probed: suspicion-list entries so a revived project
   * un-hides itself, and non-catalogue hits because their provenance is unknown
   * — that is how the redirect "Vamp" → "Vamp!" and stray help pages get caught.
   */
  private async dropEmptyProjects(titles: string[]): Promise<string[]> {
    const probeBudget = 12;
    let probes = 0;

    const verdicts = await Promise.all(
      titles.map(title => {
        if (this.catalogueSet.has(title) && !this.possiblyEmpty.has(title)) {
          return true;
        }
        const cached = this.contentCache.get(title);
        if (cached !== undefined) return cached;
        // Bounded so an odd query can't fan out into dozens of requests.
        if (probes >= probeBudget) return true;
        probes++;
        return this.hasReadableContent(title);
      }),
    );

    return titles.filter((_, index) => verdicts[index]);
  }

  private isNovelTitle(title: string) {
    if (this.catalogueSet.has(title)) return true;
    // Outside the catalogue, any colon is treated as a sub-page marker.
    // Enumerating chapter words per language does not scale — the wiki hosts
    // "…:Tome 1 Chapitre 1", ":Tom 1 Rozdział 2", ":Tập 2", ":Act 1". Real
    // colon-bearing projects are already covered by the catalogue check above.
    if (title.includes(':')) return false;
    // Translation siblings are parenthesised ("Fate/Zero (Biełaruś)",
    // "Absolute Duo (Swedish)"). Rejecting the bracket outright beats naming
    // every language; catalogue members are already exempt.
    if (/\([^)]+\)\s*$/.test(title)) return false;
    return (
      !this.subPagePattern.test(title) && !this.nonEnglishPattern.test(title)
    );
  }

  /* ------------------------------------------------------------------ */
  /* Novel                                                               */
  /* ------------------------------------------------------------------ */

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const requestedTitle = this.toTitle(novelPath);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: requestedTitle,
      cover: defaultCover,
      chapters: [],
    };

    const metaJson = await this.query({
      action: 'query',
      titles: requestedTitle,
      prop: 'extracts|pageimages|categories',
      explaintext: '1',
      exsectionformat: 'raw',
      piprop: 'thumbnail',
      pithumbsize: '400',
      cllimit: 'max',
      clshow: '!hidden',
      redirects: '1',
    });

    const page = metaJson.query?.pages?.[0];
    if (!page || page.missing) {
      novel.summary = 'This project is not available on Baka-Tsuki.';
      return novel;
    }

    novel.name = page.title;
    if (page.thumbnail?.source) novel.cover = page.thumbnail.source;

    const summary = this.extractSummary(page.extract);
    if (summary) novel.summary = summary;

    const categories = (page.categories ?? []).map(category => category.title);

    const genres = categories
      .map(category => category.match(this.genrePattern)?.[1]?.trim())
      .filter((genre): genre is string => Boolean(genre));
    if (genres.length) novel.genres = genres.join(',');

    novel.status = this.resolveStatus(categories, page.title);

    const author = this.resolveAuthor(categories);
    if (author) novel.author = author;

    novel.chapters = await this.parseChapterList(page.title);
    return novel;
  }

  /**
   * Project pages open with wiki housekeeping — a registration prompt, project
   * status, translation notices — so the lead section is rarely the synopsis.
   * Prefer an explicitly titled synopsis section and fall back to the first
   * paragraph that isn't boilerplate.
   */
  private extractSummary(extract?: string): string | undefined {
    if (!extract) return undefined;

    const boilerplate =
      /^(?:only available to registered users|register here|please read|this project|the project|as of |note:|warning:|attention|status:|translation|editing|recruit)|available in the following languages|this project has been|has been (?:restored|licensed|removed|discontinued|taken down)|do you (?:follow|want)/i;

    const sections = extract.split(/^\s*=+\s*(.+?)\s*=+\s*$/m);
    // split() yields [lead, heading, body, heading, body, ...]
    for (let i = 1; i < sections.length; i += 2) {
      if (!/synopsis|summary|story|plot|description|about/i.test(sections[i])) {
        continue;
      }
      const body = this.cleanParagraphs(sections[i + 1], boilerplate);
      if (body) return body;
    }

    return this.cleanParagraphs(sections[0], boilerplate);
  }

  private cleanParagraphs(
    text: string | undefined,
    boilerplate: RegExp,
  ): string | undefined {
    if (!text) return undefined;

    const kept = text
      .split(/\n+/)
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line.length > 40 && !boilerplate.test(line));

    if (!kept.length) return undefined;

    const summary = kept.join('\n\n');
    return summary.length > 1500 ? `${summary.slice(0, 1497)}...` : summary;
  }

  private resolveStatus(categories: string[], title: string): string {
    for (const category of categories) {
      const name = category.replace(/^Category:/, '');
      const status = this.statusCategories[name];
      if (status) return status;
    }
    return this.statusByTitle.get(title) ?? NovelStatus.Unknown;
  }

  /**
   * Baka-Tsuki files projects under a category named after the author, mixed in
   * with publisher imprints and structural tags. An omitted author is correct;
   * a guessed one is not, so anything that doesn't look like a personal name is
   * discarded.
   */
  private resolveAuthor(categories: string[]): string | undefined {
    for (const category of categories) {
      const name = category.replace(/^Category:/, '').trim();
      if (this.genrePattern.test(category)) continue;
      if (this.nonAuthorCategoryPattern.test(name)) continue;
      if (/\d/.test(name)) continue;
      if (name.split(/\s+/).length < 2) continue;
      return name;
    }
    return undefined;
  }

  /* ------------------------------------------------------------------ */
  /* Chapter list                                                        */
  /* ------------------------------------------------------------------ */

  private async parseChapterList(
    novelTitle: string,
  ): Promise<Plugin.ChapterItem[]> {
    const json = await this.query({
      action: 'parse',
      page: novelTitle,
      prop: 'text',
      disableeditsection: '1',
      disabletoc: '1',
      redirects: '1',
    }).catch(() => ({}) as MWResponse);

    const html = json.parse?.text;
    if (!html) return [];

    const $ = parseHTML(html);

    // A project's chapters are not always filed under its full page title:
    // "Anohana: The Flower We Saw That Day" keeps its chapters at
    // "Anohana:Part 1 Chapter 1". Accept the short form as well.
    const fullTitle = novelTitle.replace(/_/g, ' ');
    const prefixes = [`${fullTitle}:`];
    const shortTitle = fullTitle.split(':')[0].trim();
    if (shortTitle && shortTitle !== fullTitle) prefixes.push(`${shortTitle}:`);

    const seen = new Set<string>();

    type Candidate = {
      title: string;
      name: string;
      volume: string;
      isFullText: boolean;
    };
    const candidates: Candidate[] = [];

    // Document order is what preserves reading order — the API's allpages list
    // is alphabetical, which puts Chapter 10 before Chapter 2.
    $('a[href]').each((_, element) => {
      const anchor = $(element);

      const classes = (anchor.attr('class') ?? '').split(/\s+/);
      if (classes.includes('new') || classes.includes('external')) return;

      const href = anchor.attr('href') ?? '';
      if (/^(?:https?:)?\/\//.test(href)) return;
      if (/\.(?:pdf|epub|mobi|zip|rar|7z|docx?)$/i.test(href)) return;
      if (/[?&]action=edit/.test(href)) return;

      const rawTitle = anchor.attr('title')?.trim();
      if (!rawTitle || /\(page does not exist\)$/i.test(rawTitle)) return;

      const title = rawTitle.replace(/_/g, ' ');
      const prefix = prefixes.find(candidate => title.startsWith(candidate));
      if (!prefix) return;
      if (
        /^(?:File|Image|Category|Template|Help|User|Talk|Special):/i.test(title)
      ) {
        return;
      }

      const label = anchor.text().replace(/\s+/g, ' ').trim();
      const suffix = title.slice(prefix.length).trim();

      // Project scaffolding lives under the same prefix as the chapters.
      if (this.nonChapterPattern.test(suffix)) return;

      const path = this.toPath(title);
      if (seen.has(path)) return;
      seen.add(path);

      candidates.push({
        title,
        name: label || suffix,
        volume: suffix.match(/(?:Volume|Vol\.?)[\s_]*(\d+)/i)?.[1] ?? '',
        // The whole-volume page is often titled "…:Volume 1" and only the link
        // text says "Full Text", so both have to be checked.
        isFullText:
          /Full[\s_]*Text/i.test(suffix) || /^Full[\s_]*Text$/i.test(label),
      });
    });

    // A volume's "Full Text" page duplicates its chapters. Keep it only where
    // there is nothing else to read for that volume.
    const chaptersPerVolume = new Map<string, number>();
    for (const candidate of candidates) {
      if (!candidate.isFullText) {
        chaptersPerVolume.set(
          candidate.volume,
          (chaptersPerVolume.get(candidate.volume) ?? 0) + 1,
        );
      }
    }

    const kept = candidates.filter(
      candidate =>
        !candidate.isFullText || !chaptersPerVolume.get(candidate.volume),
    );

    // Volumes ascending, then everything ungrouped last, so the list reads
    // Volume 1 → 2 → 3 → Other. Document order is preserved within each group.
    const chapters: Plugin.ChapterItem[] = kept
      .map((candidate, index) => ({ candidate, index }))
      .sort((a, b) => {
        const left = a.candidate.volume ? Number(a.candidate.volume) : Infinity;
        const right = b.candidate.volume
          ? Number(b.candidate.volume)
          : Infinity;
        return left === right ? a.index - b.index : left - right;
      })
      .map(({ candidate }, index) => ({
        name: candidate.name,
        path: this.toPath(candidate.title),
        chapterNumber: index + 1,
        page: candidate.volume ? `Volume ${candidate.volume}` : 'Other',
      }));

    await this.attachReleaseTimes(chapters);
    return chapters;
  }

  /**
   * Last-edit timestamps, batched 50 per request and capped — Baka-Tsuki is a
   * small community server and a long project would otherwise fan out into
   * dozens of calls. Best-effort: failures leave the field unset.
   */
  private async attachReleaseTimes(chapters: Plugin.ChapterItem[]) {
    const maxBatches = 4;
    const byTitle = new Map(
      chapters.map(chapter => [this.toTitle(chapter.path), chapter]),
    );
    const titles = Array.from(byTitle.keys()).slice(0, maxBatches * 50);

    for (let i = 0; i < titles.length; i += 50) {
      const batch = titles.slice(i, i + 50);
      try {
        const json = await this.query({
          action: 'query',
          titles: batch.join('|'),
          prop: 'revisions',
          rvprop: 'timestamp',
        });

        for (const page of json.query?.pages ?? []) {
          const timestamp = page.revisions?.[0]?.timestamp;
          const chapter = byTitle.get(page.title);
          if (timestamp && chapter) {
            chapter.releaseTime = timestamp.slice(0, 10);
          }
        }
      } catch {
        return;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Chapter                                                             */
  /* ------------------------------------------------------------------ */

  async parseChapter(chapterPath: string): Promise<string> {
    // A deleted or renamed page is an API error, not an empty body.
    const json = await this.query({
      action: 'parse',
      page: this.toTitle(chapterPath),
      prop: 'text',
      disableeditsection: '1',
      disabletoc: '1',
      redirects: '1',
    }).catch(() => ({}) as MWResponse);

    const html = json.parse?.text;
    if (!html) return '<p>This chapter is not available on Baka-Tsuki.</p>';

    const $ = parseHTML(html);

    $(
      '.mw-editsection, #toc, .toc, .navbox, .printfooter, .catlinks, ' +
        '.mw-jump-link, .noprint, #siteSub, .mw-empty-elt, #contentSub, ' +
        '.mw-references-wrap ~ .navbox, script, style',
    ).remove();

    // Chapter navigation sits in a table at the top and bottom of most pages,
    // but not reliably in the same position — match on content instead.
    $('table').each((_, element) => {
      const table = $(element);
      if (/Back to|Return to|Forward to|Main Page/i.test(table.text())) {
        table.remove();
      }
    });

    const origin = new URL(this.site).origin;
    const absolute = (value: string) =>
      value.startsWith('//')
        ? `https:${value}`
        : value.startsWith('/')
          ? origin + value
          : value;

    $('img[src]').each((_, element) => {
      const img = $(element);
      img.attr('src', absolute(img.attr('src') ?? ''));
      img.removeAttr('srcset');
    });

    $('a[href]').each((_, element) => {
      const anchor = $(element);
      anchor.attr('href', absolute(anchor.attr('href') ?? ''));
    });

    const content = $.html().trim();
    return content || '<p>This chapter appears to be empty.</p>';
  }

  resolveUrl = (path: string) =>
    `${this.site}index.php?title=${encodeURIComponent(this.toTitle(path))}`;
}

export default new BakaTsuki();
