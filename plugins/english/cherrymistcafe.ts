import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

// Per-seed PUA substitution tables, solved offline by matching the site's
// cipher webfont glyph outlines against stock Open Sans artwork and verified
// by decoding full chapters to fluent English across all 16 seeds.
// tables[seed].charAt(code - 0xe000) maps U+E000..U+E0FF to plain letters.
const CIPHER_TABLES: Record<number, string> = {
  0: 'lrtjttdQRofisoelnohosassbwehJihzaBhoutilafaiobetneZmwGttPoIUaoarenOLrkeertrCeilaaMhlfvetuothXtqneieesswgcKTbsnctepisuicngdaaVrnsltesnmtxwhrigErdoiprhlerfeodeciAcdaenmahgotuNnateeddaklgymottcfrpnehessryalDnrsmpohteamiyounuvnhiSaFiohWahteiaosYnweddnrdeHiyyst',
  1: 'etcasvneCaocwebotclilJheitVsrodtKFMgyfselnmeowkaohtzWeOhruestsmlaiBrtoiZulrhnqnforfoomLiayheesnusinQiipfijhdTaEtgtetntRmoPoGnwieundIiirhydpetdmatstUdroetdtaadYlleerewhrhAedNHacetehnynotsrahhhavDiernihaSubeXercfamrgaxsasoosneksygdeuaipcpbritnastgowlalentons',
  2: 'CtJccIudjfkasgpqaungdttaxgodfiltsndrtQpglseBcotdeEsnncthhenetittFVweYeloinnpDateGlnsnaoanedldhcAnfaweenahyhekiuarpdeoZthtallrKbtfssetevenaubaiehewdwXliossmriumsnywtofiaosLyynrhoNsiiOtnishrrmzHrtmiMoeebuhotleerTayahrsmdhoeaUrWhaPvocgseoitroooeiSitRhiaarreem',
  3: 'AtlKohadlflaeavaeavRyunonnhnussnJroQiinTtetLgarisdsoaoDabrOcoVwqecdiftnoepSseeNtmailaooeisPusmcWsoinFtgMryeXrtaidywemetbdnahhhgUpErhinneeophztitorYsofeoylekwoHkeaaedhomhruwbcfeuntGpreeitliwlrIcetatyeemgnfatinirsdmxdhaajtssnthZdedertsgeitsrBCuhnlthtchoarlsi',
  4: 'ntPtatngHshhatbrmtkpiaroQvylaoeissnfblhmsefraFVstdIiaterwotmetedarnooOheneysahGwplkjmwnetcJsenlsartcnhtUolaigiYsolnoaebatthpdheotnsomAitadaSfiryodidrgneuesLafdXeEnheirxMZropoednenlcdWerfwiemhorhBcretiiauaeoqcngwzRtsCieteTlNuoauuthicsDsuryKsyoeeidvehnhliagt',
  5: 'acarMsatsnraeuprHtyttohluesrsavayhrensidttewehhfoGlFBNnWmuCosLkItiitkeernoeYeoniidrystsmrpgctmbtsannuSaedopeeejVTuchcniealhesimOZeanrigllrctdgnrhbhalimdaPahqthigncrynReodlohossedoettoiyQUnfetxnaiwttJiDlnootfebrevmwlofaarpsdXiteKdiAsgewefEhhedontaoawzaihosu',
  6: 'gneriilienCacloynmnhshafhsnhiatclcabsBmhooLDstghoeneyarpafnlOrnsJtathtemoioericeeSmrthepHdshcomlbieoqhnuywoefigIhicteiavdotmUisirdenpeaaQGefdettaFootnsnoretnvAkKeYrjufilneipsdtryauTdtaubolguozEeRxtekldortaunhehestswaswrZaoadnhtaVgtresielNwerMrXsWydwdstitaP',
  7: 'ofrirridaotDsgsenpldrfdlrthitrelcnsiohugshtkneHsdonwoenSoogBuaiahesenKspyaeorgaRutdhohbeeanFotdiwsOhigicsnpsnhnVheyttlketersrdpesndZoaWtsrhcniaoeweerjtfXvdyUeccfaCzLmnnmuttMaomrittemotuixawheGabvQAattoinysymetaoroYfieIhhrmatiNTulbelqaasthielaweJaldcPinEeel',
  8: 'wletotniraytoaqrnvliolgrkaueLyVthashtthgCtlflnrtdZregtthclscthterusrtdfefibresiacenJhuSepednomotwttyatiHeespanQxuOrmhainehhheGuworkebdovshaodaecmoewfiraeDhndieseThtXUgdrainoIecjoiWpoaefiAnydeybsPessnismeapcnumaeKrEtaYstoiatrinlnooBddoRswsnmasozFigeaNihllnM',
  9: 'ekalraolooyuemnCvtljsnsrybVslnLcYrfMXlatremiaaDdJnpeEhiewdaeGOcgtwmantoaledstslaQhIbngidetrhtusethnrelidoqiaydisatoipnfaehteweohssurthxdesdkiemoeheweaauigFstmiheelcRormffursnaTieoaectoetsnStobortBhhcrfWscieoawhytodZnsttvnoonheainagzHrreinhpitnKNpPtigAryduU',
  10: 'tsEunattoopphingisfavlKsijxcdthitloaedfoZhntBonthemcsuoayilwhRhfwhtnnsdDVtarthrugneOslenymtbteanlrssefaoimeQFnirpbfeshHbrpcarrdirirPiAoaScrsmsandthiaiowGaMvalLoauehaehcetleydgoaeiagaTrogezenqrcemXdedtiYldoeiehishsweWeeokotntynewttJdraNenoutneeCtousmslkrlyU',
  11: 'intheZredADelneGreocfaeptateeeohIeftmrngrewyuekhXdctCgpgnheingsonaicnslhhdweoosztelioablataaSsotHUPsatOsiytlYnMnreiRwcrsmntstrierJeuhdsaxahhfetbLerlrmnauiyqdlyiwobasttowNEiedshhofodserlkrejruyhfKiieaiiimttWdalsovsdpnFvtBmramnaonsdQottogoccnhtpaVinuaaueoheT',
  12: 'hotedemlooWeahJiayvhyolpfVhihfhNnahrymgletnesonhqlrioanmgGdnmAieetteeasuaYalersevededutdwzrHmtpIeutacothrlbtRawnacednelosUgthriesoeiguPcanparnydhwKdjsunCifsoaBXfabaoiowlhcQeLtstnineehsttdcstterahasrrerMknattnioowislOoZbeFEysniosrfdirgtneTitcmSisioterDkaxpu',
  13: 'odMsGtmtKdwdNTagnawctdraohhlabtmnrjoJsnlaezDeidneeiuotkawnotHedhlehoyebsefisncraXpanrnoetiteerlrenlegmerdesxiepebdorwhnBotusZchnsgrfoenduidstichaaqteAmaoWPhleVtnoiaattoQoeuemtrahutsrthifvsssavkengrsnnpleiargspoftFihaOhhlEtSsheltuyCiaitcYaUolyiowRiymLrefyic',
  14: 'etpictwedrniuoJhureoiRPtIsosrTinsuoEbchorleZeexAndadoauisctsnoHnMolmKenwvrehUtetiBgelgphdahataotfnasYiayvamLoiahsWfjeeltggituOltpuenhrreobeicnaafetwktnohefnshhtyipedgnQesneitkmcsdGyqhsesaoroaaoNsacaSeyzsdmaitFhdttfnmnmdhsryrhCliarirrwteeditelDwlonoeaVbXlrt',
  15: 'ooayeicoeaeocThwcoselxmhtitshdeeFsknudiieaLOlEteopiaaYtnhidjneyiebRsftocucmnseoanantaaQwdfhGsnPbogpVeiiesWndrelihrptZduKtSuwagCegarDsemliorihyatraieeodtclIqtogytMsvsrnedshbrtlryJhaieeHfeoAuogtsNedtsiUnwhpltudinawmfoohfleXhrtlvamskaanntrrnnhtrsmnotBrthazeer',
};

