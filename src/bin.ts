#!/usr/bin/env node
// Unified entrypoint for single-binary usage.
// - Ensures packaged runtime bootstrap runs first
import './pack/bootstrap.js';
import { maybeAutoUpdate } from './update/autoUpdate.js';

async function main() {
  const cmd = process.argv[2] || 'chat';

  // Support explicit update command
  if (cmd === 'update') {
    const updated = await maybeAutoUpdate({ force: true });
    if (updated?.replaced) {
      console.log('Updated to latest version. Please re-run the command.');
      process.exit(0);
    } else {
      console.log(updated?.reason || 'Already up to date.');
      process.exit(0);
    }
  }

  // Background auto-update check (non-blocking unless an immediate update is required)
  void maybeAutoUpdate({ force: false });
  if (cmd === 'chat') {
    await import('./cli/chat.js');
    // chat.ts runs immediately
    return;
  }
  if (cmd === 'server' || cmd === 'stdio') {
    // Force STDIO mode when invoked via single binary server
    if (!process.env.MCP_STDIO_MODE) process.env.MCP_STDIO_MODE = '1';
    const { startServer } = await import('./server.js');
    await startServer();
    return;
  }
  console.error('Usage: beepermcp [chat|server]');
  process.exit(2);
}

main();
