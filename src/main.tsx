import React from 'react';
import ReactDOM from 'react-dom/client';
import '@neondatabase/auth-ui/css';
import App from './App';
import SetupNotice from './components/SetupNotice';
import { isConfigured } from './neon';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isConfigured ? <App /> : <SetupNotice />}</React.StrictMode>,
);
