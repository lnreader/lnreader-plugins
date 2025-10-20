import { Plugin } from '@/types/plugin';
import { fetchApi } from '@libs/fetch';
import { CheerioAPI, load as parseHTML } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';

class FaqWikiUs implements Plugin.PluginBase {
  id = 'FWK.US';
  name = 'Faq Wiki';
  site = 'https://faqwiki.us/';
  version = '2.0.1';
  icon = 'src/en/faqwikius/icon.png';

  parseNovels(loadedCheerio: CheerioAPI, searchTerm?: string) {
    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('.plt-page-item').each((index, element) => {
      const name = loadedCheerio(element)
        .text()
        .replace('Novel – All Chapters', '')
        .trim();
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
        ?.replace(this.site, '')
        ?.replace(/\/+$/, '');
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

  async popularNovels(): Promise<Plugin.NovelItem[]> {
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

    const img = loadedCheerio('.wp-block-image img');
    const cover = img.attr('data-ezsrc') || img.attr('src');
    novel.cover = cover?.replace(/\?ezimgfmt=.*$/, ''); // Regular expression magic!

    const status = loadedCheerio(
      "#lcp_instance_0 +:icontains('complete')",
    ).text();
    novel.status = status ? NovelStatus.Completed : NovelStatus.Ongoing;

    loadedCheerio('.entry-content strong').each((i, el) => {
      const key = loadedCheerio(el).text().trim().toLowerCase();
      const parent = loadedCheerio(el).parent();
      const values = [parent.text().slice(key.length).trim()].concat(
        parent
          .nextUntil('p:has(strong)')
          .map((e, ax) => loadedCheerio(ax).text().trim())
          .get(),
      );
      let genreText = values.join(' ').trim();
      const multiWordGenres = [
        //add more when found
        'Slice of Life',
        'School Life',
      ];
      multiWordGenres.forEach(genre => {
        genreText = genreText.replace(
          new RegExp(`\\b${genre}\\b`, 'g'),
          genre.replace(/ /g, '_'),
        );
      });
      const genres = genreText
        .split(/\s+/)
        .map(word => word.replace(/_/g, ' '))
        .join(', ');

      switch (key) {
        case 'description:':
          novel.summary = values.join('\n');
          break;
        case 'author(s):':
          novel.author = values[0];
          break;
        case 'genre:':
          novel.genres = genres;
      }
    });

    const chapters: Plugin.ChapterItem[] = [];
    loadedCheerio('.lcp_catlist li a').each((chapterIndex, element) => {
      const name = loadedCheerio(element)
        .text()
        .replace(novel.name + '', '')
        .replace('Novel' + '', '')
        .trim();
      const path = loadedCheerio(element)
        .attr('href')
        ?.replace(this.site, '')
        ?.replace(/\/+$/, '');
      const chapterNumber = chapterIndex + 1;
      if (!path) return;
      chapters.push({
        name,
        path,
        chapterNumber,
      });
    });

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);
    const removal = ['.entry-content span', '.entry-content div', 'script'];
    removal.map(e => {
      loadedCheerio(e).remove();
    });

    const chapterText = loadedCheerio('.entry-content').html()!;
    // const chapterParagraphs = loadedCheerio('.entry-content p');

    // let chapterContent; // Save this code in case needed

    // if (chapterParagraphs.length < 5) {
    //   //some chapter in this site store their whole text in 1-4 <p>,
    //   chapterContent = chapterParagraphs
    //     .map((index, element) => {
    //       const text = loadedCheerio(element).html();
    //       return text;
    //     })
    //     .get()
    //     .join('\n\n');
    // } else {
    //   // Multiple paragraphs case
    //   chapterContent = chapterParagraphs
    //     .map((index, element) => {
    //       const text = loadedCheerio(element).text().trim();
    //       return `<p>${text}</p>`;
    //     })
    //     .get()
    //     .join('\n\n');
    // }

    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const body = await fetchApi(this.site).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    return this.parseNovels(loadedCheerio, searchTerm);
  }
}

export default new FaqWikiUs();
