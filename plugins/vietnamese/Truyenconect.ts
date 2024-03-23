import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

interface VolumeData {
  story: string;
  navigation: string;
  value: string;
}

interface ChapterSelect {
  chap_selector: string;
  eps_selector: boolean | string;
}

interface VolumeList {
  chapters: Plugin.ChapterItem[];
  volumes?: VolumeData[];
}

class TruyenConect implements Plugin.PagePlugin {
  id = 'truyenconect';
  name = 'Truyen Conect';
  icon = 'src/vi/truyenconect/icon.png';
  site = 'https://truyenconect.com';
  version = '1.0.0';
  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  parseNovels(loadedCheerio: CheerioAPI, selector: string) {
    const novels: Plugin.NovelItem[] = [];
    loadedCheerio(selector).each((idx, ele) => {
      const url = loadedCheerio(ele).find('a').attr('href');
      if (url) {
        novels.push({
          name: loadedCheerio(ele).find('img').attr('alt') || '',
          path: url.replace(this.site, ''),
          cover: loadedCheerio(ele).find('img').attr('data-src'),
        });
      }
    });
    return novels;
  }
  async popularNovels(
    pageNo: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site;
    let selector = '.c-page__content > .grid9.block .item-thumb.c-image-hover';

    if (showLatestNovels) {
      selector =
        '.c-page__content .page-content-listing.item-big_thumbnail .item-thumb.c-image-hover';
    } else if (filters.category.value) {
      link += '/' + filters.category.value;
      selector =
        'table.manga-shortcodes.manga-chapters-listing td[width="10%"]';
      if (filters.category.value === 'the-loai') {
        selector = '.item-thumb.hover-details.c-image-hover';
        link += '/' + filters.genre.value;
      }
      link += '?page=' + pageNo;
    }

    const body = await fetch(link).then(r => r.text());
    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio, selector);
  }
  parseChapters(loadedCheerio: CheerioAPI) {
    const chapters: Plugin.ChapterItem[] = [];
    loadedCheerio('option').each((idx, ele) => {
      let url = ele.attribs['value'];
      if (!url) return;
      const chapterId = url.match(/\/(\d+)-/)?.[1];
      if (chapterId) {
        url = url.replace(chapterId + '-', '') + '-' + chapterId;
      }
      let num = url.match(/chuong-(\d+)/)?.[1];
      chapters.push({
        path: url.replace(this.site, ''),
        name: loadedCheerio(ele).text().trim(),
        chapterNumber: Number(num) || undefined,
      });
    });
    return chapters.reverse();
  }
  parseVolumes(loadedCheerio: CheerioAPI) {
    const volumes: VolumeData[] = [];
    loadedCheerio('option').each((idx, ele) => {
      volumes.push({
        story: ele.attribs['data-story'],
        navigation: ele.attribs['data-navigation'],
        value: ele.attribs['value'],
      });
    });
    return volumes;
  }
  async getVolumes(firstChapterUrl: string) {
    const chapterId = firstChapterUrl.match(/-(\d+)$/)?.[1];
    if (!chapterId) throw new Error('Không tìm thấy chương');
    const url = this.site + '/truyen/get-chap-selector?chap=' + chapterId;
    const data: ChapterSelect = await fetch(url).then(r => r.json());
    const volumeList: VolumeList = {
      chapters: this.parseChapters(parseHTML(data.chap_selector)),
    };
    if (data.eps_selector) {
      volumeList.volumes = this.parseVolumes(
        parseHTML(data.eps_selector as string),
      );
    }
    return volumeList;
  }
  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const url = this.site + novelPath;
    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      name: loadedCheerio('.post-title > h1').text().trim(),
      path: novelPath,
      chapters: [],
      totalPages: 1,
    };

    novel.cover = loadedCheerio('.summary_image > a > img').attr('data-src');

    loadedCheerio('.post-content_item').each(function () {
      const detailName = loadedCheerio(this)
        .find('.summary-heading > h5')
        .text()
        .trim();
      const detail = loadedCheerio(this).find('.summary-content').html();

      if (!detail) return;

      switch (detailName) {
        case 'Thể loại':
          novel.genres = loadedCheerio(detail)
            .children('a')
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(',');
          break;
        case 'Tác giả':
          novel.author = loadedCheerio(detail).text().trim();
          break;
        case 'Hoạ sĩ':
          novel.artist = loadedCheerio(detail).text().trim();
          break;
        case 'Trạng thái':
          const status = detail.trim();
          if (status === 'Full') novel.status = NovelStatus.Completed;
          else if (status === 'Tạm ngưng') novel.status = NovelStatus.OnHiatus;
          else if (status === 'Đang tiến hành')
            novel.status = NovelStatus.Ongoing;
          else novel.status = NovelStatus.Unknown;
          break;
      }
    });

    loadedCheerio('.description-summary > div.summary__content > div').remove();

    novel.summary = loadedCheerio('.description-summary > div.summary__content')
      .text()
      .trim();
    const firstChapLink = loadedCheerio('#init-links > a').first().attr('href');
    if (!firstChapLink) throw new Error('Không tìm thấy truyện');
    await this.sleep(1000);
    const volumeList = await this.getVolumes(firstChapLink);
    if (volumeList.volumes) {
      novel.totalPages = volumeList.volumes.length;
      novel.chapters = volumeList.chapters;
    } else {
      novel.totalPages = 1;
      novel.chapters = volumeList.chapters;
    }
    return novel;
  }
  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const url = this.site + novelPath;
    const result = await fetch(url);
    const body = await result.text();
    let loadedCheerio = parseHTML(body);
    const firstChapLink = loadedCheerio('#init-links > a').first().attr('href');
    if (!firstChapLink) throw new Error('Không tìm thấy truyện');
    await this.sleep(1000);
    const volumeList = await this.getVolumes(firstChapLink);
    const volumeIndex = Number(page) - 1;
    if (!volumeList.volumes) throw new Error('Không tìm thấy truyện');
    if (volumeIndex >= volumeList.volumes.length)
      throw new Error('Không tìm thấy volume');
    const volume = volumeList.volumes[volumeIndex];
    const query = `dataEpisodes=${volume.value}&datastory=${volume.story}&dataNavigation=${encodeURIComponent(volume.navigation)}`;
    const chaptersUrl = `${this.site}/truyen/getreadingchapAction?${query}`;
    await this.sleep(1000);
    const res: { err: number; html: string } = await fetch(chaptersUrl).then(
      r => r.json(),
    );
    if (res.err) throw new Error(res.html);
    return {
      chapters: this.parseChapters(parseHTML(res.html)),
    };
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetch(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    let chapterText = loadedCheerio('.reading-content').html() || '';

    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}?key=${searchTerm}&page=${pageNo}`;
    const result = await fetch(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.tab-thumb.c-image-hover > a').each((idx, ele) => {
      const novelName = ele.attribs['title'];
      const novelCover = loadedCheerio(ele).find('img').first().attr('src');
      const novelUrl = ele.attribs['href'];

      if (!novelUrl) return;

      novels.push({
        name: novelName,
        path: novelUrl.replace(this.site, ''),
        cover: novelCover,
      });
    });

    return novels;
  }
  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
  filters = {
    category: {
      label: 'Lọc theo',
      value: '',
      type: FilterTypes.Picker,
      options: [
        { label: '', value: '' },
        { label: 'Thể loại', value: 'the-loai' },
        { label: 'Truyện dịch', value: 'truyen-dich' },
        { label: 'Truyện convert', value: 'convert' },
      ],
    },
    genre: {
      label: 'Thể loại',
      value: 'action',
      type: FilterTypes.Picker,
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Chinese novel', value: 'chinese-novel' },
        { label: 'Chuyển Sinh', value: 'chuyen-sinh' },
        { label: 'English Novel', value: 'english-novel' },
        { label: 'Harem', value: 'harem' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Game', value: 'game' },
        { label: 'Tiên hiệp', value: 'tien-hiep' },
        { label: 'Kiếm Hiệp', value: 'kiem-hiep' },
        { label: 'Ngôn Tình', value: 'ngon-tinh' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Lịch Sử', value: 'lich-su' },
        { label: 'Web Novel', value: 'web-novel' },
        { label: 'Xuyên không', value: 'xuyen-khong' },
        { label: 'Trọng sinh', value: 'trong-sinh' },
        { label: 'Trinh thám', value: 'trinh-tham' },
        { label: 'Dị giới', value: 'di-gioi' },
        { label: 'Huyền ảo', value: 'huyen-ao' },
        { label: 'Sắc Hiệp', value: 'sac-hiep' },
        { label: 'Dị năng', value: 'di-nang' },
        { label: 'Linh dị', value: 'linh-di' },
        { label: 'Đô thị', value: 'do-thi' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Romance', value: 'romance' },
        { label: 'Martial-arts', value: 'martial-arts' },
        { label: 'Light Novel', value: 'light-novel' },
        { label: 'Huyền huyễn', value: 'huyen-huyen' },
        { label: 'Kỳ Huyễn', value: 'ky-huyen' },
        { label: 'Khoa Huyễn', value: 'khoa-huyen' },
        { label: 'Võng Du', value: 'vong-du' },
        { label: 'Đồng Nhân', value: 'dong-nhan' },
      ],
    },
  } satisfies Filters;
}

export default new TruyenConect();
