const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = new Proxy({canvas:{width:1280,height:720},measureText:t=>({width:String(t).length*7}),createLinearGradient:()=>({addColorStop(){}})}, {get:(o,k)=>k in o?o[k]:()=>{}});
const sound={playSound(){}};
const bindings=JSON.parse(fs.readFileSync(path.join(__dirname,'../keyboard.json'))).list;
const writes=[];
const env={console,window:{},document:{createElement:()=>({getContext:()=>ctx})},
    Common:{Platform:{ctx},ScreenResolution:{SCREEN_X:1280,SCREEN_Y:720}},Core:{Game:{current:{infiltratorName:'Test'}}},
    Manager:{Stack:{pop(){}},GL:{renderer:{clear(){}}}},Scene:{Base:class{constructor(){this.initialize?.()}}},
    Data:{Settings:{updateKeyboard:async(id,keys)=>writes.push({id,keys})},Keyboards:{getCommandsGraphics:()=>bindings.map(kb=>({kb})),
        checkActionMenu:k=>k==='Enter',checkCancelMenu:k=>k==='Escape',isKeyEqual:(a,b)=>a===b,menuControls:{Up:'Up',Down:'Down',Left:'Left',Right:'Right'}},
        Systems:{soundConfirmation:sound,soundCancel:sound,soundCursor:sound,soundImpossible:sound}},
    IP2Live:{Assets:{},BgFx:{create:()=>({})}}};
vm.createContext(env);
for(const file of ['confir-popup','keyboard-menu','settings','export-report']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../Plugins/IP2Live_Core/modules/screens',file+'.js'),'utf8'),env);
const kb=new env.window.IP2LiveKeyboardMenu();
for(const [width,height] of [[1280,720],[1920,1080],[800,600]]) {
    ctx.canvas.width=width;ctx.canvas.height=height;
    kb.drawHUD();const l=kb._layout();
    assert.equal(new Set(l.cells.slice(0,bindings.length).map(r=>r.x)).size,2);
    l.cells.forEach((r,i)=>{
        assert.equal(kb._getButtonAt((r.x+r.w/2)*l.scale,(r.y+r.h/2)*l.scale),i);
        assert.ok(r.y*l.scale>=0 && (r.y+r.h)*l.scale<=height,'every binding and footer fits');
    });
}
kb.selectedIndex=0;kb.onKeyPressedAndRepeat('Right');assert.equal(kb.selectedIndex,7);
kb.selectedIndex=12;kb._confirmSelection();kb.onKeyPressed('q');
assert.equal(writes.at(-1).id,13);assert.equal(bindings[12].sc[0][0],'q');
const settings=new env.window.IP2LiveSettingsMenu();settings.drawHUD();
const bar=settings.volumeHitTargets.find(r=>r.type==='sfx'&&r.action==='bar');
settings.onMouseUp(bar.x+bar.w/2,bar.y+bar.h/2);assert.equal(settings.sfxVolume,50);
const menu=new env.window.IP2LiveExportReportMenu();menu.drawHUD();
assert.equal(menu.formatOptions[menu.formatIndex],'EXCEL');assert.equal(menu.statusLine,'');
const scales=[];
const animationContext={globalAlpha:1,translate(){},scale(x,y){scales.push([x,y]);}};
const chrome=env.IP2Live.PopupChrome;
chrome.animate(animationContext,{x:20,y:30,w:400,h:200},0);
assert.equal(animationContext.globalAlpha,0,'popup begins transparent');
assert.ok(Math.abs(scales.at(-1)[0]-.88)<1e-8);
animationContext.globalAlpha=1;
chrome.animate(animationContext,{x:20,y:30,w:400,h:200},1);
assert.equal(animationContext.globalAlpha,1);assert.equal(scales.at(-1)[0],1,'popup settles at its real hitbox size');
let entrances=0;
const originalAnimate=chrome.animate;
chrome.animate=(...args)=>{entrances++;return originalAnimate(...args)};
for(const popup of [kb,settings,menu]) popup.drawHUD();
assert.equal(entrances,3,'Settings, key bindings and export use the same entrance');
let exported;env.IP2Live.GameManager={exportProgressReport:async options=>{exported=options;return {ok:true}}};
(async()=>{await menu._runExport();assert.equal(exported.format,'excel');assert.equal(exported.scopeDays,90);assert.match(exported.filenameBase,/IP2Live_Report_Test_/);console.log('Popup controls and export defaults passed.');})().catch(e=>{console.error(e);process.exitCode=1});
