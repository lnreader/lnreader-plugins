import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const BASE = 'https://novelmania.com.br';
const API  = `${BASE}/api`;

const JSON_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

type ApiNovelItem = {
  title: string;
  slug: string;
  cover?: { large?: string };
};

type ApiNovelDetail = ApiNovelItem & {
  synopsis?: string;
  author?: string;
  status?: string;
  categories?: { name: string }[];
};

type ApiChapter = {
  title?: string;
  longTitle?: string;
  slug: string;
};

// Category IDs from GET /api/categories
// Format: base64(numeric_id)--hmac_signature
const CATEGORY_IDS: Record<string, string> = {
  acao:              'MQ==--5a499ef3b8d91aa3cb65aa53fb8c3b9e7dc63491',
  adulto:            'Mg==--3edd6783406bb8ea6fea9e69ee1a53221f8c8677',
  antologia:         'Mzk=--fc9d86ba0817da6aeaa6f0b319d42e2ebf06d3fb',
  'artes-marciais':  'Nw==--ebf238927942e0d5b38f24a3c0c010834cc18831',
  aventura:          'Mw==--dc8f9159e95541b096fddfac225e9771f62f38d8',
  comedia:           'NA==--a98f1ec98d64ebbcdcd5476d6ad25077599d33c7',
  conto:             'Mzg=--e76a0af4b1a83a49d1de0d7d3c389c411900e1f8',
  cotidiano:         'MTY=--9fc70df7bd24b284fe9e520288ce69447511897c',
  cultivo:           'NDc=--24a31ae8bda1c325f79008b3790b47ca7db9102d',
  distopia:          'NDE=--938e9afa59a514e61dd3d6cf05d17b26e98f25bb',
  drama:             'MjM=--720b847dc3393c8980802bf669350f9cd1820c88',
  ecchi:             'Mjc=--dd505aa865dde3bfe59b30354521d36af4cd4f45',
  erotico:           'MjI=--6e33800803a227ee79310f4f96ae9aa64a96963b',
  escolar:           'MTM=--96483791476f3c5fa2eb3d1f404e653a7bdb2e81',
  esporte:           'NDg=--f93748b5312e976a729672c2d13684e11fc8c374',
  exploracao:        'NDU=--8456f9b64784d8948d3e5f88ed47fd852a3d9e53',
  fantasia:          'NQ==--dee563c44dc609497fb77efa31e87790f2df9790',
  futurista:         'NDA=--7e196d30b7e0ebc56c2262c87ffc679ce67027aa',
  harem:             'MjE=--ca090876e2b3fda7071d4ecfb0bf20661d41521d',
  historico:         'NDI=--646e80a24ed359541c640ddda9bfe888aa19e952',
  horror:            'NDM=--3ddda0141eb10fff8d52ed336c7c1cf93991905c',
  isekai:            'MzA=--6fc21dc13a5bb7052d027e368b4c0f3c621713fc',
  magia:             'MjY=--af3fa7514514c8310ed4ac7cf5d5968f369f945f',
  mecha:             'OA==--ae005d85f3acff878acb0a42e082ba3f789006fc',
  medieval:          'MzE=--1ff340b6de4b5705107068d3bc7e59a421e7c023',
  militar:           'MjQ=--f762e35f847a412c4d26bc6771c6de837d2e454a',
  misterio:          'OQ==--6a6ecd8163ff655c66e909abda637d1f9156637f',
  mitologia:         'MTA=--ea1dc1d655cd26fdccd855ed18556b15bd46df3a',
  psicologico:       'MTE=--257277ff50641ff1b449c8ddc49827add51b3688',
  punk:              'NDQ=--3c2f2e3cd85d1bf7108efc68baeb5b7aa5dcd771',
  'realidade-virtual': 'MzY=--e63e54c8a22b1c7615caae64bb2a94696bd4ce9e',
  romance:           'MTI=--5c7213eb8fb9755f09d03047d74111ea299660f9',
  'sci-fi':          'MTQ=--92c86eb0f3782f0f72d1df74d3cb6151461bf6fb',
  'sistema-de-jogo': 'MTU=--979dddf096b85ec3a7b308a6c84286403a6b18be',
  sobrenatural:      'MTc=--af1341af226303a427debb258b131a0f0dd54136',
  'super-heroi':     'NDY=--872de17b8d32b7932921bc4a4a80ff4d1e801d0d',
  suspense:          'Mjk=--ffa46a31e5d1a09c2225ebf8fd7ff94611645916',
  terror:            'Ng==--1b3e18488c4b253b9d5e877df512588018f5f756',
  wuxia:             'MTg=--61693f1537dcfaf89b20f4b6b32d2f2492d97c4d',
  xianxia:           'MTk=--9ee4a5e1c6cc7d95bd38b55076610be92ea737cc',
  xuanhuan:          'MjA=--be92102bd756136a9aa5143058b714d1811b2dd7',
  yaoi:              'MzU=--ff0c99b1b88c74382e4215b31981d66fea6de07c',
  yuri:              'Mzc=--13f00e2914197579c5c3f3794c89ed35f27c7d42',
};

