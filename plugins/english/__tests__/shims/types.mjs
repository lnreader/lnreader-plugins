// Test shim for `@/types/plugin`: the import is type-only and erased at
// build time; this module only needs to exist so the bundler can resolve it.
// Used only by plugins/english/__tests__/nightjarreads.test.mjs.
export default {};
