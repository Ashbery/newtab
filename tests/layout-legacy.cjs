const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const fixture={v:4,rail:{open:false,width:300,tab:'personalize'},widgets:[
 {id:'app-images',type:'app',x:.225,y:.61,w:.07,h:.11,z:1,options:{appId:'images',size:'m',appearance:{opacity:.8}}},
 {id:'notes-owned',type:'notes',x:.02,y:.72,w:.15,h:.18,z:2,options:{content:'保留原本筆記\nKeep my saved content'}}
]};
const base=process.env.NEWTAB_TEST_URL||'http://127.0.0.1:4173';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.addInitScript(raw=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('nt_layout_v1',raw);sessionStorage.setItem('seeded','1');}},JSON.stringify(fixture));
  const page=await context.newPage();page.setDefaultTimeout(8000);await page.goto(base);
  const rect=()=>page.locator('.widget[data-id=app-images]').evaluate(el=>({left:parseFloat(el.style.left),top:parseFloat(el.style.top),width:parseFloat(el.style.width),height:parseFloat(el.style.height)}));
  const original=await rect();assert.deepEqual(original,{left:324,top:549,width:68,height:80});
  await page.mouse.move(1438,64);await page.locator('#side-rail-tab').click();await page.getByRole('tab',{name:'個人化',exact:true}).click();await page.locator('#arrange-home').click();
  async function dragTo(x,y){const r=await page.locator('.widget[data-id=app-images]').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(x,y,{steps:12});await page.mouse.up();}
  await dragTo(96,134);assert.notDeepEqual(await rect(),original);
  await dragTo(358,589);assert.deepEqual(await rect(),original,'legacy off-grid position is a valid exact return target');
  await page.locator('#arrange-done-bar').click();await page.reload();assert.deepEqual(await rect(),original);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('nt_layout_v1')));
  for(const widget of fixture.widgets){const current=stored.widgets.find(w=>w.id===widget.id);for(const key of ['x','y','w','h'])assert.equal(current[key],widget[key]);}
  assert.equal(stored.widgets[0].options.appearance.opacity,.8);
  assert.equal(await page.getByRole('textbox',{name:'備註內容',exact:true}).inputValue(),fixture.widgets[1].options.content);
  const snapshot=JSON.stringify(stored);
  for(const [width,height]of [[1920,1080],[2560,1440],[1280,720],[1440,900]]){await page.setViewportSize({width,height});await page.waitForTimeout(100);assert.equal((await rect()).width,68);}
  assert.deepEqual(await rect(),original);
  assert.equal(await page.evaluate(()=>localStorage.getItem('nt_layout_v1')),snapshot,'responsive projection does not save changes');
  console.log('LEGACY LAYOUT PASS: exact off-grid return/reload, canonical coordinates, appearance, notes content and resolution roundtrip preserved');
  await context.close();
  const oldProfile=JSON.parse(JSON.stringify(fixture));
  oldProfile.widgets[0].options.homeDesktop={x:350/1440,y:544/900,w:68/1440,h:80/900};
  oldProfile.widgets[1].options.homeDesktop={x:.02,y:.72,w:.15,h:.18};
  const oldContext=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await oldContext.addInitScript(raw=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('nt_layout_v1',raw);sessionStorage.setItem('seeded','1');}},JSON.stringify(oldProfile));
  const oldPage=await oldContext.newPage();await oldPage.goto(base);
  for(const [width,height] of [[1440,900],[1920,1080],[2560,1440],[1280,720],[1440,900]]) {
   await oldPage.setViewportSize({width,height});await oldPage.reload();
   const actual=await oldPage.locator('.widget[data-id=app-images]').evaluate(el=>({left:parseFloat(el.style.left),top:parseFloat(el.style.top),width:parseFloat(el.style.width),height:parseFloat(el.style.height)}));
   assert.equal(actual.width,68);assert.equal(actual.height,80);
   if(width===1440)assert.deepEqual(actual,{left:350,top:544,width:68,height:80});
   const saved=await oldPage.evaluate(()=>JSON.parse(localStorage.getItem('nt_layout_v1')));
   const sourceFields=widgets=>widgets.map(({id,x,y,w,h,options})=>({id,x,y,w,h,options}));
   assert.deepEqual(sourceFields(saved.widgets),sourceFields(oldProfile.widgets),'v1 projection preserves source geometry and options');
  }
  console.log('ROUND-FOUR PROFILE PASS: fixed pixels and exact source return across resolutions/reloads, no geometry rewrite');
  await oldContext.close();
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
