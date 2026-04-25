import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

class NovelBuddy implements Plugin.PagePlugin {
  id = 'novelbuddy';
  name = 'NovelBuddy';
  site = 'https://novelbuddy.com/';
  api = 'https://api.novelbuddy.com/';
  version = '2.1.2';
  icon = 'src/en/novelbuddy/icon.png';

  parseNovels(body: Response): Plugin.NovelItem[] {
    return body.data.items.map(item => ({
      name: item.name,
      path: new URL(item.url, this.site).pathname.substring(1),
      cover: item.cover,
    }));
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const { genre, min_ch, max_ch, status, demo, orderBy, keyword } = filters;

    // Chapter bounds must be an integer between 0 and 10,000 or api cri
    const parseNumber = (val?: string) => {
      if (!val?.trim()) return;

      const n = Number(val);
      return Number.isInteger(n) && n >= 0 && n <= 10000
        ? String(n)
        : undefined;
    };

    const rawParams: Record<string, string | undefined> = {
      genres: genre.value.include?.join(',') || undefined,
      exclude: genre.value.exclude?.join(',') || undefined,
      min_ch: parseNumber(min_ch.value),
      max_ch: parseNumber(max_ch.value),
      status: String(status.value),
      demographic: demo.value?.join(',') || undefined,
      sort: String(orderBy.value),
      page: String(pageNo),
      limit: '24',
      q: keyword.value || undefined,
    };

    // Filter out the undefined values
    const params = Object.fromEntries(
      Object.entries(rawParams).filter(([, value]) => value !== undefined),
    ) as Record<string, string>;

    const url = new URL('titles/search', this.api);
    url.search = new URLSearchParams(params).toString();

    const result = await fetchApi(url.toString());
    const body = await result.json();

    return this.parseNovels(body);
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const response = await fetchApi(this.site + novelPath);
    const body = await response.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could find __NEXT_DATA__');

    const data: NovelScript = JSON.parse(script);
    const initialManga = data.props.pageProps.initialManga;

    if (!initialManga) throw new Error('Could not find initialManga data');

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: initialManga.name || 'Untitled',
      cover: initialManga.cover,
      author: initialManga.authors?.map(a => a.name).join(', ') || '',
      artist: initialManga.artists?.map(a => a.name).join(', ') || '',
      genres: initialManga.genres?.map(g => g.name).join(',') || '',
      chapters: [],
      totalPages: 1,
    };

    const rawStatus = initialManga.status;
    const map: Record<string, string> = {
      ongoing: NovelStatus.Ongoing,
      hiatus: NovelStatus.OnHiatus,
      dropped: NovelStatus.Cancelled,
      cancelled: NovelStatus.Cancelled,
      completed: NovelStatus.Completed,
      unknown: NovelStatus.Unknown,
    };
    novel.status = map[rawStatus.toLowerCase()] ?? NovelStatus.Unknown;

    const summary = $(initialManga.summary || '');
    summary.find('br').replaceWith('\n');
    summary.find('p').before('\n').after('\n\n');

    novel.summary =
      summary
        .text()
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        ?.replace(/\n{3,}/g, '\n\n')
        .trim() || 'Summary Not Found';

    if (initialManga.ratingStats) {
      novel.rating = initialManga.ratingStats.average;
    }

    // Fetch full chapter list from API
    const chaptersUrl = `${this.api}titles/${initialManga.id}/chapters`;
    const chaptersResponse = await fetchApi(chaptersUrl);
    const chaptersJson: ChapterResponse = await chaptersResponse.json();

    let allChapters: Plugin.ChapterItem[] = [];
    if (chaptersJson?.success && chaptersJson?.data?.chapters) {
      allChapters = chaptersJson.data.chapters
        .map(chapter => ({
          name: chapter.name,
          path: new URL(chapter.url, this.site).pathname.substring(1),
          releaseTime: chapter.updated_at,
        }))
        .reverse();
    } else if (initialManga.chapters) {
      allChapters = initialManga.chapters
        .map(chapter => ({
          name: chapter.name,
          path: new URL(chapter.url, this.site).pathname.substring(1),
          releaseTime: chapter.updatedAt,
        }))
        .reverse();
    }

    const chaptersPerPage = 50;
    novel.totalPages = Math.ceil(allChapters.length / chaptersPerPage);
    novel.chapters = allChapters
      .slice(0, chaptersPerPage)
      .map(c => ({ ...c, page: '1' }));

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const response = await fetchApi(this.site + novelPath);
    const body = await response.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could find __NEXT_DATA__');

    const data: NovelScript = JSON.parse(script);
    const initialManga = data.props.pageProps.initialManga;

    const chaptersUrl = `${this.api}titles/${initialManga.id}/chapters`;
    const chaptersResponse = await fetchApi(chaptersUrl);
    const chaptersJson: ChapterResponse = await chaptersResponse.json();

