// Real decoded frames around background-video loop seams. Requires ffmpeg,
// Playwright, and the running local static server. Defaults to generated clips;
// optional NEWTAB_SEAM_FILE reads the explicitly selected local file unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173';
const baseline = process.env.NEWTAB_LOOP_BASELINE === '1';
const reportFile = process.env.NEWTAB_SEAM_REPORT || `.impeccable/review/round8-seam-${baseline ? 'baseline' : 'native-checks'}.json`;
const requestedDurationMs = Number(process.env.NEWTAB_SEAM_DURATION_MS || 0);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'newtab-seam-fixtures-'));
const fixtures = process.env.NEWTAB_SEAM_FILE ? [{ name: path.basename(process.env.NEWTAB_SEAM_FILE),
    file: fs.realpathSync(process.env.NEWTAB_SEAM_FILE), source: 'file', generated: false }] : [
    { name: 'h264.mp4', mime: 'video/mp4', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-g', '60', '-bf', '2', '-movflags', '+faststart'] },
    { name: 'vp9.webm', mime: 'video/webm', args: ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '6', '-crf', '36', '-b:v', '0', '-g', '60', '-row-mt', '1'] }
];
for (const fixture of fixtures) {
    if (fixture.source !== 'file') {
        fixture.source = 'url';
        fixture.generated = true;
        fixture.file = path.join(scratch, fixture.name);
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30',
            '-t', '2', '-an', '-pix_fmt', 'yuv420p', '-threads', '2', ...fixture.args, fixture.file], { timeout: 60000 });
        fixture.bytes = fs.readFileSync(fixture.file);
    }
    fixture.size = fs.statSync(fixture.file).size;
    const hash = crypto.createHash('sha256'), chunk = Buffer.alloc(4 * 1024 * 1024), fd = fs.openSync(fixture.file, 'r');
    try { let length; while ((length = fs.readSync(fd, chunk)) > 0) hash.update(chunk.subarray(0, length)); }
    finally { fs.closeSync(fd); }
    fixture.sha256 = hash.digest('hex');
    fixture.metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
        'format=duration,start_time:stream=codec_name,codec_type,width,height,avg_frame_rate,r_frame_rate,nb_frames,duration,start_time,sample_rate',
        '-of', 'json', fixture.file], { encoding: 'utf8', timeout: 30000 }));
}

async function attachFrameProbe(page) {
    await page.evaluate(() => {
        const selector = '#video-background, video[data-background-player]';
        const players = new Map();
        const started = performance.now();
        const state = { started, frames: [], events: [], visibility: [], readinessFailures: [], audibleFailures: [] };
        window.__seamProbe = state;
        const visible = video => {
            const css = getComputedStyle(video);
            return video.isConnected && !video.hidden && css.display !== 'none' && css.visibility !== 'hidden' &&
                Number(css.opacity) > .5 && video.getBoundingClientRect().width > 0;
        };
        const observe = () => document.querySelectorAll(selector).forEach(video => {
            if (players.has(video)) return;
            const id = 'player-' + players.size;
            players.set(video, id);
            ['seeking', 'seeked', 'waiting', 'stalled', 'playing', 'pause', 'ended', 'error', 'emptied'].forEach(type =>
                video.addEventListener(type, () => state.events.push({ id, type, at: performance.now(), time: video.currentTime, visible: visible(video), ready: video.readyState })));
            const frame = (now, metadata) => {
                state.frames.push({ id, now, display: metadata.expectedDisplayTime, media: metadata.mediaTime,
                    count: metadata.presentedFrames, visible: visible(video), ready: video.readyState, paused: video.paused });
                if (!state.stopped && video.isConnected) video.requestVideoFrameCallback(frame);
            };
            video.requestVideoFrameCallback(frame);
        });
        let lastVisible = '';
        function tick(now) {
            observe();
            const all = [...players.keys()];
            const shown = all.filter(visible);
            const identity = shown.map(v => players.get(v)).join(',');
            if (identity !== lastVisible) {
                state.visibility.push({ at: now, ids: identity, players: shown.map(v => ({ id: players.get(v), ready: v.readyState, time: v.currentTime })) });
                // Native looping can lower readyState while retaining the last
                // painted frame. Only a newly revealed undecoded surface is a
                // paint-readiness failure; frame-gap timing covers seek stalls.
                shown.forEach(v => { if (v.readyState < 2) state.readinessFailures.push({ at: now, id: players.get(v), ready: v.readyState }); });
                lastVisible = identity;
            }
            const audible = all.filter(v => !v.paused && !v.muted && v.volume > 0);
            if (audible.length > 1) state.audibleFailures.push({ at: now, ids: audible.map(v => players.get(v)) });
            if (!state.stopped) requestAnimationFrame(tick);
        }
        observe();
        requestAnimationFrame(tick);
    });
}

