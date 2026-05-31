#!/usr/bin/env node
const proxy = require('./server/proxy');
const dashboard = require('./server/dashboard');

proxy.start();
dashboard.start();
