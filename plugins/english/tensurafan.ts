import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';

type Volume = {
  id: string;
  name: string;
  path: string;
  progress?: number;
};

type Term = {
  options: string[];
  officialTermIndex: number;
  textToSpeechIndex: number;
};

type TermSet = 'default' | 'official' | 'tts';

type Section = {
  anchor: string;
  title: string;
};

// The title of the only series the site hosts.
const NOVEL_NAME = 'That Time I Got Reincarnated as a Slime';
// A volume's table of contents sits in its first few KB; the rest of the file
// is the whole volume's text, which only a chapter fetch needs.
const TOC_RANGE = 'bytes=0-23999';

const unescapeAttr = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const escapeText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Mirrors the site's own `capitalCase` helper from its reader controller.
const capitalCase = (phrase: string, everyWord: boolean) =>
  phrase
    .toLowerCase()
    .split(' ')
    .map((word, index) =>
      word && (everyWord || index === 0)
        ? word[0].toUpperCase() + word.slice(1)
        : word,
    )
    .join(' ');

class TensurafanPlugin implements Plugin.PluginBase {
  id = 'tensurafan';
  name = 'Tensurafan';
  icon = 'src/en/tensurafan/icon.png';
  site = 'https://tensurafan.github.io';
  version = '1.0.0';

  pluginSettings = {
    termSet: {
      value: 'default',
      label:
        'Names and terms (the same choices as "Set All Terms to ..." under Extras > Manage Selectable terms on the site; applies to chapters opened after changing it)',
      type: 'Select',
      options: [
        { label: 'Default terms', value: 'default' },
        { label: 'Official terms', value: 'official' },
        { label: 'Text-to-speech friendly terms', value: 'tts' },
      ],
    },
  };

  private volumeCache?: { path: string; html: string };

  private async fetchOk(url: string, headers?: Record<string, string>) {
    const res = await fetchApi(url, headers ? { headers } : undefined);
    if (!res.ok) {
      throw new Error(`Tensurafan returned HTTP ${res.status} for ${url}`);
    }
    return res;
  }

  private getVolumeList(): Promise<Volume[]> {
    return this.fetchOk(this.site + '/ln/volumes.json').then(r => r.json());
  }

  private async getVolumes(): Promise<Volume[]> {
    // The site lists its in-progress volume with the previous volume's file;
    // keep only the first entry for each file.
    const seen: Record<string, boolean> = {};
    return (await this.getVolumeList()).filter(volume => {
      if (seen[volume.path]) return false;
      seen[volume.path] = true;
      return true;
    });
  }

  private getTermSet(): TermSet {
    const value = storage.get<string>('termSet');
    return value === 'official' || value === 'tts' ? value : 'default';
  }

  /**
   * The site renders every name as a `<span data-term>` holding a template
   * that picks the reader's chosen term for it. Replace each one with the
   * term from the selected set (the key itself is the site's default).
   */
  private applyTerms(
    html: string,
    terms?: Record<string, Term>,
    set?: TermSet,
  ) {
    const pick = (key: string) => {
      const term = terms && terms[key];
      if (!term || !set || set === 'default') return key;
      const index =
        set === 'official' ? term.officialTermIndex : term.textToSpeechIndex;
      return term.options[index] || key;
    };
    return html.replace(
      /<span class="clickable [^"]*" data-term="([^"]*)" onclick="[^"]*">\{:\s*([^]*?)\s*:\}\|\{[^}]*\}\|<\/span>/g,
      (_, rawKey: string, expression: string) => {
        const chosen = pick(unescapeAttr(rawKey));
        let text = chosen;
        if (/toLowerCase\(\)/.test(expression)) {
          text = chosen.toLowerCase();
        } else if (/capitalCase\(.*,\s*true\s*\)/.test(expression)) {
          text = capitalCase(chosen, true);
        } else if (/capitalCase\(/.test(expression)) {
          text = capitalCase(chosen, false);
        }
        return escapeText(text);
      },
    );
  }

  private parseSections(html: string): Section[] {
    const $ = loadCheerio(this.applyTerms(html));
    const sections: Section[] = [];
    $('p.toc-chapter, p.toc-chapter-space').each((_, el) => {
      const link = $(el).find('a.hlink').first();
      const anchor = (link.attr('href') || '').replace(/^#/, '');
      const title = link.text().replace(/\s+/g, ' ').trim();
      if (anchor && title) sections.push({ anchor, title });
    });
    return sections;
  }

  private async getVolumeHtml(volume: Volume): Promise<string> {
    if (this.volumeCache && this.volumeCache.path === volume.path) {
      return this.volumeCache.html;
    }
    const html = await this.fetchOk(this.site + volume.path).then(r =>
      r.text(),
    );
    this.volumeCache = { path: volume.path, html };
    return html;
  }

  /** Start of the element carrying `id`, including a lone wrapping `<div>`. */
  private sectionStart(html: string, anchor: string): number {
    const at = html.indexOf(`id="${anchor}"`);
    if (at < 0) return -1;
    let start = html.lastIndexOf('<', at);
    if (html.slice(start - 5, start) === '<div>') start -= 5;
    return start;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    return [await this.getNovelItem()];
  }

  private async getNovelItem(): Promise<Plugin.NovelItem> {
    const [first] = await this.getVolumes();
    return {
      name: NOVEL_NAME,
      path: '/',
      cover: first ? await this.getCover(first) : defaultCover,
    };
  }

  private async getCover(volume: Volume): Promise<string> {
    const head = await this.fetchOk(this.site + volume.path, {
      Range: TOC_RANGE,
    }).then(r => r.text());
    const src = /<img[^>]*\ssrc="([^"{]+)"/.exec(head);
    return src ? this.site + encodeURI(unescapeAttr(src[1])) : defaultCover;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const listed = await this.getVolumeList();
    const volumes = await this.getVolumes();
    const heads = await Promise.all(
      volumes.map(volume =>
        this.fetchOk(this.site + volume.path, { Range: TOC_RANGE }).then(r =>
          r.text(),
        ),
      ),
    );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: NOVEL_NAME,
      cover: defaultCover,
      status: listed.some(volume => (volume.progress ?? 100) < 100)
        ? NovelStatus.Ongoing
        : NovelStatus.Completed,
    };

    const credits = loadCheerio(heads[0] || '');
    credits('p.credits-entry-space, p.credits-entry').each((_, el) => {
      const text = credits(el).text();
      const author = /^Author:\s*(.+)$/.exec(text);
      const artist = /^Illustration:\s*(.+)$/.exec(text);
      if (author) novel.author = author[1].trim();
      if (artist) novel.artist = artist[1].trim();
    });
    const cover = /<img[^>]*\ssrc="([^"{]+)"/.exec(heads[0] || '');
    if (cover) novel.cover = this.site + encodeURI(unescapeAttr(cover[1]));

