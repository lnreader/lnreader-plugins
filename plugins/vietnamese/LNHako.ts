import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';

class HakoPlugin implements Plugin.PluginBase {
  id = 'ln.hako';
  name = 'Hako';
  icon = 'src/vi/hakolightnovel/icon.png';
  site = 'https://ln.hako.vn';
  version = '1.0.1';
  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('#mainpart .row .thumb-item-flow').each((index, ele) => {
      let url = loadedCheerio(ele)
        .find('div.thumb_attr.series-title > a')
        .attr('href');

      if (url) {
        const name = loadedCheerio(ele).find('.series-title').text().trim();
        let cover = loadedCheerio(ele).find('.img-in-ratio').attr('data-bg');

        if (cover && !isUrlAbsolute(cover)) {
          cover = this.site + cover;
        }

        const novel = { name, path: url.replace(this.site, ''), cover };

        novels.push(novel);
      }
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
    let link = this.site + '/danh-sach';
    if (filters.alphabet.value) {
      link += '/' + filters.alphabet.value;
    }
    const params = new URLSearchParams();
    for (const novelType of filters.type.value) {
      params.append(novelType, '1');
    }
    for (const status of filters.status.value) {
      params.append(status, '1');
    }
    params.append('sapxep', filters.sort.value);
    link += '?' + params.toString() + '&page=' + pageNo;
    const result = await fetch(link);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Không có tiêu đề',
    };
    const result = await fetch(this.site + novelPath);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    novel.name = loadedCheerio('.series-name').text().trim();

    const background =
      loadedCheerio('.series-cover > .a6-ratio > div').attr('style') || '';
    const novelCover = background.substring(
      background.indexOf('http'),
      background.length - 2,
    );

    novel.cover = novelCover
      ? isUrlAbsolute(novelCover)
        ? novelCover
        : this.site + novelCover
      : '';

    novel.summary = loadedCheerio('.summary-content').text().trim();

    novel.genres = loadedCheerio('.series-information > div:nth-child(1)')
      .text()
      .trim()
      .split(/\n[\s\n]*/)
      .join(',');

    novel.author = loadedCheerio(
      '.series-information > div:nth-child(2) > .info-value',
    )
      .text()
      .trim();
    novel.artist = loadedCheerio(
      '.series-information > div:nth-child(3) > .info-value',
    )
      .text()
      .trim();

    novel.status = loadedCheerio(
      '.series-information > div:nth-child(4) > .info-value',
    )
      .text()
      .trim();

    switch (novel.status) {
      case 'Đang tiến hành':
        novel.status = NovelStatus.Ongoing;
        break;
      case 'Tạm ngưng':
        novel.status = NovelStatus.OnHiatus;
        break;
      case 'Completed':
        novel.status = NovelStatus.Completed;
        break;
      default:
        novel.status = NovelStatus.Unknown;
    }

    novel.chapters = [];
    loadedCheerio('.volume-list').each((idx, ele) => {
      const customPage = loadedCheerio(ele).find('.sect-title').text().trim();
      let num = 0,
        part = 1;
      loadedCheerio(ele)
        .find('.list-chapters > li')
        .each((idx, chapterEle) => {
          const path = loadedCheerio(chapterEle).find('a').attr('href');
          const chapterName = loadedCheerio(chapterEle)
            .find('.chapter-name')
            .text()
            .trim();
          let chapterNumber = Number(chapterName.match(/Chương\s*(\d+)/i)?.[1]);
          if (chapterNumber) {
            num = chapterNumber;
            part = 1;
          } else {
            chapterNumber = num + part / 10;
            part++;
          }
          const chapterTime = loadedCheerio(chapterEle)
            .find('.chapter-time')
            .text()
            .split('/')
            .map(x => Number(x));
          if (path) {
            novel.chapters?.push({
              page: customPage,
              path,
              name: chapterName,
              releaseTime: new Date(
                chapterTime[2],
                chapterTime[1],
                chapterTime[0],
              ).toISOString(),
              chapterNumber: chapterNumber,
            });
          }
        });
    });
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetch(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('#chapter-content').html() || '';

    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site + '/tim-kiem?keywords=' + searchTerm + '&page=' + pageNo;
    const result = await fetch(url);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }
  async fetchImage(url: string): Promise<string | undefined> {
    const headers = {
      Referer: 'https://ln.hako.vn',
    };
    return await fetchFile(url, { headers: headers });
  }
  filters = {
    alphabet: {
      type: FilterTypes.Picker,
      value: '',
      label: 'Chữ cái',
      options: [
        { label: 'Tất cả', value: '' },
        { label: 'Khác', value: 'khac' },
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
        { label: 'D', value: 'd' },
        { label: 'E', value: 'e' },
        { label: 'F', value: 'f' },
        { label: 'G', value: 'g' },
        { label: 'H', value: 'h' },
        { label: 'I', value: 'i' },
        { label: 'J', value: 'j' },
        { label: 'K', value: 'k' },
        { label: 'L', value: 'l' },
        { label: 'M', value: 'm' },
        { label: 'N', value: 'n' },
        { label: 'O', value: 'o' },
        { label: 'P', value: 'p' },
        { label: 'Q', value: 'q' },
        { label: 'R', value: 'r' },
        { label: 'S', value: 's' },
        { label: 'T', value: 't' },
        { label: 'U', value: 'u' },
        { label: 'V', value: 'v' },
        { label: 'W', value: 'w' },
        { label: 'X', value: 'x' },
        { label: 'Y', value: 'y' },
        { label: 'Z', value: 'z' },
      ],
    },
    type: {
      type: FilterTypes.CheckboxGroup,
      label: 'Phân loại',
      value: [],
      options: [
        { label: 'Truyện dịch', value: 'truyendich' },
        { label: 'Truyện sáng tác', value: 'sangtac' },
        { label: 'Convert', value: 'convert' },
      ],
    },
    status: {
      type: FilterTypes.CheckboxGroup,
      label: 'Tình trạng',
      value: [],
      options: [
        { label: 'Đang tiến hành', value: 'dangtienhanh' },
        { label: 'Tạm ngưng', value: 'tamngung' },
        { label: 'Đã hoàn thành', value: 'hoanthanh' },
      ],
    },
    sort: {
      type: FilterTypes.Picker,
      label: 'Sắp xếp',
      value: 'top',
      options: [
        { label: 'A-Z', value: 'tentruyen' },
        { label: 'Z-A', value: 'tentruyenza' },
        { label: 'Mới cập nhật', value: 'capnhat' },
        { label: 'Truyện mới', value: 'truyenmoi' },
        { label: 'Theo dõi', value: 'theodoi' },
        { label: 'Top toàn thời gian', value: 'top' },
        { label: 'Top tháng', value: 'topthang' },
        { label: 'Số từ', value: 'sotu' },
      ],
    },
  } satisfies Filters;
}

export default new HakoPlugin();
