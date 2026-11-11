import { load as parseHTML, type CheerioAPI } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { Plugin } from '@/types/plugin';

class WeTruyenPlugin implements Plugin.PagePlugin {
  id = 'wetruyen';
  name = 'WeTruyen';
  icon = 'src/vi/wetruyen/icon.png';
  site = 'https://wetruyen.com';
  version = '1.0.0';

  filters = {
    list: {
      type: FilterTypes.Picker,
      label: 'Danh sách',
      value: 'truyen-hot',
      options: [
        { label: 'Truyện hot', value: 'truyen-hot' },
        { label: 'Truyện mới cập nhật', value: 'truyen-moi-cap-nhat' },
        { label: 'Truyện mới đăng', value: 'truyen-moi-dang' },
        { label: 'Truyện full', value: 'truyen-full' },
      ],
    },
    genre: {
      type: FilterTypes.Picker,
      label: 'Thể loại (chỉ truyện full, bỏ qua danh sách ở trên)',
      value: '',
      options: [
        { label: 'Không chọn', value: '' },
        { label: 'Tiên Hiệp', value: 'tien-hiep' },
        { label: 'Kiếm Hiệp', value: 'kiem-hiep' },
        { label: 'Ngôn Tình', value: 'ngon-tinh' },
        { label: 'Quan Trường', value: 'quan-truong' },
        { label: 'Xuyên Không', value: 'xuyen-khong' },
        { label: 'Trinh Thám', value: 'trinh-tham' },
        { label: 'Thám Hiểm', value: 'tham-hiem' },
        { label: 'Linh Dị', value: 'linh-di' },
        { label: 'Ngược', value: 'nguoc' },
        { label: 'Sủng', value: 'sung' },
        { label: 'Cung Đấu', value: 'cung-dau' },
        { label: 'Nữ Cường', value: 'nu-cuong' },
        { label: 'Đông Phương', value: 'dong-phuong' },
        { label: 'Đam Mỹ', value: 'dam-my' },
        { label: 'Bách Hợp', value: 'bach-hop' },
        { label: 'Hài Hước', value: 'hai-huoc' },
        { label: 'Cổ Đại', value: 'co-dai' },
        { label: 'Mạt Thế', value: 'mat-the' },
        { label: 'Tiểu Thuyết', value: 'tieu-thuyet' },
        { label: 'Võng Du', value: 'vong-du' },
        { label: 'Khoa Huyễn', value: 'khoa-huyen' },
        { label: 'Dị Năng', value: 'di-nang' },
        { label: 'Huyền Huyễn', value: 'huyen-huyen' },
        { label: 'Trọng Sinh', value: 'trong-sinh' },
        { label: 'Đô Thị', value: 'do-thi' },
        { label: 'Dị Giới', value: 'di-gioi' },
        { label: 'Gia Đấu', value: 'gia-dau' },
        { label: 'Điền Văn', value: 'dien-van' },
        { label: 'Nữ Phụ', value: 'nu-phu' },
        { label: 'Quân Sự', value: 'quan-su' },
        { label: 'Lịch Sử', value: 'lich-su' },
        { label: 'Truyện Teen', value: 'teen' },
        { label: 'Light Novel', value: 'light-novel' },
        { label: 'Đoản Văn', value: 'doan-van' },
        { label: 'Việt Nam', value: 'viet-nam' },
        { label: 'Dã Sử', value: 'da-su' },
        { label: 'Phương Tây', value: 'phuong-tay' },
        { label: 'Hệ Thống', value: 'he-thong' },
        { label: 'Xuyên Nhanh', value: 'xuyen-nhanh' },
        { label: 'Hiện Đại', value: 'hien-dai' },
        { label: 'Tổng Tài', value: 'tong-tai' },
        { label: 'Khác', value: 'khac' },
      ],
    },
  } satisfies Filters;

  private toPath(url: string): string {
    return url.replace(this.site, '');
  }

