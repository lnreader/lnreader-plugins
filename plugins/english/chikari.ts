import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class ChikariPlugin implements Plugin.PluginBase {
  id = 'chikari';
  name = 'Chikari';
  icon = 'src/en/chikari/icon.png';
  site = 'https://chikari.moe';
  version = '1.0.1';
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  // Define the filters for the app's filter menu
  filters = {
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort By',
      value: 'popular',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'Trending', value: 'trending' },
        { label: 'Top Rated', value: 'top_rated' },
        { label: 'Recently Updated', value: 'updated' },
        { label: 'Recently Added', value: 'added' },
        { label: 'Most Bookmarked', value: 'most_bookmarked' },
      ],
    },
    genres: {
      type: FilterTypes.ExcludableCheckboxGroup,
      label: 'Genres',
      value: {
        include: [],
        exclude: [],
      },
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Gender Bender', value: 'gender_bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Josei', value: 'josei' },
        { label: 'Martial Arts', value: 'martial_arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school_life' },
        { label: 'Sci-Fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo Ai', value: 'shoujo_ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen Ai', value: 'shounen_ai' },
        { label: 'Slice of Life', value: 'slice_of_life' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
    },
  } satisfies Filters;

async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const limit = 60;
    const offset = (pageNo - 1) * limit;

    let sort = 'popular'; 
    let genreQuery = '';

    if (showLatestNovels) {
      sort = 'updated';
    } else if (filters && filters.sort) {
      // Safely extract string value if wrapped in an object ({ type, value })
      sort = typeof filters.sort === 'object' ? filters.sort.value : filters.sort;
    }

    // Safely extract the genres payload
    const genresFilter = filters?.genres;
    const genreValues = typeof genresFilter === 'object' && 'value' in genresFilter 
      ? genresFilter.value 
      : genresFilter;

    if (genreValues) {
      // 1. If passed as an Array
      if (Array.isArray(genreValues)) {
        genreValues.forEach((genre: string) => {
          if (genre.startsWith('-')) {
            genreQuery += `&genre_exclude=${genre.substring(1)}`;
          } else {
            genreQuery += `&genre=${genre}`;
          }
        });
      } 
      // 2. If passed as an Object ({ include: [], exclude: [] })
      else if (typeof genreValues === 'object') {
        if (Array.isArray(genreValues.include)) {
          genreValues.include.forEach((genre: string) => {
            genreQuery += `&genre=${genre}`;
          });
        }
        if (Array.isArray(genreValues.exclude)) {
          genreValues.exclude.forEach((genre: string) => {
            genreQuery += `&genre_exclude=${genre}`;
          });
        }
      }
    }

    const url = `${this.site}/api/novels?sort=${sort}${genreQuery}&limit=${limit}&offset=${offset}`;

    // console.log('Fetching URL:', url);

    const response = await fetchApi(url);
    const json = await response.json();

    const novels: Plugin.NovelItem[] = (json.items || []).map((item: any) => ({
      name: item.title,
      path: item.slug, 
      cover: item.cover_url || defaultCover,
    }));

    return novels;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const limit = 36;
    const offset = (pageNo - 1) * limit;
    const url = `${this.site}/api/novels?sort=popular&q=${encodeURIComponent(searchTerm)}&limit=${limit}&offset=${offset}`;

    const response = await fetchApi(url);
    const json = await response.json();

    const novels: Plugin.NovelItem[] = (json.items || []).map((item: any) => ({
      name: item.title,
      path: item.slug,
      cover: item.cover_url || defaultCover,
    }));

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const detailUrl = `${this.site}/api/novels/${novelPath}`;
    const detailResponse = await fetchApi(detailUrl);
    const detailJson = await detailResponse.json();

    const authorName = detailJson.authors && detailJson.authors.length > 0
      ? detailJson.authors.map((a: any) => a.name).join(', ')
      : 'Unknown';

    // Parse the genres array into a comma-separated string
    const genres = detailJson.genres && detailJson.genres.length > 0
      ? detailJson.genres.map((g: any) => g.name).join(', ')
      : '';

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: detailJson.title || 'Untitled',
      cover: detailJson.cover_url || defaultCover,
      author: authorName,
      summary: detailJson.description || '',
      genres: genres, // Handled here!
      status: detailJson.status === 'releasing' ? NovelStatus.Ongoing : NovelStatus.Completed,
    };

    const chapters: Plugin.ChapterItem[] = [];
    
    let offset = 0;
    const limit = 500;
    let hasMoreChapters = true;

    while (hasMoreChapters) {
      const chaptersUrl = `${this.site}/api/novels/${novelPath}/chapters?order=asc&limit=${limit}&offset=${offset}`;
      const chaptersResponse = await fetchApi(chaptersUrl);
      const chaptersJson = await chaptersResponse.json();

      const fetchedChapters = chaptersJson.items;

      if (!fetchedChapters || fetchedChapters.length === 0) {
        hasMoreChapters = false;
        break;
      }

      fetchedChapters.forEach((ch: any) => {
        chapters.push({
          name: ch.title || `Chapter ${ch.number}`,
          path: `api/novels/${novelPath}/chapters/${ch.number}/read`,
          releaseTime: ch.created_at || '',
          chapterNumber: ch.number,
        });
      });

      if (fetchedChapters.length === limit) {
        offset += limit;
      } else {
        hasMoreChapters = false;
      }
    }

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.site}/${chapterPath}`;
    
    const response = await fetchApi(url);
    const json = await response.json();

    const rawText = json.body || '';
    
    const chapterHtml = rawText
      .split('\n')
      .map((paragraph: string) => `<p>${paragraph.trim()}</p>`)
      .filter((paragraph: string) => paragraph !== '<p></p>')
      .join('');

    return chapterHtml;
  }

  resolveUrl = (path: string, isNovel?: boolean) => {
    if (isNovel) return `${this.site}/novels/${path}`;
    return `${this.site}/${path}`;
  };
}

export default new ChikariPlugin();