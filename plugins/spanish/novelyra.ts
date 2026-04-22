import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { CheerioAPI, load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

function parseSpanishTextToISO(text: string) {
  if (!text) return null;

  const now = new Date();
  const textLower = text.trim().toLowerCase();

  // --- 1. MAPEOS Y EXPRESIONES REGULARES ---
  const months = {
    enero: 0,
    febrero: 1,
    marzo: 2,
    abril: 3,
    mayo: 4,
    junio: 5,
    julio: 6,
    agosto: 7,
    septiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11,
  };

  // Expresión para: "21 de febrero de 2026"
  const absoluteRegex = /^(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})$/i;

  // --- 2. EVALUAR FECHAS ABSOLUTAS ---
  const absoluteMatch = textLower.match(absoluteRegex);
  if (absoluteMatch) {
    const day = parseInt(absoluteMatch[1], 10);
    const monthStr = absoluteMatch[2];
    const year = parseInt(absoluteMatch[3], 10);

    const monthIndex = months[monthStr as keyof typeof months];
    if (monthIndex !== undefined) {
      // Se crea la fecha en hora local (00:00:00)
      const date = new Date(year, monthIndex, day);
      return date.toISOString();
    }
  }

  // --- 3. EVALUAR FECHAS RELATIVAS ("hace...") ---
  if (textLower.startsWith('hace')) {
    // Normalizar "un" / "una" a "1" para facilitar el cálculo
    const normalized = textLower
      .replace(/\b(un|una)\b/g, '1')
      .replace('un momento', '0 segundos');

    if (normalized.includes('momento')) {
      return now.toISOString();
    }

    const relativeRegex = /(\d+)\s+([a-zñáéíóú]+)/i;
    const relativeMatch = normalized.match(relativeRegex);

    if (relativeMatch) {
      const value = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2];

      const date = new Date(now); // Clonamos la fecha actual

      if (unit.startsWith('segundo')) {
        date.setSeconds(date.getSeconds() - value);
      } else if (unit.startsWith('minuto')) {
        date.setMinutes(date.getMinutes() - value);
      } else if (unit.startsWith('hora')) {
        date.setHours(date.getHours() - value);
      } else if (unit.startsWith('dia') || unit.startsWith('día')) {
        date.setDate(date.getDate() - value);
      } else if (unit.startsWith('mes')) {
        date.setMonth(date.getMonth() - value);
      } else if (unit.startsWith('año') || unit.startsWith('ano')) {
        date.setFullYear(date.getFullYear() - value);
      }

      return date.toISOString();
    }
  }

  // Si no coincide con ningún formato conocido, intentar el parse nativo o lanzar error
  try {
    const fallbackDate = new Date(text);
    if (!isNaN(fallbackDate.getTime())) return fallbackDate.toISOString();
  } catch (e) {
    // No se pudo parsear
  }

  throw new Error(`Formato de fecha no soportado: "${text}"`);
}

