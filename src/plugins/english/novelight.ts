import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { defaultCover } from '@libs/defaultCover';
import dayjs from 'dayjs';
import { storage } from '@libs/storage';
import { NovelStatus } from '@libs/novelStatus';

class Novelight implements Plugin.PagePlugin {
  id = 'novelight';
  name = 'Novelight';
  version = '1.1.1';
  icon = 'src/en/novelight/icon.png';
  site = 'https://novelight.net/';

  hideLocked = storage.get('hideLocked');
  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}catalog/?ordering=popularity&page=${page}`;

    const body = await fetchApi(url).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('a.item').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('div.title').text().trim();
      const novelUrl = ele.attribs.href;
      const bareNovelCover = loadedCheerio(ele).find('img').attr('src');
      const novelCover = bareNovelCover
        ? this.site + bareNovelCover
        : defaultCover;
      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover ?? defaultCover,
        path: novelUrl.replace('/', ''),
      };

      novels.push(novel);
    });

    return novels;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: loadedCheerio('h1').text() || 'Untitled',
      cover: this.site + loadedCheerio('.poster > img').attr('src'),
      summary: loadedCheerio('section.text-info.section > p').text(),
      totalPages: loadedCheerio('#select-pagination-chapter > option').length,
      chapters: [],
    };

    const info = loadedCheerio('div.mini-info > .item').toArray();
    let status = '';
    let translation = '';
    for (const child of info) {
      const type = loadedCheerio(child).find('.sub-header').text().trim();
      if (type === 'Status') {
        status = loadedCheerio(child).find('div.info').text().trim();
      }
      if (type === 'Translation') {
        translation = loadedCheerio(child).find('div.info').text().trim();
      }
      if (type === 'Author') {
        novel.author = loadedCheerio(child).find('div.info').text().trim();
      }
      if (type === 'Genres') {
        novel.genres = loadedCheerio(child)
          .find('div.info > a')
          .map((i, el) => loadedCheerio(el).text())
          .toArray()
          .join(', ');
      }
    }
    if (status === 'cancelled') novel.status = NovelStatus.Cancelled;
    else if (status === 'releasing' || translation === 'ongoing')
      novel.status = NovelStatus.Ongoing;
    else if (status === 'completed' && translation === 'completed')
      novel.status = NovelStatus.Completed;

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const rawBody = await fetchApi(this.site + novelPath).then(r => r.text());
    const csrftoken = rawBody?.match(/window\.CSRF_TOKEN = "([^"]+)"/)?.[1];
    const bookId = rawBody?.match(/const OBJECT_BY_COMMENT = ([0-9]+)/)?.[1];
    const totalPages = parseInt(
      rawBody
        ?.match(/<option value="([0-9]+)"/g)
        ?.at(-1)
        ?.match(/([0-9]+)/)?.[1] ?? '1',
    );

    const chaptersRaw = await fetchApi(
      `${this.site}/book/ajax/chapter-pagination?csrfmiddlewaretoken=${csrftoken}&book_id=${bookId}&page=${totalPages - parseInt(page) + 1}`,
      {
        headers: {
          'Host': this.site.replace('https://', '').replace('/', ''),
          'Referer': this.site + novelPath,
          'X-Requested-With': 'XMLHttpRequest',
        },
      },
    )
      .then(r => r.json())
      .then(r => r.html);

    const chapter: Plugin.ChapterItem[] = [];

    parseHTML('<html>' + chaptersRaw + '</html>')('a').each((idx, ele) => {
      const title = parseHTML(ele)('.title').text().trim();
      const isLocked = !!parseHTML(ele)('.cost').text().trim();
      if (this.hideLocked && isLocked) return;

      let date;
      try {
        date = dayjs(
          parseHTML(ele)('.date').text().trim(),
          'DD.MM.YYYY',
        ).toISOString();
      } catch (error) {}

      const chapterName = isLocked ? '🔒 ' + title : title;
      const chapterUrl = ele.attribs.href;
      chapter.push({
        name: chapterName,
        path: chapterUrl,
        page: page,
        releaseTime: date,
      });
    });

    const chapters = chapter.reverse();
    return { chapters };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const rawBody = await fetchApi(this.site + chapterPath).then(r => {
      const res = r.text();
      return res;
    });

    const csrftoken = rawBody?.match(/window\.CSRF_TOKEN = "([^"]+)"/)?.[1];
    const chapterId = rawBody?.match(/const CHAPTER_ID = "([0-9]+)/)?.[1];

    let className;
    const body = await fetchApi(
      this.site + 'book/ajax/read-chapter/' + chapterId,
      {
        method: 'GET',
        headers: {
          Cookie: 'csrftoken=' + csrftoken,
          Referer: this.site + chapterPath,
          'X-Requested-With': 'XMLHttpRequest',
        },
      },
    ).then(async r => {
      const res = await r.json();
      className = res.class;
      return res.content;
    });

    const loadedCheerio = parseHTML(body);
    const chapterText = loadedCheerio('.' + className).html() || '';

    return chapterText.replace(
      /class="advertisment"/g,
      'style="display:none;"',
    );
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}catalog/?search=${encodeURIComponent(searchTerm)}`;
    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('a.item').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('div.title').text().trim();
      const novelUrl = ele.attribs.href;
      const bareNovelCover = loadedCheerio(ele).find('img').attr('src');
      const novelCover = bareNovelCover
        ? this.site + bareNovelCover
        : defaultCover;
      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover ?? defaultCover,
        path: novelUrl.replace('/', ''),
      };

      novels.push(novel);
    });

    return novels;
  }
}

export default new Novelight();
