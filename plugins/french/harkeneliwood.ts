import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

class HarkenEliwoodPlugin implements Plugin.PluginBase {
  id = 'harkeneliwood';
  name = 'HarkenEliwood';
  icon = 'src/fr/harkeneliwood/icon.png';
  site = 'https://harkeneliwood.wordpress.com';
  version = '1.0.0';

  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url, {
      headers: { 'Accept-Encoding': 'deflate' },
    });
    const body = await r.text();
    const $ = load(body);
    return $;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    const novels: Plugin.NovelItem[] = [];
    let novel: Plugin.NovelItem;
    const url = this.site;
    const $ = await this.getCheerio(url + '/projets/');
    $('#content .entry-content [href]')
      // We don't collect items for Facebook and Twitter.
      .not('[rel="nofollow noopener noreferrer"]')
      .each((i, elem) => {
        const novelName = $(elem).text().trim();
        const novelUrl = $(elem).attr('href');
        if (novelUrl && novelName) {
          novel = {
            name: novelName,
            cover: defaultCover,
            path: novelUrl.replace(this.site, ''),
          };
          novels.push(novel);
        }
      });
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Sans titre',
    };

    const $ = await this.getCheerio(this.site + novelPath);
    novel.name = $('#content h1.entry-title').text().trim();
    novel.cover =
      $('#content .entry-content p img').first().attr('src') || defaultCover;
    novel.summary = this.getSummary($('#content .entry-content').text());
    novel.author = this.getAuthor($('#content .entry-content').text());
    novel.status = NovelStatus.Ongoing;
    const chapters: Plugin.ChapterItem[] = [];
    $('#content .entry-content p a').each((i, elem) => {
      const chapterName = $(elem).text().trim();
      const chapterUrl = $(elem).attr('href');
      // Check if the chapter URL exists and contains the site name.
      if (chapterUrl && chapterUrl.includes(this.site) && chapterName) {
        const releaseDate = dayjs(
          chapterUrl?.substring(this.site.length + 1, this.site.length + 11),
        ).format('DD MMMM YYYY');
        chapters.push({
          name: chapterName,
          path: chapterUrl.replace(this.site, ''),
          releaseTime: releaseDate,
        });
      }
    });
    novel.chapters = chapters;
    return novel;
  }

  getSummary(text: string) {
    let resume = '';
    const regexResume1 = /Synopsis :([\s\S]*)Traduction anglaise/i;
    const regexResume2 = /Synopsis :([\s\S]*)Raw :/i;
    const regexResume3 = /Synopsis 1 :([\s\S]*)Synopsis 2 :([\s\S]*)Raw :/i;
    const regexResume4 = /Synopsis :([\s\S]*)Prélude/i;
    const regexResume5 = /Synospis :([\s\S]*)Original /i;
    const regexResume6 = /([\s\S]*)Raw :/i;

    const match1: RegExpExecArray | null = regexResume1.exec(text);
    const match2: RegExpExecArray | null = regexResume2.exec(text);
    const match3: RegExpExecArray | null = regexResume3.exec(text);
    const match4: RegExpExecArray | null = regexResume4.exec(text);
    const match5: RegExpExecArray | null = regexResume5.exec(text);

    if (match1 !== null) {
      resume = match1[1];
    } else if (match2 !== null) {
      resume = match2[1];
    } else if (match3 !== null) {
      resume = match3[1] + match3[2];
    } else if (match4 !== null) {
      resume = match4[1];
    } else if (match5 !== null) {
      resume = match5[1];
    } else {
      resume = text;
    }

    if (regexResume6.test(resume)) {
      const match6: RegExpExecArray | null = regexResume6.exec(resume);
      if (match6 !== null) {
        resume = match6[1];
      }
    }

    return resume.trim();
  }

  getAuthor(text: string) {
    const regexAuteur = /Auteur\s*:\s*(.*?)\s*(?:\r?\n|$)/i;
    const match = regexAuteur.exec(text);

    if (match !== null && match[1].trim() !== '') {
      return match[1].trim();
    }

    return '';
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);
    const title = $('h1.entry-title');
    const chapter = $('div.entry-content');
    return (title.html() || '') + (chapter.html() || '');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];

    const popularNovels = this.popularNovels(1);

    const novels = (await popularNovels).filter(novel =>
      novel.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .includes(
          searchTerm
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim(),
        ),
    );

    return novels;
  }
}

export default new HarkenEliwoodPlugin();
