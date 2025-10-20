import 'cheerio';
import 'htmlparser2';
import 'dayjs';
import 'protobufjs';
import './index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

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
