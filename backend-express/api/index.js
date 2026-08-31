// Vercel Serverless Function Handler for Express
const { createApp } = require('../dist/app');

const app = createApp();

module.exports = app;
