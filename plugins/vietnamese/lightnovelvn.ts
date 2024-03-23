import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { NovelItem } from '../../test_web/static/js';

interface SearchedNovel {
  name: string;
  slug: string;
  coverUrl: string;
}
interface SearchedResult {
  data?: SearchedNovel[];
}

class LightNovelVN implements Plugin.PagePlugin {
  id = 'lightnovel.vn';
  name = 'Light Novel VN';
  version = '1.0.0';
  icon = 'src/vi/lightnovelvn/icon.png';
  filters?: Filters | undefined;
  site = 'https://lightnovel.vn';
  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/truyen-hot-ds?page=${pageNo}`;
    const body = await fetch(url).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio(".flex.flex-col[itemtype='https://schema.org/Book']").each(
      (idx, ele) => {
        const novelName = loadedCheerio(ele)
          .find('h3[itemprop="name"] > a')
          .text()
          .trim();
        const img = loadedCheerio(ele).find('noscript').html();
        const novelCover = img?.match(/srcSet="([^\s]+)/)?.[1];
        const novelUrl = loadedCheerio(ele)
          .find('h3[itemprop="name"] > a')
          .attr('href');
        if (novelUrl)
          novels.push({
            name: novelName,
            cover: novelCover,
            path: novelUrl.replace(this.site, ''),
          });
      },
    );

    return novels;
  }
  parseChapters(loadedCheerio: CheerioAPI) {
    const chapters: Plugin.ChapterItem[] = [];
    loadedCheerio('ul.chapter-list > li').each((idx, ele) => {
      const chNum = Number(loadedCheerio(ele).find('div').first().text());
      const chapterUrl = loadedCheerio(ele).find('a').attr('href');
      const name = loadedCheerio(ele).find('a').text().trim();
      if (chapterUrl) {
        chapters.push({
          path: chapterUrl.replace(this.site, ''),
          name,
          chapterNumber: chNum,
        });
      }
    });
    return chapters;
  }
  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const url = this.site + novelPath;
    const body = await fetch(url).then(r => r.text());

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      chapters: [],
      name: 'Không có tiêu đề',
      totalPages: 1,
    };

    novel.name = loadedCheerio('h1[itemprop="name"]').text().trim();

    novel.cover = loadedCheerio('header div:nth-child(2) img')
      .attr('srcset')
      ?.split(/\s+/)[0];

    const genres: string[] = [];
    loadedCheerio('a[itemprop="genre"]').each(function () {
      genres.push(loadedCheerio(this).text());
    });
    novel.genres = genres.join(',');

    novel.status = loadedCheerio('span.font-bold.text-size22:last').text();
    if (novel.status === 'Đang ra') {
      novel.status = NovelStatus.Ongoing;
    } else if (novel.status === 'Hoàn thành') {
      novel.status = NovelStatus.Completed;
    } else {
      novel.status = NovelStatus.Unknown;
    }
    novel.author = loadedCheerio('a[itemprop="author"] > span').text();

    novel.summary = loadedCheerio('#bookIntro').text().replace(/\s+/g, ' ');
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
    await delay(1000);
    const chapterListUrl = url + '/danh-sach-chuong';

    const chapterListBody = await fetchApi(chapterListUrl).then(r => r.text());
    const loadedChapterList = parseHTML(chapterListBody);
    novel.chapters = this.parseChapters(loadedChapterList);
    loadedChapterList('nav[aria-label="Pagination"] a').each((index, ele) => {
      const href = ele.attribs['href'];
      if (href) {
        const page = Number(href.match(/\?page=(\d+)/)?.[1]);
        if (page && page > novel.totalPages) {
          novel.totalPages = page;
        }
      }
    });
    return novel;
  }
  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const url = `${this.site}${novelPath}/danh-sach-chuong?page=${page}`;
    const chapterListBody = await fetchApi(url).then(r => r.text());
    const chapters = this.parseChapters(parseHTML(chapterListBody));
    return {
      chapters,
    };
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    let chapterText = loadedCheerio('div.chapter-content').html() || '';

    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const url = `${this.site}/api/book-search`;
    let formData = new FormData();
    formData.append('keyword', searchTerm);

    const result: SearchedResult = await fetchApi(url, {
      method: 'POST',
      body: formData,
    }).then(r => r.json());

    const novels: NovelItem[] =
      result.data?.map(item => {
        return {
          name: item.name,
          path: '/truyen/' + item.slug,
          cover: (this.site + item.coverUrl).replace(
            'default.jpg',
            '150.jpg?w=256&q=',
          ),
        };
      }) || [];
    return novels;
  }
  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
}

export default new LightNovelVN();
