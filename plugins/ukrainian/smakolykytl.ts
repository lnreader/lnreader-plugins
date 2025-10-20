import { Plugin } from '@/types/plugin';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

class Smakolykytl implements Plugin.PluginBase {
  id = 'smakolykytl';
  name = 'Смаколики';
  site = 'https://smakolykytl.site/';
  apiSite = 'https://api.smakolykytl.site/api/user';
  version = '1.0.1';
  icon = 'src/uk/smakolykytl/icon.png';

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels ? '/updates' : '/projects';

    const result = await fetchApi(this.apiSite + sort);
    const json = (await result.json()) as response;

    const novels: Plugin.NovelItem[] = [];
    (json?.projects || json?.updates)?.forEach(novel =>
      novels.push({
        name: novel.title,
        cover: novel.image.url,
        path: 'titles/' + novel.id,
      }),
    );

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const id = novelPath.split('/').pop();
    const result = await fetchApi(this.apiSite + '/projects/' + id);
    const book = (await result.json()) as response;

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: book?.project?.title || '',
      cover: book?.project?.image?.url,
      summary: book?.project?.description,
      author: book?.project?.author,
      status: book?.project?.status_translate.includes('Триває')
        ? NovelStatus.Ongoing
        : NovelStatus.Completed,
    };
    const tags = [book?.project?.genres, book?.project?.tags]
      .flat()
      .map(tags => tags?.title)
      .filter(tags => tags);

    if (tags.length) {
      novel.genres = tags.join(', ');
    }

    const chapters: Plugin.ChapterItem[] = [];
    const res = await fetchApi(this.apiSite + '/projects/' + id + '/books');
    const data = (await res.json()) as response;
    data?.books?.forEach(volume =>
      volume?.chapters?.forEach(chapter =>
        chapters.push({
          name: volume.title + ' ' + chapter.title,
          path: 'read/' + chapter.id,
          releaseTime: dayjs(chapter.modifiedAt).format('LLL'),
          chapterNumber: chapters.length + 1,
        }),
      ),
    );

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const id = chapterPath.split('/').pop();
    const result = await fetchApi(this.apiSite + '/chapters/' + id);
    const json = (await result.json()) as response;
    const chapterRaw: HTML[] = JSON.parse(json?.chapter?.content || '[]');

    const chapterText = jsonToHtml(chapterRaw);
    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const result = await fetchApi(this.apiSite + '/projects');
    const json = (await result.json()) as response;
    const searchTitle = searchTerm.toLowerCase();
    const novels: Plugin.NovelItem[] = [];

    json?.projects
      ?.filter(
        ({ title, id }) =>
          title.toLowerCase().includes(searchTitle) || String(id) == searchTerm,
      )
      ?.forEach(novel =>
        novels.push({
          name: novel.title,
          cover: novel.image.url,
          path: 'titles/' + novel.id,
        }),
      );
    return novels;
  }
}

export default new Smakolykytl();

function jsonToHtml(json: HTML[], html = '') {
  json.forEach(element => {
    switch (element.type) {
      case 'hardBreak':
        html += '<br>';
        break;
      case 'horizontalRule':
        html += '<hr>';
        break;
      case 'image':
        if (element.attrs) {
          const attrs = Object.entries(element.attrs)
            .filter(attr => attr?.[1])
            .map(attr => `${attr[0]}="${attr[1]}"`);
          html += '<img ' + attrs.join('; ') + '>';
        }
        break;
      case 'paragraph':
        html +=
          '<p>' +
          (element.content ? jsonToHtml(element.content) : '<br>') +
          '</p>';
        break;
      case 'text':
        html += element.text;
        break;
      default:
        html += JSON.stringify(element, null, '\t'); //maybe I missed something.
        break;
    }
  });
  return html;
}

type response = {
  projects?: TopLevelProject[];
  updates?: Update[];
  project?: TopLevelProject;
  books?: BookElement[];
  chapter?: TopLevelChapter;
};

type BookElement = {
  id: number;
  rank: number;
  title: string;
  chapters: PurpleChapter[];
};

type PurpleChapter = {
  id: number;
  title: string;
  rank: string;
  modifiedAt: Date;
};

type TopLevelChapter = {
  id: number;
  title: string;
  rank: string;
  content: string;
  modifiedAt: Date;
  book: ChapterBook;
};

type ChapterBook = {
  id: number;
  rank: number;
  title: string;
  chapters: FluffyChapter[];
  project: BookProject;
};

type FluffyChapter = {
  id: number;
  rank: string;
};

type BookProject = {
  id: number;
};

type TopLevelProject = {
  id: number;
  title: string;
  description: string;
  author: string;
  translator: string;
  modifiedAt: Date;
  alternatives: string;
  release: string;
  nation: string;
  status: string;
  status_translate: string;
  image: Image;
  tags?: Genre[];
  genres?: Genre[];
};

type Genre = {
  id: number;
  title: string;
};

type Image = {
  id: number;
  url: string;
  name: string;
};

type Update = {
  id: number;
  title: string;
  author: string;
  translator: string;
  modifiedAt: Date;
  image: Image;
};

type HTML = {
  type: string;
  content?: HTML[];
  attrs?: Attrs;
  text?: string;
};

type Attrs = {
  src: string;
  alt: string | null;
  title: string | null;
};
