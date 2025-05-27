#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

const envFile = path.join(__dirname, '.beeper-mcp-server.env');

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
      'npm install ts-node matrix-js-sdk pino dotenv zod @modelcontextprotocol/sdk',
      { stdio: 'inherit' }
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

function ask(question, def) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(def ? `${question} [${def}]: ` : `${question}: `, (ans) => {
      rl.close();
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

async function configure() {
  const env = readEnvFile();
  autoDetect(env);
  console.log('Configure BeeperMCP environment variables');
  env.MATRIX_HOMESERVER = await ask('Matrix homeserver URL', env.MATRIX_HOMESERVER || 'https://matrix.beeper.com');
  env.MATRIX_USERID = await ask('Matrix user ID', env.MATRIX_USERID);
  env.MATRIX_TOKEN = await ask('Access token (leave empty to use password login)', env.MATRIX_TOKEN);
  if (!env.MATRIX_TOKEN) {
    env.MATRIX_PASSWORD = await ask('Account password', env.MATRIX_PASSWORD);
  } else {
    env.MATRIX_PASSWORD = '';
  }
  env.MATRIX_CACHE_DIR = await ask('Cache directory', env.MATRIX_CACHE_DIR || './mx-cache');
  env.MESSAGE_LOG_DIR = await ask('Log directory', env.MESSAGE_LOG_DIR || './room-logs');
  env.LOG_LEVEL = await ask('Log level', env.LOG_LEVEL || 'info');
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

main();
