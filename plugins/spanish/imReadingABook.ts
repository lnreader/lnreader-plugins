import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';

/**
 * Plugin para I'm Reading A Book (imreadingabook.com)
 * Sitio de traducción de novelas ligeras al español (Coreanas, Chinas, Japonesas).
 *
 * Estructura del sitio:
 * - Es un WordPress. Los "novels" son páginas estáticas con una tabla de capítulos.
 * - La lista maestra de novelas está en /nuestros-proyectos/
 * - Los capítulos son posts normales de WordPress.
 * - La búsqueda usa el query param ?s=término
 *
 * Notas para futuros contribuidores:
 * - El sitio NO tiene una página de listado paginado de novelas con portadas.
 *   popularNovels() parsea /nuestros-proyectos/ para obtener el índice completo.
 * - El estado ("Activa", "Finalizada", "Hiatus") está inline en el texto del link.
 * - Las portadas se obtienen desde el og:image de cada página de novela.
 * - Los capítulos se listan en una tabla (<table>) dentro del entry-content de la página de la novela.
 */ // v1.0.0

class ImReadingABookPlugin implements Plugin.PluginBase {
  id = 'imreadingabook';
  name = "I'm Reading A Book";
  icon = 'src/es/imreadingabook/icon.png';
  site = 'https://www.imreadingabook.com';
  version = '1.0.0';
  filters = undefined;

  /**
   * popularNovels: parsea la página /nuestros-proyectos/ que tiene el listado
   * completo de todas las novelas del sitio. Solo existe una página (sin paginación),
   * así que pageNo > 1 devuelve vacío.
   */
  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // Si el usuario pide recientes, usamos la home que lista los últimos capítulos
    // y extraemos los títulos únicos de las novelas.
    if (showLatestNovels) {
      return this.fetchLatestNovels(pageNo);
    }

    // Solo hay una "página" para el listado maestro
    if (pageNo > 1) return [];

    const url = `${this.site}/nuestros-proyectos/`;
    const result = await fetchApi(url);
    const body = await result.text();
    const $ = loadCheerio(body);

    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    // Los links de novelas están dentro del .entry-content como <a href="...">
    // con texto que incluye estado entre guiones: "Finalizada – Título"
    $('.entry-content a').each((_i, el) => {
      const href = $(el).attr('href') || '';
      const rawText = $(el).text().trim();

      // Filtrar links que no sean de novelas del sitio principal
      if (
        !href.startsWith('https://imreadingabook.com') &&
        !href.startsWith('https://www.imreadingabook.com')
      ) {
        return;
      }

      // Excluir links de mynovel.club (contenido R18 externo)
      if (href.includes('mynovel.club')) return;

      // Excluir links de páginas de categorías o navegación
      const excluded = [
        '/traducciones',
        '/nuestros-proyectos',
        '/chinas',
        '/coreanas',
        '/japonesas',
        '/finalizadas',
        '/one-shot',
        '/originales',
        '/accion',
        '/blog',
        '/recomendaciones',
        '/escritura',
        '/libro-3',
      ];
      if (excluded.some(p => href.includes(p))) return;

      // El texto puede ser "Finalizada – Título" o solo "Título"
      // Eliminamos el prefijo de estado si existe
      const name = rawText
        .replace(/^(Finaliz[ao]da|Activa|Hiatus|Finalizado)\s*[–-]\s*/i, '')
        .trim();

      if (!name || name.length < 3) return;

      // Construir path relativo desde la URL completa
      let path: string;
      try {
        const urlObj = new URL(href);
        path = urlObj.pathname;
      } catch {
        return;
      }

      if (seen.has(path)) return;
      seen.add(path);

      novels.push({
        name,
        path,
        cover: defaultCover,
      });
    });

