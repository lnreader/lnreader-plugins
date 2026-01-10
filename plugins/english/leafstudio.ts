import { CheerioAPI, load as parseHTML } from 'cheerio';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { Filters } from '@libs/filterInputs';

class LeafStudio implements Plugin.PluginBase {
  id = 'LeafStudio';
  name = 'LeafStudio';
  icon = 'src/en/leafstudio/icon.png';
  site = 'https://leafstudio.site/';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  parseNovelsList(cheerio: CheerioAPI): Plugin.NovelItem[] {
    return cheerio('a.novel-item')
      .map((i, el) => {
        const elc = parseHTML(el);
        return {
          name: elc('p.novel-item-title').text().trim(),
          path: cheerio(el).attr('href')!.replace(this.site, ''),
          cover: elc('img.novel-item-Cover').attr('src'),
        };
      })
      .toArray();
  }

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site + 'novels';
    if (page > 1) {
      link += '/page/' + page;
    }

    const result = await fetchApi(link);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovelsList(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.title').text().trim() || '',
      cover: loadedCheerio('img#novel_cover').attr('src') || defaultCover,
      summary: loadedCheerio('div.desc_div > p')
        .map((i, el) => parseHTML(el).text())
        .toArray()
        .join('\n\n'),
      chapters: [],
      author: '',
      genres: loadedCheerio('div#tags_div > a.novel_genre')
        .map((i, el) => parseHTML(el).text().trim())
        .toArray()
        .join(', '),
    };
    const status = loadedCheerio('a#novel_status').text().trim();
    if (status == 'Active') {
      novel.status = 'Ongoing';
    } else {
      novel.status = status;
    }

    const chapter: Plugin.ChapterItem[] = [];

    loadedCheerio('a.free_chap.chap').each((i, el) => {
      const path =
        loadedCheerio(el).attr('href')?.trim()?.replace(this.site, '') || '';
      const name = loadedCheerio(el).text();

      chapter.push({
        name,
        path,
      });
    });

    novel.chapters = chapter.reverse();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    return loadedCheerio('article > p.chapter_content')
      .map((i, el) => parseHTML(el).html())
      .toArray()
      .join('<br>');
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site + 'novels';
    if (page > 1) {
      link += '/page/' + page;
    }

    link +=
      '?search=' +
      encodeURIComponent(searchTerm) +
      '&type=&language=&status=&sort=';

    const result = await fetchApi(link);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovelsList(loadedCheerio);
  }
}

export default new LeafStudio();
