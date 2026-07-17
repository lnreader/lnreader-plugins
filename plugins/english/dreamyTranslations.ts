import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type SeriesProject = {
  id: number;
  title: string;
  slug: string;
};

type SeriesListData = {
  projects: SeriesProject[];
  squareImageUrls: Record<string, string>;
};

type NovelChapter = {
  id: number;
  title: string;
  index: number;
  free: boolean;
};

type NovelDetailData = {
  project: {
    title: string;
    synopsis?: string;
    short_synopsis?: string;
    author?: string;
    genres?: string[];
    completed?: boolean;
  };
  chapters: NovelChapter[];
  coverUrl?: string;
};

type ChapterDetailData = {
  chapter: {
    title: string;
    content: string;
    free: boolean;
  };
  hasAccess: boolean;
};

class DreamyTranslationsPlugin implements Plugin.PluginBase {
  id = 'dreamyTranslations';
  name = 'Dreamy Translations';
  icon = 'src/en/dreamyTranslations/icon.png';
  site = 'https://dreamy-translations.com';
  version = '1.0.0';
  filters: Filters | undefined = undefined;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  webStorageUtilized?: boolean;
  private headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    Referer: this.site,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    RSC: '1',
  };

  /**
   * This site is a Next.js app whose pages render their novel/chapter data
   * client-side; the plain HTML response is just a loading skeleton. Requesting
   * the same URL with the `RSC` header returns Next.js's React Server Component
   * "flight" stream instead, which carries the real data as a series of
   * `<id>:<value>` lines. Most lines are directly JSON-parsable once the leading
   * `<id>:` is stripped; long text bodies are instead referenced elsewhere as
   * `"$<id>"` and streamed separately as a `<id>:T<hexByteLength>,<rawText>` line.
   */
  private async fetchRsc(url: string): Promise<string> {
    const res = await fetchApi(url, { headers: this.headers });
    return await res.text();
  }

  private extractRscObject<T>(rscText: string, marker: string): T {
    const line = rscText.split('\n').find(l => l.includes(marker));
    if (!line) {
      throw new Error('Could not locate expected data in server response');
    }
    const jsonStr = line.slice(line.indexOf(':') + 1);
    const parsed = JSON.parse(jsonStr);
    return parsed[3] as T;
  }

  /**
   * Text bodies aren't inline JSON: they're declared with their exact UTF-8
   * byte length (`T<hex>,`) and the following chunk starts immediately after
   * those bytes with no separator, so byte-accurate slicing is required.
   */
  private extractDeferredText(rscText: string, refId: string): string {
    const match = new RegExp(`(?:^|\\n)${refId}:T([0-9a-f]+),`).exec(rscText);
    if (!match) {
      throw new Error('Could not locate chapter content in server response');
    }
    const start = match.index + match[0].length;
    const byteLength = parseInt(match[1], 16);
    const rest = rscText.slice(start);
    const bytes = new TextEncoder().encode(rest).slice(0, byteLength);
    return new TextDecoder().decode(bytes);
  }

  private async fetchAllNovels(): Promise<Plugin.NovelItem[]> {
    const rscText = await this.fetchRsc(`${this.site}/series`);
    const data = this.extractRscObject<SeriesListData>(rscText, '"projects"');

    return data.projects.map(project => ({
      name: project.title,
      path: `/novel/${project.slug}`,
      cover: data.squareImageUrls[String(project.id)] || defaultCover,
    }));
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];
    return this.fetchAllNovels();
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const rscText = await this.fetchRsc(`${this.site}${novelPath}`);
    const data = this.extractRscObject<NovelDetailData>(
      rscText,
      '"chapters":[',
    );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: data.project.title || 'Untitled',
      cover: data.coverUrl || defaultCover,
      author: data.project.author,
      genres: (data.project.genres || []).join(', '),
      summary: data.project.synopsis || data.project.short_synopsis,
      status: data.project.completed
        ? NovelStatus.Completed
        : NovelStatus.Ongoing,
    };

    novel.chapters = data.chapters.map(chapter => ({
      name: chapter.free ? chapter.title : `🔒 ${chapter.title}`,
      path: `${novelPath}/chapter/${chapter.index}`,
      chapterNumber: chapter.index,
    }));

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const rscText = await this.fetchRsc(`${this.site}${chapterPath}`);
    const data = this.extractRscObject<ChapterDetailData>(
      rscText,
      '"chapter":{',
    );

    if (!data.hasAccess) {
      throw new Error(
        'This chapter requires premium access and cannot be read here.',
      );
    }

    const refMatch = /^\$([0-9a-zA-Z]+)$/.exec(data.chapter.content);
    if (!refMatch) {
      // Content was inlined directly rather than streamed separately.
      return `<p>${data.chapter.content}</p>`;
    }

    const rawText = this.extractDeferredText(rscText, refMatch[1]).replace(
      /\r\n/g,
      '\n',
    );

    return rawText
      .split(/\n{2,}/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean)
      .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];

    const novels = await this.fetchAllNovels();
    const term = searchTerm.toLowerCase();

    return novels.filter(novel => novel.name.toLowerCase().includes(term));
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new DreamyTranslationsPlugin();
