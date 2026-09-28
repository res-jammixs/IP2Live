const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const settle = async () => { for(let i=0;i<60;i++) await Promise.resolve(); };
const clone = x => JSON.parse(JSON.stringify(x));

function harness(disk = {record:null}) {
    const transactions=[], manualWrites=[], prompts=[];
    const db={transaction() {
        const tx={error:null, aborted:false, objectStore:()=>({put(record){tx.record=clone(record)}}),
            abort(){tx.aborted=true;tx.onabort?.()},
            commit(){if(!tx.aborted){disk.record=clone(tx.record);tx.oncomplete()}},
            fail(){tx.error=new Error('disk full');tx.abort()}};
        transactions.push(tx);return tx;
    }};
    const platform={registerSave:async(slot,p,json)=>manualWrites.push({slot,json}),loadSave:async()=>null};
    class Game {
        constructor(slot=-1){this.slot=slot;this.saves=0;this.currentMapID=3;this.infiltratorName='NOVA';this.profileId='profile';
            this.playTime={time:12345};this.variables={doorOpen:true};this.items=[{id:2,count:1}];
            this.hero={position:{x:8,y:0,z:12},initializeProperties(){}};this.ip2liveGameStates={neuralLifeForce:{lifeForce:76}};}
        async save(slot){this.slot=slot;this.saves++;await platform.registerSave(slot,'Saves/'+slot+'.json',{
            currentMapId:this.currentMapID,heroPosition:Object.values(this.hero.position),t:this.playTime.time,
            vars:this.variables,itm:this.items,saves:this.saves,mapsData:{3:{door:'open'}}});}
        async load(){const j=await platform.loadSave(this.slot);if(!j){this.isEmpty=true;return;}
            this.currentMapID=j.currentMapId;this.variables=j.vars;this.items=j.itm;this.playTime.time=j.t;this.isEmpty=false;}
        async loadPositions(){}
    }
    class MapScene {constructor(id){this.id=id;this.loading=false;MapScene.current=this;}update(){}drawHUD(){}}
    const qm={activeMapId:3,completedObjectives:{quest1:{first:true}},snapshotProgress(){return clone({activeMapId:this.activeMapId,completedObjectives:this.completedObjectives})},
        restoreProgress(s){this.activeMapId=s.activeMapId;this.completedObjectives=clone(s.completedObjectives)}};
    const sound={playSound(){}};
    const env={console:{log(){},warn(){},error(){}},setTimeout,clearTimeout,window:{},Main:{},
        Common:{Platform:platform},Core:{Game},Scene:{Map:MapScene,Base:class{}},Data:{Systems:{soundCancel:sound,soundConfirmation:sound},Keyboards:{checkCancelMenu:k=>k==='Escape',checkActionMenu:()=>false}},
        Manager:{Stack:{top:{},requestPaintHUD:false,pop(){}}},IP2Live:{DBManager:{initDB:async()=>db,getRecord:async()=>clone(disk.record)},
            QuestManager:qm,MapManager:{stageFor:id=>({name:'Stage '+id}),goTo(id){Game.current.currentMapID=id;return new MapScene(id)}},
            confirPopup:{show:o=>prompts.push(o)}}};
    vm.createContext(env);vm.runInContext(read('modules/game_manager.js'),env);
    const gm=env.IP2Live.GameManager;gm._ensureQuestMinimap=()=>{};
    vm.runInContext(read('modules/story_autosave.js'),env);
    const service=env.IP2Live.StoryAutosave;
    const start=(name='NOVA')=>{const game=Game.current=new Game();game.infiltratorName=name;service.beginStory(game);const map=new MapScene(3);qm.activeMapId=3;return {game,map}};
    const flush=async(map)=>{service.tick(map);await settle();const tx=transactions.at(-1);assert.ok(tx?.record);tx.commit();await settle();};
    return {env,service,gm,qm,disk,transactions,manualWrites,prompts,start,flush,Game,MapScene};
}

