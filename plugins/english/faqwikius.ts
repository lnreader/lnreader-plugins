import { Plugin } from '@typings/plugin';
import { fetchApi, fetchFile } from '@libs/fetch';
import { CheerioAPI, load as parseHTML } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';

class FaqWikiUs implements Plugin.PluginBase {
  id = 'FWK.US';
  name = 'Faq Wiki';
  site = 'https://faqwiki.us/';
  version = '1.1.1';
  icon = 'src/en/faqwikius/icon.png';

  parseNovels(loadedCheerio: CheerioAPI, searchTerm?: string) {
    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('figure.wp-block-image').each((index, element) => {
      const name = loadedCheerio(element).text();
      let cover = loadedCheerio(element).find('img').attr('data-ezsrc');

      // Remove the appended query string
      if (cover) {
        cover = cover.replace(/\?ezimgfmt=.*$/, ''); // Regular expression magic!
      } else {
        cover = loadedCheerio(element).find('img').attr('src');
      }

      const path = loadedCheerio(element)
        .find('a')
        .attr('href')
        ?.replace('tp:', 'tps:')
        ?.slice(this.site.length);
      if (!path) return;

      novels.push({ name, cover, path });
    });

    if (searchTerm) {
      novels = novels.filter(novel =>
        novel.name.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    return novels;
  }

  async popularNovels(
    page: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const body = await fetchApi(this.site).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(path: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + path).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path,
      name: '',
    };

    novel.name = loadedCheerio('.entry-title')
      .text()
      .replace('Novel – All Chapters', '')
      .trim();

    novel.cover = loadedCheerio('.wp-block-image')
      .find('img')
      .attr('data-ezsrc')
      ?.replace(/\?ezimgfmt=.*$/, ''); // Regular expression magic!

    const status = loadedCheerio(
      "#lcp_instance_0 +:icontains('complete')",
    ).text();
    novel.status = status ? NovelStatus.Completed : NovelStatus.Ongoing;

    const div = loadedCheerio('.book-review-block__meta-item-value');

    div.html(div.html()?.replace(/(?<=>)([^<]+)(?=<br\s*\/?>)/g, '<p>$1</p>')!);

    loadedCheerio('.book-review-block__meta-item-value strong').each(
      (i, el) => {
        const key = loadedCheerio(el)
          .text()
          .replace(':', '')
          .trim()
          .toLowerCase();
        const value = loadedCheerio(el).next().text().replace(':', '').trim();

        switch (key) {
          case 'description':
            novel.summary = value;
            break;
          case 'author(s)':
            novel.author = value;
            break;
          case 'genre':
            novel.genres = value.split(' ').join(',');
        }
      },
    );

    const chapters: Plugin.ChapterItem[] = loadedCheerio(
      '.lcp_catlist > li > a',
    )
      .map((chapterIndex, element) => ({
        name: loadedCheerio(element)
          .text()
          .replace(novel.name + '', '')
          .replace('Novel' + '', '')
          .trim(),
        path: '' + loadedCheerio(element).attr('href')?.slice(this.site.length),
        chapterNumber: chapterIndex + 1,
      }))
      .get();

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);
    loadedCheerio('span').remove();

    const chapterParagraphs = loadedCheerio('.entry-content p');

    let chapterContent; // Variable to store the result

    if (chapterParagraphs.length < 5) {
      //some chapter in this site store their whole text in 1-4 <p>,
      chapterContent = chapterParagraphs
        .map((index, element) => {
          const text = loadedCheerio(element).html();
          return text;
        })
        .get()
        .join('\n\n');
    } else {
      // Multiple paragraphs case
      chapterContent = chapterParagraphs
        .map((index, element) => {
          const text = loadedCheerio(element).text().trim();
          return `<p>${text}</p>`;
        })
        .get()
        .join('\n\n');
    }

    return chapterContent;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const body = await fetchApi(this.site).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    return this.parseNovels(loadedCheerio, searchTerm);
  }

  fetchImage = fetchFile;
}

export default new FaqWikiUs();
