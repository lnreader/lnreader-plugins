
    import { load as parseHTML } from "cheerio";
    import dayjs from 'dayjs';
    import { fetchFile, fetchApi } from "@libs/fetch";
    import { Novel, Plugin, Chapter } from "@typings/plugin";
    // import { parseMadaraDate } from "@libs/parseMadaraDate";
    // import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
    // import { showToast } from "@libs/showToast";
    import { Filter, FilterInputs } from "@libs/filterInputs";
    import { NovelStatus } from '@libs/novelStatus';
    import { defaultCover } from "@libs/defaultCover";
    
    
    export const id = "kg.novel";
    export const name = "Карманная галактика";
    export const icon = "";
    export const version = "1.0.0";
    export const site = "https://kg.novel.tl";
    export const filters: Filter[] = [{"key":"tags","label":"Тэги","values":[{"label":"Алхимия","value":27},{"label":"Андроиды","value":37},{"label":"Анти-рост персонажа","value":25},{"label":"Антигерой","value":43},{"label":"Апатичный главный герой","value":46},{"label":"Аристократия","value":51},{"label":"Асоциальный главный герой","value":42},{"label":"Ассасины","value":61},{"label":"Беззаботный герой","value":115},{"label":"Безработные","value":377},{"label":"Бессмертные","value":359},{"label":"Библиотека","value":393},{"label":"Боги","value":318},{"label":"Боевая академия","value":75},{"label":"Бывший герой","value":290},{"label":"Ведьмы","value":756},{"label":"Везучий главный герой","value":411},{"label":"Верные подданные","value":410},{"label":"Взросление персонажа","value":24},{"label":"R-15","value":570}],"inputType":FilterInputs.Checkbox}];
    
    const baseUrl = site;
    const domain = baseUrl.split('//')[1];
    
    export const popularNovels: Plugin.popularNovels = async function (
        page,
        { filters }
    ) {
        const result = await fetchApi('https://api.novel.tl/api/site/v2/graphql', {
          method: 'post',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
            'Content-Type': 'application/json',
            'Alt-Used': 'api.novel.tl',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
          },
          referrer: baseUrl,
          body: JSON.stringify({
            operationName: 'Projects',
            query:
              'query Projects($hostname:String! $filter:SearchFilter $page:Int $limit:Int){projects(section:{fullUrl:$hostname}filter:$filter page:{pageSize:$limit,pageNumber:$page}){content{title url covers{url}}}}',
            variables: {
              filter: filters?.tags?.length ?? 0 > 0 ? { tags: filters?.tags } : {},
              hostname: domain,
              limit: 40,
              page,
            },
          }),
        });
        
        const json: any = await result.json();
        const novels: Novel.Item[] = json.data?.projects?.content?.map((novel: any) => ({
          name: novel.title,
          url: baseUrl + '/r/' + novel.url,
          cover: novel.covers[0]?.url
            ? baseUrl + novel.covers[0].url
            : defaultCover,
        }));
    
        return novels;
    };
    
    
    export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
        async function (novelUrl) {
            const result = await fetchApi('https://api.novel.tl/api/site/v2/graphql', {
                method: 'post',
                headers: {
                    'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
                    'Content-Type': 'application/json',
                    'Alt-Used': 'api.novel.tl',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'cross-site',
                },
                referrer: baseUrl,
                body: JSON.stringify({
                    operationName: 'Book',
                    query:
                    'query Book($url:String){project(project:{fullUrl:$url}){title translationStatus url covers{url}persons(langs:["ru","en","*"]roles:["author","illustrator","original_story","original_design"]){role name{firstName lastName}}genres{nameRu nameEng}tags{nameRu nameEng}annotation{text}subprojects{content{title volumes{content{url shortName chapters{title publishDate url published}}}}}}}',
                    variables: {
                    hostname: domain,
                    project: novelUrl,
                    url: novelUrl,
                    },
                }),
            });
            const json: any = await result.json();
            const novel: Novel.instance = {
                url: novelUrl,
                name: json.data.project.title,
                cover: json.data.project.covers[0]?.url
                  ? baseUrl + json.data.project.covers[0].url
                  : defaultCover,
                summary: parseHTML(json.data.project.annotation?.text).text(),
                author:
                  json.data.project.persons[0].name.firstName +
                  ' ' +
                  json.data.project.persons[0].name.lastName,
                status:
                  json.data.project.translationStatus === 'active'
                    ? NovelStatus.Ongoing
                    : NovelStatus.Completed,
            };
    
            let genres = []
                .concat(json.data.project.tags, json.data.project.genres)
                .map((item: any) => item?.nameRu || item?.nameEng)
                .filter(item => item);
    
            if (genres.length > 0) {
                novel.genres = genres.join(',');
            }
    
            let novelChapters: Chapter.Item[] = [];
            json.data.project.subprojects.content.forEach((work: any) =>
                work.volumes.content.forEach((volume: any) =>
                    volume.chapters.forEach(
                        (chapter: any) =>
                            chapter?.published &&
                            novelChapters.push({
                                name: volume.shortName + ' ' + chapter.title,
                                url: novelUrl + '/' + volume.url + '/' + chapter.url,
                                releaseTime: dayjs(chapter.publishDate).format('LLL'),
                            }),
                    ),
                ),
            );
            novel.chapters = novelChapters;
            return novel;
        };
    
    export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
        const result = await fetchApi('https://api.novel.tl/api/site/v2/graphql', {
          method: 'post',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
            'Content-Type': 'application/json',
            'Alt-Used': 'api.novel.tl',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
          },
          referrer: baseUrl,
          body: JSON.stringify({
            operationName: 'EReaderData',
            query:
              'query EReaderData($url:String!,$chapterSelector:Selector!){project(project:{fullUrl:$url}){title url}chapter(chapter:$chapterSelector){title text{text}}}',
            variables: {
              chapterSelector: {
                fullUrl: chapterUrl,
              },
              url: chapterUrl,
            },
          }),
        });
        const json: any = await result.json();
    
        return parseHTML(json.data.chapter.text.text).html();
    };
    
    export const searchNovels: Plugin.searchNovels = async (searchTerm) => {
        const result = await fetchApi('https://api.novel.tl/api/site/v2/graphql', {
          method: 'post',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
            'Content-Type': 'application/json',
            'Alt-Used': 'api.novel.tl',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
          },
          referrer: baseUrl,
          body: JSON.stringify({
            operationName: 'Projects',
            query:
              'query Projects($hostname:String! $filter:SearchFilter $page:Int $limit:Int){projects(section:{fullUrl:$hostname}filter:$filter page:{pageSize:$limit,pageNumber:$page}){content{title url covers{url}}}}',
            variables: {
              filter: {
                query: searchTerm,
              },
              hostname: domain,
              limit: 40,
              page: 1,
            },
          }),
        });
        const json: any = await result.json();
        const novels: Novel.Item[] = [];
        json?.data?.projects?.content?.forEach((novel: any) =>
            novels.push({
              name: novel.title,
              url: baseUrl + '/r/' + novel.url,
              cover: novel.covers[0]?.url
                ? baseUrl + novel.covers[0].url
                : defaultCover,
            }),
          );
        return novels;
    };
    
    export const fetchImage: Plugin.fetchImage = async (url) => {
        return await fetchFile(url, {});
    };    
    