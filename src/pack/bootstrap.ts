// Runtime bootstrap for packaged (pkg) single-binary builds.
// - Detects pkg (process.pkg)
// - Extracts native modules to a writable dir under ~/.BeeperMCP/native/<ver>
// - Prepends that path to Node's module resolution paths

import fs from 'fs';
import path from 'path';
import os from 'os';
import Module from 'module';

function homeBase(): string {
  return process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function copyDir(src: string, dst: string) {
  ensureDir(dst);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) {
      const buf = fs.readFileSync(s);
      fs.writeFileSync(d, buf);
      try {
        fs.chmodSync(d, 0o600);
      } catch {}
    }
  }
}

function addToModulePath(dir: string) {
  // Prepend to global module resolution paths
  const M: any = Module as any;
  if (!M.globalPaths.includes(dir)) {
    M.globalPaths.unshift(dir);
    if (M._initPaths) M._initPaths();
  }
}

export function initPackBootstrap() {
  const isPkg = (process as any).pkg;
  if (!isPkg) return;
  const versionTag = process.version.replace(/^v/, 'v');
  const base = path.join(homeBase(), 'native', versionTag);
  const nodeModules = path.join(base, 'node_modules');
  ensureDir(nodeModules);

  try {
    // Extract @matrix-org/olm
    const olmPkg = require.resolve('@matrix-org/olm/package.json');
    const olmDir = path.dirname(olmPkg);
    const olmDst = path.join(nodeModules, '@matrix-org', 'olm');
    if (!fs.existsSync(olmDst)) copyDir(olmDir, olmDst);
  } catch {}
  try {
    // Extract @matrix-org/matrix-sdk-crypto-nodejs
    const cryptoPkg = require.resolve(
      '@matrix-org/matrix-sdk-crypto-nodejs/package.json',
    );
    const cryptoDir = path.dirname(cryptoPkg);
    const cryptoDst = path.join(
      nodeModules,
      '@matrix-org',
      'matrix-sdk-crypto-nodejs',
    );
    if (!fs.existsSync(cryptoDst)) copyDir(cryptoDir, cryptoDst);
  } catch {}

  addToModulePath(nodeModules);
}

// Auto-run on import
initPackBootstrap();
