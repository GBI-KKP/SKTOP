import React from 'react';
import ReactDOM from 'react-dom/client';
import SktopApp from './SktopApp.jsx';

const props = window.__SKTOP_PROPS__ || {};
const el = document.getElementById('sktop-app-root') || document.getElementById('root');
if (el) {
  const root = ReactDOM.createRoot(el);
  root.render(React.createElement(SktopApp, props));
}
