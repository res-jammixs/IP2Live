const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const settle = async () => { for(let i=0;i<60;i++) await Promise.resolve(); };
const clone = x => JSON.parse(JSON.stringify(x));

function harness(disk = {record:null}, options = {}) {
    const transactions=[], manualWrites=[], prompts=[], polls=[], musicCalls=[];
    let now = options.now || Date.now();
    class Clock extends Date { static now(){ return now; } }
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
    class MapScene {constructor(id){this.id=id;this.loading=false;MapScene.current=this;}update(){}drawHUD(){}onKeyPressed(key){this.lastKey=key;}}
    const qm={activeMapId:3,completedObjectives:{quest1:{first:true}},snapshotProgress(){return clone({activeMapId:this.activeMapId,completedObjectives:this.completedObjectives})},
        restoreProgress(s){this.activeMapId=s.activeMapId;this.completedObjectives=clone(s.completedObjectives)}};
    const sound={playSound(){}};
    const env={console:{log(){},warn(){},error(){}},Date:Clock,setTimeout,clearTimeout,
        setInterval:(callback,ms)=>{polls.push({callback,ms});return {unref(){}}},window:{},Main:{},
        Common:{Platform:platform,Inputs:{keysPressed:new Set(),lockedKeys:new Map()}},Core:{Game},Scene:{Map:MapScene,Base:class{}},Data:{Systems:{soundCancel:sound,soundConfirmation:sound},Keyboards:{checkCancelMenu:k=>k==='Escape',checkActionMenu:()=>false,
            get:id=>({id,sc:[[['w','s','a','d'][id-1]]]}),isKeyEqual:(key,kb)=>kb.sc.some(group=>group[0].toUpperCase()===String(key).toUpperCase())}},
        Manager:{Stack:{top:{},requestPaintHUD:false,pop(){}}},IP2Live:{DBManager:{initDB:async()=>db,getRecord:async()=>clone(disk.record)},
            MusicManager:{playMap:mapId=>musicCalls.push({mapId}),currentZone:()=> 'MAIN_MENU',play:zone=>musicCalls.push({zone})},
            QuestManager:qm,MapManager:{stageFor:id=>({name:'Stage '+id}),goTo(id){Game.current.currentMapID=id;return new MapScene(id)}},
            confirPopup:{show:o=>prompts.push(o)}}};
    vm.createContext(env);vm.runInContext(read('modules/game_manager.js'),env);
    const gm=env.IP2Live.GameManager;gm._ensureQuestMinimap=()=>{};
    vm.runInContext(read('modules/story_autosave.js'),env);
    vm.runInContext(read('modules/input_guard.js'),env);
    const service=env.IP2Live.StoryAutosave;
    const start=(name='NOVA')=>{const game=Game.current=new Game();game.infiltratorName=name;service.beginStory(game);const map=new MapScene(3);qm.activeMapId=3;return {game,map}};
    const flush=async(map)=>{service.tick(map);await settle();const tx=transactions.at(-1);assert.ok(tx?.record);tx.commit();await settle();};
    return {env,service,gm,qm,disk,transactions,manualWrites,prompts,polls,musicCalls,start,flush,Game,MapScene,
        advance:ms=>{now+=ms;}};
}

