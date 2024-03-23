import { Plugin } from '@typings/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi, fetchFile } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

class novelOvh implements Plugin.PluginBase {
  id = 'novelovh';
  name = 'НовелОВХ';
  site = 'https://novel.ovh';
  version = '1.0.0';
  icon = 'src/ru/novelovh/icon.png';

  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + '/novel?page=' + (pageNo - 1);
    url +=
      '&sort=' +
      (showLatestNovels
        ? 'updatedAt'
        : filters?.sort?.value || 'averageRating') +
      ',desc';

    const result = await fetchApi(url + '&_data=routes/reader/book/index');
    const body = (await result.json()) as { books: BooksEntity[] };

    const novels: Plugin.NovelItem[] = [];
    body.books.forEach(novel =>
      novels.push({
        name: novel.name.ru,
        cover: novel.poster,
        path: novel.slug,
      }),
    );

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(
      this.resolveUrl(novelPath, true) +
        '?_data=routes/reader/book/$slug/index',
    );
    const json = (await result.json()) as responseNovel;

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: json.book.name.ru,
      cover: json.book.poster,
      genres: json.book.labels?.map?.(label => label.name).join(','),
      summary: json.book.description,
      status:
        json.book.status == 'ONGOING'
          ? NovelStatus.Ongoing
          : NovelStatus.Completed,
    };

    json.book.relations?.forEach(person => {
      switch (person.type) {
        case 'AUTHOR':
          novel.author = person.publisher.name;
        case 'ARTIST':
          novel.artist = person.publisher.name;
      }
    });

    const chapters: Plugin.ChapterItem[] = [];

    json.chapters.forEach((chapter, chapterIndex) =>
      chapters.push({
        name:
          chapter.title ||
          'Том ' +
            (chapter.volume || 0) +
            ' ' +
            (chapter.name ||
              'Глава ' +
                (chapter.number || json.chapters.length - chapterIndex)),
        path: novelPath + '/' + chapter.id + '/0',
        releaseTime: dayjs(chapter.createdAt).format('LLL'),
        chapterNumber: json.chapters.length - chapterIndex,
      }),
    );

    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(
      'https://api.novel.ovh/v2/chapters/' + chapterPath.split('/')[1],
    );
    const book = (await result.json()) as responseChapter;
    const image = Object.fromEntries(
      book?.pages?.map(({ id, image }) => [id, image]) || [],
    );

    const chapterText = this.jsonToHtml(book.content.content || [], image);
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number | undefined = 1,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/novel?search=${searchTerm}&page=${page - 1}`;
    const result = await fetchApi(url + '&_data=routes/reader/book/index');
    const body = (await result.json()) as { books: BooksEntity[] };

    const novels: Plugin.NovelItem[] = [];
    body.books.forEach(novel =>
      novels.push({
        name: novel.name.ru,
        cover: novel.poster,
        path: novel.slug,
      }),
    );

    return novels;
  }

  jsonToHtml = (
    json: ContentEntity[],
    image: { [key: string]: string },
    html: string = '',
  ) => {
    json.forEach(element => {
      switch (element.type) {
        case 'image':
          if (element.attrs?.pages?.[0]) {
            html += `<img src="${image[element.attrs.pages[0]]}"/>`;
          }
          break;
        case 'hardBreak':
          html += '<br>';
          break;
        case 'horizontalRule':
        case 'delimiter':
          html += '<h2 style="text-align: center">***</h2>';
          break;
        case 'paragraph':
          html +=
            '<p' +
            (element?.attrs?.textAlign
              ? ` style="text-align: ${element.attrs.textAlign}"`
              : '') +
            '>' +
            (element.content
              ? this.jsonToHtml(element.content, image)
              : '<br>') +
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
  };

  fetchImage = fetchFile;
  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + '/novel/' + path;

  filters = {
    sort: {
      label: 'Сортировка',
      value: 'averageRating',
      options: [
        { label: 'Кол-во просмотров', value: 'viewsCount' },
        { label: 'Кол-во лайков', value: 'likesCount' },
        { label: 'Кол-во глав', value: 'chaptersCount' },
        { label: 'Кол-во закладок', value: 'bookmarksCount' },
        { label: 'Рейтингу', value: 'averageRating' },
        { label: 'Дате создания', value: 'createdAt' },
        { label: 'Дате обновления', value: 'updatedAt' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new novelOvh();

interface BooksEntity {
  id: string;
  slug: string;
  type: string;
  serviceName: string;
  poster: string;
  background?: string | null;
  featuredCharacter?: null;
  featuredCharacterBackground?: null;
  featuredCharacterAnimation?: null;
  featuredCharacterAnimationWithMask?: null;
  featuredCharacterAnimationFirstFrame?: null;
  status: string;
  contentStatus: string;
  name: Name;
  altNames?: AltNamesEntity[] | null;
  country: string;
  year: number;
  formats?: null[] | null;
  featured: boolean;
  viewsCount: number;
  likesCount: number;
  bookmarksCount: number;
  ratingVotesCount: number;
  averageRating: number;
  chaptersCount: number;
  createdAt: string;
  updatedAt: string;
}
interface Name {
  ru: string;
  original: string;
  en: string;
}
interface AltNamesEntity {
  language: string;
  name: string;
}

interface responseNovel {
  book: Book;
  branches: BranchesEntity[];
  chapters: ChaptersEntity[];
  related?: RelatedEntityOrBook[] | null;
  associated?: AssociatedEntity[] | null;
  chapterLikes?: null[] | null;
  covers?: CoversEntity[] | null;
  promotionVideos?: null[] | null;
  folderItems?: null[] | null;
  contentNotices?: null[] | null;
}
interface Book {
  id: string;
  slug: string;
  type: string;
  serviceName: string;
  poster: string;
  background?: null;
  featuredCharacter?: null;
  featuredCharacterBackground?: null;
  featuredCharacterAnimation?: null;
  featuredCharacterAnimationWithMask?: null;
  featuredCharacterAnimationFirstFrame?: null;
  contentBlockedCountries?: null[] | null;
  status: string;
  contentStatus: string;
  moderationStatus: string;
  name: Name;
  altNames?: null[] | null;
  externalLinks?: string[] | null;
  description: string;
  country: string;
  year: number;
  formats?: null[] | null;
  featured: boolean;
  viewsCount: number;
  viewsDayCount: number;
  viewsWeekCount: number;
  viewsMonthCount: number;
  likesCount: number;
  bookmarksCount: number;
  ratingVotesCount: number;
  averageRating: number;
  chaptersCount: number;
  labels?: LabelsEntity[] | null;
  relations?: RelationsEntity[] | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  rating?: null;
}
interface LabelsEntity {
  id: string;
  slug: string;
  name: string;
}
interface RelationsEntity {
  type: string;
  publisher: Publisher;
}
interface Publisher {
  id: string;
  kind: string;
  slug: string;
  name: string;
  altNames?: (AltNamesEntity | null)[] | null;
  poster: string;
  background?: null;
  trusted: boolean;
  donationsEnabled: boolean;
  vkGroupId?: null;
  vkGroupName?: null;
  tonAddress?: null;
  createdAt: string;
  updatedAt: string;
}
interface BranchesEntity {
  id: string;
  licensed: boolean;
  editorsChoice: boolean;
  chaptersCount: number;
  createdAt: string;
  updatedAt: string;
  publishers?: PublishersEntity[] | null;
  subscription?: null;
  bookmark?: null;
}
interface PublishersEntity {
  id: string;
  kind: string;
  slug: string;
  name: string;
  altNames?: AltNamesEntity[] | null;
  poster: string;
  background?: null;
  trusted: boolean;
  donationsEnabled: boolean;
  vk?: null;
  tonAddress?: null;
  createdAt: string;
  updatedAt: string;
}
interface ChaptersEntity {
  id: string;
  name?: string | null;
  title?: string | null;
  number: number;
  volume: number;
  likesCount: number;
  commentsCount: number;
  donut: boolean;
  corrupted: boolean;
  createdById: string;
  branchId: string;
  bookId: string;
  createdAt: string;
  expiredAt: string;
  updatedAt: string;
}
interface RelatedEntityOrBook {
  id: string;
  type: string;
  slug: string;
  poster: string;
  motion?: null;
  status: string;
  contentStatus: string;
  name: Name;
  country: string;
  year: number;
  formats?: null[] | null;
  viewsCount: number;
  likesCount: number;
  bookmarksCount: number;
  ratingVotesCount: number;
  averageRating: number;
  createdAt: string;
  updatedAt: string;
}
interface AssociatedEntity {
  id: string;
  kind: string;
  createdAt: string;
  updatedAt: string;
  book: RelatedEntityOrBook;
}
interface CoversEntity {
  id: string;
  volume: number;
  image: string;
  createdAt: string;
  updatedAt: string;
}

interface responseChapter {
  id: string;
  name?: string;
  title: string;
  number: number;
  volume: number;
  likesCount: number;
  commentsCount: number;
  moderationStatus: string;
  content: Content;
  pages?: PagesEntity[];
  donut: boolean;
  corrupted: boolean;
  createdById: string;
  branchId: string;
  bookId: string;
  publishers?: PublishersEntity[] | null;
  createdAt: string;
  expiredAt: string;
  updatedAt: string;
}
interface Content {
  type: string;
  content?: ContentEntity[] | null;
}
interface ContentEntity {
  text?: string | null;
  type: string;
  attrs?: Attrs | null;
  content?: Content[] | null;
}
interface Attrs {
  textAlign?: string;
  pages?: [string];
}
interface PagesEntity {
  id: string;
  image: string;
  index: number;
  commentsCount: number;
  height: number;
  width: number;
  createdAt: string;
}
