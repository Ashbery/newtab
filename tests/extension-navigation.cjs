// Disposable native-Brave regression for navigation before an async worker can
// promote the iframe. All website/destination traffic is fulfilled locally.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.resolve(process.env.NEWTAB_NAV_ARTIFACTS || path.join(root, '.impeccable/review/navigation'));
const extensionSource = path.resolve(process.env.NEWTAB_EXTENSION_PATH || path.join(root, 'extension'));
const executablePath = process.env.NEWTAB_BROWSER_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
const site = 'https://ashbery.github.io/newtab/';
const delayMs = Number(process.env.NEWTAB_NAV_WORKER_DELAY || 350);
fs.mkdirSync(artifactRoot, { recursive: true });
const runRoot = fs.mkdtempSync(path.join(artifactRoot, 'run-'));
const extension = path.join(runRoot, 'extension');
fs.cpSync(extensionSource, extension, { recursive: true });

async function routeLocally(route) {
    const request = route.request();
    const url = new URL(request.url());
    if (!['https:', 'http:'].includes(url.protocol)) return route.continue();
    if (url.href.startsWith(site)) {
        const relative = decodeURIComponent(url.pathname.slice('/newtab/'.length)) || 'index.html';
        const file = path.resolve(root, relative);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
        if (request.resourceType() === 'media') return route.abort();
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
        return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    }
    if (request.isNavigationRequest()) {
        return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" }, body: '<title>Synthetic destination</title><p>Synthetic destination</p>' });
    }
    return route.abort();
}

