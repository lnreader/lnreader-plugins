import { fetchApi } from '@libs/fetch';
import { Filters } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { CheerioAPI, load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class HangulPlanetPlugin implements Plugin.PluginBase {
  id = 'hangulplanet';
  name = 'HangulPlanet';
  icon = 'src/en/hangulplanet/icon.png';
  site = 'https://hangulplanet.com';
  version = '2.3.0';

  private async fetchPage(
    url: string,
    search = false,
  ): Promise<{ $: CheerioAPI; text: string }> {
    const r = await fetchApi(url);
    if (!r.ok && !search) {
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    }
    const text = await r.text();
    console.log('response byte length:', text.length);
    const $ = parseHTML(text);
    const title = $('title').text().trim();
    if (
      title === 'Bot Verification' ||
      title === 'You are being redirected...' ||
      title === 'Un instant...' ||
      title === 'Just a moment...' ||
      title === 'Redirecting...'
    ) {
      throw new Error('Captcha error, please open in webview');
    }
    return { $, text };
  }

  async getCheerio(url: string, search = false): Promise<CheerioAPI> {
    const { $ } = await this.fetchPage(url, search);
    return $;
  }

  private parseNovelCards($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    $('a[href^="/novel/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const img = $(el).find('img.object-cover').first();
      const name = img.attr('alt')?.trim() || '';
      const src = img.attr('src');
      const cover = src ? this.site + src : defaultCover;
      if (!href || !name) return;
      novels.push({ name, cover, path: href });
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    const sort = showLatestNovels ? 'latest' : 'popular';
    const $ = await this.getCheerio(`${this.site}/browse?sort=${sort}`);
    return this.parseNovelCards($);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const url = `${this.site}/browse?q=${encodeURIComponent(searchTerm)}`;
    const $ = await this.getCheerio(url, true);
    return this.parseNovelCards($);
  }

  /**
    IMPORTANT: this site does NOT render its full chapter list as real
    <a> DOM elements. Beyond a small SSR-visible slice, the list lives
    inside a Next.js RSC ("flight") payload
   */
  private parseChaptersFromText(
    novelPath: string,
    text: string,
    chapters: Plugin.ChapterItem[],
    seen: Set<number>,
  ): number {
    let added = 0;

    // Primary: escaped-JSON form from the RSC payload.
    const hrefPattern = /\\"href\\":\\"([^"\\]*\/chapter-(\d+))\\"/g;
    const WINDOW = 800;
    let match: RegExpExecArray | null;
    while ((match = hrefPattern.exec(text)) !== null) {
      const chapterNumber = parseInt(match[2], 10);
      if (seen.has(chapterNumber)) continue;
      seen.add(chapterNumber);

      const windowText = text.slice(match.index, match.index + WINDOW);

      const nameMatch = windowText.match(
        /\\"line-clamp-1 flex-1 text-sm\\",\\"children\\":\\"([^\\]*)\\"/,
      );
      const dateMatch = windowText.match(/\\"dateTime\\":\\"([^\\]*)\\"/);

      chapters.push({
        name: nameMatch ? nameMatch[1] : `Chapter ${chapterNumber}`,
        path: match[1],
        chapterNumber,
        releaseTime: dateMatch ? dateMatch[1] : null,
      });
      added++;
    }

    const $ = parseHTML(text);
    $('#chapters a[href*="/chapter-"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const chapterNumMatch = href.match(/chapter-(\d+)$/);
      if (!href || !chapterNumMatch) return;
      const chapterNumber = parseInt(chapterNumMatch[1], 10);
      if (seen.has(chapterNumber)) return;
      seen.add(chapterNumber);
      const name = $(el).find('.line-clamp-1').text().trim();
      const releaseTime = $(el).find('time').attr('datetime') || null;
      chapters.push({
        name: name || `Chapter ${chapterNumber}`,
        path: href,
        chapterNumber,
        releaseTime,
      });
      added++;
    });

    return added;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const { $, text } = await this.fetchPage(this.site + novelPath);

    const coverSrc = $('img.object-cover').first().attr('src');
    const heading = $('h1').first();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: heading.text().trim(),
      author: heading.next('p').text().trim() || undefined,
      cover: coverSrc ? this.site + coverSrc : defaultCover,
      summary: $('.prose').first().text().trim(),
      status: NovelStatus.Unknown,
    };

    const statusText = $('span[data-slot="badge"]').first().text().trim();
    novel.status = statusText.includes('Ongoing')
      ? NovelStatus.Ongoing
      : statusText.includes('Completed')
        ? NovelStatus.Completed
        : NovelStatus.Unknown;

    novel.genres = $('a[href*="browse?genre="]')
      .map((_, el) => $(el).text().trim())
      .get()
      .join(', ');

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<number>();

    const foundOnPage1 = this.parseChaptersFromText(
      novelPath,
      text,
      chapters,
      seen,
    );
    console.log('chapters found on page 1 (RSC + DOM):', foundOnPage1);

    const MAX_PAGES = 100; // safety cap so a parsing quirk can't loop forever
    let page = 2;
    while (page <= MAX_PAGES) {
      const { text: pageText } = await this.fetchPage(
        `${this.site}${novelPath}?cpage=${page}`,
      );
      const added = this.parseChaptersFromText(
        novelPath,
        pageText,
        chapters,
        seen,
      );
      console.log(`cpage=${page} contributed ${added} new chapters`);
      if (added === 0) break;
      page++;
    }

    console.log('total chapter links found:', chapters.length);

    novel.chapters = chapters.sort(
      (a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0),
    );
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);

    const content = $('article[data-reader-article="true"] .reader-prose');

    //Remove the TL/ED credit(annoying for TTS)
    content
      .find('p')
      .first()
      .each((_, el) => {
        if ($(el).text().trim().startsWith('TL/ED')) {
          $(el).remove();
        }
      });

    return content.html() || '';
  }
}

export default new HangulPlanetPlugin();
