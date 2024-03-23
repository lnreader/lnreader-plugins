import { fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
// import { isUrlAbsolute } from "@libs/isAbsoluteUrl";
// import { parseMadaraDate } from "@libs/parseMadaraDate";

class TemplatePlugin implements Plugin.PluginBase {
  id = '';
  name = '';
  icon = '';
  site = 'https://example.com';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];

    /** Add your fetching code here */
    novels.push({
      name: 'Novel1',
      path: '/novels/1',
      cover: defaultCover,
    });
    return novels;
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Untitled',
    };

    // TODO: get here data from the site and
    // un-comment and fill-in the relevant fields

    // novel.name = "";
    // novel.artist = "";
    // novel.author = "";
    novel.cover = defaultCover;
    // novel.genres = "";
    // novel.status = NovelStatus.Completed;
    // novel.summary = "";

    let chapters: Plugin.ChapterItem[] = [];

    // TODO: here parse the chapter list

    // TODO: add each chapter to the list using
    const chapter: Plugin.ChapterItem = {
      name: '',
      path: '',
      releaseTime: '',
      chapterNumber: 0,
    };
    chapters.push(chapter);

    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    // parse chapter text here
    const chapterText = '';
    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    let novels: Plugin.NovelItem[] = [];

    // get novels using the search term

    return novels;
  }
  async fetchImage(url: string): Promise<string | undefined> {
    // if your plugin has images and they won't load
    // this is the function to fiddle with
    return fetchFile(url);
  }
}

export default new TemplatePlugin();
