import React from 'react';
import { Copy, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Plugin } from '@/types/plugin';

type NovelCardProps = {
  novel: Plugin.NovelItem;
  onParse: (path: string) => void;
};

export function NovelCard({ novel, onParse }: NovelCardProps) {
  const handleCopyPath = () => {
    navigator.clipboard.writeText(novel.path);
    toast.success('Novel path copied!');
  };

  return (
    <div className="group cursor-pointer flex flex-col h-full">
      <div className="relative mb-2 overflow-hidden rounded-lg bg-muted aspect-[3/4]">
        <img
          src={novel.cover || '/static/coverNotAvailable.webp'}
          alt={novel.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>
      <div className="flex flex-col flex-1 min-h-0">
        <h3 className="text-sm font-medium text-foreground line-clamp-2 mb-2 leading-tight h-10">
          {novel.name}
        </h3>
        <div className="flex gap-1.5 mt-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 px-2 bg-transparent"
                onClick={handleCopyPath}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copy path</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className="flex-1 h-8 px-2"
                onClick={() => onParse(novel.path)}
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Parse novel</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
