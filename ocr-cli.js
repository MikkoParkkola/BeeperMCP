#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { once } = require('events');

const API_URL = 'https://api.mistral.ai/v1/ocr';

const DEFAULT_CONFIG = {
  apiKey: '',
  format: 'md'
};

function readConfig(file) {
  try {
    return Object.assign({}, DEFAULT_CONFIG, JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(file, cfg) {
  fs.writeFileSync(file, JSON.stringify(Object.assign({}, DEFAULT_CONFIG, cfg), null, 2));
}

function parseArgs(argv) {
  const opts = {};
  const files = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--api-key' && argv[i+1]) {
      opts.apiKey = argv[++i];
    } else if (arg === '--format' && argv[i+1]) {
      opts.format = argv[++i];
    } else if (arg === '--config' && argv[i+1]) {
      opts.config = argv[++i];
    } else {
      files.push(arg);
    }
  }
  return { opts, files };
}

function color(str, code) {
  return `\u001b[${code}m${str}\u001b[0m`;
}

function info(msg) { console.log(color(msg, 32)); }
function error(msg) { console.error(color(msg, 31)); }

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt(question);
  rl.prompt();
  const ans = await once(rl, 'line');
  rl.close();
  return ans[0];
}

async function getApiKey(opts, config, configPath) {
  if (opts.apiKey) return opts.apiKey;
  if (config.apiKey) return config.apiKey;
  const key = await prompt('Enter Mistral API key: ');
  if (!key) throw new Error('API key required');
  const save = (await prompt('Save API key to config? (y/N) ')).toLowerCase().startsWith('y');
  if (save) {
    config.apiKey = key;
    writeConfig(configPath, config);
  }
  return key;
}

async function callMistral(file, apiKey, format) {
  const form = new FormData();
  form.append('file', fs.createReadStream(file));
  if (format) form.append('output_format', format);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status} ${txt}`);
  }
  return res.json();
}

async function run() {
  const { opts, files } = parseArgs(process.argv);
  if (!files.length) {
    console.log('Usage: ocr-cli.js [options] <file...>');
    console.log('Options: --api-key <key> --format <ext> --config <file>');
    process.exit(1);
  }
  const configPath = opts.config || path.join(os.homedir(), '.mistral-ocr.json');
  const config = readConfig(configPath);
  const format = opts.format || config.format || 'md';
  const apiKey = await getApiKey(opts, config, configPath);
  let totalTokens = 0;
  let totalCost = 0;
  for (const file of files) {
    try {
      info(`Processing ${file}...`);
      const result = await callMistral(file, apiKey, format);
      const outFile = path.join(path.dirname(file), `${path.parse(file).name}.${format}`);
      fs.writeFileSync(outFile, result.text || '');
      totalTokens += result.usage?.total_tokens || 0;
      totalCost += result.usage?.total_cost || 0;
      info(` -> ${outFile}`);
    } catch (err) {
      error(`Failed ${file}: ${err.message}`);
    }
  }
  console.log(`Tokens used: ${totalTokens}`);
  console.log(`Cost: $${totalCost.toFixed(6)}`);
}

if (require.main === module) {
  run().catch(err => { error(err.message); process.exit(1); });
}

module.exports = { parseArgs, readConfig, writeConfig };
