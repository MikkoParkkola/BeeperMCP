'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.serverStatus = serverStatus;
exports.serverStart = serverStart;
exports.serverStop = serverStop;
const fs_1 = __importDefault(require('fs'));
const path_1 = __importDefault(require('path'));
const os_1 = __importDefault(require('os'));
const child_process_1 = require('child_process');
function homeBase() {
  return (
    process.env.BEEPERMCP_HOME ||
    path_1.default.join(os_1.default.homedir(), '.BeeperMCP')
  );
}
function statePath() {
  return path_1.default.join(homeBase(), 'server.json');
}
function readState() {
  try {
    return JSON.parse(fs_1.default.readFileSync(statePath(), 'utf8'));
  } catch {
    return {};
  }
}
function writeState(s) {
  try {
    fs_1.default.mkdirSync(homeBase(), { recursive: true, mode: 0o700 });
  } catch {}
  fs_1.default.writeFileSync(statePath(), JSON.stringify(s, null, 2), {
    mode: 0o600,
  });
}
function serverEntry() {
  // At runtime (built), this file sits under dist/src/cli/serverCtl.js
  // The server entry is dist/src/server.js
  const here = path_1.default.dirname(new URL(import.meta.url).pathname);
  // Normalize path on Windows: leading slash from file://
  const p = path_1.default.join(here, '..', 'server.js');
  return decodeURIComponent(p);
}
async function serverStatus() {
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
async function serverStart(mode = 'stdio', port) {
  const status = await serverStatus();
  if (status.running) return status;
  const entry = serverEntry();
  const env = { ...process.env };
  if (mode === 'stdio') env.MCP_STDIO_MODE = '1';
  if (mode === 'http') env.MCP_HTTP_MODE = '1';
  if (port && mode === 'http') env.MCP_HTTP_PORT = String(port);
  const child = (0, child_process_1.spawn)(process.execPath, [entry], {
    detached: true,
    stdio: 'ignore',
    env,
  });
  child.unref();
  writeState({ pid: child.pid, mode, startedAt: Date.now() });
  return { running: true, pid: child.pid, mode, startedAt: Date.now() };
}
async function serverStop() {
  const st = readState();
  if (!st.pid) return { stopped: true };
  try {
    process.kill(st.pid, process.platform === 'win32' ? 0 : 'SIGTERM');
  } catch {}
  writeState({});
  return { stopped: true };
}
