import React from 'react';
import ReactDOM from 'react-dom/client';
import { Context } from '@aivenio/aquarium';
import '@aivenio/aquarium/dist/styles.css';
import './theme.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Context>
      <App />
    </Context>
  </React.StrictMode>,
);
