import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

class NovelHi implements Plugin.PluginBase {
  id = 'novelhi';
  name = 'NovelHi';
  site = 'https://novelhi.com/';
  version = '1.0.0';

  //----------------------------------
  // Parse Novel List
  //----------------------------------
  parseNovels($: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    $('.book-item').each((_, el) => {
      const name = $(el).find('.book-name').text().trim();
      const cover = $(el).find('img').attr('src') || '';
      const url = $(el).find('a').attr('href');

      if (!url) return;

      novels.push({
        name,
        cover,
        path: url.replace(this.site, ''),
      });
    });

    return novels;
  }

  //----------------------------------
  // Popular
  //----------------------------------
  async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
    const res = await fetchApi(`${this.site}popular?page=${page}`);
    const body = await res.text();

    const $ = parseHTML(body);
    return this.parseNovels($);
  }

  //----------------------------------
  // Search
  //----------------------------------
  async searchNovels(searchTerm: string, page: number) {
    const res = await fetchApi(
      `${this.site}search?keyword=${encodeURIComponent(searchTerm)}&page=${page}`,
    );

    const body = await res.text();
    const $ = parseHTML(body);

    return this.parseNovels($);
  }

  //----------------------------------
  // Novel Details
  //----------------------------------
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const res = await fetchApi(this.site + novelPath);
    const body = await res.text();

    const $ = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').text().trim(),
      cover: $('.book-img img').attr('src') || '',
      summary: $('.book-info').text().trim(),
      chapters: [],
    };

    const chapters: Plugin.ChapterItem[] = [];

    $('.chapter-list a').each((_, el) => {
      const name = $(el).text().trim();
      const url = $(el).attr('href');

      if (!url) return;

      chapters.push({
        name,
        path: url,
      });
    });

    novel.chapters = chapters.reverse();

    return novel;
  }

  //----------------------------------
  // Chapter Content
  //----------------------------------
  async parseChapter(chapterPath: string): Promise<string> {
    const res = await fetchApi(this.site + chapterPath);
    const body = await res.text();

    const $ = parseHTML(body);

    $('.chapter-content script').remove();

    return $('.chapter-content').html() || '';
  }
}

export default new NovelHi();
