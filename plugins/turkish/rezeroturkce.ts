import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const SITE_URL = /^https?:\/\/(?:www\.)?rezeroturkce\.com\//i;

// Sections that hold the translated stories; anything else on the site
// (anime, manga, announcements, info pages) is not a novel.
const STORY_SECTIONS = [
  'ana-hikaye',
  'if-hikayeleri',
  'yan-hikayeler',
  'ex-romanlari',
];

const CHALLENGE_TITLES = [
  'bot verification',
  'you are being redirected...',
  'just a moment...',
  'bir dakika lütfen...',
  'redirecting...',
];

const MONTHS = [
  'ocak',
  'şubat',
  'mart',
  'nisan',
  'mayıs',
  'haziran',
  'temmuz',
  'ağustos',
  'eylül',
  'ekim',
  'kasım',
  'aralık',
];

const COMPLETED = /cevirisi tamamlan(?:mistir|di)(?![a-z])/;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

const cleanText = (text: string) => text.replace(/\s+/g, ' ').trim();

class ReZeroTurkce implements Plugin.PluginBase {
  id = 'rezeroturkce';
  name = 'Re:Zero Türkçe';
  icon = 'src/tr/rezeroturkce/icon.png';
  site = 'https://www.rezeroturkce.com/';
  version = '1.0.0';

  async getCheerio(path: string): Promise<CheerioAPI> {
    const res = await fetchApi(this.site + path);
    const html = await res.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    if (title && CHALLENGE_TITLES.includes(cleanText(title).toLowerCase()))
      throw new Error('Captcha error, please open in webview');
    if (!res.ok)
      throw new Error(
        'Could not reach site (' + res.status + '), try to open in webview',
      );
    return load(html);
  }

  /** Site-relative path of an on-site link, or undefined for anything else. */
  toPath(href: string | undefined): string | undefined {
    if (!href || !SITE_URL.test(href)) return undefined;
    const path = href.replace(SITE_URL, '').split(/[?#]/)[0];
    if (!path) return undefined;
    return path.endsWith('/') ? path : path + '/';
  }

  /** A story page lives directly under one of the story sections. */
  isStoryPath(path: string | undefined): path is string {
    if (!path) return false;
    const parts = path.split('/').filter(Boolean);
    return parts.length === 2 && STORY_SECTIONS.includes(parts[0]);
  }

  /** Index pages show each story as a column block with a cover and a link. */
  parseStoryIndex($: CheerioAPI, seen: Set<string>): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    $('article .wp-block-columns').each((_i, el) => {
      const block = $(el);
      // Bare-domain images only redirect to www, so request www directly.
      const cover = block
        .find('img')
        .first()
        .attr('src')
        ?.replace(SITE_URL, this.site);
      const name = cleanText(block.find('h2').first().text());
      if (!cover || !name) return;
      const path = block
        .find('a')
        .toArray()
        .map(a => this.toPath($(a).attr('href')))
        .find(p => this.isStoryPath(p));
      if (!path || seen.has(path)) return;
      seen.add(path);
      novels.push({ name, path, cover });
    });
    return novels;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const [main, ifStories, exNovels, sideStories] = await Promise.all(
      ['ana-hikaye/', 'if-hikayeleri/', 'ex-romanlari/', 'yan-hikayeler/'].map(
        path => this.getCheerio(path),
      ),
    );
    const seen = new Set<string>();
    const novels = [
      ...this.parseStoryIndex(main, seen),
      ...this.parseStoryIndex(ifStories, seen),
      ...this.parseStoryIndex(exNovels, seen),
    ];
    // Side stories are single pages, so their index page is one novel.
    novels.push({
      name: cleanText(sideStories('main h1').first().text()) || 'Yan Hikâyeler',
      path: 'yan-hikayeler/',
      cover:
        sideStories('meta[property="og:image"]').attr('content') ||
        defaultCover,
    });
    return novels;
  }

  parseDate(text: string): string | undefined {
    const match = text.trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
    if (!match) return undefined;
    const month = MONTHS.indexOf(match[2].toLowerCase());
    if (month < 0) return undefined;
    return (
      match[3] +
      '-' +
      String(month + 1).padStart(2, '0') +
      '-' +
      match[1].padStart(2, '0')
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.getCheerio(novelPath);
    const article = $('main article').first();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: cleanText($('main h1').first().text()) || 'Untitled',
      cover: $('meta[property="og:image"]').attr('content') || defaultCover,
      status: NovelStatus.Unknown,
    };

    // The story notes and "Ön Bakış" (overview) come before the chapter list.
    const summary: string[] = [];
    article.find('br').replaceWith(' ');
    for (const el of article.find('h2, p, ul, ol, table').toArray()) {
      const node = $(el);
      if (node.is('ul, ol, table')) break;
      const text = cleanText(node.text());
      if (/^bolumler/.test(normalize(text))) break;
      if (text) summary.push(text);
    }
    if (summary.length) novel.summary = summary.join('\n\n');
    // Only "tamamlanmıştır"/"tamamlandı" (completed), not "tamamlanmadı" etc.
    if (COMPLETED.test(normalize(article.find('h2').text())))
      novel.status = NovelStatus.Completed;

    // The reading-progress table carries each chapter's publication date.
    const dates = new Map<string, string>();
    article.find('tr').each((_i, el) => {
      const path = this.toPath($(el).find('a').attr('href'));
      const date = this.parseDate($(el).find('td').last().text());
      if (path && date) dates.set(path, date);
    });

    // Chapters live under the story page (EX volumes use "<story>-<chapter>").
    const siblingPrefix = novelPath.replace(/\/$/, '-');
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    const addChapter = (href: string | undefined, name: string) => {
      const path = this.toPath(href);
      // Only chapters hosted on this site; older arcs also link out to
      // EpikNovel, which this plugin cannot read.
      if (!path || path === novelPath) return;
      if (!path.startsWith(novelPath) && !path.startsWith(siblingPrefix))
        return;
      if (seen.has(path) || !name) return;
      seen.add(path);
      chapters.push({ name, path, releaseTime: dates.get(path) });
    };

    article.find('a').each((_i, el) => {
      const link = $(el);
      // A list item can split one title over several links to the same
      // chapter, so name it after the whole item.
      const item = link.closest('li');
      if (item.length && item.find('a').length > 1) {
        if (link.is(item.find('a').last()))
          addChapter(link.attr('href'), cleanText(item.text()));
        return;
      }
      addChapter(link.attr('href'), cleanText(link.text()).replace(/:$/, ''));
    });

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(chapterPath);
    const content = $('article.entry-content').first();
    content
      .find(
        'script, style, noscript, iframe, ins, .wp-block-post-navigation-link',
      )
      .remove();
    // Previous/next navigation rows are left empty once their links go.
    content.find('.wp-block-columns').each((_i, el) => {
      const block = $(el);
      if (!cleanText(block.text()) && !block.find('img').length) block.remove();
    });
    content
      .find('p')
      .filter((_i, el) =>
        /^\[adinserter[^\]]*\]$/.test(cleanText($(el).text())),
      )
      .remove();
    // Drop inline event handlers and script URLs from the site's markup.
    content.find('*').each((_i, el) => {
      for (const [name, value] of Object.entries(el.attribs)) {
        if (/^on/i.test(name) || /^\s*javascript:/i.test(value))
          $(el).removeAttr(name);
      }
    });
    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const term = normalize(searchTerm);
    const novels = await this.popularNovels(1);
    return novels.filter(novel => normalize(novel.name).includes(term));
  }
}

export default new ReZeroTurkce();
