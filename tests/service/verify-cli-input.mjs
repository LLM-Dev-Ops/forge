import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Real handler + real loopback TCP. This adapter tests the exported CLI edge
// handler, not Cloud Run startup, IAM, or RuVector delivery.
const root = path.resolve(process.argv[2] || '.');
const { edgeFunctionHandler, healthCheckHandler, contractHandler } = await import(
  pathToFileURL(path.join(root, 'src/agents/cli-command-generator/handler.ts'))
);
const cases = [
  { id: 'null', body: 'null' },
  { id: 'array', body: '[]' },
  { id: 'string', body: '"hello"' },
  { id: 'number', body: '42' },
  { id: 'missing fields', body: '{}' },
  { id: 'invalid framework', body: '{"framework":"invalid"}' },
  { id: 'untrusted coercion property', body: '{"contractId":{"toString":"not callable"}}' },
];
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const result =
      req.url === '/health'
        ? healthCheckHandler()
        : req.url === '/contract'
          ? contractHandler()
          : await edgeFunctionHandler({
              method: req.method,
              headers: {},
              body: Buffer.concat(chunks).toString('utf8'),
            });
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
  } catch {
    res.writeHead(500);
    res.end('{}');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
async function send(body, method = 'POST', url = '/') {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: '127.0.0.1', port: server.address().port, path: url, method },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          })
        );
      }
    );
    req.setTimeout(5000, () => req.destroy(new Error('HTTP fixture timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
const holdout = [],
  anchor = [];
try {
  for (const c of cases) {
    const result = await send(c.body);
    holdout.push({
      id: c.id,
      ...result,
      pass:
        result.status === 400 && Array.isArray(result.body.errors) && result.body.errors.length > 0,
    });
  }
  for (const [id, body, method, url, status] of [
    ['malformed JSON', '{', 'POST', '/', 400],
    ['unsupported method', '', 'GET', '/', 405],
    ['health', '', 'GET', '/health', 200],
    ['contract', '', 'GET', '/contract', 200],
  ]) {
    const result = await send(body, method, url);
    anchor.push({ id, status: result.status, pass: result.status === status });
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
console.log(
  JSON.stringify({
    holdout,
    anchor,
    passed: holdout.filter((x) => x.pass).length,
    total: holdout.length,
  })
);
assert(holdout.every((x) => x.pass) && anchor.every((x) => x.pass));
