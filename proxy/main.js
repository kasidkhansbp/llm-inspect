#!/usr/bin/env node
const proxy = require('./server/proxy');
const dashboard = require('./server/dashboard');

// The proxy sits in the host app's request path: staying up with a logged
// error beats crashing and failing every in-flight and future LLM call.
process.on('uncaughtException', (err) => console.error('[llm-inspect]', err));
process.on('unhandledRejection', (err) => console.error('[llm-inspect]', err));

proxy.start();
dashboard.start();
