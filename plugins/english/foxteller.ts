import { Plugin } from '@/types/plugin';
import { Parser } from 'htmlparser2';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';

class Foxteller implements Plugin.PluginBase {
  id = 'foxteller';
  name = 'Foxteller';
  site = 'https://www.foxteller.com';
  version = '1.0.2';
  icon = 'src/en/foxteller/icon.png';

  async safeFecth(url: string, init: any = {}): Promise<string> {
    const r = await fetchApi(url, init);
    if (!r.ok)
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    const data = await r.text();
    const title = data.match(/<title>(.*?)<\/title>/)?.[1]?.trim();

    if (
      title &&
      (title == 'Bot Verification' ||
        title == 'You are being redirected...' ||
        title == 'Un instant...' ||
        title == 'Just a moment...' ||
        title == 'Redirecting...')
    )
      throw new Error('Captcha error, please open in webview');

    return data;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site + '/library?sort=' + filters?.order?.value || 'popularity';

    const body = await this.safeFecth(url);
    const novels: Plugin.NovelItem[] = [];

    const div = body.match(/<div class="col-md-6">([\s\S]*?)<\/div>/g) || [];
    div.forEach(elements => {
      const [, novelUrl, novelName] =
        elements.match(/<a href="(.*?)" title="(.*?)">/) || [];

      if (novelName && novelUrl) {
        const novelCover = elements.match(
          /<img class="img-fluid" src="(.*?)".*>/,
        );

        novels.push({
          name: novelName,
          cover: novelCover?.[1] || defaultCover,
          path: novelUrl.split('/')[4],
        });
      }
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await this.safeFecth(this.resolveUrl(novelPath));
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      genres: '',
      summary: '',
      status: '',
      chapters: [] as Plugin.ChapterItem[],
    };
    let isParsingGenres = false;
    let isReadingGenre = false;
    let isReadingSummary = false;
    let isParsingInfo = false;
    let isReadingInfo = false;
    let isParsingChapterList = false;
    let isReadingChapter = false;
    let isPaidChapter = false;
    const chapters: Plugin.ChapterItem[] = [];
    let tempChapter = {} as Plugin.ChapterItem;

    const parser = new Parser({
      onopentag(name, attribs) {
        // name and cover
        if (!novel.cover && attribs['class'] === 'img-fluid') {
          novel.name = attribs['alt'];
          novel.cover = attribs['src'] || defaultCover;
        } // genres
        else if (name === 'div' && attribs['class'] === 'novel-genres') {
          isParsingGenres = true;
        } else if (isParsingGenres && name === 'li') {
          isReadingGenre = true;
        } // summary
        else if (name === 'div' && attribs['class'] === 'novel-description') {
          isReadingSummary = true;
        } // status
        else if (name === 'div' && attribs['class'] === 'novel-tags') {
          isParsingInfo = true;
        } else if (isParsingInfo && name === 'li') {
          isReadingInfo = true;
        }
        // chapters
        else if (name === 'div' && attribs['class'] === 'col-md-6') {
          isParsingChapterList = true;
        } else if (isParsingChapterList && name === 'a') {
          isReadingChapter = true;
          tempChapter.chapterNumber = chapters.length + 1;
          tempChapter.path = novelPath + '/' + attribs['href'].split('/')[5];
        } else if (
          isReadingChapter &&
          name === 'i' &&
          attribs['class']?.includes('lock')
        ) {
          isPaidChapter = true;
        }
      },
      ontext(data) {
        // genres
        if (isParsingGenres) {
          if (isReadingGenre) {
            novel.genres += data + ', ';
          }
        } // summary
        else if (isReadingSummary) {
          novel.summary += data.trim();
        } // status
        else if (isParsingInfo) {
          if (isReadingInfo) {
            const detailName = data.toLowerCase().trim();
            switch (detailName) {
              case 'completed':
                novel.status = NovelStatus.Completed;
                break;
              case 'ongoing':
                novel.status = NovelStatus.Ongoing;
                break;
              case 'hiatus':
                novel.status = NovelStatus.OnHiatus;
                break;
              default:
                novel.status = NovelStatus.Unknown;
                break;
            }
          }
        }
        // chapters
        else if (isParsingChapterList) {
          if (isReadingChapter) {
            tempChapter.name = (tempChapter.name || '') + data;
          }
        }
      },
      onclosetag(name) {
        // genres
        if (isParsingGenres) {
          if (isReadingGenre) {
            isReadingGenre = false; // stop reading genre
          } else {
            isParsingGenres = false; // stop parsing genres
            novel.genres = novel.genres?.slice(0, -2); // remove trailing comma
          }
        } // summary
        else if (isReadingSummary) {
          if (name === 'hr' || name === 'p') {
            novel.summary += '\n';
          } else if (name === 'div') {
            isReadingSummary = false;
          }
        } // status
        else if (isParsingInfo) {
          if (name === 'li') {
            isReadingInfo = false;
          } else if (name === 'div') {
            isParsingInfo = false;
          }
        } // chapters
        else if (isParsingChapterList) {
          if (isReadingChapter) {
            if (name === 'li') {
              if (isPaidChapter) {
                isPaidChapter = false;
              } else {
                tempChapter.name = tempChapter.name.trim();
                chapters.push(tempChapter);
              }
              isReadingChapter = false;
              tempChapter = {} as Plugin.ChapterItem;
            }
          } else if (name === 'ul') {
            isParsingChapterList = false;
          }
        }
      },
    });

    parser.write(body);
    parser.end();

    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const res = await this.safeFecth(this.resolveUrl(chapterPath));
    const novelID = chapterPath.split('/')[0];
    const chapterID = res.match(/'chapter_id': '([\d]+)'/)?.[1];

    if (!chapterID) throw new Error('No chapter found');

    const { aux } = await fetchApi(this.site + '/aux_dem', {
      method: 'post',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
        'Content-Type': 'application/json;charset=utf-8',
      },
      Referer: this.resolveUrl(chapterPath),
      body: JSON.stringify({ 'x1': novelID, 'x2': chapterID }),
    }).then(res => res.json());

    if (aux && typeof aux === 'string') {
      const base64 = aux.replace(/%R([a-f])&/g, (match, code) => {
        switch (code) {
          case 'a':
            return 'A';
          case 'c':
            return 'B';
          case 'b':
            return 'C';
          case 'd':
            return 'D';
          case 'f':
            return 'E';
          case 'e':
            return 'F';
          default:
            return match;
        }
      });

      return decodeURIComponent(decodeBase64(base64));
    }

    throw new Error('This chapter is closed');
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const body = await this.safeFecth(this.site + '/search', {
      method: 'post',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
        'Content-Type': 'application/json;charset=utf-8',
      },
      Referer: this.site,
      body: JSON.stringify({ query: searchTerm }),
    });
    const novels: Plugin.NovelItem[] = [];

