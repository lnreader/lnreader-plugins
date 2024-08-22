import { Parser } from 'htmlparser2';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import dayjs from 'dayjs';

class LightNovelPub implements Plugin.PagePlugin {
  id = 'lightnovelpub';
  name = 'LightNovelPub';
  version = '2.1.0';
  icon = 'src/en/lightnovelpub/icon.png';
  site = 'https://www.lightnovelpub.com/';
  headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  parseNovels(html: string) {
    const novels: Plugin.NovelItem[] = [];
    let tempNovel = {} as Plugin.NovelItem;
    let isParsingNovel = false;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (isParsingNovel) {
          if (name === 'a') {
            tempNovel.path = attribs['href'].slice(1);
            tempNovel.name = attribs['title'];
          }
          if (name === 'img') {
            tempNovel.cover = attribs['data-src'] || attribs['src'];
          }
          if (tempNovel.path && tempNovel.cover) {
            novels.push(tempNovel);
            tempNovel = {} as Plugin.NovelItem;
          }
        }
      },
      onattribute(name, value) {
        if (name === 'class' && value === 'novel-item') {
          isParsingNovel = true;
        }
      },
      onclosetag(name) {
        if (name === 'li') {
          isParsingNovel = false;
        }
      },
    });
    parser.write(html);
    parser.end();
    return novels;
  }

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}browse/`;
    link += `${filters.genres.value}/`;
    link += `${filters.order.value}/`;
    link += `${filters.status.value}/`;
    link += page;

    const body = await fetchApi(link).then(r => r.text());

    return this.parseNovels(body);
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());
    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: '',
      summary: '',
      totalPages: 1,
      chapters: [],
    };
    let isHeaderStats = false;
    let isStatus = false;
    let isTotalChapters = false;
    let isNovelName = false;
    let isAuthorName = false;
    let isSummary = false;
    let isGenres = false;
    let isTags = false;
    const genreArray: string[] = [];
    let isCover = false;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (name === 'h1' && attribs['class']?.includes('novel-title')) {
          isNovelName = true;
        }
        if (name === 'div' && attribs['class']?.includes('content')) {
          isSummary = true;
        }
        if (name === 'figure' && attribs['class'] === 'cover') {
          isCover = true;
        }
        if (isCover) {
          if (name === 'img') {
            novel.cover = attribs['data-src'] || attribs['src'];
          }
        }
      },
      onopentagname(name) {
        if (isHeaderStats && name === 'strong') {
          isStatus = true;
        }
        if (isSummary && name === 'br') {
          novel.summary += '\n';
        }
        if (isGenres && name === 'a') {
          isTags = true;
        }
      },
      onattribute(name, value) {
        if (name === 'class' && value === 'header-stats') {
          isTotalChapters = true;
          isHeaderStats = true;
        }
        if (name === 'itemprop' && value === 'author') {
          isAuthorName = true;
        }
        if (name === 'class' && value === 'categories') {
          isGenres = true;
        }
      },
      ontext(data) {
        if (isTotalChapters) {
          novel.totalPages = Math.ceil(parseInt(data, 10) / 100);
        }
        if (isStatus) {
          novel.status = data.trim();
        }
        if (isNovelName) {
          novel.name += data.trim();
        }
        if (isAuthorName) {
          novel.author = data;
        }
        if (isSummary) {
          novel.summary += data;
        }
        if (isTags) {
          genreArray.push(data);
        }
      },
      onclosetag(name) {
        if (name === 'strong') {
          isTotalChapters = false;
          isStatus = false;
        }
        if (name === 'i') {
          isStatus = false;
        }
        if (name === 'h1') {
          isNovelName = false;
        }
        if (name === 'span') {
          isAuthorName = false;
        }
        if (name === 'div') {
          isHeaderStats = false;
          isSummary = false;
          isGenres = false;
        }
        if (name === 'a') {
          isTags = false;
        }
        if (name === 'figure') {
          isCover = false;
        }
      },
    });
    parser.write(body);
    parser.end();
    novel.genres = genreArray.join(', ');
    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const url = this.site + novelPath + '/chapters/page-' + page;
    const body = await fetchApi(url).then(res => res.text());
    const chapter: Plugin.ChapterItem[] = [];
    let tempChapter = {} as Plugin.ChapterItem;
    let isChapterItem = false;
    let isChapterList = false;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (isChapterList) {
          if (name === 'li') {
            isChapterItem = true;
            tempChapter.chapterNumber = Number(attribs['data-orderno']);
          }
          if (isChapterItem) {
            if (name === 'a') {
              tempChapter.name = attribs['title'];
              tempChapter.path = attribs['href'].slice(1);
            }
            if (name === 'time') {
              tempChapter.releaseTime = dayjs(
                attribs['datetime'],
              ).toISOString();
            }
            if (
              tempChapter.chapterNumber &&
              tempChapter.path &&
              tempChapter.releaseTime
            ) {
              chapter.push(tempChapter);
              tempChapter = {} as Plugin.ChapterItem;
            }
          }
        }
      },
      onattribute(name, value) {
        if (name === 'class' && value === 'chapter-list') {
          isChapterList = true;
        }
      },
      onclosetag(name) {
        if (name === 'a') {
          isChapterItem = false;
        }
        if (name === 'ul') {
          isChapterList = false;
        }
      },
    });
    parser.write(body);
    parser.end();
    const chapters = chapter;
    return { chapters };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await fetchApi(this.site + chapterPath).then(r => r.text());
    const parts: string[] = [];
    const regexPatterns: RegExp[] = [
      /(<div id="chapter-container[^]+?)<div class="chapternav/,
    ];
    const extractContent = (patterns: RegExp[]) => {
      patterns.forEach(regex => {
        const match = html.match(regex)?.[1];
        if (match) parts.push(match);
      });
    };
    extractContent(regexPatterns);
    const chapterText = parts.join();
    return chapterText.replace(/(?<=\/p>).*?(?=<p>)/g, '');
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}lnsearchlive`;
    const link = `${this.site}search`;
    const response = await fetchApi(link).then(r => r.text());
    let verifytoken = '';
    const parser = new Parser({
      onopentag(name, attribs) {
        if (
          name === 'input' &&
          attribs['name']?.includes('LNRequestVerifyToken')
        ) {
          verifytoken = attribs['value'];
        }
      },
    });
    parser.write(response);
    parser.end();

    const formData = new FormData();
    formData.append('inputContent', searchTerm);

    const body = await fetchApi(url, {
      method: 'POST',
      headers: { LNRequestVerifyToken: verifytoken! },
      body: formData,
    }).then(r => r.json());

    return this.parseNovels(body.resultview);
  }

  filters = {
    order: {
      value: 'popular',
      label: 'Order by',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Popular', value: 'popular' },
        { label: 'Updates', value: 'updated' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Completed', value: 'completed' },
        { label: 'Ongoing', value: 'ongoing' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      value: 'all',
      label: 'Genre',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Drama', value: 'drama' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Harem', value: 'harem' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Romance', value: 'romance' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Josei', value: 'josei' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Horror', value: 'horror' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Historical', value: 'historical' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Adult', value: 'adult' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Sports', value: 'sports' },
        { label: 'Lolicon', value: 'lolicon' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Video Games', value: 'video-games' },
        { label: 'Smut', value: 'smut' },
        { label: 'Magical Realism', value: 'magical-realism' },
        { label: 'Eastern Fantasy', value: 'eastern-fantasy' },
        { label: 'Contemporary Romance', value: 'contemporary-romance' },
        { label: 'Fantasy Romance', value: 'fantasy-romance' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new LightNovelPub();
