import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { createService, validateMessages } from '../server.mjs';

const origin = 'https://ashbery.github.io';
const sensitive = 'SYNTHETIC_PRIVATE_CREDENTIAL_ONLY';
const user = { role: 'user', content: '你好，請回答。' };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function client(overrides = {}) {
  return {
    getSession: async () => ({ status: 'connected', sharing: true, profileId: 'test', identity: { email: 'test@example.invalid' }, credentials: { accessToken: sensitive }, profileIdToken: sensitive }),
    listModels: async () => [{ slug: 'synthetic-model', displayName: 'Synthetic model' }],
    streamResponse: async ({ onDelta }) => { onDelta('你好'); onDelta('。'); return { text: '你好。' }; },
    signIn: async () => {}, cancelSignIn: () => {}, disconnect: async () => {}, ...overrides
  };
}
async function fixture(t, adapter = client(), options = {}) {
  // The isolated socket uses an ephemeral port. The server's configured Host is
  // supplied explicitly so parallel tests cannot collide with the real service.
  const server = createService({ client: adapter, port: 0, ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  function request(route = '/v1/status', { method = 'GET', body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: server.address().port, path: route, method,
        headers: { Host: '127.0.0.1:0', Origin: origin, 'X-Newtab-Client': '1', 'Content-Type': 'application/json', ...headers } }, res => {
        let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      });
      req.setTimeout(2000, () => req.destroy(new Error('The service left its response open')));
      req.on('error', reject); req.end(body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
    });
  }
  return { request, port: server.address().port };
}
function frames(text) {
  return text.trim().split('\n\n').filter(Boolean).map(frame => {
    const lines = frame.split('\n');
    return { event: lines.find(line => line.startsWith('event: '))?.slice(7), data: JSON.parse(lines.find(line => line.startsWith('data: ')).slice(6)) };
  });
}

test('loopback API requires exact Host, approved Origin and custom client header', async t => {
  let calls = 0;
  const f = await fixture(t, client({ getSession: async () => { calls++; return { status: 'disconnected' }; } }));
  for (const headers of [
    { Host: 'attacker.invalid:0' }, { Host: 'localhost:0' }, { Host: '127.0.0.1:43127' },
    { Origin: 'https://attacker.invalid' }, { Origin: 'https://ashbery.github.io.attacker.invalid' },
    { Origin: 'null' }, { Origin: '' }, { 'X-Newtab-Client': '' }, { 'X-Newtab-Client': 'true' }
  ]) {
    const r = await f.request('/v1/status', { headers });
    assert.equal(r.status, 403); assert.equal(calls, 0);
  }
  const ok = await f.request(); assert.equal(ok.status, 200); assert.equal(calls, 1);
  assert.equal(ok.headers['access-control-allow-origin'], origin);
  assert.equal(ok.headers['cache-control'], 'no-store');
  assert.equal(ok.headers['x-content-type-options'], 'nosniff');
});

