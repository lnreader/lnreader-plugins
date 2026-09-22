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
  version = '1.0.0';

  /**
   * Fetches a URL and loads it into Cheerio, guarding against
   * Cloudflare bot-verification / captcha interstitials so a
   * "Just a moment..." page doesn't get silently parsed as real content.
   */
  async getCheerio(url: string, search = false): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    if (!r.ok && !search) {
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    }
    const $ = parseHTML(await r.text());
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
    // Site only has a handful of novels and no pagination has been
    // confirmed to exist yet, so anything past page 1 returns empty.
    if (pageNo > 1) return [];

    const sort = showLatestNovels ? 'latest' : 'popular';
    const $ = await this.getCheerio(`${this.site}/browse?sort=${sort}`);
    return this.parseNovelCards($);
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/browse?q=${encodeURIComponent(searchTerm)}`;
    const $ = await this.getCheerio(url, true);
    return this.parseNovelCards($);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.getCheerio(this.site + novelPath);
    console.log(
      'chapter links found:',
      $('#chapters a[href*="/chapter-"]').length,
    );

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
    $('#chapters a[href*="/chapter-"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const name = $(el).find('.line-clamp-1').text().trim();
      const chapterNumMatch = href.match(/chapter-(\d+)$/);
      const chapterNumber = chapterNumMatch
        ? parseInt(chapterNumMatch[1], 10)
        : 0;
      const releaseTime = $(el).find('time').attr('datetime') || null;

      if (!href) return;
      chapters.push({ name, path: href, chapterNumber, releaseTime });
    });

    novel.chapters = chapters.sort(
      (a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0),
    );
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);

    const content = $('article[data-reader-article="true"] .reader-prose');

    // Drop the translator-credit line (first <p><strong>Translator: ...</strong></p>)
    content
      .find('p')
      .first()
      .each((_, el) => {
        if ($(el).text().trim().startsWith('Translator:')) {
          $(el).remove();
        }
      });

    return content.html() || '';
  }
}

export default new HangulPlanetPlugin();
