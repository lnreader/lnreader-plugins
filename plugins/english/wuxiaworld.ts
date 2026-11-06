import { load as parseHTML } from 'cheerio';
import { fetchApi, FetchInit } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

type DecimalValue = {
  units: number;
  nanos: number;
};

type Timestamp = {
  seconds: number;
  nanos: number;
};

type ChapterItem = {
  name: string;
  slug: string;
  number?: DecimalValue;
  content?: string;
  relatedUserInfo?: { isChapterUnlocked?: boolean };
  offset: number;
  publishedAt?: Timestamp;
};

type ChapterGroupItem = {
  title: string;
  chapterList: ChapterItem[];
};

type NovelItem = {
  id?: number;
  name?: string;
  slug?: string;
  status?: number;
  description?: string;
  synopsis?: string;
  coverUrl?: string;
  authorName?: string;
  maxFreeChapter?: DecimalValue;
  genres: string[];
};

type NovelEntry = {
  name: string;
  coverUrl: string;
  slug: string;
};

/**
 * Cursor over a protobuf message's bytes.
 */
type ByteReader = {
  buffer: Uint8Array;
  offset: number;
};

enum NovelItem_Status {
  Finished = 0,
  Active = 1,
  Hiatus = 2,
  All = -1,
}

/**
 * WuxiaWorld only speaks gRPC-web (`api2.wuxiaworld.com`), so requests and
 * responses are protobuf-encoded here instead of via `@libs/fetch`'s
 * `fetchProto`. The app implementation of `fetchProto` reads the response with
 * `FileReader.readAsDataURL` and cuts a fixed
 * `data:application/octet-stream;base64,` prefix off the result, while React
 * Native builds that prefix from the blob's own MIME type, which the app's
 * fetch implementation takes from the response headers. WuxiaWorld answers
 * with `application/grpc-web`, whose prefix is shorter, so the fixed slice
 * swallows the first bytes of the message frame and protobufjs rejects the
 * request with `illegal tag: field number 0` - the app then never resolves
 * `parseNovel` and the novel screen loads forever. `Response.arrayBuffer()`
 * returns the raw bytes and does not have that problem.
 */

const readVarint = (reader: ByteReader) => {
  let value = 0;
  let multiplier = 1;

  while (reader.offset < reader.buffer.length) {
    const byte = reader.buffer[reader.offset++];
    value += (byte & 0x7f) * multiplier;
    if (byte < 0x80) return value;
    multiplier *= 128;
    // Wider varints (protobuf encodes negative values as uint64) exceed Number
    // precision; -1 is the only negative value this API defines.
    if (multiplier > 9007199254740992) return -1;
  }

  return value;
};

const readFieldHeader = (reader: ByteReader) => {
  const header = readVarint(reader);
  return { field: Math.floor(header / 8), wireType: header % 8 };
};

const readBytes = (reader: ByteReader, length: number) => {
  const bytes = reader.buffer.subarray(reader.offset, reader.offset + length);
  reader.offset += length;
  return bytes;
};

const readNested = (reader: ByteReader): ByteReader => ({
  buffer: readBytes(reader, readVarint(reader)),
  offset: 0,
});

const readSfixed32 = (reader: ByteReader) => {
  const value =
    reader.buffer[reader.offset] |
    (reader.buffer[reader.offset + 1] << 8) |
    (reader.buffer[reader.offset + 2] << 16) |
    (reader.buffer[reader.offset + 3] << 24);
  reader.offset += 4;
  return value;
};

const skipField = (reader: ByteReader, wireType: number) => {
  switch (wireType) {
    case 0:
      readVarint(reader);
      return true;
    case 1:
      reader.offset += 8;
      return true;
    case 2:
      readBytes(reader, readVarint(reader));
      return true;
    case 5:
      reader.offset += 4;
      return true;
    default:
      return false;
  }
};