(async () => {
    let context;
    const evidence = { delayMs, runRoot, cases: [] };
    try {
        const modifiedDestination = 'https://example.test/modified-navigation';
        context = await chromium.launchPersistentContext(path.join(runRoot, 'profile'), {
            executablePath, headless: true, ignoreDefaultArgs: ['--disable-extensions'],
            args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension, '--host-resolver-rules=MAP * ~NOTFOUND'],
        });
        await context.route('**/*', routeLocally);
        const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        // The API still returns the real registered document. Only the async
        // storage boundary is slowed to expose the existing navigation race.
        await worker.evaluate(ms => {
            const original = chrome.storage.session.get.bind(chrome.storage.session);
            chrome.storage.session.get = async keys => {
                if (typeof keys === 'string' && keys.startsWith('newtabDocument:')) {
                    await new Promise(resolve => setTimeout(resolve, ms));
                }
                return original(keys);
            };
        }, delayMs);

        const scenarios = [
            { name: 'gmail', selector: '.widget[data-id="app-gmail"] a' },
            { name: 'gmail-keyboard', selector: '.widget[data-id="app-gmail"] a', keyboard: true },
            { name: 'gmail-control-click', selector: '.widget[data-id="app-gmail"] a', destination: modifiedDestination, newTab: true, click: { modifiers: ['Control'] } },
            { name: 'gmail-middle-click', selector: '.widget[data-id="app-gmail"] a', destination: modifiedDestination, newTab: true, click: { button: 'middle' } },
            { name: 'arrange-click', selector: '.widget[data-id="app-gmail"] a', arrange: true },
            { name: 'images', selector: '.widget[data-id="app-images"] a' },
            { name: 'hostile-frame-response', selector: '.widget[data-id="app-gmail"] a', destination: 'https://ashbery.github.io/frame-denied' },
            { name: 'search', query: 'example.test/navigation-regression', destination: 'https://example.test/navigation-regression' },
        ];
        for (const scenario of scenarios) {
            const page = await context.newPage();
            const cdp = await context.newCDPSession(page);
            await cdp.send('Page.enable');
            await cdp.send('Network.enable');
            const events = [];
            const result = { name: scenario.name, events };
            evidence.cases.push(result);
            const record = (type, detail) => events.push({ time: Date.now(), type, ...detail });
            cdp.on('Page.frameNavigated', ({ frame }) => record('frameNavigated', { id: frame.id, parentId: frame.parentId, url: frame.url, unreachableUrl: frame.unreachableUrl }));
            cdp.on('Page.frameRequestedNavigation', event => record('frameRequestedNavigation', event));
            cdp.on('Network.loadingFailed', event => record('loadingFailed', event));
            page.on('console', message => { if (message.type() === 'error') record('consoleError', { text: message.text() }); });
            page.on('request', request => { if (request.isNavigationRequest()) record('documentRequest', { url: request.url(), child: request.frame() !== page.mainFrame() }); });
            await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' });
            const frame = page.frameLocator('#newtab-frame');
            await frame.locator('#search-input').waitFor();
            const website = page.frames().find(item => item.url().startsWith(site));
            await website.waitForFunction(() => document.documentElement.dataset.newtabExtension === 'ready');
            let destination = scenario.destination;
            if (scenario.selector) {
                const link = frame.locator(scenario.selector);
                if (destination) await link.evaluate((element, value) => { element.href = value; }, destination);
                else destination = await link.getAttribute('href');
                destination = new URL(destination).href;
            }
            events.length = 0;
            const wrapperUrl = page.url();
            const pageCount = context.pages().length;
            let destinationPage = page;
            if (scenario.arrange) {
                await website.evaluate(() => NewtabSideRail.open());
                await frame.getByRole('tab', { name: '個人化', exact: true }).click();
                await frame.locator('#arrange-home').click();
                await website.waitForFunction(() => NewtabWidgets.isArranging());
                await frame.locator('.widget[data-id="app-gmail"]').click();
                assert.equal(await website.evaluate(() => NewtabWidgets.isArranging()), true, 'arrangement click keeps arrangement mode');
                assert.equal(page.url(), wrapperUrl, 'arrangement click keeps the wrapper');
                assert.equal(website.url(), site, 'arrangement click keeps the website frame');
                assert.equal(context.pages().length, pageCount, 'arrangement click opens no tab');
                destination = wrapperUrl;
            } else if (scenario.newTab) {
                [destinationPage] = await Promise.all([
                    context.waitForEvent('page'),
                    frame.locator(scenario.selector).click(scenario.click),
                ]);
                assert.equal(page.url(), wrapperUrl, 'modified click keeps the source wrapper');
                assert.equal(website.url(), site, 'modified click keeps the source website frame');
                assert.equal(context.pages().length, pageCount + 1, 'modified click opens one tab');
            } else if (scenario.keyboard) {
                await frame.locator(scenario.selector).focus();
                await frame.locator(scenario.selector).press('Enter');
            } else if (scenario.query) {
                await frame.locator('#search-input').fill(scenario.query);
                await frame.locator('#search-input').press('Enter');
            } else await frame.locator(scenario.selector).click();
            result.observedPages = context.pages().map(item => item.url());
            if (scenario.newTab) {
                const destinationSession = await context.newCDPSession(destinationPage);
                result.destinationFrame = (await destinationSession.send('Page.getFrameTree')).frameTree.frame;
                // Browser-created tabs may load before route interception. DNS
                // blocking keeps this synthetic destination offline. This case
                // verifies tab choice and selected URL, not destination rendering.
                assert.equal(result.destinationFrame.unreachableUrl || result.destinationFrame.url, destination);
                result.destinationRendered = !result.destinationFrame.unreachableUrl;
            } else {
                await destinationPage.waitForURL(destination, { timeout: 10000, waitUntil: 'domcontentloaded' });
                if (!scenario.arrange) assert.equal(await destinationPage.title(), 'Synthetic destination');
            }
            const childAttempts = events.filter(event => event.type === 'documentRequest' && event.child && event.url === destination);
            const errorFrames = events.filter(event => event.type === 'frameNavigated' && event.parentId && (event.unreachableUrl || event.url.startsWith('chrome-error:')));
            const blockedFrames = events.filter(event => event.type === 'consoleError' && /Framing .*violates|Refused to (frame|display)/i.test(event.text));
            Object.assign(result, { destination, finalUrl: destinationPage.url(), childAttempts: childAttempts.length, errorFrames: errorFrames.length, blockedFrames: blockedFrames.length });
            console.log(JSON.stringify({ name: scenario.name, childAttempts: childAttempts.length, errorFrames: errorFrames.length, blockedFrames: blockedFrames.length, finalUrl: destinationPage.url() }));
            if (destinationPage !== page) await destinationPage.close();
            await page.close();
        }
        assert(evidence.cases.every(result => result.childAttempts === 0 && result.errorFrames === 0 && result.blockedFrames === 0), 'External navigation must begin at the top level, with no intermediate destination iframe/blocked-frame/error document');
        console.log('PASS native Brave shortcuts/search render at top level despite delayed worker storage and hostile frame headers; modifiers select new tabs; arrangement keeps source.');
    } finally {
        if (context) await context.close();
        fs.writeFileSync(path.join(runRoot, 'timeline.json'), JSON.stringify(evidence, null, 2));
        console.log('Evidence ' + path.join(runRoot, 'timeline.json'));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
