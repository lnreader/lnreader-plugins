import { fetchApi } from '@libs/fetch';
import { Parser } from 'htmlparser2';
import { HTMLParser2Util, Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';

enum ParseNovelAction {
  Unknown = 'Unknown',
  GetName = 'GetName',
  GetSummary = 'GetSummary',
  GetInfos = 'GetInfos',
  GetGenres = 'GetGenres',
  GetCover = 'GetCover',
  GetVolumes = 'GetVolumes',
}

class HakoPlugin implements Plugin.PluginBase {
  id = 'ln.hako';
  name = 'Hako';
  icon = 'src/vi/hakolightnovel/icon.png';
  site = 'https://ln.hako.vn';
  version = '1.1.0';
  parseNovels(url: string) {
    return fetchApi(url)
      .then(res => res.text())
      .then(html => {
        const novels: Plugin.NovelItem[] = [];
        let tempNovel = {} as Plugin.NovelItem;
        let isGettingUrl = false;
        let isParsingNovel = false;
        const parser = new Parser({
          onopentag(name, attribs) {
            if (attribs['class']?.includes('thumb-item-flow')) {
              isParsingNovel = true;
            }
            if (isParsingNovel) {
              if (attribs['class']?.includes('series-title')) {
                isGettingUrl = true;
              }
              if (attribs['class']?.includes('img-in-ratio')) {
                tempNovel.cover = attribs['data-bg'];
              }
              if (isGettingUrl && name === 'a') {
                tempNovel.name = attribs['title'];
                tempNovel.path = attribs['href'];
                novels.push(tempNovel);
                tempNovel = {} as Plugin.NovelItem; // re-assign new reference
                isGettingUrl = false;
                isParsingNovel = false;
              }
            }
          },
        });
        parser.write(html);
        parser.end();
        return novels;
      });
  }
  popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site + '/danh-sach';
    if (filters) {
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
    } else {
      link += '?page=' + pageNo;
    }
    return this.parseNovels(link);
  }

  parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      author: '',
      artist: '',
      summary: '',
      genres: '',
      status: '',
    };
    const chapters: Plugin.ChapterItem[] = [];
    const getNameHandler: HTMLParser2Util.Handler = {
      isDone: false,
      isStarted: false,
      onopentag(name) {
        if (name === 'a') {
          this.isStarted = true;
        }
      },
      ontext(data) {
        novel.name += data;
      },
      onclosetag() {
        if (this.isStarted) {
          this.isDone = true;
        }
      },
    };
    const getSummaryHandler: HTMLParser2Util.Handler & {
      newLine: boolean;
    } = {
      newLine: false,
      ontext(data) {
        if (this.newLine) {
          this.newLine = false;
          novel.summary += '\n' + data;
        } else {
          novel.summary += data;
        }
      },
      onclosetag() {
        this.newLine = true;
      },
    };
    const getGenresHandler: HTMLParser2Util.Handler = {
      ontext(data) {
        novel.genres += data;
      },
    };
    enum InfoItem {
      Author,
      Artist,
      Status,
      Unknown,
    }
    const getInfosHandler: HTMLParser2Util.Handler & { info: InfoItem } = {
      isStarted: false,
      info: InfoItem.Unknown,
      onopentag(name, attribs) {
        if (attribs['class'] === 'info-item') {
          switch (this.info) {
            case InfoItem.Unknown:
              if (!novel.author) {
                this.info = InfoItem.Author;
              }
              break;
            case InfoItem.Author:
              this.info = InfoItem.Artist;
              break;
            case InfoItem.Artist:
              this.info = InfoItem.Status;
              break;
            // we dont need the other info (if exist)
            case InfoItem.Status:
              this.info = InfoItem.Unknown;
              break;
            default:
              break;
          }
        }
        if (name === 'a') {
          this.isStarted = true;
        }
      },
      ontext(data) {
        if (this.isStarted) {
          switch (this.info) {
            case InfoItem.Author:
              novel.author += data;
              break;
            case InfoItem.Artist:
              novel.artist += data;
              break;
            case InfoItem.Status:
              novel.status += data;
              break;
            default:
              break;
          }
        }
      },
      onclosetag(name) {
        if (this.isStarted) {
          this.isStarted = false;
        }
        if (name === 'a' && this.info === InfoItem.Status) {
          this.isDone = true;
        }
      },
    };
    const getChapterListHandler: HTMLParser2Util.Handler & {
      currentVolume: string;
      num: number;
      part: number;
      readingTime: boolean;
      tempChapter: Plugin.ChapterItem;
    } = {
      currentVolume: '',
      num: 0,
      part: 1,
      isStarted: false,
      readingTime: false,
      tempChapter: {} as Plugin.ChapterItem,
      onopentag(name, attribs) {
        if (this.isStarted) {
          if (name === 'a' && attribs['title'] !== null) {
            const chapterName = attribs['title'];
            let chapterNumber = Number(
              chapterName.match(/Chương\s*(\d+)/i)?.[1],
            );
            if (chapterNumber) {
              if (this.num === chapterNumber) {
                chapterNumber = this.num + this.part / 10;
                this.part += 1;
              } else {
                this.num = chapterNumber;
                this.part = 1;
              }
            } else {
              chapterNumber = this.num + this.part / 10;
              this.part++;
            }
            this.tempChapter = {
              path: attribs['href'],
              name: chapterName,
              page: this.currentVolume,
              chapterNumber: chapterNumber,
            };
          } else if (attribs['class'] === 'chapter-time') {
            this.readingTime = true;
          }
        }
      },
      ontext(data) {
        if (this.readingTime) {
          const chapterTime = data.split('/').map(x => Number(x));
          this.tempChapter.releaseTime = new Date(
            chapterTime[2],
            chapterTime[1],
            chapterTime[0],
          ).toISOString();
          chapters.push(this.tempChapter);
          this.readingTime = false;
          this.tempChapter = {} as Plugin.ChapterItem;
        }
      },
      onclosetag() {
        if (this.readingTime) this.readingTime = false;
      },
    };
    const getVolumesHandler: HTMLParser2Util.Handler & {
      isParsingChapterList: boolean;
    } = {
      isStarted: false,
      isDone: false,
      isParsingChapterList: false,
      onopentag(name, attribs) {
        if (attribs['class'] === 'sect-title') {
          this.isStarted = true;
          getChapterListHandler.currentVolume = '';
        }
        if (name === 'ul') {
          getChapterListHandler.isStarted = true;
          getChapterListHandler.num = 0;
          getChapterListHandler.part = 1;
        }
        getChapterListHandler.onopentag?.(name, attribs);
      },
      ontext(data) {
        if (this.isStarted) {
          getChapterListHandler.currentVolume += data.trim();
        }
        getChapterListHandler.ontext?.(data);
      },
      onclosetag(name, isImplied) {
        getChapterListHandler.onclosetag?.(name, isImplied);
        this.isStarted = false;
        if (name === 'ul') {
          getChapterListHandler.isStarted = false;
        }
      },
    };
    const parseNovelRouter: HTMLParser2Util.HandlerRouter<ParseNovelAction> = {
      handlers: {
        Unknown: undefined,
        GetName: getNameHandler,
        GetCover: undefined,
        GetSummary: getSummaryHandler,
        GetGenres: getGenresHandler,
        GetInfos: getInfosHandler,
        GetVolumes: getVolumesHandler,
      },
      action: ParseNovelAction.Unknown,
      onopentag(name, attribs) {
        if (attribs['class'] === 'series-name') {
          this.action = ParseNovelAction.GetName;
        } else if (!novel.cover && attribs['class']?.includes('img-in-ratio')) {
          const background = attribs['style'];
          if (background) {
            novel.cover = background.substring(
              background.indexOf('http'),
              background.length - 2,
            );
          }
        } else if (attribs['class'] === 'summary-content') {
          this.action = ParseNovelAction.GetSummary;
        } else if (attribs['class'] === 'series-gerne-item') {
          this.action = ParseNovelAction.GetGenres;
        } else if (attribs['class'] === 'info-item') {
          this.action = ParseNovelAction.GetInfos;
        } else if (attribs['class']?.includes('volume-list')) {
          this.action = ParseNovelAction.GetVolumes;
        }
      },
      onclosetag(name) {
        switch (this.action) {
          case ParseNovelAction.GetName:
            if (this.handlers.GetName?.isDone) {
              this.action = ParseNovelAction.Unknown;
            }
            break;
          case ParseNovelAction.GetSummary:
            if (name === 'div') {
              this.action = ParseNovelAction.Unknown;
            }
            break;
          case ParseNovelAction.GetGenres:
            this.action = ParseNovelAction.Unknown;
            novel.genres += ',';
            break;
          case ParseNovelAction.GetInfos:
            if (this.handlers.GetInfos?.isDone) {
              this.action = ParseNovelAction.Unknown;
            }
            break;
          case ParseNovelAction.GetVolumes:
            if (this.handlers.GetVolumes?.isDone) {
              this.action = ParseNovelAction.Unknown;
            }
            break;
          default:
            break;
        }
      },
    };
    return fetchApi(this.site + novelPath)
      .then(res => res.text())
      .then(html => {
        const parser = new Parser({
          onopentag(name, attributes) {
            parseNovelRouter.onopentag?.(name, attributes);
            if (parseNovelRouter.action) {
              parseNovelRouter.handlers[parseNovelRouter.action]?.onopentag?.(
                name,
                attributes,
              );
            }
          },
          ontext(data) {
            if (parseNovelRouter.action) {
              parseNovelRouter.handlers[parseNovelRouter.action]?.ontext?.(
                data,
              );
            }
          },
          onclosetag(name, isImplied) {
            if (parseNovelRouter.action) {
              parseNovelRouter.handlers[parseNovelRouter.action]?.onclosetag?.(
                name,
                isImplied,
              );
            }
            parseNovelRouter.onclosetag?.(name, isImplied);
          },
        });

        parser.write(html);
        parser.end();
        novel.chapters = chapters;
        switch (novel.status?.trim()) {
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
        novel.genres = novel.genres?.replace(/,*\s*$/, '');
        novel.name = novel.name.trim();
        novel.summary = novel.summary?.trim();
        return novel;
      });
  }
  parseChapter(chapterPath: string): Promise<string> {
    return fetchApi(this.site + chapterPath)
      .then(res => res.text())
      .then(
        html =>
          html.match(
            /(<div id="chapter-content".+?>[^]+)<div style="text-align: center;/,
          )?.[1] || 'Không tìm thấy nội dung',
      );
  }
  searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site + '/tim-kiem?keywords=' + searchTerm + '&page=' + pageNo;
    return this.parseNovels(url);
  }
  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site,
    },
  };
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