const decodeUtf8 = (bytes: Uint8Array) => {
  let text = '';
  let index = 0;

  while (index < bytes.length) {
    const first = bytes[index++];

    if (first < 0x80) {
      text += String.fromCharCode(first);
    } else if (first < 0xe0) {
      text += String.fromCharCode(
        ((first & 0x1f) << 6) | (bytes[index++] & 0x3f),
      );
    } else if (first < 0xf0) {
      const second = bytes[index++];
      const third = bytes[index++];
      text += String.fromCharCode(
        ((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f),
      );
    } else {
      const second = bytes[index++];
      const third = bytes[index++];
      const fourth = bytes[index++];
      const surrogate =
        (((first & 0x07) << 18) |
          ((second & 0x3f) << 12) |
          ((third & 0x3f) << 6) |
          (fourth & 0x3f)) -
        0x10000;
      text += String.fromCharCode(
        0xd800 + (surrogate >> 10),
        0xdc00 + (surrogate & 0x3ff),
      );
    }
  }

  return text;
};

const encodeUtf8 = (text: string) => {
  const bytes: number[] = [];

  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const pair = text.charCodeAt(index + 1);
      index++;
      const codePoint =
        (0x10000 + ((code - 0xd800) << 10) + (pair - 0xdc00)) & 0x3ffff;
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  return bytes;
};

const writeVarint = (bytes: number[], value: number) => {
  let remaining = value;

  while (remaining >= 128) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 128);
  }

  bytes.push(remaining);
};

const writeTag = (bytes: number[], field: number, wireType: number) =>
  writeVarint(bytes, field * 8 + wireType);

const writeBytes = (bytes: number[], payload: number[]) => {
  for (const byte of payload) {
    bytes.push(byte);
  }
};

const writeStringField = (bytes: number[], field: number, text: string) => {
  const payload = encodeUtf8(text);
  writeTag(bytes, field, 2);
  writeVarint(bytes, payload.length);
  writeBytes(bytes, payload);
};

const writeMessageField = (
  bytes: number[],
  field: number,
  payload: number[],
) => {
  writeTag(bytes, field, 2);
  writeVarint(bytes, payload.length);
  writeBytes(bytes, payload);
};

/**
 * `GetNovelRequest` selects a novel by slug (field 2 of its `selector` oneof).
 */
const encodeGetNovelRequest = (slug: string) => {
  const request: number[] = [];
  writeStringField(request, 2, slug);
  return request;
};

/**
 * `GetChapterListRequest.novelId` is field 1.
 */
const encodeGetChapterListRequest = (novelId: number) => {
  const request: number[] = [];
  writeTag(request, 1, 0);
  writeVarint(request, novelId);
  return request;
};

/**
 * `GetChapterRequest.chapterProperty` (field 1) holds a
 * `GetChapterByProperty.slugs` (field 2) of `{ novelSlug, chapterSlug }`.
 */
const encodeGetChapterRequest = (novelSlug: string, chapterSlug: string) => {
  const slugs: number[] = [];
  writeStringField(slugs, 1, novelSlug);
  writeStringField(slugs, 2, chapterSlug);

  const property: number[] = [];
  writeMessageField(property, 2, slugs);

  const request: number[] = [];
  writeMessageField(request, 1, property);
  return request;
};

const decodeStringValue = (reader: ByteReader) => {
  let text = '';

  while (reader.offset < reader.buffer.length) {
    const { field, wireType } = readFieldHeader(reader);
    if (field === 1 && wireType === 2) {
      text = decodeUtf8(readBytes(reader, readVarint(reader)));
    } else if (!skipField(reader, wireType)) {
      break;
    }
  }

  return text;
};

const decodeDecimalValue = (reader: ByteReader): DecimalValue => {
  const value: DecimalValue = { units: 0, nanos: 0 };

  while (reader.offset < reader.buffer.length) {
    const { field, wireType } = readFieldHeader(reader);
    if (field === 1 && wireType === 0) {
      value.units = readVarint(reader);
    } else if (field === 2 && wireType === 5) {
      value.nanos = readSfixed32(reader);
    } else if (!skipField(reader, wireType)) {
      break;
    }
  }

  return value;
};

const decodeTimestamp = (reader: ByteReader): Timestamp => {
  const value: Timestamp = { seconds: 0, nanos: 0 };

  while (reader.offset < reader.buffer.length) {
    const { field, wireType } = readFieldHeader(reader);
    if (field === 1 && wireType === 0) {
      value.seconds = readVarint(reader);
    } else if (field === 2 && wireType === 0) {
      value.nanos = readVarint(reader);
    } else if (!skipField(reader, wireType)) {
      break;
    }
  }

  return value;
};

const decodeRelatedChapterUserInfo = (reader: ByteReader) => {
  const info: { isChapterUnlocked?: boolean } = {};

  while (reader.offset < reader.buffer.length) {
    const { field, wireType } = readFieldHeader(reader);
    if (field === 1 && wireType === 0) {
      info.isChapterUnlocked = readVarint(reader) !== 0;
    } else if (!skipField(reader, wireType)) {
      break;
    }
  }

  return info;
};