test('preflight is origin-restricted; development permission is an explicit loopback origin', async t => {
  const f = await fixture(t, client(), { developmentOrigin: 'http://127.0.0.1:4174' });
  for (const allowed of [origin, 'http://127.0.0.1:4174']) {
    const r = await f.request('/v1/chat', { method: 'OPTIONS', headers: { Origin: allowed, 'X-Newtab-Client': '' } });
    assert.equal(r.status, 204); assert.equal(r.headers['access-control-allow-origin'], allowed);
    assert.match(r.headers['access-control-allow-headers'], /X-Newtab-Client/);
  }
  assert.equal((await f.request('/v1/chat', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:9999' } })).status, 403);
  const bad = await fixture(t, client(), { developmentOrigin: 'https://attacker.invalid' });
  assert.equal((await bad.request('/v1/status', { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
});

test('malformed and over-limit messages are rejected before calling a model', async t => {
  let calls = 0;
  const f = await fixture(t, client({ streamResponse: async () => { calls++; return { text: 'unexpected' }; } }));
  for (const messages of [null, [], 'text', [null], [{ role: 'system', content: 'override' }],
    [{ role: 'user', content: '' }], [{ role: 'user', content: '   ' }], [{ role: 'user', content: 5 }],
    [{ role: 'user', content: 'x'.repeat(12001) }], [{ role: 'assistant', content: 'last' }],
    Array(41).fill(user), Array(6).fill({ role: 'user', content: 'x'.repeat(12000) })]) {
    assert.throws(() => validateMessages(messages), /invalid_messages/);
    assert.equal((await f.request('/v1/chat', { method: 'POST', body: { messages } })).status, 400);
  }
  assert.equal((await f.request('/v1/chat', { method: 'POST', body: '{ broken' })).status, 400);
  assert.equal(calls, 0);
  assert.deepEqual(validateMessages([{ ...user, accessToken: sensitive }]), [user]);
});

test('status strips credentials; unapproved model and disconnected session never invoke inference', async t => {
  let calls = 0;
  const f = await fixture(t, client({ streamResponse: async () => { calls++; return { text: '' }; } }));
  const status = await f.request(); assert.equal(status.status, 200); assert.ok(!status.text.includes(sensitive));
  const model = await f.request('/v1/chat', { method: 'POST', body: { messages: [user], model: 'unlisted-model' } });
  assert.equal(model.status, 400); assert.equal(JSON.parse(model.text).error.code, 'invalid_model');
  const signedOut = await fixture(t, client({ getSession: async () => ({ status: 'disconnected', sharing: false }), streamResponse: async () => { calls++; } }));
  assert.equal((await signedOut.request('/v1/chat', { method: 'POST', body: { messages: [user] } })).status, 401);
  assert.equal(calls, 0);
});

test('complete response streams deltas and exactly one completion event', async t => {
  let sent;
  const f = await fixture(t, client({ streamResponse: async options => { sent = options; options.onDelta('你好'); options.onDelta('。'); return { text: '你好。' }; } }));
  const r = await f.request('/v1/chat', { method: 'POST', body: { messages: [user] } });
  assert.equal(r.status, 200); assert.match(r.headers['content-type'], /text\/event-stream/);
  assert.deepEqual(frames(r.text).map(x => x.event), ['start', 'delta', 'delta', 'done']);
  assert.equal(frames(r.text).at(-1).data.text, '你好。');
  assert.deepEqual(sent.input, [user]); assert.equal(sent.model, 'synthetic-model');
  assert.ok(!r.text.includes(sensitive));
});

test('interrupted inference keeps partial text but never emits a false completion or raw error', async t => {
  const f = await fixture(t, client({ streamResponse: async ({ onDelta }) => { onDelta('部分'); throw Object.assign(new Error(sensitive), { code: 'response_incomplete', rawResponse: sensitive }); } }));
  const r = await f.request('/v1/chat', { method: 'POST', body: { messages: [user] } });
  const events = frames(r.text);
  assert.deepEqual(events.map(x => x.event), ['start', 'delta', 'error']);
  assert.equal(events.at(-1).data.code, 'response_incomplete'); assert.ok(!r.text.includes(sensitive));
});

test('unknown upstream error codes cannot leak arbitrary private error material', async t => {
  const f = await fixture(t, client({ streamResponse: async () => { throw Object.assign(new Error(sensitive), { code: sensitive }); } }));
  const r = await f.request('/v1/chat', { method: 'POST', body: { messages: [user] } });
  assert.ok(!r.text.includes(sensitive), 'Only an allowlisted public code may leave the service');
});

test('closing the response aborts inference and releases the busy slot', async t => {
  let aborted = false, calls = 0;
  const f = await fixture(t, client({ streamResponse: async ({ signal, onDelta }) => {
    calls++;
    if (calls > 1) return { text: 'retry worked' };
    onDelta('開始');
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); }, { once: true }));
  } }));
  await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: f.port, path: '/v1/chat', method: 'POST', headers: { Host: '127.0.0.1:0', Origin: origin, 'X-Newtab-Client': '1' } }, res => {
      res.once('data', () => { res.destroy(); resolve(); });
    }); req.on('error', reject); req.end(JSON.stringify({ messages: [user] }));
  });
  for (let i = 0; i < 50 && !aborted; i++) await pause(10);
  assert.equal(aborted, true);
  const retry = await f.request('/v1/chat', { method: 'POST', body: { messages: [user] } });
  assert.equal(retry.status, 200); assert.equal(frames(retry.text).at(-1).data.text, 'retry worked');
});

