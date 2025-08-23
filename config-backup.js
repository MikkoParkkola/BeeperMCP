#!/usr/bin/env node
/**
 * Configuration Backup and Restore Utility for BeeperMCP
 * 
 * This script helps you save and restore your BeeperMCP configuration
 * so you can easily deploy it on different machines.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILES = [
  '.beeper-mcp-server.env',
  'package.json',
  'tsconfig.json'
];

const BACKUP_FILENAME = 'beeper-mcp-config-backup.json';

function saveConfig() {
  console.log('📁 Backing up BeeperMCP configuration...');
  
  const backup = {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    version: process.env.npm_package_version || 'unknown',
    files: {}
  };
  
  // Read and backup configuration files
  for (const filename of CONFIG_FILES) {
    const filepath = path.join(__dirname, filename);
    if (fs.existsSync(filepath)) {
      try {
        backup.files[filename] = fs.readFileSync(filepath, 'utf8');
        console.log(`✅ Saved ${filename}`);
      } catch (error) {
        console.warn(`⚠️  Could not read ${filename}: ${error.message}`);
      }
    } else {
      console.log(`⏭️  Skipped ${filename} (not found)`);
    }
  }
  
  // Extract sensitive but portable config
  if (backup.files['.beeper-mcp-server.env']) {
    const envContent = backup.files['.beeper-mcp-server.env'];
    const lines = envContent.split('\n');
    
    // Remove sensitive token but keep structure
    const sanitized = lines.map(line => {
      if (line.startsWith('MATRIX_TOKEN=')) {
        return 'MATRIX_TOKEN=your-matrix-token-here';
      }
      return line;
    }).join('\n');
    
    backup.files['.beeper-mcp-server.env'] = sanitized;
  }
  
  // Save backup
  const backupPath = path.join(__dirname, BACKUP_FILENAME);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  
  console.log(`\n🎉 Configuration backup saved to: ${backupPath}`);
  console.log('📝 Note: Matrix token was sanitized for security');
  console.log('💡 You can restore this config on another machine using: node config-backup.js restore');
}

function restoreConfig() {
  console.log('🔄 Restoring BeeperMCP configuration...');
  
  const backupPath = path.join(__dirname, BACKUP_FILENAME);
  
  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Backup file not found: ${backupPath}`);
    console.log('💡 Create a backup first using: node config-backup.js save');
    process.exit(1);
  }
  
  try {
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    
    console.log(`📅 Backup created: ${backup.timestamp}`);
    console.log(`💻 Original hostname: ${backup.hostname}`);
    
    // Restore files
    for (const [filename, content] of Object.entries(backup.files)) {
      const filepath = path.join(__dirname, filename);
      
      // Check if file exists and ask for confirmation
      if (fs.existsSync(filepath)) {
        console.log(`⚠️  ${filename} already exists. Backing up as ${filename}.backup`);
        fs.copyFileSync(filepath, `${filepath}.backup`);
      }
      
      fs.writeFileSync(filepath, content);
      console.log(`✅ Restored ${filename}`);
    }
    
    console.log('\n🎉 Configuration restored successfully!');
    console.log('⚠️  Remember to update your MATRIX_TOKEN in .beeper-mcp-server.env');
    console.log('💡 Run npm install and npm run build to ensure dependencies are ready');
    
  } catch (error) {
    console.error(`❌ Failed to restore configuration: ${error.message}`);
    process.exit(1);
  }
}

function showUsage() {
  console.log('BeeperMCP Configuration Backup Utility\n');
  console.log('Usage:');
  console.log('  node config-backup.js save      # Save current configuration');
  console.log('  node config-backup.js restore   # Restore from backup');
  console.log('  node config-backup.js --help    # Show this help\n');
  console.log('This utility helps you backup and restore your BeeperMCP configuration');
  console.log('so you can easily deploy it on different machines.');
}

// Main execution
const command = process.argv[2];

switch (command) {
  case 'save':
    saveConfig();
    break;
  case 'restore':
    restoreConfig();
    break;
  case '--help':
  case '-h':
  case 'help':
    showUsage();
    break;
  default:
    if (!command) {
      showUsage();
    } else {
      console.error(`❌ Unknown command: ${command}`);
      showUsage();
      process.exit(1);
    }
}