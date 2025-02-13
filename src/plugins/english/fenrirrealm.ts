import { fetchApi } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { load as loadCheerio } from 'cheerio';
import { Filters, FilterTypes } from '@libs/filterInputs';

class FenrirRealmPlugin implements Plugin.PluginBase {
  id = 'fenrir';
  name = 'Fenrir Realm';
  icon = 'src/en/fenrirrealm/icon.png';
  site = 'https://fenrirealm.com';
  version = '1.0.7';
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // let sort = "updated";
    let sort = filters.sort.value;
    if (showLatestNovels) sort = 'latest';
    const genresFilter = filters.genres.value
      .map(g => '&genres%5B%5D=' + g)
      .join('');
    const res = await fetchApi(
      `${this.site}/api/novels/filter?page=${pageNo}&per_page=20&status=${filters.status.value}&order=${sort}${genresFilter}`,
    ).then(r => r.json());

    return res.data.map(r => this.parseNovelFromApi(r));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await fetchApi(`${this.site}/series/${novelPath}`, {
      headers: {
        'User-Agent': '',
      },
    }).then(r => r.text());
    const loadedCheerio = loadCheerio(html);

    loadedCheerio(
      'div.overflow-hidden.transition-all.max-h-\\[108px\\] > br',
    ).replaceWith('%%NEWLINE%%');
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.my-2').text(),
      summary: loadedCheerio(
        'div.overflow-hidden.transition-all.max-h-\\[108px\\]',
      )
        .text()
        .replaceAll('%%NEWLINE%%', '\n'),
    };
    // novel.artist = '';
    novel.author = loadedCheerio(
      'div.flex-1 > div.mb-3 > a.inline-flex',
    ).text();
    novel.cover =
      this.site +
      '/storage/' +
      html.match(/,cover:"storage\/(.+?)",cover_data_url/)[1];
    novel.genres = loadedCheerio('div.flex-1 > div.flex:not(.mb-3, .mt-5) > a')
      .map((i, el) => loadCheerio(el).text())
      .toArray()
      .join(',');
    novel.status = loadedCheerio('div.flex-1 > div.mb-3 > span.rounded-md')
      .first()
      .text();

    const chapters = await fetchApi(
      this.site + '/api/novels/chapter-list/' + novelPath,
    ).then(r => r.json());

    novel.chapters = chapters
      .map(c => ({
        name: c.title,
        path: novelPath + '/' + c.slug,
        releaseTime: c.created_at,
        chapterNumber: c.number,
      }))
      .sort((a, b) => a.chapterNumber - b.chapterNumber);
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const page = await fetchApi(this.site + '/series/' + chapterPath, {
      headers: {
        'User-Agent': '',
      },
    }).then(r => r.text());
    return loadCheerio(page)('#reader-area').html();
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return await fetchApi(
      `${this.site}/api/novels/filter?page=${pageNo}&per_page=20&search=${encodeURIComponent(searchTerm)}`,
    )
      .then(r => r.json())
      .then(r => r.data.map(novel => this.parseNovelFromApi(novel)));
  }

  parseNovelFromApi(apiData) {
    return {
      name: apiData.title,
      path: apiData.slug,
      cover: this.site + '/' + apiData.cover,
      summary: apiData.description,
      status: apiData.status,
      genres: apiData.genres.map(g => g.name).join(','),
    };
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + '/series/' + path;

  filters = {
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: 'any',
      options: [
        { label: 'All', value: 'any' },
        { label: 'Ongoing', value: 'ongoing' },
        {
          label: 'Completed',
          value: 'completed',
        },
      ],
    },
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort',
      value: 'popular',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'Latest', value: 'latest' },
        { label: 'Updated', value: 'updated' },
      ],
    },
    genres: {
      type: FilterTypes.CheckboxGroup,
      label: 'Genres',
      value: [],
      options: [
        { 'label': 'Action', 'value': '1' },
        { 'label': 'Adult', 'value': '2' },
        {
          'label': 'Adventure',
          'value': '3',
        },
        { 'label': 'Comedy', 'value': '4' },
        { 'label': 'Drama', 'value': '5' },
        {
          'label': 'Ecchi',
          'value': '6',
        },
        { 'label': 'Fantasy', 'value': '7' },
        { 'label': 'Gender Bender', 'value': '8' },
        {
          'label': 'Harem',
          'value': '9',
        },
        { 'label': 'Historical', 'value': '10' },
        { 'label': 'Horror', 'value': '11' },
        {
          'label': 'Josei',
          'value': '12',
        },
        { 'label': 'Martial Arts', 'value': '13' },
        { 'label': 'Mature', 'value': '14' },
        {
          'label': 'Mecha',
          'value': '15',
        },
        { 'label': 'Mystery', 'value': '16' },
        { 'label': 'Psychological', 'value': '17' },
        {
          'label': 'Romance',
          'value': '18',
        },
        { 'label': 'School Life', 'value': '19' },
        { 'label': 'Sci-fi', 'value': '20' },
        {
          'label': 'Seinen',
          'value': '21',
        },
        { 'label': 'Shoujo', 'value': '22' },
        { 'label': 'Shoujo Ai', 'value': '23' },
        {
          'label': 'Shounen',
          'value': '24',
        },
        { 'label': 'Shounen Ai', 'value': '25' },
        { 'label': 'Slice of Life', 'value': '26' },
        {
          'label': 'Smut',
          'value': '27',
        },
        { 'label': 'Sports', 'value': '28' },
        { 'label': 'Supernatural', 'value': '29' },
        {
          'label': 'Tragedy',
          'value': '30',
        },
        { 'label': 'Wuxia', 'value': '31' },
        { 'label': 'Xianxia', 'value': '32' },
        {
          'label': 'Xuanhuan',
          'value': '33',
        },
        { 'label': 'Yaoi', 'value': '34' },
        { 'label': 'Yuri', 'value': '35' },
      ],
    },
  } satisfies Filters;
}

export default new FenrirRealmPlugin();

//paste into console on site to load
async function getUpdatedGenres() {
  const data = await fetch(
    'https://fenrirealm.com/api/novels/taxonomy/genres',
  ).then(d => d.json());
  const genreData = data.map(g => ({ label: g.name, value: g.id.toString() }));
  console.log(JSON.stringify(genreData));
}