// Seeds whose cipher font carries no 'I' artwork (I and l share the
// l-shaped glyphs there) need a sentence-start l -> I restoration pass.
function decodeCipheredText(content: string, seed: number): string {
  const table = CIPHER_TABLES[seed];
  if (!table) {
    // Passing ciphertext through would show the reader rows of blank glyphs.
    if (/[\ue000-\ue0ff]/.test(content)) {
      throw new Error(
        'Cherry Mist Cafe changed its text cipher (seed ' +
          seed +
          '); this chapter cannot be decoded yet. Read it in WebView.',
      );
    }
    return content;
  }
  let out = '';
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    if (code >= 0xe000 && code <= 0xe0ff) {
      const plain = table.charAt(code - 0xe000);
      out += plain === '?' ? content.charAt(i) : plain;
    } else {
      out += content.charAt(i);
    }
  }
  // A standalone lowercase l is always the pronoun I.
  out = out.replace(/\bl\b/g, 'I');
  if (table.indexOf('I') === -1) {
    // No English word starts with a lowercase l before one of these
    // consonants, so such words are I-words (It, If, In, Is...) wherever they
    // sit, including right after <p>/<em> tags. Tags, comments and entities
    // such as &lt; or dir="ltr" are skipped.
    out = out.replace(
      /(<!--[\s\S]*?-->|<[^>]*>|&[a-z]+;?)|\bl(?=[cdfghjkmnpqrstvwxz])/g,
      function (match, markup) {
        return markup ? match : 'I';
      },
    );
    // A vowel after the l (let, like, look...) is a real l-word even after an
    // ellipsis, so only consonant-led l-words are restored at sentence starts.
    out = out.replace(
      /(^|[.!?…]+["”’\s]*["“‘([]?\s*)(l)(?=[b-df-hj-np-tv-xz])/g,
      function (match, pre, _l, offset, full) {
        const before = full.slice(0, offset).replace(/[\s"”’‘([]+$/, '');
        if (
          /(e\.g\.?|i\.e\.?|mr\.?|mrs\.?|ms\.?|dr\.?|st\.?|vs\.?|etc\.?|\d\.?)$/i.test(
            before,
          )
        ) {
          return match;
        }
        return pre + 'I';
      },
    );
  }
  return out;
}

function toChapterHtml(decoded: string): string {
  const blocks = decoded.split(/\r?\n\s*\r?\n/);
  const html: string[] = [];
  for (const rawBlock of blocks) {
    const block = rawBlock.replace(/^\s+|\s+$/g, '');
    if (!block || block === '&nbsp;') continue;
    if (block.charAt(0) === '<') {
      html.push(block);
    } else {
      html.push('<p>' + block.replace(/\r?\n/g, '<br>') + '</p>');
    }
  }
  return html.join('');
}

type SeriesRow = {
  id: number;
  title: string;
  slug: string;
  cover_thumb_url?: string;
  cover_image_url?: string;
};

type SeriesDetail = SeriesRow & {
  synopsis?: string;
  short_synopsis?: string;
  author_name?: string;
  original_author?: string;
  translator?: { name?: string };
  story_status?: string;
  genres?: string[];
  tags?: string[];
  total_chapters?: number;
};

type ChapterRow = {
  id: number;
  slug: string;
  title: string;
  chapter_number: number | null;
  published_at?: string;
};

type ChapterDetail = {
  id: number;
  slug: string;
  title: string;
  content?: string | null;
  foreword?: string | null;
  afterword?: string | null;
  chapter_number: number | null;
  published_at?: string | null;
  scheduled_at?: string | null;
  coin_price?: number | null;
  paid_locked?: boolean;
  coming_soon?: boolean;
  has_access_password?: boolean;
  cipher?: { seed?: number } | null;
};

class CherryMistCafePlugin implements Plugin.PluginBase {
  id = 'cherrymistcafe';
  name = 'Cherry Mist Cafe';
  icon = 'src/en/cherrymistcafe/icon.png';
  site = 'https://cherrymist.cafe';
  version = '2.0.0';

  private async getJson<T>(url: string): Promise<T> {
    const res = await fetchApi(url);
    if (!res.ok) {
      // The API answers misses with {"error":"Not found"}; without this a
      // removed series parses as an untitled novel with no chapters.
      let reason = res.statusText;
      try {
        reason = ((await res.json()) as { error?: string }).error || reason;
      } catch {
        // Cloudflare error pages are HTML, keep the status text.
      }
      throw new Error(
        'Cherry Mist Cafe request failed (HTTP ' +
          res.status +
          (reason ? ': ' + reason : '') +
          ')',
      );
    }
    return (await res.json()) as T;
  }

  private toNovelItem(row: SeriesRow): Plugin.NovelItem {
    return {
      name: row.title,
      cover: row.cover_thumb_url || row.cover_image_url || defaultCover,
      path: 'series/' + row.slug,
    };
  }

  private seriesList(url: string): Promise<Plugin.NovelItem[]> {
    return this.getJson<{ rows?: SeriesRow[] } | SeriesRow[]>(url).then(
      data => {
        const rows: SeriesRow[] = Array.isArray(data) ? data : data.rows || [];
        return rows.map(row => this.toNovelItem(row));
      },
    );
  }

  async popularNovels(
    pageNo: number,
    options?: Plugin.PopularNovelsOptions<undefined>,
  ): Promise<Plugin.NovelItem[]> {
    const sort = options?.showLatestNovels ? 'latest' : 'popular';
    return this.seriesList(
      this.site + '/api/series?page=' + pageNo + '&limit=20&sort=' + sort,
    );
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = (searchTerm || '').trim();
    if (!term) return [];
    return this.seriesList(
      this.site +
        '/api/series?page=' +
        pageNo +
        '&limit=20&q=' +
        encodeURIComponent(term),
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.replace(/^series\//, '').replace(/\/$/, '');
    const detail: SeriesDetail = await this.getJson(
      this.site + '/api/series/' + slug,
    );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: detail.title,
      cover: detail.cover_image_url || detail.cover_thumb_url || defaultCover,
    };
    novel.author =
      (detail.translator && detail.translator.name) ||
      detail.author_name ||
      detail.original_author ||
      '';
    const genres: string[] = (detail.genres || []).concat(detail.tags || []);
    if (genres.length) novel.genres = genres.join(',');
    novel.summary = detail.synopsis || detail.short_synopsis || '';

    const status = (detail.story_status || '').toLowerCase();
    if (status === 'completed') novel.status = NovelStatus.Completed;
    else if (status === 'hiatus') novel.status = NovelStatus.OnHiatus;
    else novel.status = NovelStatus.Ongoing;

    const chapters: (Plugin.ChapterItem & { order: number })[] = [];
    const perPage = 500;
    let page = 1;
    for (;;) {
      const rows: ChapterRow[] = await this.getJson(
        this.site +
          '/api/chapters?series_id=' +
          detail.id +
          '&limit=' +
          perPage +
          '&page=' +
          page,
      );
      if (!rows || !rows.length) break;
      for (const row of rows) {
        chapters.push({
          name: row.title,
          path: 'chapter/' + row.id + '/' + row.slug,
          chapterNumber:
            typeof row.chapter_number === 'number'
              ? row.chapter_number
              : undefined,
          releaseTime: row.published_at,
          order: chapters.length,
        });
      }
      if (rows.length < perPage) break;
      page++;
      if (page > 10) break;
    }
    // Newer uploads can have a null chapter_number; the API lists those first
    // although they follow the numbered ones, so keep them after in API order.
    chapters.sort((a, b) => {
      const an = a.chapterNumber === undefined ? Infinity : a.chapterNumber;
      const bn = b.chapterNumber === undefined ? Infinity : b.chapterNumber;
      return an === bn ? a.order - b.order : an < bn ? -1 : 1;
    });
    novel.chapters = chapters.map(c => ({
      name: c.name,
      path: c.path,
      chapterNumber: c.chapterNumber,
      releaseTime: c.releaseTime,
    }));
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const segment = (chapterPath.replace(/^chapter\//, '') || '').split('/')[0];
    const id = parseInt(segment, 10);
    if (!id)
      throw new Error('Invalid Cherry Mist Cafe chapter path: ' + chapterPath);
    const detail: ChapterDetail = await this.getJson(
      this.site + '/api/chapters/' + id,
    );
    if (!detail) throw new Error('Cherry Mist Cafe returned no chapter data');
    if (detail.content == null) {
      // Locked chapters come back with content: null and no cipher.
      if (detail.paid_locked) {
        throw new Error(
          'This chapter is coin-locked on Cherry Mist Cafe' +
            (detail.coin_price ? ' (' + detail.coin_price + ' coins)' : '') +
            (detail.coming_soon && detail.scheduled_at
              ? '; scheduled for ' + detail.scheduled_at.slice(0, 10)
              : '') +
            '. Unlock it in WebView.',
        );
      }
      if (detail.has_access_password) {
        throw new Error(
          'This chapter is password-protected on Cherry Mist Cafe. Open it in WebView.',
        );
      }
      throw new Error('Cherry Mist Cafe returned no text for this chapter');
    }
    const seed =
      detail.cipher && typeof detail.cipher.seed === 'number'
        ? detail.cipher.seed
        : -1;
    const parts: string[] = [];
    if (detail.foreword) parts.push(decodeCipheredText(detail.foreword, seed));
    parts.push(decodeCipheredText(detail.content || '', seed));
    if (detail.afterword)
      parts.push(decodeCipheredText(detail.afterword, seed));
    return toChapterHtml(parts.join('\r\n\r\n'));
  }

  resolveUrl = (path: string, isNovel?: boolean) => {
    if (isNovel || path.indexOf('series/') === 0) {
      return this.site + '/story/' + path.replace(/^series\//, '');
    }
    const parts = path.replace(/^chapter\//, '').split('/');
    const slug = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
    return this.site + '/chapter/' + slug;
  };
}

export default new CherryMistCafePlugin();
