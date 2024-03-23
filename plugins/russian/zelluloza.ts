import { Plugin } from '@typings/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi, fetchFile } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import dayjs from 'dayjs';
import qs from 'qs';

class Zelluloza implements Plugin.PluginBase {
  id = 'zelluloza';
  name = 'Целлюлоза';
  site = 'https://zelluloza.ru';
  version = '1.0.0';
  icon = 'src/ru/zelluloza/icon.png';

  async popularNovels(
    pageNo: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels ? '0.0' : filters?.sort?.value || '6.0';
    const genres = filters?.genres?.value || '';

    const body = await fetchApi(this.site + '/ajaxcall/', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: this.site + '/top/freebooks/',
        Origin: this.site,
      },
      method: 'POST',
      body: qs.stringify({
        op: 'morebooks',
        par1: '',
        par2: `125:0:${genres}:0.${sort}.0.0.0.0.0.0.0.0.0.1.s.1..:${pageNo}`,
        par4: '',
      }),
    }).then(res => res.text());
    const loadedCheerio = parseHTML(body);
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('div[style="display: flex"]').each((index, element) => {
      novels.push({
        name: loadedCheerio(element).find('span[itemprop="name"]').text() || '',
        cover:
          this.site +
          loadedCheerio(element).find('img[class="shadow"]').attr('src'),
        path: (
          loadedCheerio(element).find('img[class="shadow"]').attr('onclick') ||
          ''
        ).replace(/\D/g, ''),
      });
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.resolveUrl(novelPath, true)).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('span[itemprop="name"]').text(),
      cover: this.site + loadedCheerio('img[class="shadow"]').attr('src'),
      genres: loadedCheerio('.gnres').text()?.split?.(': ')?.[1],
      summary:
        loadedCheerio('#bann_full').text() ||
        loadedCheerio('#bann_short').text(),
      author: loadedCheerio('.author_link').text(),
      status: loadedCheerio('.tech_decription').text().includes('Пишется')
        ? NovelStatus.Ongoing
        : NovelStatus.Completed,
    };

    const chapters: Plugin.ChapterItem[] = [];
    loadedCheerio('ul[class="g0"] div[class="w800_m"]').each(
      (chapterIndex, element) => {
        const isFree = loadedCheerio(element).find(
          'div[class="chaptfree"]',
        ).length;
        if (isFree) {
          const chapter = loadedCheerio(element).find('a[class="chptitle"]');
          const releaseDate = loadedCheerio(element)
            .find('div[class="stat"]')
            .text();
          chapters.push({
            name: chapter.text().trim(),
            path: (chapter.attr('href') || '').split('/').slice(2, 4).join('/'),
            releaseTime: this.parseDate(releaseDate),
            chapterNumber: chapterIndex + 1,
          });
        }
      },
    );

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [bookID, chapterID] = chapterPath.split('/');
    const body = await fetchApi(this.site + '/ajaxcall/', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: this.resolveUrl(chapterPath),
        Origin: this.site,
      },
      method: 'POST',
      body: qs.stringify({
        op: 'getbook',
        par1: bookID,
        par2: chapterID,
      }),
    }).then(res => res.text());

    const encrypted = body.split('<END>')[0].split('\n');
    const decrypted = encrypted
      .map(str => decrypt(str))
      .join('')
      .replace(/\r/g, '')
      .trim();

    const chapterText = decrypted //cosmetic filters
      .replace(/\[\*]([\s\S]*?)\[\/]/g, '<b>$1</b>')
      .replace(/\[_]([\s\S]*?)\[\/]/g, '<u>$1</u>')
      .replace(/\[-]([\s\S]*?)\[\/]/g, '<s>$1</s>')
      .replace(/\[~]([\s\S]*?)\[\/]/g, '<i>$1</i>'); /*
      .replace(/\[!]([\s\S]*?)\[\/]/g, '<span style="font-family: Times New Roman">$1</span>')
      .replace(/\[ctr]([\s\S]*?)\[\/]/g, "<center>$1</center>")
      .replace(/\[rht]([\s\S]*?)\[\/]/g, '<span style="text-align: right">$1</span>')
      .replace(/\[grn]([\s\S]*?)\[\/]/g, '<span style="color: #019208">$1</span>')
      .replace(/\[red]([\s\S]*?)\[\/]/g, '<span style="color: #E84040">$1</span>')
      .replace(/\[blu]([\s\S]*?)\[\/]/g, '<span style="color: #354FA3">$1</span>')
      .replace(/\[gry]([\s\S]*?)\[\/]/g, '<span style="color: #909090">$1</span>')
      .replace(/\[geo]([\s\S]*?)\[\/]/g, '<span style="font-family: Georgia">$1</span>')
      .replace(/\[gld]([\s\S]*?)\[\/]/g, '<span style="color: #988c07">$1</span>');*/

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const body = await fetchApi(this.site + '/ajaxcall/', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: this.site + '/search/done/#result',
        Origin: this.site,
      },
      method: 'POST',
      body: qs.stringify({
        op: 'morebooks',
        par1: searchTerm,
        par2: '206:0:0:0.0.0.0.0.0.0.10.0.0.0.0.0..0..:' + pageNo,
        par4: '',
      }),
    }).then(res => res.text());
    const loadedCheerio = parseHTML(body);
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('div[style="display: flex"]').each((index, element) => {
      novels.push({
        name: loadedCheerio(element).find('span[itemprop="name"]').text() || '',
        cover:
          this.site +
          loadedCheerio(element).find('img[class="shadow"]').attr('src'),
        path: (
          loadedCheerio(element).find('img[class="shadow"]').attr('onclick') ||
          ''
        ).replace(/\D/g, ''),
      });
    });

    return novels;
  }

  parseDate = (dateString: string | undefined = '') => {
    const [, day, month, year, hour, minute] =
      dateString.match(/(\d{2})\.(\d{2})\.(\d{4})г (\d{2}):(\d{2})/) || [];

    if (day && month && year && hour && minute) {
      return dayjs(
        year + '-' + month + '-' + day + ' ' + hour + ':' + minute,
      ).format('LLL');
    }

    return null;
  };

  fetchImage = fetchFile;
  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + '/books/' + path;

  filters = {
    sort: {
      label: 'Сортировка',
      value: '6.0',
      options: [
        { label: 'Топ-недели', value: '6.0' },
        { label: 'Бестселеры', value: '5.0' },
        { label: 'Популярные у читателей', value: '2.0' },
        { label: 'Книжные новинки', value: '0.0' },
        { label: 'Законченные книги', value: '0.1' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'Жанры',
      value: '',
      options: [
        { label: 'Все', value: '' },
        { label: '16+', value: '204' },
        { label: '18+', value: '100' },
        { label: 'Авантюра', value: '347' },
        { label: 'Альтернативная история', value: '55' },
        { label: 'Ангст', value: '463' },
        { label: 'Аниме', value: '405' },
        { label: 'Антиутопия', value: '21' },
        { label: 'Апокалипсис', value: '368' },
        { label: 'Аудиокнига', value: '391' },
        { label: 'Байки', value: '435' },
        { label: 'Бизнес-книги', value: '522' },
        { label: 'Биография', value: '52' },
        { label: 'Биопанк', value: '379' },
        { label: 'Боевая фантастика', value: '512' },
        { label: 'Боевик', value: '61' },
        { label: 'Боевые искусства', value: '142' },
        { label: 'Бояръ-аниме', value: '433' },
        { label: 'Вбоквелл', value: '372' },
        { label: 'Вестерн', value: '96' },
        { label: 'Война миров', value: '137' },
        { label: 'Восточное фэнтези', value: '505' },
        { label: 'Городское фентези', value: '63' },
        { label: 'Городское фэнтези', value: '520' },
        { label: 'Готика', value: '83' },
        { label: 'Детективы', value: '4' },
        { label: 'Детские книги', value: '8' },
        { label: 'Документальные книги', value: '351' },
        { label: 'Дом и дача', value: '534' },
        { label: 'Дорожные истории', value: '41' },
        { label: 'Драма', value: '47' },
        { label: 'Древняя литература', value: '529' },
        { label: 'Женский психологический роман', value: '186' },
        { label: 'Женский роман', value: '141' },
        { label: 'Зарубежная классика', value: '524' },
        { label: 'Здоровье и красота', value: '533' },
        { label: 'Изучение языков', value: '537' },
        { label: 'Иронический детектив', value: '85' },
        { label: 'Исследования', value: '156' },
        { label: 'Историческая литература', value: '3' },
        { label: 'Исторический любовный роман', value: '518' },
        { label: 'Историческое фэнтези', value: '90' },
        { label: 'Киберпанк', value: '7' },
        { label: 'Классическая литература', value: '9' },
        { label: 'Книга-игра', value: '371' },
        { label: 'Книги для родителей', value: '535' },
        { label: 'Комедия', value: '80' },
        { label: 'Конкурсные сборники', value: '349' },
        { label: 'Короткий любовный роман', value: '517' },
        { label: 'Космическая фантастика', value: '513' },
        { label: 'Космоопера', value: '58' },
        { label: 'Криминальная проза', value: '35' },
        { label: 'Криптоистория', value: '400' },
        { label: 'Ксенофантастика', value: '102' },
        { label: 'Культура и искусство', value: '536' },
        { label: 'Легенды', value: '161' },
        { label: 'Лирика', value: '49' },
        { label: 'ЛитРПГ', value: '62' },
        { label: 'Любовная фантастика', value: '516' },
        { label: 'Любовное фэнтези', value: '515' },
        { label: 'Любовный роман', value: '46' },
        { label: 'Магический реализм', value: '42' },
        { label: 'Матриархат', value: '385' },
        { label: 'Медицина', value: '57' },
        { label: 'Мелодрама', value: '45' },
        { label: 'Мемуары', value: '532' },
        { label: 'Метафизика', value: '430' },
        { label: 'Милитари', value: '126' },
        { label: 'Мистика', value: '22' },
        { label: 'Морские приключения', value: '211' },
        { label: 'Мотивация', value: '135' },
        { label: 'Научная фантастика', value: '122' },
        { label: 'Научно-популярная', value: '43' },
        { label: 'Ненаучная фантастика', value: '387' },
        { label: 'Новелла', value: '498' },
        { label: 'Нон-фикшн', value: '507' },
        { label: 'Нуар', value: '121' },
        { label: 'О войне', value: '136' },
        { label: 'Оккультизм', value: '424' },
        { label: 'Параллельные миры', value: '438' },
        { label: 'Пародия', value: '108' },
        { label: 'Подростковая фантастика', value: '27' },
        { label: 'Подростковый роман', value: '388' },
        { label: 'Подростковый ужастик', value: '110' },
        { label: 'Постапокалипсис', value: '82' },
        { label: 'Постапокалиптика', value: '67' },
        { label: 'Поэзия', value: '44' },
        { label: 'Превращение', value: '170' },
        { label: 'Приключение', value: '497' },
        { label: 'Приключения', value: '5' },
        { label: 'Природа и животные', value: '538' },
        { label: 'Проза', value: '95' },
        { label: 'Производственный роман', value: '148' },
        { label: 'Психология', value: '31' },
        { label: 'Путешествия', value: '383' },
        { label: 'Рассказы', value: '101' },
        { label: 'Реализм', value: '422' },
        { label: 'РеалРПГ', value: '442' },
        { label: 'Религия', value: '188' },
        { label: 'Робинзонада', value: '434' },
        { label: 'Романтика', value: '130' },
        { label: 'Романтическая фантастика', value: '501' },
        { label: 'Русская классика', value: '523' },
        { label: 'Рыцарский роман', value: '112' },
        { label: 'Символизм', value: '439' },
        { label: 'Сказки', value: '93' },
        { label: 'Славянское фэнтези', value: '508' },
        { label: 'Сновидения', value: '428' },
        { label: 'Современный любовный роман', value: '519' },
        { label: 'Социально-психологическая фантастика', value: '98' },
        { label: 'Спорт', value: '147' },
        { label: 'Справочники', value: '528' },
        { label: 'Стимпанк', value: '56' },
        { label: 'Субкультура', value: '209' },
        { label: 'Сюрреализм', value: '26' },
        { label: 'Тёмное фэнтези', value: '437' },
        { label: 'Техномагия', value: '159' },
        { label: 'Триллер', value: '6' },
        { label: 'Трэш', value: '162' },
        { label: 'Ужасы', value: '531' },
        { label: 'Утопия', value: '191' },
        { label: 'Учебник', value: '411' },
        { label: 'Фантастика', value: '1' },
        { label: 'Фантастический боевик', value: '38' },
        { label: 'Фанфик', value: '111' },
        { label: 'Философия', value: '461' },
        { label: 'Фурри', value: '394' },
        { label: 'Фэнтези', value: '2' },
        { label: 'Хентай', value: '441' },
        { label: 'Хобби и досуг', value: '530' },
        { label: 'Хоррор', value: '86' },
        { label: 'Чёрный юмор', value: '73' },
        { label: 'Эзотерика', value: '30' },
        { label: 'Экшн', value: '94' },
        { label: 'Эпическое фэнтези', value: '499' },
        { label: 'Эротика', value: '19' },
        { label: 'Эссе', value: '353' },
        { label: 'ЭТТИ', value: '502' },
        { label: 'Юмористическая литература', value: '20' },
        { label: 'Юмористическая фантастика', value: '514' },
        { label: 'Юмористическое фэнтези', value: '521' },
        { label: 'EVE - Миры Содружества', value: '99' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

const alphabet: { [key: string]: string } = {
  '~': '0',
  'H': '1',
  '^': '2',
  '@': '3',
  'f': '4',
  '0': '5',
  '5': '6',
  'n': '7',
  'r': '8',
  '=': '9',
  'W': 'a',
  'L': 'b',
  '7': 'c',
  ' ': 'd',
  'u': 'e',
  'c': 'f',
};

function decrypt(encrypt: string) {
  if (!encrypt) return '';
  const hexArray = [];

  for (let j = 0; j < encrypt.length; j += 2) {
    const firstChar = encrypt.substring(j, j + 1);
    const secondChar = encrypt.substring(j + 1, j + 2);
    hexArray.push(alphabet[firstChar] + alphabet[secondChar]);
  }

  return '<p>' + hexToUtf8(hexArray) + '</p>';
}

function hexToUtf8(hexArray: string[]) {
  let index = 0;
  let result = '';

  while (index < hexArray.length) {
    const currentHex = parseInt(hexArray[index], 16) & 0xff;

    if (currentHex < 128) {
      if (currentHex < 16) {
        switch (currentHex) {
          case 9:
            result += ' ';
            break;
          case 13:
            result += '\r';
            break;
          case 10:
            result += '\n';
            break;
        }
      } else {
        result += String.fromCharCode(currentHex);
      }
      index++;
    } else if (currentHex > 191 && currentHex < 224) {
      if (index + 1 < hexArray.length) {
        const nextHex = parseInt(hexArray[index + 1], 16) & 0xff;
        result += String.fromCharCode(
          ((currentHex & 31) << 6) | (nextHex & 63),
        );
      }
      index += 2;
    } else {
      if (index + 2 < hexArray.length) {
        const nextHex = parseInt(hexArray[index + 1], 16) & 0xff;
        const thirdHex = parseInt(hexArray[index + 2], 16) & 0xff;
        result += String.fromCharCode(
          ((currentHex & 15) << 12) | ((nextHex & 63) << 6) | (thirdHex & 63),
        );
      }
      index += 3;
    }
  }

  return result;
}

export default new Zelluloza();
