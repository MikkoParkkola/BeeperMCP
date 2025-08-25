import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

function homeBase(): string {
  return process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
}
function statePath(): string {
  return path.join(homeBase(), 'server.json');
}

function readState(): {
  pid?: number;
  mode?: 'stdio' | 'http';
  startedAt?: number;
} {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    return {} as any;
  }
}
function writeState(s: any) {
  try {
    fs.mkdirSync(homeBase(), { recursive: true, mode: 0o700 });
  } catch {}
  fs.writeFileSync(statePath(), JSON.stringify(s, null, 2), { mode: 0o600 });
}

function serverEntry(): string {
  // At runtime (built), this file sits under dist/src/cli/serverCtl.js
  // The server entry is dist/src/server.js
  const here = path.dirname(new URL(import.meta.url).pathname);
  // Normalize path on Windows: leading slash from file://
  const p = path.join(here, '..', 'server.js');
  return decodeURIComponent(p);
}

export async function serverStatus() {
  const st = readState();
  if (!st.pid) return { running: false };
  try {
    // Check if process exists
    process.kill(st.pid, 0);
    return {
      running: true,
      pid: st.pid,
      mode: st.mode || 'stdio',
      startedAt: st.startedAt,
    };
  } catch {
    return { running: false };
  }
}

export async function serverStart(
  mode: 'stdio' | 'http' = 'stdio',
  port?: number,
) {
  const status = await serverStatus();
  if (status.running) return status;
  const entry = serverEntry();
  const env = { ...process.env } as any;
  if (mode === 'stdio') env.MCP_STDIO_MODE = '1';
  if (mode === 'http') env.MCP_HTTP_MODE = '1';
  if (port && mode === 'http') env.MCP_HTTP_PORT = String(port);
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: 'ignore',
    env,
  });
  child.unref();
  writeState({ pid: child.pid, mode, startedAt: Date.now() });
  return { running: true, pid: child.pid, mode, startedAt: Date.now() };
}

export async function serverStop() {
  const st = readState();
  if (!st.pid) return { stopped: true };
  try {
    process.kill(st.pid, process.platform === 'win32' ? 0 : ('SIGTERM' as any));
  } catch {}
  writeState({});
  return { stopped: true };
}
