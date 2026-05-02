import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';

class INovelTranslation implements Plugin.PluginBase {
  id = 'inoveltranslation';
  name = 'iNovelTranslation';
  icon = 'src/en/inoveltranslation/icon.png';
  site = 'https://inoveltranslation.com';
  version = '1.0.1';
  filters: Filters | undefined = undefined;

  pluginSettings = {
    hideLocked: {
      value: false,
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  private readonly HEADERS = {
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://inoveltranslation.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/api/novels?limit=50&page=${pageNo}`;
    const result: ApiResponse<NovelData> = await fetchApi(url, {
      headers: this.HEADERS,
    }).then(r => r.json());

    const novels: Plugin.NovelItem[] = [];

    if (result.docs) {
      result.docs.forEach(doc => {
        novels.push({
          name: doc.title,
          path: `/novels/${doc.id}`,
          cover: doc.cover?.url ? this.site + doc.cover.url : defaultCover,
        });
      });
    }

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const id = novelPath.split('/').pop();
    const novelUrl = `${this.site}/api/novels/${id}?depth=1`;
    const novelData: NovelData = await fetchApi(novelUrl, {
      headers: this.HEADERS,
    }).then(r => r.json());

    const chaptersUrl = `${this.site}/api/chapters?where[novel][equals]=${id}&limit=999&depth=0`;
    const chaptersData: ApiResponse<ChapterData> = await fetchApi(chaptersUrl, {
      headers: this.HEADERS,
    }).then(r => r.json());

    const status =
      novelData.publication === 'completed'
        ? NovelStatus.Completed
        : NovelStatus.Ongoing;

    const genres = novelData.tags
      ? novelData.tags.map(tag => tag.name).join(', ')
      : '';

    let summary = '';
    if (novelData.sypnosis && novelData.sypnosis.root) {
      summary = this.lexicalToText(novelData.sypnosis.root);
    }

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: novelData.title || 'Untitled',
      cover: novelData.cover?.url
        ? this.site + novelData.cover.url
        : defaultCover,
      summary: summary,
      author: novelData.author?.name || 'Unknown',
      genres: genres,
      status: status,
    };

    const chapters: Plugin.ChapterItem[] = [];
    const hideLocked = storage.get('hideLocked');

    if (chaptersData.docs) {
      chaptersData.docs.forEach(doc => {
        const isLocked = doc.tier !== null;
        if (isLocked && hideLocked) {
          return;
        }

        const title = doc.title ? ` - ${doc.title}` : '';
        const lockIcon = isLocked ? ' 🔒' : '';

        chapters.push({
          name: `Ch. ${doc.chapter}${lockIcon}${title}`,
          path: `/chapters/${doc.id}`,
          releaseTime: doc.updatedAt,
          chapterNumber: doc.chapter,
        });
      });
    }

    novel.chapters = chapters.sort(
      (a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0),
    );
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    await new Promise(res => setTimeout(res, 1500));

    const rscHeader = { ...this.HEADERS, rsc: '1' };

    let response;
    try {
      response = await fetchApi(this.site + chapterPath, {
        headers: rscHeader,
      });
    } catch (e) {
      throw new Error(`Network error: ${(e as Error).message}`);
    }

    if (response.status !== 200) {
      throw new Error(
        `Cloudflare challenge or server error (Status: ${response.status}). Please open in WebView to verify.`,
      );
    }

    const rscText = await response.text();

    if (!rscText || rscText.trim() === '') {
      throw new Error('Server returned empty data.');
    }

    if (
      rscText.includes('cf-browser-verification') ||
      rscText.includes('cf-challenge') ||
      rscText.includes('cloudflare-static') ||
      rscText.includes('Just a moment...')
    ) {
      if (!rscText.includes('root') && !rscText.includes('paragraph')) {
        throw new Error(
          'Cloudflare Challenge detected. Please open this novel in WebView to solve the challenge.',
        );
      }
    }

    // ==========================================
    // 2. ROBUST LEXICAL EXTRACTION ALGORITHM
    // ==========================================

    // Use a more reliable signature: the start of the root Lexical object
    const signatures = [
      '"root":{"type":"root"',
      '\\"root\\":{\\"type\\":\\"root\\"',
      '"children":[{"type":"paragraph"',
      '\\"children\\":[{\\"type\\":\\"paragraph\\"',
    ];

    let sigIndex = -1;
    for (const sig of signatures) {
      sigIndex = rscText.indexOf(sig);
      if (sigIndex !== -1) break;
    }

    if (sigIndex !== -1) {
      // Backtrack to find the opening brace { of the Lexical Object
      let startIndex = rscText.lastIndexOf('{', sigIndex);

      // Check for "content" or "root" before to find the start of the relevant object
      const contextKeys = [
        '"content"',
        '\\"content\\"',
        '"root"',
        '\\"root\\"',
      ];
      for (const key of contextKeys) {
        const keyIndex = rscText.lastIndexOf(key, sigIndex);
        if (keyIndex !== -1 && keyIndex > startIndex - 50) {
          startIndex = rscText.lastIndexOf('{', keyIndex);
          break;
        }
      }

      if (startIndex !== -1) {
        let braces = 0;
        let inString = false;
        let escape = false;
        let jsonStr = '';

        // Perform brace balancing on the raw stream to preserve escaping
        for (let i = startIndex; i < rscText.length; i++) {
          const char = rscText[i];
          if (escape) {
            escape = false;
            continue;
          }
          if (char === '\\') {
            escape = true;
            continue;
          }
          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === '{') braces++;
            else if (char === '}') braces--;
          }

          if (braces === 0 && i > startIndex) {
            jsonStr = rscText.substring(startIndex, i + 1);
            break;
          }
        }

        if (jsonStr) {
          try {
            // eslint-disable-next-line no-control-regex
            const safeJson = jsonStr.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
            let parsedData;
            try {
              parsedData = JSON.parse(safeJson);
            } catch {
              // If fails, it might be escaped, so clean it up and try again
              const cleanJson = jsonStr
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\')
                // eslint-disable-next-line no-control-regex
                .replace(/[\x00-\x1F\x7F-\x9F]/g, '');
              parsedData = JSON.parse(cleanJson);
            }

            const lexicalRoot =
              parsedData.root || parsedData.content?.root || parsedData;
            if (lexicalRoot && lexicalRoot.children) {
              return this.lexicalToHtml(lexicalRoot);
            }
          } catch (e) {
            let fallbackHtml = '';
            const textMatches = jsonStr.match(
              /\\?"text\\?"\s*:\s*\\?"(.*?)\\?"/g,
            );
            if (textMatches && textMatches.length > 0) {
              textMatches.forEach(m => {
                let text = m.match(/: ?"?(.*?)"?$/)?.[1] || '';
                text = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                if (text.trim() && text !== ' ' && !text.startsWith('Ch. ')) {
                  fallbackHtml += `<p>${text}</p>`;
                }
              });
              if (fallbackHtml) return fallbackHtml;
            }
          }
        }
      }
    }

