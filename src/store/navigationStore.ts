import { StoreCreator } from '.';

export type NavigationStore = {
  parseNovelPath?: string;
  parseChapterPath?: string;
  /**
   * Bumped on every navigation request. The target panel watches this instead
   * of comparing paths, so requesting the same path twice still triggers, and a
   * request made before the plugin is ready is not silently dropped.
   */
  parseNovelNonce: number;
  parseChapterNonce: number;
  shouldAutoSubmitNovel: boolean;
  shouldAutoSubmitChapter: boolean;
  setParseNovelPath(path: string, autoSubmit?: boolean): void;
  clearParseNovelPath(): void;
  setParseChapterPath(path: string, autoSubmit?: boolean): void;
  clearParseChapterPath(): void;
};

/**
 * @param set State setter for use inside actions
 * @param get State getter for use inside actions, outside of State setter
 */
export const NavigationStore: StoreCreator<NavigationStore> = set => ({
  parseNovelPath: undefined,
  parseChapterPath: undefined,
  parseNovelNonce: 0,
  parseChapterNonce: 0,
  shouldAutoSubmitNovel: false,
  shouldAutoSubmitChapter: false,

  setParseNovelPath(path: string, autoSubmit = true) {
    set(state => ({
      ...state,
      parseNovelPath: path,
      shouldAutoSubmitNovel: autoSubmit,
      parseNovelNonce: state.parseNovelNonce + 1,
    }));
  },

  clearParseNovelPath() {
    set(state => ({
      ...state,
      parseNovelPath: undefined,
      shouldAutoSubmitNovel: false,
    }));
  },

  setParseChapterPath(path: string, autoSubmit = true) {
    set(state => ({
      ...state,
      parseChapterPath: path,
      shouldAutoSubmitChapter: autoSubmit,
      parseChapterNonce: state.parseChapterNonce + 1,
    }));
  },

  clearParseChapterPath() {
    set(state => ({
      ...state,
      parseChapterPath: undefined,
      shouldAutoSubmitChapter: false,
    }));
  },
});
