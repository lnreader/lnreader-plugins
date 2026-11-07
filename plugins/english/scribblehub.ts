import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { Plugin } from '@/types/plugin';
import dayjs from 'dayjs';

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

class ScribbleHubPlugin implements Plugin.PluginBase {
  id = 'scribblehub';
  name = 'Scribble Hub';
  icon = 'src/en/scribblehub/icon.png';
  site = 'https://www.scribblehub.com/';
  version = '1.1.0';

  parseReleaseTime(dateText: string): string | null {
    const relative = dateText.match(
      /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i,
    );
    if (relative) {
      const unit = relative[2].toLowerCase() as dayjs.ManipulateType;
      return dayjs().subtract(parseInt(relative[1], 10), unit).toISOString();
    }

    // Absolute dates look like "Nov 1, 2026 06:07 PM" or "Nov 1, 2026".
    const absolute = dateText.match(
      /([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?/i,
    );
    if (!absolute) return null;

    const month = MONTHS.indexOf(absolute[1].toLowerCase());
    if (month === -1) return null;

    let hour = absolute[4] ? parseInt(absolute[4], 10) % 12 : 0;
    if (absolute[6]?.toUpperCase() === 'PM') hour += 12;
    const minute = absolute[5] ? parseInt(absolute[5], 10) : 0;

    return new Date(
      parseInt(absolute[3], 10),
      month,
      parseInt(absolute[2], 10),
      hour,
      minute,
    ).toISOString();
  }

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.search_main_box').each((i, el) => {
      const novelName = loadedCheerio(el).find('.search_title > a').text();
      const novelCover = loadedCheerio(el)
        .find('.search_img > img')
        .attr('src');
      const novelUrl = loadedCheerio(el).find('.search_title > a').attr('href');

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.site, ''),
      };
      novels.push(novel);
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
    let url = `${this.site}`;
    if (showLatestNovels) {
      url += `latest-series/?pg=${page}`;
    } else if (filters) {
      const params = new URLSearchParams();
      if (filters.genres.value.include?.length) {
        params.append('gi', filters.genres.value.include.join(','));
      }
      if (
        filters.genres.value.include?.length ||
        filters.genres.value.exclude?.length
      ) {
        params.append('mgi', filters.genre_operator.value);
      }
      if (filters.genres.value.exclude?.length) {
        params.append('ge', filters.genres.value.exclude.join(','));
      }
      if (filters.content_warning.value.include?.length) {
        params.append('cti', filters.content_warning.value.include.join(','));
      }
      if (
        filters.content_warning.value.include?.length ||
        filters.content_warning.value.exclude?.length
      ) {
        params.append('mct', filters.content_warning_operator.value);
      }
      if (filters.content_warning.value.exclude?.length) {
        params.append('cte', filters.content_warning.value.exclude.join(','));
      }
      params.append('cp', filters.storyStatus.value);
      params.append('sort', filters.sort.value);
      params.append('order', filters.order.value);
      params.append('pg', page.toString());
      url += `series-finder/?sf=1&${params.toString()}`;
    } else {
      url += `series-finder/?sf=1&sort=pageviews&order=desc&pg=${page}`;
    }

    const body = await fetchApi(url).then(result => result.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  parseTocChapters(loadedCheerio: CheerioAPI): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    loadedCheerio('.toc_w').each((i, el) => {
      const chapterLink = loadedCheerio(el).find('a.toc_a');
      const chapterUrl = chapterLink.attr('href');
      if (!chapterUrl) return;

      const releaseDate = loadedCheerio(el).find('.fic_date_pub');
      const chapterNumber = parseInt(loadedCheerio(el).attr('order') || '', 10);

      chapters.push({
        name: chapterLink.text().trim(),
        path: chapterUrl.replace(this.site, ''),
        releaseTime: this.parseReleaseTime(
          releaseDate.attr('title') || releaseDate.text(),
        ),
        chapterNumber: isNaN(chapterNumber) ? undefined : chapterNumber,
      });
    });
    return chapters;
  }

