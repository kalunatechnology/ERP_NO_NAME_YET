/**
 * File: backend-express/server.js
 *
 * Purpose: Implements application infrastructure responsibilities in the backend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
// Entry point for Node.js hosting environments (Hostinger / cPanel / Passenger)
require('./dist/server.js');
