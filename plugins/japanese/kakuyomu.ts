import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class KakuyomuPlugin implements Plugin.PluginBase {
  id = 'kakuyomu';
  name = 'kakuyomu';
  icon = 'src/jp/kakuyomu/icon.png';
  site = 'https://kakuyomu.jp';
  version = '1.0.0';
  filters = {
    genre: {
      type: FilterTypes.Picker,
      label: 'Genre',
      options: [
        { label: '総合', value: 'all' },
        { label: '異世界ファンタジー', value: 'fantasy' },
        { label: '現代ファンタジー', value: 'action' },
        { label: 'SF', value: 'sf' },
        { label: '恋愛', value: 'love_story' },
        { label: 'ラブコメ', value: 'romance' },
        { label: '現代ドラマ', value: 'drama' },
        { label: 'ホラー', value: 'horror' },
        { label: 'ミステリー', value: 'mystery' },
        { label: 'エッセイ・ノンフィクション', value: 'nonfiction' },
        { label: '歴史・時代・伝奇', value: 'history' },
        { label: '創作論・評論', value: 'criticism' },
        { label: '詩・童話・その他', value: 'others' },
      ],
      value: 'all',
    },
    period: {
      type: FilterTypes.Picker,
      label: 'Period',
      options: [
        { label: '累計', value: 'entire' },
        { label: '日間', value: 'daily' },
        { label: '週間', value: 'weekly' },
        { label: '月間', value: 'monthly' },
        { label: '年間', value: 'yearly' },
      ],
      value: 'entire',
    },
  } satisfies Filters;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = new URL(
      `/rankings/${filters.genre.value}/${filters.period.value}`,
      this.site,
    );
    if (pageNo > 1) {
      url.searchParams.set('page', pageNo.toString());
    }
    const html = await fetchText(url.toString());
    const $ = loadCheerio(html);
    const novels: Plugin.NovelItem[] = [];

    $('.widget-media-genresWorkList-right > .widget-work').each((_, elem) => {
      const anchor = $(elem).find('a.widget-workCard-titleLabel');
      const path = anchor.attr('href');
      if (!path) return;
      const name = anchor.text();
      novels.push({
        name,
        path,
        cover: defaultCover,
      });
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = new URL(novelPath, this.site);
    const html = await fetchText(url.toString());
    const $ = loadCheerio(html);

    const json = JSON.parse(
      $('script#__NEXT_DATA__[type="application/json"]').html() || '{}',
    );
    const apolloState = json?.props?.pageProps?.__APOLLO_STATE__ ?? {};

    const work = Object.values(apolloState).find(
      v =>
        typeof v === 'object' &&
        v !== null &&
        '__typename' in v &&
        v.__typename === 'Work' &&
        'id' in v &&
        v.id === novelPath.replace('/works/', ''),
    ) as Work;

    const author = Object.values(apolloState).find(
      v =>
        typeof v === 'object' &&
        v !== null &&
        '__typename' in v &&
        v.__typename === 'UserAccount' &&
        'id' in v &&
        v.id === work.author.__ref.replace('UserAccount:', ''),
    ) as UserAccount;

    const chapters = Object.values(apolloState).filter(v => {
      if (
        typeof v === 'object' &&
        v !== null &&
        '__typename' in v &&
        v.__typename === 'Chapter'
      ) {
        return true;
      }
    }) as Chapter[];

    const tableOfContentsChapter = Object.values(apolloState).filter(v => {
      if (
        typeof v === 'object' &&
        v !== null &&
        '__typename' in v &&
        v.__typename === 'TableOfContentsChapter'
      ) {
        return true;
      }
    }) as TableOfContentsChapter[];

    const episodes = Object.values(apolloState).filter(v => {
      if (
        typeof v === 'object' &&
        v !== null &&
        '__typename' in v &&
        v.__typename === 'Episode'
      ) {
        return true;
      }
    }) as Episode[];

    const joinChapters: {
      chapter: Chapter | undefined;
      episode: Episode;
    }[] = episodes.map(v => {
      const chapter = tableOfContentsChapter.find(c =>
        c.episodeUnions.some(e => e.__ref === `Episode:${v.id}`),
      )?.chapter;
      return {
        chapter: chapters.find(
          c => c.id === chapter?.__ref.replace('Chapter:', ''),
        ),
        episode: v,
      };
    });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: work.title,
      cover: work.adminCoverImageUrl ?? defaultCover,
      genres: (work?.tagLabels ?? []).join(','),
      author: author?.activityName,
      status:
        work.serialStatus === 'COMPLETED'
          ? NovelStatus.Completed
          : NovelStatus.Ongoing,
      summary: work.introduction,
      chapters: joinChapters.map(v => {
        return {
          name: v.chapter?.title
            ? `${v.chapter?.title} - ${v.episode?.title}`
            : v.episode?.title ?? '',
          path: `${novelPath}/episodes/${v.episode?.id}`,
          releaseTime: new Date(v.episode?.publishedAt ?? 0).toISOString(),
        };
      }),
    };

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = new URL(chapterPath, this.site);
    const html = await fetchText(url.toString());
    const $ = loadCheerio(html);
    const chapterTitle = $('.chapterTitle').text() ?? '';
    const episodeTitle = $('.widget-episodeTitle').html() ?? '';
    const episodeBody = $('.widget-episodeBody').html() ?? '';
    const chapterText = `
    <div>
      ${chapterTitle ? `<h1>${chapterTitle}</h1>` : ''}
      <h2>${episodeTitle}</h2>
    </div>
    <p><br><br></p>
    ${episodeBody}`;
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = new URL('/search', this.site);
    url.searchParams.set('q', searchTerm);
    if (pageNo > 1) {
      url.searchParams.set('page', pageNo.toString());
    }
    const html = await fetchText(url.toString());
    const $ = loadCheerio(html);

    const json = JSON.parse(
      $('script#__NEXT_DATA__[type="application/json"]').html() || '{}',
    );
    const works = Object.values(
      json?.props?.pageProps?.__APOLLO_STATE__ ?? {},
    ).filter(v => {
      if (
        typeof v === 'object' &&
        v !== null &&
        '__typename' in v &&
        v.__typename === 'Work'
      ) {
        return true;
      }
    }) as Work[];

    const novels: Plugin.NovelItem[] = works.map(v => ({
      name: v.title ?? '',
      path: `/works/${v.id}`,
      cover: v.adminCoverImageUrl ?? defaultCover,
    }));

    return novels;
  }
}

export default new KakuyomuPlugin();

type Work = {
  id: string;
  title: string;
  serialStatus: string;
  tagLabels: string[];
  introduction: string;
  adminCoverImageUrl?: string;
  author: {
    __ref: string;
  };
};

type UserAccount = {
  activityName: string;
};

type Chapter = {
  id: string;
  title: string;
};

type Episode = {
  title: string;
  id: string;
  publishedAt: string;
};

type TableOfContentsChapter = {
  chapter: {
    __ref: string;
  };
  episodeUnions: {
    __ref: string;
  }[];
};
