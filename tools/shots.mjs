// Takes the project screenshots in img/ from the live sites: node tools/shots.mjs
// Chrome is driven over its DevTools port with a fixed wait, because sites with live updates (Server-Sent
// Events) never let Chrome's own --screenshot finish. Analytics are blocked so the shots don't count as visits.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITES = [
  ['overbid', 'https://overbid.in/'],
  ['threadfit', 'https://ankitshdev.github.io/threadfit/'],
  ['backyourcountry', 'https://backyourcountry.fun/'],
];

const browser = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'].filter(Boolean).find((path) => existsSync(path));
if (!browser) throw new Error('No Chrome or Edge found. Set CHROME to its path.');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shots-'))}`,
  `--remote-debugging-port=${port}`, '--host-resolver-rules=MAP www.googletagmanager.com 0.0.0.0, MAP www.google-analytics.com 0.0.0.0, MAP datafa.st 0.0.0.0',
  'about:blank']);

let target;
for (let i = 0; i < 75 && !target; i += 1) {
  await wait(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
}
if (!target) { chrome.kill(); throw new Error('Chrome did not start.'); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (event) => { const m = JSON.parse(event.data); pending.get(m.id)?.(m); });
const send = (method, params = {}) => new Promise((resolve) => { id += 1; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  for (const [name, url] of SITES) {
    await send('Page.navigate', { url });
    await wait(6000);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1280, height: 800, scale: 1 } });
    writeFileSync(join(import.meta.dirname, '..', 'img', `${name}.png`), Buffer.from(shot.result.data, 'base64'));
    console.log(`img/${name}.png`);
  }
} finally {
  ws.close();
  chrome.kill();
}
