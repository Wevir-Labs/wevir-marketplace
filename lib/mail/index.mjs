import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { MailService } from './service.mjs';
import { publicError } from './profiles.mjs';
import { TOOLS } from './tools.mjs';

const service = new MailService();
const server = new Server({ name: 'wevir-mail', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  let result;
  try { result = await service.invoke(request.params.name, request.params.arguments ?? {}); }
  catch (error) { result = publicError(error); }
  let output = JSON.stringify(result);
  const password = process.env.MAIL_APP_PASSWORD;
  if (password) {
    for (const value of [password, Buffer.from(password).toString('base64'), JSON.stringify(password).slice(1, -1)]) {
      output = output.split(value).join('[redacted]');
    }
  }
  return { content: [{ type: 'text', text: output }], isError: ['failed', 'send_unknown', 'operation_unknown'].includes(result.status) };
});
server.onerror = () => process.stderr.write('Mail MCP protocol error.\n');
process.once('SIGTERM', () => { void server.close().finally(() => process.exit(0)); });
process.once('SIGINT', () => { void server.close().finally(() => process.exit(0)); });
await server.connect(new StdioServerTransport());
