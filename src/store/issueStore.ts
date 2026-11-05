import { fetchIssueIndex, type IssueIndex } from '@/lib/issue-index';
import { StoreCreator } from '.';

export type IssueIndexState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; index: IssueIndex }
  | { status: 'error'; message: string };

export type IssueStore = {
  issueIndexState: IssueIndexState;
  loadIssueIndex(): Promise<void>;
};

export const IssueStore: StoreCreator<IssueStore> = (set, get) => ({
  issueIndexState: { status: 'idle' },

  async loadIssueIndex() {
    if (get().issueIndexState.status === 'loading') return;

    set({ issueIndexState: { status: 'loading' } });
    try {
      const index = await fetchIssueIndex();
      set({ issueIndexState: { status: 'ready', index } });
    } catch (error) {
      set({
        issueIndexState: {
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Issue index request failed.',
        },
      });
    }
  },
});
