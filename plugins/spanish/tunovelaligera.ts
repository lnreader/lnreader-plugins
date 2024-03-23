import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class TuNovelaLigera implements Plugin.PagePlugin {
  id = 'tunovelaligera';
  name = 'TuNovelaLigera';
  icon = 'src/es/tunovelaligera/icon.png';
  site = 'https://tunovelaligera.com';
  version = '1.0.0';

  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site;

    link += filters?.genres?.value
      ? '/genero' + filters.genres.value
      : '/novelas';
    link += `/page/${pageNo}?m_orderby=`;
    link += showLatestNovels ? 'latest' : filters?.order?.value || 'rating';

    const result = await fetchApi(link).then(res => res.text());
    const loadedCheerio = parseHTML(result);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.page-item-detail').each((i, el) => {
      const name = loadedCheerio(el).find('.h5 > a').text();
      const cover = loadedCheerio(el).find('img').attr('src');
      const url = loadedCheerio(el).find('.h5 > a').attr('href');
      if (!url) return;

      novels.push({ name, cover, path: url.replace(this.site, '') });
    });

    return novels;
  }

  parseChapters(loadedCheerio: CheerioAPI): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    loadedCheerio('#lcp_instance_0 li').each((i, el) => {
      const chapterName = loadedCheerio(el)
        .find('a')
        .text()
        .replace(/[\t\n]/g, '')
        .trim();

      const chapterUrl = loadedCheerio(el).find('a').attr('href');
      if (!chapterUrl) return;
      chapters.push({
        name: chapterName,
        path: chapterUrl.replace(this.site, ''),
      });
    });
    return chapters;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const novelUrl = this.site + novelPath;
    const result = await fetchApi(novelUrl);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);
    let lastPage = 1;
    loadedCheerio('ul.lcp_paginator > li > a').each(function () {
      const page = Number(this.attribs['title']);
      if (page && page > lastPage) lastPage = page;
    });
    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      chapters: [],
      totalPages: lastPage,
      name: loadedCheerio('.post-title > h1').text().trim(),
    };

    loadedCheerio('.manga-title-badges').remove();

    let novelCover = loadedCheerio('.summary_image > a > img');

    novel.cover =
      novelCover.attr('data-src') ||
      novelCover.attr('src') ||
      novelCover.attr('data-cfsrc') ||
      defaultCover;

    loadedCheerio('.post-content_item').each(function () {
      const detailName = loadedCheerio(this)
        .find('.summary-heading > h5')
        .text()
        .trim();
      const detail = loadedCheerio(this).find('.summary-content').text().trim();

      switch (detailName) {
        case 'Género(s)':
          novel.genres = detail.replace(/, /g, ',');
          break;
        case 'Autor(es)':
          novel.author = detail;
          break;
        case 'Estado':
          novel.status =
            detail.includes('OnGoing') || detail.includes('Updating')
              ? NovelStatus.Ongoing
              : NovelStatus.Completed;
          break;
      }
    });

    novel.summary = loadedCheerio('div.summary__content > p').text().trim();

    novel.chapters = this.parseChapters(loadedCheerio);

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const novelUrl = this.site + novelPath;
    const pageUrl = this.site + novelPath + '?lcp_page0=' + page;
    const result = await fetchApi(novelUrl);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);
    const latestChapterEle = loadedCheerio('#lcp_instance_0 li').first();
    const latestChapterUrl = loadedCheerio(latestChapterEle)
      .find('a')
      .attr('href');
    const latestChapterName = loadedCheerio(latestChapterEle)
      .find('a')
      .text()
      .replace(/[\t\n]/g, '')
      .trim();
    const latestChapter: Plugin.ChapterItem | undefined = latestChapterUrl
      ? {
          path: latestChapterUrl.replace(this.site, ''),
          name: latestChapterName,
        }
      : undefined;
    await this.sleep(1000);
    const pageText = await fetchApi(pageUrl).then(res => res.text());
    const chapters = this.parseChapters(parseHTML(pageText));
    return {
      chapters,
      latestChapter,
    };
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('.c-blog-post.post').html() || '';

    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/?s=${searchTerm}&post_type=wp-manga`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.c-tabs-item__content').each((i, el) => {
      const name = loadedCheerio(el).find('.h4 > a').text();
      const cover = loadedCheerio(el).find('img').attr('src');
      const url = loadedCheerio(el).find('.h4 > a').attr('href');
      if (!url) return;

      novels.push({ name, cover, path: url.replace(this.site, '') });
    });

    return novels;
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return await fetchFile(url);
  }

  filters = {
    order: {
      value: 'rating',
      label: 'Ordenado por',
      options: [
        { label: 'Lo mas reciente', value: 'latest' },
        { label: 'A-Z', value: 'alphabet' },
        { label: 'Clasificación', value: 'rating' },
        { label: 'Trending', value: 'trending' },
        { label: 'Mas visto', value: 'views' },
        { label: 'Nuevo', value: 'new-manga' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      value: '',
      label: 'Generos',
      options: [
        { label: 'None', value: '' },
        { label: 'Acción', value: 'accion' },
        { label: 'Adulto', value: 'adulto' },
        { label: 'Artes Marciales', value: 'artes-marciales' },
        { label: 'Aventura', value: 'aventura' },
        { label: 'Ciencia Ficción', value: 'ciencia-ficcion' },
        { label: 'Comedia', value: 'comedia' },
        { label: 'Deportes', value: 'deportes' },
        { label: 'Drama', value: 'drama' },
        { label: 'Eastern Fantasy', value: 'eastern-fantasy' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'FanFiction', value: 'fan-fiction' },
        { label: 'Fantasía', value: 'fantasia' },
        { label: 'Fantasía oriental', value: 'fantasia-oriental' },
        { label: 'Ficción Romántica', value: 'ficcion-romantica' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Histórico', value: 'historico' },
        { label: 'Horror', value: 'horror' },
        { label: 'Josei', value: 'josei' },
        { label: 'Maduro', value: 'maduro' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Misterio', value: 'misterio' },
        { label: 'Novela China', value: 'novela-china' },
        { label: 'Novela FanFiction', value: 'novela-fanfiction' },
        { label: 'Novela Japonesa', value: 'novela-japonesa' },
        { label: 'Novela Koreana', value: 'novela-koreana' },
        { label: 'Novela ligera', value: 'novela-ligera' },
        { label: 'Novela original', value: 'novela-original' },
        { label: 'Novela Web', value: 'web-novel' },
        { label: 'Psicológico', value: 'psicologico' },
        { label: 'Realismo Mágico', value: 'realismo-magico' },
        { label: 'Recuento de vida', value: 'recuento-de-vida' },
        { label: 'Romance', value: 'romance' },
        { label: 'Romance contemporáneo', value: 'romance-contemporaneo' },
        { label: 'Romance Moderno', value: 'romance-moderno' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Sobrenatural', value: 'sobrenatural' },
        { label: 'Tragedia', value: 'tragedia' },
        { label: 'Vampiros', value: 'vampiros' },
        { label: 'Vida Escolar', value: 'vida-escolar' },
        { label: 'Western Fantasy', value: 'western-fantasy' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new TuNovelaLigera();
