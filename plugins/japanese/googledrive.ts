import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';

type DriveItem = { id: string; name: string; cover: string };

type DriveNovel = {
  title: string;
  author: string;
  summary: string;
  cover: string;
  chapters: { title: string; index: number }[];
};

class GoogleDrivePlugin implements Plugin.PluginBase {
  id = 'googledrive';
  name = 'Google Drive';
  icon = 'src/jp/googledrive/icon.png';
  site = 'https://drive.google.com';
  version = '1.0.0';

  pluginSettings = {
    workerUrl: {
      value: '',
      label: 'Worker URL (https://name.workers.dev)',
      type: 'Text',
    },
    accessKey: {
      value: '',
      label: 'Access key',
      type: 'Text',
    },
  };

  private async call<T>(route: string, params: Record<string, string> = {}): Promise<T> {
    const workerUrl = String(storage.get('workerUrl') || '').replace(/\/+$/, '');
    const accessKey = String(storage.get('accessKey') || '');
    if (!workerUrl || !accessKey) {
      throw new Error('Set the worker URL and access key in the plugin settings.');
    }
    const query = new URLSearchParams({ ...params, key: accessKey }).toString();
    const res = await fetchApi(workerUrl + route + '?' + query);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data as T;
  }

  private toNovels(items: DriveItem[]): Plugin.NovelItem[] {
    return items.map(item => ({
      name: item.name,
      path: item.id,
      cover: item.cover,
    }));
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const items = await this.call<DriveItem[]>('/list', { page: String(pageNo) });
    return this.toNovels(items);
  }

  async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
    const items = await this.call<DriveItem[]>('/list', {
      q: searchTerm,
      page: String(pageNo),
    });
    return this.toNovels(items);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const data = await this.call<DriveNovel>('/novel/' + novelPath);
    return {
      path: novelPath,
      name: data.title,
      cover: data.cover,
      author: data.author,
      summary: data.summary,
      status: NovelStatus.Unknown,
      chapters: data.chapters.map(chapter => ({
        name: chapter.title,
        path: novelPath + '/' + chapter.index,
        chapterNumber: chapter.index + 1,
      })),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const data = await this.call<{ html: string }>('/chapter/' + chapterPath);
    return data.html;
  }
}

export default new GoogleDrivePlugin();
