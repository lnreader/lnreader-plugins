import React, { useState, useEffect } from 'react';
import { CheckedState } from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';

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

export default function SettingsSection() {
  const [cookies, setCookies] = useState('');
  const debouncedCookies = useDebounce(cookies, 500);
  const [fetchMode, setFetchMode] = useState<FetchMode>(FetchMode.PROXY);
  const [useUserAgent, setUseUserAgent] = useState<CheckedState>(true);
  const [loading, setLoading] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);

  useEffect(() => {
    if (alertVisible) {
      const id = setTimeout(() => setAlertVisible(false), 2000);
      return () => clearTimeout(id);
    }
  }, [alertVisible]);

  useEffect(() => {
    setLoading(true);
    fetch('settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cookies: debouncedCookies,
        fetchMode: fetchMode,
        useUserAgent: useUserAgent === true,
      }),
    })
      .then(() => setAlertVisible(true))
      .catch(error => console.error('Failed to save settings:', error))
      .finally(() => setLoading(false));
  }, [debouncedCookies, fetchMode, useUserAgent]);

  const getFetchModeLabel = (mode: FetchMode) => {
    switch (mode) {
      case FetchMode.PROXY:
        return 'Proxy';
      case FetchMode.NODE_FETCH:
        return 'Node Fetch';
      case FetchMode.CURL:
        return 'Curl';
      default:
        return 'Proxy';
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 relative">
        {alertVisible && (
          <div className="absolute top-4 right-4 z-10 bg-green-500/90 text-white px-4 py-2 rounded-md flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2">
            <Check className="w-4 h-4" />
            Settings updated
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Settings are automatically saved
            </p>
          </div>
          {loading && (
            <div className="text-sm text-muted-foreground">Saving...</div>
          )}
        </div>

        <div className="space-y-6">
          {/* Request Configuration Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-px flex-1 bg-border"></div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Request Configuration
              </h3>
              <div className="h-px flex-1 bg-border"></div>
            </div>

            <div className="space-y-6">
              {/* User Agent */}
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
                      checked={useUserAgent}
                      onCheckedChange={setUseUserAgent}
                    />
                    <Label
                      htmlFor="use-ua"
                      className="text-sm text-foreground cursor-pointer"
                    >
                      Use
                    </Label>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enable to send your browser's user agent with requests
                </p>
              </div>

              {/* Cookies */}
              <div className="space-y-2">
                <Label
                  htmlFor="cookies"
                  className="font-semibold text-foreground"
                >
                  Cookies
                </Label>
                <Input
                  id="cookies"
                  value={cookies}
                  onChange={e => setCookies(e.target.value.trim())}
                  placeholder="Enter cookies (optional)..."
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Additional cookies to send with requests (optional)
                </p>
              </div>
            </div>
          </div>

          {/* Fetch Settings Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-px flex-1 bg-border"></div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Fetch Settings
              </h3>
              <div className="h-px flex-1 bg-border"></div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="fetch-mode"
                className="font-semibold text-foreground"
              >
                Fetch Mode
              </Label>
              <Select
                value={fetchMode.toString()}
                onValueChange={value =>
                  setFetchMode(parseInt(value) as FetchMode)
                }
              >
                <SelectTrigger id="fetch-mode">
                  <SelectValue>{getFetchModeLabel(fetchMode)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FetchMode.PROXY.toString()}>
                    Proxy
                  </SelectItem>
                  <SelectItem value={FetchMode.NODE_FETCH.toString()}>
                    Node Fetch
                  </SelectItem>
                  <SelectItem value={FetchMode.CURL.toString()}>
                    Curl
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select the method used to fetch data from sources
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
