import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type WordPressCategory = {
  name: string;
  link: string;
};

class ChireadsPlugin implements Plugin.PluginBase {
  id = 'chireads';
  name = 'Chireads';
  icon = 'src/fr/chireads/icon.png';
  site = 'https://chireads.com';
  version = '2.3.4';

  // The site is fronted by Cloudflare, which serves different HTML/JSON to a
  // plain device User-Agent (the mobile app injects its own UA via fetchApi)
  // than to a desktop browser. Send the same desktop Chrome UA on every
  // request — HTML pages and the wp-json REST endpoints alike — so a novel's
  // chapter list survives on the app.
  private readonly browserHeaders = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  };

  private readonly restHeaders = {
    Accept: 'application/json, */*;q=0.8',
    'User-Agent': this.browserHeaders['User-Agent'],
  };

  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url, { headers: this.browserHeaders });
    if (!r.ok) throw new Error(`HTTP ${r.status} while loading ${url}`);
    const body = await r.text();
    return load(body);
  }

  private absoluteUrl(url?: string): string {
    if (!url) return defaultCover;
    try {
      const absolute = new URL(url, this.site);
      return /^https?:$/.test(absolute.protocol) ? absolute.href : defaultCover;
    } catch {
      return defaultCover;
    }
  }

  private toPath(url?: string): string {
    if (!url) return '';
    const parsed = new URL(url, this.site);
    if (!/(?:^|\.)chireads\.com$/i.test(parsed.hostname)) return '';
    return `${parsed.pathname}${parsed.search}`;
  }

  private compactChapterPath(url?: string): string {
    if (!url) return '';
    const parsed = new URL(url, this.site);
    if (!/(?:^|\.)chireads\.com$/i.test(parsed.hostname)) return '';
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments[0] === 'c' && segments[1]) return `/c/${segments[1]}/`;

    const last = (offset: number) => segments[segments.length - offset];
    const hasDateSuffix =
      /^\d{4}$/.test(last(3) || '') &&
      /^\d{1,2}$/.test(last(2) || '') &&
      /^\d{1,2}$/.test(last(1) || '');
    const chapterSlug = last(hasDateSuffix ? 4 : 1);
    return chapterSlug ? `/c/${chapterSlug}/` : '';
  }

  private parseCards($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    $('ul.refresh-card-grid li.refresh-card').each((i, el) => {
      const novelUrl = $(el).find('.refresh-card-title a').attr('href');
      if (!novelUrl || seen.has(novelUrl)) return;
      seen.add(novelUrl);
      novels.push({
        name: $(el).find('.refresh-card-title a').text().trim(),
        cover: this.absoluteUrl(
          $(el).find('.refresh-card-cover img').attr('src'),
        ),
        path: this.toPath(novelUrl),
      });
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    if (showLatestNovels) {
      if (pageNo !== 1) return [];
      const $ = await this.getCheerio(this.site);
      const novels: Plugin.NovelItem[] = [];
      const seen = new Set<string>();
      $('.dernieres-tabel tbody tr').each((i, el) => {
        const novelUrl = $(el).find('td').first().find('a').attr('href');
        if (!novelUrl || seen.has(novelUrl)) return;
        seen.add(novelUrl);
        novels.push({
          name: $(el)
            .find('td')
            .first()
            .find('a')
            .text()
            .trim()
            .replace(/^\[[TO]\]\s*/, ''),
          cover: defaultCover,
          path: this.toPath(novelUrl),
        });
      });

      // The homepage "latest" table carries no cover images, only links to
      // each novel's page. Resolve covers from the detail pages so the list
      // shows a real cover instead of the "not available" placeholder.
      const covers = await Promise.allSettled(
        novels.map(async novel => {
          const page = await this.getCheerio(this.site + novel.path);
          const cover =
            page('.refresh-detail-cover img').attr('src') ||
            page('.refresh-detail-cover img').attr('data-src');
          return cover ? this.absoluteUrl(cover) : defaultCover;
        }),
      );
      return novels.map((novel, index) => ({
        ...novel,
        cover:
          covers[index]?.status === 'fulfilled'
            ? covers[index].value
            : defaultCover,
      }));
    }

    const tag = filters?.tag?.value;
    const isAll = typeof tag !== 'string' || tag === '' || tag === 'all';
    const bases = isAll
      ? ['/category/translatedtales', '/category/original']
      : [`/tag/${tag}`];

    const catalogues = isAll
      ? await Promise.allSettled(
          bases.map(base =>
            this.getCheerio(`${this.site}${base}/page/${pageNo}`),
          ),
        )
      : [
          {
            status: 'fulfilled' as const,
            value: await this.getCheerio(
              `${this.site}${bases[0]}/page/${pageNo}`,
            ),
          },
        ];
    if (
      isAll &&
      catalogues.every(catalogue => catalogue.status === 'rejected')
    ) {
      throw new Error('All catalogue pages failed');
    }

    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    for (const catalogue of catalogues) {
      if (catalogue.status !== 'fulfilled') continue;
      const $ = catalogue.value;
      for (const novel of this.parseCards($)) {
        if (seen.has(novel.path)) continue;
        seen.add(novel.path);
        novels.push(novel);
      }
    }
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: this.toPath(novelPath),
      name: '',
    };

    const $ = await this.getCheerio(this.site + novel.path);

    novel.name = $('h1.refresh-detail-title').first().text().trim();
    novel.cover = this.absoluteUrl(
      $('.refresh-detail-cover img').attr('src') ||
        $('.refresh-detail-cover img').attr('data-src'),
    );
    novel.summary = $('.refresh-detail-summary-content').text().trim();

    $('.refresh-detail-meta > div').each((i, el) => {
      const label = $(el).find('dt').text().trim();
      const value = $(el).find('dd').text().trim();
      if (label.includes('Auteur')) novel.author = value;
      else if (label.includes('Statut')) {
        const status = value.toLowerCase();
        if (status.includes('en pause') || status.includes('hiatus'))
          novel.status = NovelStatus.OnHiatus;
        else if (status.includes('complet') || status.includes('termin'))
          novel.status = NovelStatus.Completed;
        else novel.status = NovelStatus.Ongoing;
      }
    });

    const chapters = new Map<string, Plugin.ChapterItem>();
    $('.refresh-detail-chapter-list a').each((i, el) => {
      const chapterUrl = $(el).attr('href');
      const path = this.compactChapterPath(chapterUrl);
      if (!path || chapters.has(path)) return;

      const title = $(el).text().trim();
      const match = title.match(
        /^Chapitre\s+(\d+(?:[.,]\d+)?)\s*(?:(?:–|-|:)\s*)?(.*)$/i,
      );
      const segments = new URL(chapterUrl!, this.site).pathname
        .split('/')
        .filter(Boolean);
      const date = segments.slice(-3);
      const hasDate =
        /^\d{4}$/.test(date[0] || '') &&
        /^\d{1,2}$/.test(date[1] || '') &&
        /^\d{1,2}$/.test(date[2] || '');

      chapters.set(path, {
        name: match
          ? `${match[1]}${match[2] ? ` - ${match[2].trim()}` : ''}`
          : title,
        path,
        ...(match ? { chapterNumber: Number(match[1].replace(',', '.')) } : {}),
        ...(hasDate
          ? {
              releaseTime: `${date[0]}-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}`,
            }
          : {}),
      });
    });
    novel.chapters = Array.from(chapters.values());

    return novel;
  }

  async parseChapter(chapterUrl: string): Promise<string> {
    const $ = await this.getCheerio(
      this.site + this.compactChapterPath(chapterUrl),
    );

    const content = $('#content').first();
    content
      .find('script, style, iframe, form, nav, footer, .sharedaddy, .ads')
      .remove();
    if (content.text().replace(/\s+/g, ' ').trim().length < 200) {
      throw new Error('Chapter content is not readable');
    }

    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const parents = await Promise.allSettled(
      [2, 811].map(async parent => {
        const response = await fetchApi(
          `${this.site}/wp-json/wp/v2/categories?parent=${parent}&search=${encodeURIComponent(searchTerm)}&per_page=100&page=${pageNo}`,
          { headers: this.restHeaders },
        );
        if (!response.ok) throw new Error(`Search parent ${parent} failed`);
        const categories: unknown = await response.json();
        if (
          !Array.isArray(categories) ||
          !categories.every(
            category =>
              category !== null &&
              typeof category === 'object' &&
              typeof (category as WordPressCategory).name === 'string' &&
              typeof (category as WordPressCategory).link === 'string',
          )
        )
          throw new Error(`Search parent ${parent} returned invalid data`);
        return categories as WordPressCategory[];
      }),
    );
    const categories = parents.flatMap(parent =>
      parent.status === 'fulfilled' ? parent.value : [],
    );
    if (parents.every(parent => parent.status === 'rejected'))
      throw new Error('Chireads search failed for all category parents');

    const seen = new Set<string>();
    return categories
      .map(category => ({
        name: category.name,
        cover: defaultCover,
        path: this.toPath(category.link),
      }))
      .filter(
        novel =>
          (novel.path.startsWith('/category/translatedtales/') ||
            novel.path.startsWith('/category/original/')) &&
          !seen.has(novel.path) &&
          Boolean(seen.add(novel.path)),
      );
  }

  filters = {
    tag: {
      type: FilterTypes.Picker,
      label: 'Tag',
      value: 'all',
      options: [
        { label: 'Tous', value: 'all' },
        { label: 'Arts martiaux', value: 'arts-martiaux' },
        { label: 'De faible à fort', value: 'de-faible-a-fort' },
        { label: 'Adapté en manhua', value: 'adapte-en-manhua' },
        { label: 'Cultivation', value: 'cultivation' },
        { label: 'Action', value: 'action' },
        { label: 'Aventure', value: 'aventure' },
        { label: 'Monstres', value: 'monstres' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Fantastique', value: 'fantastique' },
        { label: 'Adapté en Animé', value: 'adapte-en-anime' },
        { label: 'Alchimie', value: 'alchimie' },
        { label: 'Éléments de jeux', value: 'elements-de-jeux' },
        { label: 'Calme Protagoniste', value: 'calme-protagoniste' },
        {
          label: 'Protagoniste intelligent',
          value: 'protagoniste-intelligent',
        },
        { label: 'Polygamie', value: 'polygamie' },
        { label: 'Belle femelle Lea', value: 'belle-femelle-lea' },
        { label: 'Personnages arrogants', value: 'personnages-arrogants' },
        { label: 'Système de niveau', value: 'systeme-de-niveau' },
        { label: 'Cheat', value: 'cheat' },
        { label: 'Protagoniste génie', value: 'protagoniste-genie' },
        { label: 'Comédie', value: 'comedie' },
        { label: 'Gamer', value: 'gamer' },
        { label: 'Mariage', value: 'mariage' },
        { label: 'seeking Protag', value: 'seeking-protag' },
        { label: 'Romance précoce', value: 'romance-precoce' },
        { label: 'Croissance accélérée', value: 'croissance-acceleree' },
        { label: 'Artefacts', value: 'artefacts' },
        {
          label: 'Intelligence artificielle',
          value: 'intelligence-artificielle',
        },
        { label: 'Mariage arrangé', value: 'mariage-arrange' },
        { label: 'Mature', value: 'mature' },
        { label: 'Adulte', value: 'adulte' },
        {
          label: 'Administrateur de système',
          value: 'administrateur-de-systeme',
        },
        { label: 'Beau protagoniste', value: 'beau-protagoniste' },
        {
          label: 'Protagoniste charismatique',
          value: 'protagoniste-charismatique',
        },
        { label: 'Protagoniste masculin', value: 'protagoniste-masculin' },
        { label: 'Démons', value: 'demons' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Académie', value: 'academie' },
        {
          label: 'Cacher les vraies capacités',
          value: 'cacher-les-vraies-capacites',
        },
        {
          label: 'Protagoniste surpuissant',
          value: 'protagoniste-surpuissant',
        },
        { label: 'Joueur', value: 'joueur' },
        {
          label: 'Protagoniste fort dès le départ',
          value: 'protagoniste-fort-des-le-depart',
        },
        { label: 'Immortels', value: 'immortels' },
        { label: 'Cultivation rapide', value: 'cultivation-rapide' },
        { label: 'Harem', value: 'harem' },
        { label: 'Assasins', value: 'assasins' },
        { label: 'De pauvre à riche', value: 'de-pauvre-a-riche' },
        {
          label: 'Système de classement de jeux',
          value: 'systeme-de-classement-de-jeux',
        },
        { label: 'Capacités spéciales', value: 'capacites-speciales' },
        { label: 'Vengeance', value: 'vengeance' },
      ],
    },
  } satisfies Filters;
}

export default new ChireadsPlugin();