    const items = body.match(/<a.*>([\s\S]*?)<\/a>/g) || [];
    items.forEach(elements => {
      const novelUrl = elements.match(/<a href="(.*?)"/)?.[1] || '';
      const path = novelUrl.split('/')[4];
      const name = elements.match(
        /<span class="ellipsis-1">(.*?)<\/span>/,
      )?.[1];

      if (name && path) {
        const cover =
          elements.match(/<img src="(.*?)".*>/)?.[1] || defaultCover;
        novels.push({ name, cover, path });
      }
    });

    return novels;
  }

  resolveUrl = (path: string) => this.site + '/novel/' + path;

  filters = {
    order: {
      value: 'popularity',
      label: 'Order by',
      options: [
        { label: 'Popular Novels', value: 'popularity' },
        { label: 'New Novels', value: 'newest' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new Foxteller();

const base64Characters =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function decodeBase64(encodedString: string) {
  const hexcode = [];
  let i = 0;

  while (i < encodedString.length) {
    const enc1 = base64Characters.indexOf(encodedString.charAt(i++));
    const enc2 = base64Characters.indexOf(encodedString.charAt(i++));
    const enc3 = base64Characters.indexOf(encodedString.charAt(i++));
    const enc4 = base64Characters.indexOf(encodedString.charAt(i++));

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    hexcode.push(chr1.toString(16).padStart(2, '0'));

    if (enc3 !== 64) {
      hexcode.push(chr2.toString(16).padStart(2, '0'));
    }
    if (enc4 !== 64) {
      hexcode.push(chr3.toString(16).padStart(2, '0'));
    }
  }

  return '%' + hexcode.join('%');
}
