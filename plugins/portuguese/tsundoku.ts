import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import dayjs from 'dayjs';
import { Filters, FilterTypes } from '@libs/filterInputs';

class TsundokuPlugin implements Plugin.PluginBase {
  id = 'tsundoku';
  name = 'Tsundoku Traduções';
  version = '1.0.1';
  icon = 'src/pt-br/tsundoku/icon.png';
  site = 'https://tsundoku.com.br';

  parseDate(date: string): string {
    const monthMapping: Record<string, number> = {
      janeiro: 1,
      fevereiro: 2,
      marco: 3,
      abril: 4,
      maio: 5,
      junho: 6,
      julho: 7,
      agosto: 8,
      setembro: 9,
      outubro: 10,
      novembro: 11,
      dezembro: 12,
    };
    const [month, day, year] = date.split(/,?\s+/);
    return dayjs(
      `${year}-${monthMapping[month.normalize('NFD').replace(/[\u0300-\u036f]/g, '')]}-${day}`,
    ).toISOString();
  }

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.listupd .bsx').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('.tt').text().trim();
      const novelUrl = loadedCheerio(ele).find('a').attr('href');
      const coverUrl = loadedCheerio(ele).find('img').attr('src');
      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: coverUrl || defaultCover,
        path: novelUrl.replace(this.site, ''),
      };

      novels.push(novel);
    });

    return novels;
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();

    if (page > 1) {
      params.append('page', `${page}`);
    }
    params.append('type', 'novel');

    if (showLatestNovels) {
      params.append('order', 'latest');
    } else if (filters) {
      if (filters.genre.value.length) {
        filters.genre.value.forEach(value => {
          params.append('genre[]', value);
        });
      }
      params.append('order', filters.order.value);
    }

    const url = `${this.site}/manga/?` + params.toString();

    const body = await fetchApi(url).then(result => result.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.entry-title').text() || 'Untitled',
      cover: loadedCheerio('.main-info .thumb img').attr('src'),
      summary: loadedCheerio('.entry-content.entry-content-single div:eq(0)')
        .text()
        .trim(),
      chapters: [],
    };

    novel.author = loadedCheerio('.tsinfo .imptdt:contains("Autor")')
      .text()
      .replace('Autor ', '')
      .trim();

    novel.artist = loadedCheerio('.tsinfo .imptdt:contains("Artista")')
      .text()
      .replace('Artista ', '')
      .trim();

    novel.status = loadedCheerio('.tsinfo .imptdt:contains("Status")')
      .text()
      .replace('Status ', '')
      .trim();

    novel.genres = loadedCheerio('.mgen a')
      .map((_, ex) => loadedCheerio(ex).text())
      .toArray()
      .join(',');

    const chapters: Plugin.ChapterItem[] = [];

    loadedCheerio('#chapterlist ul > li').each((idx, ele) => {
      const chapterName = loadedCheerio(ele).find('.chapternum').text().trim();
      const chapterUrl = loadedCheerio(ele).find('a').attr('href');
      const releaseDate = loadedCheerio(ele).find('.chapterdate').text();
      if (!chapterUrl) return;

      chapters.push({
        name: chapterName,
        path: chapterUrl.replace(this.site, ''),
        releaseTime: this.parseDate(releaseDate),
      });
    });

    novel.chapters = chapters.reverse().map((c, i) => ({
      ...c,
      name: c.name + ` - Ch. ${i + 1}`,
      chapterNumber: i + 1,
    }));
    return novel;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();

    if (pageNo > 1) {
      params.append('page', `${pageNo}`);
    }
    params.append('type', 'novel');
    params.append('title', searchTerm);

    const url = `${this.site}/manga/?` + params.toString();

    const body = await fetchApi(url).then(result => result.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const chapterTitle = loadedCheerio('.headpost .entry-title').text();
    const novelTitle = loadedCheerio('.headpost a').text();
    const title = chapterTitle
      .replace(novelTitle, '')
      .replace(/^\W+/, '')
      .trim();

    const spoilerContent = loadedCheerio(
      '#readerarea .collapseomatic_content',
    ).html();
    if (spoilerContent) {
      return `<h1>${title}</h1>\n${spoilerContent}`;
    }

    const $readerarea = loadedCheerio('#readerarea');
    $readerarea.find('img.wp-image-15656').remove(); // Remove logo messages

    // Remove empty paragraphs
    $readerarea.find('p').each((i, el) => {
      const $this = loadedCheerio(el);
      const $imgs = $this.find('img');
      const cleanContent = $this
        .text()
        ?.replace(/\s|&nbsp;/g, '')
        ?.replace(this.site, '');

      // Without images and empty content
      if ($imgs?.length === 0 && cleanContent?.length === 0) {
        $this.remove();
      }
    });

    const chapterText = $readerarea.html() || '';
    const parts = chapterText.split(/<hr ?\/?>/);
    const lastPart = parts[parts.length - 1];
    if (parts.length > 1 && lastPart.includes('https://discord')) {
      parts.pop();
    }

    return `<h1>${title}</h1>\n${parts.join('<hr />')}`;
  }

  filters = {
    order: {
      label: 'Ordenar por',
      value: '',
      options: [
        { label: 'Padrão', value: '' },
        { label: 'A-Z', value: 'title' },
        { label: 'Z-A', value: 'titlereverse' },
        { label: 'Atualizar', value: 'update' },
        { label: 'Adicionar', value: 'latest' },
        { label: 'Popular', value: 'popular' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Gênero',
      value: [],
      options: [
        { label: 'Ação', value: '328' },
        { label: 'Adult', value: '343' },
        { label: 'Anatomia', value: '408' },
        { label: 'Artes Marciais', value: '340' },
        { label: 'Aventura', value: '315' },
        { label: 'Ciência', value: '398' },
        { label: 'Comédia', value: '322' },
        { label: 'Comédia Romântica', value: '378' },
        { label: 'Cotidiano', value: '399' },
        { label: 'Drama', value: '311' },
        { label: 'Ecchi', value: '329' },
        { label: 'Fantasia', value: '316' },
        { label: 'Feminismo', value: '362' },
        { label: 'Gender Bender', value: '417' },
        { label: 'Guerra', value: '368' },
        { label: 'Harém', value: '350' },
        { label: 'Hentai', value: '344' },
        { label: 'História', value: '400' },
        { label: 'Histórico', value: '380' },
        { label: 'Horror', value: '317' },
        { label: 'Humor Negro', value: '363' },
        { label: 'Isekai', value: '318' },
        { label: 'Josei', value: '356' },
        { label: 'Joshikousei', value: '364' },
        { label: 'LitRPG', value: '387' },
        { label: 'Maduro', value: '351' },
        { label: 'Mágia', value: '372' },
        { label: 'Mecha', value: '335' },
        { label: 'Militar', value: '414' },
        { label: 'Mistério', value: '319' },
        { label: 'Otaku', value: '365' },
        { label: 'Psicológico', value: '320' },
        { label: 'Reencarnação', value: '358' },
        { label: 'Romance', value: '312' },
        { label: 'RPG', value: '366' },
        { label: 'Sátira', value: '367' },
        { label: 'Sci-fi', value: '371' },
        { label: 'Seinen', value: '326' },
        { label: 'Sexo Explícito', value: '345' },
        { label: 'Shoujo', value: '323' },
        { label: 'Shounen', value: '341' },
        { label: 'Slice-of-Life', value: '324' },
        { label: 'Sobrenatural', value: '359' },
        { label: 'Supernatural', value: '401' },
        { label: 'Suspense', value: '407' },
        { label: 'Thriller', value: '410' },
        { label: 'Tragédia', value: '352' },
        { label: 'Vida Escolar', value: '331' },
        { label: 'Webtoon', value: '381' },
        { label: 'Xianxia', value: '357' },
        { label: 'Xuanhuan', value: '395' },
        { label: 'Yuri', value: '313' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new TsundokuPlugin();
