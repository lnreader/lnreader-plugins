import { fetchApi, fetchProto, fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
// import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
// import { storage, localStorage, sessionStorage } from '@libs/storage';
// import { encode, decode } from 'urlencode';
// import dayjs from 'dayjs';
// import { Parser } from 'htmlparser2';

const TAG_LIST: string[] = [
  "'70s",
  '1960s',
  '1970s',
  '1970s Setting',
  '1980',
  '1980s',
  '1990s',
  '1V1',
  "70's Setting",
  '80s Setting',
  'Abandoned',
  'Abandoned Child',
  'ABO',
  'Abuse',
  'abuse scum',
  'Abuse Scumbag',
  'Abusive Characters',
  'Action',
  'Adopted Children',
  'Adorable Baby',
  'Adult',
  'Adventure',
  'Age Gap',
  'All Chapters Unlocked',
  'All Walks of Life',
  'Alpha Male',
  'Alpha/Beta/Omega/',
  'Alternate History',
  'Alternate World',
  'Amnesia',
  'Ancient',
  'Ancient and Modern Times',
  'Ancient China',
  'Ancient Farming',
  'Ancient Romance',
  'ancient style',
  'Ancient Times',
  'Angst',
  'Antagonist',
  'Apocalypse',
  'Arranged Marriage',
  'Artist (Painter)',
  'Awaken',
  'beast world',
  'Beastmen',
  'Beautiful Female Lead',
  'Beautiful protagonist',
  'BG',
  'Bickering Couple',
  'big brother',
  'BL',
  'Book Transmigration',
  'Both Pure',
  'Broken Mirror Reunion',
  'Building a Fortune',
  'Building Fortune',
  'Business',
  'Business management',
  'Bussiness',
  'Campus',
  'Campus Romance',
  'Cannon Fodder',
  'Capitalist Heiress',
  'Career Development',
  'Career Woman',
  'celebrity',
  'CEO',
  'Character Growth',
  'Charming Protagonist',
  'Chasing wife',
  'Child',
  'Childcare',
  'Childhood Love',
  'Childhood Sweethearts',
  'Chubby MC',
  'Cold-Hearted Prince',
  'College Life',
  'Comedy',
  'coming-of-age',
  'Competition',
  'contemporary',
  'Contract Marriage',
  'Cooking',
  'Countryside',
  'Court Marquis',
  'Court Nobility',
  'Crematorium Arc',
  'Crime',
  'Crime Fiction',
  'Crime Investigation',
  'Criminal',
  'Criminal Investigation',
  'cross-class encounters',
  'Crossing',
  'Cultivation',
  'Cunning Beauty',
  'Cute Babies',
  'cute baby',
  'Cute Child',
  'Cute Children',
  'Cute Protagonist',
  'Daily life',
  'Daily life with the Army',
  'Dark Villain',
  'Defying Fate',
  'Delicate Beauty',
  'Demons',
  'Depression',
  'Devoted Love',
  'Dimensional Space',
  'Disguise',
  'Divorce',
  'Divorced',
  'domi',
  'Doting Brother',
  'Doting Husband',
  'Doting Love Interest',
  'doting wife',
  'Double Purity',
  'Drama',
  'Dual Male Leads',
  'Easy',
  'Ecchi',
  'Elite',
  'Emperor',
  'Emptying Supplies',
  'Enemies to Lovers',
  'Ensemble Cast',
  'Ensemble Cast of Cannon Fodders',
  'Entertainment',
  'Entertainment Industry',
  'Era',
  'Era Farming',
  'Era novel',
  'Everyday Life',
  'Ex-Lovers',
  'Face-Slapping',
  'Face-Slapping Drama',
  'Face-Slapping Fiction',
  'Fake Daughter',
  'Fake Marriage',
  'fake vs. real',
  'fake vs. real daughter',
  'fake vs. real heiress',
  'Familial Love',
  'Family',
  'family affairs',
  'Family Bonds',
  'Family conflict',
  'Family Doting',
  'Family Drama',
  'Family Life',
  'family matters',
  'Famine Survival',
  'Famine Years',
  'Fanfiction',
  "Fanfiction (BL - Boys' Love/Yuri)",
  'Fantasy',
  'Fantasy Romance',
  'Farming',
  'Farming life',
  'Female Dominated',
  'Female Lead',
  'Female Protagonist',
  'Flash Marriage',
  'Flirtatious Beauty',
  'Food',
  'Forced Love',
  'Forced Marriage',
  'Forced Marriage & Possession',
  'forced plunder',
  'Fortune',
  'Frail Heroine',
  'FREE NOVEL‼️',
  'Friendship',
  'funny light',
  'Funny MC',
  'Game',
  'Game World',
  'Gender Bender',
  'General',
  'Getting Rich',
  'Ghost',
  'Girls Love',
  'Golden Finger',
  'Gourmet Food',
  'Group Favorite',
  'Group Pampering',
  'Growth System',
  'handsome male lead',
  'Harem',
  'HE',
  'Healing',
  'Heartwarming',
  'Heartwarming Daily Life',
  'Heaven’s Chosen',
  'Hidden Identity',
  'Hidden Marriage',
  'Historical',
  'Historical Era',
  'Historical Fiction',
  'Historical Romance',
  'Horror',
  'Humor',
  'Industry Elite',
  'Inner Courtyard Schemes',
  'Inspirational',
  'Interstellar',
  'Isekai',
  'Josei',
  'Just Sweetness',
  'large age gap',
  'Lazy',
  'Light Family Feuds',
  'Light Mystery',
  'Light Political Intrigue',
  'light romance',
  'Light-hearted',
  'Lighthearted',
  'Little Black Room',
  'Live Streaming',
  'Livestream',
  'livestreaming',
  'Lost Memory',
  'love',
  'Love After Marriage',
  'Love and Hate',
  'love as a battlefield',
  'love at first sight',
  'Love Later',
  'Love-hate relationship',
  'Lucky Charm',
  'Lucky Koi',
  'Lucky Protagonist',
  'Magic',
  'magical space',
  'male',
  'Male Protagonist',
  'Marriage',
  'Marriage Before Love',
  'Marriage First',
  'Martial Arts',
  'Match Made in Heaven',
  'Matriarchal Society',
  'Mature',
  'Mecha',
  'medical skills',
  'Medicine',
  'Medicine and Poison',
  'Melodrama',
  'Metaphysics',
  'Military',
  'Military Husband',
  'Military Island',
  'Military Life',
  'Military Marriage',
  'Military Romance',
  'Military Wedding',
  'Military Wife',
  'mind reading',
  'Misunderstanding',
  'Misunderstandings',
  'Modern',
  'Modern Day',
  'Modern Fantasy',
  'Modern Romance',
  'Modern/Contemporary',
  'Money Depreciation',
  'Motivational',
  'Mpreg',
  'Multiple Children',
  'Multiple Male Lead',
  'murder',
  'mutant',
  'Mutual Devotion',
  'Mutual Purity',
  'Mystery',
  'mystical face-slapping',
  'Mythical Beasts',
  'Mythology',
  'No CP',
  'No Rekindling of Old Flames',
  'No Schemes',
  'Non-human',
  'Obsessive Gong',
  'Obsessive love',
  'Office',
  'officialdom',
  'Older Love Interests',
  'omegaverse',
  'palace fighting',
  'Palace Struggles',
  'Pampering Wife',
  'Past Life',
  'Perfect Match',
  'Period Fiction',
  'Period Novel',
  'planes',
  'Plot Divergence',
  'Points Mall',
  'Poor Protagonist',
  'poor to powerful',
  'Poor to rich',
  'Popularity',
  'Possessive Love',
  'Possessive Male Lead',
  'Power Couple',
  'Power Fantasy',
  'Powerful Protagonist',
  'pregnancy',
  'Present Life',
  'President ML',
  'princess',
  'Protective Male Lead',
  'Psychological',
  'pursuing love',
  'Quick transmigration',
  'quick wear',
  'raising a baby',
  'Raising Children',
  'Real Daughter',
  'rebellion',
  'Rebirth',
  'Reborn',
  'Redemption',
  'Refreshing Fiction',
  'reincarnation',
  'Remarriage',
  'Reunion',
  'Revenge',
  'Revenge Drama',
  'Rich CEO',
  'Rich Family',
  'Rich President',
  'Rivalry',
  'Romance',
  'Romance of the Republic of China',
  'Romantic Comedy',
  'Royal Family',
  'Royalty',
  'Rural',
  'Rural life',
  'Ruthless Crown Prince',
  'Salted fish',
  'SameSexMarriage',
  'Schemes and Conspiracies',
  'Scheming Female Lead',
  'School Life',
  'Sci-fi',
  'Scum Abuse',
  'Scumbag Husband',
  'Second Chance',
  'Second Marriage',
  'Secret Crush',
  'Secret Identity',
  'Secret Love',
  'sect',
  'Seductive',
  'seinen',
  'Serious Drama',
  'Short Story',
  'Shoujo',
  'Shoujo Ai',
  'Shounen',
  'Shounen Ai',
  'Showbiz',
  'Sickly Beauty Shou',
  'Side Character Rise',
  'Slice',
  'Slice of Life',
  'Slight Magical Ability',
  'Slow Burn',
  'slow romance',
  'Slow-burn Romance',
  'smart couple',
  'Smut',
  'Space',
  'Space Ability',
  'Space Spirit',
  'Special Love',
  'Spirit Demons',
  'spoil',
  'Spoiled',
  'Spoiling Wife',
  'spy',
  'Starry Sky',
  'Stepmother',
  'stockpiling',
  'stolen',
  'Streaming',
  'strong',
  'Strong Female Lead',
  'Strong Love Interest',
  'strong pampering',
  'Student Life',
  'Studying',
  'Supernatural',
  'supporting characters',
  'Supporting Female Character',
  'Survival',
  'Suspense',
  'Swapped Baby',
  'Sweet',
  'Sweet Doting',
  'Sweet Love',
  'Sweet Pampering',
  'sweet pet',
  'Sweet Revenge',
  'Sweet Romance',
  'Sweet Story',
  'SweetNovel',
  'system',
  'System Fantasy',
  'System Transmigration',
  'Taciturn Rugged Man',
  'Thriller',
  'Time Travel',
  'Top-Notch Relatives',
  'Tragedy',
  'Transformation',
  'Transmigration',
  'transmigration into a novel',
  'Transmigration into Books',
  'Transmigration to the 1970s',
  'Traveling through space',
  'Traveling through time',
  'Treasure Appraisal',
  'Underdog Triumph',
  'Uniform Romance',
  'Unlimited Flow',
  'Unrequited Love',
  'Urban',
  'urban life',
  'urban realism',
  'Urban romance',
  'Vampires',
  'Village Life',
  'Villain',
  'war',
  'Weak to Strong',
  'wealthy characters',
  'Wealthy Families',
  'Wealthy Family',
  'Wealthy Male Lead',
  'Wealthy/Powerful Male Lead',
  'White Moonlight',
  'Wife-Chasing Crematorium',
  'Wish Fulfillment Novel',
  'Workplace',
  'Wuxia',
  'Xianxia',
  'Xuanhuan',
  'yandere',
  'Yandere Character',
  'Yandere Male Leads',
  'Yaoi',
  'Younger Love Interest',
  'Youth',
  'Yuri',
  'Zombie',
];

function unescapeHtmlText(escaped: string) {
  const txt = loadCheerio(`<p>${escaped}</p>`);
  return txt.text();
}

class ShanghaiFantasyPlugin implements Plugin.PluginBase {
  MAX_PAGE_CHAPTERS = 5000; // the highest possible value that WP won't complain about, to minimize API calls
  HIDE_LOCKED = false;
  FETCH_LOCKED_PRICE = true;

  id = 'shanghaifantasy';
  name = 'Shanghai Fantasy';
  icon = 'src/en/shanghaifantasy/icon.png';
  site = 'https://shanghaifantasy.com';
  version = '1.0.0';
  filters = {
    status: {
      label: 'Status',
      type: FilterTypes.Picker,
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Completed', value: 'Completed' },
        { label: 'Draft', value: 'Draft' },
        { label: 'Dropped', value: 'Dropped' },
        { label: 'Hiatus', value: 'Hiatus' },
        { label: 'Ongoing', value: 'Ongoing' },
      ],
    },
    genres: {
      label: 'Genres',
      type: FilterTypes.CheckboxGroup,
      value: [],
      options: TAG_LIST.map(v => ({ label: v, value: v.replace(' ', '+') })),
    },
    query: {
      label: 'Search Term',
      type: FilterTypes.TextInput,
      value: '',
    },
  } satisfies Filters;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // NOTE: this website doesn't track read count or scoring, so it doesn't have a "popularity" ranking.
    // The function will always return the "latest" ranking of the entire content list.

    const term =
      (filters?.genres?.value ?? []).length > 0
        ? filters.genres.value.join('*')
        : '';
    const novelstatus = filters?.status?.value ?? '';
    const orderCriterion = ''; // default: date, other: title
    const orderDirection = ''; // default: desc, other: asc
    const query = filters?.query?.value ?? ''; // also as a filter, because search in LNReader currently doesn't support searching and filtering together

    const url = `${this.site}/wp-json/fiction/v1/novels/?novelstatus=${novelstatus}&term=${term}&page=${pageNo}&orderBy=${orderCriterion}&order=${orderDirection}&query=${query}`;

    const result = await fetchApi(url);
    if (!result.ok) {
      throw new Error('Captcha error, please open in webview');
    }

    const body: { title: string; permalink: string; novelImage: string }[] =
      await result.json();

    return body.map((item: any) => ({
      name: unescapeHtmlText(item.title),
      path: item.permalink,
      cover: item.novelImage,
    }));
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/wp-json/fiction/v1/novels/?novelstatus=&term=&page=${pageNo}&orderBy=&order=&query=${searchTerm}`;

    const result = await fetchApi(url);
    if (!result.ok) {
      throw new Error('Captcha error, please open in webview');
    }

    const body: { title: string; permalink: string; novelImage: string }[] =
      await result.json();

    return body.map((item: any) => ({
      name: unescapeHtmlText(item.title),
      path: item.permalink,
      cover: item.novelImage,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Untitled',
    };

    const url = novelPath;
    const result = await fetchApi(url);
    if (!result.ok) {
      throw new Error('Captcha error, please open in webview');
    }
    const $ = loadCheerio(await result.text());

    const detailsEl = $('div:has(>#likebox)');
    novel.cover = $(detailsEl).find('>img').attr('src') ?? defaultCover;
    novel.name = $(detailsEl).find('p.text-lg').text().trim();

    const statusEl = $(detailsEl).find('>div>a.mx-auto>p');
    novel.status =
      {
        'Ongoing': NovelStatus.Ongoing,
        'Completed': NovelStatus.Completed,
        'Hiatus': NovelStatus.OnHiatus,
        'Dropped': NovelStatus.Cancelled,
        'Draft': 'Draft',
      }[statusEl.text().trim()] ?? NovelStatus.Unknown;

    const origAuthor = (
      $(detailsEl).find('p:has(span:contains("Author:"))')[0]
        .lastChild as any as Text
    ).data;
    const translator = $(detailsEl)
      .find('p:has(span:contains("Translator:"))>a')
      .text()
      .trim();
    novel.author = `${origAuthor} (Translated by: ${translator})`;

    const tags = [];
    tags.push(
      ...$(detailsEl)
        .find('>div>div.flex>span>a')
        .get()
        .map(el => $(el).text().trim().replace(',', '_')),
    );
    novel.genres = tags.join(', ');

    const synopsisEl = $("div[x-show=activeTab==='Synopsis']");
    novel.summary = synopsisEl.text().trim();

    const category = $('ul#chapterList').attr('data-cat');

    let pageNo = 1;
    let chPage: {
      title: string;
      permalink: string;
      locked: boolean;
      price: number;
    }[] = [];
    novel.chapters = [];
    let chapterNumber = 1;
    do {
      const url = `${this.site}/wp-json/fiction/v1/chapters?category=${category}&order=asc&page=${pageNo}&per_page=${this.MAX_PAGE_CHAPTERS}`;
      const result = await fetchApi(url);
      if (!result.ok) {
        throw new Error('Captcha error, please open in webview');
      }
      chPage = await result.json();

      for (const ch of chPage) {
        let title = ch.title;
        if (title.startsWith(novel.name)) {
          title = title.slice(novel.name.length).trim();
        }

        if (ch.locked) {
          // TODO: if the user is logged in, determine if they own the chapter

          if (this.HIDE_LOCKED) {
            continue;
          }

          title = '🔒 ' + title;
        }
        const chapter: Plugin.ChapterItem = {
          name: unescapeHtmlText(title),
          path: ch.permalink,
          // releaseTime: '', // not provided
          // chapterNumber: chapterNumber,
        };
        chapterNumber++;
        novel.chapters.push(chapter);
      }

      pageNo++;
    } while (chPage.length > 0);

    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const url = chapterPath;
    const result = await fetchApi(url);
    if (!result.ok) {
      throw new Error('Captcha error, please open in webview');
    }
    const body = await result.text();
    const $ = loadCheerio(body);

    const content = $('div.contenta');
    content.remove('script');
    content.remove('.ai-viewports');
    content.remove('.ai-viewport-1');
    content.remove('.ai-viewport-2');
    content.remove('.ai-viewport-3');

    if ($('div.mycred-sell-this-wrapper').length > 0) {
      let price = null;
      // TODO: do we want to do a whole logic thing here to determine the price?
      if (this.FETCH_LOCKED_PRICE) {
        const workUrl = $(content.next()).find('a:not([rel])').attr('href')!!;
        const result = await fetchApi(workUrl);
        if (!result.ok) {
          throw new Error('Captcha error, please open in webview');
        }
        const work$ = loadCheerio(await result.text());
        const workCategory = work$('ul#chapterList').attr('data-cat');

        let pageNo = 1;
        let chPage: {
          title: string;
          permalink: string;
          locked: boolean;
          price: number;
        }[] = [];
        let thisChapter = null;
        outer: do {
          const url = `${this.site}/wp-json/fiction/v1/chapters?category=${workCategory}&order=asc&page=${pageNo}&per_page=${this.MAX_PAGE_CHAPTERS}`;
          const result = await fetchApi(url);
          if (!result.ok) {
            throw new Error('Captcha error, please open in webview');
          }
          chPage = await result.json();

          for (const ch of chPage) {
            if (ch.permalink === chapterPath) {
              thisChapter = ch;
              break outer;
            }
          }

          pageNo++;
        } while (chPage.length > 0);

        if (thisChapter !== null) {
          price = thisChapter.price;
        }
      }

      const priceMsg =
        price !== null
          ? `This chapter costs ${price} coins.`
          : `To see the exact price, check the novel's landing page in WebView.`;

      return `
        <h3>This chapter is locked.</h3>
        <p>
          Viewing this chapter before it is publicly unlocked (if ever) requires payment.
          If you have an account, use WebView to login and unlock the chapter.
        </p>
        <p>
          ${priceMsg}
        </p>
        <p>
          If you're certain that you are logged in and have unlocked the chapter, and are
          receiving this message in error, feel free to post a bug report.
        </p>
      `;
    }

    return content.html()!!;
  }

  resolveUrl = (path: string, isNovel?: boolean) => path;
}

export default new ShanghaiFantasyPlugin();