  async fetchAllChapters(
    novelPath: string,
    loadedCheerio: CheerioAPI,
  ): Promise<Plugin.ChapterItem[]> {
    const novelId = loadedCheerio('input#mypostid').attr('value');
    if (!novelId) return [];

    const result = await fetchApi(`${this.site}wp-admin/admin-ajax.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: this.site + novelPath,
        Origin: this.site.slice(0, -1),
      },
      body: new URLSearchParams({
        action: 'wi_getreleases_pagination',
        pagenum: '-1',
        mypostid: novelId,
      }).toString(),
    });

    if (!result.ok) return [];

    return this.parseTocChapters(parseHTML(await result.text()));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.fic_title').text() || 'Untitled',
      cover: loadedCheerio('.fic_image > img').attr('src'),
      summary: loadedCheerio('.wi_fic_desc').text(),
      author: loadedCheerio('.auth_name_fic').text(),
    };

    novel.genres = loadedCheerio('.fic_genre')
      .map((i, el) => loadedCheerio(el).text())
      .toArray()
      .join(',');

    const statusText = loadedCheerio('i.status').closest('li').text();
    if (statusText.includes('Ongoing')) {
      novel.status = NovelStatus.Ongoing;
    } else if (statusText.includes('Hiatus')) {
      novel.status = NovelStatus.OnHiatus;
    } else if (statusText.includes('Completed')) {
      novel.status = NovelStatus.Completed;
    } else {
      novel.status = NovelStatus.Unknown;
    }

    // The novel page only lists the latest chapters; fall back to them if the
    // full table of contents request fails.
    const pageChapters = this.parseTocChapters(loadedCheerio);
    const allChapters = await this.fetchAllChapters(
      novelPath,
      loadedCheerio,
    ).catch((): Plugin.ChapterItem[] => []);
    const chapters =
      allChapters.length > pageChapters.length ? allChapters : pageChapters;

    novel.chapters = chapters.sort(
      (a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0),
    );

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('div.chp_raw').html() || '';
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}series-finder/?sf=1&sh=${encodeURIComponent(searchTerm)}&pg=${pageNo}`;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  filters = {
    sort: {
      label: 'Sort Results By',
      value: 'pageviews',
      options: [
        { label: 'Chapters', value: 'chapters' },
        { label: 'Chapters per Week', value: 'frequency' },
        { label: 'Date Added', value: 'dateadded' },
        { label: 'Favorites', value: 'favorites' },
        { label: 'Last Updated', value: 'lastchpdate' },
        { label: 'Number of Ratings', value: 'numofrate' },
        { label: 'Pages', value: 'pages' },
        { label: 'Pageviews', value: 'pageviews' },
        { label: 'Ratings', value: 'ratings' },
        { label: 'Readers', value: 'readers' },
        { label: 'Reviews', value: 'reviews' },
        { label: 'Total Words', value: 'totalwords' },
      ],
      type: FilterTypes.Picker,
    },
    order: {
      label: 'Order By',
      value: 'desc',
      options: [
        { label: 'Descending', value: 'desc' },
        { label: 'Ascending', value: 'asc' },
      ],
      type: FilterTypes.Picker,
    },
    storyStatus: {
      label: 'Story Status',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Completed', value: 'completed' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Hiatus', value: 'hiatus' },
      ],
      type: FilterTypes.Picker,
    },
    genre_operator: {
      value: 'and',
      label: 'Genres (And/Or)',
      options: [
        { label: 'And', value: 'and' },
        { label: 'Or', value: 'or' },
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
        { label: 'Action', value: '9' },
        { label: 'Adult', value: '902' },
        { label: 'Adventure', value: '8' },
        { label: 'Boys Love', value: '891' },
        { label: 'Comedy', value: '7' },
        { label: 'Drama', value: '903' },
        { label: 'Ecchi', value: '904' },
        { label: 'Fanfiction', value: '38' },
        { label: 'Fantasy', value: '19' },
        { label: 'Gender Bender', value: '905' },
        { label: 'Girls Love', value: '892' },
        { label: 'Harem', value: '1015' },
        { label: 'Historical', value: '21' },
        { label: 'Horror', value: '22' },
        { label: 'Isekai', value: '37' },
        { label: 'Josei', value: '906' },
        { label: 'LitRPG', value: '1180' },
        { label: 'Martial Arts', value: '907' },
        { label: 'Mature', value: '20' },
        { label: 'Mecha', value: '908' },
        { label: 'Mystery', value: '909' },
        { label: 'Psychological', value: '910' },
        { label: 'Romance', value: '6' },
        { label: 'School Life', value: '911' },
        { label: 'Sci-fi', value: '912' },
        { label: 'Seinen', value: '913' },
        { label: 'Slice of Life', value: '914' },
        { label: 'Smut', value: '915' },
        { label: 'Sports', value: '916' },
        { label: 'Supernatural', value: '5' },
        { label: 'Tragedy', value: '901' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    content_warning_operator: {
      value: 'and',
      label: 'Mature Content (And/Or)',
      options: [
        { label: 'And', value: 'and' },
        { label: 'Or', value: 'or' },
      ],
      type: FilterTypes.Picker,
    },
    content_warning: {
      value: {
        include: [],
        exclude: [],
      },
      label: 'Mature Content',
      options: [
        { label: 'Gore', value: '48' },
        { label: 'Sexual Content', value: '50' },
        { label: 'Strong Language', value: '49' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
  } satisfies Filters;
}

export default new ScribbleHubPlugin();
