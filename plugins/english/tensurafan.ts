import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio, CheerioAPI } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type Volume = {
  id: string;
  name: string;
  path: string;
  raw?: string;
  progress?: number;
};

class TensuraFanPlugin implements Plugin.PluginBase {
  id = 'tensurafan';
  name = 'TensuraFan Slime Reader';
  icon = 'https://tensurafan.github.io/icons/android-icon-192x192.png';
  site = 'https://tensurafan.github.io';
  version = '1.0.0';

  private async getVolumes(): Promise<Volume[]> {
    const result = await fetchApi(`${this.site}/ln/volumes.json`);
    if (!result.ok) throw new Error('Could not load TensuraFan volume list');
    return (await result.json()) as Volume[];
  }

  private async loadVolume(path: string): Promise<CheerioAPI> {
    // Use the generated HTML directly. This keeps the site's illustrations and
    // formatting instead of scraping the PWA /read/vX route.
    const result = await fetchApi(this.site + path);
    if (!result.ok) throw new Error(`Could not load volume: ${path}`);
    return loadCheerio(await result.text());
  }

  private isChapterHeading(text: string): boolean {
    const t = text.replace(/\s+/g, ' ').trim();
    return (
      /^Prologue$/i.test(t) ||
      /^Chapter\s+\d+$/i.test(t) ||
      /^Interlude$/i.test(t) ||
      /^Epilogue$/i.test(t) ||
      /^Afterword$/i.test(t) ||
      /^Manga$/i.test(t)
    );
  }

  private headingText(el: any, $: CheerioAPI): string {
    return $(el).text().replace(/\s+/g, ' ').trim();
  }

  private collectChapters($: CheerioAPI, volumePath: string): Array<{ name: string; path: string; number: number }> {
    const headings = $('h1, h2, h3').toArray();
    const starts: Array<{ el: any; title: string; index: number }> = [];

    for (let i = 0; i < headings.length; i++) {
      const title = this.headingText(headings[i], $);
      if (this.isChapterHeading(title)) {
        starts.push({ el: headings[i], title, index: i });
      }
    }

    const chapters: Array<{ name: string; path: string; number: number }> = [];
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      if (start.title.toLowerCase() === 'manga') continue;

      // The site's chapter title is sometimes the heading immediately after
      // "Prologue"/"Chapter N"/etc. Include it in the displayed chapter name.
      let title = start.title;
      const nextHeading = headings[start.index + 1];
      if (nextHeading) {
        const nextText = this.headingText(nextHeading, $);
        if (!this.isChapterHeading(nextText) && nextText !== 'Contents') {
          title += `: ${nextText}`;
        }
      }

      chapters.push({
        name: title,
        // The fragment is handled locally by parseChapter; it is not sent
        // to the server, so the same volume HTML can be reused.
        path: `${volumePath}#${chapters.length}`,
        number: chapters.length + 1,
      });
    }

    return chapters;
  }

  async popularNovels(
    pageNo: number,
    _options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    const volumes = await this.getVolumes();
    return volumes.map(v => ({
      name: v.name,
      path: v.path,
      cover: defaultCover,
    }));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    const q = searchTerm.toLowerCase().trim();
    if (!q) return this.popularNovels(1, {} as any);

    const volumes = await this.getVolumes();
    return volumes
      .filter(v => v.name.toLowerCase().includes(q))
      .map(v => ({
        name: v.name,
        path: v.path,
        cover: defaultCover,
      }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.loadVolume(novelPath);
    const volumeName =
      $('h1').first().text().replace(/\s+/g, ' ').trim() ||
      novelPath.split('/').pop()?.replace('.html', '') ||
      'TensuraFan Volume';

    const chapters = this.collectChapters($, novelPath).map(ch => ({
      name: ch.name,
      path: ch.path,
      chapterNumber: ch.number,
    }));

    return {
      path: novelPath,
      name: volumeName,
      author: 'Fuse',
      genres: 'Light Novel, Fantasy',
      status: NovelStatus.Completed,
      summary: 'Fan translation of That Time I Got Reincarnated as a Slime (Tensura), hosted by TensuraFan.',
      cover: defaultCover,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const hashIndex = chapterPath.indexOf('#');
    const volumePath = hashIndex >= 0 ? chapterPath.slice(0, hashIndex) : chapterPath;
    const chapterIndex = hashIndex >= 0 ? Number(chapterPath.slice(hashIndex + 1)) : 0;

    const $ = await this.loadVolume(volumePath);
    const headings = $('h1, h2, h3').toArray();

    const starts: any[] = [];
    for (const el of headings) {
      const text = this.headingText(el, $);
      if (this.isChapterHeading(text) && text.toLowerCase() !== 'manga') starts.push(el);
    }

    const start = starts[chapterIndex];
    if (!start) throw new Error('Chapter not found');

    const end = starts[chapterIndex + 1] ?? null;
    const pieces: string[] = [];

    // Keep the chapter heading and all following siblings until the next
    // chapter heading. This preserves paragraphs, illustrations, italics,
    // links, and other HTML formatting from Slime Reader.
    let node: any = start;
    while (node) {
      if (node !== start && end && node === end) break;

      if (node.type === 'tag') {
        const tag = node.name?.toLowerCase();
        if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
          // A non-chapter heading belongs to the current chapter.
          const text = this.headingText(node, $);
          if (this.isChapterHeading(text)) break;
        }
        pieces.push($.html(node));
      }

      node = node.nextSibling;
    }

    return pieces.join('\n');
  }

  resolveUrl = (path: string) => {
    if (path.startsWith('http')) return path;
    return this.site + path;
  };
}

export default new TensuraFanPlugin();
