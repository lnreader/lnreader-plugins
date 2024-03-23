import { fetchFile, fetchApi } from '@libs/fetch';
import { Filters } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';
import { load as parseHTML } from 'cheerio';
import qs from 'qs';

class Agitoon implements Plugin.PluginBase {
  id = 'agit.xyz';
  name = 'Agitoon';
  icon = 'src/kr/agitoon/agit.png';
  site = 'https://agit501.xyz';
  version = '1.0.0';

  async popularNovels(
    pageNo: number,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const res = await fetchApi(this.site + '/novel/index.update.php', {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      method: 'POST',
      body: qs.stringify({
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
      }),
    });
    const resJson = (await res.json()) as response;
    const novels: Plugin.NovelItem[] = [];

    resJson?.list?.forEach(novel =>
      novels.push({
        name: novel.wr_subject,
        cover: this.site + novel.np_dir + '/thumbnail/' + novel.np_thumbnail,
        path: novel.wr_id,
      }),
    );

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.resolveUrl(novelPath, true)).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(result, { decodeEntities: false });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h5.pt-2').text(),
      cover: this.site + loadedCheerio('div.col-5.pr-0.pl-0 img').attr('src'),
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
    const res = await fetchApi(this.site + '/novel/list.update.php', {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      method: 'POST',
      body: qs.stringify({
        mode: 'get_data_novel_list_c',
        wr_id_p: novelPath,
        page_no: '1',
        cnt_list: '10000',
        order_type: 'Asc',
      }),
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

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const rawResults = await fetchApi('https://agit501.xyz/novel/search.php', {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      method: 'POST',
      body: qs.stringify({
        mode: 'get_data_novel_list_p_sch',
        search_novel: searchTerm,
        list_limit: 0,
      }),
    });
    const resJson = (await rawResults.json()) as response;
    const novels: Plugin.NovelItem[] = [];

    resJson?.list?.forEach(novel =>
      novels.push({
        name: novel.wr_subject,
        cover:
          this.site + '/' + novel.np_dir + '/thumbnail/' + novel.np_thumbnail,
        path: novel.wr_id,
      }),
    );

    return novels;
  }

  fetchImage = fetchFile;
  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/novel/list/' : '/novel/view/') + path;
}

export default new Agitoon();

interface response {
  list_limit: number;
  list?: ListEntity[] | null;
  list_count: number;
}
interface ListEntity {
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
}

interface responseBook {
  list?: ListEntity2[] | null;
  download_time: string;
}
interface ListEntity2 {
  wr_id: string;
  wr_subject: string;
  wr_datetime: string;
  url_view1: string;
  novel_c_style1: string;
  novel_c_str1: string;
  data_novel_c_view: string;
}
