import { load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';

class LnMTLPlugin implements Plugin.PagePlugin {
  id = 'lnmtl';
  name = 'LnMTL';
  icon = 'src/en/lnmtl/icon.png';
  site = 'https://lnmtl.com/';
  version = '1.0.1';

  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site + 'novel?';
    link += `orderBy=${filters.order.value}`;
    link += `&order=${filters.sort.value}`;
    link += `&filter=${filters.storyStatus.value}`;
    link += `&page=${page}`;

    const body = await fetchApi(link).then(result => result.text());

    const loadedCheerio = parseHTML(body);
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.media').each((i, el) => {
      const novelName = loadedCheerio(el).find('h4').text();
      const novelCover = loadedCheerio(el).find('img').attr('src');
      const novelUrl = loadedCheerio(el).find('h4 > a').attr('href');

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.site, ''),
      };

      novels.push(novel);
    });

    return novels;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const volumes = JSON.parse(
      loadedCheerio('main')
        .next()
        .html()
        ?.match(/lnmtl.volumes = \[(.*?)\]/)![0]
        ?.replace('lnmtl.volumes = ', '') || '',
    );

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: loadedCheerio('.novel-name').text() || 'Untitled',
      cover: loadedCheerio('div.novel').find('img').attr('src'),
      summary: loadedCheerio('div.description').text().trim(),
      totalPages: volumes.length,
      chapters: [],
    };

    loadedCheerio('.panel-body > dl').each(function () {
      const detailName = loadedCheerio(this).find('dt').text().trim();
      const detail = loadedCheerio(this).find('dd').text().trim();

      switch (detailName) {
        case 'Authors':
          novel.author = detail;
          break;
        case 'Current status':
          novel.status = detail;
          break;
      }
    });

    novel.genres = loadedCheerio('.panel-heading:contains(" Genres ")')
      .next()
      .find('a')
      .map((i, el) => loadedCheerio(el).text())
      .toArray()
      .join(',');

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const volumes = JSON.parse(
      loadedCheerio('main')
        .next()
        .html()
        ?.match(/lnmtl.volumes = \[(.*?)\]/)![0]
        ?.replace('lnmtl.volumes = ', '') || '',
    )[+page - 1];

    const chapter: Plugin.ChapterItem[] = [];

    await this.sleep(1000);
    const volumeData = await fetchApi(
      `${this.site}chapter?volumeId=${volumes.id}`,
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
        `${this.site}chapter?page=${i}&volumeId=${volumes.id}`,
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
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    loadedCheerio('.original, script').remove();
    loadedCheerio('sentence.translated').wrap('<p></p>');

    let chapterText = loadedCheerio('.chapter-body').html()?.replace(/„/g, '“');

    if (!chapterText) {
      chapterText = loadedCheerio('.alert.alert-warning').text();
    }

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const body = await fetchApi(this.site).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const list = loadedCheerio('footer')
      .next()
      .next()
      .html()
      ?.match(/prefetch: '\/(.*json)/)![1];

    const search = await fetch(`${this.site}${list}`);
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

  async fetchImage(url: string): Promise<string | undefined> {
    return await fetchFile(url);
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

interface ChapterEntry {
  number: number;
  title: string;
  slug: string;
  created_at: string;
}
