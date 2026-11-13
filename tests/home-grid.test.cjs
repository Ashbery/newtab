const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const window = { innerWidth: 1440, innerHeight: 900 };
vm.runInNewContext(fs.readFileSync('js/layout-engine.js', 'utf8'), {window,console});
const L = window.NewtabLayout;

test('phone grid has four equal cells and desktop uses predictable 96 by 104 pitch', () => {
    for (const width of [320,390,600]) {
        const grid=L.homeGrid(width,844);
        assert.equal(grid.columns,4); assert.equal(grid.pitchX*4,width-40);
        const occupied=[];
        for(let i=0;i<4;i++) {
            const rect=L.homeNextFree({left:0,top:0,width:68,height:80},'app',occupied,grid);
            assert.equal(rect.top,96);
            assert(rect.left>=16 && rect.left+rect.width<=width-16);
            occupied.push({...rect,id:String(i)});
        }
        assert.equal(new Set(occupied.map(r=>r.left)).size,4);
    }
    assert.equal(L.homeGrid(1440,900).pitchX,96);
    assert.equal(L.homeGrid(1440,900).pitchY,104);
});

test('the default character balances the desktop group and uses a separate lower row on narrow screens', () => {
    for (const width of [320, 390, 600, 601, 800, 1000, 1099, 1100, 1280, 1440, 1920, 3440, 5120]) {
        const grid = L.homeGrid(width, 900);
        const character = L.homeDefaultRect({ type: 'companion', options: { homeSeed: 'companion' } }, grid);
        const existing = L.defaultLayout().widgets.map(widget => L.homeDefaultRect(widget, grid));
        assert(L.homeFits(character, existing), 'character must not cover defaults at ' + width);
        assert(character.left >= 16 && character.left + character.width <= width - 16);
        if (width >= 1100) {
            const clock = existing[0];
            assert.equal((clock.left + character.left + character.width) / 2, width / 2, 'character and clock share a centered composition');
        } else {
            assert(character.top >= Math.max(...existing.map(r => r.top + r.height)) + 16, 'narrow character follows the shortcuts');
        }
    }
});

test('the fresh phone character fits a 390px first view without resizing saved portraits', () => {
    const grid = L.homeGrid(390, 844);
    const fresh = L.homeDefaultRect({ type: 'companion', options: { homeSeed: 'companion' } }, grid);
    assert.equal(fresh.width, 160);
    assert.equal(fresh.height, 208);
    assert.equal(fresh.top + fresh.height, 824, 'portrait has a 20px lower margin');
    const saved = L.homePlacement({ left: 50, top: 616, width: 280, height: 360 }, 'companion', grid);
    const restored = L.homePlacementRect(saved, 'companion', grid);
    assert.equal(restored.width, 280, 'existing custom width remains intact');
    assert.equal(restored.height, 360, 'existing custom height remains intact');
});
test('widget resize uses meaningful spans and snapping is idempotent',()=>{
    for(const width of [320,390,1440]) {
        const grid=L.homeGrid(width,900);
        const rect=L.homeSnap({left:37,top:151,width:121,height:57},'notes',grid,true);
        assert.equal((rect.width+8)/grid.pitchX,grid.narrow?4:2);
        assert.equal((rect.height+8)/104,2);
        assert.deepEqual(L.homeSnap(rect,'notes',grid,true),rect);
    }
});
test('an occupied target is rejected, swapping can explicitly ignore its target',()=>{
    const rect={left:24,top:24,width:68,height:80};
    assert.equal(L.homeFits(rect,[{...rect,id:'other'}]),false);
    assert.equal(L.homeFits(rect,[{...rect,id:'other'}],['other']),true);
    const next=L.homeNextFree(rect,'app',[{...rect,id:'other'}],L.homeGrid(1440,900));
    assert.equal(next.left,158); assert.equal(next.top,94);
});
test('grid exhaustion returns no position instead of stacking on existing widgets',()=>{
    const grid=L.homeGrid(240,320);
    // Explicit desktop-size bounds make a single row with two occupied cells.
    grid.narrow=false; grid.columns=2; grid.pitchX=96; grid.left=24; grid.top=24;
    const occupied=[{left:0,top:0,width:240,height:320,id:'full'}];
    assert.equal(L.homeNextFree({left:0,top:0,width:68,height:80},'app',occupied,grid),null);
});

// Source viewport and layout changes must never resize launcher pixels.
test('cell placement projects through wide and narrow desktop views without dimension drift',()=>{
    const original={left:350,top:510,width:68,height:80};
    const model=L.homePlacement(original,'app',L.homeGrid(1440,900));
    for(const [width,height] of [[1920,1080],[2560,1440],[1280,720],[1440,900]]) {
        const rect=L.homePlacementRect(model,'app',L.homeGrid(width,height));
        assert.equal(rect.width,68);assert.equal(rect.height,80);
        if(width===1440) assert.deepEqual({...rect},original);
    }
});
test('all fresh default slots are exact drop slots, including tall and short views',()=>{
    for(const [width,height] of [[1440,900],[1920,1080],[2560,1440],[1280,720],[390,844],[320,640]]) {
        window.innerWidth=width;window.innerHeight=height;
        const layout=L.defaultLayout(),grid=L.homeGrid();
        for(const widget of layout.widgets) {
            const rect=L.homeDefaultRect(widget,grid);
            assert.deepEqual(L.homeSnap(rect,widget.type,grid,false),rect);
        }
    }
});
test('wide-screen drops reach both actual viewport edges, with stable saved edge positions',()=>{
    for(const [width,height] of [[1920,1080],[2560,1080],[3440,1440],[5120,1440],[2752,1152],[3413,960]]) {
        const grid=L.homeGrid(width,height);
        assert(grid.columns>14);
        for(const type of ['app','notes'])for(const edge of ['left','right']) {
            const size=type==='app'?68:280;
            const rect=L.homeSnap({left:edge==='left'?-500:width,top:400,width:size,height:200},type,grid,false);
            assert.equal(edge==='left'?rect.left:width-rect.left-rect.width,16,'full viewport edge '+width);
            const saved=L.homePlacement(rect,type,grid);
            assert.equal(saved.v,3);
            assert.equal(saved.edge,edge);
            for(const otherWidth of [1280,width]) {
                const moved=L.homePlacementRect(saved,type,L.homeGrid(otherWidth,height));
                assert.equal(edge==='left'?moved.left:otherWidth-moved.left-moved.width,16);
                assert.equal(moved.width,size);
            }
            assert.deepEqual({...L.homePlacementRect(saved,type,grid)},{...rect});
        }
    }
});

