import { load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile, fetchProto } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

interface StringValue {
  value: string;
}

interface BoolValue {
  value: boolean;
}

interface DecimalValue {
  units: bigint;
  nanos: number;
}

interface Timestamp {
  seconds: number;
  nanos: number;
}

interface NovelEntry {
  name: string;
  coverUrl: string;
  slug: string;
}

interface RelatedChapterUserInfo {
  isChapterUnlocked?: BoolValue;
}

interface ChapterItem {
  entityId: number;
  name: string;
  slug: string;
  number?: DecimalValue;
  content?: StringValue;
  relatedUserInfo?: RelatedChapterUserInfo;
  offset: number;
  publishedAt?: Timestamp;
}

interface GetChapterResponse {
  item?: ChapterItem;
}

interface ChapterGroupCounts {
  total: number;
  advance: number;
  normal: number;
}

interface ChapterGroupItem {
  id: number;
  title: string;
  order: number;
  fromChapterNumber?: DecimalValue;
  toChapterNumber?: DecimalValue;
  chapterList: ChapterItem[];
  counts?: ChapterGroupCounts;
}

interface GetChapterListResponse {
  items: ChapterGroupItem[];
}

enum NovelItem_Status {
  Finished = 0,
  Active = 1,
  Hiatus = 2,
  All = -1,
}

interface NovelKarmaInfo {
  isActive: boolean;
  isFree: boolean;
  maxFreeChapter?: DecimalValue;
  canUnlockWithVip: boolean;
}

interface NovelItem {
  id: number;
  name: string;
  slug: string;
  status: NovelItem_Status;
  visible: boolean;
  description?: StringValue;
  synopsis?: StringValue;
  coverUrl?: StringValue;
  translatorName?: StringValue;
  authorName?: StringValue;
  karmaInfo?: NovelKarmaInfo;
  genres: string[];
}

interface GetNovelResponse {
  item?: NovelItem;
}

class WuxiaWorld implements Plugin.PluginBase {
  id = 'wuxiaworld';
  name = 'Wuxia World';
  icon = 'src/en/wuxiaworld/icon.png';
  site = 'https://www.wuxiaworld.com/';
  filters?: Filters | undefined;
  version = '0.5.0';

  parseNovels(data: { items: NovelEntry[] }) {
    const novels: Plugin.NovelItem[] = [];

    data.items.map((novel: NovelEntry) => {
      const name = novel.name;
      const cover = novel.coverUrl;
      const path = `novel/${novel.slug}/`;

      novels.push({
        name,
        cover,
        path,
      });
    });

    return novels;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    const link = `${this.site}api/novels`;

    const result = await fetchApi(link);
    const data = await result.json();

    return this.parseNovels(data);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const data = await fetchProto<GetNovelResponse>(
      {
        proto: this.proto,
        requestType: 'GetNovelRequest',
        responseType: 'GetNovelResponse',
        requestData: { slug: novelPath.split('/')[1] },
      },
      'https://api2.wuxiaworld.com/wuxiaworld.api.v2.Novels/GetNovel',
      {
        headers: {
          'Content-Type': 'application/grpc-web+proto',
        },
      },
    );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: data.item?.name || 'Untitled',
      cover: data.item?.coverUrl?.value,
      summary: parseHTML(
        data.item?.description?.value + '\n\n' + data.item?.synopsis?.value,
      ).text(),
      author: data.item?.authorName?.value,
      genres: data.item?.genres.join(','),
      chapters: [],
    };

    const status = data.item?.status;
    switch (status) {
      case NovelItem_Status.Active:
        novel.status = NovelStatus.Ongoing;
        break;
      case NovelItem_Status.Hiatus:
        novel.status = NovelStatus.OnHiatus;
        break;
      case NovelItem_Status.All:
        novel.status = NovelStatus.Unknown;
        break;
      default:
        novel.status = NovelStatus.Completed;
    }

