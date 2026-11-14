/* Browser acceptance for the real local Cubism renderer and its portrait fallback. */
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const sample = process.env.LIVE2D_TEST_MODEL || path.join(root,'assets/character/live2d');
const modelFile = fs.existsSync(path.join(sample,'nacho.model3.json')) ? 'nacho.model3.json' : 'Haru.model3.json';
if (!fs.existsSync(path.join(sample,modelFile))) throw new Error('The local Nacho model is required. LIVE2D_TEST_MODEL may point to a separate model export or an official external Haru sample directory.');
const origin = 'http://newtab.test';
const modelUrl = origin + '/assets/character/live2d/test/'+modelFile;
const fixture = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#425260}.home-companion{position:relative;width:360px;height:480px;display:inline-block}.companion-trigger{border:0;padding:0;width:100%;height:100%;background:transparent}.companion-canvas,.companion-portrait{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.companion-canvas{opacity:0}.has-rig .companion-canvas{opacity:1}.has-rig .companion-portrait{opacity:0}</style><script src="/js/companion-live2d.js"></script><body><script>
window.make=(id,extra={})=>{const root=document.createElement('div');root.className='home-companion';root.id=id;root.innerHTML='<button class="companion-trigger" aria-label="與角色聊天"><img class="companion-portrait" src="/assets/character/nacho-companion.webp"><canvas class="companion-canvas"></canvas></button>';document.body.append(root);root.querySelector('button').onclick=()=>window.chatOpened=(window.chatOpened||0)+1;return NewtabCompanionLive2D.mount({root,canvas:root.querySelector('canvas'),modelUrl:'${modelUrl}',onError:e=>window.lastFailure=String(e),...extra})};
</script>`;
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let total = 0;
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.NEWTAB_BROWSER_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
    async function scenario(name, check, options = {}) {
        if (process.env.LIVE2D_CASE && !name.includes(process.env.LIVE2D_CASE)) return;
        const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, ...options });
        const page = await context.newPage(), errors = [], requests = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('request', r => requests.push(r.url()));
        await context.addInitScript(() => { Math.random = () => .2; });
        await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.fallback() : route.abort());
        await context.route(origin + '/**', async route => {
            const pathname = new URL(route.request().url()).pathname;
            if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: new URL(route.request().url()).searchParams.has('app') ? fs.readFileSync(path.join(root, 'index.html')) : fixture });
            const file = pathname.startsWith('/assets/character/live2d/test/') ? path.join(sample, pathname.slice('/assets/character/live2d/test/'.length)) : path.join(root, pathname);
            if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: 'missing' });
            return route.fulfill({ contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
        });
        try { await page.goto(origin); await check(page, context, requests); assert.deepEqual(errors, []); total++; console.log('PASS ' + name); }
        finally { await context.close(); }
    }
    try {
        await scenario('real moc3 paints, fixed head, blink/breath and text-reply expression', async page => {
            assert.equal(await page.evaluate(async () => { window.character = make('one'); return character.ready; }), true);
            const initial = await page.evaluate(() => character.state());
            assert.equal(initial.renderer, 'live2d');
            if(modelFile==='Haru.model3.json') assert.equal(initial.drawables,84);
            else assert(initial.drawables>=26,'The authored Nacho model renders independent art meshes');
            // Pixel evidence is captured by the browser compositor, not the cleared default buffer.
            const first = await page.locator('canvas').screenshot();
            await page.evaluate(() => { window.samples=[];window.sampleTimer=setInterval(()=>samples.push(character.state().parameters),20); character.setActivity({state:'replying'}); });
            await page.waitForTimeout(4100);
            const samples = await page.evaluate(() => { clearInterval(sampleTimer); return samples; });
            assert(samples.some(p => p.ParamEyeLOpen < .2)); assert(samples.some(p => p.ParamMouthOpenY > .1));
            assert(samples.some(p => p.ParamBreath > .6)); assert(samples.every(p => p.ParamAngleX === 0 && p.ParamAngleY === 0 && p.ParamAngleZ === 0));
            assert(samples.every(p => Object.entries(p).filter(([id]) => id.startsWith('ParamBodyAngle')).every(([, value]) => value === 0)));
            assert(!first.equals(await page.locator('canvas').screenshot()));
            await page.getByRole('button', { name: '與角色聊天' }).click(); assert.equal(await page.evaluate(() => chatOpened), 1);
            await page.evaluate(() => character.destroy());
        });
        await scenario('off/reduced motion neutral; explicit on overrides OS and resumes', async page => {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.evaluate(async () => { window.character=make('one'); await character.ready; });
            const before=await page.evaluate(()=>character.state());await page.waitForTimeout(180);
            assert.equal(await page.evaluate(()=>character.state().frames),before.frames);assert.equal(before.motion,'reduced');
            await page.evaluate(()=>character.setMode('on'));await page.waitForTimeout(180);assert((await page.evaluate(()=>character.state().frames))>before.frames);
            await page.evaluate(()=>{character.setActivity({state:'replying'});character.setMode('off');});
            const stopped=await page.evaluate(()=>character.state());await page.waitForTimeout(180);
            assert.equal(await page.evaluate(()=>character.state().frames),stopped.frames);assert.equal(stopped.parameters.ParamEyeLOpen,1);assert.equal(stopped.parameters.ParamMouthOpenY,0);
            await page.evaluate(()=>character.destroy());
        });
        await scenario('arrange/drag/manual pause, responsive backing size and clean destroy', async page => {
            await page.evaluate(async()=>{window.character=make('one');await character.ready;document.body.classList.add('is-dragging-widget');});await page.waitForTimeout(80);
            const paused=await page.evaluate(()=>character.state());await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>character.state().frames),paused.frames);
            await page.evaluate(()=>{document.body.classList.remove('is-dragging-widget');character.setPaused(true);document.querySelector('.home-companion').style.cssText='width:260px;height:350px';});await page.waitForTimeout(150);
            const resized=await page.evaluate(()=>character.state());assert.equal(resized.width,260);assert.equal(resized.height,350);assert.equal(resized.motion,'paused');
            await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>character.state().frames),resized.frames);
            await page.evaluate(()=>character.setPaused(false));await page.waitForTimeout(150);assert((await page.evaluate(()=>character.state().frames))>resized.frames);
            await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));const hidden=await page.evaluate(()=>character.state());await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>character.state().frames),hidden.frames);
            await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow')));await page.waitForTimeout(150);const resumed=await page.evaluate(()=>character.state());assert(resumed.frames>hidden.frames);assert(resumed.animationTime-hidden.animationTime<.3,'Resume does not catch up hidden time');
            await page.evaluate(()=>character.destroy());const dead=await page.evaluate(()=>character.state());await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>character.state().frames),dead.frames);assert.equal(dead.status,'destroyed');
        });
        await scenario('two widgets share libraries; removing one preserves the other; remount works', async(page,context,requests)=>{
            assert.deepEqual(await page.evaluate(async()=>{window.a=make('one');window.b=make('two');return Promise.all([a.ready,b.ready]);}),[true,true]);
            assert.equal(requests.filter(u=>u.endsWith('/live2dcubismcore.min.js')).length,1);assert.equal(requests.filter(u=>u.endsWith('/companion-runtime.js')).length,1);
            await page.evaluate(()=>a.destroy());const before=await page.evaluate(()=>b.state().frames);await page.waitForTimeout(180);assert((await page.evaluate(()=>b.state().frames))>before);
            await page.evaluate(()=>b.destroy());const remounted=await page.evaluate(async()=>{window.c=make('three');return {ready:await c.ready,error:window.lastFailure};});assert.equal(remounted.ready,true,remounted.error);await page.evaluate(()=>c.destroy());
        });
        await scenario('missing model and invalid cross-origin resources preserve portrait/chat',async(page,context,requests)=>{
            assert.equal(await page.evaluate(async()=>{window.character=make('one',{modelUrl:'/assets/character/live2d/missing.model3.json'});return character.ready;}),false);
            assert.equal(requests.filter(u=>u.includes('/assets/vendor/cubism/')).length,0,'Missing optional model does not download the Cubism libraries');
            assert.equal(await page.locator('#one').evaluate(e=>e.classList.contains('has-rig')),false);
            await page.locator('#one button').click();assert.equal(await page.evaluate(()=>chatOpened),1);await page.evaluate(()=>character.destroy());
            await context.route(modelUrl,route=>route.fulfill({contentType:'application/json',body:JSON.stringify({Version:3,FileReferences:{Moc:'https://example.com/forbidden.moc3',Textures:['one.png']}})}));
            assert.equal(await page.evaluate(async()=>{window.character=make('two');return character.ready;}),false);assert(!requests.some(u=>u.includes('example.com')));await page.evaluate(()=>character.destroy());
        });
        await scenario('destroy during fetch never reveals a late model',async(page,context,requests)=>{
            await context.route(modelUrl,async route=>{await new Promise(resolve=>setTimeout(resolve,350));await route.fulfill({contentType:'application/json',body:fs.readFileSync(path.join(sample,modelFile))}).catch(()=>{});});
            await page.evaluate(()=>{window.character=make('one');setTimeout(()=>character.destroy(),80);});assert.equal(await page.evaluate(()=>character.ready),false);await page.waitForTimeout(400);
            assert.equal(await page.locator('#one').getAttribute('data-live2d'),'destroyed');assert.equal(await page.locator('#one').evaluate(e=>e.classList.contains('has-rig')),false);
            assert.equal(requests.filter(u=>u.includes('/assets/vendor/cubism/')).length,0);
        });
        await scenario('WebGL context loss returns to usable portrait',async page=>{
            assert.equal(await page.evaluate(async()=>{window.character=make('one');return character.ready;}),true);
            await page.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
            await page.waitForFunction(()=>character.state().status==='unavailable');assert.equal(await page.locator('#one').evaluate(e=>e.classList.contains('has-rig')),false);
            await page.locator('#one button').click();assert.equal(await page.evaluate(()=>chatOpened),1);await page.evaluate(()=>character.destroy());
        });
        await scenario('actual newtab mounts real model, opens inline chat, propagates modes/activity and survives remount',async(page,context,requests)=>{
            let releaseManifest;
            const manifestGate=new Promise(resolve=>{releaseManifest=resolve;});
            await context.route(origin+'/assets/character/live2d/**',async route=>{
                const name=new URL(route.request().url()).pathname.slice('/assets/character/live2d/'.length);
                const file=path.join(sample,name==='nacho.model3.json'?modelFile:name);
                if(name==='nacho.model3.json') {
                    await manifestGate;
                    const json=JSON.parse(fs.readFileSync(file));json.Ashbery={PreserveCanvas:true};
                    return route.fulfill({contentType:'application/json',body:JSON.stringify(json)});
                }
                return route.fulfill({contentType:MIME[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
            });
            await page.goto(origin+'/?app',{waitUntil:'domcontentloaded'});
            await page.waitForFunction(()=>document.querySelector('.companion-portrait')?.naturalWidth>0);
            assert.equal(await page.locator('.companion-portrait').evaluate(e=>getComputedStyle(e).opacity),'1');
            await page.locator('#search-input').fill('搜尋先可用');
            assert.equal(await page.locator('#search-input').inputValue(),'搜尋先可用');
            assert.equal(requests.filter(u=>u.includes('/assets/vendor/cubism/')).length,0,'Heavy libraries wait for the optional model; search and portrait are already usable');
            const shell=await page.evaluate(()=>({at:performance.now(),ready:document.documentElement.getAttribute('data-startup')}));
            releaseManifest();
            await page.waitForFunction(()=>window.NewtabCompanion?.getState('companion-1')?.renderer==='live2d');
            assert.equal(await page.evaluate(()=>NewtabCompanion.getState('companion-1').framing.mode),'canvas');
            const release=await page.locator('meta[name="newtab-release"]').getAttribute('content');
            const assets=requests.filter(u=>u.includes('/assets/vendor/cubism/')||u.includes('/assets/character/live2d/'));
            assert(assets.length>=5);assert(assets.every(u=>new URL(u).searchParams.get('v')===release),'All lazy resources share the current release');
            console.log('First-load ordering: '+JSON.stringify({searchAndPortraitReadyMs:Math.round(shell.at),modelReadyMs:Math.round(await page.evaluate(()=>performance.now())),lazyAssets:assets.length}));
            assert.equal(await page.locator('.home-companion').getAttribute('data-live2d'),'ready');
            await page.locator('.companion-trigger').click();
            assert.equal(await page.evaluate(()=>NewtabCharacterChat.isOpen()),true);
            assert.equal(page.url(),origin+'/?app');
            await page.evaluate(()=>{NewtabCharacterChat.close();NewtabCompanion.setChatState('companion-1','replying');});
            await page.locator('.companion-portrait').evaluate(e=>e.dispatchEvent(new Event('error')));
            assert.equal(await page.locator('.home-companion').evaluate(e=>e.classList.contains('art-unavailable')),false,'A late failed portrait cannot alter the successfully loaded model UI');
            await page.waitForFunction(()=>NewtabCompanion.getState('companion-1').parameters.ParamMouthOpenY>.1);
            await page.evaluate(()=>NewtabCompanion.setAnimation('companion-1','off'));
            await page.waitForFunction(()=>NewtabCompanion.getState('companion-1')?.motion==='off');
            const stopped=await page.evaluate(()=>NewtabCompanion.getState('companion-1'));await page.waitForTimeout(180);
            assert.equal(await page.evaluate(()=>NewtabCompanion.getState('companion-1').frames),stopped.frames);
            assert.equal(stopped.parameters.ParamMouthOpenY,0);
            await page.evaluate(()=>NewtabCompanion.setAnimation('companion-1','on'));
            await page.waitForFunction(()=>NewtabCompanion.getState('companion-1')?.motion==='running');
            await page.locator('.companion-trigger').click();assert.equal(await page.evaluate(()=>NewtabCharacterChat.isOpen()),true);
            await page.evaluate(()=>{NewtabCharacterChat.close();document.querySelector('.companion-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();});
            await page.waitForFunction(()=>NewtabCompanion.getState('companion-1')?.renderer==='webgl');
            await page.locator('.companion-trigger').click();assert.equal(await page.evaluate(()=>NewtabCharacterChat.isOpen()),true);
        });
        await scenario('actual newtab missing model retains original animation and inline chat without loading Cubism',async(page,context,requests)=>{
            await context.route(origin+'/assets/character/live2d/nacho.model3.json*',route=>route.fulfill({status:404,body:'not installed'}));
            await page.goto(origin+'/?app');
            await page.waitForFunction(()=>window.NewtabCompanion?.getState('companion-1')?.renderer==='webgl');
            assert.equal(await page.locator('.home-companion').getAttribute('data-live2d'),'unavailable');
            assert.equal(requests.filter(u=>u.includes('/assets/vendor/cubism/')).length,0);
            await page.locator('.companion-trigger').click();assert.equal(await page.evaluate(()=>NewtabCharacterChat.isOpen()),true);
        });
        for(const [width,height,dpr] of [[1920,1080,2],[3440,1440,2],[5120,1440,2]]) {
            await scenario(`actual newtab ${width}x${height} DPR${dpr} canvas stays inside widget and inline chat accepts text`,async(page,context)=>{
                await context.route(origin+'/assets/character/live2d/**',route=>{
                    const name=new URL(route.request().url()).pathname.slice('/assets/character/live2d/'.length);
                    const file=path.join(sample,name==='nacho.model3.json'?modelFile:name);
                    return route.fulfill({contentType:MIME[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
                });
                await page.goto(origin+'/?app');
                await page.waitForFunction(()=>window.NewtabCompanion?.getState('companion-1')?.renderer==='live2d');
                const geometry=await page.locator('.widget[data-type="companion"]').evaluate(widget=>{
                    const bounds=widget.getBoundingClientRect();
                    return {inside:[...widget.querySelectorAll('.companion-trigger,.companion-canvas,.companion-portrait,.companion-disc')].every(node=>{const r=node.getBoundingClientRect();return r.left>=bounds.left-1&&r.top>=bounds.top-1&&r.right<=bounds.right+1&&r.bottom<=bounds.bottom+1;}),
                        viewport:bounds.left>=0&&bounds.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth+1,
                        backing:[widget.querySelector('canvas').width,widget.querySelector('canvas').height]};
                });
                assert(geometry.inside);assert(geometry.viewport);assert(Math.max(...geometry.backing)<=2048);
                fs.mkdirSync(path.join(root,'.impeccable/review/live2d-nacho/final'),{recursive:true});
                await page.screenshot({path:path.join(root,`.impeccable/review/live2d-nacho/final/newtab-${width}-dpr${dpr}.png`)});
                await page.locator('.companion-trigger').click();await page.locator('#character-chat-input').fill('你好，Nacho');
                assert.equal(await page.locator('#character-chat-input').inputValue(),'你好，Nacho');assert.equal(page.url(),origin+'/?app');assert.equal(context.pages().length,1);
            },{viewport:{width,height},deviceScaleFactor:dpr});
        }
        console.log(`${total} Live2D browser cases passed.`);
    } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