    const chapters: Plugin.ChapterItem[] = [];
    volumes.forEach((volume, index) => {
      this.parseSections(heads[index]).forEach(section => {
        chapters.push({
          name: `${volume.name} - ${section.title}`,
          path: `/read/${volume.id}#${section.anchor}`,
          chapterNumber: chapters.length + 1,
        });
      });
    });
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [, volumeId, anchor] =
      /^\/read\/([^#]+)#(.+)$/.exec(chapterPath) || [];
    if (!volumeId) throw new Error('Unrecognised chapter path ' + chapterPath);

    const volume = (await this.getVolumes()).find(v => v.id === volumeId);
    if (!volume) throw new Error('Unknown volume ' + volumeId);

    const html = await this.getVolumeHtml(volume);
    const sections = this.parseSections(html.slice(0, 24000));
    const position = sections.findIndex(s => s.anchor === anchor);
    const start = this.sectionStart(html, anchor);
    if (position < 0 || start < 0) {
      throw new Error(`Section ${anchor} not found in ${volume.name}`);
    }
    const next = sections[position + 1];
    const end = next ? this.sectionStart(html, next.anchor) : -1;
    let body = html.slice(start, end > start ? end : undefined);

    const set = this.getTermSet();
    let terms: Record<string, Term> | undefined;
    if (set !== 'default') {
      terms = await this.fetchOk(this.site + '/ln/terms.json')
        .then(r => r.json())
        .then(data => data.terms);
    }
    body = this.applyTerms(body, terms, set)
      // Illustrations are templated on the site's "coloured illustrations"
      // option, which is on by default: use the coloured file it names.
      .replace(
        /(src="[^"{]*)\{:[^?]*\?\s*'([^']*)'\s*:\s*'[^']*'\s*:\}\|\{[^}]*\}\|/g,
        '$1$2',
      )
      // The footnote icon keeps its text in an attribute and shows it on tap.
      .replace(
        /<span class="icon [^"]*" data-hover-text="([^"]*)"[^>]*>[^]*?<\/span><\/span>/g,
        '<sup>[$1]</sup>',
      )
      .replace(/<div class="scenebreak">[^]*?<\/div>/g, '<hr>');

    const $ = loadCheerio(body, null, false);
    // The full-page title card repeats the heading that follows it as text.
    $('script, style, noscript, iframe, object, embed, p.pagebreak').remove();
    $('div:has(> img[src*="/title_cards/"])').remove();
    $('img').each((_, el) => {
      const img = $(el);
      const src = img.attr('src');
      if (src && !/^[a-z][a-z\d+.-]*:/i.test(src)) {
        img.attr('src', this.site + encodeURI(src));
      }
    });
    // The app renders this HTML as is, so drop event handlers and URLs that
    // would run script.
    $('*').each((_, el) => {
      const node = $(el);
      for (const name of Object.keys(el.attribs)) {
        if (/^on/i.test(name)) {
          node.removeAttr(name);
        } else if (name === 'href' || name === 'src') {
          const value = el.attribs[name]
            .split('')
            .filter(c => c.charCodeAt(0) > 32)
            .join('')
            .toLowerCase();
          if (
            /^(javascript|vbscript):/.test(value) ||
            (value.startsWith('data:') && !value.startsWith('data:image/'))
          ) {
            node.removeAttr(name);
          }
        }
      }
    });
    return $.html();
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return [];
    const haystack = `${NOVEL_NAME} Tensura ${this.name}`.toLowerCase();
    const matches = query.split(/\s+/).every(word => haystack.includes(word));
    return matches ? [await this.getNovelItem()] : [];
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/' : path);
}

export default new TensurafanPlugin();
