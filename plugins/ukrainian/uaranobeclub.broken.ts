import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

const UA_RANOBE_ID = 'uaranobeclub' as const;
const UA_RANOBE_URL = 'https://uaranobe.club/' as const;

type Writing = {
  id: string;
  title: string;
  image: string;
  slug: string;
  description: string;
  updatedAt: string;
  episodes: Episode[];
  category: Category;
  genres: GenreConnection[];
  __typename: string;
  scanlators: {
    scanlator: {
      scanlatorName: string;
      username: string;
      episodes: Episode[];
      __typename: string;
    };
    __typename: string;
  }[];
};

type Episode = {
  seqTitle: string;
  title: string;
  slug: string;
  subId: string;
  text: string;
  __typename: string;
};

type Category = {
  id: string;
  name: string;
  __typename: string;
};

type GenreConnection = {
  genreId: string;
  genre: Genre;
  __typename: string;
};

type Genre = {
  id: string;
  name: string;
  __typename: string;
};

type WritingsResponse = {
  writingsCount: number;
  writings: Writing[];
};

type WritingResponse = {
  data: {
    writingBySlug: Writing;
  };
};

type EpisodeResponse = {
  data: {
    episodeBySlug: Episode;
  };
};

class UaRanobeClubApi {
  static async fetch<TData = unknown, TVariables = unknown>(
    query: string,
    variables: TVariables,
  ): Promise<TData> {
    const response = await fetchApi(`${UA_RANOBE_URL}graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    return (await response.json()) as TData;
  }

  static async fetchChapter(
    slug: string,
    writingSlug: string,
  ): Promise<string> {
    const query = `
            query EpisodeBySlug($slug: String!, $writingSlug: String!) {
                episodeBySlug(slug: $slug, writingSlug: $writingSlug) {
                    text
                }
            }
        `;

    const variables = {
      slug,
      writingSlug,
    } as const;

    const response = await UaRanobeClubApi.fetch<
      EpisodeResponse,
      typeof variables
    >(query, variables);

    return response.data.episodeBySlug.text;
  }

  static async fetchNovel(slug: string): Promise<Writing> {
    const query = `
        query Writing($slug: String!) {
          writingBySlug(slug: $slug) {
            id
            title
            originalTitle
            image
            slug
            description
            scanlators {
              scanlator {
                scanlatorName
                username
                episodes(oldestFirst: false, slug: $slug) {
                  id
                  subId
                  seqTitle
                  title
                  slug
                  __typename
                }
                __typename
              }
              __typename
            }
            genres {
              genreId
              genre {
                id
                name
                __typename
              }
              __typename
            }
            __typename
          }
        }
      `;

    const variables = { slug };

    const response = await UaRanobeClubApi.fetch<
      WritingResponse,
      typeof variables
    >(query, variables);

    return response?.data?.writingBySlug ?? '';
  }

  static async fetchListWithNovel(
    skip = 0,
    search = '',
  ): Promise<WritingsResponse> {
    const query = `
        query Writings($skip: Int!, $search: String) {
          writingsCount(search: $search)
          writings(skip: $skip, search: $search) {
            id
            title
            image
            slug
            __typename
          }
        }
      `;
    const variables = {
      skip,
      search,
    } as const;

    const response = await UaRanobeClubApi.fetch<
      { data: WritingsResponse },
      typeof variables
    >(query, variables);

    return response.data;
  }
}

class UaRanobeClub implements Plugin.PluginBase {
  id = UA_RANOBE_ID;
  name = 'UA Ranobe Club';
  site = UA_RANOBE_URL;
  version = '1.1.4';
  icon = `src/uk/${this.id}/icon.png`;

  async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
    const skip = (page - 1) * 10;

    const data = await UaRanobeClubApi.fetchListWithNovel(skip, '');

    const novelItems: Plugin.NovelItem[] = (data?.writings ?? []).map(
      ({ title, image, slug }) => ({
        name: title,
        cover: image,
        path: slug,
      }),
    );

    return novelItems;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.split(UA_RANOBE_URL).join('');

    const data: Writing = await UaRanobeClubApi.fetchNovel(slug);

    const chapters: Plugin.ChapterItem[] =
      data.scanlators?.[0]?.scanlator?.episodes?.map(
        ({ title, seqTitle, slug: chapterSlug, subId }) => ({
          name: `${seqTitle}. ${title}`,
          path: chapterSlug + `#${slug}`,
          chapterNumber: parseInt(subId, 10), // Предполагаем, что subId это число
        }),
      ) || [];

    const sourceNovel: Plugin.SourceNovel = {
      genres: data.genres?.map(({ genre }) => genre.name).join(',') || '',
      chapters,
      name: data.title,
      path: data.slug,
      summary: data.description,
      cover: data.image,
    };

    return sourceNovel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [slug, writingSlug] = chapterPath
      .split(UA_RANOBE_URL)
      .join('')
      .split('#');
    const chapterText = await UaRanobeClubApi.fetchChapter(slug, writingSlug);

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const skip = (page - 1) * 10;

    const data = await UaRanobeClubApi.fetchListWithNovel(skip, searchTerm);
    const novelItems: Plugin.NovelItem[] = (data?.writings ?? []).map(
      ({ title, image, slug }) => ({
        name: title,
        cover: image,
        path: slug,
      }),
    );

    return novelItems;
  }
}

export default new UaRanobeClub();