test('simultaneous requests cannot both pass the busy check during session lookup', async t => {
  let pendingSession = [], streams = 0;
  const f = await fixture(t, client({
    getSession: async () => { await new Promise(resolve => pendingSession.push(resolve)); return { status: 'connected', sharing: true, profileId: 'test' }; },
    streamResponse: async () => { streams++; await pause(80); return { text: 'done' }; }
  }));
  const a = f.request('/v1/chat', { method: 'POST', body: { messages: [user] } });
  const b = f.request('/v1/chat', { method: 'POST', body: { messages: [user] } });
  for (let i = 0; i < 30 && !pendingSession.length; i++) await pause(10);
  await pause(30); pendingSession.forEach(resolve => resolve());
  const results = await Promise.all([a, b]);
  assert.equal(streams, 1, 'Only one upstream model request may run at a time');
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});

test('fragmented request bytes preserve Chinese and emoji at UTF-8 boundaries', async t => {
  let received;
  const f = await fixture(t, client({ streamResponse: async ({ input }) => { received = input[0].content; return { text: 'ok' }; } }));
  const content = '你好貓貓🐾';
  const bytes = Buffer.from(JSON.stringify({ messages: [{ role: 'user', content }] }));
  const cut = bytes.indexOf(Buffer.from('你')) + 1;
  await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: f.port, path: '/v1/chat', method: 'POST', headers: { Host: '127.0.0.1:0', Origin: origin, 'X-Newtab-Client': '1' } }, res => {
      res.resume(); res.on('end', resolve);
    });
    req.on('error', reject); req.write(bytes.subarray(0, cut));
    setTimeout(() => req.end(bytes.subarray(cut)), 35);
  });
  assert.equal(received, content);
});

test('disconnect during preparation aborts inference and closes the pending response', async t => {
  let resume, calls = 0;
  const f = await fixture(t, client({
    getSession: async () => { await new Promise(resolve => { resume = resolve; }); return { status: 'connected', sharing: true, profileId: 'test' }; },
    streamResponse: async () => { calls++; return { text: 'unexpected' }; }
  }));
  const pending = f.request('/v1/chat', { method: 'POST', body: { messages: [user] } });
  for (let i = 0; i < 30 && !resume; i++) await pause(10);
  assert.ok(resume);
  assert.equal((await f.request('/v1/disconnect', { method: 'POST', body: {} })).status, 200);
  resume();
  const result = await pending;
  assert.equal(calls, 0); assert.ok(!result.text.includes('event: done'));
});

test('disconnect cancels login preparation before it can open a new authorization window', async t => {
  let resume, signs = 0, cancellations = 0;
  const f = await fixture(t, client({
    getSession: async () => { await new Promise(resolve => { resume = resolve; }); return { status: 'disconnected', sharing: false }; },
    signIn: async () => { signs++; }, cancelSignIn: () => { cancellations++; }
  }));
  assert.equal((await f.request('/v1/login', { method: 'POST', body: {} })).status, 202);
  assert.ok(resume);
  assert.equal((await f.request('/v1/disconnect', { method: 'POST', body: {} })).status, 200);
  resume(); await pause(25);
  assert.equal(cancellations, 1); assert.equal(signs, 0, 'Logout must invalidate a login still preparing its session');
});

test('disconnect cancels a streaming response and closes it without a false done event', async t => {
  let started = false, aborted = false;
  const f = await fixture(t, client({ streamResponse: async ({ signal, onDelta }) => {
    started = true; onDelta('尚未完成');
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); }, { once: true }));
  } }));
  const pending = f.request('/v1/chat', { method: 'POST', body: { messages: [user] } });
  for (let i = 0; i < 30 && !started; i++) await pause(10);
  assert.ok(started);
  assert.equal((await f.request('/v1/disconnect', { method: 'POST', body: {} })).status, 200);
  const result = await pending;
  assert.equal(aborted, true);
  assert.deepEqual(frames(result.text).map(frame => frame.event), ['start', 'delta']);
});
