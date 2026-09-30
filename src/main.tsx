import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/figtree/wght.css';
import './styles/base.css';
import './styles/book.css';
import './styles/viewer.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
