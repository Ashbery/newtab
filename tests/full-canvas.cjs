// Exercise real screen edges, not the centered composition's old boundaries.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173';
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/legacy-four-apps.json', 'utf8'));
const gesturesOnly = process.env.NEWTAB_CANVAS_ONLY === 'gestures';
const cases = [[1920,1080,1],[3440,1440,1],[3440,1440,1.25],[5120,1440,1.5]];
const geometry = (page, id) => page.locator('.widget[data-id="'+id+'"]').evaluate(el =>
    Object.fromEntries(['left','top','width','height'].map(key => [key,parseFloat(el.style[key])])));
const exact = (actual, expected, label) => Object.keys(expected).forEach(key =>
    assert(Math.abs(actual[key]-expected[key])<.1,`${label} ${key}: ${actual[key]} / ${expected[key]}`));
async function drag(page,id,x,y) {
    const box = await page.locator('.widget[data-id="'+id+'"]').boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down();
    await page.waitForTimeout(620);
    assert.equal(await page.locator('.widget.is-editor-selected').getAttribute('data-id'),id,'hold selects the frame');
    await page.mouse.move(x,y,{steps:8});
    const preview=await page.locator('#home-drop-preview').evaluate(el=>({
        state:el.dataset.state,rect:Object.fromEntries(['left','top','width','height'].map(key=>[key,parseFloat(el.style[key])]))
    }));
    assert.equal(preview.state,'place','corner remains a valid drop');
    await page.mouse.up();
    exact(await geometry(page,id),preview.rect,'visible preview equals actual position');
    return preview.rect;
}
(async()=>{
    const browser=await chromium.launch({channel:'msedge',headless:true});
    const results=[];
    try {
        for(const reducedMotion of ['no-preference','reduce'])for(const arranging of [false,true]) {
            const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion});
            const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>window.NewtabWidgets);
            if(arranging) {
                await page.locator('#side-rail-tab').focus();await page.keyboard.press('Enter');
                await page.getByRole('tab',{name:'個人化',exact:true}).click();await page.locator('#arrange-home').click();
            }
            const widget=page.locator('.widget[data-id="clock-1"]');
            const box=await widget.boundingBox();await page.mouse.move(box.x+20,box.y+20);
            await page.waitForTimeout(250);
            const appearance=()=>widget.evaluate(el=>({
                shadow:getComputedStyle(el).boxShadow,selected:el.classList.contains('is-editor-selected'),
                handles:[...el.querySelectorAll('.widget-handle')].filter(handle=>
                    handle.getClientRects().length&&getComputedStyle(handle).visibility!=='hidden'&&+getComputedStyle(handle).opacity>0).length,
                ring:[...el.querySelectorAll('.widget-select-ring')].some(ring=>
                    ring.getClientRects().length&&+getComputedStyle(ring).opacity>0)
            }));
            const before=await appearance();assert.equal(before.selected,false);assert.equal(before.handles,0);assert.equal(before.ring,false);
            await page.mouse.down();await page.waitForTimeout(100);
            assert.deepEqual(await appearance(),before,'100ms press has no selection, handles, ring or extra shadow');
            await page.mouse.up();await page.waitForTimeout(100);
            assert.deepEqual(await appearance(),before,'quick click does not leave editing chrome');
            assert.equal(await page.evaluate(()=>NewtabWidgets.isArranging()),arranging,'quick click preserves current mode');
            await page.mouse.down();await page.waitForTimeout(580);
            assert.equal((await appearance()).selected,true,'560ms hold threshold selects the widget');
            await page.waitForTimeout(160);
            const held=await appearance();assert(held.handles>0&&held.ring,'confirmed hold paints its frame and resize handles');
            await page.mouse.up();
            console.log(`PASS pointer frame ${arranging?'arranging':'idle'} ${reducedMotion}: quick click invisible, hold visible`);
            await context.close();
        }
        for(const [physicalWidth,physicalHeight,dpr] of gesturesOnly?[]:cases)for(const legacy of [false,true]) {
            const viewport={width:Math.round(physicalWidth/dpr),height:Math.round(physicalHeight/dpr)};
            const context=await browser.newContext({viewport,deviceScaleFactor:dpr,reducedMotion:'reduce'});
            if(legacy)await context.addInitScript(data=>{if(!sessionStorage.getItem('corner-seed')){
                localStorage.setItem('nt_layout_v1',JSON.stringify(data));sessionStorage.setItem('corner-seed','1');
            }},fixture);
            const page=await context.newPage();page.setDefaultTimeout(8000);
            const errors=[];page.on('pageerror',error=>errors.push(error.message));
            await page.goto(base);await page.waitForFunction(()=>window.NewtabWidgets);
            await page.evaluate(()=>NewtabWidgets.addFromCatalog('notes'));
            const id=await page.locator('.widget[data-type=notes]').getAttribute('data-id');
            await page.locator('#side-rail-tab').focus();await page.keyboard.press('Enter');
            await page.getByRole('tab',{name:'個人化',exact:true}).click();
            await page.locator('#arrange-home').click();
            await page.locator('.widget[data-id="'+id+'"]').click();
            assert.equal(await page.locator('.widget.is-editor-selected').count(),0,'quick click never selects');
            const before=await geometry(page,id);
            const positions=[];
            for(const [x,y] of [[5,5],[viewport.width-5,5],[5,viewport.height-5],[viewport.width-5,viewport.height-5]]) {
                const actual=await drag(page,id,x,y);
                exact(actual,{left:x===5?16:viewport.width-before.width-16,
                    top:y===5?16:viewport.height-before.height-16,width:before.width,height:before.height},'actual screen corner');
                assert.equal(await page.locator('#widget-canvas').evaluate(el=>el.scrollTop),0,'quick corner drop does not auto-scroll');
                positions.push(actual);
            }
            await page.locator('#arrange-done-bar').click();await page.reload();
            await page.waitForFunction(()=>window.NewtabWidgets);
            const saved=await geometry(page,id);exact(saved,positions.at(-1),'reload');
            assert(await page.locator('#widget-canvas').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'edge position creates no idle scrollbar');
            const storage=await page.evaluate(()=>localStorage.getItem('nt_layout_v1'));
            for(const size of [{width:1280,height:720},{width:390,height:844},viewport]) {
                await page.setViewportSize(size);await page.waitForTimeout(140);
            }
            exact(await geometry(page,id),saved,'resolution roundtrip');
            assert.equal(await page.evaluate(()=>localStorage.getItem('nt_layout_v1')),storage,'resize does not rewrite profile');
            assert.deepEqual(errors,[]);
            results.push({physicalWidth,physicalHeight,dpr,viewport,legacy,positions});
            console.log(`PASS corners ${physicalWidth}x${physicalHeight} @ ${dpr} ${legacy?'legacy':'fresh'}`);
            await context.close();
        }
        // A persisted v2 profile keeps its exact old 14-column projection;
        // only the deliberately moved item graduates to full-canvas storage.
        if(!gesturesOnly) {
            const context=await browser.newContext({viewport:{width:3440,height:1440},reducedMotion:'reduce'});
            const savedLayout={v:4,companionMigrated:true,rail:{open:false,width:300,tab:'personalize'},widgets:
                ['images','gmail'].map((appId,i)=>({id:'app-'+appId,type:'app',x:.2+i*.1,y:.4,w:.07,h:.11,z:i+1,pinned:false,
                    options:{appId,size:'m',homeDesktop:{v:2,columns:14,col:8.375+i,row:3.25,width:68,height:80,spanX:null,spanY:null}}}))};
            await context.addInitScript(layout=>{if(!sessionStorage.getItem('v2-seed')){
                localStorage.setItem('nt_layout_v1',JSON.stringify(layout));sessionStorage.setItem('v2-seed','1');
            }},savedLayout);
            const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>window.NewtabWidgets);
            const expected={left:(3440-1344)/2+8.375*96+14,top:(1440-760)/2+24+3.25*104,width:68,height:80};
            exact(await geometry(page,'app-images'),expected,'old v2 exact original projection');
            await page.locator('#side-rail-tab').focus();await page.keyboard.press('Enter');
            await page.getByRole('tab',{name:'個人化',exact:true}).click();await page.locator('#arrange-home').click();
            exact(await geometry(page,'app-images'),expected,'entering editor does not migrate v2');
            await drag(page,'app-gmail',3435,5);await page.locator('#arrange-done-bar').click();await page.reload();
            await page.waitForFunction(()=>window.NewtabWidgets);
            exact(await geometry(page,'app-images'),expected,'moving another widget preserves v2');
            const profiles=await page.evaluate(()=>Object.fromEntries(NewtabWidgets.getLayout().widgets.map(w=>[w.id,w.options.homeDesktop])));
            assert.deepEqual(profiles['app-images'],savedLayout.widgets[0].options.homeDesktop,'old profile remains byte-equivalent');
            assert.equal(profiles['app-gmail'].v,3);assert.equal(profiles['app-gmail'].edge,'right');
            assert.equal(profiles['app-gmail'].edgeY,'top');
            console.log('PASS actual v2 profile: unchanged until moved, exact custom fractional slot, isolated migration');
            await context.close();
        }
        if(!gesturesOnly) {
            fs.mkdirSync('.impeccable/review',{recursive:true});
            fs.writeFileSync('.impeccable/review/full-canvas-corners.json',JSON.stringify(results,null,2));
        }
        console.log(gesturesOnly?'FULL CANVAS POINTER FRAME PASS 4':'FULL CANVAS CORNERS PASS '+results.length);
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
