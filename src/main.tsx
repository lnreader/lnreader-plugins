import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import 'cheerio';
import 'htmlparser2';
import 'dayjs';
import 'protobufjs';

const { fetch: originalFetch } = window;
window.fetch = async (...args) => {
  const [resource, config] = args;
  if (resource.toString().includes('localhost'))
    return await originalFetch(resource, config);
  const _res = await originalFetch('http://localhost:3000/' + resource, {
    ...config,
    credentials: 'include',
    mode: 'cors',
  });
  Object.defineProperty(_res, 'url', {
    value: _res.url.includes('localhost') ? resource.toString() : _res.url,
  });
  return _res;
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