class Novelyra implements Plugin.PluginBase {
  id = 'novelyra';
  name = 'Novelyra';
  icon = 'src/es/novelyra/icon.png';
  site = 'https://novelyra.com/';
  version = '1.0.1';
  filters: Filters = {
    genres: {
      type: FilterTypes.Picker,
      label: 'Generos',
      value: '',
      options: [
        { label: 'Todos', value: '' },
        { label: 'Acción', value: 'accion' },
        { label: 'Aventura', value: 'aventura' },
        { label: 'Fantasía', value: 'fantasia' },
        { label: 'Artes Marciales', value: 'artes-marciales' },
        { label: 'Harén', value: 'haren' },
        { label: 'Romance', value: 'romance' },
        { label: 'Sobrenatural', value: 'sobrenatural' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Comedia', value: 'comedia' },
        { label: 'Ciencia Ficción', value: 'ciencia-ficcion' },
        { label: 'Misterio', value: 'misterio' },
        { label: 'Maduro', value: 'maduro' },
        { label: 'Psicológico', value: 'psicologico' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Reencarnación', value: 'reencarnacion' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Vida Escolar', value: 'vida-escolar' },
        { label: 'Josei', value: 'josei' },
        { label: 'Drama', value: 'drama' },
        { label: 'Urbano', value: 'urbano' },
        { label: 'Oriental', value: 'oriental' },
        { label: 'Horror', value: 'horror' },
        { label: 'Tragedia', value: 'tragedia' },
        { label: 'Juegos', value: 'juegos' },
      ],
    },
    browse: {
      type: FilterTypes.Picker,
      label: 'Novelas Populares',
      value: 'browse.php',
      options: [
        { label: 'Todas las Novelas', value: 'browse.php' },
        { label: '🔥 Hoy', value: 'popular.php?period=today' },
        { label: '📅 Este Mes', value: 'popular.php?period=month' },
        { label: '👑 De Siempre', value: 'popular.php?period=alltime' },
      ],
    },
  } satisfies Filters;

  private loadNovels(
    loadedCheerio: CheerioAPI,
    typeNovel: string,
  ): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio(typeNovel).each((_, ele) => {
      const novel = loadedCheerio(ele);
      novels.push({
        name: novel.find('h3').text(),
        path: novel.find('a').attr('href')?.replace(this.site, '') || '',
        cover: novel.find('img').attr('src') || defaultCover,
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
    let url = this.site;
    let typeNovel = '#novelas .novel-card';
    const genre = filters.genres?.value as string;
    const browse = filters.browse?.value as string;
    if (!showLatestNovels) {
      if (browse.startsWith('popular.php')) {
        url = `${this.site}${browse}`;
        typeNovel = '.popular-item';
      } else {
        const params = new URLSearchParams();
        params.append('page', String(pageNo));
        if (genre) {
          params.append('genre', genre);
        }
        url = `${this.site}${browse}?${params.toString()}`;
        typeNovel = '.novels-grid .novel-card';
      }
    }

    const result = await fetchApi(url);
    const body = await result.text();
    const loadedCheerio = loadCheerio(body);

    return this.loadNovels(loadedCheerio, typeNovel);
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    const loadedCheerio = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1').text(),
    };

    novel.cover = loadedCheerio('img').attr('src') || defaultCover;
    novel.genres = loadedCheerio('.novel-meta .novel-genres')
      .text()
      .trim()
      .replace('\n', ', ');

    novel.status = NovelStatus.Completed;
    novel.summary = loadedCheerio('.novel-description-detail').text().trim();

    const chapters: Plugin.ChapterItem[] = [];

    loadedCheerio('.chapter-item-wrapper').each((idx, ele) => {
      const cptr = loadedCheerio(ele);
      const numberText = cptr.find('.chapter-number').text();
      const numberMatch = numberText.match(/(\d+)/);
      const chapterNumber = numberMatch ? parseInt(numberMatch[1]) : 0;
      const chapter: Plugin.ChapterItem = {
        name: cptr.find('.chapter-title').text(),
        path: cptr.find('a').attr('href')?.replace(this.site, '') || '',
        releaseTime: parseSpanishTextToISO(cptr.find('.chapter-date').text()),
        chapterNumber: chapterNumber,
      };
      chapters.push(chapter);
    });

    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const myHeaders = new Headers();
    myHeaders.set(
      'User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    );
    myHeaders.set(
      'Accept',
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    );
    myHeaders.set('Accept-Language', 'es-ES,es;q=0.9');
    myHeaders.set('Referer', this.site);
    myHeaders.set('Cache-Control', 'no-cache');

    const result = await fetchApi(this.site + chapterPath, {
      method: 'GET',
      headers: myHeaders,
    });

    const body = await result.text();

    const loadedCheerio = loadCheerio(body);

    // Quita scripts
    loadedCheerio('script').remove();
    // Quita bloques de anuncios
    loadedCheerio('.chapter-ad').remove();
    // Quita tags de adsense si los hay
    loadedCheerio('ins').remove();

    const chapterText = loadedCheerio('.chapter-content');
    let paragraph: string[] = [];
    const chapterHtml: string[] = [];
    const tagsPermisive: string[] = ['b', 'i', 'u', 'strong', 'em', 'span'];

    chapterText.contents().each((_, element) => {
      switch (element.type) {
        case 'text':
          if (element.data.trim()) {
            paragraph.push(element.data.trim());
          }
          break;
        case 'tag':
          {
            const originalTag = element.tagName;
            if (tagsPermisive.includes(originalTag)) {
              paragraph.push(loadedCheerio.html(element));
            } else {
              if (paragraph.length > 0) {
                chapterHtml.push(`<p>${paragraph.join(' ').trim()}</p>`);
                paragraph = [];
                if (originalTag === 'br') break;
              }
              chapterHtml.push(loadedCheerio.html(element));
            }
          }
          break;
      }
    });
    // Close any remaining paragraph
    if (paragraph.length > 0) {
      chapterHtml.push(`<p>${paragraph.join(' ').trim()}</p>`);
    }
    return chapterHtml.join('');
  }
  async searchNovels(
    searchTerm: string,
    // pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    searchTerm = searchTerm.toLowerCase();

    const url = `${this.site}?search=${encodeURIComponent(searchTerm)}`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = loadCheerio(body);

    const typeNovel = '#novelas .novel-card';

    return this.loadNovels(loadedCheerio, typeNovel);
  }
}

export default new Novelyra();
