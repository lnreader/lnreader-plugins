import { useEffect, useRef, useState } from 'react';
import { Plugin } from '@/types/plugin';

interface UsePluginCustomAssetsReturn {
  customCSSLoaded: boolean;
  customJSLoaded: boolean;
  customCSSError: boolean;
  customJSError: boolean;
}

/**
 * Custom hook to load and manage plugin custom CSS and JS assets
 * @param plugin - The current plugin instance
 * @param chapterText - The loaded chapter text (triggers asset loading)
 * @returns Object containing loading states for CSS and JS
 */
export function usePluginCustomAssets(
  plugin: Plugin.PluginBase | undefined,
  chapterText: string,
): UsePluginCustomAssetsReturn {
  const [customCSSLoaded, setCustomCSSLoaded] = useState(false);
  const [customJSLoaded, setCustomJSLoaded] = useState(false);
  const [customCSSError, setCustomCSSError] = useState(false);
  const [customJSError, setCustomJSError] = useState(false);
  const customStyleRef = useRef<HTMLStyleElement | null>(null);
  const customScriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    // Clean up previous custom styles
    if (customStyleRef.current) {
      customStyleRef.current.remove();
      customStyleRef.current = null;
    }

    setCustomCSSLoaded(false);
    setCustomCSSError(false);

    if (plugin?.customCSS && chapterText) {
      const styleElement = document.createElement('style');
      styleElement.id = 'plugin-custom-css';

      fetch(`/public/static/${plugin.customCSS}`)
        .then(response => response.text())
        .then(cssContent => {
          styleElement.textContent = cssContent;
          document.head.appendChild(styleElement);
          customStyleRef.current = styleElement;
          setCustomCSSLoaded(true);
        })
        .catch(error => {
          console.error('Error loading custom CSS:', error);
          setCustomCSSError(true);
        });
    }

    return () => {
      if (customStyleRef.current) {
        customStyleRef.current.remove();
        customStyleRef.current = null;
      }
    };
  }, [plugin?.customCSS, chapterText]);

  useEffect(() => {
    if (customScriptRef.current) {
      customScriptRef.current.remove();
      customScriptRef.current = null;
    }

    setCustomJSLoaded(false);
    setCustomJSError(false);

    if (plugin?.customJS && chapterText) {
      const scriptElement = document.createElement('script');
      scriptElement.id = 'plugin-custom-js';
      scriptElement.src = `/public/static/${plugin.customJS}`;

      scriptElement.onload = () => {
        console.log('Custom JS loaded successfully');
        setCustomJSLoaded(true);
      };

      scriptElement.onerror = error => {
        console.error('Error loading custom JS:', error);
        setCustomJSError(true);
      };

      document.head.appendChild(scriptElement);
      customScriptRef.current = scriptElement;
    }

    return () => {
      if (customScriptRef.current) {
        customScriptRef.current.remove();
        customScriptRef.current = null;
      }
    };
  }, [plugin?.customJS, chapterText]);

  return {
    customCSSLoaded,
    customJSLoaded,
    customCSSError,
    customJSError,
  };
}
