import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

class WarriorLegendTradPlugin implements Plugin.PluginBase {
  id = 'warriorlegendtrad';
  name = 'Warrior Legend Trad';
  icon = 'src/fr/warriorlegendtrad/icon.png';
  site = 'https://warriorlegendtrad.wordpress.com';
  version = '1.0.1';

  regexAuthors = [/Auteur\u00A0:([^\n]*)/];

  regexGenres = [/Genre :([^\n]*)/];

  regexSummary = [/Synopsis\u00A0:([\s\S]*)index chapitre :/i];

  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    const body = await r.text();
    const $ = load(body);
    return $;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 2) return [];

    const novels: Plugin.NovelItem[] = [];
    let novel: Plugin.NovelItem;
    let url;
    // light novel
    if (pageNo === 1) {
      url = this.site + '/light-novel';
    }
    // Original creation
    else {
      url = this.site + '/crea';
    }

    const $ = await this.getCheerio(url);
    $('div div div article').each((i, elem) => {
      const novelName = $(elem).find('.entry-wrapper h2').first().text().trim();
      const novelUrl = $(elem).find('.entry-wrapper h2 a').attr('href');
      const novelCover =
        $(elem).find('figure a img').attr('src') || defaultCover;

      if (novelUrl && novelName) {
        novel = {
          name: novelName,
          cover: novelCover,
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

    novel.name = $('.site-main article header h1').text().trim();
    novel.cover =
      $('.site-main article figure img').first().attr('src') || defaultCover;
    const entryContentText = $('.entry-content').text();
    novel.author = this.extractInfo(entryContentText, this.regexAuthors);
    novel.genres = this.extractInfo(entryContentText, this.regexGenres);
    novel.summary = this.extractInfo(entryContentText, this.regexSummary);
    novel.status = this.getStatus(entryContentText);

    const chapters: Plugin.ChapterItem[] = [];
    $('div div article div')
      .find('h2 a, h3 a')
      .each((i, elem) => {
        const chapterName = $(elem).text().trim();
        const chapterUrl = $(elem).attr('href');
        const releaseDate = dayjs(
          chapterUrl?.substring(this.site.length + 1, this.site.length + 11),
        ).format('DD MMMM YYYY');
        if (chapterUrl && chapterUrl.includes(this.site) && chapterName) {
          chapters.push({
            name: chapterName,
            path: chapterUrl.replace(this.site, ''),
            releaseTime: releaseDate,
          });
        }
      });

    //We sort by date because the elements are not in a fixed order,
    //and then by name because there are chapters with the same dates.
    novel.chapters = chapters.sort((a, b) => {
      if (!a.releaseTime) return 1;
      if (!b.releaseTime) return -1;
      const dateA = new Date(a.releaseTime).getTime();
      const dateB = new Date(b.releaseTime).getTime();
      const dateComparison = dateA - dateB;
      if (dateComparison === 0) {
        return a.name.localeCompare(b.name);
      }
      return dateComparison;
    });
    return novel;
  }

  extractInfo(text: string, regexes: RegExp[]): string {
    for (const regex of regexes) {
      const match = regex.exec(text);
      if (match !== null) {
        return match[1].trim();
      }
    }
    return '';
  }

  getStatus(text: string) {
    const regexSummary = [
      /État sur le site :([^\n]*)/i,
      /état sur le site:([^\n]*)/i,
    ];

    const status = this.extractInfo(text, regexSummary);
    if (status.includes('en cours')) {
      return NovelStatus.Ongoing;
    } else if (status.includes('en pause')) {
      return NovelStatus.OnHiatus;
    } else if (status.includes('terminé')) {
      return NovelStatus.Completed;
    } else if (status.includes('abandonné')) {
      return NovelStatus.Cancelled;
    }

    return NovelStatus.Ongoing;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);
    let contenuHtml = '';
    $('.entry-content')
      .contents()
      .each(function () {
        if (
          !$.html(this)?.startsWith('<div') &&
          !$.html(this)?.startsWith('<hr') &&
          !$.html(this)?.includes('<script')
        ) {
          contenuHtml += $.html(this);
        }
      });
    return contenuHtml;
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

export default new WarriorLegendTradPlugin();
