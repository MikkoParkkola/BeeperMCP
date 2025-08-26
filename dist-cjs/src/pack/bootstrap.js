'use strict';
// Runtime bootstrap for packaged (pkg) single-binary builds.
// - Detects pkg (process.pkg)
// - Extracts native modules to a writable dir under ~/.BeeperMCP/native/<ver>
// - Prepends that path to Node's module resolution paths
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.initPackBootstrap = initPackBootstrap;
const fs_1 = __importDefault(require('fs'));
const path_1 = __importDefault(require('path'));
const os_1 = __importDefault(require('os'));
const module_1 = __importDefault(require('module'));
function homeBase() {
  return (
    process.env.BEEPERMCP_HOME ||
    path_1.default.join(os_1.default.homedir(), '.BeeperMCP')
  );
}
function ensureDir(dir) {
  if (!fs_1.default.existsSync(dir))
    fs_1.default.mkdirSync(dir, { recursive: true, mode: 0o700 });
}
function copyDir(src, dst) {
  ensureDir(dst);
  for (const entry of fs_1.default.readdirSync(src, { withFileTypes: true })) {
    const s = path_1.default.join(src, entry.name);
    const d = path_1.default.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) {
      const buf = fs_1.default.readFileSync(s);
      fs_1.default.writeFileSync(d, buf);
      try {
        fs_1.default.chmodSync(d, 0o600);
      } catch {}
    }
  }
}
function addToModulePath(dir) {
  // Prepend to global module resolution paths
  const M = module_1.default;
  if (!M.globalPaths.includes(dir)) {
    M.globalPaths.unshift(dir);
    if (M._initPaths) M._initPaths();
  }
}
function initPackBootstrap() {
  const isPkg = process.pkg;
  if (!isPkg) return;
  const versionTag = process.version.replace(/^v/, 'v');
  const archTag = `${process.platform}-${process.arch}`;
  const base = path_1.default.join(
    homeBase(),
    'native',
    `${versionTag}-${archTag}`,
  );
  const nodeModules = path_1.default.join(base, 'node_modules');
  ensureDir(nodeModules);
  try {
    // Extract @matrix-org/olm
    const olmPkg = require.resolve('@matrix-org/olm/package.json');
    const olmDir = path_1.default.dirname(olmPkg);
    const olmDst = path_1.default.join(nodeModules, '@matrix-org', 'olm');
    if (!fs_1.default.existsSync(olmDst)) copyDir(olmDir, olmDst);
  } catch {}
  try {
    // Extract @matrix-org/matrix-sdk-crypto-nodejs
    const cryptoPkg = require.resolve(
      '@matrix-org/matrix-sdk-crypto-nodejs/package.json',
    );
    const cryptoDir = path_1.default.dirname(cryptoPkg);
    const cryptoDst = path_1.default.join(
      nodeModules,
      '@matrix-org',
      'matrix-sdk-crypto-nodejs',
    );
    if (!fs_1.default.existsSync(cryptoDst)) copyDir(cryptoDir, cryptoDst);
  } catch {}
  addToModulePath(nodeModules);
}
// Auto-run on import
initPackBootstrap();
