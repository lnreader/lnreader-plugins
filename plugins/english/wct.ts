import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { Plugin } from '@/types/plugin';

class WitchCultTranslations implements Plugin.PluginBase {
  id = 'witchculttranslations';
  name = 'Witch Cult Translations';
  site = 'https://witchculttranslation.com';
  icon = 'src/en/wct/icon.png';
  version = '1.0.0';

  private async novel(): Promise<Plugin.NovelItem> {
    const result = await fetchApi(this.site);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    const latestArcCover = loadedCheerio('.entry-content h1 img')
      .last()
      .attr('src');

    return {
      name: 'Re:Zero kara Hajimeru Isekai Seikatsu',
      path: '/table-of-content',
      cover: latestArcCover,
    };
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    return [await this.novel()];
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const novels = [await this.novel()];

    const q = this.normalize(searchTerm);

    return novels.filter(({ name }) => this.normalize(name).includes(q));
  }

  private normalize(str: string) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    const title = loadedCheerio('h1.entry-title').text().trim();
    const content = loadedCheerio('.entry-content').first();
    content
      .find('#patreon-snippet, .sharedaddy, .jp-relatedposts, #jp-post-flair')
      .remove();

    return `<h1>${title}</h1>${content.html() || ''}`;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    const novel = await this.novel();

    return {
      ...novel,
      author: 'Tappei Nagatsuki',
      chapters: this.parseChaptersFromTOC(loadedCheerio),
      status: NovelStatus.Ongoing,
      summary: 'Fan translation of the Re:Zero web novel (Arc 5 onwards).',
    };
  }

  private parseChaptersFromTOC(
    loadedCheerio: CheerioAPI,
  ): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    let currentArc = 0;
    let chapterNumber = 0;

    const children = loadedCheerio('.entry-content')
      .first()
      .children()
      .toArray();

    for (const el of children) {
      if (el.type !== 'tag') continue;
      const tag = el.tagName.toLowerCase();

      if (tag === 'h1' || tag === 'h2') {
        const text = loadedCheerio(el).text().trim();
        const arcMatch = text.match(/^Arc\s+(\d+)/i);
        if (arcMatch) {
          currentArc = parseInt(arcMatch[1], 10);
          continue;
        }
        if (/^Side Content/i.test(text)) {
          break;
        }
        continue;
      }

      if (tag !== 'ul' || currentArc < 5) continue;

      loadedCheerio(el)
        .find('li > a')
        .each((_, a) => {
          const href = loadedCheerio(a).attr('href');
          if (!href) return;

          const onSite =
            /^https?:\/\/(?:www\.)?witchculttranslation\.com\//i.test(href);
          if (!onSite) return;

          const name = loadedCheerio(a).text().trim();
          if (!name) return;

          const path = `/${href
            .replace(/^https?:\/\/(?:www\.)?witchculttranslation\.com\//i, '')
            .replace(/^\/+/, '')}`;

          const dateMatch = path.match(/^\/(\d{4})\/(\d{2})\/(\d{2})\//);
          const releaseTime = dateMatch
            ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
            : null;

          chapterNumber += 1;
          chapters.push({
            name: `Arc ${currentArc}, ${name}`,
            path,
            releaseTime,
            chapterNumber,
          });
        });
    }

    return chapters;
  }
}

export default new WitchCultTranslations();
