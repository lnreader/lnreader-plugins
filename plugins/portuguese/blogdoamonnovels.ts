import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { Filters } from '@libs/filterInputs';

class BlogDoAnonNovelsPlugin implements Plugin.PluginBase {
  id = 'blogdoamonnovels';
  name = 'Blog do Amon Novels';
  version = '1.0.0';
  icon = 'src/pt-br/blogdoamonnovels/icon.png';
  site = 'https://www.blogdoamonnovels.com';

  parseNovels(json: string) {
    const novels: Plugin.NovelItem[] = [];

    const result = JSON.parse(json);

    if (!('entry' in result.feed)) {
      return novels;
    }

    result.feed.entry.forEach((n: any) => {
      const novelName: string = n.title.$t;

      const novelUrl = n.link.find(
        (t: { rel: string }) => 'alternate' == t.rel,
      ).href;
      if (!novelUrl) return;

      const coverUrl = n.media$thumbnail.url.replace('/s72-c/', '/w340/');

      const novel = {
        name: novelName,
        cover: coverUrl || defaultCover,
        path: novelUrl.replace(this.site, ''),
      };

      novels.push(novel);
    });

    return novels;
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (showLatestNovels) {
      return this.searchNovels('', pageNo);
    }

    if (pageNo > 1) {
      return [];
    }
    const body = await fetchApi(this.site).then(result => result.text());

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.PopularPosts article').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('h3 a').text().trim();
      const novelUrl = loadedCheerio(ele).find('h3 a').attr('href');
      const coverUrl = loadedCheerio(ele).find('img').attr('src');
      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: coverUrl || defaultCover,
        path: novelUrl.replace(this.site, ''),
      };

      novels.push(novel);
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('[itemprop="name"]').text() || 'Untitled',
      cover: loadedCheerio('img[itemprop="image"]').attr('src'),
      summary: loadedCheerio('#synopsis')
        .find('br')
        .replaceWith('\n')
        .end()
        .text()
        .trim(),
      chapters: [],
    };

    novel.author = loadedCheerio('#extra-info dl:contains("Autor") dd')
      .text()
      .trim();

    novel.artist = loadedCheerio('#extra-info dl:contains("Artista") dd')
      .text()
      .trim();

    novel.status = loadedCheerio('[data-status]').text().trim();

    novel.genres = loadedCheerio('dt:contains("Gênero:")')
      .parent()
      .find('a')
      .map((_, ex) => loadedCheerio(ex).text().trim())
      .toArray()
      .join(',');

    const cat = loadedCheerio('#clwd').text().split("'")[1];

    if (!cat) {
      const chapters: Plugin.ChapterItem[] = [];

      loadedCheerio('#chapters chapter').each((idx, ele) => {
        const chapterName = loadedCheerio(ele).find('a').text().trim();
        const chapterUrl = loadedCheerio(ele).find('a').attr('href');
        if (!chapterUrl) return;

        chapters.push({
          name: chapterName,
          path: chapterUrl.replace(this.site, ''),
        });
      });

      novel.chapters = chapters.reverse().map((c, i) => ({
        ...c,
        name: c.name + ` - Ch. ${i + 1}`,
        chapterNumber: i + 1,
      }));

      if (!novel.summary) {
        const $summary = loadedCheerio('#chapters');
        $summary.find('h3').remove();
        $summary.find('div.flex').remove();
        $summary.find('div.separator').remove();
        $summary.find('#custom-hero').remove();
        $summary.find('[id=listItem]').remove();
        novel.summary = $summary.text().trim();
      }

      return novel;
    }

    const maxResults = 150;
    let startIndex = 1;
    let length = 0;

    const chapters: Plugin.ChapterItem[] = [];
    do {
      const jsonUrl = `${this.site}/feeds/posts/default/-/${cat}?alt=json&start-index=${startIndex}&max-results=${maxResults}`;
      const bodyResponse = await fetchApi(jsonUrl).then(result =>
        result.text(),
      );

      const result = JSON.parse(bodyResponse);

      if (!('entry' in result.feed)) {
        break;
      }

      result.feed.entry.forEach((n: any) => {
        let chapterName: string = n.title.$t;

        // Skip self
        if (chapterName === novel.name) {
          return;
        }

        // const chapterNumber: number = parseFloat(chapterName.split(' ', 2)[1]);
        const chapterUrl = n.link.find(
          (t: { rel: string }) => 'alternate' == t.rel,
        ).href;
        const releaseTime = new Date(n.updated.$t);
        if (!chapterUrl) return;

        if (n.content && n.content.$t) {
          try {
            const dom = parseHTML(n.content.$t);
            chapterName = dom('.conteudo_teste center h1').text().trim();
          } catch (error) {
            /* empty */
          }
        }

        chapters.push({
          name: chapterName,
          path: chapterUrl.replace(this.site, ''),
          releaseTime: releaseTime.toISOString(),
          // chapterNumber: chapterNumber,
        });
      });

      length = result.feed.entry.length;
      startIndex += maxResults;
    } while (length >= maxResults);

    novel.chapters = chapters.reverse().map((c, i) => ({
      ...c,
      name: c.name + ` - Ch. ${i + 1}`,
      chapterNumber: i + 1,
    }));
    return novel;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();
    const maxResults = 10;

    params.append('alt', 'json');
    if (pageNo > 1) {
      params.append('start-index', `${(pageNo - 1) * maxResults + 1}`);
    }
    params.append('max-results', `${maxResults}`);
    params.append('q', `label:Series ${searchTerm}`.trim());

    const jsonUrl = `${this.site}/feeds/posts/summary?` + params.toString();
    const json = await fetchApi(jsonUrl).then(result => result.text());

    return this.parseNovels(json);
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const $readerarea = loadedCheerio('.conteudo_teste');

    // Remove empty paragraphs
    $readerarea.find('p').each((i, el) => {
      const $this = loadedCheerio(el);
      const $imgs = $this.find('img');
      const cleanContent = $this
        .text()
        ?.replace(/\s|&nbsp;/g, '')
        ?.replace(this.site, '');

      // Without images and empty content
      if ($imgs?.length === 0 && cleanContent?.length === 0) {
        $this.remove();
      }
    });

    return $readerarea.html() || '';
  }

  filters = {} satisfies Filters;
}

export default new BlogDoAnonNovelsPlugin();
