import { CheerioAPI, load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { Plugin } from '@/types/plugin';

const CHAPTER_PATH = /^\/truyen\/([^/]+)\/chuong-(\d+)$/;

class TruyenSS implements Plugin.PluginBase {
  id = 'truyenss.com';
  name = 'TruyenSS';
  icon = 'src/vi/truyenss/icon.png';
  site = 'https://truyenss.com';
  version = '1.0.0';

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: { Referer: this.site + '/' },
  };

  filters = {
    genre: {
      type: FilterTypes.Picker,
      label: 'Thể loại',
      value: 'tien-hiep',
      options: [
        { label: 'Tiên Hiệp', value: 'tien-hiep' },
        { label: 'Nữ Cường', value: 'nu-cuong' },
        { label: 'Xuyên Không', value: 'xuyen-khong' },
        { label: 'Điền Văn', value: 'dien-van' },
        { label: 'Thám Hiểm', value: 'tham-hiem' },
        { label: 'Linh Dị', value: 'linh-di' },
        { label: 'Truyện Ngược', value: 'truyen-nguoc' },
        { label: 'Truyện Sủng', value: 'truyen-sung' },
        { label: 'Đông Phương', value: 'dong-phuong' },
        { label: 'Hài Hước', value: 'hai-huoc' },
        { label: 'Hiện Đại', value: 'hien-dai' },
        { label: 'Quân Sự', value: 'quan-su' },
        { label: 'Mạt Thế', value: 'mat-the' },
        { label: 'Trọng Sinh', value: 'trong-sinh' },
        { label: 'Đồng Nhân', value: 'dong-nhan' },
        { label: 'Quan Trường', value: 'quan-truong' },
        { label: 'Cổ Đại', value: 'co-dai' },
        { label: 'Hệ Thống', value: 'he-thong' },
        { label: 'Phương Tây', value: 'phuong-tay' },
        { label: 'Lịch Sử', value: 'lich-su' },
        { label: 'Ngôn Tình', value: 'ngon-tinh' },
        { label: 'Huyền Huyễn', value: 'huyen-huyen' },
        { label: 'Kiếm Hiệp', value: 'kiem-hiep' },
        { label: 'Võng Du', value: 'vong-du' },
        { label: 'Trinh Thám', value: 'trinh-tham' },
        { label: 'Khoa Huyễn', value: 'khoa-huyen' },
        { label: 'Dị Năng', value: 'di-nang' },
        { label: 'Gia Đấu Cung Đấu', value: 'gia-dau-cung-dau' },
        { label: 'Góc Nhìn Nữ', value: 'goc-nhin-nu' },
        { label: 'Góc Nhìn Nam', value: 'goc-nhin-nam' },
      ],
    },
  } satisfies Filters;

  private collectTruyenLinks(loadedCheerio: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    loadedCheerio('a[href^="/truyen/"]').each((_, el) => {
      const href = el.attribs['href'];
      if (!href || href.split('/').length !== 3) return;
      const path = href.split('?')[0]!;
      if (seen.has(path)) return;
      seen.add(path);
      const name = loadedCheerio(el).text().replace(/\s+/g, ' ').trim();
      if (!name) return;
      novels.push({ path, name, cover: defaultCover });
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (showLatestNovels) {
      if (pageNo > 1) return [];
      const body = await fetchApi(this.site + '/').then(r => r.text());
      return this.collectTruyenLinks(parseHTML(body));
    }
    const genre = filters?.genre.value ?? 'tien-hiep';
    const url =
      pageNo <= 1
        ? `${this.site}/${genre}`
        : `${this.site}/${genre}?page=${pageNo}`;
    const body = await fetchApi(url).then(r => r.text());
    return this.collectTruyenLinks(parseHTML(body));
  }

  private parseStatusLine(raw: string): string {
    const t = raw.toLowerCase();
    if (t.includes('hoàn') || t.includes('full')) return NovelStatus.Completed;
    if (t.includes('đang') || t.includes('ra chương'))
      return NovelStatus.Ongoing;
    return NovelStatus.Unknown;
  }

  private parseChapters(
    loadedCheerio: CheerioAPI,
    novelPath: string,
  ): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const h2 = loadedCheerio('h2')
      .filter((_, el) => loadedCheerio(el).text().includes('Danh Sách Chương'))
      .first();
    const container = h2.next('div.position-relative');
    const anchors = container.length
      ? container.find('a[href^="#"]')
      : loadedCheerio('#inner-page a[href^="#"]');

    anchors.each((_, el) => {
      const href = el.attribs['href'];
      if (!href?.startsWith('#')) return;
      const num = Number(href.slice(1));
      if (!Number.isFinite(num) || num <= 0) return;
      const name = loadedCheerio(el).text().replace(/\s+/g, ' ').trim();
      chapters.push({
        name: name || `Chương ${num}`,
        path: `${novelPath}/chuong-${num}`,
        chapterNumber: num,
      });
    });
    chapters.sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
    return chapters;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = novelPath;
    const url = this.site + path;
    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path,
      name:
        loadedCheerio('#inner-page > h1').first().text().trim() ||
        loadedCheerio('main#main h1').first().text().trim() ||
        'Không có tiêu đề',
      chapters: [],
    };

    const cover = loadedCheerio('.info_truyen img.avatar').attr('src');
    novel.cover = cover
      ? cover.startsWith('http')
        ? cover
        : this.site + cover
      : defaultCover;

    const infoBlock = loadedCheerio('.info_truyen').first();
    const infoText = infoBlock.text();
    const authorMatch = infoText.match(/Tác\s*Giả:\s*([^\n\r]+)/i);
    if (authorMatch) novel.author = authorMatch[1]!.trim();

    const statusMatch = infoText.match(/Tình\s*Trạng:\s*([^\n\r]+)/i);
    if (statusMatch) novel.status = this.parseStatusLine(statusMatch[1]!);

    novel.genres = loadedCheerio('p.tags a.badge')
      .toArray()
      .map(a => loadedCheerio(a).text().trim())
      .filter(Boolean)
      .join(', ');

    const intro = loadedCheerio(
      '#inner-page .position-relative.mt-4 .line-height-3',
    ).first();
    if (intro.length) {
      novel.summary = intro.text().replace(/\s+/g, ' ').trim();
    }

    novel.chapters = this.parseChapters(loadedCheerio, path);
    return novel;
  }

  private extractChapterBody($: CheerioAPI): string {
    $('script, style').remove();
    let best = '';
    let bestP = 0;
    $('div').each((_, el) => {
      const div = $(el);
      const pCount = div.find('p').length;
      if (pCount > bestP) {
        bestP = pCount;
        best = div.html() ?? '';
      }
    });
    if (bestP >= 2) return best;
    const fallback = $('body').html() ?? $.root().html() ?? '';
    return fallback;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    let rel = chapterPath;
    if (rel.startsWith(this.site)) {
      rel = rel.slice(this.site.length);
    }
    const m = rel.match(CHAPTER_PATH);
    if (!m) throw new Error(`TruyenSS: invalid chapter path: ${rel}`);
    const folder = m[1]!;
    const chuong = m[2]!;
    const referer = `${this.site}/truyen/${folder}`;

    const qs = new URLSearchParams({ folder, chuong }).toString();
    const body = await fetchApi(`${this.site}/layout/xem-chuong.php?${qs}`, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Referer: referer,
      },
    }).then(r => r.text());

    if (!body.trim()) {
      throw new Error('TruyenSS: empty chapter response');
    }

    return this.extractChapterBody(parseHTML(body));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const q = encodeURIComponent(searchTerm.trim());
    if (!q) return [];

    const tryUrls = [
      `${this.site}/tim-kiem?q=${q}&page=${pageNo}`,
      `${this.site}/tim-kiem/${q}?page=${pageNo}`,
      `${this.site}/tim-truyen?tu-khoa=${q}&page=${pageNo}`,
    ];

    for (const tryUrl of tryUrls) {
      const body = await fetchApi(tryUrl).then(r => r.text());
      const novels = this.collectTruyenLinks(parseHTML(body));
      if (novels.length) return novels;
    }
    return [];
  }
}

export default new TruyenSS();
