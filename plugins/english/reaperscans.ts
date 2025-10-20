import { fetchApi } from '@libs/fetch';
import type { Plugin } from '@/types/plugin';

const API_BASE = 'https://api.reaperscans.com';
const MEDIA_BASE = 'https://media.reaperscans.com/file/4SRBHm/';

type ApiResponse<T> = {
  data: T;
  meta: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  };
};

type ReaperNovel = {
  title: string;
  thumbnail: string;
  series_slug: string;
};

class ReaperScans implements Plugin.PluginBase {
  id = 'reaperscans.com';
  name = 'Reaper Scans';
  version = '1.0.0';
  icon = 'src/en/reaperscans/icon.png';
  site = 'https://reaperscans.com';

  async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
    return this.query(page);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novelResp = await fetchApi(`${API_BASE}/series/${novelPath}`);
    const novel: {
      title: string;
      thumbnail: string;
      description: string;
      tags: string[];
      rating: number;
      status: string;
      alternative_names: string;
      author: string;
      studio: string;
    } = await novelResp.json();

    const chaptersResp = await fetchApi(
      `${API_BASE}/chapters/${novelPath}?perPage=${Number.MAX_SAFE_INTEGER}`,
    );
    const chapters: {
      chapter_slug: string;
      chapter_name: string;
      index: string;
      created_at: string;
    }[] = (await chaptersResp.json()).data;

    return {
      name: novel.title,
      cover: this.getCoverUrl(novel.thumbnail),
      author: novel.author,
      artist: novel.studio,
      status: novel.status,
      rating: novel.rating,
      summary: novel.description,
      genres: novel.tags.join(','),
      path: novelPath,
      chapters: chapters.reverse().map(chapter => ({
        path: `${novelPath}/${chapter.chapter_slug}`,
        name: chapter.chapter_name,
        chapterNumber: Number.parseFloat(chapter.index),
        releaseTime: chapter.created_at.substring(0, 10),
      })),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(`${this.site}/series/${chapterPath}`, {
      headers: { RSC: '1' },
    });
    const body = await result.text();
    return this.extractChapterContent(body);
  }

  private extractChapterContent(chapter: string): string {
    const lines = chapter.split('\n');
    const start = lines.findIndex(line => line.includes('<p'));

    const prefix = lines[start].substring(0, lines[start].indexOf('<'));
    const commonPrefix = prefix.substring(
      prefix.indexOf(':'),
      prefix.indexOf(','),
    );

    const end = lines.lastIndexOf(commonPrefix);
    const content = lines.slice(start, end).join('\n');

    const deduplicated = content.split(commonPrefix)[1];
    return deduplicated.substring(
      deduplicated.indexOf('<'),
      deduplicated.lastIndexOf('>') + 1,
    );
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    return this.query(1, searchTerm);
  }

  private async query(page = 1, search = ''): Promise<Plugin.NovelItem[]> {
    const link = `${API_BASE}/query?page=${page}&perPage=20&series_type=Novel&query_string=${search}&order=desc&orderBy=created_at&adult=true&status=All&tags_ids=[]`;
    const result = await fetchApi(link);
    const json: ApiResponse<ReaperNovel[]> = await result.json();

    return json.data.map(novel => ({
      name: novel.title,
      cover: novel.thumbnail.startsWith('novels/')
        ? MEDIA_BASE + novel.thumbnail
        : novel.thumbnail,
      path: novel.series_slug,
    }));
  }

  private getCoverUrl(thumbnail: string): string {
    return thumbnail.startsWith('novels/') ? MEDIA_BASE + thumbnail : thumbnail;
  }
}

export default new ReaperScans();
