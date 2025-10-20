import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class KDTNovels implements Plugin.PluginBase {
  id = 'kdtnovels';
  name = 'KDT Novels';
  version = '1.0.0';
  icon = 'src/en/kdtnovels/icon.png';
  site = 'https://kdtnovels.com/';

  /**
   * Parse novel items from HTML using common selectors
   */
  private parseNovelItems(html: string): Plugin.NovelItem[] {
    const $ = parseHTML(html);
    const novels: Plugin.NovelItem[] = [];

    $('div.c-tabs-item__content').each((_, element) => {
      const $element = $(element);

      // Extract cover image
      const coverImg = $element.find('div.tab-thumb img').first();
      const cover =
        coverImg.attr('data-src') || coverImg.attr('src') || defaultCover;

      // Extract title and URL
      const titleLink = $element.find('div.post-title > h3 > a').first();
      const name = titleLink.text().trim();
      const href = titleLink.attr('href');

      // Only add if we have required data
      if (name && href) {
        // Convert full URL to relative path, remove leading and trailing slashes
        const path = href.replace(this.site, '').replace(/^\/+|\/+$/g, '');

        novels.push({
          name,
          path,
          cover: cover || defaultCover,
        });
      }
    });

    return novels;
  }

  /**
   * Parse status text and map it to NovelStatus enum
   */
  private parseNovelStatus(statusText: string): string {
    if (!statusText) {
      return NovelStatus.Unknown;
    }

    const normalizedStatus = statusText.toLowerCase().trim();

    // Map common status patterns to NovelStatus enum values
    if (
      normalizedStatus.includes('ongoing') ||
      normalizedStatus.includes('on going')
    ) {
      return NovelStatus.Ongoing;
    }

    if (
      normalizedStatus.includes('completed') ||
      normalizedStatus.includes('complete')
    ) {
      return NovelStatus.Completed;
    }

    if (normalizedStatus.includes('licensed')) {
      return NovelStatus.Licensed;
    }

    if (
      normalizedStatus.includes('finished') ||
      normalizedStatus.includes('publishing finished')
    ) {
      return NovelStatus.PublishingFinished;
    }

    if (
      normalizedStatus.includes('cancelled') ||
      normalizedStatus.includes('canceled')
    ) {
      return NovelStatus.Cancelled;
    }

    if (
      normalizedStatus.includes('hiatus') ||
      normalizedStatus.includes('on hiatus')
    ) {
      return NovelStatus.OnHiatus;
    }

    // If no pattern matches, return the original text or Unknown
    return statusText || NovelStatus.Unknown;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    // Construct URL based on whether we want latest or popular novels
    const orderBy = options.showLatestNovels ? 'latest' : 'views';
    const url = `${this.site}/page/${pageNo}/?s&post_type=wp-manga&m_orderby=${orderBy}`;

    try {
      // Fetch the search results page
      const response = await fetchApi(url);
      const html = await response.text();

      // Use common parsing method
      return this.parseNovelItems(html);
    } catch (error) {
      console.error('Error fetching popular novels:', error);
      return [];
    }
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // Construct search URL with proper query parameters
    const url = `${this.site}/page/${pageNo}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga&op&author&artist&release&adult`;

    try {
      // Fetch the search results page
      const response = await fetchApi(url);
      const html = await response.text();

      // Use common parsing method
      const novels = this.parseNovelItems(html);

      // Handle empty search results gracefully
      if (novels.length === 0) {
        console.log(
          `No search results found for term: "${searchTerm}" on page ${pageNo}`,
        );
      }

      return novels;
    } catch (error) {
      console.error('Error searching novels:', error);
      return [];
    }
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novelUrl = this.site + novelPath;

    try {
      // Fetch the novel details page
      const response = await fetchApi(novelUrl);
      const html = await response.text();

      // Parse HTML with Cheerio
      const $ = parseHTML(html);

      const novel: Plugin.SourceNovel = {
        name: '',
        path: novelPath,
        cover: defaultCover,
        author: '',
        artist: '',
        genres: '',
        summary: '',
        status: '',
        chapters: [],
      };

      // Extract novel metadata using provided CSS selectors

      // Extract novel title
      const titleElement = $('.manga-title').first();
      novel.name = titleElement.text().trim() || 'Unknown Title';

      // Extract cover image
      const coverElement = $('div.summary_image img').first();
      const coverSrc =
        coverElement.attr('data-src') || coverElement.attr('src');
      novel.cover = coverSrc || defaultCover;

      // Extract genres
      const genreElements = $('div.genres-content a');
      const genres: string[] = [];
      genreElements.each((_, element) => {
        const genre = $(element).text().trim();
        if (genre) {
          genres.push(genre);
        }
      });
      novel.genres = genres.join(',');

      // Extract summary/synopsis
      const summaryElements = $('div.manga-excerpt p');
      const summaryParts: string[] = [];
      summaryElements.each((_, element) => {
        const text = $(element).text().trim();
        if (text) {
          summaryParts.push(text);
        }
      });
      novel.summary = summaryParts.join('\n\n');

      // Extract status
      const statusElement = $('div.manga-status span:nth-child(2)').first();
      const rawStatus = statusElement.text().trim();
      novel.status = this.parseNovelStatus(rawStatus);

      // Extract chapter list - chapters are loaded dynamically via AJAX
      let chapters: Plugin.ChapterItem[] = [];

      try {
        // Construct AJAX URL for chapter list
        const ajaxUrl = `${novelUrl}/ajax/chapters/?t=1`;

        // Make POST request to get chapter list HTML fragment
        const chapterResponse = await fetchApi(ajaxUrl, {
          method: 'POST',
        });
        const chapterHtml = await chapterResponse.text();

        // Parse the HTML fragment
        const $chapters = parseHTML(chapterHtml);

        // Extract chapters using existing parsing logic
        const chapterElements = $chapters('li.free-chap');

        chapterElements.each((index, element) => {
          const $element = $chapters(element);

          // Extract chapter link and name
          const chapterLink = $element.find('a').first();
          const chapterName = chapterLink.text().trim();
          const chapterHref = chapterLink.attr('href');

          // Extract release date
          const releaseDateElement = $element
            .find('span.chapter-release-date')
            .first();
          const releaseTime = releaseDateElement.text().trim() || null;

          // Extract chapter number from title (opportunistic parsing)
          let chapterNumber = chapterElements.length - index; // Default fallback (reverse order)

          // Try multiple patterns for chapter number extraction (supporting decimals)
          let chapterNumberMatch = chapterName.match(/Ch\s*(\d+(?:\.\d+)?)/i);
          if (!chapterNumberMatch) {
            chapterNumberMatch = chapterName.match(/c(\d+(?:\.\d+)?)/i);
          }
          if (chapterNumberMatch) {
            chapterNumber = parseFloat(chapterNumberMatch[1]);
          }

          if (chapterName && chapterHref) {
            // Extract just the pathname from the URL, removing leading and trailing slashes
            let chapterPath: string;
            if (chapterHref.startsWith('http')) {
              const url = new URL(chapterHref);
              chapterPath = url.pathname.replace(/^\/+|\/+$/g, '');
            } else {
              chapterPath = chapterHref.replace(/^\/+|\/+$/g, '');
            }

            chapters.push({
              name: chapterName,
              path: chapterPath,
              releaseTime: releaseTime,
              chapterNumber: chapterNumber,
            });
          }
        });

        // Reverse the chapters array since they come in reverse order (latest first)
        chapters.reverse();
      } catch (chapterError) {
        console.error('Error fetching chapter list:', chapterError);
        // Fall back to empty chapters array if AJAX request fails
        chapters = [];
      }

      novel.chapters = chapters;

      return novel;
    } catch (error) {
      console.error('Error parsing novel:', error);
      // Return basic novel object with minimal data on error
      return {
        name: 'Error loading novel',
        path: novelPath,
        cover: defaultCover,
        chapters: [],
      };
    }
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const chapterUrl = this.site + chapterPath;

    try {
      // Implement HTTP request to fetch chapter page
      const response = await fetchApi(chapterUrl);
      const html = await response.text();

      // Parse HTML with Cheerio
      const $ = parseHTML(html);

      // Identify main chapter content container using CSS selectors
      const contentContainer = $('div.reading-content').first();

      if (contentContainer.length === 0) {
        console.warn('Chapter content container not found');
        return '';
      }

      // Remove hidden input elements used for tracking (infinite scrolling)
      contentContainer.find('input[type="hidden"]').remove();

      // Handle embedded images - ensure they have proper attributes
      contentContainer.find('img').each((_, img) => {
        const $img = $(img);

        // Handle lazy-loaded images by moving data-src to src if needed
        const dataSrc = $img.attr('data-src');
        if (dataSrc && !$img.attr('src')) {
          $img.attr('src', dataSrc);
        }

        // Ensure images have alt text for accessibility
        if (!$img.attr('alt')) {
          $img.attr('alt', 'Chapter image');
        }
      });

      // Handle special formatting elements - preserve paragraph structure
      // Ensure proper spacing between paragraphs and other block elements
      contentContainer.find('p, div, br').each((_, element) => {
        const $element = $(element);

        // Ensure paragraphs have proper spacing
        if (element.tagName?.toLowerCase() === 'p' && $element.text().trim()) {
          // Paragraph already has proper HTML structure
        }

        // Handle div elements that might contain text
        if (
          element.tagName?.toLowerCase() === 'div' &&
          $element.text().trim()
        ) {
          // Preserve div structure for special formatting
        }
      });

      // Extract the HTML content while preserving formatting
      let chapterContent = contentContainer.html();

      // Filter out HTML comments
      if (chapterContent) {
        chapterContent = chapterContent.replace(/<!--[\s\S]*?-->/g, '');
      }

      // Return properly formatted HTML string
      return chapterContent?.trim() || '';
    } catch (error) {
      console.error('Error parsing chapter:', error);
      return '';
    }
  }
}

export default new KDTNovels();
