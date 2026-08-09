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
   * Dreamy Translations is a Next.js application.
   *
   * Normal page requests return a loading shell, while requests
   * containing the RSC header return a React Server Component
   * Flight response containing the actual page data.
   */
  private async fetchRsc(url: string): Promise<string> {
    const res = await fetchApi(url, {
      headers: this.headers,
    });

    return await res.text();
  }

  /**
   * Extract an object from a normal JSON RSC record.
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
        `Could not find "${marker}" in Dreamy Translations RSC response`,
      );
    }

    const colonIndex = line.indexOf(':');

    if (colonIndex === -1) {
      throw new Error(
        'Invalid Dreamy Translations RSC record',
      );
    }

    const jsonStr = line.slice(colonIndex + 1);
    const parsed = JSON.parse(jsonStr);

    /*
     * Next.js Flight records commonly contain the actual
     * application data at index 3.
     */
    if (
      Array.isArray(parsed) &&
      parsed.length > 3
    ) {
      return parsed[3] as T;
    }

    return parsed as T;
  }

  /**
   * Extract a streamed text record.
   *
   * RSC text records look like:
   *
   *   123:T1a,<raw text>
   *
   * The length is expressed as UTF-8 byte length, so the
   * response must be sliced by encoded bytes rather than
   * JavaScript string characters.
   */
  private extractDeferredText(
    rscText: string,
    refId: string,
  ): string {
    const escapedId = refId.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );

    const match = new RegExp(
      `(?:^|\\n)${escapedId}:T([0-9a-fA-F]+),`,
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

    const bytes = new TextEncoder().encode(
      rest,
    );

    return new TextDecoder().decode(
      bytes.slice(0, byteLength),
    );
  }

  /**
   * Find a streamed text record.
   *
   * This is a non-throwing version of extractDeferredText()
   * used when chapter content may already be inline.
   */
  private findDeferredText(
    rscText: string,
    refId: string,
  ): string | undefined {
    const escapedId = refId.replace(
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

    const bytes = new TextEncoder().encode(
      rscText.slice(start),
    );

    return new TextDecoder().decode(
      bytes.slice(0, byteLength),
    );
  }

  /**
   * Chapter-specific RSC extraction.
   *
   * Chapter responses are not always represented by a
   * directly JSON.parse()-able record. We therefore:
   *
   * 1. Try the normal RSC record format.
   * 2. Search for the chapter object directly.
   * 3. Parse a balanced JSON object.
   * 4. Fall back to other JSON-looking Flight records.
   */
  private extractChapterObject(
    rscText: string,
  ): ChapterDetailData {
    const lines = rscText.split('\n');

    /*
     * First attempt: normal Flight record.
     */
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

          if (
            Array.isArray(parsed) &&
            parsed.length > 3 &&
            parsed[3]
          ) {
            return parsed[3] as ChapterDetailData;
          }

          if (
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed)
          ) {
            return parsed as ChapterDetailData;
          }
        } catch {
          /*
           * The record isn't directly JSON.
           * Continue with the fallbacks.
           */
        }
      }
    }

    /*
     * Second attempt: locate the chapter object
     * directly inside the Flight response.
     */
    const marker = '"chapter":{';
    const markerIndex =
      rscText.indexOf(marker);

    if (markerIndex === -1) {
      throw new Error(
        'Could not locate chapter data in server response',
      );
    }

    let start = -1;

    for (
      let i = markerIndex;
      i >= 0;
      i--
    ) {
      if (rscText[i] !== '{') {
        continue;
      }

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
     * Find the matching closing brace while
     * respecting quoted strings and escapes.
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
            return JSON.parse(
              json,
            ) as ChapterDetailData;
          } catch {
            break;
          }
        }
      }
    }

    /*
     * Final fallback: inspect JSON-looking
     * Flight records.
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

        if (Array.isArray(parsed)) {
          for (const value of parsed) {
            if (
              value &&
              typeof value === 'object' &&
              !Array.isArray(value) &&
              'chapter' in value
            ) {
              return value as ChapterDetailData;
            }
          }
        }

        if (
          parsed &&
          typeof parsed === 'object' &&
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

  /**
   * Fetch every novel from the series page.
   */
  private async fetchAllNovels(): Promise<
    Plugin.NovelItem[]
  > {
    const rscText =
      await this.fetchRsc(
        `${this.site}/series`,
      );

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
  ): Promise<Plugin.NovelItem[]> {
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
        (data.project.genres || [])
          .join(', '),
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
     * Chapter content may be a reference to
     * a streamed RSC text record.
     */
    const refMatch =
      typeof content === 'string'
        ? /^\$([0-9a-zA-Z]+)$/.exec(
            content,
          )
        : null;

    if (refMatch) {
      const streamed =
        this.findDeferredText(
          rscText,
          refMatch[1],
        );

      if (
        streamed !== undefined
      ) {
        content = streamed;
      }
    }

    if (
      !content ||
      !content.trim()
    ) {
      throw new Error(
        'Dreamy Translations returned an empty chapter',
      );
    }

    /*
     * Normalize line endings.
     *
     * IMPORTANT:
     * We intentionally do NOT HTML-escape the content.
     * Dreamy supplies actual HTML, including <img> tags.
     */
    const normalized =
      content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        /*
         * Dreamy currently returns image src values
         * in this form:
         *
         * src="[https://example.com/image](https://example.com/image)"
         *
         * Convert that into:
         *
         * src="https://example.com/image"
         */
        .replace(
          /(\bsrc\s*=\s*["'])\[([^\]]+)\]\(\2\)(["'])/gi,
          '$1$2$3',
        );

    return normalized
      .split(/\n{2,}/)
      .map(
        paragraph =>
          paragraph.trim(),
      )
      .filter(Boolean)
      .map(paragraph => {
        /*
         * Don't wrap standalone images in <p>.
         */
        if (
          /^<img\b[^>]*\/?>$/i.test(
            paragraph,
          )
        ) {
          return paragraph;
        }

        /*
         * Preserve Dreamy's HTML while
         * converting ordinary newlines to
         * reader line breaks.
         */
        return `<p>${paragraph.replace(
          /\n/g,
          '<br>',
        )}</p>`;
      })
      .join('');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) {
      return [];
    }

    const novels =
      await this.fetchAllNovels();

    const term =
      searchTerm.toLowerCase();

    return novels.filter(
      novel =>
        novel.name
          .toLowerCase()
          .includes(term),
    );
  }

  resolveUrl = (path: string) =>
    this.site + path;
}

export default new DreamyTranslationsPlugin();
