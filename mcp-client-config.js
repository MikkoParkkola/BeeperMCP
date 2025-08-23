#!/usr/bin/env node
/**
 * Automated MCP Client Configuration Script
 *
 * This script automatically detects and configures various MCP clients
 * to work with your BeeperMCP server.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const homeDir = os.homedir();

// MCP Client configurations
const MCP_CLIENTS = {
  'claude-desktop': {
    name: 'Claude Desktop',
    configPaths: [
      path.join(
        homeDir,
        'Library/Application Support/Claude/claude_desktop_config.json',
      ), // macOS
      path.join(homeDir, '.config/claude/claude_desktop_config.json'), // Linux
      path.join(homeDir, 'AppData/Roaming/Claude/claude_desktop_config.json'), // Windows
    ],
    configTemplate: {
      mcpServers: {
        beeper: {
          command: 'node',
          args: [path.resolve(__dirname, 'start-stdio.sh')],
          cwd: __dirname,
          env: {},
        },
      },
    },
  },

  'claude-cli': {
    name: 'Claude CLI',
    configPaths: [path.join(homeDir, '.config/claude-code/mcp_servers.json')],
    configTemplate: {
      beeper: {
        command: 'node',
        args: [path.resolve(__dirname, 'start-stdio.sh')],
        cwd: __dirname,
        env: {},
      },
    },
  },

  boltai: {
    name: 'BoltAI',
    configPaths: [
      path.join(homeDir, 'Library/Application Support/BoltAI/mcp_servers.json'),
      path.join(homeDir, '.config/boltai/mcp_servers.json'),
    ],
    configTemplate: {
      beeper: {
        command: 'node',
        args: [path.resolve(__dirname, 'dist/beeper-mcp-server.js')],
        cwd: __dirname,
        env: {
          MCP_STDIO_MODE: '1',
        },
      },
    },
  },

  codex: {
    name: 'Codex CLI',
    configPaths: [
      path.join(homeDir, '.config/codex/mcp.json'),
      path.join(homeDir, '.codex/mcp.json'),
    ],
    configTemplate: {
      servers: {
        beeper: {
          command: 'node',
          args: [path.resolve(__dirname, 'dist/beeper-mcp-server.js')],
          cwd: __dirname,
          env: {
            MCP_STDIO_MODE: '1',
          },
        },
      },
    },
  },

  goose: {
    name: 'Goose',
    configPaths: [path.join(homeDir, '.config/goose/profiles.yaml')],
    configTemplate: null, // YAML format, handled separately
    yamlConfig: `
toolkits:
  - name: beeper-mcp
    mcp_servers:
      - name: beeper
        command: node
        args: 
          - ${path.resolve(__dirname, 'dist/beeper-mcp-server.js')}
        cwd: ${__dirname}
        env:
          MCP_STDIO_MODE: "1"
`,
  },
};

function detectClients() {
  console.log('🔍 Detecting installed MCP clients...\n');

  const detectedClients = [];

  for (const [clientId, client] of Object.entries(MCP_CLIENTS)) {
    for (const configPath of client.configPaths) {
      const configDir = path.dirname(configPath);

      // Check if config directory exists (indicates client is installed)
      if (fs.existsSync(configDir)) {
        detectedClients.push({
          id: clientId,
          name: client.name,
          configPath,
          exists: fs.existsSync(configPath),
          client,
        });
        console.log(`✅ Found ${client.name} at ${configDir}`);
        break; // Only need to find one valid config path
      }
    }
  }

  if (detectedClients.length === 0) {
    console.log('❌ No MCP clients detected');
    console.log('\nSupported clients:');
    for (const client of Object.values(MCP_CLIENTS)) {
      console.log(`   - ${client.name}`);
    }
  }

  return detectedClients;
}

function configureClient(clientInfo) {
  const { id, name, configPath, exists, client } = clientInfo;

  console.log(`\n🔧 Configuring ${name}...`);

  try {
    // Ensure directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      console.log(`📁 Created config directory: ${configDir}`);
    }

    let config = {};

    // Load existing config
    if (exists) {
      try {
        const existingConfig = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(existingConfig);
        console.log(`📄 Loaded existing config from ${configPath}`);
      } catch (error) {
        console.log(`⚠️  Could not parse existing config: ${error.message}`);
        console.log('   Creating new config...');
      }
    }

    // Handle special cases
    if (id === 'goose') {
      // Goose uses YAML format
      const yamlContent = client.yamlConfig.trim();
      fs.writeFileSync(configPath, yamlContent);
      console.log(`✅ Configured ${name} (YAML format)`);
      return true;
    }

    // Merge configurations
    if (id === 'claude-desktop') {
      config.mcpServers = config.mcpServers || {};
      Object.assign(config.mcpServers, client.configTemplate.mcpServers);
    } else if (id === 'codex') {
      config.servers = config.servers || {};
      Object.assign(config.servers, client.configTemplate.servers);
    } else {
      // Default merge for other clients
      Object.assign(config, client.configTemplate);
    }

    // Write config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`✅ Configured ${name}`);

    return true;
  } catch (error) {
    console.log(`❌ Failed to configure ${name}: ${error.message}`);
    return false;
  }
}

function createManualInstructions() {
  console.log('\n📋 Manual Configuration Instructions');
  console.log('====================================\n');

  console.log(
    'If automatic configuration failed, you can manually add BeeperMCP to your clients:\n',
  );

  console.log('For Claude Desktop (claude_desktop_config.json):');
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          beeper: {
            command: 'node',
            args: [path.resolve(__dirname, 'dist/beeper-mcp-server.js')],
            cwd: __dirname,
            env: { MCP_STDIO_MODE: '1' },
          },
        },
      },
      null,
      2,
    ),
  );

  console.log('\nFor other MCP clients:');
  console.log('- Command: node');
  console.log(
    `- Args: ["${path.resolve(__dirname, 'dist/beeper-mcp-server.js')}"]`,
  );
  console.log(`- Working Directory: ${__dirname}`);
  console.log('- Environment: MCP_STDIO_MODE=1');

  console.log('\nFor HTTP clients (using port 3000):');
  console.log('- URL: http://localhost:3000');
  console.log('- Make sure to start with: ./start-http.sh');
}

function verifyInstallation() {
  console.log('\n🧪 Verifying BeeperMCP installation...');

  const requiredFiles = [
    'dist/beeper-mcp-server.js',
    '.beeper-mcp-server.env',
    'package.json',
  ];

  let allGood = true;

  for (const file of requiredFiles) {
    const filepath = path.join(__dirname, file);
    if (fs.existsSync(filepath)) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ ${file} (missing)`);
      allGood = false;
    }
  }

  if (!allGood) {
    console.log('\n⚠️  Some files are missing. Run the installation first:');
    console.log('   ./install.sh');
    return false;
  }

  return true;
}

async function testStdioMode() {
  console.log('\n🧪 Testing STDIO mode...');

  try {
    const { spawn } = require('child_process');

    const child = spawn(
      'node',
      [path.join(__dirname, 'dist/beeper-mcp-server.js')],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, MCP_STDIO_MODE: '1' },
        cwd: __dirname,
      },
    );

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Send a test initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };

    child.stdin.write(JSON.stringify(initRequest) + '\n');

    // Wait for response or timeout
    await new Promise((resolve) => {
      setTimeout(() => {
        child.kill();
        resolve();
      }, 3000);

      child.on('exit', resolve);
    });

    if (output.includes('initialize') || output.includes('result')) {
      console.log('✅ STDIO mode test passed');
      return true;
    } else {
      console.log('⚠️  STDIO mode test inconclusive');
      console.log('   Error output:', errorOutput.slice(0, 200));
      return false;
    }
  } catch (error) {
    console.log(`❌ STDIO mode test failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 BeeperMCP Client Configuration Tool');
  console.log('=====================================\n');

  // Verify installation
  if (!verifyInstallation()) {
    process.exit(1);
  }

  // Test STDIO mode
  await testStdioMode();

  // Detect and configure clients
  const clients = detectClients();

  if (clients.length === 0) {
    createManualInstructions();
    return;
  }

  let configuredCount = 0;

  for (const client of clients) {
    if (configureClient(client)) {
      configuredCount++;
    }
  }

  console.log(
    `\n🎉 Successfully configured ${configuredCount} out of ${clients.length} detected clients!`,
  );

  if (configuredCount < clients.length) {
    createManualInstructions();
  }

  console.log('\n✨ Next Steps:');
  console.log('1. Make sure BeeperMCP is built: npm run build');
  console.log('2. Edit .beeper-mcp-server.env with your Matrix credentials');
  console.log('3. Test with: ./start-stdio.sh');
  console.log('4. Restart your MCP clients to pick up the new configuration');

  console.log('\n📖 Troubleshooting:');
  console.log('- Check logs in your MCP client for connection errors');
  console.log(
    '- Ensure Matrix credentials are correct in .beeper-mcp-server.env',
  );
  console.log(
    '- Try different MCP protocol versions if compatibility issues occur',
  );
}

// Handle command line arguments
const command = process.argv[2];

switch (command) {
  case 'detect':
    detectClients();
    break;
  case 'manual':
    createManualInstructions();
    break;
  case 'test':
    verifyInstallation();
    testStdioMode();
    break;
  case '--help':
  case '-h':
  case 'help':
    console.log('BeeperMCP Client Configuration Tool\n');
    console.log('Usage:');
    console.log(
      '  node mcp-client-config.js        # Auto-configure all detected clients',
    );
    console.log('  node mcp-client-config.js detect # Only detect clients');
    console.log(
      '  node mcp-client-config.js manual # Show manual configuration',
    );
    console.log('  node mcp-client-config.js test   # Test installation');
    break;
  default:
    main().catch(console.error);
}
