/**
 * File: frontend-next/postcss.config.mjs
 *
 * Purpose: Defines application infrastructure responsibilities for the frontend application.
 * Responsibility: Owns the executable contracts declared here and their framework/import integration boundary.
 * Dependencies and side effects: Function comments identify HTTP, persistence, browser-state, and security effects where present.
 */
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
  },
};

export default config;
