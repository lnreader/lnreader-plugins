import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';

class NovelBuddy implements Plugin.PluginBase {
  id = 'novelbuddy';
  name = 'NovelBuddy';
  site = 'https://novelbuddy.com/';
  version = '2.0.0';
  icon = 'src/en/novelbuddy/icon.png';

  headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://novelbuddy.com/',
  };

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();
    params.append('sort', filters?.orderBy?.value?.toString() || 'popular');
    params.append('status', filters?.status?.value?.toString() || '');
    if (filters?.genre?.value instanceof Array) {
      filters.genre.value.forEach(genre => {
        params.append('genres[]', genre.toString());
      });
    }
    if (filters?.keyword?.value) {
      params.append('q', filters.keyword.value.toString());
    }
    params.append('page', pageNo.toString());

    const url = `https://api.novelbuddy.com/titles?${params.toString()}`;
    const result = await fetchApi(url, { headers: this.headers });
    const json = await result.json();

    if (!json || !json.data || !json.data.items) {
      // Fallback to scraping HTML if API fails (likely Cloudflare block)
      const htmlUrl = `${this.site}popular?page=${pageNo}`;
      const htmlRes = await fetchApi(htmlUrl, { headers: this.headers });
      const htmlBody = await htmlRes.text();
      const $ = parseHTML(htmlBody);
      const script = $('#__NEXT_DATA__').html();
      if (script) {
        const data = JSON.parse(script);
        const items = data.props.pageProps.items || [];
        return items.map((item: any) => ({
          name: item.name,
          cover: item.cover,
          path: item.url.replace(/^\//, ''),
        }));
      }
      return [];
    }

    return json.data.items.map((item: any) => ({
      name: item.name,
      cover: item.cover,
      path: item.url.replace(/^\//, ''),
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const response = await fetchApi(this.site + novelPath, {
      headers: this.headers,
    });
    const body = await response.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could not find __NEXT_DATA__');

    const data = JSON.parse(script);
    const initialManga = data.props.pageProps.initialManga;

    if (!initialManga) throw new Error('Could not find initialManga data');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: initialManga.name,
      cover: initialManga.cover,
      summary: initialManga.summary?.replace(/<[^>]*>?/gm, '') || '',
      author: initialManga.authors?.map((a: any) => a.name).join(', ') || '',
      artist: initialManga.artists?.map((a: any) => a.name).join(', ') || '',
      status: initialManga.status,
      genres: initialManga.genres?.map((g: any) => g.name).join(',') || '',
      chapters: [],
    };

    if (initialManga.ratingStats) {
      novel.rating = initialManga.ratingStats.average;
    }

    // Fetch full chapter list from API
    const chaptersUrl = `https://api.novelbuddy.com/titles/${initialManga.id}/chapters`;
    try {
      const chaptersResponse = await fetchApi(chaptersUrl, {
        headers: this.headers,
      });
      const chaptersJson = await chaptersResponse.json();

      if (chaptersJson?.success && chaptersJson?.data?.chapters) {
        novel.chapters = chaptersJson.data.chapters
          .map((chapter: any) => ({
            name: chapter.name,
            path: chapter.url.replace(/^\//, ''),
            releaseTime: chapter.updated_at,
          }))
          .reverse();
      } else if (initialManga.chapters) {
        novel.chapters = initialManga.chapters
          .map((chapter: any) => ({
            name: chapter.name,
            path: chapter.url.replace(/^\//, ''),
            releaseTime: chapter.updatedAt,
          }))
          .reverse();
      }
    } catch (e) {
      if (initialManga.chapters) {
        novel.chapters = initialManga.chapters
          .map((chapter: any) => ({
            name: chapter.name,
            path: chapter.url.replace(/^\//, ''),
            releaseTime: chapter.updatedAt,
          }))
          .reverse();
      }
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath, {
      headers: this.headers,
    });
    const body = await result.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could not find __NEXT_DATA__');

    const data = JSON.parse(script);
    const initialChapter = data.props.pageProps.initialChapter;
    if (!initialChapter) throw new Error('Could not find chapter content');

    return initialChapter.content;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `https://api.novelbuddy.com/titles?q=${encodeURIComponent(searchTerm)}&page=${page}`;
    const result = await fetchApi(url, { headers: this.headers });
    const json = await result.json();

    if (!json || !json.data || !json.data.items) {
      return [];
    }

    return json.data.items.map((item: any) => ({
      name: item.name,
      cover: item.cover,
      path: item.url.replace(/^\//, ''),
    }));
  }

  filters = {
    orderBy: {
      value: 'popular',
      label: 'Order by',
      options: [
        { label: 'Default', value: '' },
        { label: 'Latest Updated', value: 'latest' },
        { label: 'Most Popular', value: 'popular' },
        { label: 'Highest Rating', value: 'rating' },
        { label: 'Most Viewed', value: 'views' },
        { label: 'Most Chapters', value: 'chapters' },
        { label: 'Alphabetical', value: 'alphabetical' },
      ],
      type: FilterTypes.Picker,
    },
    keyword: {
      value: '',
      label: 'Keywords',
      type: FilterTypes.TextInput,
    },
    status: {
      value: '',
      label: 'Status',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      value: [],
      label: 'Genres',
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Action Adventure', value: 'action-adventure' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventcure', value: 'adventcure' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Adventurer', value: 'adventurer' },
        { label: 'Bender', value: 'bender' },
        { label: 'Chinese', value: 'chinese' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Cultivation', value: 'cultivation' },
        { label: 'Drama', value: 'drama' },
        { label: 'Eastern', value: 'eastern' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fan-Fiction', value: 'fan-fiction' },
        { label: 'Fanfiction', value: 'fanfiction' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Game', value: 'game' },
        { label: 'Gender', value: 'gender' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'History', value: 'history' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'Light Novel', value: 'light-novel' },
        { label: 'Litrpg', value: 'litrpg' },
        { label: 'Lolicon', value: 'lolicon' },
        { label: 'Magic', value: 'magic' },
        { label: 'Martial', value: 'martial' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Modern Life', value: 'modern-life' },
        { label: 'Movies', value: 'movies' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Slice Of Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'System', value: 'system' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban', value: 'urban' },
        { label: 'Urban Life', value: 'urban-life' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new NovelBuddy();
