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

  private cachedNovel: Plugin.NovelItem | null = null;

  private async novel(): Promise<Plugin.NovelItem> {
    if (this.cachedNovel !== null) {
      return this.cachedNovel;
    }

    const result = await fetchApi(this.site);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    const latestArcCover = loadedCheerio('.entry-content h1 img')
      .last()
      .attr('src');

    this.cachedNovel = {
      name: 'Re:Zero kara Hajimeru Isekai Seikatsu',
      path: '/table-of-content',
      cover: latestArcCover,
    };

    return this.cachedNovel;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const novels = [];
    if (pageNo === 1) {
      novels.push(await this.novel());
    }

    return novels;
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
    const [body, novel] = await Promise.all([
      fetchApi(this.site + novelPath).then(result => result.text()),
      this.novel(),
    ]);

    const loadedCheerio = parseHTML(body);

    return {
      ...novel,
      author: 'Tappei Nagatsuki',
      chapters: this.parseChaptersFromTOC(loadedCheerio),
      status: NovelStatus.Ongoing,
      summary:
        'Fan translation of the Re:Zero web novel (Arc 5 onwards).\n\nSuddenly, Natsuki Subaru, a shut-in student, is summoned to another world on his way home from the convenience store. A completely ordinary person with no knowledge, skills, combat abilities, or communication skills, he\'s thrown into this other world without any cheat bonuses and must desperately try to survive. The only blessing he receives is the painful ability to "return by death," which allows him to rewind time after dying! In this other world where he has no one to rely on, how many times will he die, and what will he ultimately gain?',
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
