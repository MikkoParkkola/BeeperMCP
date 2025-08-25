import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function homeBase(): string {
  return process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function statePath(): string {
  return path.join(homeBase(), 'update-state.json');
}

function readJSON<T>(p: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function writeJSON(p: string, v: any) {
  fs.writeFileSync(p, JSON.stringify(v, null, 2), { mode: 0o600 });
}

function currentVersion(): string {
  try {
    const pkg = require('../../package.json');
    return pkg.version || '0.0.0';
  } catch {
    return process.env.BEEPER_MCP_VERSION || '0.0.0';
  }
}

function isPackaged(): boolean {
  return !!(process as any).pkg;
}

function platformTag():
  | 'macos-x64'
  | 'macos-arm64'
  | 'linux-x64'
  | 'win-x64'
  | null {
  const p = process.platform;
  const a = process.arch;
  if (p === 'darwin') return a === 'arm64' ? 'macos-arm64' : 'macos-x64';
  if (p === 'linux') return 'linux-x64';
  if (p === 'win32') return 'win-x64';
  return null;
}

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BeeperMCP-Updater' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(code: number) {
  return code === 429 || (code >= 500 && code < 600);
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2,
  baseDelay = 250,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, init);
      if (!res.ok && isRetryableStatus(res.status))
        throw new Error(String(res.status));
      return res;
    } catch (e: any) {
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

function parseRepo(): { owner: string; repo: string } | null {
  // Prefer explicit env, e.g. "owner/repo"
  const env = process.env.BEEPERMCP_UPDATE_REPO;
  if (env && env.includes('/')) {
    const [owner, repo] = env.split('/', 2);
    return { owner, repo };
  }
  // Try reading package.json repository
  try {
    const pkg = require('../../package.json');
    const repoUrl: string | undefined = pkg.repository?.url || pkg.repository;
    if (repoUrl && repoUrl.includes('github.com')) {
      const m = repoUrl.match(/github\.com[:/]+([^/]+)\/([^/.#]+)(?:\.git)?/i);
      if (m) return { owner: m[1], repo: m[2] };
    }
  } catch {}
  return null;
}

function semverLt(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da < db;
  }
  return false;
}

function sha256(file: string): string {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

async function downloadWithResume(url: string, dest: string) {
  ensureDir(path.dirname(dest));
  const part = dest + '.part';
  // Cleanup very old partials
  try {
    const st = fs.statSync(part);
    if (Date.now() - st.mtimeMs > 7 * 24 * 60 * 60 * 1000) fs.unlinkSync(part);
  } catch {}
  let start = 0;
  try {
    start = fs.statSync(part).size;
  } catch {}
  const headers: Record<string, string> = {
    'User-Agent': 'BeeperMCP-Updater',
  } as any;
  if (start > 0) headers['Range'] = `bytes=${start}-`;
  const res = await fetchWithRetry(url, { headers }, 3, 300);
  if (!(res.status === 200 || res.status === 206))
    throw new Error(`HTTP ${res.status}`);
  const writeFlags = start > 0 && res.status === 206 ? 'a' : 'w';
  const file = fs.createWriteStream(part, { mode: 0o755, flags: writeFlags });
  await new Promise<void>((resolve, reject) => {
    (res.body as any).pipe(file);
    (res.body as any).on('error', reject);
    file.on('finish', resolve);
  });
  fs.renameSync(part, dest);
}

function verifyDetachedSignature(
  manifestBytes: Buffer,
  sigText: string,
  pubKeyB64?: string,
): boolean {
  if (!sigText || !pubKeyB64) return false;
  try {
    // Simple JSON { alg: 'ed25519', sig: base64 } format support
    if (sigText.trim().startsWith('{')) {
      const obj = JSON.parse(sigText);
      if (obj.alg !== 'ed25519' || typeof obj.sig !== 'string') return false;
      const sig = Buffer.from(obj.sig, 'base64');
      const pub = Buffer.from(pubKeyB64, 'base64');
      return crypto.verify(
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

export async function maybeAutoUpdate({ force = false }: { force?: boolean }) {
  try {
    if (!isPackaged())
      return { replaced: false, reason: 'Not a packaged binary' };
    const tag = platformTag();
    if (!tag) return { replaced: false, reason: 'Unsupported platform' };
    const repo = parseRepo();
    if (!repo) return { replaced: false, reason: 'No update repo configured' };

    const state = readJSON<{ lastCheck: number }>(statePath()) || {
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
    let expectedSha: string | undefined;
    let manifestBytes: Buffer | undefined;
    try {
      const manifestRes = await fetchWithRetry(
        `https://github.com/${repo.owner}/${repo.repo}/releases/download/v${latestVer}/manifest.json`,
        { headers: { 'User-Agent': 'BeeperMCP-Updater' } },
      );
      if (!manifestRes.ok) throw new Error(`HTTP ${manifestRes.status}`);
      manifestBytes = Buffer.from(await manifestRes.arrayBuffer());
      const manifest = JSON.parse(manifestBytes.toString('utf8'));
      const entry = (manifest?.assets || []).find(
        (a: any) => a.name === baseName,
      );
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
      const asset = (latest.assets || []).find((a: any) => a.name === baseName);
      if (asset?.browser_download_url) url = asset.browser_download_url;
    }

    const tmp = path.join(homeBase(), 'tmp');
    ensureDir(tmp);
    const newFile = path.join(tmp, baseName);
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
      fs.unlinkSync(backup);
    } catch {}
    try {
      fs.unlinkSync(staged);
    } catch {}

    // Stage then swap (Windows cannot overwrite running exe)
    fs.copyFileSync(newFile, staged);
    try {
      fs.chmodSync(staged, 0o755);
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
      fs.renameSync(target, backup);
    } catch {}
    fs.renameSync(staged, target);
    return { replaced: true };
  } catch (e: any) {
    return { replaced: false, reason: e?.message || String(e) };
  }
}
