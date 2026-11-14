// Test artifacts stay local and are excluded from the published repository.
require('node:fs').mkdirSync('.impeccable/review', { recursive: true });
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173/';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/legacy-four-apps.json','utf8'));
async function geometry(page, id) {
  return page.locator('.widget[data-id="'+id+'"]').evaluate(e => {
    const rect = node => {const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {box:rect(e),icon:rect(e.querySelector('.app-tile-icon')),label:rect(e.querySelector('.app-tile-label'))};
  });
}
async function menu(page, name) {
  await page.locator('#side-rail-tab').focus();await page.keyboard.press('Enter');
  await page.getByRole('tab',{name,exact:true}).click();
}
async function add(page, name) {await menu(page,'應用');await page.getByRole('button',{name:'新增'+name,exact:true}).click();if(await page.evaluate(()=>NewtabSideRail.isOpen()))await page.locator('#side-rail-close').click();}
async function drag(page,id,x,y) {
  const b=await page.locator('.widget[data-id="'+id+'"]').boundingBox();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(620);await page.mouse.move(x,y,{steps:14});
  const preview=await page.locator('#home-drop-preview').evaluate(e=>({left:parseFloat(e.style.left),top:parseFloat(e.style.top),state:e.dataset.state}));
  await page.mouse.up();await page.mouse.move(1400,50);await delay(350);return preview;
}
function near(a,b,label){assert(Math.abs(a-b)<.1,label+': '+a+' vs '+b);}
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
  try {
    for(const legacy of [false,true]) {
      const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
      if(legacy)await context.addInitScript(data=>{if(!sessionStorage.getItem('fixture')){localStorage.setItem('nt_layout_v1',JSON.stringify(data));sessionStorage.setItem('fixture','1');}},fixture);
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);await page.goto(base);
      const original=await geometry(page,'app-images'),last=await geometry(page,'app-maps');
      await add(page,'Play');await menu(page,'個人化');await page.locator('#arrange-home').click();
      // Aim two pixels from the existing rhythm: the fine-grid magnet no
      // longer pulls a pointer12px away back into a legacy coarse cell.
      const rowPreview=await drag(page,'app-play',last.box.x+(legacy?92:96)+original.box.width/2+2,original.box.y+original.box.height/2+2);
      assert.equal(rowPreview.state,'place');const row=await geometry(page,'app-play');
      for(const part of ['box','icon','label'])near(row[part].y,original[part].y,'new/old same row '+part);
      near(row.box.x-last.box.x,legacy?92:96,'new item continues existing row spacing');
      near(row.box.y,rowPreview.top,'row preview equals drop');
      await add(page,'新聞');const colPreview=await drag(page,'app-news',original.box.x+original.box.width/2+2,original.box.y+104+original.box.height/2+2);
      assert.equal(colPreview.state,'place');const col=await geometry(page,'app-news');
      for(const part of ['box','icon','label'])near(col[part].x,original[part].x,'new/old same column '+part);
      near(col.box.x,colPreview.left,'column preview equals drop');
      await page.locator('.widget[data-id=app-news]').focus();
      await page.keyboard.press('ArrowDown');const moved=await geometry(page,'app-news');
      near(moved.box.x,col.box.x,'keyboard preserves legacy column');near(moved.box.y-col.box.y,13,'keyboard uses one fine step while preserving the row phase');
      await page.keyboard.press('ArrowUp');const returned=await geometry(page,'app-news');near(returned.box.y,col.box.y,'keyboard returns to aligned row');
      await page.locator('#arrange-done-bar').click();await page.reload();
      for(const id of ['app-images','app-play','app-news']) {
        const expected=id==='app-images'?original:id==='app-play'?row:col;
        const actual=await geometry(page,id);for(const part of ['box','icon','label'])for(const k of ['x','y','width','height'])near(actual[part][k],expected[part][k],'reload '+id+' '+part+' '+k);
      }
      const stored=await page.evaluate(()=>localStorage.getItem('nt_layout_v1'));
      for(const [width,height]of [[1920,1080],[2560,1440],[1280,720],[1440,900]]){await page.setViewportSize({width,height});await delay(200);}
      assert.equal(await page.evaluate(()=>localStorage.getItem('nt_layout_v1')),stored,'resize must not save');
      const finalRow=await geometry(page,'app-play'),finalCol=await geometry(page,'app-news');near(finalRow.box.y,row.box.y,'row resize return');near(finalCol.box.x,col.box.x,'column resize return');
      assert.deepEqual(errors,[]);const name=legacy?'legacy':'fresh';
      await page.screenshot({path:'.impeccable/review/alignment-'+name+'-aligned.png'});
      results.push({name,original,row,col,rowPreview,colPreview,pageErrors:errors});console.log('PASS '+name+': real Add/drag, same icon and label row/column, preview, Done/reload, resize return');await context.close();
    }
    {
      const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
      await context.addInitScript(data=>localStorage.setItem('nt_layout_v1',JSON.stringify(data)),fixture);
      const page=await context.newPage();await page.goto(base);const original=await geometry(page,'app-images'),last=await geometry(page,'app-maps');await menu(page,'應用');
      const icon=page.locator('[data-place-kind=app][data-place-type=drive] .list-icon');const start=await icon.boundingBox();
      await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await delay(650);
      await page.mouse.move(last.box.x+92+original.box.width/2+2,original.box.y+original.box.height/2+2,{steps:14});
      const preview=await page.locator('#home-drop-preview').evaluate(e=>({left:parseFloat(e.style.left),top:parseFloat(e.style.top),state:e.dataset.state}));
      assert.equal(preview.state,'place');near(preview.left,721.6,'direct catalog continues92px pitch');near(preview.top,544,'direct catalog aligns legacy row');
      await page.mouse.up();await page.mouse.move(1400,50);await delay(100);
      const placed=await geometry(page,'app-drive');near(placed.box.x,preview.left,'catalog commit retains aligned x');near(placed.box.y,preview.top,'catalog commit retains aligned y');
      await page.locator('#arrange-done-bar').click();assert.equal(await page.evaluate(()=>NewtabWidgets.isArranging()),false);
      console.log('PASS direct catalog: near-target preview and commit retain the existing row and spacing');await context.close();
    }
    fs.writeFileSync('.impeccable/review/layout-alignment-browser.json',JSON.stringify(results,null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