function mapStatus(status: string): string {
  switch (status) {
    case 'Ativo':    return NovelStatus.Ongoing;
    case 'Completo': return NovelStatus.Completed;
    case 'Pausado':  return NovelStatus.OnHiatus;
    case 'Parado':   return NovelStatus.OnHiatus;
    default:         return NovelStatus.Unknown;
  }
}

/**
 * Decode a JavaScript-escaped string from the React SSR $R data stream.
 * Handles \x3C, \uXXXX, \", \n, \r, \t, \\ sequences.
 */
function decodeJsString(raw: string): string {
  return raw
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g,  '"')
    .replace(/\\n/g,  '\n')
    .replace(/\\r/g,  '\r')
    .replace(/\\t/g,  '\t')
    .replace(/\\\\/g, '\\');
}

/**
 * Decode HTML entities from the novel synopsis (API returns HTML-encoded text).
 * Handles numeric entities (&#NNNN; &#xHH;) and the most common named entities
 * used in Portuguese text.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g,          (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g,   '&')
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&quot;/g,  '"')
    .replace(/&apos;/g,  "'")
    .replace(/&nbsp;/g,  ' ')
    // Lowercase accented vowels
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú')
    .replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è').replace(/&igrave;/g, 'ì')
    .replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù')
    .replace(/&acirc;/g,  'â').replace(/&ecirc;/g,  'ê').replace(/&icirc;/g,  'î')
    .replace(/&ocirc;/g,  'ô').replace(/&ucirc;/g,  'û')
    .replace(/&auml;/g,   'ä').replace(/&euml;/g,   'ë').replace(/&iuml;/g,   'ï')
    .replace(/&ouml;/g,   'ö').replace(/&uuml;/g,   'ü')
    .replace(/&atilde;/g, 'ã').replace(/&otilde;/g, 'õ')
    .replace(/&ccedil;/g, 'ç').replace(/&ntilde;/g, 'ñ')
    // Uppercase accented vowels
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú')
    .replace(/&Atilde;/g, 'Ã').replace(/&Otilde;/g, 'Õ')
    .replace(/&Ccedil;/g, 'Ç')
    .replace(/&Acirc;/g,  'Â').replace(/&Ecirc;/g,  'Ê').replace(/&Ocirc;/g,  'Ô')
    // Typography
    .replace(/&hellip;/g, '…').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&lsquo;/g,  '\u2018').replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g,  '\u201C').replace(/&rdquo;/g, '\u201D')
    .replace(/&bull;/g,   '•').replace(/&middot;/g, '·')
    .replace(/&trade;/g,  '™').replace(/&copy;/g,   '©').replace(/&reg;/g,    '®');
}

/**
 * Convert HTML synopsis (with <p> tags and HTML entities) to plain text.
 * LNReader renders the summary as plain text, so we strip tags and decode entities.
 */
function cleanSynopsis(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/<br\s*\/?>/gi,  '\n')
    .replace(/<\/p>/gi,       '\n\n')
    .replace(/<p[^>]*>/gi,    '')
    .replace(/<[^>]+>/g,      '')
    .replace(/\r\n/g,         '\n')
    .replace(/\n{3,}/g,       '\n\n')
    .trim();
}

class NovelMania implements Plugin.PluginBase {
  id      = 'novelmania.com.br';
  name    = 'Novel Mania';
  icon    = 'src/pt-br/novelmania/icon.png';
  site    = BASE;
  version = '2.0.1';
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();
    params.set('page', String(pageNo));

    // Category: API requires the internal ID (base64--hmac), not the slug
    const genreSlug = filters?.genres.value;
    if (genreSlug && CATEGORY_IDS[genreSlug]) {
      params.append('categories[]', CATEGORY_IDS[genreSlug]);
    }

    // Status: API expects array param statuses[]
    const status = filters?.status.value;
    if (status) params.append('statuses[]', status);

    // Nationality: API expects array param nationalities[] with capitalized value
    const nat = filters?.type.value;
    if (nat) params.append('nationalities[]', nat);

    const json = await fetchApi(`${API}/novels?${params}`, {
      headers: JSON_HEADERS,
    }).then(r => r.json());

