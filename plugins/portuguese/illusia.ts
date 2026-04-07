import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';

class Illusia implements Plugin.PluginBase {
  id = 'illusia';
  name = 'Illusia';
  icon = 'src/pt-br/illusia/icon.png';
  site = 'https://illusia.com.br';
  version = '1.0.1';
  filters: Filters | undefined = undefined;

  headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  };

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const orderBy = showLatestNovels ? 'modified' : 'comment_count';
    const pagePath = pageNo === 1 ? '' : `page/${pageNo}/`;

    const url = `${this.site}/${pagePath}?s=&post_type=fcn_story&sentence=0&orderby=${orderBy}&order=desc&age_rating=Any&story_status=Any&miw=0&maw=0&genres=&fandoms=&characters=&tags=&warnings=&authors=&ex_genres=&ex_fandoms=&ex_characters=&ex_tags=&ex_warnings=&ex_authors=`;

    const req = await fetchApi(url, { headers: this.headers });
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    const novels = loadedCheerio(
      '#search-result-list > li, article.story, article.post, .card, .story-card, .ranking-item, ul.ranking-list li, .bsx, .book-item, .fcn-story',
    )
      .map((i, el) => {
        const item = loadedCheerio(el);
        const titleEl = item
          .find(
            '.card__title a, h2 a, h3 a, h4 a, .card-title a, .story-title a, .story__title a, .ranking-title a, .entry-title a, .tt',
          )
          .first();
        const novelName = titleEl.text().trim();
        const novelUrl =
          titleEl.attr('href') || item.find('a').first().attr('href');

        let novelCover =
          item.find('img').attr('data-src') ||
          item.find('img').attr('data-lazy-src') ||
          item.find('img').attr('src') ||
          item.find('.ranking-cover, .story-cover, .img-cover').attr('data-bg');

        if (!novelCover) {
          const bgElement = item.find('[style*="url("]');
          const styleAttr = bgElement.length
            ? bgElement.attr('style')
            : item.attr('style');

          if (styleAttr) {
            const match = styleAttr.match(/url\(['"]?([^'"]+)['"]?\)/i);
            if (match) novelCover = match[1];
          }
        }

        if (!novelName || !novelUrl) return null;

        if (novelCover && novelCover.startsWith('/')) {
          novelCover = this.site + novelCover;
        }

        return {
          name: novelName,
          cover: novelCover || defaultCover,
          path: novelUrl
            .replace(this.site, '')
            .replace(/^\//, '')
            .replace(/\/$/, ''),
        } as Plugin.NovelItem;
      })
      .toArray()
      .filter(novel => novel !== null) as Plugin.NovelItem[];

    const uniqueNovels = Array.from(
      new Map(novels.map(item => [item.path, item])).values(),
    );
    return uniqueNovels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const req = await fetchApi(`${this.site}/${novelPath}/`, {
      headers: this.headers,
    });
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.story__identity-title, h1.post-title')
        .text()
        .trim(),
    };

    let author =
      loadedCheerio(
        'span.custom-story-info a.author, a[href*="/author/"], a[rel="author"]',
      )
        .first()
        .text()
        .trim() ||
      loadedCheerio(
        '.story__author, .story-author, .author-name, .post-author, [class*="__author"]',
      )
        .first()
        .text()
        .trim();

    if (!author) {
      const metaText = loadedCheerio(
        '.story__identity-meta, .story-meta, .custom-story-info',
      )
        .text()
        .trim();
      if (metaText) {
        author = metaText
          .split('|')[0]
          .replace(/^(Autor[a]?|Por|Author|by)[\s:]*/i, '')
          .trim();
      }
    }
    novel.author = author || 'Desconhecido';

    novel.cover =
      loadedCheerio('figure.story__thumbnail img').attr('data-src') ||
      loadedCheerio('figure.story__thumbnail img').attr('src') ||
      loadedCheerio('.story__thumbnail img').attr('data-src') ||
      loadedCheerio('.story__thumbnail img').attr('src') ||
      loadedCheerio('figure.story__thumbnail > a').attr('href') ||
      defaultCover;

    novel.genres = loadedCheerio(
      'div.tag-group > a, section.tag-group > a, .genres a',
    )
      .map((i, el) => loadedCheerio(el).text().trim())
      .toArray()
      .join(',');

    let summaryHtml =
      loadedCheerio(
        'section.story__summary, div.story__summary, .summary',
      ).html() || '';
    summaryHtml = summaryHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n');
    novel.summary = loadCheerio(summaryHtml)
      .text()
      .trim()
      .replace(/\n{3,}/g, '\n\n');

    const chapterElements = loadedCheerio(
      'li.chapter-group__list-item, ul.chapter-list li, .chapters li, .chapter-item',
    );

    novel.chapters = chapterElements
      .map((i, el) => {
        const item = loadedCheerio(el);

        const aTag = item.find('a').first();
        const chapterName = aTag.text().trim();
        const chapterUrl = aTag.attr('href');

        if (!chapterUrl) return null;

        const chapterNumberMatch =
          chapterName.match(/(?:cap[íi]tulo|cap\.?|ch\.?)\s*(\d+(\.\d+)?)/i) ||
          chapterName.match(/^(\d+(\.\d+)?)/);
        const chapterNumber = chapterNumberMatch
          ? Number(chapterNumberMatch[1])
          : undefined;

        const chapter: Plugin.ChapterItem = {
          name: chapterName,
          path: chapterUrl
            .replace(this.site, '')
            .replace(/^\//, '')
            .replace(/\/$/, ''),
        };

        if (chapterNumber !== undefined) {
          chapter.chapterNumber = chapterNumber;
        }

        return chapter;
      })
      .toArray()
      .filter(chapter => chapter !== null) as Plugin.ChapterItem[];

    const metaBlockText =
      loadedCheerio('div.story__identity-meta, .story-meta').text() || '';
    const metaParts = metaBlockText.split('|').map(p => p.trim());

    let statusText = loadedCheerio('span.story__status')
      .text()
      .trim()
      .toLowerCase();
    if (!statusText && metaParts.length > 1) {
      statusText = metaBlockText.toLowerCase();
    }

    if (
      statusText.includes('ongoing') ||
      statusText.includes('andamento') ||
      statusText.includes('lançando') ||
      statusText.includes('ativa')
    )
      novel.status = NovelStatus.Ongoing;
    else if (
      statusText.includes('completed') ||
      statusText.includes('completo')
    )
      novel.status = NovelStatus.Completed;
    else if (
      statusText.includes('cancelled') ||
      statusText.includes('cancelado') ||
      statusText.includes('dropado')
    )
      novel.status = NovelStatus.Cancelled;
    else if (
      statusText.includes('hiatus') ||
      statusText.includes('hiato') ||
      statusText.includes('pausado')
    )
      novel.status = NovelStatus.OnHiatus;
    else novel.status = NovelStatus.Unknown;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const req = await fetchApi(`${this.site}/${chapterPath}/`, {
      headers: this.headers,
    });
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    const chapterContent = loadedCheerio(
      'section#chapter-content > div, div.chapter-content',
    );
    chapterContent
      .find(
        'script, style, iframe, .patreon-popup, .fcn-notice, .fictioneer-notice, div.card',
      )
      .remove();

    return chapterContent.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const pagePath = pageNo === 1 ? '' : `page/${pageNo}/`;

    const url = `${this.site}/${pagePath}?s=${encodeURIComponent(searchTerm)}&post_type=fcn_story&sentence=0&orderby=relevance&order=desc&age_rating=Any&story_status=Any&miw=0&maw=0&genres=&fandoms=&characters=&tags=&warnings=&authors=&ex_genres=&ex_fandoms=&ex_characters=&ex_tags=&ex_warnings=&ex_authors=`;

    const req = await fetchApi(url, { headers: this.headers });
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    const novels = loadedCheerio(
      '#search-result-list > li, article.story, article.post, .card, .story-card, .ranking-item, ul.ranking-list li, .bsx, .book-item, .fcn-story',
    )
      .map((i, el) => {
        const item = loadedCheerio(el);
        const titleEl = item
          .find(
            '.card__title a, h2 a, h3 a, h4 a, .card-title a, .story-title a, .story__title a, .ranking-title a, .entry-title a, .tt',
          )
          .first();
        const novelName = titleEl.text().trim();
        const novelUrl =
          titleEl.attr('href') || item.find('a').first().attr('href');

        let novelCover =
          item.find('img').attr('data-src') ||
          item.find('img').attr('data-lazy-src') ||
          item.find('img').attr('src') ||
          item.find('.ranking-cover, .story-cover, .img-cover').attr('data-bg');

        if (!novelCover) {
          const bgElement = item.find('[style*="url("]');
          const styleAttr = bgElement.length
            ? bgElement.attr('style')
            : item.attr('style');
          if (styleAttr) {
            const match = styleAttr.match(/url\(['"]?([^'"]+)['"]?\)/i);
            if (match) novelCover = match[1];
          }
        }

        if (!novelName || !novelUrl) return null;

        if (novelCover && novelCover.startsWith('/')) {
          novelCover = this.site + novelCover;
        }

        return {
          name: novelName,
          cover: novelCover || defaultCover,
          path: novelUrl
            .replace(this.site, '')
            .replace(/^\//, '')
            .replace(/\/$/, ''),
        } as Plugin.NovelItem;
      })
      .toArray()
      .filter(novel => novel !== null) as Plugin.NovelItem[];

    const uniqueNovels = Array.from(
      new Map(novels.map(item => [item.path, item])).values(),
    );
    return uniqueNovels;
  }

  resolveUrl = (path: string, isNovel?: boolean) => `${this.site}/${path}/`;
}

export default new Illusia();
