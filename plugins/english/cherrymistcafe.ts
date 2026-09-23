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
  if (!table) return content;
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
    out = out.replace(
      /(^|[.!?…]+["”’\s]*["“‘([]?\s*)(l)(?=[a-z])/g,
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
  chapter_number: number;
  published_at?: string;
};

type ChapterDetail = {
  id: number;
  slug: string;
  title: string;
  content?: string;
  foreword?: string;
  afterword?: string;
  chapter_number: number;
  published_at?: string;
  cipher?: { seed?: number };
};

class CherryMistCafePlugin implements Plugin.PluginBase {
  id = 'cherrymistcafe';
  name = 'Cherry Mist Cafe';
  icon = 'src/en/cherrymistcafe/icon.png';
  site = 'https://cherrymist.cafe';
  version = '1.0.0';

  private async getJson<T>(url: string): Promise<T> {
    const res = await fetchApi(url);
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

    const chapters: Plugin.ChapterItem[] = [];
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
          chapterNumber: row.chapter_number,
          releaseTime: row.published_at,
        });
      }
      if (rows.length < perPage) break;
      page++;
      if (page > 10) break;
    }
    chapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const segment = (chapterPath.replace(/^chapter\//, '') || '').split('/')[0];
    const id = parseInt(segment, 10);
    if (!id) return '';
    const detail: ChapterDetail = await this.getJson(
      this.site + '/api/chapters/' + id,
    );
    if (!detail) return '';
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
