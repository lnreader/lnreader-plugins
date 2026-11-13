import React from 'react';
import {
  CATEGORY_LABELS,
  getIssueGroups,
  type IssueGroup,
} from '@/lib/issue-index';
import { useAppStore } from '@/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function PluginIssues({ pluginId }: { pluginId?: string }) {
  const state = useAppStore(store => store.issueIndexState);
  const loadIssueIndex = useAppStore(store => store.loadIssueIndex);
  const groups =
    state.status === 'ready' && pluginId
      ? getIssueGroups(state.index, pluginId)
      : [];
  const reportCount = groups.reduce(
    (total, group) => total + group.length - 1,
    0,
  );

  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Open issue reports</CardTitle>
          <CardDescription>
            Indexed GitHub reports for this plugin. The snapshot may lag recent
            changes.
          </CardDescription>
        </div>
        {state.status === 'ready' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadIssueIndex()}
          >
            Refresh
          </Button>
        )}
        {state.status === 'error' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadIssueIndex()}
          >
            Retry
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!pluginId ? (
          <p className="text-sm text-muted-foreground">
            Select a plugin to see its issue reports.
          </p>
        ) : state.status === 'idle' || state.status === 'loading' ? (
          <div role="status" aria-live="polite" className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Loading issue reports...
            </p>
            <Skeleton className="h-8 w-full max-w-md" />
          </div>
        ) : state.status === 'error' ? (
          <div role="alert" className="space-y-1">
            <p className="text-sm">Issue reports are unavailable.</p>
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </div>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No indexed open reports for this plugin.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {reportCount} indexed open{' '}
              {reportCount === 1 ? 'report' : 'reports'}
            </p>
            {groups.map(group => (
              <IssueCategory key={group[0]} group={group} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IssueCategory({ group }: { group: IssueGroup }) {
  const [code, ...issueNumbers] = group;
  return (
    <div className="flex flex-wrap items-start gap-2">
      <Badge
        variant="outline"
        className="border-current bg-transparent text-current"
      >
        {CATEGORY_LABELS[code]}
      </Badge>
      <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
        {issueNumbers.map(number => (
          <a
            key={number}
            href={`https://github.com/LNReader/lnreader-plugins/issues/${number}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open GitHub issue #${number}`}
            className="text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            #{number}
          </a>
        ))}
      </div>
    </div>
  );
}