const decodeChapterItem = (reader: ByteReader): ChapterItem => {
  const item: ChapterItem = { name: '', slug: '', offset: 0 };

  while (reader.offset < reader.buffer.length) {
    const { field, wireType } = readFieldHeader(reader);
    if (field === 2 && wireType === 2) {
      item.name = decodeUtf8(readBytes(reader, readVarint(reader)));
    } else if (field === 3 && wireType === 2) {
      item.slug = decodeUtf8(readBytes(reader, readVarint(reader)));
    } else if (field === 4 && wireType === 2) {
      item.number = decodeDecimalValue(readNested(reader));
    } else if (field === 5 && wireType === 2) {
      item.content = decodeStringValue(readNested(reader));
    } else if (field === 16 && wireType === 2) {
      item.relatedUserInfo = decodeRelatedChapterUserInfo(readNested(reader));
    } else if (field === 17 && wireType === 0) {
      item.offset = readVarint(reader);
    } else if (field === 18 && wireType === 2) {
      item.publishedAt = decodeTimestamp(readNested(reader));
    } else if (!skipField(reader, wireType)) {
      break;
    }
  }

  return item;
};

const decodeChapterGroupItem = (reader: ByteReader): ChapterGroupItem => {
  const group: ChapterGroupItem = { title: '', chapterList: [] };

  while (reader.offset < reader.buffer.length) {
    const { field, wireType } = readFieldHeader(reader);
    if (field === 2 && wireType === 2) {
      group.title = decodeUtf8(readBytes(reader, readVarint(reader)));
    } else if (field === 6 && wireType === 2) {
      group.chapterList.push(decodeChapterItem(readNested(reader)));
    } else if (!skipField(reader, wireType)) {
      break;
    }
  }

  return group;
};

const decodeChapterListResponse = (reader: ByteReader) => {
  const groups: ChapterGroupItem[] = [];

  while (reader.offset < reader.buffer.length) {
    const { field, wireType } = readFieldHeader(reader);
    if (field === 1 && wireType === 2) {
      groups.push(decodeChapterGroupItem(readNested(reader)));
    } else if (!skipField(reader, wireType)) {
      break;
    }
  }

  return groups;
};

const readNovelKarmaInfo = (reader: ByteReader) => {
  let maxFreeChapter: DecimalValue | undefined;

  while (reader.offset < reader.buffer.length) {
    const { field, wireType } = readFieldHeader(reader);
    if (field === 3 && wireType === 2) {
      maxFreeChapter = decodeDecimalValue(readNested(reader));
    } else if (!skipField(reader, wireType)) {
      break;
    }
  }

  return maxFreeChapter;
};

const decodeNovelItem = (reader: ByteReader): NovelItem => {
  const item: NovelItem = { genres: [] };

  while (reader.offset < reader.buffer.length) {
    const { field, wireType } = readFieldHeader(reader);
    if (field === 1 && wireType === 0) {
      item.id = readVarint(reader);
    } else if (field === 2 && wireType === 2) {
      item.name = decodeUtf8(readBytes(reader, readVarint(reader)));
    } else if (field === 3 && wireType === 2) {
      item.slug = decodeUtf8(readBytes(reader, readVarint(reader)));
    } else if (field === 4 && wireType === 0) {
      item.status = readVarint(reader);
    } else if (field === 8 && wireType === 2) {
      item.description = decodeStringValue(readNested(reader));
    } else if (field === 9 && wireType === 2) {
      item.synopsis = decodeStringValue(readNested(reader));
    } else if (field === 10 && wireType === 2) {
      item.coverUrl = decodeStringValue(readNested(reader));
    } else if (field === 13 && wireType === 2) {
      item.authorName = decodeStringValue(readNested(reader));
    } else if (field === 14 && wireType === 2) {
      item.maxFreeChapter = readNovelKarmaInfo(readNested(reader));
    } else if (field === 16 && wireType === 2) {
      item.genres.push(decodeUtf8(readBytes(reader, readVarint(reader))));
    } else if (!skipField(reader, wireType)) {
      break;
    }
  }

  return item;
};

const decodeNovelResponse = (reader: ByteReader) => {
  let item: NovelItem | null = null;

  while (reader.offset < reader.buffer.length) {
    const { field, wireType } = readFieldHeader(reader);
    if (field === 1 && wireType === 2) {
      item = decodeNovelItem(readNested(reader));
    } else if (!skipField(reader, wireType)) {
      break;
    }
  }

  return item;
};

