const nodeFetch = import("node-fetch");

export type NodeFetchFunction = Awaited<typeof nodeFetch>["default"];

export type NodeFetchParams = Parameters<NodeFetchFunction>;

export const getNodeFetch = async (): Promise<NodeFetchFunction> => {
    return (await nodeFetch).default;
};
