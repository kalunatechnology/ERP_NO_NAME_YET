/**
 * File: backend-express/api/index.js
 *
 * Purpose: Implements application infrastructure responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
// Vercel Serverless Function Handler for Express
const { createApp } = require('../dist/app');

const app = createApp();

module.exports = app;
