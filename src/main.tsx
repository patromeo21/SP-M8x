import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // Optional if you have global styles, or you can omit if using Tailwind via CDN/postcss
import './styles/song-and-mixer.css';
import './styles/phrase-viewport.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
