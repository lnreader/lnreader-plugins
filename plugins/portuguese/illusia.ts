import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';

class Illusia implements Plugin.PluginBase {
  id = 'illusia';
  name = 'Illusia';
  icon = 'src/pt-br/illusia/icon.png';
  site = 'https://illusia.com.br';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // Usando o sistema de busca nativo para evitar o Erro 500 das rotas customizadas
    const orderby = showLatestNovels ? 'modified' : 'views';

    const url = `${this.site}/${pageNo === 1 ? '' : 'page/' + pageNo + '/'}?s=&post_type=fcn_story&orderby=${orderby}&order=desc`;

    const req = await fetchApi(url);
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    return loadedCheerio('#search-result-list > li > div > div')
      .map((i, el) => {
        const item = loadedCheerio(el);

        const novelName = item.find('h3 > a').text().trim();
        const novelUrl = item.find('h3 > a').attr('href');
        const novelCover =
          item.find('a.cell-img img').attr('src') ||
          item.find('a.cell-img').attr('href');

        if (!novelName || !novelUrl) return null;

        return {
          name: novelName,
          cover: novelCover,
          path: novelUrl.replace(this.site + '/', '').replace(/\/$/, ''),
        };
      })
      .toArray()
      .filter(novel => novel !== null) as Plugin.NovelItem[];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const req = await fetchApi(`${this.site}/${novelPath}/`);
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.story__identity-title').text().trim(),
    };

    novel.author = loadedCheerio('div.story__identity-meta')
      .text()
      .split('|')[0]
      .replace('Author: ', '')
      .replace('by ', '')
      .trim();

    novel.cover =
      loadedCheerio('figure.story__thumbnail img').attr('src') ||
      loadedCheerio('figure.story__thumbnail > a').attr('href');

    novel.genres = loadedCheerio('div.tag-group > a, section.tag-group > a')
      .map((i, el) => loadedCheerio(el).text().trim())
      .toArray()
      .join(',');

    novel.summary = loadedCheerio('section.story__summary').text().trim();

    let chapterElements = loadedCheerio('li.chapter-group__list-item');

    if (chapterElements.length === 0) {
      chapterElements = loadedCheerio(
        'ul.chapter-list li, .chapters li, .chapter-item',
      );
    }

    novel.chapters = chapterElements
      .filter((i, el) => {
        const className = el.attribs['class'] || '';
        return !className.includes('_password');
      })
      .filter(
        (i, el) =>
          !loadedCheerio(el)
            .find('i')
            .first()
            ?.attr('class')
            ?.includes('fa-lock'),
      )
      .map((i, el) => {
        const aTag = loadedCheerio(el).find('a').first();
        const chapterName = aTag.text().trim();
        const chapterUrl = aTag
          .attr('href')
          ?.replace(this.site + '/', '')
          .replace(/\/$/, '');

        return {
          name: chapterName,
          path: chapterUrl || '',
        };
      })
      .toArray()
      .filter(chapter => chapter.path !== '');

    novel.chapters.reverse();

    const status = loadedCheerio('span.story__status').text().trim();
    if (status === 'Ongoing') novel.status = NovelStatus.Ongoing;
    if (status === 'Completed') novel.status = NovelStatus.Completed;
    if (status === 'Cancelled') novel.status = NovelStatus.Cancelled;
    if (status === 'Hiatus') novel.status = NovelStatus.OnHiatus;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // Você mencionou usar node-fetch para o capítulo.
    // Se o fetchApi estiver travando aqui, você pode trocá-lo pelo fetch do NodeJS (neste caso eu mantive a base padrão para testarmos).
    const req = await fetchApi(`${this.site}/${chapterPath}/`);
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    return loadedCheerio('section#chapter-content > div').html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const req = await fetchApi(
      `${this.site}/${pageNo === 1 ? '' : 'page/' + pageNo + '/'}?s=${encodeURIComponent(searchTerm)}&post_type=fcn_story`,
    );
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    return loadedCheerio('#search-result-list > li > div > div')
      .map((i, el) => {
        const novelName = loadedCheerio(el).find('h3 > a').text().trim();
        const novelCover =
          loadedCheerio(el).find('a.cell-img img').attr('src') ||
          loadedCheerio(el).find('a.cell-img').attr('href');
        const novelUrl = loadedCheerio(el).find('h3 > a').attr('href');

        return {
          name: novelName,
          cover: novelCover,
          path:
            novelUrl?.replace(this.site + '/', '')?.replace(/\/$/, '') || '',
        };
      })
      .toArray();
  }

  resolveUrl = (path: string, isNovel?: boolean) => `${this.site}/${path}/`;
}

export default new Illusia();
