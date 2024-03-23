import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

class TruyenFull implements Plugin.PagePlugin {
  id = 'truyenfull';
  name = 'Truyện Full';
  icon = 'src/vi/truyenfull/icon.png';
  site = 'https://truyenfull.vn';
  version = '1.0.0';

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
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/danh-sach/truyen-hot/trang-${pageNo}/`;

    const result = await fetch(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    return this.parseNovels(loadedCheerio);
  }
  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const url = this.site + novelPath;

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);
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
    const result = await fetch(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    const chapters = this.parseChapters(loadedCheerio);
    return {
      chapters,
    };
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetch(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let chapterText =
      (loadedCheerio('.chapter-title').html() || '') +
      (loadedCheerio('#chapter-c').html() || '');

    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const searchUrl = `${this.site}/tim-kiem?tukhoa=${searchTerm}&page=${pageNo}`;

    const result = await fetch(searchUrl);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }
  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
}

export default new TruyenFull();
