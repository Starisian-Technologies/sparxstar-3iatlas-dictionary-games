/**
 * Website entry point (`webpack.site.config.js`).
 *
 * Distinct from `src/index.jsx`, which is the UMD package's entry and exports
 * components for a host to mount. This one mounts the app itself and is the
 * only place in the repo that calls `createRoot`.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}
