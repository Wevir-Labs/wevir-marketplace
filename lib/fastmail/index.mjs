import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import createDebug from 'debug';
import { publicError } from '../mail/profiles.mjs';
import { TOOLS } from '../mail/tools.mjs';
import { FastmailService } from './service.mjs';
import { DAV_TOOLS } from './tools.mjs';

createDebug.disable();
const service = new FastmailService();
const server = new Server({ name: 'wevir-fastmail', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...TOOLS, ...DAV_TOOLS] }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  let result;
  try { result = await service.invoke(request.params.name, request.params.arguments ?? {}); }
  catch (error) { result = publicError(error, service.env); }
  let output = JSON.stringify(result);
  const password = service.env.MAIL_APP_PASSWORD, address = service.env.MAIL_ADDRESS?.trim().toLowerCase();
  if (password) {
    for (const value of [password, Buffer.from(password).toString('base64'), JSON.stringify(password).slice(1, -1),
      Buffer.from(`${address}:${password}`).toString('base64'), Buffer.from(`\0${address}\0${password}`).toString('base64')]) output = output.split(value).join('[redacted]');
  }
  return { content: [{ type: 'text', text: output }], isError: ['failed', 'send_unknown', 'operation_unknown'].includes(result.status) };
});
server.onerror = () => process.stderr.write('Fastmail MCP protocol error.\n');
process.once('SIGTERM', () => { void server.close().finally(() => process.exit(0)); });
process.once('SIGINT', () => { void server.close().finally(() => process.exit(0)); });
await server.connect(new StdioServerTransport());
