// Test artifacts stay local and are excluded from the published repository.
require('node:fs').mkdirSync('.impeccable/review', { recursive: true });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173';
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/legacy-four-apps.json', 'utf8'));
const cases = [
    {physical:[1920,1080],dpr:1}, {physical:[2560,1440],dpr:1},
    {physical:[2560,1080],dpr:1}, {physical:[3440,1440],dpr:1},
    {physical:[3840,1600],dpr:1}, {physical:[3840,1080],dpr:1},
    {physical:[5120,1440],dpr:1},
    {physical:[3440,1440],dpr:1.25}, {physical:[3840,1600],dpr:1.5},
    {physical:[5120,1440],dpr:1.5}
].map(entry => ({...entry, viewport:{width:Math.round(entry.physical[0]/entry.dpr),height:Math.round(entry.physical[1]/entry.dpr)},
    name:entry.physical.join('x')+'-dpr'+entry.dpr})).filter(entry=>!process.env.WIDE_CASE||entry.name===process.env.WIDE_CASE);
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const closeEnough=(actual,expected,label)=>assert(Math.abs(actual-expected)<.11,`${label}: ${actual} vs ${expected}`);
async function menu(page, tab) {
    if(!await page.evaluate(()=>NewtabSideRail.isOpen())) {
        await page.locator('#side-rail-tab').focus();await page.keyboard.press('Enter');
    }
    await page.getByRole('tab',{name:tab,exact:true}).click();
}
async function add(page,type,app=false) {
    await menu(page,app?'應用':'組件');
    const selector=(app?'[data-place-kind=app]':'#component-list')+' [data-place-type='+type+'] .list-add';
    await page.locator(app?'[data-place-kind=app][data-place-type='+type+'] .list-add':selector).click();
}
async function rects(page) {
    return page.locator('.widget[data-active=true]').evaluateAll(es=>Object.fromEntries(es.map(el=>[el.dataset.id,{
        left:parseFloat(el.style.left),top:parseFloat(el.style.top),width:parseFloat(el.style.width),height:parseFloat(el.style.height)
    }])));
}
async function appParts(page,id) {
    return page.locator('.widget[data-id="'+id+'"]').evaluate(el=>{
        const rect=node=>{const b=node.getBoundingClientRect();return {left:b.left,top:b.top,width:b.width,height:b.height};};
        return {shell:rect(el),icon:rect(el.querySelector('.app-tile-icon')),label:rect(el.querySelector('.app-tile-label'))};
    });
}
function sameRect(actual,expected,label) {for(const key of ['left','top','width','height'])closeEnough(actual[key],expected[key],label+' '+key);}
async function drag(page,id,x,y) {
    const b=await page.locator('.widget[data-id="'+id+'"]').boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(620);await page.mouse.move(x,y,{steps:14});
    const preview=await page.locator('#home-drop-preview').evaluate(el=>({left:parseFloat(el.style.left),top:parseFloat(el.style.top),width:parseFloat(el.style.width),height:parseFloat(el.style.height),state:el.dataset.state}));
    assert.equal(preview.state,'place','genuinely valid target');
    await page.mouse.up();await page.mouse.move(60,60);await delay(60);
    sameRect((await rects(page))[id],preview,'preview equals committed draft');return preview;
}
function nonOverlapping(rectangles,label) {
    const entries=Object.entries(rectangles);
    for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
        const [aId,a]=entries[i],[bId,b]=entries[j];
        assert(!(a.left<b.left+b.width-.1&&a.left+a.width>b.left+.1&&a.top<b.top+b.height-.1&&a.top+a.height>b.top+.1),label+': overlap '+aId+' / '+bId);
    }
}
async function clickHitTest(page,selector) {
    assert(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),selector+' is fully visible and hit-testable');
}
(async()=>{
    const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];let currentPage;
    try {
        for(const entry of cases)for(const legacy of [false,true]) {
            const context=await browser.newContext({viewport:entry.viewport,deviceScaleFactor:entry.dpr,reducedMotion:'reduce',permissions:['geolocation'],geolocation:{latitude:25.033,longitude:121.5654}});
            // The geometry test uses a deterministic Taipei weather fixture;
            // network/service correctness is covered by weather-regressions.cjs.
            await context.route('https://api.open-meteo.com/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({current:{temperature_2m:24,weather_code:2,apparent_temperature:26,relative_humidity_2m:72,wind_speed_10m:2.5},daily:{temperature_2m_max:[28],temperature_2m_min:[20]}})}));
            if(legacy)await context.addInitScript(data=>{if(!sessionStorage.getItem('ultrawide-seed')){localStorage.setItem('nt_layout_v1',JSON.stringify(data));sessionStorage.setItem('ultrawide-seed','1');}},fixture);
            const page=await context.newPage();currentPage=page;page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
            await page.goto(base);await page.waitForFunction(()=>window.NewtabWidgets);await page.evaluate(()=>document.fonts.ready);
            const name=entry.name+'-'+(legacy?'legacy':'fresh');const before=await rects(page);
            assert.equal(await page.evaluate(()=>devicePixelRatio),entry.dpr);
            assert(await page.locator('#widget-canvas').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'idle home has no artificial vertical scroll');
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
            if(!legacy)await page.screenshot({path:'.impeccable/review/round7-functional-'+name+'-initial.png'});
            await add(page,'play',true);await add(page,'news',true);await add(page,'notes');await add(page,'weather');
            const added=await rects(page);
            for(const [id,rect]of Object.entries(before))sameRect(added[id],rect,'adding cards preserves existing '+id);
            for(const type of ['notes','weather']) {
                const id=Object.keys(added).find(id=>id.startsWith(type+'-'));
                assert.equal(added[id].width,280,type+' uses three cells at every monitor size');
                assert.equal(added[id].height,200,type+' uses two rows at every monitor size');
            }
            await page.getByRole('textbox',{name:'備註內容',exact:true}).fill('超寬版面 '+name+'\n保留筆記與自訂位置');
            await page.locator('.weather-temp').waitFor();
            assert.equal(await page.locator('.weather-temp').textContent(),'24°');
            await clickHitTest(page,'.weather-retry');await clickHitTest(page,'.weather-locate');
            assert(await page.locator('.weather-meta').evaluate(el=>{const b=el.getBoundingClientRect(),w=el.closest('.widget').getBoundingClientRect();return b.bottom<=w.bottom+1;}),'weather details fit200px height');
            await menu(page,'個人化');await page.locator('#arrange-home').click();
            if (legacy) {
                // The old row extends 34px below the current grid phase. Move
                // the optional weather card one cell right before extending
                // that row; otherwise its corner genuinely occupies the target.
                await page.locator('.widget[data-type=weather]').focus();
                await page.keyboard.press('ArrowRight');
            }
            const old=await appParts(page,'app-images'),last=await appParts(page,'app-maps');
            const stageLeft=(entry.viewport.width-1344)/2,stageTop=Math.max(0,(entry.viewport.height-760)/2);
            await drag(page,'app-play',stageLeft+720,old.shell.top+45);
            const row=await appParts(page,'app-play');
            for(const part of ['shell','icon','label'])closeEnough(row[part].top,old[part].top,'new/old row '+part);
            closeEnough(row.shell.left-last.shell.left,legacy?92:96,'row pitch survives ultrawide');
            // The character now occupies its own desktop cells, so optional
            // cards can use the old below-row target. Use the free row above
            // the clock to verify the same launcher column without overlap.
            await drag(page,'app-news',stageLeft+336,stageTop+64);
            const column=await appParts(page,'app-news');
            for(const part of ['shell','icon','label'])closeEnough(column[part].left,old[part].left,'new/old column '+part);
            await drag(page,'app-youtube',5,stageTop+272);
            await drag(page,'app-maps',entry.viewport.width-5,stageTop+272);
            const draft=await rects(page);
            closeEnough(draft['app-youtube'].left,16,'left-edge drop reaches the actual viewport edge');
            closeEnough(draft['app-maps'].left+68,entry.viewport.width-16,'right-edge drop reaches the actual viewport edge');
            await page.locator('#arrange-done-bar').click();await page.reload();await page.waitForFunction(()=>window.NewtabWidgets);
            const saved=await rects(page);for(const id of Object.keys(draft))sameRect(saved[id],draft[id],'Done/reload '+id);
            assert.equal(await page.getByRole('textbox',{name:'備註內容',exact:true}).inputValue(),'超寬版面 '+name+'\n保留筆記與自訂位置');
            nonOverlapping(saved,name+' saved');
            const storage=await page.evaluate(()=>localStorage.getItem('nt_layout_v1'));
            for(const viewport of [{width:1280,height:720},{width:390,height:844},entry.viewport]) {
                await page.setViewportSize(viewport);await delay(150);
                nonOverlapping(await rects(page),name+' resize '+viewport.width);
            }
            assert.equal(await page.evaluate(()=>localStorage.getItem('nt_layout_v1')),storage,'responsive projection never writes layout');
            const returned=await rects(page);for(const id of Object.keys(saved))sameRect(returned[id],saved[id],'wide/narrow return '+id);
            assert.deepEqual(errors,[],'no browser errors');await page.mouse.move(60,60);
            await page.screenshot({path:'.impeccable/review/round7-functional-'+name+'-complete.png'});
            results.push({name,physical:entry.physical,dpr:entry.dpr,cssViewport:entry.viewport,old:before,saved:returned,pageErrors:errors});
            fs.writeFileSync('.impeccable/review/round7-ultrawide-functional.json',JSON.stringify(results,null,2));
            console.log('PASS '+name+': CSS '+entry.viewport.width+'x'+entry.viewport.height+', Add/alignment/edge drops/weather+notes/Done/reload/wide-narrow return');
            await context.close();
        }
        console.log('ULTRAWIDE MATRIX PASS '+results.length+'/'+(cases.length*2));
    } catch(error) {if(currentPage&&!currentPage.isClosed())await currentPage.screenshot({path:'.impeccable/review/round7-ultrawide-failure.png'});throw error;}
    finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
