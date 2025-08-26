#!/usr/bin/env node
'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
// Unified entrypoint for single-binary usage.
// - Ensures packaged runtime bootstrap runs first
require('./pack/bootstrap.js');
const autoUpdate_js_1 = require('./update/autoUpdate.js');
async function main() {
  const cmd = process.argv[2] || 'chat';
  // Support explicit update command
  if (cmd === 'update') {
    const updated = await (0, autoUpdate_js_1.maybeAutoUpdate)({ force: true });
    if (updated?.replaced) {
      console.log('Updated to latest version. Please re-run the command.');
      process.exit(0);
    } else {
      console.log(updated?.reason || 'Already up to date.');
      process.exit(0);
    }
  }
  // Support UI command
  if (cmd === 'ui') {
    const path = await Promise.resolve().then(() =>
      __importStar(require('path')),
    );
    const fs = await Promise.resolve().then(() => __importStar(require('fs')));
    const { spawn } = await Promise.resolve().then(() =>
      __importStar(require('child_process')),
    );
    const uiPath = path.resolve(process.cwd(), 'web-ui.html');
    if (!fs.existsSync(uiPath)) {
      console.error('🚨 Web UI not found at:', uiPath);
      console.error('Make sure you are in the BeeperMCP directory.');
      process.exit(1);
    }
    console.log('🚀 Launching BeeperMCP Web Interface...');
    console.log('📍 Opening:', uiPath);
    // Open in default browser
    const opener =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'start'
          : 'xdg-open';
    spawn(opener, [uiPath], { detached: true, stdio: 'ignore' }).unref();
    console.log(
      '✨ Web Interface launched! Enjoy the Matrix Intelligence Hub!',
    );
    return;
  }
  // Background auto-update check (non-blocking unless an immediate update is required)
  void (0, autoUpdate_js_1.maybeAutoUpdate)({ force: false });
  if (cmd === 'chat') {
    await Promise.resolve().then(() => __importStar(require('./cli/chat.js')));
    // chat.ts runs immediately
    return;
  }
  if (cmd === 'server' || cmd === 'stdio') {
    // Force STDIO mode when invoked via single binary server
    if (!process.env.MCP_STDIO_MODE) process.env.MCP_STDIO_MODE = '1';
    const { startServer } = await Promise.resolve().then(() =>
      __importStar(require('./server.js')),
    );
    await startServer();
    return;
  }
  console.error('Usage: beepermcp [chat|server|ui|update]');
  process.exit(2);
}
main();
