import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { Parser } from 'htmlparser2';
import dayjs from 'dayjs';

class AuthorToday implements Plugin.PluginBase {
  id = 'AT';
  name = 'Автор Тудей';
  icon = 'src/ru/authortoday/icon.png';
  site = 'https://author.today';
  version = '1.2.1';

  private userAgent =
    'Mozilla/5.0 (Android 15; Mobile; rv:138.0) Gecko/138.0 Firefox/138.0';

  parseNovels(url: string) {
    return fetchApi(url, { headers: { 'User-Agent': this.userAgent } })
      .then(res => res.text())
      .then(html => {
        const novels: Plugin.NovelItem[] = [];
        let tempNovel = {} as Plugin.NovelItem;
        let isParsingNovel = false;
        let isParsingName = false;
        const parser = new Parser({
          onopentag(name, attribs) {
            if (
              name === 'a' &&
              attribs['class'] === 'work-row item-link item-content' &&
              attribs['href']
            ) {
              tempNovel.path = attribs['href'].replace(/\D/g, '');
              isParsingNovel = true;
            }
            if (
              isParsingNovel &&
              name === 'h4' &&
              attribs['class'] === 'work-title'
            ) {
              isParsingName = true;
            }
            if (
              isParsingNovel &&
              name === 'img' &&
              attribs['alt'] === 'Обложка'
            ) {
              tempNovel.cover = attribs['data-src'];
            }
          },
          ontext(data) {
            if (isParsingName) {
              tempNovel.name = data.trim();
            }
          },
          onclosetag(name) {
            if (name === 'h4') {
              isParsingName = false;
            }
            if (name === 'a' && isParsingNovel) {
              if (!tempNovel.cover) {
                tempNovel.cover = defaultCover;
              }
              novels.push(tempNovel);
              tempNovel = {} as Plugin.NovelItem;
              isParsingNovel = false;
            }
          },
        });
        parser.write(html);
        parser.end();
        return novels;
      });
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + '/work/genre/' + (filters?.genre?.value || 'all');

    url +=
      '?sorting=' +
      (showLatestNovels ? 'recent' : filters?.sort?.value || 'popular');

    if (filters?.form?.value) url += '&form=' + filters.form.value;
    if (filters?.state?.value) url += '&state=' + filters.state.value;
    if (filters?.series?.value) url += '&series=' + filters.series.value;
    if (filters?.access?.value) url += '&access=' + filters.access.value;
    if (filters?.promo?.value) url += '&promo=' + filters.promo.value;
    url += '&page=' + pageNo;

    return this.parseNovels(url);
  }

