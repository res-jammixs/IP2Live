/** Opt-in real IndexedDB crash/relaunch check. Uses a temporary headless Edge profile. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn,execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const browser=process.env.AUTOSAVE_TEST_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const engine=process.env.AUTOSAVE_TEST_ENGINE || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\RPG Paper Maker\\resources\\app\\dist\\Scripts\\Core\\Game.js';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const code=read('Plugins/IP2Live_Core/code.js');
const dbSource=code.slice(code.indexOf('IP2Live.DBManager ='),code.indexOf('\n};',code.indexOf('IP2Live.DBManager ='))+3);
const engineSource=fs.readFileSync(engine,'utf8');
const method=name=>{const start=engineSource.indexOf('    async '+name+'(');return engineSource.slice(start,engineSource.indexOf('\n    /**',start)).trim()};
const setup=`
window.IP2Live={}; ${dbSource}
window.Common={Platform:{registerSave:async()=>{throw Error('Unexpected manual-slot write')},loadSave:async()=>null}};
window.Core={};window.Scene={Base:class{},Map:class{constructor(id){this.id=id;this.loading=false;Scene.Map.current=this}update(){}drawHUD(){}}};
window.Manager={Stack:{requestPaintHUD:false}};window.Data={Systems:{}};window.Main={};
window.Chrono=class{constructor(time){this.time=time}};
window.Utils={valueOrDefault:(v,d)=>v===undefined?d:v,mapToArray:m=>Object.fromEntries(m),arrayToMap:o=>new Map(Object.entries(o||{})),readJSONList:(a,fn)=>a.map(fn)};
window.Game=Core.Game=class{
 constructor(slot=-1){this.slot=slot;this.currentMapID=3;this.infiltratorName='CRASH TEST';this.profileId='test';this.playTime=new Chrono(12345);
 this.teamHeroes=[];this.reserveHeroes=[];this.hiddenHeroes=[];this.items=[];this.chronometers=[];this.saves=0;
 this.currencies=new Map();this.currenciesEarned=new Map();this.currenciesUsed=new Map();this.variables=new Map([['questDoorOpen',true]]);
 this.hero={position:{x:8,y:0,z:12,set(x,y,z){Object.assign(this,{x,y,z})}},initializeProperties(){}};
 this.ip2liveGameStates={neuralLifeForce:{lifeForce:76}};this.heroStates=[1];this.heroProperties=[];this.heroStatesOptions={};this.startupStates={};this.startupProperties={};this.textures={};}
 static async getProjectVersion(){return 'autosave-integration'}getPathSave(){return 'Saves/'+this.slot+'.json'}getCompressedMapsData(){return {3:{door:'open'}}}async loadPositions(){}
};
window.Platform=Common.Platform;Object.assign(Game.prototype,{${method('save')},${method('load')}});
IP2Live.MapManager={stageFor:id=>({name:'Stage '+id}),goTo(id){Game.current.currentMapID=id;return new Scene.Map(id)}};
IP2Live.QuestManager={activeMapId:3,snapshotProgress:()=>({activeMapId:3,completedObjectives:{quest1:{done:true}}}),restoreProgress(s){this.restored=s}};
${read('Plugins/IP2Live_Core/modules/game_manager.js')}
${read('Plugins/IP2Live_Core/modules/story_autosave.js')}
`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let proc,ws,server;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ip2live-autosave-browser-'));
async function start(url){
    proc=spawn(browser,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+temp,url],{windowsHide:true,stdio:'ignore'});
    let port;
    for(let i=0;i<160;i++){
        try{port=Number(fs.readFileSync(path.join(temp,'DevToolsActivePort'),'utf8').split('\n')[0]);const response=await fetch('http://127.0.0.1:'+port+'/json/list');const pages=await response.json();
            const page=pages.find(p=>p.type==='page'&&p.url===url);if(page){ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});break;}}
        catch(_){}await sleep(100);
    }
    if(!ws || ws.readyState!==1)throw Error('Headless browser did not start');
    let seq=0;const calls=new Map();
    ws.onmessage=e=>{const msg=JSON.parse(e.data);if(calls.has(msg.id)){calls.get(msg.id)(msg);calls.delete(msg.id)}};
    return async expression=>{
        const id=++seq;const response=new Promise(resolve=>calls.set(id,resolve));
        ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
        let timer;
        const r=await Promise.race([response,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser evaluation timed out')),20000)})]).finally(()=>clearTimeout(timer));
        if(r.error||r.result.exceptionDetails)throw Error(JSON.stringify(r.error||r.result.exceptionDetails));return r.result.result.value;
    };
}
function crash(){if(ws){ws.close();ws=null}if(proc){execFileSync('taskkill',['/PID',String(proc.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});proc=null}}
(async()=>{
    server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Autosave durability test</title>')});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
    let run=await start(url);
    for(let i=0;i<50;i++){if(await run('location.origin === '+JSON.stringify(new URL(url).origin)+' && document.readyState === "complete"'))break;await sleep(100)}
    console.log(await run('JSON.stringify({url:location.href,origin:location.origin,ready:document.readyState})'));
    console.log('Headless browser connected.');
    // Create a v3 database and a profile before loading the production v4 upgrade.
    await run(`new Promise((resolve,reject)=>{const r=indexedDB.open('IP2Live_Database',3);r.onupgradeneeded=()=>{r.result.createObjectStore('profiles',{keyPath:'infiltratorName'})};r.onsuccess=()=>{const db=r.result,tx=db.transaction('profiles','readwrite');tx.objectStore('profiles').put({infiltratorName:'EXISTING',preserved:true});tx.oncomplete=()=>{db.close();resolve(true)}};r.onerror=()=>reject(r.error)})`);
    await run(setup);
    console.log('Production autosave service loaded.');
    assert.equal(await run(`(async()=>{await IP2Live.DBManager.initDB();return (await IP2Live.DBManager.getRecord('profiles','EXISTING')).preserved})()`),true);
    const summary=await run(`(async()=>{Core.Game.current=new Core.Game();IP2Live.StoryAutosave.beginStory(Core.Game.current);window.map=new Scene.Map(3);const pending=IP2Live.StoryAutosave.checkpoint('quest_completed');map.update();const result=await pending;if(!result.saved)throw Error('Checkpoint failed');return await IP2Live.StoryAutosave.getSummary()})()`);
    assert.equal(summary.profileName,'CRASH TEST');
    console.log('Quest checkpoint committed.');
    // Explicitly abort a real IDB overwrite; the committed snapshot must remain.
    assert.equal(await run(`(async()=>{const db=await IP2Live.DBManager.initDB();await new Promise(resolve=>{const tx=db.transaction('storyAutosaves','readwrite');tx.objectStore('storyAutosaves').put({id:'current',version:99});tx.onabort=resolve;tx.abort()});return (await IP2Live.StoryAutosave.getSummary()).storyRunId})()`),summary.storyRunId);
    crash();console.log('Browser terminated; reopening the same profile.');await sleep(600);run=await start(url);
    for(let i=0;i<50;i++){if(await run('location.origin === '+JSON.stringify(new URL(url).origin)+' && document.readyState === "complete"'))break;await sleep(100)}
    await run(setup);
    assert.equal((await run('IP2Live.StoryAutosave.getSummary()')).storyRunId,summary.storyRunId);
    const restored=await run(`(async()=>{IP2Live.MenuTransition={replace(factory,options){window.recovery={factory,options};return true}};await IP2Live.StoryAutosave.resume();const map=await recovery.factory();recovery.options.onReady(map);return {door:Core.Game.current.variables.get('questDoorOpen'),life:Core.Game.current.ip2liveGameStates.neuralLifeForce.lifeForce,slot:Core.Game.current.slot,map:map.id,manual:IP2Live.GameManager.getActiveSaveSlot(Core.Game.current),quest:IP2Live.QuestManager.restored.completedObjectives.quest1.done}})()`);
    assert.deepEqual(restored,{door:true,life:76,slot:-1,map:3,manual:null,quest:true});
    console.log('PASS: native engine save/load, v3 upgrade, aborted write, hard browser termination and IndexedDB recovery.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
    try{crash()}catch(_){}if(server)server.close();await sleep(300);
    const resolved=path.resolve(temp),base=path.resolve(os.tmpdir())+path.sep;
    if(resolved.startsWith(base)&&path.basename(resolved).startsWith('ip2live-autosave-browser-'))fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
});
