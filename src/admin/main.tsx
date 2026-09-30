import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/figtree/wght.css';
import '../styles/base.css';
import '../styles/viewer.css';
import '../styles/dialog.css';
import './admin.css';
import AdminApp from './AdminApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