  async parseNovel(workID: string): Promise<Plugin.SourceNovel> {
    const html = await fetchApi(this.resolveUrl(workID, true), {
      headers: { 'User-Agent': this.userAgent },
    }).then(res => res.text());

    const novel: Plugin.SourceNovel = {
      path: workID,
      name: '',
      author: '',
      summary: '',
    };
    const chapters: Plugin.ChapterItem[] = [];
    let isParsingName = false;
    let isParsingAuthor = false;
    let isReadingSummary = false;
    let isParsingGenres = false;
    let isParsingStatus = false;
    let isParsingChapter = false;
    let isReadingChapterName = false;

    let tempChapter = {} as Plugin.ChapterItem;
    const parser = new Parser({
      onopentag(name, attribs) {
        if (name === 'h1' && attribs['class'] === 'card-title') {
          isParsingName = true;
        }
        if (name === 'img' && attribs['class'] === 'cover-image') {
          novel.cover = attribs['src'];
        }
        if (
          name === 'a' &&
          attribs['href'] &&
          attribs['href'].endsWith('/works')
        ) {
          isParsingAuthor = true;
        }
        if (name === 'div' && attribs['class'] === 'rich-content') {
          isReadingSummary = true;
        }
        if (name === 'br' && isReadingSummary) {
          novel.summary += '\n';
        }
        if (name === 'noindex') {
          isParsingGenres = true;
          if (novel.genres) novel.genres = '';
        }
        if (
          name === 'label' &&
          attribs['class'] &&
          attribs['class'].includes('label')
        ) {
          isParsingStatus = true;
        }
        if (name === 'li' && attribs['class'] === 'clearfix') {
          isParsingChapter = true;
        }
        if (name === 'a' && isParsingChapter && attribs['href']) {
          isReadingChapterName = true;
          tempChapter.path = attribs.href.replace('/reader/', '');
        }
        if (name === 'span' && attribs['data-time']) {
          tempChapter.releaseTime = dayjs(attribs['data-time']).format('LLL');
        }
      },
      ontext(data) {
        if (isParsingName) {
          novel.name = data.trim();
          isParsingName = false;
        }
        if (isParsingAuthor && data.trim()) {
          novel.author += data.trim() + ', ';
        }
        if (isReadingSummary) {
          novel.summary += data.trim();
        }
        if (isParsingGenres) {
          novel.genres += data;
        }
        if (isParsingStatus) {
          const status = data.trim();
          switch (status) {
            case 'в процессе':
              novel.status = NovelStatus.Ongoing;
              break;
            case 'весь текст':
              novel.status = NovelStatus.Completed;
              break;
            default:
              novel.status = NovelStatus.Unknown;
              break;
          }
        }
        if (isReadingChapterName) {
          tempChapter.name = data.trim();
          isReadingChapterName = false;
        }
      },
      onclosetag(name) {
        if (name === 'div' && isParsingAuthor) {
          isParsingAuthor = false;
          novel.author = novel.author?.slice(0, -2);
        }
        if (name === 'div' && isReadingSummary) {
          isReadingSummary = false;
        }
        if (name === 'noindex') {
          isParsingGenres = false;
        }
        if (name === 'label') {
          isParsingStatus = false;
        }
        if (name === 'li' && isParsingChapter) {
          tempChapter.chapterNumber = chapters.length;
          if (tempChapter.path) {
            chapters?.push(tempChapter);
          }
          tempChapter = {} as Plugin.ChapterItem;
          isParsingChapter = false;
        }
      },
    });
    parser.write(html);
    parser.end();

    if (!novel.cover) {
      novel.cover = defaultCover;
    }
    if (!chapters.length) {
      chapters.push({
        name: 'Рассказ',
        path: workID,
      });
    }
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await fetchApi(this.resolveUrl(chapterPath), {
      headers: { 'User-Agent': this.userAgent },
    }).then(res => res.text());

    let [workID, chapterID] = chapterPath.split('/');
    const userRaw = html.match(/userId:(.*?),/)?.[1]?.trim();
    const userId = userRaw === 'null' ? '' : userRaw;

    if (!chapterID) {
      chapterID = html.match(/chapterId:(.*?),/)?.[1]?.trim() || '';
    }
    if (!chapterID) throw new Error('Chapter ID not found');

    const chapter = await fetchApi(
      this.site + '/reader/' + workID + '/chapter?id=' + chapterID,
      {
        headers: { 'User-Agent': this.userAgent },
      },
    );
    const chapterJson: Result = await chapter.json();
    const key = chapter.headers.get('reader-secret');

    if (!key)
      throw new Error('Failed to find the token\n' + chapterJson.messages);

    const chapterText = decrypt(chapterJson.data.text, key, userId);
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number | undefined = 1,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site + '/search?category=works&q=' + searchTerm + '&page=' + pageNo;

    return this.parseNovels(url);
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/work/' : '/reader/') + path;

  filters = {
    sort: {
      label: 'Сортировка',
      value: 'popular',
      options: [
        { label: 'По популярности', value: 'popular' },
        { label: 'По количеству лайков', value: 'likes' },
        { label: 'По комментариям', value: 'comments' },
        { label: 'По новизне', value: 'recent' },
        { label: 'По просмотрам', value: 'views' },
        { label: 'Набирающие популярность', value: 'trending' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Жанры',
      value: '',
      options: [
        { label: 'Все', value: '' },
        { label: 'Альтернативная история', value: 'sf-history' },
        { label: 'Антиутопия', value: 'dystopia' },
        { label: 'Бизнес-литература', value: 'biznes-literatura' },
        { label: 'Боевая фантастика', value: 'sf-action' },
        { label: 'Боевик', value: 'action' },
        { label: 'Боевое фэнтези', value: 'fantasy-action' },
        { label: 'Бояръ-Аниме', value: 'boyar-anime' },
        { label: 'Героическая фантастика', value: 'sf-heroic' },
        { label: 'Героическое фэнтези', value: 'heroic-fantasy' },
        { label: 'Городское фэнтези', value: 'urban-fantasy' },
        { label: 'Детектив', value: 'detective' },
        { label: 'Детская литература', value: 'detskaya-literatura' },
        { label: 'Документальная проза', value: 'non-fiction' },
        { label: 'Историческая проза', value: 'historical-fiction' },
        { label: 'Исторические приключения', value: 'historical-adventure' },
        { label: 'Исторический детектив', value: 'historical-mystery' },
        { label: 'Исторический любовный роман', value: 'historical-romance' },
        { label: 'Историческое фэнтези', value: 'historical-fantasy' },
        { label: 'Киберпанк', value: 'cyberpunk' },
        { label: 'Короткий любовный роман', value: 'short-romance' },
        { label: 'Космическая фантастика', value: 'sf-space' },
        { label: 'ЛитРПГ', value: 'litrpg' },
        { label: 'Любовное фэнтези', value: 'love-fantasy' },
        { label: 'Любовные романы', value: 'romance' },
        { label: 'Мистика', value: 'paranormal' },
        { label: 'Назад в СССР', value: 'back-to-ussr' },
        { label: 'Научная фантастика', value: 'science-fiction' },
        { label: 'Подростковая проза', value: 'teen-prose' },
        { label: 'Политический роман', value: 'political-fiction' },
        { label: 'Попаданцы', value: 'popadantsy' },
        { label: 'Попаданцы в космос', value: 'popadantsy-v-kosmos' },
        {
          label: 'Попаданцы в магические миры',
          value: 'popadantsy-v-magicheskie-miry',
        },
        { label: 'Попаданцы во времени', value: 'popadantsy-vo-vremeni' },
        { label: 'Постапокалипсис', value: 'postapocalyptic' },
        { label: 'Поэзия', value: 'poetry' },
        { label: 'Приключения', value: 'adventure' },
        { label: 'Публицистика', value: 'publicism' },
        { label: 'Развитие личности', value: 'razvitie-lichnosti' },
        { label: 'Разное', value: 'other' },
        { label: 'РеалРПГ', value: 'realrpg' },
        { label: 'Романтическая эротика', value: 'romantic-erotika' },
        { label: 'Сказка', value: 'fairy-tale' },
        { label: 'Современная проза', value: 'modern-prose' },
        { label: 'Современный любовный роман', value: 'contemporary-romance' },
        { label: 'Социальная фантастика', value: 'sf-social' },
        { label: 'Стимпанк', value: 'steampunk' },
        { label: 'Темное фэнтези', value: 'dark-fantasy' },
        { label: 'Триллер', value: 'thriller' },
        { label: 'Ужасы', value: 'horror' },
        { label: 'Фантастика', value: 'sci-fi' },
        {
          label: 'Фантастический детектив',
          value: 'detective-science-fiction',
        },
        { label: 'Фанфик', value: 'fanfiction' },
        { label: 'Фэнтези', value: 'fantasy' },
        { label: 'Шпионский детектив', value: 'spy-mystery' },
        { label: 'Эпическое фэнтези', value: 'epic-fantasy' },
        { label: 'Эротика', value: 'erotica' },
        { label: 'Эротическая фантастика', value: 'sf-erotika' },
        { label: 'Эротический фанфик', value: 'fanfiction-erotika' },
        { label: 'Эротическое фэнтези', value: 'fantasy-erotika' },
        { label: 'Юмор', value: 'humor' },
        { label: 'Юмористическая фантастика', value: 'sf-humor' },
        { label: 'Юмористическое фэнтези', value: 'ironical-fantasy' },
      ],
      type: FilterTypes.Picker,
    },
    form: {
      label: 'Форма произведения',
      value: '',
      options: [
        { label: 'Любой', value: '' },
        { label: 'Перевод', value: 'translation' },
        { label: 'Повесть', value: 'tale' },
        { label: 'Рассказ', value: 'story' },
        { label: 'Роман', value: 'novel' },
        { label: 'Сборник поэзии', value: 'poetry' },
        { label: 'Сборник рассказов', value: 'story-book' },
      ],
      type: FilterTypes.Picker,
    },
    state: {
      label: 'Статус произведения',
      value: '',
      options: [
        { label: 'Любой статус', value: '' },
        { label: 'В процессе', value: 'in-progress' },
        { label: 'Завершено', value: 'finished' },
      ],
      type: FilterTypes.Picker,
    },
    series: {
      label: 'Статус цикла',
      value: '',
      options: [
        { label: 'Не важно', value: '' },
        { label: 'Вне цикла', value: 'out' },
        { label: 'Цикл завершен', value: 'finished' },
        { label: 'Цикл не завершен', value: 'unfinished' },
      ],
      type: FilterTypes.Picker,
    },
    access: {
      label: 'Тип доступа',
      value: '',
      options: [
        { label: 'Любой', value: '' },
        { label: 'Платный', value: 'paid' },
        { label: 'Бесплатный', value: 'free' },
      ],
      type: FilterTypes.Picker,
    },
    promo: {
      label: 'Промо-фрагмент',
      value: 'hide',
      options: [
        { label: 'Скрывать', value: 'hide' },
        { label: 'Показывать', value: 'show' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new AuthorToday();

function decrypt(
  encrypt: string,
  encryptedKey: string,
  userId: string | number = '',
) {
  const key = encryptedKey.split('').reverse().join('') + '@_@' + userId;
  const keyBytes = key.split('').map(char => char.charCodeAt(0));
  const keyLength = keyBytes.length;
  let text = '';

  for (let i = 0; i < encrypt.length; i++) {
    text += String.fromCharCode(
      encrypt.charCodeAt(i) ^ keyBytes[i % keyLength],
    );
  }

  return text;
}

type Result = {
  isSuccessful: boolean;
  isWarning: boolean;
  messages: string | null;
  data: Data;
};

type Data = {
  text: string;
};
