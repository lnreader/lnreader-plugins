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
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  pluginSettings = {
    hideLocked: {
      value: false,
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  // Optimized stealth headers to mirror a real browser environment
  private readonly HEADERS = {
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://inoveltranslation.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  async popularNovels(
    pageNo: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/api/novels?limit=50&page=${pageNo}`;
    const result = await fetchApi(url, { headers: this.HEADERS }).then(r =>
      r.json(),
    );

    const novels: Plugin.NovelItem[] = [];

    if (result.docs) {
      result.docs.forEach((doc: any) => {
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
    const novelData = await fetchApi(novelUrl, { headers: this.HEADERS }).then(
      r => r.json(),
    );

    const chaptersUrl = `${this.site}/api/chapters?where[novel][equals]=${id}&limit=999&depth=0`;
    const chaptersData = await fetchApi(chaptersUrl, {
      headers: this.HEADERS,
    }).then(r => r.json());

    // Extract status
    const status =
      novelData.publication === 'completed'
        ? NovelStatus.Completed
        : NovelStatus.Ongoing;

    // Extract genres (tags)
    const genres = novelData.tags
      ? novelData.tags.map((tag: any) => tag.name).join(', ')
      : '';

    // Process summary (Lexical JSON from API 'sypnosis') - use Plain Text for App Synopsis
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
      chaptersData.docs.forEach((doc: any) => {
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

    // Ensure chapters are sorted numerically
    novel.chapters = chapters.sort(
      (a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0),
    );
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // Artificial delay to prevent aggressive rate limiting
    await new Promise(res => setTimeout(res, 1500));

    const rscHeader = { ...this.HEADERS, rsc: '1' };

    let response;
    try {
      response = await fetchApi(this.site + chapterPath, {
        headers: rscHeader,
      });
    } catch (e: any) {
      throw new Error(`Network error: ${e.message}`);
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

    // 1. Proactive Cloudflare Detection
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
    // 2. DEEP LEXICAL EXTRACTION ALGORITHM
    // ==========================================

    // 2.1. Basic cleanup of escaped characters in the RSC stream
    let cleanText = rscText.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    // 2.2. Locate the core content signature (first paragraph children)
    const signature = '"children":[{"type":"paragraph"';
    let sigIndex = cleanText.indexOf(signature);

    if (sigIndex !== -1) {
      // 2.3. Backtrack to find the opening brace { of the Lexical Object
      let startIndex = cleanText.lastIndexOf('{', sigIndex);

      // Check if it is within a "root": { ... } object to backtrack one level further
      const rootIndex = cleanText.lastIndexOf('"root"', sigIndex);
      if (rootIndex !== -1 && rootIndex > startIndex - 30) {
        startIndex = cleanText.lastIndexOf('{', rootIndex);
      }

      if (startIndex !== -1) {
        // 2.4. High-performance Brace Balancing algorithm
        let braces = 0;
        let inString = false;
        let escape = false;
        let jsonStr = '';

        for (let i = startIndex; i < cleanText.length; i++) {
          const char = cleanText[i];
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
            jsonStr = cleanText.substring(startIndex, i + 1);
            break;
          }
        }

        if (jsonStr) {
          try {
            // 2.5 Standardize and Parse JSON
            // Strip control characters that might break JSON.parse
            const safeJson = jsonStr.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
            const parsedData = JSON.parse(safeJson);
            let lexicalRoot = parsedData.root || parsedData;

            if (lexicalRoot && lexicalRoot.children) {
              return this.lexicalToHtml(lexicalRoot);
            }
          } catch (e: any) {
            // ==========================================
            // 3. ULTIMATE FAILSAFE (REGEX TEXT EXTRACTION)
            // ==========================================
            // If JSON parsing fails due to corrupted RSC stream segments,
            // we extract all "text":"..." fragments to reconstruct the story.
            let fallbackHtml = '';
            const textMatches = jsonStr.match(/"text":"(.*?)"/g);
            if (textMatches && textMatches.length > 0) {
              textMatches.forEach(m => {
                let text = m.substring(8, m.length - 1);
                if (text.trim() && text !== ' ') {
                  fallbackHtml += `<p>${text}</p>`;
                }
              });
              return fallbackHtml;
            }

            throw new Error(
              `JSON Parse error: ${e.message}. Data snippet: ${jsonStr.substring(0, 500)}`,
            );
          }
        }
      }
    }

    // ==========================================
    // 4. Final HTML Scavenger Fallback
    // ==========================================
    const $ = loadCheerio(rscText);
    let htmlContent = $(
      'main > section[data-sentry-component="RichText"]',
    ).html();
    if (htmlContent) return htmlContent;

    throw new Error(
      'Story content not found. Cloudflare might be blocking the request or the page structure has changed. Please try opening in WebView first.',
    );
  }

  /**
   * Recursively converts Lexical JSON nodes to HTML strings.
   * Suitable for Chapter Content.
   */
  private lexicalToHtml(node: any): string {
    let html = '';
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'paragraph') {
          html += `<p>${this.lexicalToHtml(child)}</p>`;
        } else if (child.type === 'text') {
          let text = child.text || '';
          if (child.format & 1) text = `<b>${text}</b>`;
          if (child.format & 2) text = `<i>${text}</i>`;
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

  /**
   * Recursively converts Lexical JSON nodes to Plain Text with newlines.
   * Suitable for Novel Synopsis in the app.
   */
  private lexicalToText(node: any): string {
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
    const result = await fetchApi(url, { headers: this.HEADERS }).then(r =>
      r.json(),
    );

    const novels: Plugin.NovelItem[] = [];

    if (result.docs) {
      result.docs.forEach((doc: any) => {
        novels.push({
          name: doc.title,
          path: `/novels/${doc.id}`,
          cover: doc.cover?.url ? this.site + doc.cover.url : defaultCover,
        });
      });
    }

    return novels;
  }

  resolveUrl = (path: string, isNovel?: boolean) => this.site + path;
}

export default new INovelTranslation();
