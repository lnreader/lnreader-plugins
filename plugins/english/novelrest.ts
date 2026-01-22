import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

/**
 * NovelRest LNReader Plugin
 * 
 * This plugin allows LNReader to fetch novels from NovelRest (novelrest.vercel.app)
 * 
 * Features:
 * - Browse popular novels with pagination
 * - Search novels
 * - Read chapters
 * - Filter by status
 * - Sort by latest/popular/rating/updated
 */
class NovelRestPlugin implements Plugin.PluginBase {
  id = 'novelrest';
  name = 'NovelRest';
  icon = 'src/en/novelrest/icon.png';
  site = 'https://novelrest.vercel.app';
  apiBase = 'https://novelrest.vercel.app/api/lnreader';
  version = '1.0.0';
  
  filters: Filters = {
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'ONGOING' },
        { label: 'Completed', value: 'COMPLETED' },
        { label: 'Hiatus', value: 'HIATUS' },
      ],
    },
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort By',
      value: 'latest',
      options: [
        { label: 'Latest', value: 'latest' },
        { label: 'Popular', value: 'popular' },
        { label: 'Rating', value: 'rating' },
        { label: 'Updated', value: 'updated' },
      ],
    },
  };

  /**
   * Fetch popular/latest novels with pagination
   */
  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    
    // Build query parameters
    const params = new URLSearchParams();
    params.set('page', pageNo.toString());
    params.set('limit', '20');
    
    if (filters?.status?.value) {
      params.set('status', filters.status.value as string);
    }
    
    const sortBy = showLatestNovels ? 'latest' : (filters?.sort?.value as string || 'popular');
    params.set('sort', sortBy);

    try {
      const url = `${this.apiBase}/novels?${params.toString()}`;
      const response = await fetchApi(url);
      const data = await response.json();
      
      if (data.novels && Array.isArray(data.novels)) {
        for (const novel of data.novels) {
          novels.push({
            name: novel.title,
            path: novel.slug, // Just the slug, we'll build full path in parseNovel
            cover: novel.coverImage || defaultCover,
          });
        }
      }
    } catch (error) {
      console.error('NovelRest: Error fetching popular novels:', error);
    }

    return novels;
  }

  /**
   * Parse novel details and chapter list
   */
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Untitled',
    };

    try {
      // novelPath is just the slug
      const slug = novelPath.replace(/^\/novels\//, ''); // Clean up if path prefix exists
      
      const response = await fetchApi(`${this.apiBase}/novels/${slug}`);
      const data = await response.json();

      if (data) {
        novel.name = data.title || 'Untitled';
        novel.author = data.author || '';
        novel.cover = data.coverImage || defaultCover;
        novel.genres = Array.isArray(data.genres) 
          ? data.genres.map((g: { name: string } | string) => typeof g === 'string' ? g : g.name).join(', ')
          : '';
        novel.summary = data.description || '';
        
        // Map status
        switch (data.status) {
          case 'COMPLETED':
            novel.status = NovelStatus.Completed;
            break;
          case 'ONGOING':
            novel.status = NovelStatus.Ongoing;
            break;
          case 'HIATUS':
            novel.status = NovelStatus.OnHiatus;
            break;
          default:
            novel.status = NovelStatus.Unknown;
        }

        // Parse chapters
        const chapters: Plugin.ChapterItem[] = [];
        
        if (data.chapters && Array.isArray(data.chapters)) {
          for (const chapter of data.chapters) {
            chapters.push({
              name: chapter.title || `Chapter ${chapter.number}`,
              path: `${slug}/${chapter.number}`, // slug/chapterNumber format
              releaseTime: chapter.createdAt || undefined,
              chapterNumber: chapter.number,
            });
          }
        }

        novel.chapters = chapters;
      }
    } catch (error) {
      console.error('NovelRest: Error parsing novel:', error);
    }

    return novel;
  }

  /**
   * Parse chapter content
   */
  async parseChapter(chapterPath: string): Promise<string> {
    try {
      // chapterPath format: "slug/chapterNumber"
      const parts = chapterPath.split('/');
      const chapterNumber = parts.pop();
      const slug = parts.join('/');

      const response = await fetchApi(`${this.apiBase}/novels/${slug}/chapters/${chapterNumber}`);
      const data = await response.json();

      if (data && data.contentHtml) {
        return data.contentHtml;
      }

      return '<p>Chapter content could not be loaded.</p>';
    } catch (error) {
      console.error('NovelRest: Error parsing chapter:', error);
      return '<p>Error loading chapter content.</p>';
    }
  }

  /**
   * Search novels by term
   */
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];

    try {
      const params = new URLSearchParams();
      params.set('q', searchTerm);
      params.set('page', pageNo.toString());
      params.set('limit', '20');

      const response = await fetchApi(`${this.apiBase}/novels?${params.toString()}`);
      const data = await response.json();

      if (data.novels && Array.isArray(data.novels)) {
        for (const novel of data.novels) {
          novels.push({
            name: novel.title,
            path: novel.slug,
            cover: novel.coverImage || defaultCover,
          });
        }
      }
    } catch (error) {
      console.error('NovelRest: Error searching novels:', error);
    }

    return novels;
  }

  /**
   * Resolve full URL for novel or chapter
   */
  resolveUrl = (path: string, isNovel?: boolean): string => {
    if (isNovel) {
      return `${this.site}/novels/${path}`;
    }
    // For chapters, path is "slug/chapterNumber"
    return `${this.site}/novels/${path}`;
  };
}

export default new NovelRestPlugin();

// trigger build
