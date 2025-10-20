import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as parseHTML } from 'cheerio';

class Agitoon implements Plugin.PluginBase {
  id = 'agit.xyz';
  name = 'Agitoon';
  icon = 'src/kr/agitoon/icon.png';
  site = 'https://agit664.xyz';
  version = '3.1.0';
  static url: string | undefined;

  async checkUrl() {
    if (!Agitoon.url) {
      const res = await fetchApi(this.site);
      if (!res.ok) Agitoon.url = this.site;
      else Agitoon.url = res.url.replace(/\/$/, '');
    }
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    await this.checkUrl();
    const res = await fetchApi(Agitoon.url + '/novel/index.update.php', {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      method: 'POST',
      body: new URLSearchParams({
        mode: 'get_data_novel_list_p',
        novel_menu: showLatestNovels ? '1' : '3',
        np_day: new Date().getDay(),
        np_rank: '1',
        np_distributor: '0',
        np_genre: '00',
        np_order: '1',
        np_genre_ex_1: '00',
        np_genre_ex_2: '00',
        list_limit: 20 * (pageNo - 1),
        is_query_first: pageNo == 1,
      }).toString(),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to get popular novels: (${res.status}: ${res.statusText}) (try to open in webview)`,
      );
    }
    const resJson = (await res.json()) as response;
    const novels: Plugin.NovelItem[] = [];

    resJson?.list?.forEach(novel =>
      novels.push({
        name: novel.wr_subject,
        cover: Agitoon.url + novel.np_dir + '/thumbnail/' + novel.np_thumbnail,
        path: novel.wr_id,
      }),
    );

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    await this.checkUrl();
    const result = await fetchApi(this.resolveUrl(novelPath, true)).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(result, { decodeEntities: false });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h5.pt-2').text(),
      cover: loadedCheerio('div.col-5.pr-0.pl-0 img').attr('src'),
      summary: loadedCheerio('.pt-1.mt-1.pb-1.mb-1').text(),
    };

    novel.author = loadedCheerio('.post-item-list-cate-v')
      .first()
      .text()
      .split(' : ')[1];

    const genres = loadedCheerio('.col-7 > .post-item-list-cate > span')
      .map((index, element) => loadedCheerio(element).text().trim())
      .get();

    if (genres.length) {
      novel.genres = genres.join(', ');
    }

    const chapters: Plugin.ChapterItem[] = [];
    const res = await fetchApi(Agitoon.url + '/novel/list.update.php', {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      method: 'POST',
      body: new URLSearchParams({
        mode: 'get_data_novel_list_c',
        wr_id_p: novelPath,
        page_no: '1',
        cnt_list: '10000',
        order_type: 'Asc',
      }).toString(),
    });

    const resJson = (await res.json()) as responseBook;
    resJson?.list?.forEach(chapter =>
      chapters.push({
        name: chapter.wr_subject,
        path: chapter.wr_id + '/2',
        releaseTime: chapter.wr_datetime,
      }),
    );

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    await this.checkUrl();
    const result = await fetchApi(this.resolveUrl(chapterPath)).then(res =>
      res.text(),
    );

    const loadedCheerio = parseHTML(result);
    let content = loadedCheerio('#id_wr_content').html() || '';

    // gets rid of the popup thingy
    content = content
      .replace('팝업메뉴는 빈공간을 더치하거나 스크룰시 사라집니다', '')
      .trim();

    return content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];
    await this.checkUrl();
    const rawResults = await fetchApi(Agitoon.url + '/novel/search.php', {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      method: 'POST',
      body: new URLSearchParams({
        mode: 'get_data_novel_list_p_sch',
        search_novel: searchTerm,
        list_limit: 0,
      }).toString(),
    });
    const resJson = (await rawResults.json()) as response;
    const novels: Plugin.NovelItem[] = [];

    resJson?.list?.forEach(novel =>
      novels.push({
        name: novel.wr_subject,
        cover:
          Agitoon.url + '/' + novel.np_dir + '/thumbnail/' + novel.np_thumbnail,
        path: novel.wr_id,
      }),
    );

    return novels;
  }

  resolveUrl(path: string, isNovel?: boolean) {
    if (!Agitoon.url)
      fetchApi(this.site).then(
        res => (Agitoon.url = res.url.replace(/\/$/, '')),
      );
    return (
      (Agitoon.url ? Agitoon.url : this.site) +
      (isNovel ? '/novel/list/' : '/novel/view/') +
      path
    );
  }
}

export default new Agitoon();

type response = {
  list_limit: number;
  list?: ListEntity[] | null;
  list_count: number;
};
type ListEntity = {
  wr_id: string;
  wr_subject: string;
  np_dir: string;
  np_type_02: string;
  np_thumbnail: string;
  np_author: string;
  wr_subject2: string;
  wr_datetime: string;
  np_distributor: string;
  np_genre: string;
  np_country: string;
  np_age: string;
  is_scrap: number;
};

type responseBook = {
  list?: ListEntity2[] | null;
  download_time: string;
};
type ListEntity2 = {
  wr_id: string;
  wr_subject: string;
  wr_datetime: string;
  url_view1: string;
  novel_c_style1: string;
  novel_c_str1: string;
  data_novel_c_view: string;
};
