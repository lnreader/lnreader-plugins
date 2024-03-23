import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';
import dayjs from 'dayjs';

class ScribbleHubPlugin implements Plugin.PluginBase {
  id = 'scribblehub';
  name = 'ScribbleHub';
  icon = 'src/en/scribblehub/icon.png';
  site = 'https://www.scribblehub.com/';
  version = '1.0.0';
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
    let link = `${this.site}`;
    if (showLatestNovels) link += 'latest-series/';
    // if (filters.genres.value.include?.length ||
    // filters.genres.value.exclude?.length)
    else link += 'series-finder/?sf=1';
    // else
    // link += "series-ranking/";
    // TODO, series-ranking filters when hideOnSelect come out

    if (filters.genres.value.include?.length)
      link += '&gi=' + filters.genres.value.include.join(',');

    if (filters.genres.value.exclude?.length)
      link += '&ge=' + filters.genres.value.exclude.join(',');

    if (
      filters.genres.value.include?.length ||
      filters.genres.value.exclude?.length
    )
      link += '&mgi=' + filters.genre_operator.value;

    if (filters.content_warning.value.include?.length)
      link += '&cti=' + filters.content_warning.value.include.join(',');

    if (filters.content_warning.value.exclude?.length)
      link += '&cte=' + filters.content_warning.value.exclude.join(',');

    if (
      filters.content_warning.value.include?.length ||
      filters.content_warning.value.exclude?.length
    )
      link += '&mct' + filters.content_warning_operator.value;

    link += '&sort=' + filters.sort.value;
    link += '&order=' + filters.order.value;

    const body = await fetchApi(link).then(result => result.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.fic_title').text() || 'Untitled',
      cover: loadedCheerio('.fic_image > img').attr('src'),
      summary: loadedCheerio('.wi_fic_desc').text(),
      author: loadedCheerio('.auth_name_fic').text(),
      chapters: [],
    };

    novel.genres = loadedCheerio('.fic_genre')
      .map((i, el) => loadedCheerio(el).text())
      .toArray()
      .join(',');

    novel.status = loadedCheerio('.rnd_stats').next().text().includes('Ongoing')
      ? 'Ongoing'
      : 'Completed';

    const formData = new FormData();
    formData.append('action', 'wi_getreleases_pagination');
    formData.append('pagenum', '-1');
    formData.append('mypostid', novelPath.split('/')[1]);

    const data = await fetchApi(`${this.site}wp-admin/admin-ajax.php`, {
      method: 'POST',
      body: formData,
    });
    const text = await data.text();

    loadedCheerio = parseHTML(text);

    const chapter: Plugin.ChapterItem[] = [];

    const parseISODate = (date: string) => {
      if (date.includes('ago')) {
        const dayJSDate = dayjs(new Date()); // today
        const timeAgo = date.match(/\d+/)?.[0] || '';
        const timeAgoInt = parseInt(timeAgo, 10);

        if (!timeAgo) return null; // there is no number!

        if (date.includes('hours ago') || date.includes('hour ago')) {
          dayJSDate.subtract(timeAgoInt, 'hours'); // go back N hours
        }

        if (date.includes('days ago') || date.includes('day ago')) {
          dayJSDate.subtract(timeAgoInt, 'days'); // go back N days
        }

        if (date.includes('months ago') || date.includes('month ago')) {
          dayJSDate.subtract(timeAgoInt, 'months'); // go back N months
        }

        return dayJSDate.toISOString();
      }
      return null;
    };

    loadedCheerio('.toc_w').each((i, el) => {
      const chapterName = loadedCheerio(el).find('.toc_a').text();
      const releaseDate = loadedCheerio(el).find('.fic_date_pub').text();
      const chapterUrl = loadedCheerio(el).find('a').attr('href');

      if (!chapterUrl) return;
      chapter.push({
        name: chapterName,
        releaseTime: parseISODate(releaseDate),
        path: chapterUrl.replace(this.site, ''),
      });
    });

    novel.chapters = chapter.reverse();

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
    const url = `${this.site}?s=${searchTerm}&post_type=fictionposts`;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return await fetchFile(url);
  }

  filters = {
    sort: {
      label: 'Sort Results By',
      value: 'ratings',
      options: [
        { label: 'Chapters', value: 'chapters' },
        { label: 'Chapters per week', value: 'frequency' },
        { label: 'Date Added', value: 'dateadded' },
        { label: 'Favorites', value: 'favorites' },
        { label: 'Last Updated', value: 'lastchdate' },
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
      label: 'Order by',
      value: 'desc',
      options: [
        { label: 'Descending', value: 'desc' },
        { label: 'Ascending', value: 'asc' },
      ],
      type: FilterTypes.Picker,
    },
    storyStatus: {
      label: 'Story Status (Translation)',
      value: '',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Completed', value: 'completed' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Hiatus', value: 'hiatus' },
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
    genre_operator: {
      value: 'and',
      label: 'Genre And/Or',
      options: [
        { label: 'OR', value: 'or' },
        { label: 'AND', value: 'and' },
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
    content_warning_operator: {
      value: 'and',
      label: 'Mature Content And/Or',
      options: [
        { label: 'OR', value: 'or' },
        { label: 'AND', value: 'and' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new ScribbleHubPlugin();
