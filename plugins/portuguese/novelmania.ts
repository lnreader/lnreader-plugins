import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class NovelMania implements Plugin.PluginBase {
  id = 'novelmania.com.br';
  name = 'Novel Mania';
  icon = 'src/pt-br/novelmania/icon.png';
  site = 'https://novelmania.com.br';
  version = '1.0.1';
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${this.site}/novels?titulo=`;
    url += `&categoria=${filters?.genres.value}`;
    url += `&status=${filters?.status.value}`;
    url += `&nacionalidade=${filters?.type.value}`;
    url += `&ordem=${filters?.ordem.value}`;
    url += `&page%5Bpage%5D=${pageNo}`;

    const body = await fetchApi(url).then(res => res.text());

    const loadedCheerio = parseHTML(body);
    const load = loadedCheerio('div.top-novels.dark.col-6 > div.row.mb-2');

    const novels: Plugin.NovelItem[] = load
      .map((index, element) => ({
        name: loadedCheerio(element).find('a.novel-title > h5').text(),
        cover: loadedCheerio(element)
          .find('a > div.card.c-size-1.border > img.card-image')
          .attr('src'),
        path: loadedCheerio(element).find('a.novel-title').attr('href') || '',
      }))
      .get()
      .filter(novel => novel.name && novel.path);
    return novels;
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        loadedCheerio(
          'div.col-md-8 > div.novel-info > div.d-flex.flex-row.align-items-center > h1',
        )
          .text()
          .trim() || 'Sem título',
    };

    loadedCheerio('b').remove();

    novel.name =
      loadedCheerio(
        'div.col-md-8 > div.novel-info > div.d-flex.flex-row.align-items-center > h1',
      )
        .text()
        .trim() || 'Sem título';
    novel.summary =
      loadedCheerio('div.tab-pane.fade.show.active > div.text > p')
        .map((i, el) => loadedCheerio(el).text())
        .toArray()
        .join('\n\n')
        .trim() || '';
    novel.cover =
      loadedCheerio('div.novel-img > img.img-responsive').attr('src') ||
      defaultCover;
    novel.author = loadedCheerio('div.novel-info > span.authors.mb-1')
      .text()
      .trim();
    novel.genres = loadedCheerio('div.tags > ul.list-tags.mb-0 > li > a')
      .map((i, el) => loadedCheerio(el).text())
      .toArray()
      .join(',');

    const status = loadedCheerio('div.novel-info > span.authors.mb-3')
      .text()
      .trim();
    switch (status) {
      case 'Ativo':
        novel.status = NovelStatus.Ongoing;
        break;
      case 'Pausado':
        novel.status = NovelStatus.OnHiatus;
        break;
      case 'Completo':
        novel.status = NovelStatus.Completed;
        break;
      default:
        novel.status = NovelStatus.Unknown;
    }

    const chapters: Plugin.ChapterItem[] = [];

    loadedCheerio(
      'div.accordion.capitulo > div.card > div.collapse > div.card-body.p-0 > ol > li',
    ).each((i, el) => {
      const chapterName = `${loadedCheerio(el).find('a > span.sub-vol').text().trim()} - ${loadedCheerio(el).find('a > strong').text().trim()}`;
      const chapterPath = loadedCheerio(el).find('a').attr('href');
      if (chapterPath) chapters.push({ name: chapterName, path: chapterPath });
    });
    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const response = await fetchApi(`${this.site}${chapterPath}`).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(response);
    return loadedCheerio('div#chapter-content').html() || '';
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/novels?titulo=${searchTerm}&page%5Bpage%5D=${pageNo}`;
    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);
    const load = loadedCheerio('div.top-novels.dark.col-6 > div.row.mb-2');

    const novels: Plugin.NovelItem[] = load
      .map((index, element) => ({
        name: loadedCheerio(element).find('a.novel-title > h5').text(),
        cover: loadedCheerio(element)
          .find('a > div.card.c-size-1.border > img.card-image')
          .attr('src'),
        path: loadedCheerio(element).find('a.novel-title').attr('href') || '',
      }))
      .get()
      .filter(novel => novel.name && novel.path);
    return novels;

    return novels;
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/book/' : '/chapter/') + path;

  filters = {
    genres: {
      value: '',
      label: 'Gêneros',
      options: [
        { label: 'Todos', value: '' },
        { label: 'Ação', value: '01' },
        { label: 'Adulto', value: '02' },
        { label: 'Artes Marciais', value: '07' },
        { label: 'Aventura', value: '03' },
        { label: 'Comédia', value: '04' },
        { label: 'Cotidiano', value: '16' },
        { label: 'Drama', value: '23' },
        { label: 'Ecchi', value: '27' },
        { label: 'Erótico', value: '22' },
        { label: 'Escolar', value: '13' },
        { label: 'Fantasia', value: '05' },
        { label: 'Harém', value: '21' },
        { label: 'Isekai', value: '30' },
        { label: 'Magia', value: '26' },
        { label: 'Mecha', value: '08' },
        { label: 'Medieval', value: '31' },
        { label: 'Militar', value: '24' },
        { label: 'Mistério', value: '09' },
        { label: 'Mitologia', value: '10' },
        { label: 'Psicológico', value: '11' },
        { label: 'Realidade Virtual', value: '36' },
        { label: 'Romance', value: '12' },
        { label: 'Sci-fi', value: '14' },
        { label: 'Sistema de Jogo', value: '15' },
        { label: 'Sobrenatural', value: '17' },
        { label: 'Suspense', value: '29' },
        { label: 'Terror', value: '06' },
        { label: 'Wuxia', value: '18' },
        { label: 'Xianxia', value: '19' },
        { label: 'Xuanhuan', value: '20' },
        { label: 'Yaoi', value: '35' },
        { label: 'Yuri', value: '37' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Status',
      value: '',
      options: [
        { label: 'Todos', value: '' },
        { label: 'Ativo', value: 'ativo' },
        { label: 'Completo', value: 'Completo' },
        { label: 'Pausado', value: 'pausado' },
        { label: 'Parado', value: 'Parado' },
      ],
      type: FilterTypes.Picker,
    },
    type: {
      label: 'Type',
      value: '',
      options: [
        { label: 'Todas', value: '' },
        { label: 'Americana', value: 'americana' },
        { label: 'Angolana', value: 'angolana' },
        { label: 'Brasileira', value: 'brasileira' },
        { label: 'Chinesa', value: 'chinesa' },
        { label: 'Coreana', value: 'coreana' },
        { label: 'Japonesa', value: 'japonesa' },
      ],
      type: FilterTypes.Picker,
    },
    ordem: {
      label: 'Ordenar',
      value: '',
      options: [
        { label: 'Qualquer ordem', value: '' },
        { label: 'Ordem alfabética', value: '1' },
        { label: 'Nº de Capítulos', value: '2' },
        { label: 'Popularidade', value: '3' },
        { label: 'Novidades', value: '4' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new NovelMania();