(async()=>{
    const h=harness(), {service:s}=h, {game,map}=h.start();
    const originalSlot=game.slot;
    h.env.Common.Inputs.keysPressed.add('W');h.env.Common.Inputs.lockedKeys.set('W',90);
    s.tick(map);await settle();
    assert.equal(h.disk.record,null,'request success is not a durable commit');
    assert.equal(s._status.text,'Saving story...');
    h.transactions.at(-1).commit();await settle();
    assert.equal(game.slot,originalSlot);assert.equal(game.saves,0);assert.equal(h.manualWrites.length,0);
    assert.equal(h.gm.getActiveSaveSlot(game),null);
    assert.equal(h.disk.record.coreSave.vars.doorOpen,true);
    assert.equal(h.disk.record.version,2,'new recovery records carry the current schema envelope');
    assert.equal(h.disk.record.snapshot.gameStates.neuralLifeForce.lifeForce,76);
    assert.equal(s._status.text,'Story autosaved');
    assert.ok(h.env.Common.Inputs.keysPressed.has('W'),'background autosaving leaves held movement intact');
    assert.equal(h.env.Common.Inputs.lockedKeys.get('W'),90,'background autosaving leaves camera locks intact');

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
    restarted.env.Common.Inputs.keysPressed.add('D');restarted.env.Common.Inputs.lockedKeys.set('D',90);
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
    assert.equal(restarted.musicCalls.at(-1).mapId,restored.currentMapID,'autosave resume selects destination music without replaying the entry dialogue');
    assert.equal(restarted.service._pending,null,'resuming does not rewrite the recovery point');
    assert.equal(restarted.env.Common.Inputs.keysPressed.size,0,'autosave restore clears old held keys');
    assert.equal(restarted.env.Common.Inputs.lockedKeys.size,0,'autosave restore clears old camera locks');
    restarted.env.Manager.Stack.top=restoredScene;
    for(const key of ['W','S','A','D']) {
        restarted.env.Common.Inputs.keysPressed.add(key);restoredScene.onKeyPressed(key);assert.equal(restoredScene.lastKey,key);
        restarted.env.IP2Live.InputGuard.release({key:key.toLowerCase()});
    }
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

    // Older recovery saves are read without overwriting or inventing missing state.
    const legacyRecord=clone(safe);legacyRecord.version=1;delete legacyRecord.snapshot.schemaVersion;
    const legacy=harness({record:legacyRecord});
    assert.ok(await legacy.service.getSummary());
    assert.deepEqual(legacy.disk.record,legacyRecord);
    const invalid=clone(safe);invalid.coreSave.currentMapId=99;
    assert.equal(await harness({record:invalid}).service.getSummary(),null,'mismatched engine/story maps are rejected');

    const periodic=harness();const active=periodic.start();await periodic.flush(active.map);
    periodic.env.Manager.Stack.top=active.map;
    assert.equal(periodic.polls.length,1);assert.equal(periodic.polls[0].ms,1000);
    periodic.service.install();assert.equal(periodic.polls.length,1,'installing twice does not stack hooks or timers');
    let count=periodic.transactions.length;
    periodic.advance(periodic.service.INTERVAL_MS-1);periodic.polls[0].callback();await settle();
    assert.equal(periodic.transactions.length,count,'periodic saving respects the interval');
    periodic.advance(1);periodic.polls[0].callback();await settle();
    assert.equal(periodic.transactions.length,count+1);
    periodic.transactions.at(-1).commit();await settle();
    assert.equal(periodic.disk.record.snapshot.checkpointReason,'periodic');
    periodic.env.document={hidden:true};periodic.advance(periodic.service.INTERVAL_MS);periodic.polls[0].callback();await settle();
    assert.equal(periodic.transactions.length,count+1,'background tabs do not generate periodic saves');
    periodic.env.document.hidden=false;periodic.env.Manager.Stack.top={isMenu:true};periodic.polls[0].callback();await settle();
    assert.equal(periodic.transactions.length,count+1,'title/menu screens do not generate periodic saves');

    // A map transition creates its own checkpoint, even without a completed quest.
    periodic.env.Manager.Stack.top=active.map;
    const travel=periodic.env.IP2Live.MapManager.goTo(4);periodic.qm.activeMapId=4;
    periodic.env.Manager.Stack.top=travel;await periodic.flush(travel);
    assert.equal(periodic.disk.record.snapshot.mapId,4);
    assert.equal(periodic.disk.record.snapshot.checkpointReason,'map_transition');

    // Active gameplay uses the shared snapshot builder so formula choices,
    // preparation time and the report attempt identity travel together.
    const gameplay=harness();const current=gameplay.start();await gameplay.flush(current.map);
    const screen={options:{mapId:3,questId:'quest1',objectiveId:'first'},phase:'boss',
        bossBulletImpacts:4,operator:'+',blockSize:32,hearts:2,preparationMs:25000,
        roundHistory:[{problemId:'question-1',passed:true}],decisionHistory:[{correct:true,stepKey:'operator'}]};
    gameplay.gm._activeGameplayNode='ip_cidr_quarantine_matrix:quest1:first';
    gameplay.env.IP2Live.GameplayPause={activeScreen:screen};gameplay.env.Manager.Stack.top=screen;
    let captures=0;
    const shared=gameplay.gm.buildStoryProgressSnapshot;
    gameplay.gm.buildStoryProgressSnapshot=function(game,opts){
        captures++;game.ip2liveGameStates.gameplaySessions={current:{state:clone(screen)}};
        const snapshot=shared ? shared.call(this,game,opts) : {schemaVersion:2,storyRunId:game._ip2liveStoryRunId,
            profileName:game.infiltratorName,profileId:game.profileId,mapId:game.currentMapID,
            heroPosition:this._captureHeroPosition(game),questState:this._buildQuestSnapshot(),
            gameStates:clone(game.ip2liveGameStates),playTimeMs:this.getPlayTimeMs(game),savedAt:gameplay.env.Date.now(),
            checkpointReason:opts.checkpointReason};
        snapshot.reportContext={activeAttempts:{blaster:{attemptId:'attempt-preserved',elapsedMs:14000}}};
        return snapshot;
    };
    gameplay.advance(gameplay.service.INTERVAL_MS);gameplay.polls[0].callback();await settle();
    const inFlight=gameplay.transactions.at(-1);assert.ok(captures>0);
    const state=inFlight.record.snapshot.gameStates.gameplaySessions.current.state;
    assert.equal(state.bossBulletImpacts,4);assert.equal(state.hearts,2);assert.equal(state.preparationMs,25000);
    assert.equal(inFlight.record.snapshot.reportContext.activeAttempts.blaster.attemptId,'attempt-preserved');
    screen.bossBulletImpacts=0;assert.equal(state.bossBulletImpacts,4,'transaction payload is detached from live gameplay');
    inFlight.commit();await settle();
    const gameplayCount=gameplay.transactions.length;
    screen.options.developerTest=true;gameplay.advance(gameplay.service.INTERVAL_MS);gameplay.polls[0].callback();await settle();
    assert.equal(gameplay.transactions.length,gameplayCount,'developer testing never overwrites story recovery');
    assert.equal((await gameplay.service.checkpoint('developer')).saved,false);

    // Do not commit a captured source map if opening IndexedDB yields while
    // the story moves to a destination. Re-capture that destination instead.
    const delayed=harness();const source=delayed.start();await delayed.flush(source.map);
    let releaseDB;const init=delayed.env.IP2Live.DBManager.initDB;
    delayed.env.IP2Live.DBManager.initDB=()=>new Promise(resolve=>{releaseDB=()=>init().then(resolve)});
    const moving=delayed.service.checkpoint('travel');delayed.service.tick(source.map);await settle();
    const beforeTravel=clone(delayed.disk.record), beforeCount=delayed.transactions.length;
    const destination=delayed.env.IP2Live.MapManager.goTo(4);delayed.qm.activeMapId=4;
    delayed.env.IP2Live.DBManager.initDB=init;releaseDB();await settle();
    assert.deepEqual(delayed.disk.record,beforeTravel);
    assert.equal(delayed.transactions.length,beforeCount,'stale source payload never starts a write transaction');
    await delayed.flush(destination);assert.equal((await moving).saved,true);
    assert.equal(delayed.disk.record.snapshot.mapId,4);
    console.log('Story autosave: persistence, isolation, atomic failure, queueing, map changes, restore and prompts passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
