/**
 * Backward compatibility for 3.0.0 - Re-exports from new location
 * TODO: Remove in 4.0.0
 */
export {
  fetchApi,
  fetchText,
  fetchProto,
  fetchFile,
  fetchViaWebview,
  type FetchInit,
  type WebviewFetchOptions,
  type WebviewFetchResult,
} from '../lib/fetch';
