import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

class NovelArrow implements Plugin.PluginBase {
  id = 'novelarrow';
  name = 'Novel Arrow';
  icon = 'src/en/novelarrow/icon.png';
  site = 'https://novelarrow.com/';
  version = '1.0.0';

  async popularNovels(page: number) {
    const url = `${this.site}novels/latest?page=${page}`;
    const result = await fetchApi(url).then(res => res.text());
    const $ = parseHTML(result);
    const novels: Plugin.NovelItem[] = [];

    $('article').each((i, el) => {
      const title = $(el).find('h2').text().trim();
      const cover = $(el).find('img').attr('src');
      const href = $(el).find('a').attr('href');

      if (title && href) {
        novels.push({
          name: title,
          cover,
          path: href.substring(1), // Result: "novel/slug"
        });
      }
    });

    return novels;
  }

  async parseNovel(novelPath: string) {
    // Ensure no double slashes in the URL
    const url = this.site + novelPath.replace(/^\//, '');
    const result = await fetchApi(url).then(res => res.text());
    const $ = parseHTML(result);

    const novelId = novelPath.replace('novel/', '').replace(/^\//, '');

    // Collect genres
    let genres =
      $('meta[name="og:novel:genre"]').attr('content') ||
      $('meta[property="og:novel:genre"]').attr('content');

    if (!genres) {
      const genreList: string[] = [];
      $('meta[property="article:tag"]').each((i, el) => {
        const tag = $(el).attr('content');
        if (tag) genreList.push(tag);
      });
      genres = genreList.join(', ');
    }

    // Attempt to get the full summary from the JSON stream if the meta tag is truncated
    let fullSummary =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content');
    const summaryMatch = result.match(/\\?"description\\?":\\?"(.*?)\\?"/);
    if (summaryMatch && summaryMatch[1].length > (fullSummary?.length || 0)) {
      fullSummary = summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        $('meta[name="og:novel:novel_name"]').attr('content') ||
        $('meta[property="og:novel:novel_name"]').attr('content') ||
        $('meta[property="og:title"]').attr('content')?.split(' Novel')[0] ||
        $('h1').first().text().trim(),
      cover:
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="og:image"]').attr('content'),
      author:
        $('meta[name="og:novel:author"]').attr('content') ||
        $('meta[property="og:novel:author"]').attr('content') ||
        $('meta[name="author"]').attr('content') ||
        $('meta[property="article:author"]').attr('content'),
      status:
        ($('meta[name="og:novel:status"]').attr('content') ||
          $('meta[property="og:novel:status"]').attr('content')) === 'Ongoing'
          ? NovelStatus.Ongoing
          : NovelStatus.Completed,
      summary: fullSummary,
      genres: genres,
      chapters: [],
    };

    const chaptersUrl = `${this.site}api-web/novels/${novelId}/chapters?sort=asc`;
    try {
      const chaptersJson = await fetchApi(chaptersUrl, {
        headers: {
          'Accept': 'application/json',
        },
      }).then(res => res.json());

      if (chaptersJson && chaptersJson.items) {
        novel.chapters = chaptersJson.items.map(
          (item: { chapter_name: string; chapter_id: string }) => ({
            name: item.chapter_name,
            path: `chapter/${novelId}/${item.chapter_id}`,
            releaseTime: null,
          }),
        );
      }
    } catch (e) {
      const chaptersMap = new Map();
      // Flexible Regex to handle JSON stream variations
      const combinedRegex =
        /\\?"chapter_id\\?":\\?"([^"]+)\\?",\\?"chapter_name\\?":\\?"([^"]+)\\?"/g;
      let match;
      while ((match = combinedRegex.exec(result)) !== null) {
        const path = match[1];
        const name = match[2].replace(/\\"/g, '"');
        const fullPath = `chapter/${novelId}/${path}`;
        if (!chaptersMap.has(fullPath)) {
          chaptersMap.set(fullPath, {
            name,
            path: fullPath,
            releaseTime: null,
          });
        }
      }
      novel.chapters = Array.from(chaptersMap.values());
    }

    return novel;
  }

  async parseChapter(chapterPath: string) {
    const pathParts = chapterPath.replace('chapter/', '').split('/');
    const novelId = pathParts[0];
    const chapterId = pathParts[1];

    const url = `${this.site}api-web/novels/${novelId}/chapters/${chapterId}`;

    try {
      const json = await fetchApi(url, {
        headers: {
          'Accept': 'application/json',
          'x-track-reading-progress': 'false',
        },
      }).then(res => res.json());

      if (
        json &&
        json.item &&
        json.item.chapterInfo &&
        json.item.chapterInfo.chapter_content
      ) {
        return json.item.chapterInfo.chapter_content;
      }
    } catch (e) {
      const result = await fetchApi(`${this.site}${chapterPath}`).then(res =>
        res.text(),
      );
      const contentRegex = /\\u003ch4\\u003e(.*)\\u003c\/p\\u003e/;
      const match = result.match(contentRegex);

      if (match) {
        let chapterHtml = match[0];
        chapterHtml = chapterHtml
          .replace(/\\u003c/g, '<')
          .replace(/\\u003e/g, '>')
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '')
          .replace(/\\t/g, '')
          .replace(/\\r/g, '')
          .replace(/\\\\/g, '\\');

        const lastPTagIndex = chapterHtml.lastIndexOf('</p>');
        if (lastPTagIndex !== -1) {
          chapterHtml = chapterHtml.substring(0, lastPTagIndex + 4);
        }
        return chapterHtml;
      }

      const $ = parseHTML(result);
      return $('.site-reading-copy').html() || 'Content not found or premium.';
    }

    return 'Content not found or premium.';
  }

  async searchNovels(searchTerm: string, page: number) {
    const url = `${this.site}novels/search?keyword=${encodeURIComponent(searchTerm)}&page=${page}`;
    const result = await fetchApi(url).then(res => res.text());
    const $ = parseHTML(result);
    const novels: Plugin.NovelItem[] = [];

    $('article').each((i, el) => {
      const title = $(el).find('h2').text().trim();
      const cover = $(el).find('img').attr('src');
      const href = $(el).find('a').attr('href');

      if (title && href) {
        novels.push({
          name: title,
          cover,
          path: href.substring(1),
        });
      }
    });

    return novels;
  }
}

export default new NovelArrow();
