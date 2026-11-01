import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';

function decodeCover(image?: string): string {
  if (!image) return defaultCover;
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  try {
    const decoded =
      typeof atob === 'function'
        ? atob(image)
        : typeof Buffer !== 'undefined'
          ? Buffer.from(image, 'base64').toString('utf-8')
          : image;
    if (decoded.startsWith('http')) return decoded;
  } catch {
    // Ignore base64 decoding failure
  }
  return defaultCover;
}

function parseDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function formatNovelPath(slug: string): string {
  const clean = slug.trim().replace(/^(omniportal|novel)\//i, '');
  const omniMatch = clean.match(/^([a-zA-Z0-9]+)[-\/\s]+([0-9]+)$/);
  if (omniMatch) {
    return `omniportal/${omniMatch[1].toLowerCase()}/${omniMatch[2]}`;
  }
  return `novel/${clean}`;
}

function pathToSlug(novelPath: string): string {
  let clean = decodeURIComponent(novelPath.trim());
  clean = clean.replace(/^(https?:\/\/)?([^\/]+\.)?fictionzone\.net\/?/i, '');
  clean = clean.replace(/^\/+/, '').split(/[?#]/)[0].replace(/\/+$/, '');
  clean = clean.replace(/^(omniportal|novel)\//i, '');

  const omniMatch = clean.match(/^([a-zA-Z0-9]+)[\/\-\s]+([0-9]+)$/);
  if (omniMatch) {
    return `${omniMatch[1].toLowerCase()}-${omniMatch[2]}`;
  }
  if (/^[0-9]{8,}$/.test(clean)) {
    return `fq-${clean}`;
  }
  return clean;
}

async function getFanqieNovelMeta(bookId: string): Promise<{
  title: string;
  summary: string;
  cover: string;
  author: string;
} | null> {
  try {
    const res = await fetchApi(`https://fanqienovel.com/page/${bookId}`);
    if (!res.ok) return null;
    const raw = await res.text();

    const titleMatch = raw.match(/<title>([^<]+)<\/title>/);
    let title = titleMatch
      ? titleMatch[1].replace(/完整版.*$/, '').trim()
      : `Novel ${bookId}`;
    title = title.replace(/_.*$/, '').trim();

    const descMatch = raw.match(/"description":"([^"]+)"/);
    const summary = descMatch
      ? descMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/番茄小说提供.*?精彩小说尽在番茄小说网。/, '')
          .trim()
      : '';

    const imgMatch = raw.match(/"images":\["([^"]+)"\]/);
    const cover = imgMatch ? imgMatch[1].replace(/\\u002F/g, '/') : '';

    const authorMatch = raw.match(/"authorName":"([^"]+)"/);
    const author = authorMatch ? authorMatch[1].trim() : '';

    return { title, summary, cover, author };
  } catch {
    return null;
  }
}

async function getFanqieChapters(
  bookId: string,
  novelPath: string,
): Promise<Plugin.ChapterItem[]> {
  try {
    const res = await fetchApi(
      `https://fanqienovel.com/api/reader/directory/detail?bookId=${bookId}`,
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: {
        chapterListWithVolume?: {
          itemId?: string;
          title?: string;
          realChapterOrder?: string;
          firstPassTime?: string;
        }[][];
      };
    };

    const volumes = json?.data?.chapterListWithVolume || [];
    const chapters: Plugin.ChapterItem[] = [];
    let order = 1;

    for (const vol of volumes) {
      if (!Array.isArray(vol)) continue;
      for (const item of vol) {
        if (!item?.itemId) continue;
        const chNumber = item.realChapterOrder
          ? parseInt(item.realChapterOrder, 10) || order++
          : order++;
        const rawTitle = item.title ? item.title.trim() : '';
        const cleanTitle = rawTitle.replace(
          /^第\s*[0-9一二三四五六七八九十百千万]+\s*章\s*/,
          '',
        );
        const name = cleanTitle
          ? `Chapter ${chNumber}: ${cleanTitle}`
          : `Chapter ${chNumber}`;
        const releaseTime = item.firstPassTime
          ? new Date(parseInt(item.firstPassTime, 10) * 1000).toISOString()
          : null;

        chapters.push({
          name,
          chapterNumber: chNumber,
          releaseTime,
          path: `${novelPath}/${item.itemId}|/omniportal/chapters/content?source_id=fq&source_key=${bookId}&chapter_id=${item.itemId}&translate=en&engine=google-trans`,
        });
      }
    }

    return chapters;
  } catch {
    return [];
  }
}

class FictionZonePlugin implements Plugin.PluginBase {
  id = 'fictionzone';
  name = 'Fiction Zone';
  icon = 'src/en/fictionzone/icon.png';
  site = 'https://fictionzone.net';
  version = '1.1.0';

  filters = {
    sort: {
      label: 'Sort By',
      value: 'bookmark_count',
      options: [
        { label: 'Most Bookmarked', value: 'bookmark_count' },
        { label: 'Latest', value: 'created_at' },
        { label: 'Rating', value: 'rating' },
        { label: 'Views', value: 'views_all' },
        { label: 'Chapter Count', value: 'chapter_count' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Status',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: '1' },
        { label: 'Completed', value: '2' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'Genres',
      value: [],
      options: [
        { label: 'Fan-Fiction', value: '3' },
        { label: 'Fantasy', value: '1' },
        { label: 'Romance', value: '8' },
        { label: 'Sci-Fi', value: '6' },
        { label: 'Urban', value: '2' },
        { label: 'Virtual Reality', value: '7' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      page: pageNo.toString(),
      page_size: '20',
      sort_by: showLatestNovels
        ? 'created_at'
        : filters?.sort?.value || 'bookmark_count',
      sort_order: 'desc',
      include_genres: 'true',
    });

    if (filters?.status?.value && filters.status.value !== 'all') {
      params.append('status', filters.status.value);
    }

    if (
      Array.isArray(filters?.genres?.value) &&
      filters.genres.value.length > 0
    ) {
      filters.genres.value.forEach(g => params.append('genres', g));
    }

    return await this.getPage(`/platform/browse?${params.toString()}`);
  }

  async getData<T>(url: string): Promise<Response<T>> {
    const cleanUrl = url.replace(
      /^(https?:\/\/)?([^\/]+\.)?fictionzone\.net/i,
      '',
    );
    const res = await fetchApi(this.site + '/api/__api_party/fictionzone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        path: cleanUrl,
        headers: [
          ['content-type', 'application/json'],
          ['x-request-time', new Date().toISOString()],
        ],
        method: 'GET',
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed to fetch data from ${url}`);
    }

    const data = (await res.json()) as Response<T>;
    if (!data || !data.data) {
      throw new Error(data?.message || `Failed to fetch data from ${url}`);
    }
    return data;
  }

  async getPage(url: string): Promise<Plugin.NovelItem[]> {
    const data = await this.getData<{ novels: NovelItem[] }>(url);
    const novels = data?.data?.novels || [];

    return novels.map(n => ({
      name: n.title,
      cover: decodeCover(n.image),
      path: formatNovelPath(n.slug),
    }));
  }

  async getChapterPage(
    id: string,
    novelPath: string,
  ): Promise<Plugin.ChapterItem[]> {
    try {
      const data = await this.getData<{ chapters: ChapterItem[] }>(
        `/platform/chapter-lists?novel_id=${id}`,
      );
      const chapters = data?.data?.chapters || [];

      return chapters.map((n, idx) => ({
        name: n.title || `Chapter ${n.chapter_number ?? idx + 1}`,
        chapterNumber: n.chapter_number ?? idx + 1,
        releaseTime: parseDate(n.published_date),
        path: `${novelPath}/${n.chapter_id}|/platform/chapter-content?novel_id=${id}&chapter_id=${n.chapter_id}`,
      }));
    } catch {
      return [];
    }
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novelSlug = pathToSlug(novelPath);
    const omniMatch = novelSlug.match(/^([a-zA-Z0-9]+)[-_]([0-9]+)$/);
    const sourceId = omniMatch ? omniMatch[1].toLowerCase() : '';
    const sourceKey = omniMatch ? omniMatch[2] : '';

    let novelDetails: Partial<NovelDetails> | null = null;

    try {
      const data = await this.getData<NovelDetails>(
        `/platform/novel-details?slug=${novelSlug}`,
      );
      if (data?.data) {
        novelDetails = data.data;
      }
    } catch {
      // Not indexed in Fiction Zone platform database
    }

    if (!novelDetails && sourceId === 'fq') {
      const fqMeta = await getFanqieNovelMeta(sourceKey);
      if (fqMeta) {
        novelDetails = {
          id: sourceKey,
          title: fqMeta.title,
          synopsis: fqMeta.summary,
          image: fqMeta.cover,
          status: 1,
          contributors: fqMeta.author
            ? [{ role: 'author', display_name: fqMeta.author }]
            : [],
        };
      }
    }

    if (!novelDetails) {
      throw new Error(`Novel not found: ${novelPath}`);
    }

    const novel = novelDetails;
    let chapters: Plugin.ChapterItem[] = [];

    if (sourceId === 'fq') {
      chapters = await getFanqieChapters(sourceKey, novelPath);
    }

    if (!chapters.length && novel.id) {
      chapters = await this.getChapterPage(novel.id, novelPath);
    }

    return {
      path: novelPath,
      name: novel.title || novelSlug,
      cover: decodeCover(novel.image),
      genres: [
        ...(novel.genres || []).map(g => g.name),
        ...(novel.tags || []).map(g => g.name),
      ]
        .filter(Boolean)
        .join(','),
      status:
        novel.status === 1
          ? NovelStatus.Ongoing
          : novel.status === 2
            ? NovelStatus.Completed
            : NovelStatus.Unknown,
      author:
        (novel.contributors || []).find(c => c.role === 'author')
          ?.display_name || '',
      summary: novel.synopsis || '',
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const apiPath = chapterPath.includes('|')
      ? chapterPath.split('|')[1]
      : chapterPath;

    const data = await this.getData<{ content?: string }>(apiPath);
    const content = data?.data?.content;

    if (!content) {
      throw new Error('Chapter content is empty or unavailable.');
    }

    return (
      '<p>' +
      content
        .split(/\r?\n+/)
        .map(p => p.trim())
        .filter(Boolean)
        .join('</p><p>') +
      '</p>'
    );
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const cleanTerm = searchTerm.trim();

    if (pageNo === 1) {
      const isUrlOrId =
        cleanTerm.includes('fictionzone.net') ||
        cleanTerm.includes('omniportal') ||
        cleanTerm.includes('novel/') ||
        /^[a-zA-Z0-9]+[-_\/][0-9]+$/.test(cleanTerm) ||
        /^[0-9]{8,}$/.test(cleanTerm);

      if (isUrlOrId) {
        try {
          const novelSlug = pathToSlug(cleanTerm);
          const path = formatNovelPath(novelSlug);
          const novel = await this.parseNovel(path);
          if (novel) {
            return [
              {
                name: novel.name,
                cover: novel.cover,
                path,
              },
            ];
          }
        } catch {
          // Fall through to catalog search
        }
      }
    }

    const params = new URLSearchParams({
      search: searchTerm,
      page: pageNo.toString(),
      page_size: '20',
      search_in_synopsis: 'true',
      sort_by: 'bookmark_count',
      sort_order: 'desc',
      include_genres: 'true',
    });
    return await this.getPage(`/platform/browse?${params.toString()}`);
  }

  resolveUrl = (path: string): string => {
    let clean = path.split('|')[0].trim();
    clean = clean.replace(/^(https?:\/\/)?([^\/]+\.)?fictionzone\.net\/?/i, '');
    clean = clean.replace(/^\/+/, '');
    clean = clean.replace(
      /^omniportal\/([a-zA-Z0-9]+)[-\s]+([0-9]+)(.*)$/i,
      'omniportal/$1/$2$3',
    );
    return `${this.site}/${clean}`;
  };
}

export default new FictionZonePlugin();

type Response<T> = {
  success?: boolean;
  message?: string;
  data: T;
};

type NovelItem = {
  title: string;
  image?: string;
  slug: string;
};

type ChapterItem = {
  title?: string;
  chapter_number?: number;
  published_date?: string;
  chapter_id: string;
};

type NovelDetails = {
  id: string;
  title: string;
  image?: string;
  genres?: { name: string }[];
  tags?: { name: string }[];
  status: number;
  contributors?: { role: string; display_name: string }[];
  synopsis?: string;
};
