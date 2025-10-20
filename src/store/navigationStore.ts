import { StoreCreator } from '.';

export type NavigationStore = {
  parseNovelPath?: string;
  parseChapterPath?: string;
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
  shouldAutoSubmitNovel: false,
  shouldAutoSubmitChapter: false,

  setParseNovelPath(path: string, autoSubmit = true) {
    set(state => ({
      ...state,
      parseNovelPath: path,
      shouldAutoSubmitNovel: autoSubmit,
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
