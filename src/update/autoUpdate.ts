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

async function download(url: string, dest: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BeeperMCP-Updater' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  ensureDir(path.dirname(dest));
  const file = fs.createWriteStream(dest, { mode: 0o755 });
  await new Promise<void>((resolve, reject) => {
    (res.body as any).pipe(file);
    (res.body as any).on('error', reject);
    file.on('finish', resolve);
  });
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
    try {
      const manifest = await fetchJSON(
        `https://github.com/${repo.owner}/${repo.repo}/releases/download/v${latestVer}/manifest.json`,
      );
      const entry = (manifest?.assets || []).find(
        (a: any) => a.name === baseName,
      );
      if (entry) {
        url = entry.url || url;
        expectedSha = entry.sha256;
      }
    } catch {
      // no manifest, best-effort fallback to asset URL in release list
      const asset = (latest.assets || []).find((a: any) => a.name === baseName);
      if (asset?.browser_download_url) url = asset.browser_download_url;
    }

    const tmp = path.join(homeBase(), 'tmp');
    ensureDir(tmp);
    const newFile = path.join(tmp, baseName);
    await download(url, newFile);
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
