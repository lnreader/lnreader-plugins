import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

class WuxialnscantradPlugin implements Plugin.PluginBase {
  id = 'wuxialnscantrad';
  name = 'WuxiaLnScantrad';
  icon = 'src/fr/wuxialnscantrad/icon.png';
  site = 'https://wuxialnscantrad.wordpress.com';
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
    const $ = await this.getCheerio(url);
    $('#menu-item-2210 ul li').each((i, elem) => {
      const novelName = $(elem).first().text().trim();
      const novelUrl = $(elem).find('a').attr('href');

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

    novel.name = $('.entry-title').text().trim();
    novel.cover =
      $('.entry-content p strong img').first().attr('src') ||
      $('.entry-content p img').first().attr('src');

    const entryContentText = $('.entry-content').text();
    novel.author = this.getAuthor(entryContentText);
    novel.genres = this.getGenres(entryContentText);
    novel.artist = this.getArtist(entryContentText);
    novel.summary = this.getSummary(entryContentText);
    novel.status = this.getStatus(entryContentText);

    const pathChapter = $('.entry-content ul').first().children('li');
    const chapters: Plugin.ChapterItem[] = [];
    pathChapter.each((i, elem) => {
      const chapterName = $(elem).text().trim();
      const chapterUrl = $(elem).find('a').attr('href');
      if (chapterUrl && chapterUrl.includes(this.site) && chapterName) {
        const pathchapter = chapterUrl.replace(this.site, '');
        // we do not take the paths already present
        if (!chapters.some(chap => chap.path === pathchapter)) {
          const releaseDate = dayjs(
            chapterUrl?.substring(this.site.length + 1, this.site.length + 11),
          ).format('DD MMMM YYYY');
          chapters.push({
            name: chapterName,
            path: pathchapter,
            releaseTime: releaseDate,
          });
        }
      }
    });
    novel.chapters = chapters;
    return novel;
  }

  getAuthor(text: string) {
    const regex = /Auteur\(s\):\s*(.*)/;
    const match = regex.exec(text);
    let author = '';
    if (match !== null) {
      author = match[1].trim();
    }
    return author;
  }

  getGenres(text: string) {
    const regex = /Genres:\s*(.*)/;
    const match = regex.exec(text);
    let genre = '';
    if (match !== null) {
      genre = match[1].trim();
    }
    return genre;
  }

  getArtist(text: string) {
    const regex = /Artiste\(s\):\s*(.*)Genres/;
    const match = regex.exec(text);
    let artist = '';
    if (match !== null) {
      artist = match[1].trim();
    }
    return artist;
  }

  getSummary(text: string) {
    const regexAuthors = [
      /Synopsis :([\s\S]*)Chapitres disponibles/,
      /Sypnopsis([\s\S]*)Sypnopsis officiel/,
      /Synopsis([\s\S]*)Chapitres disponibles/,
    ];

    for (const regex of regexAuthors) {
      const match = regex.exec(text);
      if (match !== null) {
        return match[1].trim();
      }
    }
    return '';
  }

  getStatus(text: string) {
    const regex = /Statut:\s*(.*)/;
    const match = regex.exec(text);
    let status = '';
    if (match !== null) {
      status = match[1].trim();
    }
    switch (status) {
      case 'En cours':
        return NovelStatus.Ongoing;
      case 'Arrêté':
        return NovelStatus.Cancelled;
      case 'Terminé':
        return NovelStatus.Completed;
      default:
        return NovelStatus.Ongoing;
    }
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);

    let contenuHtml = '';
    $('.entry-content')
      .contents()
      .each(function () {
        if ($(this).html()?.includes('<script')) {
          return false;
        }
        //Removing tags linked to navigation and unnecessary paragraphs.
        if (
          !$(this).html()?.includes('data-attachment-id="480') &&
          !$.html(this)?.includes('<hr>') &&
          !$.html(this)?.includes('<p>&nbsp;</p>')
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

export default new WuxialnscantradPlugin();
