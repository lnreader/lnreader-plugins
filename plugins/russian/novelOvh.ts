import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

class novelOvh implements Plugin.PluginBase {
  id = 'novelovh';
  name = 'НовелОВХ';
  site = 'https://novel.ovh';
  apiSite = 'https://api.novel.ovh/v2/';
  version = '1.0.3';
  icon = 'src/ru/novelovh/icon.png';

  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.apiSite + 'books?page=' + (pageNo - 1);
    url +=
      '&sort=' +
      (showLatestNovels
        ? 'updatedAt'
        : filters?.sort?.value || 'averageRating') +
      ',desc';

    const books: BooksEntity[] = await fetchApi(url).then(res => res.json());

    const novels: Plugin.NovelItem[] = [];
    books.forEach(novel =>
      novels.push({
        name: novel.name.ru,
        cover: novel.poster,
        path: novel.slug,
      }),
    );

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const { book, branches, chapters }: responseNovel = await fetchApi(
      this.site +
        '/content/' +
        novelPath +
        '?_data=routes/reader/book/$slug/index',
    ).then(res => res.json());

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: book.name.ru,
      cover: book.poster,
      genres: book.labels?.map?.(label => label.name).join(','),
      summary: book.description,
      status:
        book.status == 'ONGOING' ? NovelStatus.Ongoing : NovelStatus.Completed,
    };

    book.relations?.forEach(person => {
      switch (person.type) {
        case 'AUTHOR':
          novel.author = person.publisher.name;
          break;
        case 'ARTIST':
          novel.artist = person.publisher.name;
          break;
      }
    });

    const branch_name: Record<string, string> = {};
    if (branches.length) {
      branches.forEach(({ id, publishers }) => {
        if (id && publishers?.length)
          branch_name[id] = publishers[0].name || 'Неизвестный';
      });
    }

    const chaptersRes: Plugin.ChapterItem[] = [];
    chapters.forEach((chapter, chapterIndex) =>
      chaptersRes.push({
        name:
          chapter.title ||
          'Том ' +
            (chapter.volume || 0) +
            ' ' +
            (chapter.name ||
              'Глава ' + (chapter.number || chapters.length - chapterIndex)),
        path: novelPath + '/' + chapter.id,
        releaseTime: dayjs(chapter.createdAt).format('LLL'),
        chapterNumber: chapters.length - chapterIndex,
        page: branch_name[chapter.branchId] || 'Главная страница',
      }),
    );

    novel.chapters = chaptersRes.reverse();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const book: responseChapter = await fetchApi(
      this.apiSite + 'chapters/' + chapterPath.split('/')[1],
    ).then(res => res.json());

    const image = Object.fromEntries(
      book?.pages?.map(({ id, image }) => [id, image]) || [],
    );

    const chapterText = this.jsonToHtml(book.content.content || [], image);
    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = this.apiSite + 'books?type=NOVEL&search=' + searchTerm;
    const books: BooksEntity[] = await fetchApi(url).then(res => res.json());

    const novels: Plugin.NovelItem[] = [];
    books.forEach(novel =>
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
    image: Record<string, string>,
    html = '',
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
            '<p>' +
            (element.content
              ? this.jsonToHtml(element.content, image)
              : '<br>') +
            '</p>';
          break;
        case 'orderedList':
          html +=
            '<ol>' +
            (element.content
              ? this.jsonToHtml(element.content, image)
              : '<br>') +
            '</ol>';
          break;
        case 'listItem':
          html +=
            '<li>' +
            (element.content
              ? this.jsonToHtml(element.content, image)
              : '<br>') +
            '</li>';
          break;
        case 'blockquote':
          html +=
            '<blockquote>' +
            (element.content
              ? this.jsonToHtml(element.content, image)
              : '<br>') +
            '</blockquote>';
          break;
        case 'italic':
          html +=
            '<i>' +
            (element.content
              ? this.jsonToHtml(element.content, image)
              : '<br>') +
            '</i>';
          break;
        case 'bold':
          html +=
            '<b>' +
            (element.content
              ? this.jsonToHtml(element.content, image)
              : '<br>') +
            '</b>';
          break;
        case 'underline':
          html +=
            '<u>' +
            (element.content
              ? this.jsonToHtml(element.content, image)
              : '<br>') +
            '</u>';
          break;
        case 'heading':
          html +=
            '<h2>' +
            (element.content
              ? this.jsonToHtml(element.content, image)
              : '<br>') +
            '</h2>';
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

  resolveUrl = (path: string) => this.site + '/content/' + path;

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

type BooksEntity = {
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
};
type Name = {
  ru: string;
  original: string;
  en: string;
};
type AltNamesEntity = {
  language: string;
  name: string;
};

type responseNovel = {
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
};
type Book = {
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
};
type LabelsEntity = {
  id: string;
  slug: string;
  name: string;
};
type RelationsEntity = {
  type: string;
  publisher: Publisher;
};
type Publisher = {
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
};
type BranchesEntity = {
  id: string;
  licensed: boolean;
  editorsChoice: boolean;
  chaptersCount: number;
  createdAt: string;
  updatedAt: string;
  publishers?: PublishersEntity[] | null;
  subscription?: null;
  bookmark?: null;
};
type PublishersEntity = {
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
};
type ChaptersEntity = {
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
};
type RelatedEntityOrBook = {
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
};
type AssociatedEntity = {
  id: string;
  kind: string;
  createdAt: string;
  updatedAt: string;
  book: RelatedEntityOrBook;
};
type CoversEntity = {
  id: string;
  volume: number;
  image: string;
  createdAt: string;
  updatedAt: string;
};

type responseChapter = {
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
};
type Content = {
  type: string;
  content?: ContentEntity[] | null;
};
type ContentEntity = {
  text?: string | null;
  type: string;
  attrs?: Attrs | null;
  content?: Content[] | null;
};
type Attrs = {
  textAlign?: string;
  pages?: [string];
};
type PagesEntity = {
  id: string;
  image: string;
  index: number;
  commentsCount: number;
  height: number;
  width: number;
  createdAt: string;
};