const decodeChapterResponse = (reader: ByteReader) => {
  let item: ChapterItem | null = null;

  while (reader.offset < reader.buffer.length) {
    const { field, wireType } = readFieldHeader(reader);
    if (field === 1 && wireType === 2) {
      item = decodeChapterItem(readNested(reader));
    } else if (!skipField(reader, wireType)) {
      break;
    }
  }

  return item;
};

class WuxiaWorld implements Plugin.PluginBase {
  id = 'wuxiaworld';
  name = 'Wuxia World';
  icon = 'src/en/wuxiaworld/icon.png';
  site = 'https://www.wuxiaworld.com/';
  apiSite = 'https://api2.wuxiaworld.com/wuxiaworld.api.v2.';
  filters?: Filters | undefined;
  version = '0.6.0';

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

  async popularNovels(): Promise<Plugin.NovelItem[]> {
    const link = `${this.site}api/novels`;

    const result = await fetchApi(link);
    const data = await result.json();

    return this.parseNovels(data);
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url =
      this.site + 'api/novels/search?query=' + encodeURIComponent(searchTerm);

    const result = await fetchApi(url);
    const data = await result.json();

    return this.parseNovels(data);
  }

  /**
   * Sends a gRPC-web request frame and returns the message frame's bytes.
   * Returns null for empty or malformed responses instead of throwing, so the
   * app can show "no chapters" rather than loading forever.
   */
  async fetchProtoFrame(
    request: number[],
    url: string,
  ): Promise<ByteReader | null> {
    const frame = new Uint8Array(5 + request.length);
    const length = request.length;

    frame[1] = Math.floor(length / 16777216) & 0xff;
    frame[2] = Math.floor(length / 65536) & 0xff;
    frame[3] = Math.floor(length / 256) & 0xff;
    frame[4] = length & 0xff;
    frame.set(request, 5);

    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/grpc-web+proto',
      },
      // React Native's fetch sends typed-array bodies as binary; FetchInit only
      // declares FormData/string bodies.
      body: frame as unknown as FetchInit['body'],
    });

    if (!response.ok) return null;

    const payload = new Uint8Array(await response.arrayBuffer());
    if (payload.length < 5) return null;

    // Message frames carry flag 0; the trailing frame (flag 0x80) is a trailer.
    const messageLength =
      payload[1] * 16777216 +
      payload[2] * 65536 +
      payload[3] * 256 +
      payload[4];

    if (payload[0] !== 0 || messageLength + 5 > payload.length) return null;

    return { buffer: payload.subarray(5, 5 + messageLength), offset: 0 };
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.split('/')[1];
    const novelReader = await this.fetchProtoFrame(
      encodeGetNovelRequest(slug),
      this.apiSite + 'Novels/GetNovel',
    );
    const item = novelReader ? decodeNovelResponse(novelReader) : null;

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: item?.name || 'Untitled',
      cover: item?.coverUrl,
      summary: parseHTML(
        (item?.description || '') + '\n\n' + (item?.synopsis || ''),
      ).text(),
      author: item?.authorName,
      genres: item?.genres.join(','),
      chapters: [],
    };

    switch (item?.status) {
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

    const listReader =
      item?.id === undefined
        ? null
        : await this.fetchProtoFrame(
            encodeGetChapterListRequest(item.id),
            this.apiSite + 'Chapters/GetChapterList',
          );
    const groups = listReader ? decodeChapterListResponse(listReader) : [];

    const freeChapter =
      (item?.maxFreeChapter
        ? item.maxFreeChapter.units + item.maxFreeChapter.nanos / 1000000000
        : 0) || 50;

    const chapter: Plugin.ChapterItem[] = groups.flatMap(
      (group: ChapterGroupItem) =>
        group.chapterList.map((chapterItem: ChapterItem) => ({
          page: group.title,
          name:
            chapterItem.name +
            (chapterItem.relatedUserInfo?.isChapterUnlocked === false ||
            (!chapterItem.relatedUserInfo &&
              chapterItem.number &&
              chapterItem.number.units + chapterItem.number.nanos / 1000000000 >
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
    const reader = await this.fetchProtoFrame(
      encodeGetChapterRequest(paths[1], paths[2]),
      this.apiSite + 'Chapters/GetChapter',
    );
    const item = reader ? decodeChapterResponse(reader) : null;

    return item?.content || '';
  }
}

export default new WuxiaWorld();