  private parseNovelList($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    $('.list-truyen .row').each((_, element) => {
      const row = $(element);
      const link = row.find('h3.truyen-title > a').first();
      const href = link.attr('href');
      if (!href) return;
      const name = (link.attr('title') || link.text()).trim();
      if (!name) return;
      const cover = row.find('div[data-classname="cover"]').first();
      novels.push({
        name,
        path: this.toPath(href),
        cover: cover.attr('data-desk-image') || cover.attr('data-image'),
      });
    });
    return novels;
  }

  private async loadPage(url: string): Promise<CheerioAPI> {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`WeTruyen: HTTP ${response.status} for ${url}`);
    }
    return parseHTML(await response.text());
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let listPath = '/truyen-hot/';
    if (showLatestNovels) {
      listPath = '/truyen-moi-cap-nhat/';
    } else if (filters?.genre.value) {
      listPath = `/truyen-${filters.genre.value}/full/`;
    } else if (filters?.list.value) {
      listPath = `/${filters.list.value}/`;
    }
    const url =
      pageNo > 1
        ? `${this.site}${listPath}trang-${pageNo}/`
        : `${this.site}${listPath}`;
    return this.parseNovelList(await this.loadPage(url));
  }

  private parseChapterList($: CheerioAPI): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    $('#list-chapter ul.list-chapter > li > a').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;
      const path = this.toPath(href);
      const chapterNumber = parseFloat(
        path.match(/\/chuong-(\d+(?:\.\d+)?)/)?.[1] ?? '',
      );
      const name = $(element)
        .text()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\s*:$/, '');
      chapters.push({
        name,
        path,
        chapterNumber: Number.isFinite(chapterNumber)
          ? chapterNumber
          : undefined,
      });
    });
    return chapters;
  }

  private novelUrl(novelPath: string, page?: string): string {
    const base =
      this.site + (novelPath.endsWith('/') ? novelPath : `${novelPath}/`);
    return page && page !== '1' ? `${base}trang-${page}/` : base;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const $ = await this.loadPage(this.novelUrl(novelPath));

    let totalPages = 1;
    $('ul.pagination a').each((_, element) => {
      const page = Number(
        $(element)
          .attr('href')
          ?.match(/\/trang-(\d+)\//)?.[1],
      );
      if (page > totalPages) totalPages = page;
    });

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: $('.col-info-desc h1.title').first().text().trim(),
      cover: $('.col-info-desc .book img').first().attr('src'),
      chapters: this.parseChapterList($),
      totalPages,
    };

    const author = $('.info [itemprop="author"]').first().text().trim();
    if (author) novel.author = author;

    const genres = $('.info a[itemprop="genre"]')
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean);
    if (genres.length) novel.genres = genres.join(', ');

    const status = $('.info h3:contains("Trạng thái")')
      .next()
      .text()
      .trim()
      .toLowerCase();
    if (status === 'full') {
      novel.status = NovelStatus.Completed;
    } else if (status.includes('đang ra')) {
      novel.status = NovelStatus.Ongoing;
    } else {
      novel.status = NovelStatus.Unknown;
    }

    const description = $('.desc-text').first();
    description.find('br').replaceWith('\n');
    const summary = description
      .text()
      .split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (summary) novel.summary = summary;

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const $ = await this.loadPage(this.novelUrl(novelPath, page));
    return { chapters: this.parseChapterList($) };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.loadPage(this.site + chapterPath);
    const content = $('#chapter-c').first();
    content.find('.ads, ins, script, style, iframe').remove();
    const text = content.html()?.trim();
    if (!text) throw new Error('WeTruyen: chapter content not found');
    return text;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/tim-kiem/?tukhoa=${encodeURIComponent(
      searchTerm,
    )}&paged=${pageNo}`;
    return this.parseNovelList(await this.loadPage(url));
  }
}

export default new WeTruyenPlugin();
