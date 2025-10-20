import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

class DreamBigTL implements Plugin.PluginBase {
  id = 'dreambigtl';
  name = 'Dream Big Translations';
  version = '1.0.0';
  site = 'https://www.dreambigtl.com/';
  icon = 'src/en/dreambigtl/icon.png';

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}p/disclaimer.html`;

    const response = await fetchApi(url);
    const body = await response.text();
    const loadedCheerio = parseHTML(body);
    const novels: Plugin.NovelItem[] = [];
    const categories = ['New Novels', 'Ongoing Novels', 'Completed Novels'];

    loadedCheerio('#webify-pro-main-nav-menu > li.has-sub').each(
      (_, categoryElem) => {
        const categoryName = loadedCheerio(categoryElem)
          .children('a')
          .first()
          .text()
          .trim();

        if (categories.includes(categoryName)) {
          const subMenu = loadedCheerio(categoryElem).find('ul.sub-menu.m-sub');
          subMenu.find('li > a').each((_, novelElem) => {
            const novelName = loadedCheerio(novelElem).text().trim();
            const novelUrl = loadedCheerio(novelElem).attr('href');

            if (novelUrl) {
              novels.push({
                name: novelName,
                path: novelUrl.replace(this.site, ''),
                cover: '',
              });
            }
          });
        }
      },
    );

    novels.forEach(novel => console.log('Novel:', novel.name, novel.path));

    if (novels.length === 0) {
      // Fallback: try to parse everything...
      loadedCheerio('a').each((_, elem) => {
        const href = loadedCheerio(elem).attr('href');
        if (href && href.includes('/p/') && !href.includes('disclaimer')) {
          const novelName = loadedCheerio(elem).text().trim();
          novels.push({
            name: novelName,
            path: href.replace(this.site, ''),
            cover: '',
          });
        }
      });
    }

    if (showLatestNovels) {
      novels.sort((a, b) => b.path.localeCompare(a.path));
    }

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const result = await fetchApi(url);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.entry-title').text().trim(),
      cover: loadedCheerio('.post-body img').first().attr('src') || '',
      summary: loadedCheerio('.post-body p').first().text().trim(),
      author:
        loadedCheerio('.post-body')
          .text()
          .match(/Author:\s*(.+)/i)?.[1]
          ?.trim() || 'Unknown',
      status: this.getNovelStatus(novelPath),
      chapters: await this.parseChapters(loadedCheerio),
    };

    return novel;
  }

  async parseChapters(
    loadedCheerio: CheerioAPI,
  ): Promise<Plugin.ChapterItem[]> {
    const chapters: Plugin.ChapterItem[] = [];
    // Parse "Free Tier" chapters
    loadedCheerio('.chapter-panel').each((_, panel) => {
      const panelTitle = loadedCheerio(panel).find('summary').text().trim();
      if (panelTitle === 'Free Tier') {
        loadedCheerio(panel)
          .find('ul li a')
          .each((_, chapterEle) => {
            const chapterName = loadedCheerio(chapterEle).text().trim();
            const chapterUrl = loadedCheerio(chapterEle).attr('href');
            if (chapterUrl) {
              chapters.push({
                name: chapterName,
                path: chapterUrl.replace(this.site, ''),
              });
            }
          });
      }
    });

    // Parse "List of Chapters"
    if (chapters.length === 0) {
      loadedCheerio(
        'h2:contains("List of Chapters"), span:contains("List of Chapters")',
      ).each((_, header) => {
        const chapterList = loadedCheerio(header).next('ul');
        chapterList.find('li a').each((_, chapterEle) => {
          const chapterName = loadedCheerio(chapterEle).text().trim();
          const chapterUrl = loadedCheerio(chapterEle).attr('href');
          if (chapterUrl) {
            chapters.push({
              name: chapterName,
              path: chapterUrl.replace(this.site, ''),
            });
          }
        });
      });
    }

    return chapters.reverse();
  }

  getNovelStatus(novelPath: string): string {
    if (novelPath.includes('completed')) return 'Completed';
    return 'Ongoing';
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const result = await fetchApi(url);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    const chapterTitle = loadedCheerio('h1.entry-title').text().trim();
    const chapterContent = loadedCheerio('.post-body').html() || '';

    return `<h1>${chapterTitle}</h1>${chapterContent}`;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}search?q=${encodeURIComponent(searchTerm)}`;
    const result = await fetchApi(url);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio(
      '.blog-posts.index-post-wrap .blog-post.hentry.index-post',
    ).each((_, ele) => {
      const novelName = loadedCheerio(ele).find('.entry-title a').text().trim();
      const novelUrl = loadedCheerio(ele).find('.entry-title a').attr('href');
      const novelCover =
        loadedCheerio(ele).find('.entry-image').attr('data-image') || '';

      if (novelUrl) {
        novels.push({
          name: novelName,
          path: novelUrl.replace(this.site, ''),
          cover: novelCover,
        });
      }
    });

    return novels;
  }
}

export default new DreamBigTL();
