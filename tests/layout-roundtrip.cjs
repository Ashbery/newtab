// Test artifacts stay local and are excluded from the published repository.
require('node:fs').mkdirSync('.impeccable/review', { recursive: true });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173';
const matrix = [[1440,900],[1920,1080],[2560,1440],[1280,720],[1440,720],[1920,900]];
const evidence = { defaults: [], responsive: [], activeDraft: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(page) {
    await page.goto(base);
    await page.waitForFunction(() => window.NewtabWidgets);
}
async function edit(page) {
    await page.mouse.move(page.viewportSize().width - 2, 64);
    await page.locator('#side-rail-tab').click();
    await page.getByRole('tab', {name:'個人化',exact:true}).click();
    await page.locator('#arrange-home').click();
}
async function geometry(page, id) {
    return page.locator('.widget[data-id="'+id+'"]').evaluate(el => ({
        left: parseFloat(el.style.left), top: parseFloat(el.style.top),
        width: parseFloat(el.style.width), height: parseFloat(el.style.height)
    }));
}
function exact(actual, expected, label) {
    for (const key of ['left','top','width','height']) assert(Math.abs(actual[key]-expected[key]) < .1,
        `${label}: ${key} ${actual[key]} vs ${expected[key]}`);
}
async function drag(page, id, target, hold = 0) {
    const box = await page.locator('.widget[data-id="'+id+'"]').boundingBox();
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
    await page.mouse.down();
    await page.mouse.move(target.x,target.y,{steps:12});
    if (hold) await delay(hold);
    const preview = await page.locator('#home-drop-preview').evaluate(el=>({
        left:parseFloat(el.style.left),top:parseFloat(el.style.top),
        width:parseFloat(el.style.width),height:parseFloat(el.style.height),state:el.dataset.state
    }));
    await page.mouse.up();
    assert.equal(preview.state,'place','target must be a genuine unoccupied drop');
    exact(await geometry(page,id),preview,'drop equals visible preview');
    return preview;
}
async function size(page,width,height) {
    await page.setViewportSize({width,height}); await delay(100);
}
(async()=>{
    const browser = await chromium.launch({channel:'msedge',headless:true});
    try {
        for (const [width,height] of matrix) {
            const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
            const page=await context.newPage(); page.setDefaultTimeout(8000);
            await ready(page);
            assert(await page.locator('#widget-canvas').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'fresh home has no artificial scrollbar');
            const stageLeft=(width-Math.min(14,Math.floor((width-48)/96))*96)/2;
            const stageTop=Math.max(0,(height-760)/2);
            const before={};
            for(const id of ['clock-1','search-1','app-images']) before[id]=await geometry(page,id);
            await edit(page);
            // Targets derive from visible free space, not from the snap implementation.
            for (const id of ['clock-1','search-1','app-images']) {
                const original=before[id];
                const target=id==='clock-1'?{x:width-stageLeft-original.width/2-4,y:original.top+original.height/2}:
                    id==='search-1'?{x:width/2,y:stageTop+72}:{x:stageLeft+48,y:stageTop+64};
                await drag(page,id,target);
                await drag(page,id,{x:original.left+original.width/2,y:original.top+original.height/2});
                exact(await geometry(page,id),original,'return to original '+id+' at '+width+'x'+height);
            }
            await page.locator('#arrange-done-bar').click();
            await page.reload(); await page.waitForFunction(()=>window.NewtabWidgets);
            for (const id of Object.keys(before)) exact(await geometry(page,id),before[id],'reload retains restored '+id);
            evidence.defaults.push({viewport:{width,height},rects:before});
            await page.screenshot({path:`.impeccable/review/round5-roundtrip-${width}-${height}.png`});
            console.log(`PASS ${width}x${height}: clock/search/app away→original, Done and reload`);
            await context.close();
        }
        const context=await browser.newContext({viewport:{width:2560,height:1440},reducedMotion:'reduce'});
        const page=await context.newPage();page.setDefaultTimeout(8000);await ready(page);await edit(page);
        await drag(page,'app-images',{x:2555,y:390});
        await drag(page,'app-gmail',{x:5,y:390});
        await page.locator('#arrange-done-bar').click();
        const initial={images:await geometry(page,'app-images'),gmail:await geometry(page,'app-gmail')};
        assert(initial.images.left+initial.images.width<=1952,'far right drop stays inside centered stage');
        assert(initial.gmail.left>=608,'far left drop stays inside centered stage');
        for(const [width,height] of [[1280,720],[1440,900],[1920,1080],[2560,1440]]) {
            await size(page,width,height);await page.reload();
            const images=await geometry(page,'app-images'),gmail=await geometry(page,'app-gmail');
            assert.equal(images.width,68);assert.equal(images.height,80);assert.equal(gmail.width,68);
            assert(images.left!==gmail.left||images.top!==gmail.top,'edge placements do not collapse onto one cell');
            evidence.responsive.push({viewport:{width,height},images,gmail});
        }
        exact(await geometry(page,'app-images'),initial.images,'right edge roundtrip');
        exact(await geometry(page,'app-gmail'),initial.gmail,'left edge roundtrip');
        console.log('PASS far edges→1280→1440→1920→2560 with reload: fixed icon dimensions and exact return');
        await size(page,1440,900);await edit(page);
        await drag(page,'app-images',{x:192,y:134});
        const desktop=await geometry(page,'app-images');
        for(const [width,height] of [[1920,1080],[1280,720],[390,844],[600,900],[601,900],[1440,900]]) {
            await size(page,width,height);
            const rect=await geometry(page,'app-images');assert(rect.width>=64&&rect.width<=68,'active resize never compresses icon');
            evidence.activeDraft.push({viewport:{width,height},rect});
        }
        exact(await geometry(page,'app-images'),desktop,'desktop draft returns exactly across600');
        await size(page,390,844);
        await drag(page,'app-images',{x:64,y:136});
        const phone=await geometry(page,'app-images');
        await size(page,1440,900);exact(await geometry(page,'app-images'),desktop,'phone editing preserves desktop draft');
        await page.locator('#arrange-done-bar').click();await page.reload();exact(await geometry(page,'app-images'),desktop,'desktop draft commits');
        await size(page,390,844);await page.reload();exact(await geometry(page,'app-images'),phone,'phone draft commits separately');
        await size(page,1440,900);await page.reload();exact(await geometry(page,'app-images'),desktop,'committed breakpoint roundtrip');
        console.log('PASS active draft through1920/1280/390/600/601/1440 and independent phone/desktop commits');
        await size(page,1280,540);await edit(page);
        await drag(page,'app-images',{x:64,y:500},300);assert((await geometry(page,'app-images')).top+80>540,'fixture genuinely extends below viewport');await page.locator('#arrange-done-bar').click();
        await page.mouse.move(300,380);await page.mouse.wheel(0,-3000);await delay(100);
        await page.mouse.move(300,380);await page.mouse.wheel(0,650);await delay(200);
        assert(await page.locator('#widget-canvas').evaluate(el=>el.scrollTop)>0,'short desktop home scrolls to low placement');
        const low=await page.locator('.widget[data-id=app-images]').boundingBox();assert(low.y+low.height<=540,'low placement is reachable after Done');
        console.log('PASS short desktop: actual wheel scroll reaches lower committed item');
        await context.close();
        fs.writeFileSync('.impeccable/review/round5-coordinates-after.json',JSON.stringify(evidence,null,2));
        console.log('LAYOUT ROUNDTRIP PASS');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
