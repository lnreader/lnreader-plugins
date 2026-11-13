import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type ApiNovel = {
  slug: string;
  title: string;
  authorName?: string | null;
  genre?: { slug: string; name: string } | null;
  genres?: { slug: string; name: string }[];
  status?: string;
  synopsis?: string | null;
  synopsisLong?: string | null;
  coverUrl?: string | null;
  viewCount?: number;
  chapterCount?: number;
};

type ApiList = {
  items: ApiNovel[];
  page: number;
  totalPages: number;
};

type ApiChapter = {
  id: string;
  number: number;
  title: string;
  publishedAt?: string | null;
};

type ApiChapterList = {
  total: number;
  from: number;
  to: number;
  items: ApiChapter[];
};

type ApiChapterPage = {
  chapter: { paragraphs?: string[] };
};

// Drops control characters (the site leaves backspaces at the end of some lines).
const stripControlChars = (text: string): string =>
  text
    .split('')
    .filter(char => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
// The list endpoint returns at most 200 chapters per request.
const CHAPTER_STEP = 200;
// Safety net against a runaway loop (200 x 100 = 20,000 chapters).
const MAX_CHAPTER_PAGES = 100;
const NOVEL_PATH = /^\/novel\/([^/?#]+)$/;
const CHAPTER_PATH = /^\/novel\/([^/?#]+)\/([^/?#]+)$/;

class ReadAllDay implements Plugin.PluginBase {
  id = 'readallday';
  name = 'Read All Day (อ่านทั้งวัน)';
  // The official อ่านทั้งวัน.com redirects to this punycode host.
  site = 'https://www.xn--72c5afc3e6a4acd3tpa.net';
  icon = 'src/th/readallday/icon.png';
  version = '1.0.0';

  filters = {
    sort: {
      label: 'เรียงตาม (Sort by)',
      value: 'popular',
      options: [
        { label: 'ยอดนิยม (Popular)', value: 'popular' },
        { label: 'อัปเดตล่าสุด (Updated)', value: 'updated' },
        { label: 'ชื่อเรื่อง (Title)', value: 'title' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'สถานะ (Status)',
      value: 'all',
      options: [
        { label: 'ทั้งหมด (All)', value: 'all' },
        { label: 'กำลังอัปเดต (Ongoing)', value: 'ongoing' },
        { label: 'จบแล้ว (Finished)', value: 'finished' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'หมวดหมู่ (Genre)',
      value: 'all',
      options: [
        { label: 'ทั้งหมด (All)', value: 'all' },
        { label: 'นิยาย จีน', value: 'manhua' },
        { label: 'นิยาย เกาหลี', value: 'manhwa' },
        { label: 'นิยาย แอคชั่น', value: 'action' },
        { label: 'นิยาย ผจญภัย', value: 'adventure' },
        { label: 'นิยาย ตลก', value: 'comedy' },
        { label: 'นิยาย ดราม่า', value: 'drama' },
        { label: 'นิยาย แฟนตาซี', value: 'fantasy' },
        { label: 'นิยาย โรแมนติค', value: 'romance' },
        { label: 'นิยาย ชีวิตประจำวัน', value: 'slice-of-life' },
        { label: 'นิยาย ชีวิตในโรงเรียน', value: 'school-life' },
        { label: 'นิยาย ประวัติศาสตร์', value: 'historical' },
        { label: 'นิยาย ผู้หญิงดำเนินเรื่อง', value: 'josei' },
        { label: 'นิยาย นางเอกเก่ง', value: 'strong-female-lead' },
        { label: 'นิยาย ทะลุมิติ', value: 'transmigration' },
        { label: 'นิยาย เกิดใหม่', value: 'rebirth' },
        { label: 'นิยาย แก้แค้น', value: 'revenge' },
        { label: 'นิยาย ระบบ', value: 'system' },
        { label: 'นิยาย ศิลปะการต่อสู้', value: 'martial-arts' },
        { label: 'นิยาย เหนือธรรมชาติ', value: 'supernatural' },
        { label: 'นิยาย จิตวิทยา', value: 'psychological' },
        { label: 'นิยาย ลึกลับ', value: 'mystery' },
        { label: 'นิยาย สืบสวน', value: 'detective' },
        { label: 'นิยาย สยองขวัญ', value: 'horror' },
        { label: 'นิยาย ไซไฟ', value: 'sci-fi' },
        { label: 'นิยาย โศกนาฏกรรม', value: 'tragedy' },
        { label: 'นิยาย ฮาเร็ม', value: 'harem' },
        { label: 'นิยาย ทะลึ่ง', value: 'ecchi' },
        { label: 'นิยาย ผู้ใหญ่', value: 'mature' },
        { label: 'นิยาย แฟนฟิค', value: 'doujinshi' },
        { label: 'นิยาย สลับเพศ', value: 'gender-bender' },
        { label: 'นิยาย การทำอาหาร', value: 'cooking' },
        { label: 'นิยาย กีฬา', value: 'sports' },
        { label: 'นิยาย วัยรุ่น', value: 'seinen' },
        { label: 'นิยายวาย', value: 'genre-422' },
        { label: 'นิยาย ยาโอย', value: 'yaoi' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'อื่น ๆ', value: 'other' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private async getJson<T>(apiPath: string): Promise<T> {
    const response = await fetchApi(`${this.site}/api/v1${apiPath}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Read All Day: HTTP ${response.status}.`);
    }
    return (await response.json()) as T;
  }

  private cover(coverUrl?: string | null): string {
    if (!coverUrl) return defaultCover;
    return coverUrl.startsWith('http') ? coverUrl : this.site + coverUrl;
  }

  private toItems(items: ApiNovel[]): Plugin.NovelItem[] {
    return items
      .filter(item => item.slug && item.title)
      .map(item => ({
        name: item.title.trim(),
        path: `/novel/${item.slug}`,
        cover: this.cover(item.coverUrl),
      }));
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = [`page=${pageNo}`];
    const sort = showLatestNovels ? 'updated' : filters?.sort?.value;
    if (sort) params.push(`sort=${encodeURIComponent(sort)}`);
    const status = filters?.status?.value;
    if (status && status !== 'all') {
      params.push(`status=${encodeURIComponent(status)}`);
    }
    const genre = filters?.genre?.value;
    if (genre && genre !== 'all') {
      params.push(`genre=${encodeURIComponent(genre)}`);
    }
    const list = await this.getJson<ApiList>(`/novels?${params.join('&')}`);
    return this.toItems(list.items || []);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = NOVEL_PATH.exec(novelPath)?.[1];
    if (!slug) throw new Error(`Read All Day: bad novel path ${novelPath}.`);

    const data = await this.getJson<ApiNovel>(`/novels/${slug}`);
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: data.title.trim(),
      cover: this.cover(data.coverUrl),
    };

    const author = data.authorName?.trim();
    if (author) novel.author = author;

    const genres = (data.genres?.length ? data.genres : [data.genre])
      .map(genre => genre?.name?.trim())
      .filter(Boolean);
    if (genres.length) novel.genres = genres.join(',');

    if (data.status === 'finished') novel.status = NovelStatus.Completed;
    else if (data.status === 'ongoing') novel.status = NovelStatus.Ongoing;
    else novel.status = NovelStatus.Unknown;

    const summary = (data.synopsisLong || data.synopsis || '').trim();
    if (summary) novel.summary = summary;

    if (typeof data.viewCount === 'number') {
      novel.info = [{ label: 'Views', value: data.viewCount.toLocaleString() }];
    }

    const chapters: Plugin.ChapterItem[] = [];
    let from = 1;
    for (let page = 0; page < MAX_CHAPTER_PAGES; page++) {
      const list = await this.getJson<ApiChapterList>(
        `/novels/${slug}/chapters?from=${from}&to=${from + CHAPTER_STEP - 1}`,
      );
      for (const chapter of list.items || []) {
        chapters.push({
          name: chapter.title.trim(),
          path: `/novel/${slug}/${chapter.id}`,
          releaseTime: chapter.publishedAt || null,
          chapterNumber: chapter.number,
        });
      }
      if (!list.items?.length || list.to >= list.total) break;
      from = list.to + 1;
    }
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const match = CHAPTER_PATH.exec(chapterPath);
    if (!match) {
      throw new Error(`Read All Day: bad chapter path ${chapterPath}.`);
    }
    const data = await this.getJson<ApiChapterPage>(
      `/novels/${match[1]}/chapters/${match[2]}`,
    );
    const paragraphs = (data.chapter?.paragraphs || [])
      .map(paragraph => stripControlChars(paragraph).trim())
      .filter(Boolean)
      .map(
        paragraph =>
          `<p>${paragraph
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}</p>`,
      );
    if (!paragraphs.length) {
      throw new Error('Read All Day: this chapter has no text.');
    }
    return paragraphs.join('');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const list = await this.getJson<ApiList>(
      `/search?q=${encodeURIComponent(searchTerm)}&page=${pageNo}`,
    );
    return this.toItems(list.items || []);
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new ReadAllDay();
