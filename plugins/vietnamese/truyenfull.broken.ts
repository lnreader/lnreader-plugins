import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';

class TruyenFull implements Plugin.PagePlugin {
  id = 'truyenfull';
  name = 'Truyện Full';
  icon = 'src/vi/truyenfull/icon.png';
  site = 'https://truyenfull.io';
  version = '1.0.2';

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('.list-truyen .row').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('h3.truyen-title > a').text();

      const novelCover = loadedCheerio(ele)
        .find("div[data-classname='cover']")
        .attr('data-image');

      const novelUrl = loadedCheerio(ele)
        .find('h3.truyen-title > a')
        .attr('href');
      if (novelUrl) {
        novels.push({
          name: novelName,
          cover: novelCover,
          path: novelUrl.replace(this.site, ''),
        });
      }
    });
    return novels;
  }
  parseChapters(loadedCheerio: CheerioAPI): Plugin.ChapterItem[] {
    return loadedCheerio('ul.list-chapter > li > a')
      .toArray()
      .map(ele => {
        const path = ele.attribs['href'].replace(this.site, '');
        return {
          name: loadedCheerio(ele).text().trim(),
          path,
          chapterNumber: Number(path.match(/\/chuong-(\d+)\//)?.[1]),
        };
      });
  }
  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + '/danh-sach';

    if (filters) {
      if (filters.sort.value !== '') {
        url += `/${filters.sort.value}`;
      } else {
        url += `/truyen-hot`;
      }
      for (const status of filters.status.value) {
        url += `/${status}`;
      }
    }
    url += `/trang-${pageNo}`;

    const result = await fetchApi(url);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }
  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const url = this.site + novelPath;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    let lastPage = 1;
    loadedCheerio('ul.pagination.pagination-sm > li > a').each(function () {
      const page = Number(this.attribs['href'].match(/\/trang-(\d+)\//)?.[1]);
      if (page && page > lastPage) lastPage = page;
    });

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: loadedCheerio('div.book > img').attr('alt') || 'Không có tiêu đề',
      chapters: [],
      totalPages: lastPage,
    };

    novel.cover = loadedCheerio('div.book > img').attr('src');

    novel.summary = loadedCheerio('div.desc-text').text().trim();

    novel.author = loadedCheerio('h3:contains("Tác giả:")')
      .parent()
      .contents()
      .text()
      .replace('Tác giả:', '');

    novel.genres = loadedCheerio('h3:contains("Thể loại")')
      .siblings()
      .map((i, el) => loadedCheerio(el).text())
      .toArray()
      .join(',');

    novel.status = loadedCheerio('h3:contains("Trạng thái")').next().text();
    if (novel.status === 'Full') {
      novel.status = NovelStatus.Completed;
    } else if (novel.status === 'Đang ra') {
      novel.status = NovelStatus.Ongoing;
    } else {
      novel.status = NovelStatus.Unknown;
    }
    novel.chapters = this.parseChapters(loadedCheerio);
    return novel;
  }
  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const url = `${this.site}${novelPath}trang-${page}/#list-chapter`;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    const chapters = this.parseChapters(loadedCheerio);
    return {
      chapters,
    };
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText =
      (loadedCheerio('.chapter-title').html() || '') +
      (loadedCheerio('#chapter-c').html() || '');

    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const searchUrl = `${this.site}/tim-kiem?tukhoa=${searchTerm}&page=${pageNo}`;

    const result = await fetchApi(searchUrl);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }
  filters = {
    status: {
      type: FilterTypes.CheckboxGroup,
      label: 'Tình trạng',
      value: [],
      options: [{ label: 'Đã hoàn thành', value: 'hoan' }],
    },
    sort: {
      type: FilterTypes.Picker,
      label: 'Sắp xếp',
      value: '',
      options: [
        { label: 'Truyện mới cập nhật', value: 'truyen-moi' },
        { label: 'Truyện hot', value: 'truyen-hot' },
        { label: 'Truyện full', value: 'truyen-full' },
        { label: 'Tiên hiệp hay', value: 'tien-hiep-hay' },
        { label: 'Kiếm hiệp hay', value: 'kiem-hiep-hay' },
        { label: 'Truyện teen hay', value: 'truyen-teen-hay' },
        { label: 'Ngôn tình hay', value: 'ngon-tinh-hay' },
        { label: 'Ngôn tình ngược', value: 'ngon-tinh-nguoc' },
        { label: 'Ngôn tình sủng', value: 'ngon-tinh-sung' },
        { label: 'Ngôn tình hài', value: 'ngon-tinh-hai' },
        { label: 'Đam mỹ hay', value: 'dam-my-hay' },
        { label: 'Đam mỹ hài', value: 'dam-my-hai' },
        { label: 'Đam mỹ h văn', value: 'dam-my-h-van' },
        { label: 'Đam mỹ sắc', value: 'dam-my-sac' },
      ],
    },
  } satisfies Filters;
}

export default new TruyenFull();
