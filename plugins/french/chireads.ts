import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import dayjs from 'dayjs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type CardSelectors = {
  item: string;
  titleLink: string;
  cover: string;
};

// Grille de cartes des pages catégorie / tag
const GRID_CARD: CardSelectors = {
  item: '.refresh-card',
  titleLink: '.refresh-card-title a',
  cover: '.refresh-card-cover img',
};

// Section « Populaire » de la page d'accueil
const POPULAR_CARD: CardSelectors = {
  item: '.recommended-list li',
  titleLink: '.recommended-list-txt a',
  cover: '.recommended-list-img img',
};

class ChireadsPlugin implements Plugin.PluginBase {
  id = 'chireads';
  name = 'Chireads';
  icon = 'src/fr/chireads/icon.png';
  site = 'https://chireads.com';
  version = '1.0.3';

  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url, {
      headers: { 'Accept-Encoding': 'deflate' },
    });
    const body = await r.text();
    const $ = load(body);
    return $;
  }

  parseCards($: CheerioAPI, selectors: CardSelectors): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    $(selectors.item).each((i, elem) => {
      const link = $(elem).find(selectors.titleLink);
      const novelName = link.text().trim();
      const novelUrl = link.attr('href');
      const novelCover = $(elem).find(selectors.cover).attr('src');

      if (novelUrl) {
        novels.push({
          name: novelName,
          cover: novelCover || defaultCover,
          path: novelUrl.replace(this.site, ''),
        });
      }
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const tag =
      filters && typeof filters.tag.value === 'string'
        ? filters.tag.value
        : 'all';

    if (showLatestNovels) {
      // Les deux catégories sont indépendantes : on les récupère en parallèle.
      const [$trad, $orig] = await Promise.all([
        this.getCheerio(this.site + '/category/translatedtales/page/' + pageNo),
        this.getCheerio(this.site + '/category/original/page/' + pageNo),
      ]);
      return [
        ...this.parseCards($trad, GRID_CARD),
        ...this.parseCards($orig, GRID_CARD),
      ];
    } else if (tag !== 'all') {
      const $ = await this.getCheerio(
        this.site + '/tag/' + tag + '/page/' + pageNo,
      );
      return this.parseCards($, GRID_CARD);
    }

    // Page d'accueil : section « Populaire » (une seule page)
    if (pageNo > 1) return [];
    const $ = await this.getCheerio(this.site);
    return this.parseCards($, POPULAR_CARD);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = { path: novelPath, name: 'Sans titre' };

    const $ = await this.getCheerio(this.site + novelPath);

    novel.name =
      $('.refresh-detail-title').first().text().trim() || 'Sans titre';
    novel.cover = $('.refresh-detail-cover img').attr('src') || defaultCover;
    novel.summary = $('.refresh-detail-summary-content').text().trim();

    // Métadonnées : liste de définitions <dt>Libellé</dt><dd>Valeur</dd>
    let auteur = '';
    let fantrad = '';
    let statut = '';
    $('.refresh-detail-meta > div').each((i, elem) => {
      const label = $(elem).find('dt').text().trim().toLowerCase();
      const value = $(elem).find('dd').text().trim();
      if (label.includes('auteur')) auteur = value;
      else if (label.includes('fantrad')) fantrad = value;
      else if (label.includes('statut')) statut = value;
    });
    novel.author = auteur || fantrad || 'Inconnu';

    const statutLower = statut.toLowerCase();
    if (statutLower.includes('pause')) novel.status = NovelStatus.OnHiatus;
    else if (statutLower.includes('complet'))
      novel.status = NovelStatus.Completed;
    else novel.status = NovelStatus.Ongoing;

    const chapters: Plugin.ChapterItem[] = [];

    const chapterList = $('.refresh-detail-chapter-list li a');
    chapterList.each((i, elem) => {
      const chapterName = $(elem).text().trim();
      const chapterUrl = $(elem).attr('href');
      // L'URL se termine par la date de publication : .../AAAA/MM/JJ/
      const releaseDate = dayjs(
        chapterUrl?.match(/(\d{4}\/\d{2}\/\d{2})\/?$/)?.[1],
      ).format('DD MMMM YYYY');

      if (chapterUrl) {
        chapters.push({
          name: chapterName,
          releaseTime: releaseDate,
          path: chapterUrl.replace(this.site, ''),
        });
      }
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
    let novels: Plugin.NovelItem[] = [];

    let i = 1;
    let finised = false;
    while (!finised) {
      await this.popularNovels(i, {
        showLatestNovels: true,
        filters: undefined,
      }).then(res => {
        if (res.length === 0) finised = true;
        novels.push(...res);
      });
      i++;
    }

    novels = novels.filter(novel =>
      novel.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .includes(
          searchTerm
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, ''),
        ),
    );

    return novels;
  }

  filters = {
    tag: {
      type: FilterTypes.Picker,
      label: 'Tag',
      value: 'all',
      // prettier-ignore
      options: [
        { label: 'Tous', value: 'all' },
        { label: 'Académie', value: 'academie' },
        { label: 'Action', value: 'action' },
        { label: 'Adapté en animé', value: 'adapte-en-anime' },
        { label: 'Adapté en manhua', value: 'adapte-en-manhua' },
        { label: 'Administrateur de système', value: 'administrateur-de-systeme' },
        { label: 'Alchimie', value: 'alchimie' },
        { label: 'Artefacts', value: 'artefacts' },
        { label: 'Arts martiaux', value: 'arts-martiaux' },
        { label: 'Assasins', value: 'assasins' },
        { label: 'Aventure', value: 'aventure' },
        { label: 'Beau protagoniste', value: 'beau-protagoniste' },
        { label: 'Belle femelle Lea', value: 'belle-femelle-lea' },
        { label: 'Cacher les vraies capacités', value: 'cacher-les-vraies-capacites' },
        { label: 'Calme protagoniste', value: 'calme-protagoniste' },
        { label: 'Capacités spéciales', value: 'capacites-speciales' },
        { label: 'Cheat', value: 'cheat' },
        { label: 'Comédie', value: 'comedie' },
        { label: 'Cultivation', value: 'cultivation' },
        { label: 'Cultivation rapide', value: 'cultivation-rapide' },
        { label: 'De faible à fort', value: 'de-faible-a-fort' },
        { label: 'De pauvre à riche', value: 'de-pauvre-a-riche' },
        { label: 'Démons', value: 'demons' },
        { label: 'Drame', value: 'drame' },
        { label: 'Éléments de jeux', value: 'elements-de-jeux' },
        { label: 'Fantastique', value: 'fantastique' },
        { label: 'Gamer', value: 'gamer' },
        { label: 'Harem', value: 'harem' },
        { label: 'Immortels', value: 'immortels' },
        { label: 'Intelligence artificielle', value: 'intelligence-artificielle' },
        { label: 'Joueur', value: 'joueur' },
        { label: 'Magie', value: 'magie' },
        { label: 'Mariage', value: 'mariage' },
        { label: 'Mariage arrangé', value: 'mariage-arrange' },
        { label: 'Mature', value: 'mature' },
        { label: 'Monstres', value: 'monstres' },
        { label: 'Personnages arrogants', value: 'personnages-arrogants' },
        { label: 'Polygamie', value: 'polygamie' },
        { label: 'Protagoniste charismatique', value: 'protagoniste-charismatique' },
        { label: 'Protagoniste fort dès le départ', value: 'protagoniste-fort-des-le-depart' },
        { label: 'Protagoniste génie', value: 'protagoniste-genie' },
        { label: 'Protagoniste intelligent', value: 'protagoniste-intelligent' },
        { label: 'Protagoniste masculin', value: 'protagoniste-masculin' },
        { label: 'Protagoniste surpuissant', value: 'protagoniste-surpuissant' },
        { label: 'Réincarnation', value: 'reincarnation' },
        { label: 'Romance précoce', value: 'romance-precoce' },
        { label: 'Seeking Protag', value: 'seeking-protag' },
        { label: 'Système de classement de jeux', value: 'systeme-de-classement-de-jeux' },
        { label: 'Système de niveau', value: 'systeme-de-niveau' },
        { label: 'Vengeance', value: 'vengeance' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
      ],
    },
  } satisfies Filters;
}

export default new ChireadsPlugin();
