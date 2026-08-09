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
  version = '1.0.1';

  filters: Filters | undefined = undefined;
  imageRequestInit?: Plugin.ImageRequestInit | undefined =
    undefined;

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
   * Fetch the Next.js React Server Component response.
   */
  private async fetchRsc(
    url: string,
  ): Promise<string> {
    const res = await fetchApi(url, {
      headers: this.headers,
    });

    return await res.text();
  }

  /**
   * Original RSC parser.
   *
   * This is intentionally kept compatible with the original
   * working series/novel parser.
   */
  private extractRscObject<T>(
    rscText: string,
    marker: string,
  ): T {
    const line = rscText
      .split('\n')
      .find(l => l.includes(marker));

    if (!line) {
      throw new Error(
        `Could not locate expected data: ${marker}`,
      );
    }

    const colonIndex = line.indexOf(':');

    if (colonIndex === -1) {
      throw new Error(
        `Invalid RSC record for: ${marker}`,
      );
    }

    const jsonStr = line.slice(
      colonIndex + 1,
    );

    const parsed = JSON.parse(jsonStr);

    return parsed[3] as T;
  }

  /**
   * Extract a streamed RSC text record.
   *
   * Dreamy uses records in the form:
   *
   *   <id>:T<hex byte length>,<UTF-8 text>
   */
  private extractDeferredText(
    rscText: string,
    refId: string,
  ): string {
    const match = new RegExp(
      `(?:^|\\n)${refId}:T([0-9a-fA-F]+),`,
    ).exec(rscText);

    if (!match) {
      throw new Error(
        'Could not locate chapter content in server response',
      );
    }

    const start =
      match.index + match[0].length;

    const byteLength = parseInt(
      match[1],
      16,
    );

    const rest = rscText.slice(start);

    const bytes =
      new TextEncoder().encode(rest);

    return new TextDecoder().decode(
      bytes.slice(0, byteLength),
    );
  }

  /**
   * Find a streamed text record without assuming that the
   * reference ID is purely numeric.
   *
   * React Flight references can contain alphanumeric IDs.
   */
  private findDeferredText(
    rscText: string,
    refId: string,
  ): string | undefined {
    const escapedId =
      refId.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      );

    const match = new RegExp(
      `(?:^|\\n)${escapedId}:T([0-9a-fA-F]+),`,
    ).exec(rscText);

    if (!match) {
      return undefined;
    }

    const start =
      match.index + match[0].length;

    const byteLength = parseInt(
      match[1],
      16,
    );

    const bytes =
      new TextEncoder().encode(
        rscText.slice(start),
      );

    return new TextDecoder().decode(
      bytes.slice(0, byteLength),
    );
  }

  /**
   * Chapter-specific RSC extraction.
   *
   * The original parser assumes the matching line can be parsed
   * directly with JSON.parse(). The chapter response currently
   * contains a Flight record where that assumption is not valid.
   *
   * We therefore:
   *
   * 1. Look for the chapter record.
   * 2. Try the original tuple parser.
   * 3. If that fails, locate the JSON object containing the
   *    chapter data within the response.
   */
  private extractChapterObject(
    rscText: string,
  ): ChapterDetailData {
    /*
     * First preserve the old behavior exactly.
     */
    const lines = rscText.split('\n');

    const chapterLine = lines.find(
      line =>
        line.includes('"chapter"') &&
        line.includes('"hasAccess"'),
    );

    if (chapterLine) {
      const colonIndex =
        chapterLine.indexOf(':');

      if (colonIndex !== -1) {
        const payload =
          chapterLine.slice(
            colonIndex + 1,
          );

        try {
          const parsed =
            JSON.parse(payload);

          /*
           * Original Dreamy structure:
           *
           * [ ..., ..., ..., actualData ]
           */
          if (
            Array.isArray(parsed) &&
            parsed.length > 3 &&
            parsed[3]
          ) {
            return parsed[3] as ChapterDetailData;
          }

          /*
           * Also support the case where the data itself
           * is returned directly.
           */
          if (
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed)
          ) {
            return parsed as ChapterDetailData;
          }
        } catch {
          /*
           * Continue to the fallback parser below.
           */
        }
      }
    }

    /*
     * Fallback:
     *
     * Search the entire response for:
     *
     *   "chapter":{...
     *
     * and extract the balanced JSON object containing it.
     */
    const marker =
      '"chapter":{';

    const markerIndex =
      rscText.indexOf(marker);

    if (markerIndex === -1) {
      throw new Error(
        'Could not locate chapter data in server response',
      );
    }

    /*
     * Find the beginning of the object containing
     * the "chapter" property.
     *
     * Walk backwards while tracking JSON braces.
     */
    let start = -1;

    for (
      let i = markerIndex;
      i >= 0;
      i--
    ) {
      if (rscText[i] !== '{') {
        continue;
      }

      /*
       * Test whether this looks like the beginning
       * of a JSON object containing our marker.
       */
      const candidate =
        rscText.slice(
          i,
          markerIndex + marker.length,
        );

      if (
        candidate.startsWith('{') &&
        candidate.includes('"chapter"')
      ) {
        start = i;
        break;
      }
    }

    if (start === -1) {
      throw new Error(
        'Could not locate chapter object in server response',
      );
    }

    /*
     * Find the matching closing brace while respecting
     * quoted strings and escaped characters.
     */
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (
      let i = start;
      i < rscText.length;
      i++
    ) {
      const char = rscText[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }

        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;

        if (depth === 0) {
          const json =
            rscText.slice(
              start,
              i + 1,
            );

          try {
            const parsed =
              JSON.parse(json);

            return parsed as ChapterDetailData;
          } catch {
            break;
          }
        }
      }
    }

    /*
     * Final fallback:
     *
     * The chapter object may be embedded inside an RSC
     * JSON array/tuple. Search each line for a JSON payload
     * and inspect parsed arrays.
     */
    for (const line of lines) {
      const colon =
        line.indexOf(':');

      if (colon === -1) {
        continue;
      }

      const payload =
        line.slice(colon + 1);

      if (
        !payload.startsWith('[') &&
        !payload.startsWith('{')
      ) {
        continue;
      }

      try {
        const parsed =
          JSON.parse(payload);

        if (
          Array.isArray(parsed)
        ) {
          for (
            const value of parsed
          ) {
            if (
              value &&
              typeof value ===
                'object' &&
              !Array.isArray(value) &&
              'chapter' in value
            ) {
              return value as ChapterDetailData;
            }
          }
        }

        if (
          parsed &&
          typeof parsed ===
            'object' &&
          !Array.isArray(parsed) &&
          'chapter' in parsed
        ) {
          return parsed as ChapterDetailData;
        }
      } catch {
        // Ignore unrelated RSC records.
      }
    }

    throw new Error(
      'Could not parse chapter data from Dreamy Translations response',
    );
  }

  private async fetchAllNovels(): Promise<
    Plugin.NovelItem[]
  > {
    const rscText =
      await this.fetchRsc(
        `${this.site}/series`,
      );

    /*
     * Keep the original working series parser.
     */
    const data =
      this.extractRscObject<SeriesListData>(
        rscText,
        '"projects"',
      );

    return data.projects.map(
      project => ({
        name: project.title,
        path: `/novel/${project.slug}`,
        cover:
          data.squareImageUrls[
            String(project.id)
          ] || defaultCover,
      }),
    );
  }

  async popularNovels(
    pageNo: number,
  ): Promise<
    Plugin.NovelItem[]
  > {
    if (pageNo !== 1) {
      return [];
    }

    return this.fetchAllNovels();
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel> {
    const rscText =
      await this.fetchRsc(
        `${this.site}${novelPath}`,
      );

    /*
     * Keep the original working novel parser.
     */
    const data =
      this.extractRscObject<NovelDetailData>(
        rscText,
        '"chapters":[',
      );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        data.project.title ||
        'Untitled',
      cover:
        data.coverUrl ||
        defaultCover,
      author:
        data.project.author,
      genres:
        (
          data.project.genres ||
          []
        ).join(', '),
      summary:
        data.project.synopsis ||
        data.project.short_synopsis,
      status:
        data.project.completed
          ? NovelStatus.Completed
          : NovelStatus.Ongoing,
    };

    novel.chapters =
      data.chapters.map(
        chapter => ({
          name: chapter.free
            ? chapter.title
            : `🔒 ${chapter.title}`,
          path:
            `${novelPath}/chapter/${chapter.index}`,
          chapterNumber:
            chapter.index,
        }),
      );

    return novel;
  }

  async parseChapter(
    chapterPath: string,
  ): Promise<string> {
    const rscText =
      await this.fetchRsc(
        `${this.site}${chapterPath}`,
      );

    /*
     * This is the only major change from your original plugin.
     */
    const data =
      this.extractChapterObject(
        rscText,
      );

    if (!data.hasAccess) {
      throw new Error(
        'This chapter requires premium access and cannot be read here.',
      );
    }

    let content =
      data.chapter.content;

    /*
     * Content may be an RSC reference such as "$123".
     *
     * First try the original deferred-text behavior.
     */
    const refMatch =
      typeof content === 'string'
        ? /^\$([0-9a-zA-Z]+)$/.exec(
            content,
          )
        : null;

    if (refMatch) {
      const refId =
        refMatch[1];

      const rawText =
        this.findDeferredText(
          rscText,
          refId,
        );

      if (rawText !== undefined) {
        content = rawText;
      }
    }

    /*
     * If the content is already inline, use it directly.
     */
    if (
      !content ||
      !content.trim()
    ) {
      throw new Error(
        'Dreamy Translations returned an empty chapter',
      );
    }

    const normalized =
      content
        .replace(
          /\r\n/g,
          '\n',
        )
        .replace(
          /\r/g,
          '\n',
        );

    /*
     * Escape HTML so chapter text cannot accidentally
     * become markup.
     */
    const escapeHtml =
      (text: string): string =>
        text
          .replace(
            /&/g,
            '&amp;',
          )
          .replace(
            /</g,
            '&lt;',
          )
          .replace(
            />/g,
            '&gt;',
          )
          .replace(
            /"/g,
            '&quot;',
          )
          .replace(
            /'/g,
            '&#39;',
          );

    return normalized
      .split(/\n{2,}/)
      .map(
        paragraph =>
          paragraph.trim(),
      )
      .filter(Boolean)
      .map(
        paragraph =>
          `<p>${escapeHtml(
            paragraph,
          ).replace(
            /\n/g,
            '<br>',
          )}</p>`,
      )
      .join('');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<
    Plugin.NovelItem[]
  > {
    if (pageNo !== 1) {
      return [];
    }

    const novels =
      await this.fetchAllNovels();

    const term =
      searchTerm
        .trim()
        .toLowerCase();

    return novels.filter(
      novel =>
        novel.name
          .toLowerCase()
          .includes(term),
    );
  }

  resolveUrl = (
    path: string,
  ) =>
    this.site + path;
}

export default new DreamyTranslationsPlugin();