    let allChapters: Plugin.ChapterItem[] = [];
    if (chaptersJson?.success && chaptersJson?.data?.chapters) {
      allChapters = chaptersJson.data.chapters
        .map(chapter => ({
          name: chapter.name,
          path: new URL(chapter.url, this.site).pathname.substring(1),
          releaseTime: chapter.updated_at,
        }))
        .reverse();
    } else if (initialManga.chapters) {
      allChapters = initialManga.chapters
        .map(chapter => ({
          name: chapter.name,
          path: new URL(chapter.url, this.site).pathname.substring(1),
          releaseTime: chapter.updatedAt,
        }))
        .reverse();
    }

    const pageNo = parseInt(page);
    const chaptersPerPage = 50;
    const start = (pageNo - 1) * chaptersPerPage;
    const end = start + chaptersPerPage;

    return {
      chapters: allChapters.slice(start, end).map(c => ({ ...c, page })),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could not find __NEXT_DATA__');

    const data: ChapterScript = JSON.parse(script);
    const initialChapter = data.props.pageProps.initialChapter;
    if (!initialChapter) throw new Error('Could not find chapter content');

    let content = initialChapter.content;

    if (content) {
      // Remove Webnovel watermarks/ads
      content = content.replace(
        /Find authorized novels in Webnovel.*?faster updates, better experience.*?Please click www\.webnovel\.com for visiting\./gi,
        '',
      );

      // Remove obfuscated freewebnovel watermarks using the project's specialized regex (Safe for GitHub Actions)
      const fwnRegex = new RegExp('(?:\\u{d835}\\u{dc1f}|\\u{1d6e}|\\u{d835}\\u{dc53}|\\u{d835}\\u{dc87}|\\u{d835}\\u{dcbb}|\\u{d835}\\u{dcef}|\\u{d835}\\u{dd23}|\\u{d835}\\u{dd57}|\\u{d835}\\u{ddbf}|\\u{d835}\\u{ddf3}|\\u{d835}\\u{de5b}|\\u{d835}\\u{de8f}|\\u{ab35}|\\u{a799}|\\u{1e9d}|\\u{d835}\\u{dd8b}|\\u{24d5}|\\u{ff46}|\\u{192}|\\u{1e1f}|\\u{283}|\\u{562}|\\u{1da0}|\\u{24a1}|\\u{17f}|\\u{a2b0}|\\u{284}|\\u{2231}|\\u{1d82}|\\u{d835}\\u{de27}|\\\\bf)(?:\\u{d835}\\u{de9b}|\\u{ab47}|\\u{18f4}|\\u{213e}|\\u{d835}\\u{deaa}|\\u{d835}\\u{dee4}|\\u{d835}\\u{df1e}|\\u{d835}\\u{df58}|\\u{d835}\\u{df92}|\\u{2c84}|\\u{413}|\\u{13b1}|\\u{14a5}|\\u{ab48}|\\u{2c85}|\\u{ab81}|\\u{24e1}|\\u{ff52}|\\u{155}|\\u{1e59}|\\u{159}|\\u{211}|\\u{213}|\\u{1e5b}|\\u{1e5d}|\\u{157}|\\u{433}|\\u{550}|\\u{27e}|\\u{196c}|\\u{1e5f}|\\u{24d}|\\u{2b3}|\\u{24ad}|\\u{27c}|\\u{453}|\\u{1d26}|\\u{1d89}|\\u{d835}\\u{dc2b}|\\u{d835}\\u{dc5f}|\\u{d835}\\u{dc93}|\\u{d835}\\u{dcc7}|\\u{d835}\\u{dcfb}|\\u{d835}\\u{dd2f}|\\u{d835}\\u{dd63}|\\u{d835}\\u{dd97}|\\u{d835}\\u{ddcb}|\\u{d835}\\u{ddff}|\\u{d835}\\u{de33}|\\u{d835}\\u{de67}|\\u{1d72}|\\u{491}|\\u{1d63}|r)(?:\\u{259}|\\u{4d9}|\\u{2147}|\\u{ab32}|\\u{a793}|\\u{22f4}|\\u{d835}\\u{dec6}|\\u{d835}\\u{dedc}|\\u{d835}\\u{df00}|\\u{d835}\\u{df16}|\\u{d835}\\u{df3a}|\\u{d835}\\u{df50}|\\u{d835}\\u{df74}|\\u{d835}\\u{df8a}|\\u{d835}\\u{dfae}|\\u{d835}\\u{dfc4}|\\u{2c89}|\\u{ab9b}|\\u{d801}\\u{dc29}|\\u{a792}|\\u{2c88}|\\u{2377}|\\u{d835}\\u{dc52}|\\u{d835}\\u{dcee}|\\u{d835}\\u{dd56}|\\u{d835}\\u{dd8a}|\\u{d835}\\u{de26}|\\u{d835}\\u{ddf2}|\\u{d835}\\u{de8e}|\\u{d835}\\u{de5a}|\\u{d835}\\u{dc86}|\\u{d835}\\u{dd22}|\\u{d835}\\u{ddbe}|\\u{d835}\\u{dc1e}|\\u{4be}|\\u{4bf}|\\u{24d4}|\\u{ff45}|\\u{24a0}|\\u{e8}|\\u{19c9}|\\u{e9}|\\u{1d92}|\\u{ea}|\\u{258}|\\u{1f14}|\\u{1ec1}|\\u{1ebf}|\\u{1ec5}|\\u{aef}|\\u{1dd}|\\u{454}|\\u{3b5}|\\u{113}|\\u{4bd}|\\u{25b}|\\u{1ec3}|\\u{1ebd}|\\u{1e15}|\\u{1e17}|\\u{115}|\\u{117}|\\u{eb}|\\u{1ebb}|\\u{11b}|\\u{205}|\\u{207}|\\u{1eb9}|\\u{1ec7}|\\u{229}|\\u{247}|\\u{2091}|\\u{119}|\\u{1e1d}|\\u{1e19}|\\u{1e1b}|\\u{212e}|\\u{435}|\\u{511}|\\u{450}|\\u{4d7}|\\u{1971}|\\u{451}|\\u{1f10}|\\u{1f11}|\\u{1f12}|\\u{1f13}|\\u{1f15}|\\u{212f}|e)+(?:\\u{d835}\\u{dc30}|\\u{a761}|\\u{d835}\\u{dc64}|\\u{d835}\\u{dc98}|\\u{d835}\\u{dccc}|\\u{d835}\\u{dd00}|\\u{d835}\\u{dd34}|\\u{d835}\\u{dd68}|\\u{d835}\\u{dd9c}|\\u{d835}\\u{ddd0}|\\u{d835}\\u{de04}|\\u{d835}\\u{de38}|\\u{d835}\\u{de6c}|\\u{d835}\\u{dea0}|\\u{561}|\\u{1e81}|\\u{ab83}|\\u{1e83}|\\u{24e6}|\\u{2375}|\\u{175}|\\u{1e87}|\\u{1e85}|\\u{1e98}|\\u{1e89}|\\u{2c73}|\\u{1f7c}|\\u{1f60}|\\u{1f61}|\\u{1f62}|\\u{1f63}|\\u{3c9}|\\u{1f64}|\\u{1f65}|\\u{1f66}|\\u{1f67}|\\u{1ff2}|\\u{1ff3}|\\u{1ff4}|\\u{1ff6}|\\u{1ff7}|\\u{2c72}|\\u{461}|\\u{51d}|\\u{1d21}|\\u{1f7d}|\\u{1fa0}|\\u{1fa1}|\\u{1fa2}|\\u{1fa3}|\\u{1fa4}|\\u{1fa5}|\\u{1fa6}|\\u{26f}|\\u{d835}\\u{df55}|\\u{d835}\\u{dfc9}|\\u{d835}\\u{df8f}|w)(?:\\u{259}|\\u{4d9}|\\u{2147}|\\u{ab32}|\\u{a793}|\\u{22f4}|\\u{d835}\\u{dec6}|\\u{d835}\\u{dedc}|\\u{d835}\\u{df00}|\\u{d835}\\u{df16}|\\u{d835}\\u{df3a}|\\u{d835}\\u{df50}|\\u{d835}\\u{df74}|\\u{d835}\\u{df8a}|\\u{d835}\\u{dfae}|\\u{d835}\\u{dfc4}|\\u{2c89}|\\u{ab9b}|\\u{d801}\\u{dc29}|\\u{a792}|\\u{2c88}|\\u{2377}|\\u{d835}\\u{dc52}|\\u{d835}\\u{dcee}|\\u{d835}\\u{dd56}|\\u{d835}\\u{dd8a}|\\u{d835}\\u{de26}|\\u{d835}\\u{ddf2}|\\u{d835}\\u{de8e}|\\u{d835}\\u{de5a}|\\u{d835}\\u{dc86}|\\u{d835}\\u{dd22}|\\u{d835}\\u{ddbe}|\\u{d835}\\u{dc1e}|\\u{4be}|\\u{4bf}|\\u{24d4}|\\u{ff45}|\\u{24a0}|\\u{e8}|\\u{19c9}|\\u{e9}|\\u{1d92}|\\u{ea}|\\u{258}|\\u{1f14}|\\u{1ec1}|\\u{1ebf}|\\u{1ec5}|\\u{aef}|\\u{1dd}|\\u{454}|\\u{3b5}|\\u{113}|\\u{4bd}|\\u{25b}|\\u{1ec3}|\\u{1ebd}|\\u{1e15}|\\u{1e17}|\\u{115}|\\u{117}|\\u{eb}|\\u{1ebb}|\\u{11b}|\\u{205}|\\u{207}|\\u{1eb9}|\\u{1ec7}|\\u{229}|\\u{247}|\\u{2091}|\\u{119}|\\u{1e1d}|\\u{1e19}|\\u{1e1b}|\\u{212e}|\\u{435}|\\u{511}|\\u{450}|\\u{4d7}|\\u{1971}|\\u{451}|\\u{1f10}|\\u{1f11}|\\u{1f12}|\\u{1f13}|\\u{1f15}|\\u{212f}|e)(?:\\u{ab9f}|\\u{13cf}|\\u{d835}\\u{dc1b}|\\u{d835}\\u{de23}|\\u{d835}\\u{dcb7}|\\u{d835}\\u{dd1f}|\\u{d835}\\u{dceb}|\\u{d835}\\u{dd87}|\\u{d835}\\u{ddbb}|\\u{d835}\\u{dc4f}|\\u{d835}\\u{de57}|\\u{d835}\\u{dd53}|\\u{d835}\\u{dc83}|\\u{d835}\\u{ddef}|\\u{d835}\\u{de8b}|\\u{266d}|\\u{1473}|\\u{1488}|\\u{ff42}|\\u{159a}|\\u{1579}|\\u{157a}|\\u{24d1}|\\u{1e03}|\\u{1e05}|\\u{48d}|\\u{44a}|\\u{1e07}|\\u{183}|\\u{253}|\\u{185}|\\u{15af}|\\u{184}|\\u{42c}|\\u{1472}|\\u{fe}|\\u{182}|\\u{249d}|\\u{42a}|\\u{1d80}|\\u{147f}|\\u{1480}|\\u{1482}|\\u{1481}|\\u{147e}|\\u{44c}|\\u{180}|\\u{48c}|\\u{462}|\\u{463}|\\u{150e} |b)(?:\\u{578}|\\u{57c}|\\u{5d7}|\\u{d835}\\u{dc8f}|\\u{d835}\\u{dcf7}|\\u{d835}\\u{de63}|\\u{d835}\\u{dc5b}|\\u{d835}\\u{dd93}|\\u{d835}\\u{dd2b}|\\u{d835}\\u{ddc7}|\\u{d835}\\u{de97}|\\u{d835}\\u{ddfb}|\\u{1952}|\\u{24dd}|\\u{3ae}|\\u{ff4e}|\\u{1f9}|\\u{1d12}|\\u{144}|\\u{f1}|\\u{1f97}|\\u{3b7}|\\u{1e45}|\\u{148}|\\u{1e47}|\\u{272}|\\u{146}|\\u{1e4b}|\\u{1e49}|\\u{572}|\\u{e96}|\\u{54c}|\\u{19e}|\\u{14b}|\\u{24a9}|\\u{e20}|\\u{e01}|\\u{273}|\\u{43f}|\\u{149}|\\u{43b}|\\u{509}|\\u{220}|\\u{1f20}|\\u{1f21}|\\u{1fc3}|\\u{564}|\\u{1f90}|\\u{1f91}|\\u{1f92}|\\u{1f93}|\\u{1f94}|\\u{1f95}|\\u{1f96}|\\u{1fc4}|\\u{1fc6}|\\u{1fc7}|\\u{1fc2}|\\u{1f22}|\\u{1f23}|\\u{1f24}|\\u{1f25}|\\u{1f26}|\\u{1f27}|\\u{1f74}|\\u{1f75}|\\u{1260}|\\u{1261}|\\u{1262}|\\u{1263}|\\u{1264}|\\u{1265}|\\u{1266}|\\u{235}|\\u{d835}\\u{dec8}|\\u{d835}\\u{df02}|\\u{d835}\\u{df3c}|\\u{d835}\\u{df76}|\\u{d835}\\u{dfb0}|\\u{d835}\\u{dd5f}|\\u{d835}\\u{de2f}|\\u{d835}\\u{dc27}|\\u{d835}\\u{dcc3}|\\u{1d87}|\\u{1d70}|\\u{1965}|\\u{2229}|n)(?:\\u{c02}|\\u{c82}|\\u{d02}|\\u{d82}|\\u{ae6}|\\u{be6}|\\u{6f5}|\\u{2134}|\\u{d835}\\u{dc5c}|\\u{d835}\\u{dc90}|\\u{d835}\\u{dd94}|\\u{ab3d}|\\u{d835}\\u{df44}|\\u{d835}\\u{ded4}|\\u{d835}\\u{df0e}|\\u{d835}\\u{df48}|\\u{d835}\\u{df82}|\\u{10ff}|\\u{d835}\\u{de98}|\\u{9e6}|\\u{b66}|\\u{12d0}|\\u{d835}\\u{ded0}|\\u{d835}\\u{ddc8}|\\u{d835}\\u{dfbc}|\\u{101d}|\\u{2c9f}|\\u{d835}\\u{de64}|\\u{1040}|\\u{d801}\\u{dc2c}|\\u{d835}\\u{dd2c}|\\u{d801}\\u{dcea}|\\u{d835}\\u{dcf8}|\\u{d83c}\\u{ddf4}|\\u{2364}|\\u{25cb}|\\u{3d9}|\\u{d83c}\\u{dd7e}|\\u{d835}\\u{dcaa}|\\u{d835}\\u{ddae}|\\u{d835}\\u{dfe2}|\\u{d835}\\u{dff6}|\\u{d835}\\u{de7e}|\\u{d835}\\u{de30}|\\u{d835}\\u{ddfc}|\\u{d835}\\u{dd60}|\\u{d835}\\u{df0a}|\\u{d835}\\u{dc28}|\\u{d835}\\u{df7e}|\\u{d835}\\u{dfb8}|\\u{1424}|\\u{24de}|\\u{473}|\\u{19d0}|\\u{1972}|\\u{f0}|\\u{ff4f}|\\u{c20}|\\u{199e}|\\u{553}|\\u{f2}|\\u{4e9}|\\u{4e7}|\\u{f3}|\\u{ba}|\\u{14d}|\\u{f4}|\\u{1d2}|\\u{20f}|\\u{14f}|\\u{1ed3}|\\u{22d}|\\u{1e4f}|\\u{1f44}|\\u{1e51}|\\u{1e53}|\\u{22f}|\\u{22b}|\\u{e4f}|\\u{1d0f}|\\u{151}|\\u{f6}|\\u{47b}|\\u{43e}|\\u{12d0}|\\u{1ed}|\\u{231}|\\u{9e6}|\\u{b66}|\\u{665}|\\u{c66}|\\u{ce6}|\\u{d66}|\\u{e50}|\\u{ed0}|\\u{3bf}|\\u{585}|\\u{1d11}|\\u{966}|\\u{a66}|\\u{1ecf}|\\u{1a1}|\\u{1edd}|\\u{1edb}|\\u{1ee1}|\\u{1edf}|\\u{1ee3}|\\u{1ecd}|\\u{1ed9}|\\u{1eb}|\\u{f8}|\\u{1ff}|\\u{275}|\\u{56e}|\\u{1f40}|\\u{1f41}|\\u{3cc}|\\u{1f78}|\\u{1f79}|\\u{1f42}|\\u{1f43}|\\u{1f45}|o)(?:\\u{2228}|\\u{2304}|\\u{22c1}|\\u{2174}|\\u{d835}\\u{dc2f}|\\u{d835}\\u{dc63}|\\u{d835}\\u{dc97}|\\u{d835}\\u{dccb}|\\u{d835}\\u{dd33}|\\u{d835}\\u{dd67}|\\u{d835}\\u{dd9b}|\\u{d835}\\u{ddcf}|\\u{aba9}|\\u{1200}|\\u{24e5}|\\u{ff56}|\\u{d835}\\u{df10}|\\u{d835}\\u{df4a}|\\u{1e7d}|\\u{1e7f}|\\u{c6e}|\\u{e07}|\\u{475}|\\u{5e2}|\\u{1d20}|\\u{3bd}|\\u{5d8}|\\u{1d65}|\\u{477}|\\u{17f4}|\\u{1601}|\\u{d835}\\u{de6b}|\\u{d835}\\u{de9f}|\\u{d835}\\u{dece}|\\u{d835}\\u{df08}|\\u{d835}\\u{df42}|\\u{d835}\\u{df7c}|\\u{d835}\\u{dfb6}|\\u{d835}\\u{de37}|\\u{d835}\\u{de03}|\\u{d835}\\u{dcff}|v)(?:\\u{259}|\\u{4d9}|\\u{2147}|\\u{ab32}|\\u{a793}|\\u{22f4}|\\u{d835}\\u{dec6}|\\u{d835}\\u{dedc}|\\u{d835}\\u{df00}|\\u{d835}\\u{df16}|\\u{d835}\\u{df3a}|\\u{d835}\\u{df50}|\\u{d835}\\u{df74}|\\u{d835}\\u{df8a}|\\u{d835}\\u{dfae}|\\u{d835}\\u{dfc4}|\\u{2c89}|\\u{ab9b}|\\u{d801}\\u{dc29}|\\u{a792}|\\u{2c88}|\\u{2377}|\\u{d835}\\u{dc52}|\\u{d835}\\u{dcee}|\\u{d835}\\u{dd56}|\\u{d835}\\u{dd8a}|\\u{d835}\\u{de26}|\\u{d835}\\u{ddf2}|\\u{d835}\\u{de8e}|\\u{d835}\\u{de5a}|\\u{d835}\\u{dc86}|\\u{d835}\\u{dd22}|\\u{d835}\\u{ddbe}|\\u{d835}\\u{dc1e}|\\u{4be}|\\u{4bf}|\\u{24d4}|\\u{ff45}|\\u{24a0}|\\u{e8}|\\u{19c9}|\\u{e9}|\\u{1d92}|\\u{ea}|\\u{258}|\\u{1f14}|\\u{1ec1}|\\u{1ebf}|\\u{1ec5}|\\u{aef}|\\u{1dd}|\\u{454}|\\u{3b5}|\\u{113}|\\u{4bd}|\\u{25b}|\\u{1ec3}|\\u{1ebd}|\\u{1e15}|\\u{1e17}|\\u{115}|\\u{117}|\\u{eb}|\\u{1ebb}|\\u{11b}|\\u{205}|\\u{207}|\\u{1eb9}|\\u{1ec7}|\\u{229}|\\u{247}|\\u{2091}|\\u{119}|\\u{1e1d}|\\u{1e19}|\\u{1e1b}|\\u{212e}|\\u{435}|\\u{511}|\\u{450}|\\u{4d7}|\\u{1971}|\\u{451}|\\u{1f10}|\\u{1f11}|\\u{1f12}|\\u{1f13}|\\u{1f15}|\\u{212f}|e)(?:\\u{24db}|\\u{ff4c}|\\u{140}|\\u{13a}|\\u{13e}|\\u{1e37}|\\u{1e39}|\\u{13c}|\\u{4c0}|\\u{2113}|\\u{1e3d}|\\u{1e3b}|\\u{142}|\\u{ff9a}|\\u{26d}|\\u{19a}|\\u{26b}|\\u{2c61}|\\\\||\\u{196}|\\u{24a7}|\\u{285}|\\u{1c0}|\\u{5d5}|\\u{5df}|\\u{399}|\\u{406}|\\u{ff5c}|\\u{1da9}|\\u{4cf}|\\u{d835}\\u{dcd8}|\\u{d835}\\u{dd40}|\\u{d835}\\u{dda8}|\\u{d835}\\u{dddc}|\\u{d835}\\u{de10}|\\u{d835}\\u{dc25}|\\u{d835}\\u{dc59}|\\u{d835}\\u{dc8d}|\\u{d835}\\u{dcc1}|\\u{d835}\\u{dd29}|\\u{d835}\\u{dd5d}|\\u{d835}\\u{dd91}|\\u{d835}\\u{ddc5}|\\u{d835}\\u{ddf9}|\\u{d835}\\u{de2d}|\\u{d835}\\u{de95}|\\u{d835}\\u{df24}|\\u{d835}\\u{df5e}|\\u{131}|\\u{d835}\\u{dea4}|\\u{269}|\\u{1fbe}|\\u{d835}\\u{deca}|\\u{d835}\\u{df04}|\\u{d835}\\u{df3e}|\\u{d835}\\u{dfb2}|I|l)(?:.?(?:\\u{d83d}\\u{df4c}|\\u{ff43}|\\u{217d}|\\u{d835}\\u{dc1c}|\\u{d835}\\u{dc50}|\\u{d835}\\u{dc84}|\\u{d835}\\u{dcb8}|\\u{d835}\\u{dcec}|\\u{d835}\\u{dd20}|\\u{d835}\\u{dd54}|\\u{d835}\\u{dd88}|\\u{d835}\\u{ddbc}|\\u{d835}\\u{ddf0}|\\u{d835}\\u{de24}|\\u{d835}\\u{de58}|\\u{d835}\\u{de8c}|\\u{1d04}|\\u{3f2}|\\u{2ca5}|\\u{441}|\\u{abaf}|\\u{d801}\\u{dc3d}|\\u{2ca5}|\\u{d801}\\u{dc3d}|\\u{abaf}|\\u{109}|\\u{ff43}|\\u{24d2}|\\u{107}|\\u{10d}|\\u{10b}|\\u{e7}|\\u{481}|\\u{188}|\\u{1e09}|\\u{23c}|\\u{2184}|\\u{441}|\\u{122d}|\\u{1d04}|\\u{3f2}|\\u{4ab}|\\u{a49d}|\\u{3c2}|\\u{27d}|\\u{3db}|\\u{d835}\\u{de72}|\\u{1466}|\\u{19da}|\\u{d835}\\u{dc1c}|\\u{d835}\\u{dc50}|\\u{d835}\\u{dc84}|\\u{d835}\\u{dcb8}|\\u{d835}\\u{dcec}|\\u{d835}\\u{dd20}|\\u{d835}\\u{dd54}|\\u{d835}\\u{dd88}|\\u{d835}\\u{ddbc}|\\u{d835}\\u{ddf0}|\\u{d835}\\u{de24}|\\u{d835}\\u{de58}|\\u{d835}\\u{de8c}|\\u{20b5}|\\u{d83c}\\u{dde8}|\\u{1974}|\\u{14bc}|\\u{217d}|c)(?:\\u{c02}|\\u{c82}|\\u{d02}|\\u{d82}|\\u{ae6}|\\u{be6}|\\u{6f5}|\\u{2134}|\\u{d835}\\u{dc5c}|\\u{d835}\\u{dc90}|\\u{d835}\\u{dd94}|\\u{ab3d}|\\u{d835}\\u{df44}|\\u{d835}\\u{ded4}|\\u{d835}\\u{df0e}|\\u{d835}\\u{df48}|\\u{d835}\\u{df82}|\\u{10ff}|\\u{d835}\\u{de98}|\\u{9e6}|\\u{b66}|\\u{12d0}|\\u{d835}\\u{ded0}|\\u{d835}\\u{ddc8}|\\u{d835}\\u{dfbc}|\\u{101d}|\\u{2c9f}|\\u{d835}\\u{de64}|\\u{1040}|\\u{d801}\\u{dc2c}|\\u{d835}\\u{dd2c}|\\u{d801}\\u{dcea}|\\u{d835}\\u{dcf8}|\\u{d83c}\\u{ddf4}|\\u{2364}|\\u{25cb}|\\u{3d9}|\\u{d83c}\\u{dd7e}|\\u{d835}\\u{dcaa}|\\u{d835}\\u{ddae}|\\u{d835}\\u{dfe2}|\\u{d835}\\u{dff6}|\\u{d835}\\u{de7e}|\\u{d835}\\u{de30}|\\u{d835}\\u{ddfc}|\\u{d835}\\u{dd60}|\\u{d835}\\u{df0a}|\\u{d835}\\u{dc28}|\\u{d835}\\u{df7e}|\\u{d835}\\u{dfb8}|\\u{1424}|\\u{24de}|\\u{473}|\\u{19d0}|\\u{1972}|\\u{f0}|\\u{ff4f}|\\u{c20}|\\u{199e}|\\u{553}|\\u{f2}|\\u{4e9}|\\u{4e7}|\\u{f3}|\\u{ba}|\\u{14d}|\\u{f4}|\\u{1d2}|\\u{20f}|\\u{14f}|\\u{1ed3}|\\u{22d}|\\u{1e4f}|\\u{1f44}|\\u{1e51}|\\u{1e53}|\\u{22f}|\\u{22b}|\\u{e4f}|\\u{1d0f}|\\u{151}|\\u{f6}|\\u{47b}|\\u{43e}|\\u{12d0}|\\u{1ed}|\\u{231}|\\u{9e6}|\\u{b66}|\\u{665}|\\u{c66}|\\u{ce6}|\\u{d66}|\\u{e50}|\\u{ed0}|\\u{3bf}|\\u{585}|\\u{1d11}|\\u{966}|\\u{a66}|\\u{1ecf}|\\u{1a1}|\\u{1edd}|\\u{1edb}|\\u{1ee1}|\\u{1edf}|\\u{1ee3}|\\u{1ecd}|\\u{1ed9}|\\u{1eb}|\\u{f8}|\\u{1ff}|\\u{275}|\\u{56e}|\\u{1f40}|\\u{1f41}|\\u{3cc}|\\u{1f78}|\\u{1f79}|\\u{1f42}|\\u{1f43}|\\u{1f45}|o)(?:\\u{20a5}|\\u{1d6f}|\\u{d835}\\u{dd92}|\\u{d835}\\u{dc26}|\\u{d835}\\u{ddc6}|\\u{d835}\\u{dd2a}|\\u{d835}\\u{dd5e}|\\u{d835}\\u{dcc2}|\\u{24dc}|\\u{ff4d}|\\u{d28}|\\u{1662}|\\u{d69}|\\u{1e3f}|\\u{1e41}|\\u{217f}|\\u{3fb}|\\u{1e43}|\\u{1320}|\\u{271}|\\u{17f3}|\\u{1d86}|\\u{d835}\\u{dc8e}|\\u{d835}\\u{de62}|\\u{d835}\\u{dcf6}|\\u{d835}\\u{de96}|\\u{d835}\\u{dc5a}|\\u{d835}\\u{ddfa}|\\u{19d5}|\\u{19d7}|m))?', 'gi');
      content = content.replace(fwnRegex, '');
    }

    return content;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      'q': searchTerm,
      'limit': '24',
      'page': page.toString(),
    });

    const url = new URL('titles/search', this.api);
    url.search = new URLSearchParams(params).toString();

    const result = await fetchApi(url.toString());
    const body = await result.json();

    return this.parseNovels(body);
  }

  filters = {
    orderBy: {
      value: 'views',
      label: 'Order by',
      options: [
        { label: 'Default Order', value: '' },
        { label: 'Most Viewed', value: 'views' },
        { label: 'Latest Updated', value: 'latest' },
        { label: 'Most Popular', value: 'popular' },
        { label: 'A-Z', value: 'alphabetical' },
        { label: 'Highest Rating', value: 'rating' },
        { label: 'Most Chapters', value: 'chapters' },
      ],
      type: FilterTypes.Picker,
    },
    keyword: {
      value: '',
      label: 'Keywords',
      type: FilterTypes.TextInput,
    },
    status: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      value: {
        include: [],
        exclude: [],
      },
      label: 'Genres (OR, not AND)',
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Action Adventure', value: 'action-adventure' },
        { label: 'ActionAdventure', value: 'actionadventure' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventcure', value: 'adventcure' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Adventurer', value: 'adventurer' },
        { label: 'Anime u0026 Comics', value: 'anime-u0026-comics' },
        { label: 'Bender', value: 'bender' },
        { label: 'Booku0026Literature', value: 'booku0026literature' },
        { label: 'Chinese', value: 'chinese' },
        { label: 'Comed', value: 'comed' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'ComedySlice of Life', value: 'comedyslice-of-life' },
        { label: 'Cultivation', value: 'cultivation' },
        { label: 'Drama', value: 'drama' },
        { label: 'dventure', value: 'dventure' },
        { label: 'Eastern', value: 'eastern' },
        { label: 'Easterni', value: 'easterni' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Ecchi Fantasy', value: 'ecchi-fantasy' },
        { label: 'Fan-Fiction', value: 'fan-fiction' },
        { label: 'Fanfiction', value: 'fanfiction' },
        { label: 'Fantas', value: 'fantas' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'FantasyAction', value: 'fantasyaction' },
        { label: 'Game', value: 'game' },
        { label: 'Games', value: 'games' },
        { label: 'Gender', value: 'gender' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'HaremAction', value: 'haremaction' },
        { label: 'Haremv', value: 'haremv' },
        { label: 'Historica', value: 'historica' },
        { label: 'Historical', value: 'historical' },
        { label: 'History', value: 'history' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'lice of Life', value: 'lice-of-life' },
        { label: 'Light Novel', value: 'light-novel' },
        { label: 'Litrpg', value: 'litrpg' },
        { label: 'Lolicon', value: 'lolicon' },
        { label: 'Magic', value: 'magic' },
        { label: 'Martial', value: 'martial' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Modern Life', value: 'modern-life' },
        { label: 'Movies', value: 'movies' },
        { label: 'Myster', value: 'myster' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Mystery.Adventure', value: 'mystery.adventure' },
        { label: 'Psychologic', value: 'psychologic' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Reincarnatio', value: 'reincarnatio' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romanc', value: 'romanc' },
        { label: 'Romance', value: 'romance' },
        { label: 'Romance.Adventure', value: 'romance.adventure' },
        { label: 'Romance.Harem', value: 'romance.harem' },
        { label: 'Romance.Smut', value: 'romance.smut' },
        { label: 'RomanceAction', value: 'romanceaction' },
        { label: 'RomanceAdventure', value: 'romanceadventure' },
        { label: 'RomanceHarem', value: 'romanceharem' },
        { label: 'Romancei', value: 'romancei' },
        { label: 'Romancem', value: 'romancem' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Seinen Wuxia', value: 'seinen-wuxia' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Slice of Lif', value: 'slice-of-lif' },
        { label: 'Slice Of Life', value: 'slice-of-life' },
        { label: 'Slice of Lifel', value: 'slice-of-lifel' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sports', value: 'sports' },
        { label: 'Superna', value: 'superna' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'System', value: 'system' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban', value: 'urban' },
        { label: 'Urban Life', value: 'urban-life' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    min_ch: {
      value: '',
      label: 'Minimum Chapters',
      type: FilterTypes.TextInput,
    },
    max_ch: {
      value: '',
      label: 'Maximum Chapters',
      type: FilterTypes.TextInput,
    },
    type: {
      value: '',
      label: 'Types',
      options: [
        { label: 'All Types', value: '' },
        { label: 'Japanese comics', value: 'manga' },
        { label: 'Korean comics', value: 'manhwa' },
        { label: 'Chinese comics', value: 'manhua' },
      ],
      type: FilterTypes.Picker,
    },
    demo: {
      value: [],
      label: 'Demographics',
      options: [
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Josei', value: 'josei' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new NovelBuddy();

type Response = {
  data: {
    items: Items[];
  };
};

type ChapterResponse = {
  success: boolean;
  data?: {
    chapters?: Items[];
  };
};

type Items = {
  id: string;
  url: string;
  name: string;
  alt_name?: string;
  cover?: string;
  slug: string;
  updated_at?: string;
  updatedAt?: string;
};

type NovelScript = {
  props: {
    pageProps: {
      initialManga: Manga;
    };
  };
};

type Manga = {
  id: string;
  url: string;
  name?: string;
  altName?: string;
  cover: string;
  status: string;
  ratingStats?: {
    average: number;
  };
  summary?: string;
  artists?: {
    name: string;
    slug: string;
  }[];
  authors?: {
    name: string;
    slug: string;
  }[];
  genres?: {
    name: string;
    slug: string;
  }[];
  chapters?: Items[];
};

type ChapterScript = {
  props: {
    pageProps: {
      initialChapter: Chapter;
    };
  };
};

type Chapter = {
  name: string;
  content: string;
};
