import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export function buildMcpServer(
  client: any,
  logDb: any,
  enableSend: boolean,
  logSecret?: string,
  queryFn?: (
    db: any,
    roomId: string,
    limit?: number,
    since?: string,
    until?: string,
    secret?: string,
  ) => string[],
): McpServer;
