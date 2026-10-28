import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Extension build: the ngrok address is entered once on the options page.
const needsServer = (import.meta as any).env?.VITE_EXT && !localStorage.getItem('chess_server_url');
if (needsServer) {
  location.replace('options.html');
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  );
}
