import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer } from '../mcp-tools.js';
import type { MatrixClient } from 'matrix-js-sdk';

export async function initMcpServer(
  client: MatrixClient,
  logDb: any,
  enableSend: boolean,
  logSecret: string | undefined,
) {
  const srv = buildMcpServer(client, logDb, enableSend, logSecret);
  await srv.connect(new StdioServerTransport());
}
