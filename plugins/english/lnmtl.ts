import { Parser } from 'htmlparser2';
import { fetchApi } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';

class LnMTLPlugin implements Plugin.PagePlugin {
  id = 'lnmtl';
  name = 'LnMTL';
  icon = 'src/en/lnmtl/icon.png';
  site = 'https://lnmtl.com/';
  version = '2.1.0';

  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      orderBy: filters.order.value,
      order: filters.sort.value,
      filter: filters.storyStatus.value,
      page: page.toString(),
    });

    const link = `${this.site}novel?${params.toString()}`;
    const response = await fetchApi(link);
    const html = await response.text();
    const baseUrl = this.site;
    let state: ParsingState = ParsingState.Idle;
    let tempNovel: Partial<Plugin.NovelItem> = {};
    const novels: Plugin.NovelItem[] = [];

    const parser = new Parser({
      onopentag(name, attribs) {
        if (attribs['class']?.includes('media-left')) {
          state = ParsingState.Novel;
        }
        if (state !== ParsingState.Novel) return;

        switch (name) {
          case 'a':
            tempNovel.path = attribs['href'].replace(baseUrl, '');
            break;
          case 'img':
            tempNovel.name = attribs['alt'];
            tempNovel.cover = attribs['src'];
            break;
        }
      },
      onclosetag(name) {
        if (name === 'div') {
          if (tempNovel.path && tempNovel.name) {
            novels.push(tempNovel as Plugin.NovelItem);
            tempNovel = {};
          }
          state = ParsingState.Idle;
        }
      },
    });

    parser.write(html);
    parser.end();

    return novels;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const body = await fetchApi(this.site + novelPath);
    const html = await body.text().then(r => r.replace(/>\s+</g, '><'));

    const novel: Partial<Plugin.SourceNovel> & { totalPages: number } = {
      path: novelPath,
      totalPages: 1,
      chapters: [],
    };

    let state = ParsingState.Idle;
    let panelValueCount = 0;
    let listCount = 0;
    let isAuthorKey = false;
    let isStatusKey = false;
    const summaryParts: string[] = [];
    const genreArray: string[] = [];
    const parser = new Parser({
      onopentag(name, attribs) {
        switch (name) {
          case 'img':
            if (attribs['class']?.includes('img-rounded')) {
              novel.name = attribs['title'];
              novel.cover = attribs['src'];
            }
            break;
          case 'dt':
            state = ParsingState.InPanelKey;
            break;
          case 'dd':
            state = ParsingState.InPanelValue;
            panelValueCount++;
            break;
          case 'ul':
            if (attribs['class']?.includes('list-inline')) {
              listCount++;
            }
            break;
          case 'li':
            if (listCount === 1) {
              state = ParsingState.InGenres;
            }
            break;
          default:
            if (attribs['class']) {
              const map: Record<string, ParsingState> = {
                description: ParsingState.InDescription,
                source: ParsingState.InSource,
                progress: ParsingState.Idle,
              };
              state = map[attribs['class']] ?? state;
            }
        }
      },
      ontext(data) {
        switch (state) {
          case ParsingState.InScript:
            const volume = JSON.parse(
              data.match(/lnmtl.volumes = (.+])(?=;)/)![1] || '',
            );
            novel.totalPages = volume.length;
            break;
          case ParsingState.InDescription:
            summaryParts.push(data.trim());
            summaryParts.push('\n\n');
            break;
          case ParsingState.InSource:
            summaryParts.push(data);
            break;
          case ParsingState.InPanelKey:
            switch (data) {
              case 'Authors':
                isAuthorKey = true;
                break;
              case 'Current status':
                isStatusKey = true;
                break;
            }
            break;
          case ParsingState.InPanelValue:
            if (isAuthorKey && panelValueCount === 1) {
              novel.author = (novel.author || '') + data.trim();
              isAuthorKey = false;
            } else if (isStatusKey && panelValueCount === 2) {
              novel.status = (novel.status || '') + data.trim();
              isStatusKey = false;
            }
            break;
          case ParsingState.InGenres:
            genreArray.push(data.trim());
            break;
        }
      },
      onclosetag(name) {
        switch (name) {
          case 'ul':
            if (state === ParsingState.InGenres) {
              state = ParsingState.Idle;
            }
            break;
          case 'main':
            state = ParsingState.InScript;
            break;
          case 'script':
            if (state === ParsingState.InScript) {
              state = ParsingState.Idle;
            }
            break;
        }
      },
      onend() {
        novel.summary = summaryParts.join('');
        novel.genres = genreArray.join(', ');
      },
    });

    parser.write(html);
    parser.end();

    return novel as Plugin.SourceNovel & { totalPages: number };
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const result = await fetchApi(this.site + novelPath);
    const html = await result.text().then(r => r.replace(/>\s+</g, '><'));
    let state: ParsingState = ParsingState.Idle;
    let volume: VolumeEntry = {
      id: '',
      title: '',
    };
    const parser = new Parser({
      ontext(data) {
        if (state === ParsingState.InScript) {
          const volumes = JSON.parse(
            data.match(/lnmtl.volumes = (.+])(?=;)/)![1] || '',
          );
          volume = volumes[+page - 1];
        }
      },
      onclosetag(name) {
        if (name === 'main') {
          state = ParsingState.InScript;
        }
        if (name === 'script') {
          state = ParsingState.Idle;
        }
      },
    });

    parser.write(html);
    parser.end();

    const chapter: Plugin.ChapterItem[] = [];

    await this.sleep(1000);
    const volumeData = await fetchApi(
      `${this.site}chapter?volumeId=${volume.id}`,
    );
    const volumePage = await volumeData.json();
    const firstPage = volumePage.data.map((chapter: ChapterEntry) => ({
      name: `#${chapter.number} - ${chapter.title}`,
      path: `chapter/${chapter.slug}`,
      releaseTime: new Date(chapter.created_at).toISOString(), //converts time obtained to UTC +0, TODO: Make it not convert
    }));
    chapter.push(...firstPage);

    for (let i = 2; i <= volumePage.last_page; i++) {
      await this.sleep(1000);
      const chapterData = await fetchApi(
        `${this.site}chapter?page=${i}&volumeId=${volume.id}`,
      );
      const chapterInfo = await chapterData.json();

      const chapterDetails = chapterInfo.data.map((chapter: ChapterEntry) => ({
        name: `#${chapter.number} ${chapter.title}`,
        path: `chapter/${chapter.slug}`,
        releaseTime: new Date(chapter.created_at).toISOString(), //converts time obtained to UTC +0, TODO: Make it not convert
      }));

      chapter.push(...chapterDetails);
    }
    const chapters = chapter;
    return { chapters };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const html = await result.text();

    let state: ParsingState = ParsingState.Idle;
    const chapterTextParts: string[] = [];

    type EscapeChar = '&' | '<' | '>' | '"' | "'";
    const escapeRegex = /[&<>"']/g;
    const escapeMap: Record<EscapeChar, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    const escapeHtml = (text: string): string =>
      escapeRegex.test(text)
        ? ((escapeRegex.lastIndex = 0),
          text.replace(escapeRegex, char => escapeMap[char as EscapeChar]))
        : text;

    const parser = new Parser({
      onopentag(name, attribs) {
        if (name === 'sentence' && attribs['class']?.includes('translated')) {
          state = ParsingState.Chapter;
          chapterTextParts.push('<p>');
        }
      },
      onopentagname(name) {
        if (name === 'nav') {
          state = ParsingState.Idle;
        }
      },
      ontext(data) {
        if (state === ParsingState.Chapter) {
          chapterTextParts.push(escapeHtml(data));
        }
      },
      onclosetag(name) {
        if (name === 'sentence' && state === ParsingState.Chapter) {
          chapterTextParts.push('</p>');
          state = ParsingState.Idle;
        }
      },
    });

    parser.write(html);
    parser.end();
    const chapterText = chapterTextParts.join('');
    return chapterText.replace(/„/g, '“');
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const html = await fetchApi(this.site)
      .then(b => b.text())
      .then(r => r.replace(/>\s+</g, '><'));

    let state = ParsingState.Idle;
    const listPart = new Set<string>();
    const parser = new Parser({
      onopentag(name, attribs) {
        if (
          state === ParsingState.InFooter &&
          name === 'script' &&
          attribs['type']?.includes('application/javascript')
        ) {
          state = ParsingState.InScript;
        }
      },
      ontext(data) {
        if (state === ParsingState.InScript) {
          const match = data.match(/prefetch: '\/(.*?\.json)/);
          if (match) {
            listPart.add(match[1]);
          }
        }
      },
      onclosetag(name) {
        switch (name) {
          case 'footer':
            state = ParsingState.InFooter;
            break;
          case 'script':
            if (state === ParsingState.InScript) {
              state = ParsingState.Idle;
            }
            break;
        }
      },
    });

    parser.write(html);
    parser.end();

    const search = await fetchApi(
      `${this.site}${Array.from(listPart).join('')}`,
    );
    const data = await search.json();

    const nov = data.filter((res: { name: string }) =>
      res.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    const novels: Plugin.NovelItem[] = [];
    nov.map((res: { name: string; slug: string; image: string }) => {
      const novelName = res.name;
      const novelUrl = `novel/${res.slug}`;
      const novelCover = res.image;

      const novel = {
        path: novelUrl,
        name: novelName,
        cover: novelCover,
      };
      novels.push(novel);
    });
    return novels;
  }

  filters = {
    order: {
      value: 'favourites',
      label: 'Order by',
      options: [
        { label: 'Favourites', value: 'favourites' },
        { label: 'Name', value: 'name' },
        { label: 'Addition Date', value: 'date' },
      ],
      type: FilterTypes.Picker,
    },
    sort: {
      value: 'desc',
      label: 'Sort by',
      options: [
        { label: 'Descending', value: 'desc' },
        { label: 'Ascending', value: 'asc' },
      ],
      type: FilterTypes.Picker,
    },
    storyStatus: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Finished', value: 'finished' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new LnMTLPlugin();

type ChapterEntry = {
  number: number;
  title: string;
  slug: string;
  created_at: string;
};

type VolumeEntry = {
  id: string;
  title: string;
};

enum ParsingState {
  Idle,
  InFooter,
  InScript,
  InDescription,
  InSource,
  InPanelKey,
  InPanelValue,
  InGenres,
  Novel,
  Chapter,
}
