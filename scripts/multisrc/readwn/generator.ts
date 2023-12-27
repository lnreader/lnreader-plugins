import { FilterTypes, Filters } from "../../../libs/filterInputs";
import { ScrpitGeneratorFunction } from "../generate";
import list from "./sources.json";
import { ReadwnMetadata } from "./template";
import { readFileSync } from "fs";
import path from "path";

export const generateAll: ScrpitGeneratorFunction = function () {
    return list
        .map((p) => {
            let d = false;
            const filters: Filters = {};
            for (const k in p.filters) {
                const f = p.filters[k as keyof typeof p.filters];
                if (f) {
                    filters[k] = {
                        ...f,
                        type: FilterTypes.Picker,
                    };
                }
            }
            return { ...p, filters: d ? undefined : filters };
        })
        .map((metadata: ReadwnMetadata) => {
            return generator(metadata);
        });
};

const generator = function generator(metadata: ReadwnMetadata) {
    const rulateTemplate = readFileSync(path.join(__dirname, "template.ts"), {
        encoding: "utf-8",
    });

    const pluginScript = `
	${rulateTemplate}
const plugin = new ReadwnPlugin(${JSON.stringify(metadata)});
export default plugin;
    `.trim();

    return {
        lang: "english",
        filename: metadata.sourceName,
        pluginScript,
    };
};
