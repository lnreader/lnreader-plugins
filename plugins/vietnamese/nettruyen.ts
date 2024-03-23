import { fetchFile } from '@libs/fetch';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { Plugin } from '@typings/plugin';
import { CheerioAPI, load as parseHTML } from 'cheerio';

class Nettruyen implements Plugin.PagePlugin {
  id = 'nettruyen';
  name = 'Nettruyen';
  icon = 'src/vi/nettruyen/icon.png';
  site = 'https://nettruyen.com.vn';
  version = '1.0.0';
  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('#listchuong > ul > li > a.thumb').each((idx, ele) => {
      const path = ele.attribs['href'];
      if (!path) return;
      const name = ele.attribs['title'];
      const cover =
        this.site + '/' + loadedCheerio(ele).find('img').first().attr('src');
      novels.push({
        path: '/' + path,
        name,
        cover,
      });
    });
    return novels;
  }
  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/xem-nhieu/trang-${pageNo}.html`;
    const body = await fetch(url).then(r => r.text());
    return this.parseNovels(parseHTML(body));
  }
  parseChapters(loadedCheerio: CheerioAPI) {
    const chapters: Plugin.ChapterItem[] = [];
    loadedCheerio('ul.list-unstyled > li > a').each((idx, ele) => {
      const path = ele.attribs['href'];
      if (!path) return;
      const name = ele.attribs['title'];
      chapters.push({
        path: '/' + path,
        name,
        chapterNumber: Number(name.match(/Chương (\d+)/)?.[1]),
      });
    });
    return chapters;
  }
  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const url = this.site + novelPath;
    const body = await fetch(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);
    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: loadedCheerio('.gioithieutruyen.profile-info > h1').text().trim(),
      chapters: [],
      totalPages:
        Number(loadedCheerio('.phantrang > span:nth-child(2)').text()) || 1,
    };
    novel.cover =
      this.site + '/' + loadedCheerio('.img-thumb > img').attr('src');
    loadedCheerio('.thongtintruyen.note.note-info').each((idx, ele) => {
      const strong = loadedCheerio(ele).find('strong').text().trim();
      switch (strong) {
        case 'Tác giả':
          novel.author = loadedCheerio(ele)
            .text()
            .replace(/Tác giả\s+\n?:/, '');
          break;
        case 'Trạng thái':
          const text = loadedCheerio(ele).text();
          if (text.includes('Đang ra')) {
            novel.status = NovelStatus.Ongoing;
          } else if (text.includes('Hoàn thành')) {
            novel.status = NovelStatus.Completed;
          } else {
            novel.status = NovelStatus.Unknown;
          }
          break;
        case 'Thể loại':
          novel.genres = loadedCheerio('a > span')
            .toArray()
            .map(gEle => loadedCheerio(gEle).text())
            .join(',');
          break;
        default:
          break;
      }
    });
    novel.summary = loadedCheerio('.gioithieutruyen > .gioithieutruyen')
      .text()
      .trim();
    novel.chapters = this.parseChapters(loadedCheerio);
    return novel;
  }
  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const id = novelPath.match(/-(\d+)\//)?.[1];
    if (!id) throw new Error('Cant parse page');
    const url = `${this.site}/ajax.chuong.php?id=${id}&page=${page}&url=${novelPath.replace(/\//g, '')}&loai=truyendich`;
    const body = await fetch(url).then(r => r.text());
    const chapters = this.parseChapters(parseHTML(body));
    return {
      chapters,
    };
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const body = await fetch(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);
    return loadedCheerio('#noidungchap').html() || '';
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    throw new Error('Method not implemented.');
  }
  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
}
export default new Nettruyen();
