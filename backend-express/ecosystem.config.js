/**
 * File: backend-express/ecosystem.config.js
 *
 * Purpose: Implements runtime/build configuration responsibilities in the backend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
// PM2 Process Manager Configuration for VPS Deployments
module.exports = {
  apps: [
    {
      name: 'erp-backend-express',
      script: './server.js',
      instances: 'max', // or 2-4 based on CPU cores
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 8001,
      },
    },
  ],
};
