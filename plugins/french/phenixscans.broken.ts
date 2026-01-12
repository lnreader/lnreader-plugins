import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

class PhenixScansTradPlugin implements Plugin.PluginBase {
  id = 'phenixscans';
  name = 'PhenixScans';
  icon = 'src/fr/phenixscans/icon.png';
  site = 'https://phenixscans.fr';
  version = '1.0.1';

  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    const body = await r.text();
    const $ = load(body);
    return $;
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    let novel: Plugin.NovelItem;

    let filter = '';
    for (const key in filters) {
      if (typeof filters[key].value === 'object') {
        for (const value of filters[key].value as string[]) {
          filter += `&genre%5B%5D=${value}`;
        }
      }
    }

    const order = showLatestNovels ? 'update' : 'popular';
    const url = `${this.site}/manga/?page=${pageNo}${filter}&status=&type=novel&order=${order}`;

    const $ = await this.getCheerio(url);
    $('div div div div a').each((i, elem) => {
      const novelName = $(elem).attr('title')?.trim();
      const novelUrl = $(elem).attr('href');
      const novelCover = $(elem).find('div img').attr('src') || defaultCover;

      if (novelUrl && novelName) {
        novel = {
          name: novelName,
          cover: novelCover,
          path: novelUrl.replace(this.site, ''),
        };
        novels.push(novel);
      }
    });
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Sans titre',
    };

    const $ = await this.getCheerio(this.site + novelPath);

    novel.name = $('h1[itemprop=name]').text().replace('– Novel', '').trim();
    novel.cover =
      $('div[itemprop=image] img').first().attr('src') || defaultCover;
    novel.author = $('.fmed b:contains(Auteur)+span').text().trim();
    novel.genres = $('.mgen a')
      .map(function () {
        return $(this).text();
      })
      .get()
      .join(', ');
    novel.summary = $('.entry-content[itemprop=description]').text().trim();
    novel.status = this.getStatus(
      $('.tsinfo .imptdt:contains(Statut)').text().replace('Statut', '').trim(),
    );

    const chapters: Plugin.ChapterItem[] = [];
    $('ul li:has(div.chbox):has(div.eph-num)').each((i, elem) => {
      const chapterName = $(elem).find('a .chapternum').text().trim();
      const chapterUrl = $(elem).find('a').attr('href');
      const releaseDate = this.parseDate($(elem).find('a .chapterdate').text());
      if (chapterUrl && chapterUrl.includes(this.site) && chapterName) {
        chapters.push({
          name: chapterName,
          path: chapterUrl.replace(this.site, ''),
          releaseTime: releaseDate,
        });
      }
    });
    novel.chapters = chapters;
    return novel;
  }

  parseDate(date: string): string {
    const monthMapping: Record<string, number> = {
      janvier: 1,
      fevrier: 2,
      mars: 3,
      avril: 4,
      mai: 5,
      juin: 6,
      juillet: 7,
      aout: 8,
      septembre: 9,
      octobre: 10,
      novembre: 11,
      decembre: 12,
    };

    const [day, month, year] = date.split(' ');
    return dayjs(
      `${day} ${monthMapping[month.normalize('NFD').replace(/[\u0300-\u036f]/g, '')]} ${year}`,
      'D MMMM YYYY',
    ).format('DD MMMM YYYY');
  }

  getStatus(status: string) {
    const lowerCaseStatus = status.toLowerCase();
    const ongoing = ['en cours', 'en cours de publication'];
    const onhiatus = ['en pause', 'en attente'];
    const completed = ['complété', 'fini', 'achevé', 'terminé'];
    const cancelled = ['abandonné'];

    if (ongoing.includes(lowerCaseStatus)) {
      return NovelStatus.Ongoing;
    } else if (onhiatus.includes(lowerCaseStatus)) {
      return NovelStatus.OnHiatus;
    } else if (completed.includes(lowerCaseStatus)) {
      return NovelStatus.Completed;
    } else if (cancelled.includes(lowerCaseStatus)) {
      return NovelStatus.Cancelled;
    }
    return NovelStatus.Unknown;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);
    return $('#readerarea').html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];

    const popularNovels = this.popularNovels(1, {
      showLatestNovels: true,
      filters: undefined,
    });

    const novels = (await popularNovels).filter(novel =>
      novel.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .includes(
          searchTerm
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim(),
        ),
    );

    return novels;
  }

  filters = {
    genre: {
      type: FilterTypes.CheckboxGroup,
      label: 'Genre',
      value: [],
      options: [
        { label: 'Action', value: 'action' },
        {
          label: 'Action Adventure Fantaisie Psychologique',
          value: 'action-adventure-fantaisie-psychologique',
        },
        {
          label: 'Action Arts martiaux Aventure Fantastique Surnaturel',
          value: 'action-arts-martiaux-aventure-fantastique-surnaturel',
        },
        {
          label: 'Action Aventure Fantastique',
          value: 'action-aventure-fantastique',
        },
        { label: 'Action Drame Shônen', value: 'action-drame-shonen' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'amitié', value: 'amitie' },
        { label: 'amour', value: 'amour' },
        { label: 'Art-martiaux', value: 'art-martiaux' },
        { label: 'Arts-martiaux', value: 'arts-martiaux' },
        { label: 'Aventure', value: 'aventure' },
        { label: 'Combat', value: 'combat' },
        { label: 'Comedie', value: 'comedie' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Demons', value: 'demons' },
        { label: 'Dragon', value: 'dragon' },
        { label: 'Drama', value: 'drama' },
        { label: 'Drame', value: 'drame' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fantaisie', value: 'fantaisie' },
        { label: 'fantastique', value: 'fantastique' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Ghosts', value: 'ghosts' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Historique', value: 'historique' },
        { label: 'Horreur', value: 'horreur' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'longstrip art', value: 'longstrip-art' },
        { label: 'Magic', value: 'magic' },
        { label: 'Magie', value: 'magie' },
        { label: 'Male Protagonist', value: 'male-protagonist' },
        { label: 'manga', value: 'manga' },
        { label: 'Manhwa', value: 'manhwa' },
        { label: 'Manhwa Player', value: 'manhwa-player' },
        { label: 'Manwha', value: 'manwha' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Monstre', value: 'monstre' },
        { label: 'Murim', value: 'murim' },
        { label: 'mystère', value: 'mystere' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Necromancien', value: 'necromancien' },
        { label: 'necromencer', value: 'necromencer' },
        { label: 'Novel', value: 'novel' },
        { label: 'One Shot', value: 'one-shot' },
        { label: 'Over Power MC', value: 'over-power-mc' },
        { label: 'Partenaire', value: 'partenaire' },
        { label: 'Player', value: 'player' },
        { label: 'Player Manhwa', value: 'player-manhwa' },
        { label: 'Portail', value: 'portail' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Psychologique', value: 'psychologique' },
        { label: 'regresseur', value: 'regresseur' },
        { label: 'régression', value: 'regression' },
        { label: 'Réincarnation', value: 'reincarnation' },
        { label: 'Returner', value: 'returner' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shôjo', value: 'shojo' },
        { label: 'Shônen', value: 'shonen' },
        { label: 'Shotacon', value: 'shotacon' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Slide of Life', value: 'slide-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Surnaturel', value: 'surnaturel' },
        { label: 'Système', value: 'systeme' },
        { label: 'Tragédie', value: 'tragedie' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Webtoons', value: 'webtoons' },
      ],
    },
  } satisfies Filters;
}

export default new PhenixScansTradPlugin();
