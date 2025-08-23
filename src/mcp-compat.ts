/**
 * MCP Protocol Version Compatibility Layer
 * 
 * Provides backward compatibility with older MCP protocol versions
 * while supporting the latest features when available.
 */

export interface MCPVersionInfo {
  version: string;
  supportsBatching: boolean;
  supportsStreamableHttp: boolean;
  supportsOAuth: boolean;
  requiresApiKey: boolean;
}

export const MCP_VERSIONS: Record<string, MCPVersionInfo> = {
  '2024-11-05': {
    version: '2024-11-05',
    supportsBatching: false,
    supportsStreamableHttp: false,
    supportsOAuth: false,
    requiresApiKey: false, // Local STDIO mode doesn't need API key
  },
  '2025-03-26': {
    version: '2025-03-26', 
    supportsBatching: true,
    supportsStreamableHttp: true,
    supportsOAuth: true,
    requiresApiKey: true,
  },
  '2025-06-18': {
    version: '2025-06-18',
    supportsBatching: false, // Removed in this version
    supportsStreamableHttp: true,
    supportsOAuth: true,
    requiresApiKey: true,
  }
};

export function getVersionInfo(version?: string): MCPVersionInfo {
  // Default to oldest compatible version for maximum compatibility
  const defaultVersion = '2024-11-05';
  return MCP_VERSIONS[version || defaultVersion] || MCP_VERSIONS[defaultVersion];
}

export function negotiateVersion(clientVersion?: string, serverVersion?: string): MCPVersionInfo {
  const client = getVersionInfo(clientVersion);
  const server = getVersionInfo(serverVersion);
  
  // Use the older version to ensure compatibility
  const versions = Object.keys(MCP_VERSIONS).sort();
  const clientIndex = versions.indexOf(client.version);
  const serverIndex = versions.indexOf(server.version);
  
  const compatibleVersion = versions[Math.min(clientIndex, serverIndex)];
  return MCP_VERSIONS[compatibleVersion];
}

export function isStdioMode(): boolean {
  // Check if we're running in STDIO mode (no HTTP server needed)
  return !process.env.MCP_SERVER_PORT && !process.env.MCP_HTTP_MODE;
}

export function shouldRequireApiKey(versionInfo: MCPVersionInfo): boolean {
  // Never require API key for local STDIO mode
  if (isStdioMode()) return false;
  
  // For HTTP mode, respect version requirements
  return versionInfo.requiresApiKey;
}