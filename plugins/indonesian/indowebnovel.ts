import { Cheerio, CheerioAPI, load as parseHTML } from 'cheerio';
import { AnyNode } from 'domhandler';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
// import { Filters, FilterTypes } from '@libs/filterInputs';

class IndoWebNovel implements Plugin.PluginBase {
  id = 'IDWN.id';
  name = 'IndoWebNovel';
  icon = 'src/id/indowebnovel/icon.png';
  site = 'https://indowebnovel.id/';
  version = '1.3.2';

  private headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: 'https://indowebnovel.id/',
  };

  private async fetchPage(url: string) {
    const res = await fetchApi(url, { headers: this.headers });
    if (!res.ok) {
      throw Object.assign(new Error('Request failed: ' + res.status), {
        status: res.status,
      });
    }
    return res.text();
  }

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    // The search/paged listing (`page/<n>/?s`) renders `.flexbox2-item`
    // cards, while the front page renders `.flexbox3-item` cards (latest
    // updates) and `.popular .flexbox-item` cards (ranked list). Accept
    // every variant so a listing page never parses to zero novels just
    // because the server returned another listing layout.
    const items = loadedCheerio('.flexbox2-item').length
      ? loadedCheerio('.flexbox2-item')
      : loadedCheerio('.flexbox3-item').length
        ? loadedCheerio('.flexbox3-item')
        : loadedCheerio('.popular .flexbox-item');

    items.each((i, el) => {
      const item = loadedCheerio(el);
      const novelName = (
        item.find('.flexbox2-title span').first().text() ||
        item.find('.title a').first().text() ||
        item.find('.flexbox-title').first().text()
      ).trim();
      const novelCover = item.find('img').attr('src');
      const novelUrl =
        item.find('.flexbox2-content > a').attr('href') ||
        item.find('.flexbox3-content > a').attr('href') ||
        item.find('a').attr('href');

      if (!novelUrl) return;

      novels.push({
        name: novelName,
        cover: novelCover,
        path: novelUrl.slice(this.site.length),
      });
    });

    return novels;
  }

  async popularNovels(
    page = 1,
    // { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    /*
    let link = `${this.site}advanced-search/page/${page}/?title=&author=&yearx=`;
    link += `&status=${filters.status.value}`;
    link += `&type=${filters.type.value}`;
    link += `&order=${filters.sort.value}`;

    if (filters.lang.value.length)
      link += filters.lang.value.map(i => `&country[]=${i}`).join('');
    if (filters.genre.value.length)
      link += filters.genre.value.map(i => `&genre[]=${i}`).join('');
    */
    const link = this.site + `page/${page}/?s`;
    const body = await this.fetchPage(link);

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await this.fetchPage(this.site + novelPath);

    const loadedCheerio = parseHTML(body);
    loadedCheerio('.series-synops div').remove();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.series-title h2').text().trim() || 'Untitled',
      cover: loadedCheerio('.series-thumb img').attr('src'),
      author: loadedCheerio(".series-infolist li:contains('Author') span")
        .text()
        .trim(),
      status:
        loadedCheerio('.status').text().trim() === 'Completed'
          ? NovelStatus.Completed
          : NovelStatus.Ongoing,
      summary: loadedCheerio('.series-synops').text().trim(),
      chapters: [],
    };

    novel.genres = loadedCheerio('.series-genres a')
      .map((i, el) => loadedCheerio(el).text().trim())
      .toArray()
      .join(',');

    const chapters: Plugin.ChapterItem[] = [];

    loadedCheerio('.series-chapterlists li').each((i, el) => {
      // The list entry also holds a `span.date`; drop it so the chapter name
      // does not end with the release date.
      const chapterName = loadedCheerio(el)
        .find('a span')
        .not('.date')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim();
      const chapterUrl = loadedCheerio(el).find('a').attr('href');

      if (!chapterUrl) return;

      const chapter: Plugin.ChapterItem = {
        name: chapterName,
        path: chapterUrl.slice(this.site.length),
      };

      // Each entry also holds a `span.date` like "October 23, 2025".
      const releaseDate = loadedCheerio(el)
        .find('span.date')
        .first()
        .text()
        .trim();
      if (releaseDate && !isNaN(Date.parse(releaseDate))) {
        chapter.releaseTime = new Date(releaseDate).toISOString();
      }

      chapters.push(chapter);
    });

    novel.chapters = chapters.reverse();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await this.fetchPage(this.site + chapterPath);

    // The site wraps stray story phrases in angle brackets as an anti-scrape
    // measure (e.g. `<Lindungi Kekaisaran>`). Left alone, those pseudo-tags
    // parse as elements and their words are lost (a tag name is not text).
    // Escape them back to text before parsing so the phrase survives
    // verbatim, with its original case and punctuation. Only real HTML
    // elements and clean token-shaped tags (e.g. the `<nfn8a88>` watermark
    // wrappers, handled below) keep their brackets.
    const realTags: Record<string, boolean> = {
      a: true,
      abbr: true,
      address: true,
      area: true,
      article: true,
      aside: true,
      audio: true,
      b: true,
      base: true,
      bdi: true,
      bdo: true,
      big: true,
      blockquote: true,
      body: true,
      br: true,
      button: true,
      canvas: true,
      caption: true,
      center: true,
      cite: true,
      code: true,
      col: true,
      colgroup: true,
      data: true,
      datalist: true,
      dd: true,
      del: true,
      details: true,
      dfn: true,
      dialog: true,
      div: true,
      dl: true,
      dt: true,
      em: true,
      embed: true,
      fieldset: true,
      figcaption: true,
      figure: true,
      font: true,
      footer: true,
      form: true,
      h1: true,
      h2: true,
      h3: true,
      h4: true,
      h5: true,
      h6: true,
      head: true,
      header: true,
      hgroup: true,
      hr: true,
      html: true,
      i: true,
      iframe: true,
      img: true,
      input: true,
      ins: true,
      kbd: true,
      label: true,
      legend: true,
      li: true,
      link: true,
      main: true,
      map: true,
      mark: true,
      meta: true,
      meter: true,
      nav: true,
      nobr: true,
      noscript: true,
      object: true,
      ol: true,
      optgroup: true,
      option: true,
      output: true,
      p: true,
      path: true,
      picture: true,
      pre: true,
      progress: true,
      q: true,
      rp: true,
      rt: true,
      ruby: true,
      s: true,
      samp: true,
      script: true,
      search: true,
      section: true,
      select: true,
      small: true,
      source: true,
      span: true,
      strike: true,
      strong: true,
      style: true,
      sub: true,
      summary: true,
      sup: true,
      svg: true,
      table: true,
      tbody: true,
      td: true,
      template: true,
      textarea: true,
      tfoot: true,
      th: true,
      thead: true,
      time: true,
      title: true,
      tr: true,
      track: true,
      tt: true,
      u: true,
      ul: true,
      var: true,
      video: true,
      wbr: true,
    };
    // A phrase may wrap across a line break, so the match spans newlines.
    const safeBody = body.replace(
      /<(\/?)([A-Za-z][A-Za-z0-9]*)([^<>]*>)/g,
      (match: string, slash: string, name: string, rest: string) => {
        if (realTags[name.toLowerCase()]) return match;
        const inner = slash + name + rest.slice(0, -1);
        // A single lowercase token is a site watermark wrapper, left for the
        // parser and the unwrap below, but only when it is a closing or
        // self-closing tag or its closing tag exists: a lone `<status>` or
        // a multi-word `<protect the empire>` is a story phrase whose words
        // would otherwise be lost as a tag name and attributes.
        if (
          /^\/?[a-z][a-z0-9]*\/?$/.test(inner) &&
          (slash ||
            inner.slice(-1) === '/' ||
            body.indexOf('</' + name + '>') !== -1)
        ) {
          return match;
        }
        return '&lt;' + inner + '&gt;';
      },
    );

    const loadedCheerio = parseHTML(safeBody);

    // Scripts and styles are never story content, and their raw `<`/`&`
    // characters are not valid XHTML, so drop them before choosing a host:
    // a host holding only a script must not count as a chapter body.
    loadedCheerio('script, style').remove();

    // The chapter body is nested in `main .content .container` behind a div
    // whose class is a rotating random token (the previous hardcoded name,
    // `.adsads`, no longer exists). The stable inner host changed shape
    // across the site's history, so try each known host in turn: newer
    // chapters render `#content`, older ones `#nr-nv-content`,
    // `.entry-content` or `.text-left`, and the oldest ones hold their
    // paragraphs directly in the stable outer `.tldari...` container with
    // no inner host at all. Without the fallbacks a chapter using another
    // era's markup parses to empty text.
    // A host counts only when it holds readable text or an image; markup
    // alone (empty ad slots, decoy shells) falls through to the next host.
    // Class hosts such as the generic `.text-left` can match more than one
    // element, so take the match with the most text rather than whichever
    // comes first (e.g. a short title bar ahead of the story).
    const hosts = [
      'main #content',
      'main #nr-nv-content',
      'main .entry-content',
      'main .text-left',
      'main .tldariinggrissendiribrojangancopy',
    ];
    const hasContent = (node: Cheerio<AnyNode>) =>
      !!node.text().trim() || node.find('img').length > 0;
    let chapter: Cheerio<AnyNode> | undefined;
    for (const host of hosts) {
      loadedCheerio(host).each((_, el) => {
        const node = loadedCheerio(el);
        if (
          hasContent(node) &&
          (!chapter || node.text().trim().length > chapter.text().trim().length)
        ) {
          chapter = node;
        }
      });
      if (chapter) break;
    }
    if (!chapter) {
      // Fail loudly so a future template change reports instead of
      // pretending success with an empty chapter, mirroring how refused
      // responses throw above.
      throw Object.assign(
        new Error(
          'IndoWebNovel: no readable chapter body found: ' + chapterPath,
        ),
        { status: 200 },
      );
    }

    // Drop hidden elements (audio payloads, overlay containers): they are
    // never visible story content in a static reader. Match complete zero
    // values only: a prefix match would delete visible elements styled
    // e.g. `opacity: 0.5` or `font-size: 0.9em`, but accept every spelling
    // of zero (`0`, `0.0`, `0%`, `0pt`, `0vw`). The boolean `hidden`
    // attribute hides too, and must go here: the empty-attribute cleanup
    // below would otherwise strip it and reveal the element.
    chapter.find('[hidden]').remove();
    chapter.find('[style]').each((_, el) => {
      const style = loadedCheerio(el).attr('style') || '';
      if (
        /display\s*:\s*none|visibility\s*:\s*hidden|(?:opacity|font-size)\s*:\s*0*\.?0+(?:[a-z]+|%)?(?=\s*(?:;|$|!))/i.test(
          style,
        )
      ) {
        loadedCheerio(el).remove();
      }
    });

    // Second line of defence for anything shaped like markup that slipped
    // through the escape above: unwrap every element that is not a genuine
    // content tag, keeping its text, and drop any remaining attribute whose
    // name is not a valid XML name. Serialized bogus attributes are not
    // valid XHTML (e.g. an attribute name starting with `&` or ending in
    // `!`), which breaks the app's EPUB export.
    const contentTags =
      'a, abbr, b, big, blockquote, br, center, cite, code, dd, del, dfn, ' +
      'div, dl, dt, em, figcaption, figure, font, h1, h2, h3, h4, h5, h6, hr, ' +
      'i, img, ins, kbd, li, mark, ol, p, pre, q, s, samp, small, source, ' +
      'span, strike, strong, sub, sup, table, tbody, td, tfoot, th, thead, ' +
      'tr, tt, u, ul, var, wbr';
    let rogue = chapter.find('*').not(contentTags);
    while (rogue.length) {
      rogue.each((_, el) => {
        const node = loadedCheerio(el);
        node.replaceWith(node.html() || '');
      });
      rogue = chapter.find('*').not(contentTags);
    }

    // Drop empty decoy divs: the site plants text-empty `<div>`s with
    // rotating random-token classes between paragraphs, and stripped ad
    // containers leave nested empty shells behind. An empty div renders
    // nothing, but keep any div holding real children (images, line breaks)
    // so no reader content is lost. Walk innermost-first so newly emptied
    // parents are dropped in the same pass. This runs after the unwrap
    // above because unwrapping can empty out a div.
    const divs = chapter.find('div').toArray().reverse();
    for (const div of divs) {
      const node = loadedCheerio(div);
      if (!node.children().length && !node.text().trim()) node.remove();
    }
    chapter.find('*').each((_, el) => {
      const attribs = el.attribs || {};
      Object.keys(attribs).forEach(name => {
        // Drop attributes with invalid XML names, and attributes with
        // empty values: downstream serializers emit those bare, which is
        // not well-formed XML (e.g. a valueless `data-*` reader widget
        // attribute). An empty attribute value carries no information.
        if (
          attribs[name] === '' ||
          !/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(name)
        ) {
          loadedCheerio(el).removeAttr(name);
        }
      });
    });

    // XML 1.0 forbids C0 control characters other than tab, line feed and
    // carriage return; the HTML parser keeps them, and one stray control
    // character makes the whole chapter invalid XHTML for EPUB export.
    const chapterText = (chapter.html() || '').replace(
      // eslint-disable-next-line no-control-regex
      /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g,
      '',
    );
    if (!hasContent(chapter)) {
      throw Object.assign(
        new Error(
          'IndoWebNovel: chapter body empty after cleanup: ' + chapterPath,
        ),
        { status: 200 },
      );
    }

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page = 1,
  ): Promise<Plugin.NovelItem[]> {
    /*
    let link = `${this.site}advanced-search/page/${page}/?title=${searchTerm}&author=&yearx=`;
    link += `&status=${this.filters.status.value}`;
    link += `&type=${this.filters.type.value}`;
    link += `&order=${this.filters.sort.value}`;
    link += this.filters.lang.value.map(i => `&country[]=${i}`).join('');
    */
    const link = this.site + `page/${page}/?s=${searchTerm}`;
    const body = await this.fetchPage(link);

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  // filters = {
  //   status: {
  //     value: '',
  //     label: 'Status',
  //     options: [
  //       { label: 'All', value: '' },
  //       { label: 'Ongoing', value: 'ongoing' },
  //       { label: 'Completed', value: 'completed' },
  //     ],
  //     type: FilterTypes.Picker,
  //   },
  //   type: {
  //     value: '',
  //     label: 'Type',
  //     options: [
  //       { label: 'All', value: '' },
  //       { label: 'Web Novel', value: 'Web+Novel' },
  //       { label: 'Light Novel', value: 'Light+Novel' },
  //     ],
  //     type: FilterTypes.Picker,
  //   },
  //   sort: {
  //     value: 'rating',
  //     label: 'Order By',
  //     options: [
  //       { label: 'A-Z', value: 'title' },
  //       { label: 'Z-A', value: 'titlereverse' },
  //       { label: 'Latest Update', value: 'update' },
  //       { label: 'Latest Added', value: 'latest' },
  //       { label: 'Popular', value: 'popular' },
  //       { label: 'Rating', value: 'rating' },
  //     ],
  //     type: FilterTypes.Picker,
  //   },
  //   lang: {
  //     value: ['china', 'jepang', 'korea', 'unknown'],
  //     label: 'Country',
  //     options: [
  //       { label: 'China', value: 'china' },
  //       { label: 'Jepang', value: 'jepang' },
  //       { label: 'Korea', value: 'korea' },
  //       { label: 'Unknown', value: 'unknown' },
  //     ],
  //     type: FilterTypes.CheckboxGroup,
  //   },
  //   genre: {
  //     value: [],
  //     label: 'Genres',
  //     options: [
  //       { label: 'Action', value: 'action' },
  //       { label: 'Adult', value: 'adult' },
  //       { label: 'Adventure', value: 'adventure' },
  //       { label: 'Comedy', value: 'comedy' },
  //       { label: 'Drama', value: 'drama' },
  //       { label: 'Ecchi', value: 'ecchi' },
  //       { label: 'Fantasy', value: 'fantasy' },
  //       { label: 'Gender Bender', value: 'gender-bender' },
  //       { label: 'Harem', value: 'harem' },
  //       { label: 'Horror', value: 'horror' },
  //       { label: 'Josei', value: 'josei' },
  //       { label: 'Josei', value: 'josei' },
  //       { label: 'Martial Arts', value: 'martial-arts' },
  //       { label: 'Mature', value: 'mature' },
  //       { label: 'Mecha', value: 'mecha' },
  //       { label: 'Mystery', value: 'mystery' },
  //       { label: 'Psychological', value: 'psychological' },
  //       { label: 'Romance', value: 'romance' },
  //       { label: 'School Life', value: 'school-life' },
  //       { label: 'Sci-fi', value: 'sci-fi' },
  //       { label: 'Seinen', value: 'seinen' },
  //       { label: 'Shoujo', value: 'shoujo' },
  //       { label: 'Shounen', value: 'shounen' },
  //       { label: 'Slice of Life', value: 'slice-of-life' },
  //       { label: 'Smut', value: 'smut' },
  //       { label: 'Supernatural', value: 'supernatural' },
  //       { label: 'Tragedy', value: 'tragedy' },
  //       { label: 'Wuxia', value: 'wuxia' },
  //       { label: 'Xianxia', value: 'xianxia' },
  //       { label: 'Xuanhuan', value: 'xuanhuan' },
  //     ],
  //     type: FilterTypes.CheckboxGroup,
  //   },
  // } satisfies Filters;
}

export default new IndoWebNovel();
