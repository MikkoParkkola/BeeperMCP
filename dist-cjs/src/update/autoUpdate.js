'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.maybeAutoUpdate = maybeAutoUpdate;
const fs_1 = __importDefault(require('fs'));
const os_1 = __importDefault(require('os'));
const path_1 = __importDefault(require('path'));
const crypto_1 = __importDefault(require('crypto'));
const node_module_1 = require('node:module');
const require = (0, node_module_1.createRequire)(import.meta.url);
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
function statePath() {
  return path_1.default.join(homeBase(), 'update-state.json');
}
function readJSON(p) {
  try {
    return JSON.parse(fs_1.default.readFileSync(p, 'utf8'));
  } catch {
    return undefined;
  }
}
function writeJSON(p, v) {
  fs_1.default.writeFileSync(p, JSON.stringify(v, null, 2), { mode: 0o600 });
}
function currentVersion() {
  try {
    const pkg = require('../../package.json');
    return pkg.version || '0.0.0';
  } catch {
    return process.env.BEEPER_MCP_VERSION || '0.0.0';
  }
}
function isPackaged() {
  return !!process.pkg;
}
function platformTag() {
  const p = process.platform;
  const a = process.arch;
  if (p === 'darwin') return a === 'arm64' ? 'macos-arm64' : 'macos-x64';
  if (p === 'linux') return 'linux-x64';
  if (p === 'win32') return 'win-x64';
  return null;
}
async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BeeperMCP-Updater' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function isRetryableStatus(code) {
  return code === 429 || (code >= 500 && code < 600);
}
async function fetchWithRetry(url, init, retries = 2, baseDelay = 250) {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, init);
      if (!res.ok && isRetryableStatus(res.status))
        throw new Error(String(res.status));
      return res;
    } catch (e) {
      attempt++;
      const msg = String(e?.message || e);
      const retryable =
        /timeout|network|ECONN|ENOTFOUND|EAI_AGAIN|429|5\d\d/i.test(msg);
      if (!retryable || attempt > retries) throw e;
      const delay =
        baseDelay * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50);
      await sleep(delay);
    }
  }
}
function parseRepo() {
  // Prefer explicit env, e.g. "owner/repo"
  const env = process.env.BEEPERMCP_UPDATE_REPO;
  if (env && env.includes('/')) {
    const [owner, repo] = env.split('/', 2);
    return { owner, repo };
  }
  // Try reading package.json repository
  try {
    const pkg = require('../../package.json');
    const repoUrl = pkg.repository?.url || pkg.repository;
    if (repoUrl && repoUrl.includes('github.com')) {
      const m = repoUrl.match(/github\.com[:/]+([^/]+)\/([^/.#]+)(?:\.git)?/i);
      if (m) return { owner: m[1], repo: m[2] };
    }
  } catch {}
  return null;
}
function semverLt(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da < db;
  }
  return false;
}
function sha256(file) {
  const h = crypto_1.default.createHash('sha256');
  h.update(fs_1.default.readFileSync(file));
  return h.digest('hex');
}
async function downloadWithResume(url, dest) {
  ensureDir(path_1.default.dirname(dest));
  const part = dest + '.part';
  // Cleanup very old partials
  try {
    const st = fs_1.default.statSync(part);
    if (Date.now() - st.mtimeMs > 7 * 24 * 60 * 60 * 1000)
      fs_1.default.unlinkSync(part);
  } catch {}
  let start = 0;
  try {
    start = fs_1.default.statSync(part).size;
  } catch {}
  const headers = {
    'User-Agent': 'BeeperMCP-Updater',
  };
  if (start > 0) headers['Range'] = `bytes=${start}-`;
  const res = await fetchWithRetry(url, { headers }, 3, 300);
  if (!(res.status === 200 || res.status === 206))
    throw new Error(`HTTP ${res.status}`);
  const writeFlags = start > 0 && res.status === 206 ? 'a' : 'w';
  const file = fs_1.default.createWriteStream(part, {
    mode: 0o755,
    flags: writeFlags,
  });
  await new Promise((resolve, reject) => {
    res.body.pipe(file);
    res.body.on('error', reject);
    file.on('finish', resolve);
  });
  fs_1.default.renameSync(part, dest);
}
function verifyDetachedSignature(manifestBytes, sigText, pubKeyB64) {
  if (!sigText || !pubKeyB64) return false;
  try {
    // Simple JSON { alg: 'ed25519', sig: base64 } format support
    if (sigText.trim().startsWith('{')) {
      const obj = JSON.parse(sigText);
      if (obj.alg !== 'ed25519' || typeof obj.sig !== 'string') return false;
      const sig = Buffer.from(obj.sig, 'base64');
      const pub = Buffer.from(pubKeyB64, 'base64');
      return crypto_1.default.verify(
        null,
        manifestBytes,
        { key: pub, format: 'der', type: 'spki' },
        sig,
      );
    }
  } catch {}
  // Unsupported signature format (e.g., minisign). Caller can decide to fail or warn.
  return false;
}
async function maybeAutoUpdate({ force = false }) {
  try {
    if (!isPackaged())
      return { replaced: false, reason: 'Not a packaged binary' };
    const tag = platformTag();
    if (!tag) return { replaced: false, reason: 'Unsupported platform' };
    const repo = parseRepo();
    if (!repo) return { replaced: false, reason: 'No update repo configured' };
    const state = readJSON(statePath()) || {
      lastCheck: 0,
    };
    const now = Date.now();
    if (!force && now - state.lastCheck < 24 * 60 * 60 * 1000) {
      return { replaced: false, reason: 'Checked recently' };
    }
    state.lastCheck = now;
    writeJSON(statePath(), state);
    const latest = await fetchJSON(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`,
    );
    const latestVer = latest.tag_name?.replace(/^v/, '') || latest.name || '';
    const cur = currentVersion();
    if (!force && !semverLt(cur, latestVer)) {
      return { replaced: false, reason: 'Already up to date' };
    }
    // Determine asset name and URL and verify via manifest if present
    const baseName = `beepermcp-${tag}` + (tag === 'win-x64' ? '.exe' : '');
    let url = `https://github.com/${repo.owner}/${repo.repo}/releases/download/v${latestVer}/${baseName}`;
    let expectedSha;
    let manifestBytes;
    try {
      const manifestRes = await fetchWithRetry(
        `https://github.com/${repo.owner}/${repo.repo}/releases/download/v${latestVer}/manifest.json`,
        { headers: { 'User-Agent': 'BeeperMCP-Updater' } },
      );
      if (!manifestRes.ok) throw new Error(`HTTP ${manifestRes.status}`);
      manifestBytes = Buffer.from(await manifestRes.arrayBuffer());
      const manifest = JSON.parse(manifestBytes.toString('utf8'));
      const entry = (manifest?.assets || []).find((a) => a.name === baseName);
      if (entry) {
        url = entry.url || url;
        expectedSha = entry.sha256;
      }
      // Optional signature verification
      try {
        const sigRes = await fetchWithRetry(
          `https://github.com/${repo.owner}/${repo.repo}/releases/download/v${latestVer}/manifest.sig`,
          { headers: { 'User-Agent': 'BeeperMCP-Updater' } },
          1,
          200,
        );
        if (sigRes.ok) {
          const sigText = await sigRes.text();
          const pubKeyB64 = process.env.BEEPERMCP_MANIFEST_PUBKEY;
          const ok = verifyDetachedSignature(manifestBytes, sigText, pubKeyB64);
          if (!ok && pubKeyB64) {
            throw new Error('manifest_signature_verification_failed');
          }
        }
      } catch {
        // If pubkey is provided and verification failed earlier, we already threw
      }
    } catch {
      // no manifest, best-effort fallback to asset URL in release list
      const asset = (latest.assets || []).find((a) => a.name === baseName);
      if (asset?.browser_download_url) url = asset.browser_download_url;
    }
    const tmp = path_1.default.join(homeBase(), 'tmp');
    ensureDir(tmp);
    const newFile = path_1.default.join(tmp, baseName);
    await downloadWithResume(url, newFile);
    if (expectedSha) {
      const got = sha256(newFile);
      if (got.toLowerCase() !== expectedSha.toLowerCase()) {
        throw new Error('Checksum mismatch for downloaded binary');
      }
    }
    const target = process.execPath;
    const backup = target + '.old';
    const staged =
      target + (process.platform === 'win32' ? '.new.exe' : '.new');
    try {
      fs_1.default.unlinkSync(backup);
    } catch {}
    try {
      fs_1.default.unlinkSync(staged);
    } catch {}
    // Stage then swap (Windows cannot overwrite running exe)
    fs_1.default.copyFileSync(newFile, staged);
    try {
      fs_1.default.chmodSync(staged, 0o755);
    } catch {}
    if (process.platform === 'win32') {
      // Leave staged file for next run to swap, inform caller
      return {
        replaced: false,
        reason: `Update downloaded to ${staged}. Restart to finalize.`,
      };
    }
    // POSIX: swap atomically
    try {
      fs_1.default.renameSync(target, backup);
    } catch {}
    fs_1.default.renameSync(staged, target);
    return { replaced: true };
  } catch (e) {
    return { replaced: false, reason: e?.message || String(e) };
  }
}
