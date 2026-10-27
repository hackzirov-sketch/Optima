import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AppProvider } from './store.jsx';
import { LangProvider } from './i18n.jsx';
import './styles.css';
import './optima-skin.css';
import './optima-theme.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LangProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </LangProvider>
    </HashRouter>
  </React.StrictMode>
);
