import React, { useState, useEffect, useRef } from 'react';
import { CheckedState } from '@radix-ui/react-checkbox';
import { Check, X } from 'lucide-react';

import { useAppStore } from '@/store';

import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useDebounce from '@/hooks/useDebounce';
import { FetchMode } from '@/types/types';

const FETCH_MODES = {
  [FetchMode.PROXY]: 'Proxy',
  [FetchMode.NODE_FETCH]: 'Node Fetch',
  [FetchMode.CURL]: 'Curl',
};

const SettingsSection = React.memo(function SettingsSection() {
  const plugin = useAppStore(state => state.plugin);
  const [settings, setSettings] = useState({
    cookies: '',
    fetchMode: FetchMode.PROXY,
    useUserAgent: true as CheckedState,
    siteCookies: {} as Record<string, string>,
    usePerSiteCookies: false as CheckedState,
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'saved'>('idle');
  const [showAllSites, setShowAllSites] = useState(false);
  const [addSiteHost, setAddSiteHost] = useState('');
  const [addSiteCookie, setAddSiteCookie] = useState('');
  const [addSiteError, setAddSiteError] = useState('');
  const init = useRef(false);
  const lastSaved = useRef<typeof settings | null>(null);
  const debouncedCookies = useDebounce(settings.cookies, 500);
  const currentSiteHostname = plugin?.site
    ? new URL(plugin.site).hostname.replace(/^www\./, '')
    : undefined;

  useEffect(() => {
    fetch('settings')
      .then(res => res.json())
      .then(data => {
        const loaded = {
          cookies: data.cookies || '',
          fetchMode: data.fetchMode ?? FetchMode.PROXY,
          useUserAgent: data.useUserAgent ?? true,
          siteCookies: data.siteCookies || {},
          usePerSiteCookies: data.usePerSiteCookies ?? false,
        };
        setSettings(loaded);
        lastSaved.current = loaded;
        init.current = true;
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!init.current || debouncedCookies !== settings.cookies) return;

    // strip empty keys from siteCookies before saving
    const cleanSiteCookies = { ...settings.siteCookies };
    for (const key in cleanSiteCookies) {
      if (!cleanSiteCookies[key]) delete cleanSiteCookies[key];
    }

    const current = {
      ...settings,
      cookies: debouncedCookies,
      siteCookies: cleanSiteCookies,
    };

    if (JSON.stringify(lastSaved.current) === JSON.stringify(current)) return;

    setStatus('loading');
    fetch('settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current),
    })
      .then(() => {
        lastSaved.current = current;
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
      })
      .catch(console.error);
  }, [
    debouncedCookies,
    settings.fetchMode,
    settings.useUserAgent,
    settings.cookies,
    settings.siteCookies,
    settings.usePerSiteCookies,
  ]);

  const update = <K extends keyof typeof settings>(
    k: K,
    v: (typeof settings)[K],
  ) => setSettings(settings => ({ ...settings, [k]: v }));

  return (
    <div className="space-y-6">
      <Card className="p-6 relative">
        {status === 'saved' && (
          <div className="absolute top-4 right-4 z-10 bg-green-500/90 text-white px-4 py-2 rounded-md flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2">
            <Check className="w-4 h-4" /> Settings updated
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Settings are automatically saved
            </p>
          </div>
          {status === 'loading' && (
            <div className="text-sm text-muted-foreground">Saving...</div>
          )}
        </div>

        <div className="space-y-6">
          <Section title="Request Configuration">
            <div className="space-y-2">
              <Label className="font-semibold text-foreground">
                Browser User Agent
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  value={navigator.userAgent}
                  disabled
                  className="font-mono text-xs flex-1 opacity-60"
                  title={navigator.userAgent}
                />
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <Checkbox
                    id="use-ua"
                    checked={settings.useUserAgent}
                    onCheckedChange={v => update('useUserAgent', v)}
                  />
                  <Label
                    htmlFor="use-ua"
                    className="text-sm text-foreground cursor-pointer"
                  >
                    Use
                  </Label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="use-per-site-cookies"
                checked={settings.usePerSiteCookies}
                onCheckedChange={v => update('usePerSiteCookies', v)}
              />
              <Label
                htmlFor="use-per-site-cookies"
                className="text-sm text-foreground cursor-pointer font-semibold"
              >
                Use per-site cookies
              </Label>
            </div>

            {!settings.usePerSiteCookies ? (
              <div className="space-y-2">
                <Label
                  htmlFor="cookies"
                  className="font-semibold text-foreground"
                >
                  Cookies (global)
                </Label>
                <Input
                  id="cookies"
                  value={settings.cookies}
                  onChange={e => update('cookies', e.target.value.trim())}
                  placeholder="Enter cookies (optional)..."
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Applied to all requests
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {currentSiteHostname ? (
                  <div className="space-y-2">
                    <Label
                      htmlFor="site-cookie"
                      className="font-semibold text-foreground"
                    >
                      Cookie for{' '}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {currentSiteHostname}
                      </code>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="site-cookie"
                        value={settings.siteCookies[currentSiteHostname] || ''}
                        onChange={e => {
                          const val = e.target.value.trim();
                          setSettings(prev => ({
                            ...prev,
                            siteCookies: {
                              ...prev.siteCookies,
                              [currentSiteHostname]: val,
                            },
                          }));
                        }}
                        placeholder="Enter cookie (optional)..."
                        className="font-mono text-xs"
                      />
                      {settings.siteCookies[currentSiteHostname] && (
                        <button
                          onClick={() => {
                            const next = { ...settings.siteCookies };
                            delete next[currentSiteHostname];
                            update('siteCookies', next);
                          }}
                          className="px-2 text-muted-foreground hover:text-destructive transition-colors"
                          title="Clear site cookie"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sent instead of global cookies for requests to this
                      hostname
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">
                    Select a plugin to configure per-site cookies for its
                    hostname.
                  </p>
                )}

                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      add hosts
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={addSiteHost}
                      onChange={e => setAddSiteHost(e.target.value)}
                      placeholder="https://..."
                      className="font-mono text-xs flex-1"
                    />
                    <Input
                      value={addSiteCookie}
                      onChange={e => setAddSiteCookie(e.target.value)}
                      placeholder="cookie value"
                      className="font-mono text-xs flex-[2]"
                    />
                    <button
                      onClick={() => {
                        try {
                          const host = new URL(
                            addSiteHost.trim(),
                          ).hostname.replace(/^www\./, '');
                          const next = { ...settings.siteCookies };
                          const val = addSiteCookie.trim();
                          if (val) {
                            next[host] = val;
                          } else {
                            delete next[host];
                          }
                          update('siteCookies', next);
                          setAddSiteHost('');
                          setAddSiteCookie('');
                          setAddSiteError('');
                        } catch {
                          setAddSiteError(
                            'Enter a full URL, e.g. https://source-b.com',
                          );
                        }
                      }}
                      disabled={!addSiteHost.trim()}
                      className="px-3 py-1 text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>
                {addSiteError && (
                  <p className="text-xs text-destructive mt-1">
                    {addSiteError}
                  </p>
                )}

                {Object.keys(settings.siteCookies).length > 0 && (
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowAllSites(v => !v)}
                      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span className="text-xs">
                        {showAllSites ? '▾' : '▸'}
                      </span>
                      All Site Cookies (
                      {Object.keys(settings.siteCookies).length})
                    </button>
                    {showAllSites && (
                      <div className="space-y-1 pl-3 border-l-2 border-muted">
                        {Object.entries(settings.siteCookies)
                          .filter(([, v]) => v)
                          .map(([site, cookie]) => (
                            <div
                              key={site}
                              className="flex items-center gap-2 text-xs py-1"
                            >
                              <code className="bg-muted px-1 py-0.5 rounded shrink-0">
                                {site}
                              </code>
                              <span className="text-muted-foreground truncate font-mono">
                                {cookie}
                              </span>
                              <button
                                onClick={() => {
                                  const next = { ...settings.siteCookies };
                                  delete next[site];
                                  update('siteCookies', next);
                                }}
                                className="ml-auto text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                title={`Delete cookie for ${site}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section title="Fetch Settings">
            <div className="space-y-2">
              <Label
                htmlFor="fetch-mode"
                className="font-semibold text-foreground"
              >
                Fetch Mode
              </Label>
              <Select
                value={settings.fetchMode.toString()}
                onValueChange={v => update('fetchMode', parseInt(v))}
              >
                <SelectTrigger id="fetch-mode">
                  <SelectValue>
                    {
                      FETCH_MODES[
                        settings.fetchMode as keyof typeof FETCH_MODES
                      ]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FETCH_MODES).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select the method used to fetch data from sources
              </p>
            </div>
          </Section>
        </div>
      </Card>
    </div>
  );
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="h-px flex-1 bg-border" />
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h3>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export default SettingsSection;