    // novel.summary = loadedCheerio('.relative > .absolute:first')
    // 	   .children('span')
    // 	   .map((i,el) => loadedCheerio(el).text().trim())
    //     .toArray()
    //     .join('\n');

    // novel.genres = loadedCheerio("a.MuiLink-underlineNone")
    // 	   .map((i,el) => loadedCheerio(el).text())
    // 	   .toArray()
    // 	   .join(',');

    // novel.status = loadedCheerio("div.font-set-b10").text();

    const list = await fetchProto<GetChapterListResponse>(
      {
        proto: this.proto,
        requestType: 'GetChapterListRequest',
        responseType: 'GetChapterListResponse',
        requestData: { novelId: data.item?.id },
      },
      'https://api2.wuxiaworld.com/wuxiaworld.api.v2.Chapters/GetChapterList',
      {
        headers: {
          'Content-Type': 'application/grpc-web+proto',
        },
      },
    );

    const freeChapter =
      Number(data.item?.karmaInfo?.maxFreeChapter?.units) +
        (data.item?.karmaInfo?.maxFreeChapter?.nanos || 0) / 1000000000 || 50;

    const chapter: Plugin.ChapterItem[] = list.items.flatMap(
      (ChapterGroupItem: ChapterGroupItem) =>
        ChapterGroupItem.chapterList.map((chapterItem: ChapterItem) => ({
          page: ChapterGroupItem.title,
          name:
            chapterItem.name +
            (chapterItem.relatedUserInfo?.isChapterUnlocked?.value === false ||
            (!chapterItem.relatedUserInfo &&
              Number(chapterItem.number?.units) +
                (chapterItem.number?.nanos || 0) / 1000000000 >
                freeChapter)
              ? ' 🔒'
              : ''),
          path: novelPath + chapterItem.slug,
          chapterNumber: chapterItem.offset,
          releaseTime: new Date(
            (chapterItem.publishedAt?.seconds || 0) * 1000 +
              (chapterItem.publishedAt?.nanos || 0) / 1000000,
          ).toISOString(),
        })),
    );

    novel.chapters = chapter;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const paths = chapterPath.split('/');
    const data = await fetchProto<GetChapterResponse>(
      {
        proto: this.proto,
        requestType: 'GetChapterRequest',
        responseType: 'GetChapterResponse',
        requestData: {
          chapterProperty: {
            slugs: {
              novelSlug: paths[1],
              chapterSlug: paths[2],
            },
          },
        },
      },
      'https://api2.wuxiaworld.com/wuxiaworld.api.v2.Chapters/GetChapter',
      {
        headers: {
          'Content-Type': 'application/grpc-web+proto',
        },
      },
    );
    // loadedCheerio(".chapter-nav").remove();
    // loadedCheerio("#chapter-content > script").remove();
    // const chapterText = loadedCheerio("#chapter-content").html() || '';

    const chapterText = data.item?.content?.value || '';
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const searchUrl = 'https://www.wuxiaworld.com/api/novels/search?query=';

    const url = searchUrl + searchTerm;

    const result = await fetchApi(url);
    const data = await result.json();

