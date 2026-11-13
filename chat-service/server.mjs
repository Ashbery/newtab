import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createChatGPT } from '@siwc/local';
import { encryption } from './dpapi.mjs';

const PORT = 43127;
const PRODUCTION_ORIGIN = 'https://ashbery.github.io';
const PERSONALITY = '你是使用者新分頁裡的貓耳角色陪伴助理。用自然、溫柔的繁體中文回答，適度有個性，但不要每句加喵。清楚回答問題，不編造事實或聲稱做過未執行的工作。你只能閱讀本次傳來的對話；沒有瀏覽器、檔案、Dot 記憶或電腦控制權限。';
export function validateMessages(value) {
  if (!Array.isArray(value) || !value.length || value.length > 40) throw new Error('invalid_messages');
  let length = 0;
  const messages = value.map(message => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 12000) throw new Error('invalid_messages');
    length += message.content.length;
    return { role: message.role, content: message.content };
  });
  if (length > 60000 || messages.at(-1).role !== 'user') throw new Error('invalid_messages');
  return messages;
}
function openOfficialBrowser(url) {
  if (new URL(url).origin !== 'https://auth.openai.com') throw new Error('Invalid authorization destination.');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$address=[Console]::In.ReadToEnd(); Start-Process -FilePath $address'], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => reject(new Error('Could not open sign-in.')));
    child.on('close', code => code === 0 ? resolve() : reject(new Error('Could not open sign-in.')));
    child.stdin.on('error', () => {}); child.stdin.end(url);
  });
}
function safeError(error) {
  const code = typeof error?.code === 'string' ? error.code : error?.message === 'invalid_messages' ? 'invalid_messages' : 'service_error';
  const messages = {
    sign_in_required: '請先使用 ChatGPT 登入。', sharing_not_enabled: '請在 ChatGPT 授權使用方案後再試一次。',
    connection_busy: '請先完成目前的登入。', subscription_sharing_usage_limit_exceeded: 'ChatGPT 方案用量已達上限，請稍後再試或檢查用量設定。',
    subscription_sharing_usage_unavailable: '目前無法使用 ChatGPT 方案，請檢查帳號授權。',
    invalid_messages: '這段對話太長，請開啟新對話後再試。', invalid_model: '模型已無法使用，請重新整理連線狀態。',
    response_incomplete: '回覆尚未完成，請重試。', cancelled: '已停止回覆。'
  };
  return { code: Object.hasOwn(messages, code) ? code : 'service_error', message: messages[code] || '暫時無法完成要求，請稍後重試。' };
}
async function jsonBody(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 270000) throw new Error('invalid_messages'); chunks.push(chunk); }
  const text = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(text || '{}'); } catch { throw new Error('invalid_messages'); }
}
export function createService({ client, port = PORT, developmentOrigin, onLoginOpened } = {}) {
  const origins = new Set([PRODUCTION_ORIGIN]);
  if (developmentOrigin && /^http:\/\/127\.0\.0\.1:\d+$/.test(developmentOrigin)) origins.add(developmentOrigin);
  let login = null, active = null, catalog = [], catalogProfile = null, lastLoginError = null, loginGeneration = 0;
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  async function status() {
    const session = await client.getSession();
    if (!session.sharing || catalogProfile !== session.profileId) { catalog = []; catalogProfile = session.profileId; }
    if (session.status === 'connected' && session.sharing && !catalog.length) catalog = await client.listModels();
    return { available: true, connecting: !!login, connected: session.status === 'connected', canChat: session.status === 'connected' && session.sharing,
      accountLabel: session.identity?.email || session.profileLabel || '', models: catalog, error: lastLoginError || (session.error ? safeError(session.error).message : null) };
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.headers.host !== `127.0.0.1:${port}`) return json(res, 403, { error: 'invalid_host' });
    const origin = req.headers.origin;
    if (!origins.has(origin)) return json(res, 403, { error: 'invalid_origin' });
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Newtab-Client');
      res.writeHead(204); return res.end();
    }
    if (req.headers['x-newtab-client'] !== '1') return json(res, 403, { error: 'client_header_required' });
    try {
      if (req.url === '/v1/status' && req.method === 'GET') return json(res, 200, await status());
      if (req.url === '/v1/login' && req.method === 'POST') {
        if (!login) {
          lastLoginError = null;
          const generation = ++loginGeneration;
          const pending = Promise.resolve().then(async () => {
            const session = await client.getSession();
            if (generation !== loginGeneration) return;
            return client.signIn({ reconsent: session.status === 'connected' && !session.sharing });
          }).catch(error => { if (generation === loginGeneration) lastLoginError = safeError(error).message; })
            .finally(() => { if (login === pending) { login = null; catalog = []; } });
          login = pending;
          onLoginOpened?.();
        }
        return json(res, 202, { opened: true });
      }
      if (req.url === '/v1/disconnect' && req.method === 'POST') {
        ++loginGeneration; login = null;
        active?.abort(); client.cancelSignIn(); await client.disconnect(); catalog = []; lastLoginError = null;
        return json(res, 200, { disconnected: true });
      }
      if (req.url === '/v1/chat' && req.method === 'POST') {
        if (active) return json(res, 409, { error: { code: 'busy', message: '已有一段回覆進行中，請先停止或稍候。' } });
        const controller = new AbortController(); active = controller;
        const timer = setTimeout(() => { controller.abort(); if (!res.writableEnded) res.end(); }, 180000);
        res.on('close', () => controller.abort());
        try {
        const body = await jsonBody(req), messages = validateMessages(body.messages);
        const session = await status();
        if (controller.signal.aborted) { res.end(); return; }
        if (!session.canChat) return json(res, 401, { error: { code: 'sign_in_required', message: '請先使用 ChatGPT 登入並授權方案用量。' } });
        const model = body.model || catalog[0]?.slug;
        if (!catalog.some(entry => entry.slug === model)) throw Object.assign(new Error(), { code: 'invalid_model' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        const event = (name, data) => { if (!res.destroyed && !controller.signal.aborted) res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`); };
        event('start', { model });
        try {
          const result = await client.streamResponse({ model, input: messages, instructions: PERSONALITY, signal: controller.signal, onDelta: text => event('delta', { text }) });
          event('done', { text: result.text });
        } catch (error) { if (!controller.signal.aborted) event('error', safeError(error)); }
        finally { res.end(); }
        } finally { clearTimeout(timer); if (active === controller) active = null; }
        return;
      }
      json(res, 404, { error: 'not_found' });
    } catch (error) { if (!res.headersSent) json(res, 400, { error: safeError(error) }); else res.end(); }
  });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'AshberyNewtabChat', 'account');
  const client = createChatGPT({ appName: 'Ashbery Newtab', appId: 'ashbery-newtab', redirectPort: 0, storageDir: dataRoot,
    credentialEncryption: encryption, sendHostId: true, openBrowser: openOfficialBrowser });
  const server = createService({ client, developmentOrigin: process.env.NEWTAB_DEV_ORIGIN });
  server.listen(PORT, '127.0.0.1', () => console.log('Ashbery local chat service ready.'));
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Chat service is already running.' : 'Chat service could not start.'); process.exitCode = 1; });
}
