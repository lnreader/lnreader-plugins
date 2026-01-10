import React, { useMemo, useState } from 'react';

import { BookOpen, Search, Settings, Zap } from 'lucide-react';
import PluginHeader from '../components/plugin-header';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';

import plugins from '@plugins/index';
import { useAppStore } from '@/store';
import PopularNovelsSection from '@/components/popular-novels';
import SearchNovelsSection from '@/components/search-novels';
import ParseNovelSection from '@/components/parse-novel';
import SettingsSection from '@/components/settings';
import ParseChapterSection from '@/components/parse-chapter';

function Home() {
  const { plugin, selectPlugin } = useAppStore(state => state);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeTab, setActiveTab] = useState('popular');

  const filteredPlugins = useMemo(
    () =>
      plugins.filter(plugin =>
        plugin.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [searchQuery],
  );

  return (
    <div className="min-h-screen bg-background">
      <PluginHeader selectedPlugin={plugin} />
      <div className="flex h-[calc(100vh-64px)]">
        <aside className="w-64 border-r border-border bg-background flex flex-col">
          <div className="p-6 flex-shrink-0 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Plugins
              </h2>
              <span className="text-xs text-muted-foreground">
                {filteredPlugins.length}
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
              {filteredPlugins.map(filteredPlugin => (
                <button
                  key={filteredPlugin.id}
                  onClick={() => selectPlugin(filteredPlugin)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    filteredPlugin.id === plugin?.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {filteredPlugin.name}
                </button>
              ))}
            </div>
          </div>
        </aside>

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
                  onNavigateToParseNovel={() => setActiveTab('parse-novel')}
                />
              </TabsContent>

              <TabsContent value="search" className="space-y-6">
                <SearchNovelsSection
                  onNavigateToParseNovel={() => setActiveTab('parse-novel')}
                />
              </TabsContent>

              <TabsContent value="parse-novel" className="space-y-6">
                <ParseNovelSection
                  onNavigateToParseChapter={() => setActiveTab('parse-chapter')}
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