    return this.parseNovels(data);
  }

  fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }

  proto = `
    syntax = "proto3";
    option optimize_for = CODE_SIZE;
    package wuxiaworld.api.v2;

    import public "google/protobuf/wrappers.proto";
    import public "google/protobuf/timestamp.proto";
    
    message StringValue {
        // The string value.
        string value = 1;
    }
    
    message BoolValue {
        // The bool value.
        bool value = 1;
    }
    
    message Int32Value {
        // The int32 value.
        int32 value = 1;
    }
    
    message DecimalValue {
        // Whole units part of the amount
        int64 units = 1;
        // Nano units of the amount (10^-9)
        // Must be the same sign as units
        sfixed32 nanos = 2;
    }
    
    message Timestamp {
        int64 seconds = 1;
        int32 nanos = 2;
    }

    message RelatedChapterUserInfo {
        optional BoolValue isChapterUnlocked = 1;
        optional BoolValue isNovelUnlocked = 2;
        optional BoolValue isChapterFavorite = 3;
        optional BoolValue isNovelOwned = 4;
        optional BoolValue isChapterOwned = 5;
    }

    message ChapterNovelInfo {
        int32 id = 1;
        string name = 2;
        optional StringValue coverUrl = 3;
        string slug = 4;
    }
    
    message ChapterParagraph {
        string id = 1;
        int32 chapterId = 2;
        int32 totalComments = 3;
        optional StringValue content = 4;
    }
    
    message ChapterItem {
        int32 entityId = 1;
        string name = 2;
        string slug = 3;
        optional DecimalValue number = 4;
        optional StringValue content = 5;
        int32 novelId = 6;
        bool visible = 7;
        bool isTeaser = 8;
        optional Timestamp whenToPublish = 9;
        bool spoilerTitle = 10;
        bool allowComments = 11;
        optional ChapterNovelInfo novelInfo = 14;
        optional RelatedChapterUserInfo relatedUserInfo = 16;
        int32 offset = 17;
        optional Timestamp publishedAt = 18;
        optional StringValue translatorThoughts = 19;
        repeated ChapterParagraph paragraphs = 21;
    }
    
    message ChapterGroupCounts {
        int32 total = 1;
        int32 advance = 2;
        int32 normal = 3;
    }
    
    message ChapterGroupItem {
        int32 id = 1;
        string title = 2;
        int32 order = 3;
        optional DecimalValue fromChapterNumber = 4;
        optional DecimalValue toChapterNumber = 5;
        repeated ChapterItem chapterList = 6;
        optional ChapterGroupCounts counts = 7;
    }
    
    message GetChapterListRequest {
        int32 novelId = 1;
        message BaseChapterInfo {
            oneof chapterInfo {
                int32 chapterId = 1;
                string slug = 2;
                int32 offset = 3;
            }
        }
        message FilterChapters {
            optional Int32Value chapterGroupId = 1;
            optional BoolValue isAdvanceChapter = 2;
            optional BaseChapterInfo baseChapter = 3;
        }
        optional FilterChapters filter = 2;
        optional Int32Value count = 3;
    }
    
    message GetChapterListResponse {
        repeated ChapterGroupItem items = 1;
        optional ChapterNovelInfo novelInfo = 2;
    }

    message GetChapterByProperty {
        message ByNovelAndChapterSlug {
            string novelSlug = 1;
            string chapterSlug = 2;
        }
        oneof byProperty {
            int32 chapterId = 1;
            ByNovelAndChapterSlug slugs = 2;
        }
    }
    
    message GetChapterRequest {
        optional GetChapterByProperty chapterProperty = 1;
    }
    
    message GetChapterResponse {
        optional ChapterItem item = 1;
    }

    message NovelKarmaInfo {
        bool isActive = 1;
        bool isFree = 2;
        optional DecimalValue maxFreeChapter = 3;
        bool canUnlockWithVip = 4;
    }

    message NovelItem {
        int32 id = 1;
        string name = 2;
        string slug = 3;
        enum Status {
            Finished = 0;
            Active = 1;
            Hiatus = 2;
            All = -1;
        }
        Status status = 4;
        bool visible = 7;
        optional StringValue description = 8;
        optional StringValue synopsis = 9;
        optional StringValue coverUrl = 10;
        optional StringValue translatorName = 11;
        optional StringValue authorName = 13;
        optional NovelKarmaInfo karmaInfo = 14;
        repeated string genres = 16;
    }

    message GetNovelRequest {
        oneof selector {
            int32 id = 1;
            string slug = 2;
        }
    }
    
    message GetNovelResponse {
        optional NovelItem item = 1;
    }

    service Chapters {
        rpc GetChapterList(GetChapterListRequest) returns (GetChapterListResponse);
        rpc GetChapter(GetChapterRequest) returns (GetChapterResponse);
    }

    service Novels {
        rpc GetNovel(GetNovelRequest) returns (GetNovelResponse);
    }
    `;
}

export default new WuxiaWorld();
