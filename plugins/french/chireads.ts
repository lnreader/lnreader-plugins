import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

class ChireadsPlugin implements Plugin.PluginBase {
  id = 'chireads';
  name = 'Chireads';
  icon = 'src/fr/chireads/icon.png';
  site = 'https://chireads.com';
  version = '2.0.0';

  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url, {
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'deflate',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      },
    });
    const body = await r.text();
    return load(body);
  }

  private toPath(url?: string): string {
    if (!url) return '';
    return url.replace(this.site, '');
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
        cover:
          $(el).find('.refresh-card-cover img').attr('src') || defaultCover,
        path: this.toPath(novelUrl),
      });
    });
    return novels;
  }

  private parseSearchResults($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    $('.news-list li').each((i, el) => {
      const novelUrl =
        $(el).find('.news-list-tit a').attr('href') ||
        $(el).find('.news-list-img a').attr('href');
      if (!novelUrl || seen.has(novelUrl)) return;
      seen.add(novelUrl);
      novels.push({
        name: $(el).find('.news-list-tit a').text().trim(),
        cover: $(el).find('.news-list-img img').attr('src') || defaultCover,
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
      return novels;
    }

    const tag = filters?.tag?.value;
    const isAll = typeof tag !== 'string' || tag === '' || tag === 'all';
    const bases = isAll
      ? ['/category/translatedtales', '/category/original']
      : [`/tag/${tag}`];

    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    for (const base of bases) {
      const $ = await this.getCheerio(`${this.site}${base}/page/${pageNo}`);
      for (const novel of this.parseCards($)) {
        if (seen.has(novel.path)) continue;
        seen.add(novel.path);
        novels.push(novel);
      }
    }
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = { path: novelPath, name: '' };

    const $ = await this.getCheerio(this.site + novelPath);

    novel.name = $('h1.refresh-detail-title').first().text().trim();
    novel.cover =
      $('.refresh-detail-cover img').attr('src') ||
      $('.refresh-detail-cover img').attr('data-src') ||
      defaultCover;
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

    const chapters: Plugin.ChapterItem[] = [];
    $('.refresh-detail-chapter-list a').each((i, el) => {
      const chapterUrl = $(el).attr('href');
      if (!chapterUrl) return;
      const dateMatch = chapterUrl.match(/\/(\d{4})\/(\d{2})\/(\d{2})\/?$/);
      chapters.push({
        name: $(el).text().trim(),
        releaseTime: dateMatch
          ? dayjs(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`).format(
              'LL',
            )
          : null,
        path: this.toPath(chapterUrl),
      });
    });

    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterUrl: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterUrl);

    const chapterText = $('#content').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];

    const $ = await this.getCheerio(
      `${this.site}/?s=${encodeURIComponent(searchTerm)}`,
    );

    const cards = this.parseCards($);
    if (cards.length) return cards;

    return this.parseSearchResults($);
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
