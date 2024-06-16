import { Parser } from 'htmlparser2';
import { fetchApi, fetchFile } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';

class RanobesPlugin implements Plugin.PagePlugin {
  id = 'ranobes';
  name = 'Ranobes';
  icon = 'src/en/ranobes/icon.png';
  site = 'https://ranobes.top';
  filters?: Filters | undefined;
  version = '2.0.0';

  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  parseNovels(html: string) {
    const novels: Plugin.NovelItem[] = [];
    let tempNovel = {} as Plugin.NovelItem;
    tempNovel.name = '';
    const baseUrl = this.site;
    let isParsingNovel = false;
    let isTitleTag = false;
    let isNovelName = false;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (attribs['class']?.includes('short-cont')) {
          isParsingNovel = true;
        }
        if (isParsingNovel) {
          if (name === 'h2' && attribs['class']?.includes('title')) {
            isTitleTag = true;
          }
          if (isTitleTag && name === 'a') {
            tempNovel.path = attribs['href'].slice(baseUrl.length);
            isNovelName = true;
          }
          if (name === 'figure') {
            tempNovel.cover = attribs['style'].replace(
              /.*url\((.*?)\)./g,
              '$1',
            );
          }
          if (tempNovel.path && tempNovel.cover) {
            novels.push(tempNovel);
            tempNovel = {} as Plugin.NovelItem;
            tempNovel.name = '';
          }
        }
      },
      ontext(data) {
        if (isNovelName) {
          tempNovel.name += data;
        }
      },
      onclosetag(name) {
        if (name === 'h2') {
          isNovelName = false;
          isTitleTag = false;
        }
        if (name === 'figure') {
          isParsingNovel = false;
        }
      },
    });
    parser.write(html);
    parser.end();
    return novels;
  }

  parseChapters(data: { chapters: ChapterEntry[] }) {
    const chapter: Plugin.ChapterItem[] = [];
    data.chapters.map((item: ChapterEntry) => {
      chapter.push({
        name: item.title,
        releaseTime: new Date(item.date).toISOString(),
        path: item.link.slice(this.site.length),
      });
    });
    return chapter.reverse();
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}/novels/page/${page}/`;
    const body = await fetchApi(link).then(r => r.text());

    return this.parseNovels(body);
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const url = this.site + novelPath;
    const result = await fetchApi(url);
    const html = await result.text();
    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: '',
      summary: '',
      chapters: [],
      totalPages: 1,
    };
    let baseUrl = this.site;
    let isCover = false;
    let isAuthor = false;
    let isSummary = false;
    let isStatus = false;
    let isStatusText = false;
    let isGenres = false;
    let isGenresText = false;
    let genreArray: string[] = [];
    let novelId = '';
    const parser = new Parser({
      onopentag(name, attribs) {
        if (attribs['class'] === 'poster') {
          isCover = true;
        }
        if (isCover && name === 'img') {
          novel.name = attribs['alt'];
          novel.cover = baseUrl + attribs['src'];
        }
        if (name === 'div' && attribs['class'] === 'moreless') {
          isSummary = true;
        }
        if (name === 'li' && attribs['title']?.includes('Original status')) {
          isStatus = true;
        }
        if (name === 'input' && attribs['name'] === 'newsid') {
          novelId = attribs['value'];
        }
      },
      onopentagname(name) {
        if (isSummary && name === 'br') {
          novel.summary += `/n`;
        }
        if (isStatus && name === 'a') {
          isStatusText = true;
        }
        if (isGenres && name === 'a') {
          isGenresText = true;
        }
      },
      onattribute(name, value) {
        if (name === 'itemprop' && value === 'creator') {
          isAuthor = true;
        }
        if (name === 'id' && value === 'mc-fs-genre') {
          isGenres = true;
        }
      },
      ontext(data) {
        if (isAuthor) {
          novel.author = data;
        }
        if (isSummary) {
          novel.summary += data;
        }
        if (isStatusText) {
          novel.status = data === 'Ongoing' ? 'Ongoing' : 'Completed';
        }
        if (isGenresText) {
          genreArray.push(data);
        }
      },
      onclosetag(name) {
        if (name === 'a') {
          isCover = false;
          isAuthor = false;
          isStatusText = false;
          isGenresText = false;
          isStatus = false;
        }
        if (name === 'div') {
          isSummary = false;
          isGenres = false;
        }
      },
    });
    parser.write(html);
    parser.end();
    novel.genres = genreArray.join(', ');

    const chapterListUrl = this.site + '/chapters/' + novelId + '/';
    const chaptersHtml = await fetchApi(chapterListUrl).then(r => r.text());
    let dataJson: {
      pages_count: string;
      chapters: ChapterEntry[];
    } = { pages_count: '', chapters: [] };
    let isScript = false;
    const parser2 = new Parser({
      ontext(data) {
        if (isScript) {
          if (data.includes('window.__DATA__ =')) {
            dataJson = JSON.parse(data.replace('window.__DATA__ =', ''));
          }
        }
      },
      onclosetag(name) {
        if (name === 'main') {
          isScript = true;
        }
        if (name === 'script') {
          isScript = false;
        }
      },
    });
    parser2.write(chaptersHtml);
    parser2.end();

    novel.totalPages = Number(dataJson.pages_count);
    novel.chapters = this.parseChapters(dataJson);

    const latestChapterUrl = dataJson.chapters[0].link;
    const latestChapterName = dataJson.chapters[0].title;
    const latestChapterDate = dataJson.chapters[0].date;

    novel.latestChapter = latestChapterUrl
      ? {
          path: latestChapterUrl.replace(this.site, ''),
          name: latestChapterName,
          releaseTime: new Date(latestChapterDate).toISOString(),
        }
      : undefined;
    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const pagePath = novelPath.split('-')[0];
    const firstUrl = this.site + '/chapters' + pagePath.replace('novels/', '');
    const pageUrl = firstUrl + '/page/' + page;
    const pageBody = await fetchApi(pageUrl).then(r => r.text());
    let isScript = false;
    let dataJson: {
      pages_count: string;
      chapters: ChapterEntry[];
    } = { pages_count: '', chapters: [] };
    const parser = new Parser({
      ontext(data) {
        if (isScript) {
          if (data.includes('window.__DATA__ =')) {
            dataJson = JSON.parse(data.replace('window.__DATA__ =', ''));
          }
        }
      },
      onclosetag(name) {
        if (name === 'main') {
          isScript = true;
        }
        if (name === 'script') {
          isScript = false;
        }
      },
    });
    parser.write(pageBody);
    parser.end();
    const chapters = this.parseChapters(dataJson);
    return {
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const html = await result.text();
    let chapterText = '';
    let isChapter = false;
    let isPtag = false;
    let isStyleText = false;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (isChapter && name === 'div') {
          let stylediv = attribs['style'];
          if (stylediv) {
            chapterText += `<div style="${stylediv}">`;
            isStyleText = true;
          } else {
            chapterText += `<div>`;
          }
        }
        if (isChapter && name === 'table') {
          let w = attribs['width'];
          if (w) {
            chapterText += `<table width="${w}">`;
          } else {
            chapterText += `<table>`;
          }
        }
        if (isChapter && name === 'tbody') {
          chapterText += `<tbody>`;
        }
        if (isChapter && name === 'tr') {
          chapterText += `<tr>`;
        }
        if (isChapter && name === 'td') {
          let w1 = attribs['width'];
          if (w1) {
            chapterText += `<td width="${w1}">`;
          } else {
            chapterText += `<td>`;
          }
        }
      },
      onattribute(name, value) {
        if (name === 'id' && value === 'arrticle') {
          isChapter = true;
        }
        if (name === 'class' && value === 'category grey ellipses') {
          isChapter = false;
          isPtag = false;
        }
      },
      onopentagname(name) {
        if (isChapter && name === 'p') {
          chapterText += '<p>';
          isPtag = true;
          if (isStyleText) {
            isStyleText = false;
          }
        }
        if (isChapter && name === 'br') {
          chapterText += `<br>`;
        }
      },
      ontext(data) {
        if (isPtag) {
          chapterText += data;
        }
        if (isStyleText) {
          chapterText += data;
        }
      },
      onclosetag(name) {
        if (name === 'p') {
          isPtag = false;
          chapterText += '</p>';
        }
        if (isChapter && name === 'td') {
          chapterText += `</td>`;
        }
        if (isChapter && name === 'tr') {
          chapterText += `</tr>`;
        }
        if (isChapter && name === 'tbody') {
          chapterText += `</tbody>`;
        }
        if (isChapter && name === 'table') {
          chapterText += `</table>`;
        }
        if (isChapter && name === 'div') {
          isStyleText = false;
          chapterText += `</div>`;
        }
      },
    });
    parser.write(html);
    parser.end();

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}/search/${searchTerm}/page/${page}`;
    const body = await fetchApi(link).then(r => r.text());

    return this.parseNovels(body);
  }
}
export default new RanobesPlugin();

interface ChapterEntry {
  id: number;
  title: string;
  date: string;
  link: string;
}