function summarize(probe) {
    const frames = probe.frames.filter(f => f.visible).sort((a, b) => a.display - b.display);
    const ordinary = [], seams = [];
    for (let index = 1; index < frames.length; index++) {
        const a = frames[index - 1], b = frames[index], gap = b.display - a.display;
        if (a.id !== b.id || b.media < a.media - .05) seams.push({ gapMs: gap, from: a, to: b });
        else if (gap > 0 && gap < 300) ordinary.push(gap);
    }
    ordinary.sort((a, b) => a - b);
    return { frames: frames.length, seams, maxSeamMs: Math.max(0, ...seams.map(s => s.gapMs)),
        medianFrameMs: ordinary[Math.floor(ordinary.length / 2)], p95FrameMs: ordinary[Math.floor(ordinary.length * .95)],
        visibleWaiting: probe.events.filter(e => e.visible && ['waiting', 'stalled'].includes(e.type)),
        readinessFailures: probe.readinessFailures, audibleFailures: probe.audibleFailures, visibility: probe.visibility };
}

(async () => {
    const launch = { headless: true };
    if (process.env.NEWTAB_BROWSER_PATH) launch.executablePath = process.env.NEWTAB_BROWSER_PATH;
    else launch.channel = process.env.PLAYWRIGHT_CHANNEL || 'msedge';
    const browser = await chromium.launch(launch);
    const report = { mode: baseline ? 'native-baseline' : 'native-regression', browser: await browser.version(),
        fixtureDescription: process.env.NEWTAB_SEAM_FILE ? 'User-selected file, read unchanged via the local upload/Blob path.' :
            'Generated 1920×1080 30fps 2-second moving test pattern, no audio; no user video used.', cases: [] };
    try {
        for (const fixture of fixtures) {
            const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            const url = new URL('/__seam-fixtures__/' + fixture.name, base).href;
            await context.route('**/__seam-fixtures__/*', async route => {
                if (route.request().url().endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="#8ba9c0" d="M0 0h32v32H0z"/></svg>' });
                const bytes = fixture.bytes;
                const range = route.request().headers().range;
                if (range) {
                    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
                    assert(match, 'expected a single browser media byte range');
                    const start = Number(match[1]), end = Math.min(bytes.length - 1, match[2] ? Number(match[2]) : bytes.length - 1);
                    return route.fulfill({ status: 206, contentType: fixture.mime,
                        headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${bytes.length}` }, body: bytes.subarray(start, end + 1) });
                }
                return route.fulfill({ contentType: fixture.mime, headers: { 'Accept-Ranges': 'bytes' }, body: bytes });
            });
            if (fixture.source === 'url') await page.addInitScript(url => localStorage.setItem('nt_background_v1', JSON.stringify({ type: 'video', source: 'url', name: 'Seam fixture', url })), url);
            await page.goto(base, { waitUntil: 'domcontentloaded' });
            if (fixture.source === 'file') {
                await page.waitForFunction(() => window.NewtabBackground);
                await page.evaluate(() => NewtabBackground.openUpload());
                await page.locator('#bg-file').setInputFiles(fixture.file);
                await page.locator('#confirm-upload').click();
                await page.locator('#video-upload-container').waitFor({ state: 'hidden' });
            }
            await page.waitForFunction(() => {
                const video = document.getElementById('video-background');
                return video.readyState >= 2 && !video.paused && video.currentTime > .05;
            });
            const duration = await page.locator('#video-background').evaluate(video => video.duration);
            assert(Number.isFinite(duration) && duration > 0, 'seam measurement requires a finite video');
            const durationMs = requestedDurationMs || Math.ceil(Math.max(8500, duration * 3300));
            await attachFrameProbe(page);
            await page.waitForTimeout(durationMs);
            const probe = await page.evaluate(() => { window.__seamProbe.stopped = true; return window.__seamProbe; });
            const result = { codec: fixture.name, source: fixture.source, sha256: fixture.sha256, bytes: fixture.size,
                metadata: fixture.metadata, captureMs: durationMs, ...summarize(probe), errors };
            report.cases.push(result);
            assert(result.seams.length >= 3, 'must observe three real displayed loop boundaries');
            if (!baseline) {
                assert.equal(result.readinessFailures.length, 0, 'never reveal an undecoded player');
                assert(result.maxSeamMs <= Math.max(100, result.p95FrameMs * 2.5), `seam gap ${result.maxSeamMs}ms exceeds playback cadence`);
                await page.evaluate(() => NewtabSideRail.open());
                await page.locator('[data-action="play-pause"]').click();
                await page.waitForTimeout(120);
                const paused = await page.locator('#video-background, video[data-background-player]').evaluateAll(vs => vs.every(v => v.paused));
                assert(paused, 'manual pause stops both visible and standby videos');
                await page.waitForTimeout(2200);
                assert(await page.locator('#video-background, video[data-background-player]').evaluateAll(vs => vs.every(v => v.paused)), 'loop scheduler never overrides manual pause');
                await page.locator('[data-action="play-pause"]').click();
                await page.waitForFunction(() => [...document.querySelectorAll('#video-background, video[data-background-player]')].some(v => !v.paused));
                await page.locator('[data-action="mute"]').click();
                await attachFrameProbe(page);
                await page.waitForTimeout(2300);
                const audio = await page.evaluate(() => { window.__seamProbe.stopped = true; return window.__seamProbe; });
                assert.equal(audio.audibleFailures.length, 0, 'no simultaneous unmuted players at handoff');
                await page.evaluate(() => NewtabBackground.openUpload());
                await page.locator('#bg-url').fill(new URL('/__seam-fixtures__/still.svg', base).href);
                await page.locator('#load-url-btn').click();
                await page.waitForFunction(() => document.getElementById('image-background').style.display === 'block');
                await page.waitForTimeout(2200);
                assert(await page.locator('#video-background, video[data-background-player]').evaluateAll(vs => vs.every(v => v.paused && !v.getAttribute('src'))), 'image swap releases all players and cannot resurrect video');
                result.controls = { pauseAcrossBoundary: true, singleAudiblePlayer: true, imageSwapCleanup: true };
            }
            assert.deepEqual(errors, []);
            console.log(`${fixture.name}: ${result.seams.length} seams, max ${result.maxSeamMs.toFixed(2)}ms, ordinary p95 ${result.p95FrameMs.toFixed(2)}ms`);
            await context.close();
        }
    } finally {
        fs.mkdirSync(path.dirname(reportFile), { recursive: true });
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        await browser.close();
        // Never delete or rewrite NEWTAB_SEAM_FILE. Only generated fixtures are ours.
        for (const fixture of fixtures) if (fixture.generated && path.dirname(fixture.file) === scratch) fs.unlinkSync(fixture.file);
        fs.rmdirSync(scratch);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
