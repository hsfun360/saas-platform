// server.js
//
// Thin bootstrap entry point (referenced by package.json `start`/`dev` and the
// Dockerfile CMD). All composition lives in src/app.js.

const { start } = require('./src/app');

start();
