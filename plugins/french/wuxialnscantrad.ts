import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

const challengeTitles = new Set([
  'bot verification',
  'you are being redirected...',
  'un instant...',
  'just a moment...',
  'redirecting...',
]);

async function fetchCheckedHtml(
  url: string,
  init?: Parameters<typeof fetchApi>[1],
): Promise<string> {
  const response = await fetchApi(url, init);
  if (!response.ok)
    throw new Error(`HTTP ${response.status} while loading ${url}`);
  const html = await response.text();
  const title = html
    .match(/<title[^>]*>(.*?)<\/title>/is)?.[1]
    ?.replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (title && challengeTitles.has(title))
    throw new Error(`Bot challenge while loading ${url}`);
  return html;
}

class WuxialnscantradPlugin implements Plugin.PluginBase {
  id = 'wuxialnscantrad';
  name = 'WuxiaLnScantrad';
  icon = 'src/fr/wuxialnscantrad/icon.png';
  site = 'https://wuxialnscantrad.wordpress.com';
  version = '1.0.4';

  private async findMovedChapter(chapterPath: string): Promise<string | null> {
    const slug = chapterPath.split('/').filter(Boolean).pop() || '';
    const match = slug.match(/^(.*?)-chapitre-(\d+)/i);
    if (!match) return null;
    const series = match[1].split('-').filter(Boolean).slice(0, 3).join(' ');
    const query = `${series} chapitre ${match[2]}`;
    const response = await fetchApi(
      `https://public-api.wordpress.com/wp/v2/sites/wuxialnscantrad.wordpress.com/search?search=${encodeURIComponent(query)}&type=post&subtype=post&per_page=20`,
    );
    if (!response.ok) return null;
    const results = (await response.json()) as {
      title?: string;
      url?: string;
    }[];
    const replacement = results.find(result =>
      new RegExp(`chapitre\\D*${match[2]}(?:\\D|$)`, 'i').test(
        result.title || '',
      ),
    )?.url;
    if (!replacement) return null;
    const url = new URL(replacement, this.site);
    return url.origin === new URL(this.site).origin ? url.toString() : null;
  }

  async getCheerio(url: string): Promise<CheerioAPI> {
    return load(
      await fetchCheckedHtml(url, {
        headers: { 'Accept-Encoding': 'deflate' },
      }),
    );
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
    await Promise.all(
      novels.map(async item => {
        const detail = await this.getCheerio(this.site + item.path);
        item.cover =
          detail('.entry-content p strong img').first().attr('src') ||
          detail('.entry-content p img').first().attr('src') ||
          defaultCover;
      }),
    );
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
    const chapterPaths = new Set<string>();
    pathChapter.each((i, elem) => {
      const chapterName = $(elem).text().trim();
      const chapterUrl = $(elem).find('a').attr('href');
      if (chapterUrl && chapterUrl.includes(this.site) && chapterName) {
        const pathchapter = chapterUrl.replace(this.site, '');
        if (!chapterPaths.has(pathchapter)) {
          chapterPaths.add(pathchapter);
          const releaseDate = dayjs(
            chapterUrl?.substring(this.site.length + 1, this.site.length + 11),
          ).format('YYYY-MM-DD');
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
        return NovelStatus.Unknown;
    }
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const options = { headers: { 'Accept-Encoding': 'deflate' } };
    let body: string;
    try {
      body = await fetchCheckedHtml(this.site + chapterPath, options);
    } catch (error) {
      const replacement = await this.findMovedChapter(chapterPath);
      if (!replacement) throw error;
      body = await fetchCheckedHtml(replacement, options);
    }
    const $ = load(body);

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
    const parsedContent = load(contenuHtml);
    if (
      parsedContent.text().replace(/\s+/g, ' ').trim().length < 200 &&
      !parsedContent('img').length
    )
      throw new Error('No readable chapter content found');
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
