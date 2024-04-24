import { Parser } from 'htmlparser2';
import { fetchApi, fetchFile } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';

class LnMTLPlugin implements Plugin.PagePlugin {
  id = 'lnmtl';
  name = 'LnMTL';
  icon = 'src/en/lnmtl/icon.png';
  site = 'https://lnmtl.com/';
  version = '2.0.0';

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

    const body = await fetchApi(link);
    const html = await body.text();
    const baseUrl = this.site;
    let isParsingNovel = false;
    let tempNovel = {} as Plugin.NovelItem; 
    const novels: Plugin.NovelItem[] = [];
    const parser = new Parser ({
      onopentag(name, attribs) {
        if (attribs['class']?.includes('media-left')) {
          isParsingNovel = true;
        }
        if (isParsingNovel) {
          switch (name){
            case 'a':
              tempNovel.path = attribs['href'].slice(baseUrl.length);
              break;
            case 'img':
              tempNovel.name = attribs['alt'];
              tempNovel.cover = attribs['src'];
              break;
          }
          if (tempNovel.path && tempNovel.name){
            novels.push(tempNovel);
            tempNovel = {} as Plugin.NovelItem;
          }
        }
      },
      onclosetag(name){
        if (name === 'div'){
          isParsingNovel = false;
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

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: '',
      totalPages: 1,
      summary: '',
      author: '',
      status: '',
      chapters: [],
    };

    let isScript = false;
    let isDescription = false;
    let isSource = false;
    let isPanelKey = false;
    let isPanelValue = 0;
    let isAuthorKey = false
    let isStatusKey = false
    let isList = 0;
    let isGenres = false;
    let genreArray: string[] = []
    const parser = new Parser({
      onopentag(name,attribs) {
        if (name === 'img' && attribs['class']?.includes('img-rounded')){
          novel.name = attribs['title'];
          novel.cover = attribs['src'];
        }
        if (name === 'ul' && attribs['class']?.includes('list-inline')){
          isList++;
        }
      },
      onopentagname(name){
        if (name === 'dt'){
          isPanelKey = true;
        }
        if (name === 'dd'){
          isPanelValue++;
        }
        if (isList === 1 && name === 'li'){
          isGenres = true;
        }
      },
      onattribute(name, value){
        if (name === 'class' && value === 'description'){
          isDescription = true;
        }
        if (name === 'class' && value === 'source'){
          isDescription = false;
          isSource = true;
        }
        if (name === 'class' && value === 'progress'){
          isSource = false;
        }
      },
      ontext(data){
        if(isScript){
          const volume = JSON.parse(
            data.match(/lnmtl.volumes = (.+])(?=;)/)![1] || ''
          );
          novel.totalPages = volume.length;
        }
        if(isDescription){
          novel.summary += data.trim() + '\n\n';
        }
        if(isSource){
          novel.summary += data;
        }
        if(isPanelKey){
          switch(data){
            case 'Authors':
              isAuthorKey = true;
              break;
            case 'Current status':
              isStatusKey = true;
              break;
          }
        }
        if(isAuthorKey && isPanelValue === 1){
          novel.author += data.trim();
          isAuthorKey = false;
        }
        if(isStatusKey && isPanelValue === 2){
          novel.status += data.trim();
          isStatusKey = false;
        }
        if(isGenres){
          genreArray.push(data.trim());
          novel.genres = genreArray.join(', ');
        }
      },
      onclosetag(name){
        if (name === 'ul'){
          isGenres = false;
        }
        if(name === 'main'){
          isPanelKey = false;
          isScript = true;
        }
        if (name === 'script'){
          isScript = false;
        }
      },
    })
    parser.write(html);
    parser.end();
    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const result = await fetchApi(this.site + novelPath);
    const html = await result.text().then(r => r.replace(/>\s+</g, '><'));
    let isScript = false;
    let volume: VolumeEntry = {
      id: '',
      title: '',
    }
    const parser = new Parser({
      ontext(data){
        if(isScript){
          const volumes = JSON.parse(
            data.match(/lnmtl.volumes = (.+])(?=;)/)![1] || ''
          );
          volume = volumes[+page-1]
        }
      },
      onclosetag(name){
        if(name === 'main'){
          isScript = true;
        }
        if (name === 'script'){
          isScript = false;
        }
      },
    })
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
    let isText = false;
    let chapterText = '';
    const parser = new Parser({
      onopentag(name,attribs){
        if(name === 'sentence' && attribs['class']?.includes('translated')){
          isText = true;
          chapterText += '<p>'
        }
      },
      onopentagname(name){
        if(name === 'nav'){
          isText = false;
        }
      },
      ontext(data){
        if(isText){
          chapterText += data;
        }
      },
      onclosetag(name){
        if (name === 'sentence'){
          chapterText += '</p>'
          isText = false;
        }
      }
    })
    parser.write(html);
    parser.end();

    return chapterText.replace(/„/g, '“');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const html = await fetchApi(this.site)
      .then(b => b.text())
      .then(r => r.replace(/>\s+</g, '><'));
    let isScript = false;
    let isFooter = false;
    let list = ''
    const parser = new Parser({
      onopentag(name, attribs) {
        if(isFooter && name === 'script' && 
        attribs['type']?.includes('application/javascript')){
          isScript = true;
        }
      },
      ontext(data){
        if (isScript){
          list = data.match(/prefetch: '\/(.*json)/)![1];
        }
      },
      onclosetag(name){
        if (name === 'footer'){
          isFooter = true;
        }
        if (name === 'script'){
          isScript = false;
        }
        if (name === 'body'){
          isFooter = false;
        }
      }
    })
    parser.write(html);
    parser.end();

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

interface VolumeEntry {
  id: string;
  title: string;
}