(async()=>{
    const h=harness(), {service:s}=h, {game,map}=h.start();
    const originalSlot=game.slot;
    s.tick(map);await settle();
    assert.equal(h.disk.record,null,'request success is not a durable commit');
    assert.equal(s._status.text,'Saving story...');
    h.transactions.at(-1).commit();await settle();
    assert.equal(game.slot,originalSlot);assert.equal(game.saves,0);assert.equal(h.manualWrites.length,0);
    assert.equal(h.gm.getActiveSaveSlot(game),null);
    assert.equal(h.disk.record.coreSave.vars.doorOpen,true);
    assert.equal(h.disk.record.snapshot.gameStates.neuralLifeForce.lifeForce,76);
    assert.equal(s._status.text,'Story autosaved');

    const before=clone(h.disk.record);
    h.qm.completedObjectives.quest1.second=true;
    h.gm.handleQuestObjectiveCompleted({questCompleted:false});assert.equal(s._pending,null);
    h.gm.handleQuestObjectiveCompleted({questCompleted:true});s.tick(map);await settle();
    h.transactions.at(-1).fail();await settle();assert.deepEqual(h.disk.record,before);
    assert.ok(s._status.failed);
    const save=s.checkpoint();s.tick(map);await settle();
    const next=s.checkpoint('next_quest');h.transactions.at(-1).commit();await settle();
    await h.flush(map);assert.equal((await save).saved,true);assert.equal((await next).saved,true);
    assert.equal(h.disk.record.snapshot.questState.completedObjectives.quest1.second,true);

    h.env.IP2Live.PracticeMode={active:true};assert.equal((await s.checkpoint()).saved,false);
    h.env.IP2Live.PracticeMode.active=false;h.env.IP2Live.TutorialReplay={session:{}};
    assert.equal((await s.checkpoint()).saved,false);h.env.IP2Live.TutorialReplay.session=null;
    assert.equal((await s.checkpoint('quest',{developerTest:true})).saved,false);

    const priorTransactions=h.transactions.length;
    s.checkpoint('exit_quest');const nextMap=h.env.IP2Live.MapManager.goTo(4);
    s.tick(map);await settle();assert.equal(h.transactions.length,priorTransactions);
    nextMap.loading=true;s.tick(nextMap);await settle();assert.equal(h.transactions.length,priorTransactions);
    nextMap.loading=false;h.qm.activeMapId=4;await h.flush(nextMap);
    assert.equal(h.disk.record.snapshot.mapId,4,'map-changing quest saves its destination');

    let release;
    h.gm.enqueueSaveTask(()=>new Promise(resolve=>release=resolve));await settle();
    const stale=s.checkpoint();s.tick(nextMap);await settle();
    const old=clone(h.disk.record), newRun=h.start('NOVA');
    release();await settle();assert.equal((await stale).saved,false);assert.deepEqual(h.disk.record,old);
    await h.flush(newRun.map);assert.notEqual(h.disk.record.storyRunId,old.storyRunId,'same name starts a distinct story');

    // An in-flight transaction is aborted when a different story takes ownership.
    s.checkpoint();s.tick(newRun.map);await settle();const abandoned=h.transactions.at(-1);
    const safe=clone(h.disk.record);h.start('OTHER');assert.ok(abandoned.aborted);abandoned.commit();await settle();
    assert.deepEqual(h.disk.record,safe);

    let starts=0,resumes=0;const resume=s.resume;s.resume=()=>{resumes++};
    await s.confirmNewStory(()=>starts++);let prompt=h.prompts.at(-1);
    prompt.onDismiss();assert.equal(starts,0);assert.equal(resumes,0);
    prompt.onCancel();assert.equal(resumes,1);prompt.onConfirm();assert.equal(starts,1);assert.deepEqual(h.disk.record,safe);
    s.resume=resume;
    h.gm.getSlotProgressSnapshot=async()=>({storyRunId:'other-run'});let loads=0;
    await s.confirmManualLoad(new h.Game(),2,()=>loads++);prompt=h.prompts.at(-1);
    assert.match(prompt.title,/SWITCH/);assert.equal(loads,0);prompt.onConfirm();assert.equal(loads,1);

    // A new service instance shares only durable storage, as on application restart.
    const restarted=harness(h.disk);let transition;
    restarted.env.IP2Live.MenuTransition={replace(factory,options){transition={factory,options};return true}};
    assert.equal((await restarted.service.getSummary()).profileName,safe.snapshot.profileName);
    assert.equal(await restarted.service.resume(),true);
    const restoredScene=await transition.factory();transition.options.onReady(restoredScene);
    const restored=restarted.Game.current;
    assert.equal(restored.variables.doorOpen,true);assert.equal(restored.items[0].id,2);
    assert.equal(restored.playTime.time,safe.snapshot.playTimeMs);
    assert.equal(restored.ip2liveGameStates.neuralLifeForce.lifeForce,76);
    assert.equal(restored.hero.position.x,8);assert.equal(restarted.gm.getActiveSaveSlot(restored),null);
    assert.equal(restored.slot,-1);assert.equal(restarted.gm.isResumingMapFromSave(restored.currentMapID,restoredScene),true);
    assert.equal(restarted.service._pending,null,'resuming does not rewrite the recovery point');
    assert.deepEqual(h.disk.record,safe);

    const recoveredRecord=clone(restarted.disk.record);
    const oldGame=restarted.Game.current, oldMap=restarted.MapScene.current;
    restarted.service.replaceWithStory(async()=>{throw new Error('map load failed')});
    await assert.rejects(transition.factory(),/map load failed/);transition.options.onFailure();
    assert.equal(restarted.Game.current,oldGame);assert.equal(restarted.MapScene.current,oldMap);
    assert.deepEqual(restarted.disk.record,recoveredRecord,'failed story replacement leaves autosave intact');
    assert.equal(restarted.service._switching,false);
    let closedWith;
    restarted.env.Manager.Stack.popAll=()=>{closedWith=restarted.Game.current};
    restarted.service.replaceWithStory(async()=>{
        restarted.Game.current=new restarted.Game();return new restarted.MapScene(3);
    });
    const replacement=await transition.factory(), loadedGame=restarted.Game.current;
    transition.options.replaceStack(replacement);
    assert.equal(closedWith,oldGame,'old map closes against its own game state');
    assert.equal(restarted.Game.current,loadedGame);
    transition.options.onReady(replacement);

    const paused=harness();paused.start();
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(paused.transactions.length,1,'pending checkpoint flushes even without another map update');
    paused.transactions[0].commit();await settle();
    const manualRecord=clone(paused.disk.record);
    await paused.env.Common.Platform.registerSave(2,'Saves/2.json',{manual:true});
    assert.equal(paused.manualWrites[0].slot,2);assert.deepEqual(paused.disk.record,manualRecord);

    // Escape is distinct from selecting the left action; existing confirmations retain their behavior.
    vm.runInContext(read('modules/screens/confir-popup.js'),restarted.env);
    const popup=Object.create(restarted.env.window.confirPopup.prototype);
    popup.resolved=false;popup.onCancel=()=>resumes++;popup.onDismiss=()=>starts++;
    const oldResumes=resumes;popup.onKeyPressed('Escape');assert.equal(resumes,oldResumes);
    console.log('Story autosave: persistence, isolation, atomic failure, queueing, map changes, restore and prompts passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