    // ==========================================
    // 3. HTML SCAVENGER FALLBACK
    // ==========================================
    // If RSC extraction failed, try fetching the standard HTML page
    try {
      const htmlResponse = await fetchApi(this.site + chapterPath, {
        headers: this.HEADERS,
      });
      const htmlText = await htmlResponse.text();
      const $ = loadCheerio(htmlText);
      const htmlContent = $(
        'main > section[data-sentry-component="RichText"]',
      ).html();
      if (htmlContent) return htmlContent;
    } catch (e) {
      // Ignore fallback errors and throw the final error below
    }

    throw new Error(
      'Story content not found. The page structure might have changed. Please try opening in WebView to verify.',
    );
  }

  private lexicalToHtml(node: LexicalNode): string {
    let html = '';
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'paragraph') {
          html += `<p>${this.lexicalToHtml(child)}</p>`;
        } else if (child.type === 'text') {
          let text = child.text || '';
          if (child.format && child.format & 1) text = `<b>${text}</b>`;
          if (child.format && child.format & 2) text = `<i>${text}</i>`;
          html += text;
        } else if (child.type === 'list') {
          const tag = child.listType === 'number' ? 'ol' : 'ul';
          html += `<${tag}>${this.lexicalToHtml(child)}</${tag}>`;
        } else if (child.type === 'listitem') {
          html += `<li>${this.lexicalToHtml(child)}</li>`;
        } else if (child.type === 'heading') {
          const tag = child.tag || 'h3';
          html += `<${tag}>${this.lexicalToHtml(child)}</${tag}>`;
        } else {
          html += this.lexicalToHtml(child);
        }
      }
    }
    return html;
  }

  private lexicalToText(node: LexicalNode): string {
    let textOut = '';
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'paragraph') {
          textOut += this.lexicalToText(child) + '\n\n';
        } else if (child.type === 'text') {
          textOut += child.text || '';
        } else if (child.type === 'listitem') {
          textOut += '• ' + this.lexicalToText(child) + '\n';
        } else {
          textOut += this.lexicalToText(child);
        }
      }
    }
    return textOut;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/api/novels?where[title][contains]=${encodeURIComponent(
      searchTerm,
    )}&limit=50&page=${pageNo}`;
    const result: ApiResponse<NovelData> = await fetchApi(url, {
      headers: this.HEADERS,
    }).then(r => r.json());

    const novels: Plugin.NovelItem[] = [];

    if (result.docs) {
      result.docs.forEach(doc => {
        novels.push({
          name: doc.title,
          path: `/novels/${doc.id}`,
          cover: doc.cover?.url ? this.site + doc.cover.url : defaultCover,
        });
      });
    }

    return novels;
  }
}

export default new INovelTranslation();

type LexicalNode = {
  type: string;
  text?: string;
  children?: LexicalNode[];
  format?: number;
  listType?: string;
  tag?: string;
};

type NovelData = {
  id: string;
  title: string;
  cover?: {
    url: string;
  };
  author?: {
    name: string;
  };
  publication?: string;
  tags?: { name: string }[];
  sypnosis?: {
    root: LexicalNode;
  };
};

type ChapterData = {
  id: string;
  title?: string;
  chapter: number;
  tier: string | null;
  updatedAt: string;
};

type ApiResponse<T> = {
  docs: T[];
};