    return novels;
  }

  /**
   * Obtiene las novelas más recientes desde la home del sitio.
   * La home lista los últimos capítulos publicados; intentamos agrupar por novela.
   */
  private async fetchLatestNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const url = pageNo > 1 ? `${this.site}/page/${pageNo}/` : `${this.site}/`;
    const result = await fetchApi(url);
    const body = await result.text();
    const $ = loadCheerio(body);

    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    // Cada post en la home tiene una imagen y un título de capítulo.
    // No es posible mapear fácilmente a la página de la novela desde aquí,
    // así que devolvemos los posts recientes como ítems (cada uno es un capítulo).
    // El usuario podrá abrir la novela desde el detalle.
    $('article').each((_i, el) => {
      const titleEl = $(el).find('h2 a, h1 a').first();
      const name = titleEl.text().trim();
      const href = titleEl.attr('href') || '';
      const cover =
        $(el).find('img').first().attr('src') ||
        $(el).find('img').first().attr('data-src') ||
        defaultCover;

      if (!name || !href) return;

      let path: string;
      try {
        path = new URL(href).pathname;
      } catch {
        return;
      }

      if (seen.has(path)) return;
      seen.add(path);

      novels.push({ name, path, cover });
    });

    return novels;
  }

  /**
   * parseNovel: parsea la página dedicada de una novela.
   *
   * La página de cada novela en imreadingabook contiene:
   * - Imagen de portada (primer <img> del entry-content o og:image)
   * - Metadatos: Idioma Original, Estado, Otros Nombres, Sinopsis
   * - Una tabla con los capítulos disponibles como links
   *
   * Ejemplo de URL de novela: /bienvenido-a-dungeon-hotel/
   */
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const result = await fetchApi(url);
    const body = await result.text();
    const $ = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        $('h1.entry-title, h1.wp-block-heading').first().text().trim() ||
        'Sin título',
    };

    // Portada: primero intentamos la og:image del <head>
    const ogImage = $('meta[property="og:image"]').attr('content');
    novel.cover =
      ogImage || $('article img').first().attr('src') || defaultCover;

    // Parsear el contenido de la página de la novela
    const content = $('.entry-content');

    // El sitio usa formato "Clave: Valor" en texto o en párrafos con <strong>
    // Buscamos texto "Estado:" para determinar el estado de la novela
    const fullText = content.text();

    // Estado
    const estadoMatch = fullText.match(
      /Estado\s*:\s*(Activa|Finaliz[ao]da|Hiatus|En\s*proceso)/i,
    );
    if (estadoMatch) {
      const estado = estadoMatch[1].toLowerCase();
      if (estado.includes('finaliz')) {
        novel.status = NovelStatus.Completed;
      } else if (estado === 'activa' || estado.includes('proceso')) {
        novel.status = NovelStatus.Ongoing;
      } else if (estado === 'hiatus') {
        novel.status = NovelStatus.OnHiatus;
      }
    }

    // Sinopsis: buscamos el párrafo después de "Sinopsis:"
    const sinopsisMatch = fullText.match(
      /Sinopsis\s*:([\s\S]*?)(?=\||\n\n\n|$)/i,
    );
    if (sinopsisMatch) {
      novel.summary = sinopsisMatch[1]
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 2000); // limitar largo
    }

    // Géneros: las categorías del post están en el header del artículo
    // Ejemplo: "/ Acción, Aventura, Comedia, Drama, Fantasía, Romántico /"
    const categories: string[] = [];
    $('a[rel="category tag"], .cat-links a').each((_i, el) => {
      categories.push($(el).text().trim());
    });
    if (categories.length > 0) {
      novel.genres = categories.join(', ');
    }

    // Autor/Traductor: el sitio muestra el autor del post (traductor)
    const authorEl = $('a[rel="author"], .author a').first();
    if (authorEl.length) {
      novel.author = 'Trad: ' + authorEl.text().trim();
    }

    // ---- Parsear capítulos ----
    const chapters: Plugin.ChapterItem[] = [];

    /**
     * Los capítulos están en una tabla HTML dentro del entry-content.
     * Cada celda <td> puede contener:
     *   - Un <a href="..."> con el nombre del capítulo (capítulo disponible)
     *   - Solo texto sin link (capítulo no publicado aún)
     *
     * Ejemplo:
     *   | 01 | 02 | 03 |
     *   | 04 | 05 | 06 |
     */
    content.find('table td a').each((i, el) => {
      const chapterHref = $(el).attr('href') || '';
      const chapterName = $(el).text().trim();

      if (!chapterHref || !chapterName) return;

      // Solo capítulos del mismo dominio
      if (
        !chapterHref.startsWith('https://imreadingabook.com') &&
        !chapterHref.startsWith('https://www.imreadingabook.com')
      ) {
        return;
      }

      let chapterPath: string;
      try {
        chapterPath = new URL(chapterHref).pathname;
      } catch {
        return;
      }

      // Intentar extraer número de capítulo del texto
      const numMatch = chapterName.match(/\d+/);
      const chapterNumber = numMatch ? parseInt(numMatch[0], 10) : i + 1;

      chapters.push({
        name: chapterName,
        path: chapterPath,
        releaseTime: null,
        chapterNumber,
      });
    });

    // Ordenar por número de capítulo (ascendente)
    chapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));

    novel.chapters = chapters;
    return novel;
  }

  /**
   * parseChapter: obtiene el texto de un capítulo.
   *
   * Los capítulos son posts de WordPress. El contenido está en .entry-content.
   * Eliminamos: imágenes de portada al inicio, botones de navegación,
   * widgets de likes, y cualquier script/iframe.
   */
  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const result = await fetchApi(url);
    const body = await result.text();
    const $ = loadCheerio(body);

    const content = $('.entry-content');

    // Eliminar elementos no deseados dentro del contenido
    content
      .find('script, style, iframe, .sharedaddy, .jp-relatedposts')
      .remove();
    content.find('.wp-block-image, figure').first().remove(); // portada al inicio

    // Limpiar enlaces internos de navegación (← Entrada anterior / siguiente →)
    // Estos están fuera del entry-content normalmente, pero por si acaso:
    $(
      'a:contains("Entrada anterior"), a:contains("Entrada siguiente")',
    ).remove();

    // Obtener el HTML limpio
    const chapterText = content.html() || '';

    return chapterText;
  }

  /**
   * searchNovels: búsqueda usando el motor de WordPress.
   *
   * URL: https://www.imreadingabook.com/?s=término&page=N
   *
   * Los resultados son posts (capítulos y entradas de blog mezclados),
   * así que filtramos para intentar devolver solo páginas de novelas.
   * Esto es una limitación del sitio ya que no tiene búsqueda separada por tipo.
   */
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const encodedTerm = encodeURIComponent(searchTerm);
    const url =
      pageNo > 1
        ? `${this.site}/page/${pageNo}/?s=${encodedTerm}`
        : `${this.site}/?s=${encodedTerm}`;

    const result = await fetchApi(url);
    const body = await result.text();
    const $ = loadCheerio(body);

    const novels: Plugin.NovelItem[] = [];

    $('article').each((_i, el) => {
      const titleEl = $(el).find('h2 a, h1 a').first();
      const name = titleEl.text().trim();
      const href = titleEl.attr('href') || '';
      const cover =
        $(el).find('img').first().attr('src') ||
        $(el).find('img').first().attr('data-src') ||
        defaultCover;

      if (!name || !href) return;

      let path: string;
      try {
        path = new URL(href).pathname;
      } catch {
        return;
      }

      novels.push({ name, path, cover });
    });

    return novels;
  }

  /**
   * resolveUrl: construye la URL completa desde un path relativo.
   * LNReader la usa internamente en algunos contextos.
   */
  resolveUrl = (path: string, _isNovel?: boolean) => this.site + path;
}

export default new ImReadingABookPlugin();
