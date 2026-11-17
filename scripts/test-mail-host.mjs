// Node >=24.22.1; npm ci, build:mail, then:
// node scripts/test-mail-host.mjs --wevir /path/to/wevir-source-checkout
// Uses current Host source and a temporary home/userHome, never the running app's registry.
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mailFixture, PASSWORD } from '../lib/mail/test/fixture.mjs';

const { values } = parseArgs({ options: { wevir: { type: 'string' } } });
if (!values.wevir) throw new Error('usage: test-mail-host.mjs --wevir <Wevir source checkout>');
const source = path.resolve(values.wevir);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'wevir-mail-host-'));
const clients = [];
let fixture;
try {
  const bundled = path.join(temporary, 'host-registry.mjs');
  await build({
    stdin: { contents: `export { PluginRegistry } from ${JSON.stringify(path.join(source, 'packages/host/src/plugins.ts'))};\nexport { EchoAdapter } from ${JSON.stringify(path.join(source, 'packages/runtime-adapter/src/echo.ts'))};`, resolveDir: ROOT, loader: 'ts' },
    absWorkingDir: ROOT, outfile: bundled, bundle: true, platform: 'node', format: 'esm', target: 'node24',
    conditions: ['@wevir/source'], nodePaths: [path.join(ROOT, 'node_modules')],
    alias: { '@wevir/protocol': path.join(source, 'packages/protocol/src/index.ts') },
    banner: { js: "import { createRequire as __testRequire } from 'node:module'; const require = __testRequire(import.meta.url);" },
  });
  const { PluginRegistry, EchoAdapter } = await import(pathToFileURL(bundled).href);
  const home = path.join(temporary, 'host-home'), userHome = path.join(temporary, 'user-home');
  const adapter = new EchoAdapter({ stepDelayMs: 0 });
  const registry = new PluginRegistry({ home, userHome, roots: () => [], adapter });
  await registry.load();
  const accounts = [['qq-mail', 'fixture@foxmail.com'], ['netease-mail', 'fixture@126.com'], ['sina-mail', 'fixture@sina.cn']];
  for (const [id] of accounts) {
    const { plugin, ignored } = await registry.installPlugin(path.join(ROOT, 'plugins', id));
    assert.equal(plugin.id, id); assert.equal(plugin.enabled, true); assert.deepEqual(ignored, []);
    assert.equal(plugin.skills.length, 1); assert.equal(plugin.connectors.length, 1);
  }
  assert.deepEqual((await registry.engineConfig()).connectors, []);
  for (const [id, address] of accounts) await registry.setPluginInputs(id, { MAIL_ADDRESS: address, MAIL_APP_PASSWORD: PASSWORD });
  assert.ok(!JSON.stringify(await registry.list()).includes(PASSWORD));
  const publicList = await registry.list();
  for (const [id] of accounts) {
    assert.ok(publicList.connectors.some(c => c.name === `${id}_mail`));
    assert.deepEqual(publicList.plugins.find(p => p.id === id).inputs.find(i => i.key === 'MAIL_APP_PASSWORD'),
      { key: 'MAIL_APP_PASSWORD', label: 'Authorization code / 授权码', secret: true, required: true, set: true });
  }
  if (process.platform !== 'win32') assert.equal((await stat(path.join(home, 'plugins/registry.json'))).mode & 0o777, 0o600);
  fixture = await mailFixture();
  const preload = path.join(temporary, 'redirect.mjs'), ca = path.join(temporary, 'fixture-ca');
  await cp(path.join(ROOT, 'lib/mail/test/redirect.mjs'), preload); await writeFile(ca, fixture.cert);
  const engine = await registry.engineConfig();
  assert.equal(engine.connectors.length, 3);
  for (const [id, address] of accounts) {
    const { config } = engine.connectors.find(c => c.name === `${id}_mail`);
    assert.equal(config.command, 'node'); assert.deepEqual(config.args, [path.join(home, 'plugins/packages', id, 'server/index.mjs')]);
    assert.equal(config.env.MAIL_ADDRESS, address); assert.equal(config.env.MAIL_PROVIDER, id); assert.equal(config.env.MAIL_APP_PASSWORD, PASSWORD);
    assert.ok(!config.args.join(' ').includes(PASSWORD)); assert.ok(!JSON.stringify(config).includes('${'));
    const client = new Client({ name: 'isolated-host-install-test', version: '1.0.0' }); clients.push(client);
    const diagnostics = [];
    const transport = new StdioClientTransport({ command: config.command, args: ['--import', preload, ...config.args], cwd: temporary,
      env: { PATH: process.env.PATH, ...config.env, NODE_EXTRA_CA_CERTS: ca, FIXTURE_IMAP_PORT: String(fixture.imapPort), FIXTURE_SMTP_PORT: String(fixture.smtpPort) }, stderr: 'pipe' });
    transport.stderr.on('data', data => diagnostics.push(data.toString()));
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 9);
    const result = await client.callTool({ name: 'mail_check_account', arguments: {} });
    const status = JSON.parse(result.content[0].text);
    assert.equal(status.status, 'connected'); assert.equal(status.provider, id); assert.equal(status.address, address);
    assert.ok(!diagnostics.join('').includes(PASSWORD));
    await registry.setPluginEnabled(id, false);
    assert.ok(!(await registry.engineConfig()).connectors.some(c => c.name === `${id}_mail`));
    await client.close();
    console.log(`${id}: Host manifest install, required inputs, environment expansion, stdio MCP call and disable passed`);
  }
  const reboot = new PluginRegistry({ home, userHome, roots: () => [], adapter }); await reboot.load();
  assert.equal((await reboot.list()).plugins.filter(p => p.enabled).length, 0);
  assert.deepEqual((await reboot.engineConfig()).connectors, []);
  assert.deepEqual(fixture.writes, []); assert.deepEqual(fixture.deliveries, []);
  console.log('Isolated current Host registry: all three plugins coexist; secrets masked, disabled state survives reload; no mail writes.');
} finally {
  for (const client of clients) await client.close();
  if (fixture) await fixture.close();
  await rm(temporary, { recursive: true, force: true });
}
