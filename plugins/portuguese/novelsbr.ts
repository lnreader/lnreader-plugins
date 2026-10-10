import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class NovelsBRPlugin implements Plugin.PluginBase {
  id = 'novelsbr';
  name = 'Novels BR';
  icon = 'src/pt-br/novelsbr/icon.png';
  site = 'https://novels-br.com';
  version = '1.0.3';

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: 'https://novels-br.com/',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
    },
  };

  filters = {
    category: {
      label: 'Categoria',
      value: '',
      type: FilterTypes.Picker,
      options: [
        { label: 'Todas', value: '' },
        { label: 'Academia', value: '112' },
        { label: 'Ação', value: '8' },
        { label: 'Adulto', value: '14' },
        { label: 'Alta Fantasia', value: '102' },
        { label: 'Antologia', value: '90' },
        { label: 'Apocalipse', value: '85' },
        { label: 'Apocalíptico', value: '104' },
        { label: 'Artes Marciais', value: '20' },
        { label: 'Aventura', value: '18' },
        { label: 'Baixa Fantasia', value: '107' },
        { label: 'Ciência', value: '117' },
        { label: 'Comédia', value: '6' },
        { label: 'Construção de Reino', value: '88' },
        { label: 'Conto', value: '91' },
        { label: 'Cósmico', value: '89' },
        { label: 'Cotidiano', value: '29' },
        { label: 'Cultivo', value: '79' },
        { label: 'Cyberpunk', value: '108' },
        { label: 'Dark Fantasy', value: '51' },
        { label: 'Dark Sci-Fi', value: '113' },
        { label: 'Distopia', value: '86' },
        { label: 'Drama', value: '4' },
        { label: 'Ecchi', value: '33' },
        { label: 'Épico', value: '65' },
        { label: 'Erótico', value: '44' },
        { label: 'Escolar', value: '34' },
        { label: 'Espacial', value: '111' },
        { label: 'Esportes', value: '116' },
        { label: 'eSports', value: '54' },
        { label: 'Eventos', value: '56' },
        { label: 'Evolução', value: '71' },
        { label: 'Exploração', value: '93' },
        { label: 'Fantasia', value: '22' },
        { label: 'Fantasia Sombria', value: '72' },
        { label: 'Fantasia Urbana', value: '110' },
        { label: 'Ficção', value: '58' },
        { label: 'Ficção Cientifica', value: '25' },
        { label: 'Ficção Científica', value: '98' },
        { label: 'Filosófico', value: '68' },
        { label: 'Futurista', value: '94' },
        { label: 'GameLit', value: '99' },
        { label: 'Gore', value: '66' },
        { label: 'Gótico', value: '103' },
        { label: 'Guerra', value: '63' },
        { label: 'Harém', value: '35' },
        { label: 'Histórico', value: '19' },
        { label: 'Horror', value: '5' },
        { label: 'Horror Cósmico', value: '115' },
        { label: 'Isekai', value: '17' },
        { label: 'Jogos', value: '64' },
        { label: 'Josei', value: '52' },
        { label: 'LGBTQI+', value: '92' },
        { label: 'Light Novel', value: '24' },
        { label: 'LitRPG', value: '82' },
        { label: 'Luta', value: '46' },
        { label: 'Maduro', value: '80' },
        { label: 'Magia', value: '13' },
        { label: 'Mecha', value: '30' },
        { label: 'Medieval', value: '36' },
        { label: 'Militar', value: '31' },
        { label: 'Mistério', value: '40' },
        { label: 'mitologia', value: '57' },
        { label: 'Mitologia', value: '41' },
        { label: 'MMORPG', value: '11' },
        { label: 'Moderno', value: '76' },
        { label: 'Monstros', value: '73' },
        { label: 'Música', value: '55' },
        { label: 'Não-Humano', value: '106' },
        { label: 'Obsceno', value: '83' },
        { label: 'One-shot', value: '2' },
        { label: 'Oneshots', value: '77' },
        { label: 'Original - Novel Mania ©', value: '10' },
        { label: 'Pet', value: '74' },
        { label: 'Política', value: '50' },
        { label: 'Pós-Apocalipse', value: '81' },
        { label: 'Pós-Apocalíptico', value: '101' },
        { label: 'Protagonista Feminina', value: '60' },
        { label: 'Psicológico', value: '37' },
        { label: 'Punk', value: '119' },
        { label: 'Realidade Alternativa', value: '69' },
        { label: 'Realidade Virtual', value: '45' },
        { label: 'Realidade Vitual', value: '1' },
        { label: 'Realismo Mágico', value: '59' },
        { label: 'Reencarnação', value: '3' },
        { label: 'Religião', value: '70' },
        { label: 'Romance', value: '12' },
        { label: 'RPG', value: '7' },
        { label: 'Sci-fi', value: '27' },
        { label: 'Sci-Fi', value: '67' },
        { label: 'Seinen', value: '47' },
        { label: 'Shoujo', value: '48' },
        { label: 'Shounen', value: '49' },
        { label: 'Sistema', value: '75' },
        { label: 'Sistema de Jogo', value: '39' },
        { label: 'Slice of Life', value: '16' },
        { label: 'Sobrenatural', value: '32' },
        { label: 'Sobrevivência', value: '114' },
        { label: 'Steampunk', value: '100' },
        { label: 'Super-Herói', value: '118' },
        { label: 'Super Poderes', value: '87' },
        { label: 'Suspense', value: '43' },
        { label: 'Terror', value: '38' },
        { label: 'Tragédia', value: '15' },
        { label: 'Traição', value: '97' },
        { label: 'Transmigração', value: '78' },
        { label: 'Vida Cotidiana', value: '109' },
        { label: 'Vida Escolar', value: '61' },
        { label: 'Vingança', value: '96' },
        { label: 'VRMMO', value: '26' },
        { label: 'Webnovel', value: '28' },
        { label: 'Wuxia', value: '42' },
        { label: 'Xianxia', value: '9' },
        { label: 'Xuanhuan', value: '23' },
        { label: 'Yaoi', value: '21' },
        { label: 'Yuri', value: '62' },
      ],
    },
  } satisfies Filters;

  resolveUrl = (path: string): string => {
    if (!path) {
      return this.site;
    }

    try {
      return new URL(path, this.site).toString();
    } catch {
      return path;
    }
  };

  private normalizePath(path: string): string {
    if (!path) {
      return '';
    }

    try {
      const url = new URL(path, this.site);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return path;
    }
  }

  private parseHomeNovels(
    $: ReturnType<typeof loadCheerio>,
    sectionSelector: string,
  ): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    $(`${sectionSelector} .product__item`).each((_, element) => {
      const $item = $(element);

      const $link = $item
        .find('.product__item__text h5 a[href^="/novels/"]')
        .first();

      const href = $link.attr('href');

      if (!href) {
        return;
      }

      const name = $link.text().replace(/\s+/g, ' ').trim();

      if (!name) {
        return;
      }

      const imageUrl = $item.find('.product__item__pic').attr('data-setbg');

      novels.push({
        name,
        path: this.normalizePath(href),
        cover: imageUrl || defaultCover,
      });
    });

    return novels;
  }

  private parseNovelCards(
    $: ReturnType<typeof loadCheerio>,
  ): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    $('#content .card').each((_, element) => {
      const $card = $(element);

      const $link = $card.find('a[href^="/novels/"]').first();

      const href = $link.attr('href');

      if (!href) {
        return;
      }

      const path = this.normalizePath(href);

      if (!path.startsWith('/novels/')) {
        return;
      }

      if (novels.some(novel => novel.path === path)) {
        return;
      }

      const name =
        $card.find('h2.card-title').first().text().trim() ||
        $link.text().replace(/\s+/g, ' ').trim();

      if (!name) {
        return;
      }

      const cover =
        $card.find('img.img-fluid.custom-card-img').attr('src') ||
        $card.find('.col-md-4 img').attr('src') ||
        $card.find('img[src]').first().attr('src');

      novels.push({
        name,
        path,
        cover: cover ? this.resolveUrl(cover) : defaultCover,
      });
    });

    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    try {
      const category = filters?.category?.value || '';

      if (pageNo <= 1 && !category) {
        const body = await fetchText(this.site);

        if (!body) {
          return [];
        }

        const $ = loadCheerio(body);

        return showLatestNovels
          ? this.parseHomeNovels($, '.recent__product')
          : this.parseHomeNovels($, '.popular__product');
      }

      const params = new URLSearchParams();

      params.set('simplifiedField', '');

      if (category) {
        params.set('categoryId', category);
      }

      params.set('page', String(Math.max(0, pageNo - 1)));

      const body = await fetchText(`${this.site}/novels?${params.toString()}`);

      if (!body) {
        return [];
      }

      const $ = loadCheerio(body);

      return this.parseNovelCards($);
    } catch (error) {
      console.log('Erro ao buscar novelas:', error);
      return [];
    }
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = this.normalizePath(novelPath);

    const novel: Plugin.SourceNovel = {
      path,
      name: 'Untitled',
      cover: defaultCover,
      chapters: [],
    };

    try {
      const body = await fetchText(this.resolveUrl(path));

      if (!body) {
        return novel;
      }

      const $ = loadCheerio(body);

      novel.name =
        $('h1.mb-0').first().text().trim() ||
        $('h1').first().text().trim() ||
        novel.name;

      const author = $('h3[alt]').first().text().trim();

      if (author) {
        novel.author = author;
      }

      const cover =
        $('meta[property="og:image"]').attr('content') ||
        $('#heroimg').attr('src') ||
        $('img').first().attr('src');

      if (cover) {
        novel.cover = this.resolveUrl(cover);
      }

      const statusText = $('h5[alt]')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      if (
        statusText.includes('concluído') ||
        statusText.includes('concluido') ||
        statusText.includes('completed')
      ) {
        novel.status = NovelStatus.Completed;
      } else if (
        statusText.includes('em andamento') ||
        statusText.includes('ongoing')
      ) {
        novel.status = NovelStatus.Ongoing;
      } else {
        novel.status = NovelStatus.Unknown;
      }

      const summary =
        $('#hero-novel p').first().text().trim() ||
        $('.brief-description').first().text().trim();

      if (summary) {
        novel.summary = summary;
      }

      const genres: string[] = [];

      $('.tags ul li a, .tags a, .genres a').each((_, element) => {
        const genre = $(element).text().trim();

        if (genre && !genres.includes(genre)) {
          genres.push(genre);
        }
      });

      if (genres.length > 0) {
        novel.genres = genres.join(',');
      }

      const chapters: Plugin.ChapterItem[] = [];

      $('#volumes ol li, #volumes li').each((_, element) => {
        const $chapter = $(element);

        const chapterHref =
          $chapter.find('a.custom-link').first().attr('href') ||
          $chapter.find('a[href]').first().attr('href');

        if (!chapterHref) {
          return;
        }

        const chapterPath = this.normalizePath(chapterHref);

        if (!chapterPath || chapterPath === path) {
          return;
        }

        const chapterName =
          $chapter.find('strong').first().text().trim() ||
          $chapter
            .find('a.custom-link')
            .first()
            .text()
            .replace(/\s+/g, ' ')
            .trim() ||
          $chapter.find('a[href]').first().text().replace(/\s+/g, ' ').trim();

        if (!chapterName) {
          return;
        }

        const releaseTime = $chapter
          .find('small.text-muted')
          .first()
          .text()
          .replace(/\s+/g, ' ')
          .trim();

        chapters.push({
          name: chapterName,
          path: chapterPath,
          releaseTime,
          chapterNumber: chapters.length + 1,
        });
      });

      novel.chapters = chapters.map((chapter, index) => ({
        ...chapter,
        chapterNumber: index + 1,
      }));

      return novel;
    } catch (error) {
      console.log('Erro ao analisar novel:', error);
      return novel;
    }
  }

  async parseChapter(chapterPath: string): Promise<string> {
    try {
      const body = await fetchText(this.resolveUrl(chapterPath));

      if (!body) {
        return '';
      }

      const $ = loadCheerio(body);

      const content = $('.chapter-content').first();

      if (!content.length) {
        return '';
      }

      content
        .find(
          'script, style, noscript, iframe, ins, .adsbygoogle, button, .navigation-buttons, a',
        )
        .remove();

      content
        .find('p')
        .filter((_, element) => {
          const $paragraph = $(element);
          const style = ($paragraph.attr('style') || '').toLowerCase();

          return (
            style.includes('display: none') ||
            style.includes('display:none') ||
            $paragraph.attr('hidden') !== undefined
          );
        })
        .remove();

      const paragraphs = content
        .find('p')
        .map((_, element) => $(element).html()?.trim() || '')
        .get()
        .filter(Boolean);

      return paragraphs.length > 0
        ? paragraphs.join('<br><br>')
        : content.html()?.trim() || '';
    } catch (error) {
      console.log('Erro ao analisar capítulo:', error);
      return '';
    }
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    try {
      const params = new URLSearchParams();

      params.set('simplifiedField', searchTerm);
      params.set('page', String(Math.max(0, pageNo - 1)));

      const body = await fetchText(`${this.site}/novels?${params.toString()}`);

      if (!body) {
        return [];
      }

      const $ = loadCheerio(body);

      return this.parseNovelCards($);
    } catch (error) {
      console.log('Erro ao pesquisar novels:', error);
      return [];
    }
  }
}

export default new NovelsBRPlugin();
