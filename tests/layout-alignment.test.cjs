const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const window={innerWidth:1440,innerHeight:900};vm.runInNewContext(fs.readFileSync('js/layout-engine.js','utf8'),{window,console});const L=window.NewtabLayout;
const old=[0,1,2,3].map(i=>({id:'old-'+i,left:353.6+i*92,top:544,width:68,height:80}));
function rect(left,top,width=68,height=80){return{left,top,width,height};}
test('new app within the fine magnet radius continues an existing92px launcher rhythm',()=>{
 const out=L.homeAlignedRect(rect(723.6,546),'app',old,L.homeGrid());
 assert(Math.abs(out.rect.left-721.6)<.01);assert.equal(out.rect.top,544);
 assert(out.guides.some(g=>g.axis==='y'));
 assert.deepEqual(L.homeAlignedRect(out.rect,'app',old,L.homeGrid()).rect,out.rect,'preview and commit agree');
});
test('new app near an old column snaps its frame and continues the old vertical phase',()=>{
 const out=L.homeAlignedRect(rect(350,650),'app',old,L.homeGrid());
 assert(Math.abs(out.rect.left-353.6)<.01);assert.equal(out.rect.top,648);
 assert(out.guides.some(g=>g.axis==='x'));
});
test('different sized widgets can align their top with a legacy row without overlap',()=>{
 const out=L.homeAlignedRect(rect(52,540,280,200),'notes',old,L.homeGrid());
 assert.equal(out.rect.top,544);assert.equal(out.rect.left,52);assert(L.homeFits(out.rect,old));
});
test('alignment cannot place a new item over an existing item',()=>{
 const out=L.homeAlignedRect(rect(353.6,544),'app',old,L.homeGrid());
 assert.equal(L.homeFits(out.rect,old),false);
});
test('far-away pointer placement uses ordinary cells instead of distant alignments',()=>{
 const out=L.homeAlignedRect(rect(1100,100),'app',old,L.homeGrid());
 assert.deepEqual(out.rect,L.homeSnap(rect(1100,100),'app',L.homeGrid(),false));
});

test('legacy launcher rhythm wins when large clock and search edges are closer',()=>{
 const full=old.concat([{id:'clock',left:244,top:198,width:549,height:200},{id:'search',left:244,top:406,width:549,height:96}]);
 const out=L.homeAlignedRect(rect(723.6,549),'app',full,L.homeGrid());
 assert(Math.abs(out.rect.left-721.6)<.01);assert.equal(out.rect.top,544);
});

test('one fine step is not pulled back to the original card or a nearby launcher row',()=>{
 const grid=L.homeGrid(), original=rect(350,510);
 const moved={...original,left:original.left+grid.stepX,top:original.top+grid.stepY};
 const out=L.homeAlignedRect(moved,'app',[],grid,[original]);
 assert.deepEqual({...out.rect},moved);
 assert.deepEqual(L.homeAlignedRect(out.rect,'app',[],grid,[original]).rect,out.rect);
 const target=rect(734,544);
 assert.equal(L.homeAlignedRect(target,'app',old,grid).rect.left,734,'12px away does not attract to the old92px row');
});

test('an exact committed alignment cannot cascade into another nearby magnet',()=>{
 const grid=L.homeGrid();
 const others=[{id:'edge',...rect(319,500)},{id:'same',...rect(323,800,280,200)}];
 const first=L.homeAlignedRect(rect(316,100,280,200),'notes',others,grid);
 const second=L.homeAlignedRect(first.rect,'notes',others,grid);
 assert.deepEqual(second.rect,first.rect);
});
