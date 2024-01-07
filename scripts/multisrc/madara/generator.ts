import { FilterTypes, Filters } from "../../../libs/filterInputs";
import { ScrpitGeneratorFunction } from "../generate";
import list from "./sources.json";
import { MadaraMetadata } from "./template";
import { readFileSync } from "fs";
import path from "path";

export const generateAll: ScrpitGeneratorFunction = function (name) {
    return (
        list
            /* This map is changing `type` from string to FilterTypes  */
            .map<MadaraMetadata>((p) => {
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
            .map((metadata: MadaraMetadata) => {
                console.log(`[${name}]: Generating`, metadata.id);
                return generator(metadata);
            })
    );
};

const generator = function generator(metadata: MadaraMetadata) {
    const lang = metadata.options?.lang || "English";

    const madaraTemplate = readFileSync(path.join(__dirname, "template.ts"), {
        encoding: "utf-8",
    });

    const pluginScript = `
${madaraTemplate}
const plugin = new MadaraPlugin(${
    JSON.stringify(metadata).replace(/"type":"([^"]+)"/g, '"type":FilterTypes.$1')
});
export default plugin;
    `;
    return {
        lang,
        filename: metadata.sourceName,
        pluginScript,
    };
};
