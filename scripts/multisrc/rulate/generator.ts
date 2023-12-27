import { Filters, FilterTypes } from "../../../libs/filterInputs";
import { ScrpitGeneratorFunction } from "../generate";
import list from "./sources.json";
import { RulateMetadata } from "./template";
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
        .map((metadata: RulateMetadata) => {
            return generator(metadata);
        });
};

const generator = function generator(metadata: RulateMetadata) {
    const rulateTemplate = readFileSync(path.join(__dirname, "template.ts"), {
        encoding: "utf-8",
    });

    const pluginScript = `
	${rulateTemplate}
const plugin = new RulatePlugin(${JSON.stringify(metadata)});
export default plugin;
    `.trim();

    return {
        lang: "russian",
        filename: metadata.sourceName,
        pluginScript,
    };
};