    return (json.data ?? []).map((n: ApiNovelItem) => ({
      name:  n.title,
      cover: n.cover?.large ?? defaultCover,
      path:  `/novels/${n.slug}`,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    // novelPath is like /novels/avatar-do-rei-ar
    const slug = novelPath.split('/').filter(Boolean).pop()!;

    const novelJson = await fetchApi(`${API}/novels/${slug}`, {
      headers: JSON_HEADERS,
    }).then(r => r.json());
    const n = novelJson.data as ApiNovelDetail;

    // Collect all chapters — API paginates (20 items per page)
    const chapters: Plugin.ChapterItem[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const chapJson = await fetchApi(
        `${API}/novels/${slug}/chapters?page=${page}`,
        { headers: JSON_HEADERS },
      ).then(r => r.json());

      const batch: ApiChapter[] = chapJson.data ?? [];
      if (!batch.length) {
        hasMore = false;
      } else {
        for (const ch of batch) {
          chapters.push({
            name: ch.longTitle || ch.title || ch.slug,
            path: `/novels/${slug}/capitulos/${ch.slug}`,
          });
        }
        if (batch.length < 20) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    return {
      path:    novelPath,
      name:    n.title,
      cover:   n.cover?.large ?? defaultCover,
      summary: cleanSynopsis(n.synopsis ?? ''),
      author:  n.author ?? '',
      genres:  (n.categories ?? []).map((c: { name: string }) => c.name).join(','),
      status:  mapStatus(n.status),
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // chapterPath is like /novels/avatar-do-rei-ar/capitulos/volume-1-capitulo-1
    // The chapter JSON API returns 403. Content and metadata are extracted from
    // the React SSR $R data stream embedded in the HTML page.
    const html = await fetchApi(`${BASE}${chapterPath}`).then(r => r.text());

    // --- Extract chapter content ---
    const contentMatch = html.match(/[,{]content:"((?:[^"\\]|\\.)*)"/);
    const content = contentMatch?.[1] ? decodeJsString(contentMatch[1]) : '';

    // --- Extract chapter title from SSR stream ---
    // The chapter object has: ...,updatedAt:"ISO",title:"TITLE",slug:
    // First match in the stream is always the current chapter (not next/prev).
    const titleMatch = html.match(/updatedAt:"[^"]+",title:"((?:[^"\\]|\\.)*)",slug:/);
    const chapterTitle = titleMatch?.[1] ? decodeJsString(titleMatch[1]) : '';

    // --- Extract volume name from longTitle ("Volume 1 \u2013 Cap\u00edtulo 1") ---
    // \u2013 = em-dash (U+2013); avoid encoding issues by using the code point.
    const longTitleMatch = html.match(/longTitle:"((?:[^"\\]|\\.)*)"/);
    const longTitle = longTitleMatch?.[1] ? decodeJsString(longTitleMatch[1]) : '';
    let volumeName = longTitle.split(/\s*[\u2013-]\s*/)[0]?.trim() ?? '';

    // --- Fallback: derive volume + short chapter label from og:title meta tag ---
    // og:title format: "Volume 1 – Capítulo 1 – Novel Name"
    let fallbackTitle = '';
    if (!longTitle) {
      const ogMatch = html.match(/og:title[^>]*content="([^"]+)"/);
      if (ogMatch?.[1]) {
        const parts = ogMatch[1].split(/\s*[\u2013-]\s*/);
        if (parts.length >= 2) {
          volumeName  = parts[0]?.trim() ?? '';
          fallbackTitle = parts[1]?.trim() ?? '';
        }
      }
    }

    const displayTitle = chapterTitle || fallbackTitle;

    // --- Extract translator usernames from translators:$R[N]=[{username:"X"},...] ---
    // Uses exec loop (wider engine compatibility than matchAll).
    const translators: string[] = [];
    const transIdx = html.indexOf('translators:$R[');
    if (transIdx !== -1) {
      const chunk = html.slice(transIdx, transIdx + 500);
      const reUser = /username:"((?:[^"\\]|\\.)*)"/g;
      let mu: RegExpExecArray | null;
      while ((mu = reUser.exec(chunk)) !== null) {
        const name = decodeJsString(mu[1]);
        if (name && !translators.includes(name)) translators.push(name);
      }
    }

    // --- Build header HTML (mirrors the website layout) ---
    const parts: string[] = [];
    if (volumeName) {
      parts.push(
        '<p style="text-transform:uppercase;font-weight:bold;font-size:0.8em;' +
        'letter-spacing:0.08em;margin:0 0 6px 0;opacity:0.7">' +
        volumeName + '</p>',
      );
    }
    if (displayTitle) {
      parts.push(
        '<h2 style="margin:0 0 10px 0;font-size:1.25em">' +
        displayTitle + '</h2>',
      );
    }
    if (translators.length > 0) {
      parts.push(
        '<p style="font-size:0.85em;margin:0">Tradução: ' +
        translators.join(', ') + '</p>',
      );
    }

    const header = parts.length > 0
      ? '<div style="margin-bottom:20px">' + parts.join('') + '</div>' +
        '<hr style="margin-bottom:20px"/>'
      : '';

    return header + content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // Search param is "q" (not "titulo")
    const params = new URLSearchParams();
    params.set('q', searchTerm);
    params.set('page', String(pageNo));

    const json = await fetchApi(`${API}/novels?${params}`, {
      headers: JSON_HEADERS,
    }).then(r => r.json());

    return (json.data ?? []).map((n: ApiNovelItem) => ({
      name:  n.title,
      cover: n.cover?.large ?? defaultCover,
      path:  `/novels/${n.slug}`,
    }));
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    isNovel ? `${BASE}${path}` : `${BASE}${path}`;

  filters = {
    genres: {
      value: '',
      label: 'Gêneros',
      options: [
        { label: 'Todos',              value: '' },
        { label: 'Ação',               value: 'acao' },
        { label: 'Adulto',             value: 'adulto' },
        { label: 'Antologia',          value: 'antologia' },
        { label: 'Artes Marciais',     value: 'artes-marciais' },
        { label: 'Aventura',           value: 'aventura' },
        { label: 'Comédia',            value: 'comedia' },
        { label: 'Conto',              value: 'conto' },
        { label: 'Cotidiano',          value: 'cotidiano' },
        { label: 'Cultivo',            value: 'cultivo' },
        { label: 'Distopia',           value: 'distopia' },
        { label: 'Drama',              value: 'drama' },
        { label: 'Ecchi',              value: 'ecchi' },
        { label: 'Erótico',            value: 'erotico' },
        { label: 'Escolar',            value: 'escolar' },
        { label: 'Esporte',            value: 'esporte' },
        { label: 'Exploração',         value: 'exploracao' },
        { label: 'Fantasia',           value: 'fantasia' },
        { label: 'Futurista',          value: 'futurista' },
        { label: 'Harém',              value: 'harem' },
        { label: 'Histórico',          value: 'historico' },
        { label: 'Horror',             value: 'horror' },
        { label: 'Isekai',             value: 'isekai' },
        { label: 'Magia',              value: 'magia' },
        { label: 'Mecha',              value: 'mecha' },
        { label: 'Medieval',           value: 'medieval' },
        { label: 'Militar',            value: 'militar' },
        { label: 'Mistério',           value: 'misterio' },
        { label: 'Mitologia',          value: 'mitologia' },
        { label: 'Psicológico',        value: 'psicologico' },
        { label: 'Punk',               value: 'punk' },
        { label: 'Realidade Virtual',  value: 'realidade-virtual' },
        { label: 'Romance',            value: 'romance' },
        { label: 'Sci-fi',             value: 'sci-fi' },
        { label: 'Sistema de Jogo',    value: 'sistema-de-jogo' },
        { label: 'Sobrenatural',       value: 'sobrenatural' },
        { label: 'Super-Herói',        value: 'super-heroi' },
        { label: 'Suspense',           value: 'suspense' },
        { label: 'Terror',             value: 'terror' },
        { label: 'Wuxia',              value: 'wuxia' },
        { label: 'Xianxia',            value: 'xianxia' },
        { label: 'Xuanhuan',           value: 'xuanhuan' },
        { label: 'Yaoi',               value: 'yaoi' },
        { label: 'Yuri',               value: 'yuri' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Status',
      value: '',
      options: [
        { label: 'Todos',    value: '' },
        { label: 'Ativo',    value: 'Ativo' },
        { label: 'Completo', value: 'Completo' },
        { label: 'Pausado',  value: 'Pausado' },
        { label: 'Parado',   value: 'Parado' },
      ],
      type: FilterTypes.Picker,
    },
    type: {
      label: 'Tipo / Nacionalidade',
      value: '',
      options: [
        { label: 'Todas',      value: '' },
        { label: 'Americana',  value: 'Americana' },
        { label: 'Angolana',   value: 'Angolana' },
        { label: 'Brasileira', value: 'Brasileira' },
        { label: 'Chinesa',    value: 'Chinesa' },
        { label: 'Coreana',    value: 'Coreana' },
        { label: 'Japonesa',   value: 'Japonesa' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new NovelMania();
