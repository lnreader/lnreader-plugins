import React, { useMemo, useState, useCallback } from 'react';

import { BookOpen, Search, Settings, Zap } from 'lucide-react';
import PluginHeader from '../components/plugin-header';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';

import plugins from '@/provider/plugin-registry';
import { useAppStore } from '@/store';
import PopularNovelsSection from '@/components/popular-novels';
import SearchNovelsSection from '@/components/search-novels';
import ParseNovelSection from '@/components/parse-novel';
import SettingsSection from '@/components/settings';
import ParseChapterSection from '@/components/parse-chapter';

function PluginSidebar() {
  const { plugin, selectPlugin } = useAppStore(state => state);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPlugins = useMemo(
    () =>
      plugins.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [searchQuery],
  );

  return (
    <aside className="w-64 border-r border-border bg-background flex flex-col">
      <div className="p-6 flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Plugins
          </h2>
          <span className="text-xs text-muted-foreground">
            {filteredPlugins.length} / {plugins.length}
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search plugin..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="space-y-2">
          {plugins.map(p => {
            if (!p.icon) {
              throw new Error(`Plugin ${p.name} is missing icon path`);
            }
            const isVisible = p.name
              .toLowerCase()
              .includes(searchQuery.toLowerCase());
            return (
              <button
                key={p.id}
                onClick={() => selectPlugin(p)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-3 ${
                  p.id === plugin?.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted'
                } ${isVisible ? '' : 'hidden'}`}
              >
                <img
                  src={`/static/${p.icon}`}
                  alt={p.name}
                  className="w-6 h-6 rounded-sm shrink-0 object-contain"
                  onError={() => {
                    throw new Error(
                      `Icon not found for plugin: ${p.name} at /static/${p.icon}`,
                    );
                  }}
                />
                <span className="truncate">{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function Home() {
  const { plugin } = useAppStore(state => state);

  const [activeTab, setActiveTab] = useState('popular');

  const handleNavigateToParseNovel = useCallback(() => {
    setActiveTab('parse-novel');
  }, []);

  const handleNavigateToParseChapter = useCallback(() => {
    setActiveTab('parse-chapter');
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PluginHeader selectedPlugin={plugin} />
      <div className="flex h-[calc(100vh-64px)]">
        <PluginSidebar />

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Plugin Playground
              </h1>
              <p className="text-muted-foreground">
                Explore and test {plugin?.name || 'plugin'} features
              </p>
            </div>

            {/* Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-5 mb-8">
                <TabsTrigger
                  value="popular"
                  className="flex items-center gap-2"
                >
                  <BookOpen className="w-4 h-4" />
                  <span className="hidden sm:inline">Popular</span>
                </TabsTrigger>
                <TabsTrigger value="search" className="flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  <span className="hidden sm:inline">Search</span>
                </TabsTrigger>
                <TabsTrigger
                  value="parse-novel"
                  className="flex items-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  <span className="hidden sm:inline">Parse Novel</span>
                </TabsTrigger>
                <TabsTrigger
                  value="parse-chapter"
                  className="flex items-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  <span className="hidden sm:inline">Parse Chapter</span>
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  className="flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Settings</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="popular" className="space-y-6">
                <PopularNovelsSection
                  onNavigateToParseNovel={handleNavigateToParseNovel}
                />
              </TabsContent>

              <TabsContent value="search" className="space-y-6">
                <SearchNovelsSection
                  onNavigateToParseNovel={handleNavigateToParseNovel}
                />
              </TabsContent>

              <TabsContent value="parse-novel" className="space-y-6">
                <ParseNovelSection
                  onNavigateToParseChapter={handleNavigateToParseChapter}
                />
              </TabsContent>

              <TabsContent value="parse-chapter" className="space-y-6">
                <ParseChapterSection />
              </TabsContent>

              <TabsContent value="settings" className="space-y-6">
                <SettingsSection />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Home;
