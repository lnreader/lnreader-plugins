import { ScrpitGeneratorFunction } from "../generate";
import { WPmangaStreamMetadata } from "./template";
import list from "./sources.json";
import { readFileSync } from "fs";
import path from "path";

export const generateAll: ScrpitGeneratorFunction = function (name) {
  return list.map((source) => {
    console.log(`[${name}] Generating:`, source.id);
    return generator(source);
  });
};

const generator = function generator(source: WPmangaStreamMetadata) {
  const WPmangaStreamTemplate = readFileSync(path.join(__dirname, "template.ts"),{
    encoding: "utf-8",
  });

  const pluginScript = `
  ${WPmangaStreamTemplate}
const plugin = new WPmangaStreamPlugin(${JSON.stringify(source)});
export default plugin;
    `.trim();

  return {
    lang: source.options?.lang || "English",
    filename: source.sourceName,
    pluginScript,
  };
};
