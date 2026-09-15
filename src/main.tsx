import React from 'react';
import ReactDOM from 'react-dom/client';
import '@neondatabase/auth-ui/css';
import App from './App';
import { LangProvider } from './lib/i18n';
import SetupNotice from './components/SetupNotice';
import { isConfigured } from './neon';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>{isConfigured ? <App /> : <SetupNotice />}</LangProvider>
  </React.StrictMode>,
);