test('desktop corners use the full viewport while intentional below-view placements remain scrollable',()=>{
    for(const [width,height] of [[1920,1080],[3440,1440],[5120,1440]]) {
        const grid=L.homeGrid(width,height);
        for(const corner of ['top','bottom']) {
            const rect=L.homeSnap({left:corner==='top'?-500:width,top:corner==='top'?-500:height-20,width:280,height:200},'notes',grid,false);
            assert.equal(corner==='top'?rect.top:height-rect.top-rect.height,16);
            const saved=L.homePlacement(rect,'notes',grid);
            assert.equal(saved.edgeY,corner);
            assert.deepEqual({...L.homePlacementRect(saved,'notes',grid)},{...rect});
        }
        const low=L.homeSnap({left:16,top:height+210,width:280,height:200},'notes',grid,false);
        assert(low.top>height,'below-view drag can still extend content');
    }
});

test('old v2 profiles retain their capped-grid projection until deliberately moved',()=>{
    const old={v:2,columns:14,col:8.375,row:3.25,width:68,height:80,spanX:null,spanY:null};
    for(const width of [1280,1440,1920,2560,3440,5120,3413]) {
        const grid=L.homeGrid(width,1080),oldCols=Math.min(14,Math.floor((width-48)/96));
        const oldLeft=(width-oldCols*96)/2;
        const oldCol=Math.max(0,Math.min(oldCols-1,old.col+Math.floor((oldCols-old.columns)/2)));
        const rect=L.homePlacementRect(old,'app',grid);
        assert.equal(rect.left,oldLeft+oldCol*96+14,'legacy geometry '+width);
        assert.equal(rect.width,68);assert.equal(rect.height,80);
    }
});

test('new cards use fixed semantic spans on ultrawide monitors while saved custom dimensions survive',()=>{
    const custom={left:350,top:302,width:457,height:263};
    const model=L.homePlacement(custom,'notes',L.homeGrid(1440,900));
    for(const [width,height] of [[1920,1080],[2560,1440],[2560,1080],[3440,1440],[3840,1600],[3840,1080],[5120,1440],[2752,1152],[2560,1067],[3413,960]]) {
        const grid=L.homeGrid(width,height);
        for(const type of ['notes','weather','todo','countdown']) {
            assert.deepEqual({...L.homeNewFootprint(type,{},grid)},{width:280,height:200});
        }
        assert.deepEqual({...L.homeNewFootprint('app',{},grid)},{width:68,height:80});
        const saved=L.homePlacementRect(model,'notes',grid);
        assert.equal(saved.width,457);assert.equal(saved.height,263);
    }
    assert.deepEqual({...L.homePlacementRect(model,'notes',L.homeGrid(1440,900))},custom);
    for(const width of [320,390]) {
        assert.deepEqual({...L.homeNewFootprint('notes',{},L.homeGrid(width,844))},{width:width-48,height:200});
    }
});
test('only the exact previous default receives a responsive seed; custom geometry and content survive',()=>{
    const previous={v:4,rail:{open:false},widgets:[
        {id:'clock-1',type:'clock',x:.365-280/1440,y:.24,w:560/1440,h:.235,options:{hour12:true}},
        {id:'search-1',type:'search',x:.365-280/1440,y:.505,w:560/1440,h:.09,options:{}},
        ...['images','gmail','youtube','maps'].map((appId,i)=>({id:'app-'+appId,type:'app',x:.365+((i-1.5)*92-34)/1440,y:.64,w:.07,h:.11,options:{appId}})),
        {id:'notes-old',type:'notes',x:.02,y:.72,w:.15,h:.18,options:{content:'原本的筆記'}}
    ]};
    window.innerWidth=1440;window.innerHeight=900;
    let raw=JSON.stringify(previous);
    window.localStorage={getItem:()=>raw,setItem:()=>assert.fail('read projection must not write storage')};
    const loaded=L.loadLayout();
    assert.equal(loaded.widgets[0].options.homeSeed,'clock');
    assert.equal(loaded.widgets[0].options.hour12,true);
    assert.equal(loaded.widgets.at(-1).options.content,'原本的筆記');
    assert.equal(JSON.stringify(loaded.widgets.map(({x,y,w,h})=>({x,y,w,h}))),JSON.stringify(JSON.parse(raw).widgets.map(({x,y,w,h})=>({x,y,w,h}))));
    previous.widgets[2].x+=.001;raw=JSON.stringify(previous);
    assert(L.loadLayout().widgets.every(w=>w.options.homeSeed===undefined),'one real placement change prevents default inference');
});
