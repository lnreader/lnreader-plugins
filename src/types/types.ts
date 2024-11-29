import { Plugin } from '@typings/plugin';

export type PluginList = Record<string, Plugin.PluginItem[]>;

export enum FetchMode {
  PROXY,
  NODE_FETCH,
  CURL,
}

export interface ServerSetting {
  CLIENT_HOST: string;
  fetchMode: FetchMode;
  cookies?: string;
  disAllowedRequestHeaders: string[];
  disAllowResponseHeaders: string[];
  useUserAgent: boolean;
}
