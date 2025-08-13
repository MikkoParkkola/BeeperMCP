#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envFile = path.join(__dirname, '.beeper-mcp-server.env');

function ensureDir(dir) {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

function checkCommand(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ensureDeps() {
  if (!checkCommand('node')) {
    console.error('Node.js is required. Install it from https://nodejs.org/');
    process.exit(1);
  }
  try {
    require.resolve('ts-node');
  } catch {
    console.log('Installing Node dependencies...');
    execSync(
      'npm install ts-node matrix-js-sdk pino dotenv zod @modelcontextprotocol/sdk @matrix-org/olm',
      { stdio: 'inherit' },
    );
  }
}

function readEnvFile() {
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile);
    return dotenv.parse(content);
  }
  return {};
}

function writeEnvFile(env) {
  const lines = Object.entries(env)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(envFile, lines.join('\n'));
  console.log(`Saved configuration to ${envFile}`);
}

function ask(question, def, opts = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const prompt = def ? `${question} [${def}]: ` : `${question}: `;
    if (opts.hidden) {
      rl.stdoutMuted = true;
      rl._writeToOutput = function (stringToWrite) {
        if (rl.stdoutMuted) rl.output.write('*');
        else rl.output.write(stringToWrite);
      };
    }
    rl.question(prompt, (ans) => {
      rl.close();
      if (opts.hidden) console.log();
      resolve(ans || def || '');
    });
  });
}

function autoDetect(env) {
  const home = os.homedir();
  const guesses = [
    path.join(home, 'Library/Application Support/Beeper/config.json'),
    path.join(home, '.config/Beeper/config.json'),
    path.join(home, 'Library/Application Support/Element/config.json'),
    path.join(home, '.config/Element/config.json'),
  ];
  for (const g of guesses) {
    try {
      if (fs.existsSync(g)) {
        const data = JSON.parse(fs.readFileSync(g, 'utf8'));
        env.MATRIX_HOMESERVER ||= data.baseUrl || data.default_hs_url;
        env.MATRIX_USERID ||= data.userId || data.user_id;
        env.MATRIX_TOKEN ||= data.accessToken || data.access_token;
      }
    } catch {}
  }
}

function validateEnv(env) {
  const errs = [];
  if (!/^https?:\/\//.test(env.MATRIX_HOMESERVER || ''))
    errs.push('MATRIX_HOMESERVER must start with http:// or https://');
  if (!/^@.+:.+$/.test(env.MATRIX_USERID || ''))
    errs.push('MATRIX_USERID must look like @user:domain');
  if (!env.MATRIX_TOKEN && !env.MATRIX_PASSWORD)
    errs.push('Either MATRIX_TOKEN or MATRIX_PASSWORD is required');
  return errs;
}

async function configure() {
  let env = readEnvFile();
  autoDetect(env);
  console.log('Configure BeeperMCP environment variables');
  while (true) {
    env.MATRIX_HOMESERVER = await ask(
      'Matrix homeserver URL',
      env.MATRIX_HOMESERVER || 'https://matrix.beeper.com',
    );
    env.MATRIX_USERID = await ask('Matrix user ID', env.MATRIX_USERID);
    env.MATRIX_TOKEN = await ask(
      'Access token (leave empty to use password login)',
      env.MATRIX_TOKEN,
    );
    if (!env.MATRIX_TOKEN) {
      env.MATRIX_PASSWORD = await ask('Account password', env.MATRIX_PASSWORD, {
        hidden: true,
      });
    } else {
      env.MATRIX_PASSWORD = '';
    }
    env.MATRIX_CACHE_DIR = await ask(
      'Cache directory',
      env.MATRIX_CACHE_DIR || './mx-cache',
    );
    env.MESSAGE_LOG_DIR = await ask(
      'Log directory',
      env.MESSAGE_LOG_DIR || './room-logs',
    );
    env.LOG_LEVEL = await ask('Log level', env.LOG_LEVEL || 'info');
    env.SESSION_SECRET = await ask(
      'Session encryption secret (leave blank for none)',
      env.SESSION_SECRET || '',
    );
    env.LOG_SECRET = await ask(
      'Log encryption secret (leave blank for none)',
      env.LOG_SECRET || '',
    );
    env.LOG_MAX_BYTES = await ask(
      'Max log size in bytes before rotation',
      env.LOG_MAX_BYTES || '5000000',
    );
    const enableSend = await ask(
      'Enable send_message tool? (y/N)',
      env.ENABLE_SEND_MESSAGE === '1' ? 'y' : '',
    );
    env.ENABLE_SEND_MESSAGE = /^y(es)?$/i.test(enableSend) ? '1' : '';

    const errs = validateEnv(env);
    if (errs.length === 0) break;
    console.log('Configuration errors:');
    for (const e of errs) console.log(' - ' + e);
  }
  ensureDir(env.MATRIX_CACHE_DIR);
  ensureDir(env.MESSAGE_LOG_DIR);
  writeEnvFile(env);
}

function runPhasedSetup() {
  execSync('npx ts-node phased-setup.ts', { stdio: 'inherit' });
}

async function main() {
  ensureDeps();
  await configure();
  runPhasedSetup();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { autoDetect, validateEnv };
