import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../../js/chat-transport.js', import.meta.url), 'utf8');
const encode = new TextEncoder();
function load(fetch) {
  const window = {};
  vm.runInNewContext(source, { window, fetch, AbortSignal, TextDecoder, Uint8Array });
  return window.NewtabChatTransport;
}
function response(text, sizes = [1, 3, 7, 2]) {
  const bytes = encode.encode(text); let at = 0, i = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (at >= bytes.length) { controller.close(); return; }
    const end = Math.min(bytes.length, at + sizes[i++ % sizes.length]); controller.enqueue(bytes.slice(at, end)); at = end;
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

test('transport reconstructs split UTF-8 SSE, preserves delta order and sends no credentials', async () => {
  let request; const chunks = [];
  const api = load(async (url, options) => { request = { url, ...options }; return response(event('start', { model: 'test' }) + event('delta', { text: '你好🐾' }) + event('delta', { text: '，世界。' }) + event('done', { text: '你好🐾，世界。' })); });
  const messages = [{ role: 'user', content: '你好' }]; const signal = new AbortController().signal;
  const characterPrompt = '你是 Nacho，安靜溫柔的貓耳陪伴角色。';
  const result = await api.stream({ messages, signal, characterPrompt, model: 'obsolete-client-value', onDelta: text => chunks.push(text) });
  assert.equal(result.text, '你好🐾，世界。'); assert.deepEqual(chunks, ['你好🐾', '，世界。']);
  assert.equal(request.url, 'http://127.0.0.1:43127/v1/chat'); assert.equal(request.signal, signal);
  assert.equal(request.headers['X-Newtab-Client'], '1');
  assert.deepEqual(JSON.parse(request.body), { messages, characterPrompt });
  assert.equal(Object.hasOwn(JSON.parse(request.body), 'model'), false, 'the website no longer sends a model selection');
  assert.ok(!Object.keys(request.headers).some(key => /authorization|cookie/i.test(key)));
});

test('transport rejects premature EOF and structured stream errors, keeping received deltas', async () => {
  for (const suffix of ['', event('error', { message: '請重新登入' })]) {
    const chunks = [];
    const api = load(async () => response(event('delta', { text: '部分' }) + suffix));
    await assert.rejects(api.stream({ messages: [], onDelta: text => chunks.push(text) }), /回覆中斷|重新登入/);
    assert.deepEqual(chunks, ['部分']);
  }
});

test('transport propagates cancellation without reporting successful completion', async () => {
  const controller = new AbortController();
  const api = load(async (_, options) => new Response(new ReadableStream({
    start(stream) { stream.enqueue(encode.encode(event('delta', { text: '開始' }))); options.signal.addEventListener('abort', () => stream.error(new DOMException('Stopped', 'AbortError')), { once: true }); }
  })));
  await assert.rejects(api.stream({ messages: [], signal: controller.signal, onDelta: () => controller.abort() }), error => error.name === 'AbortError');
  // A reader on an errored body need not invoke cancel(); its abort must still
  // reach the request and settle promptly without reporting success.
  assert.equal(controller.signal.aborted, true);
});

test('status has an honest disconnected state when the local service is unavailable', async () => {
  const api = load(async () => { throw new TypeError('Failed to fetch'); });
  const status = await api.status();
  assert.equal(status.available, false); assert.equal(status.canChat, false); assert.equal(status.connected, false);
  await assert.rejects(api.login(), /Failed to fetch/);
});
