import { FilterToValues, Filters } from '@libs/filterInputs';
export namespace Plugin {
  export interface ChapterItem {
    name: string;
    path: string;
    /**
     * "YYYY-MM-DD" format or ISO string format
     * ```js
     * chapter.releaseTime = '2023-12-02';
     * chapter.releaseTime = new Date(2023, 12, 02).toISOString();
     * ```
     * or just a string
     */
    releaseTime?: string | null;
    chapterNumber?: number;
    /**
     * For novel without pages only
     */
    page?: string;
  }
  export interface NovelItem {
    name: string;
    path: string;
    cover?: string;
  }
  export interface SourceNovel extends NovelItem {
    /** Comma separated genre list */
    genres?: string;
    summary?: string;
    author?: string;
    artist?: string;
    status?: string;
    chapters?: ChapterItem[];
  }

  export interface SourcePage {
    chapters: ChapterItem[];
  }

  export interface PopularNovelsOptions<
    Q extends Filters | undefined = Filters | undefined,
  > {
    showLatestNovels?: boolean;
    filters?: Q extends undefined ? undefined : FilterToValues<Q>;
  }
  export interface PluginItem {
    id: string;
    name: string;
    version: string;
    icon: string;
    site: string;
  }
  export interface ImageRequestInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }

  export interface PluginBase {
    id: string;
    name: string;
    /**
     * Relative path without icon. E.g:
     * ```js
     * "src/vi/hakolightnovel/icon.png"
     * ```
     */
    icon: string;
    site: string;
    imageRequestInit?: ImageRequestInit;
    filters?: Filters;
    version: string;
    //flag indicates whether access to LocalStorage, SesesionStorage is required.
    webStorageUtilized?: boolean;
    popularNovels(
      pageNo: number,
      options: PopularNovelsOptions<Filters>,
    ): Promise<NovelItem[]>;
    /**
     *
     * @param novelPath
     * @returns novel metadata and its first page
     */
    parseNovel(novelPath: string): Promise<SourceNovel>;
    parseChapter(chapterPath: string): Promise<string>;
    searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]>;
    /**
     *
     * @param url Image url
     * @returns {Promise<string|undefined>} Base64 of image
     * @example
     * ```ts
     *  const headers = {
     *      Referer: "https://ln.hako.vn",
     *   };
     *  return await fetchFile(url, { headers: headers });
     * ```
     */
    resolveUrl?(path: string, isNovel?: boolean): string;
  }

  export interface PagePlugin extends PluginBase {
    parseNovel(
      novelPath: string,
    ): Promise<SourceNovel & { totalPages: number }>;
    parsePage(novelPath: string, page: string): Promise<SourcePage>;
  }
}

export namespace HTMLParser2Util {
  interface HandlerBase {
    onopentag?(name: string, attribs: { [s: string]: string }): void;
    ontext?(data: string): void;
    onclosetag?(name: string, isImplied: boolean): void;
  }

  export interface Handler extends HandlerBase {
    isStarted?: boolean;
    isDone?: boolean;
  }

  // route htmlparser2 event to handlers
  export interface HandlerRouter<ActionType extends string>
    extends HandlerBase {
    handlers: Record<ActionType, Handler | undefined>;
    action: ActionType;
  }
}
