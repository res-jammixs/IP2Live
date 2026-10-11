const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function harness() {
    let now = 1000000, failWrite = false;
    const disk = new Map(), profiles = new Map(), events = [], recovery = {record:null};
    const platform = {
        async registerSave(slot, _path, json) {
            await Promise.resolve();
            if (failWrite) throw new Error('quota exceeded');
            disk.set(slot, clone(json));
        },
        async loadSave(slot) { return clone(disk.get(slot)); },
    };
    class Game {
        constructor(slot = -1) {
            this.slot = slot; this.saves = 0; this.currentMapID = 3;
            this.hero = {position: {x:8,y:0,z:12},initializeProperties(){}};
            this.playTime = {time:12345}; this.variables = {doorOpen:true};
        }
        async save(slot) {
            this.slot = slot; this.saves++;
            await platform.registerSave(slot, '', {currentMapId:this.currentMapID,
                heroPosition:Object.values(this.hero.position), vars:clone(this.variables), saves:this.saves});
        }
        async load() {
            const json = await platform.loadSave(this.slot, '');
            this.isEmpty = !json;
            if (json) { this.currentMapID = json.currentMapId; this.variables = clone(json.vars); }
        }
        async loadPositions() {}
    }
    class MapScene { constructor(id){this.id=id;this.loading=false;MapScene.current=this;} update(){} drawHUD(){} }
    MapScene.current = new MapScene(3);
    const qm = {activeMapId:3, completedObjectives:{quest:{first:true}},
        snapshotProgress() { return clone({activeMapId:this.activeMapId, completedObjectives:this.completedObjectives}); },
        restoreProgress(state) { this.completedObjectives = clone(state.completedObjectives); },
    };
    const pause = {activeScreen:null, menuOpen:false,
        captureActiveSession() { return this.activeScreen && this.activeScreen.session; },
        findSession(id, payload) { return Object.values(Game.current?.ip2liveGameStates?.gameplaySessions || {})
            .find(s => s.gameplayId === id && s.questId === payload.questId && s.objectiveId === payload.objectiveId); },
    };
    const env = {console:{log(){},warn(){},error(){}}, window:{}, setTimeout,clearTimeout,Main:{},
        Date:class extends Date {static now(){return now;}},
        Common:{Platform:platform}, Core:{Game}, Data:{Systems:{saveSlots:9}}, Scene:{Map:MapScene},
        Manager:{Stack:{}}, IP2Live:{QuestManager:qm,GameplayPause:pause,
            MapManager:{stageFor:()=>({stage:2,level:1})},
            DBManager:{getRecord:async(store,key)=>clone(store==='storyAutosaves'?recovery.record:profiles.get(key)),
                saveRecord:async(_store,value)=>profiles.set(value.infiltratorName,clone(value)),
                getRecordsByIndex:async()=>clone(events),initDB:async()=>({transaction(){
                    const tx={objectStore:()=>({put(record){Promise.resolve().then(()=>{
                        recovery.record=clone(record);tx.oncomplete();
                    });}})};return tx;
                }})},
        },
    };
    vm.createContext(env);
    const load = file => vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),env);
    load('modules/game_manager.js');
    const gm = env.IP2Live.GameManager;
    gm._logTelemetryEvent = (type,payload) => { events.push({eventType:type,...clone(payload)}); return Promise.resolve(); };
    load('modules/story_persistence.js');
    return {env,gm,pause,qm,Game,disk,events,platform,load,recovery,
        advance:ms=>{now+=ms;}, fail:value=>{failWrite=value;}};
}

(async () => {
    const h = harness(), {gm,Game,pause} = h;
    const id = 'ip_cidr_quarantine_matrix';
    const context = {mapId:3,questId:'quest',objectiveId:'second'};
    const game = Game.current = new Game();
    game.infiltratorName = 'NOVA'; game.profileId = 'profile-nova'; game._ip2liveStoryRunId = 'story-one';
    const session = {gameplayId:id,...context, completed:false,capturedAt:1000000,state:{
        phase:'boss',bossHp:2,hearts:2,bossBulletImpacts:4,weapon:{operator:'+',blockSize:32},
        problem:{asked:'broadcast',networkAddress:'192.168.1.32',hostBits:5},
        barriers:[{hits:7}],decisionHistory:[{stepKey:'operator',correct:true}],
        roundHistory:[{problemId:'earlier',passed:false}],learningTelemetryClock:{activeElapsedMs:6500},
    }};
    game.ip2liveGameStates = {neuralLifeForce:{lifeForce:68,failureStreak:2},
        mapEntryDialoguesSeen:{3:true},gameplaySessions:{terminal:session}};
    const allocator=h.env.IP2Live.VLSMAllocatorGameplayManager={_active:true,_activeAttempt:'old-terminal',
        _triggerLocks:{old:true},_introShown:true,_state:{allocations:{hq:{cidr:'172.30.32.0/23'}},visitOrder:['hq']}};
    h.env.IP2Live.CIDRGameplayState={latest:{mask:'255.255.255.224'},handoffs:{panel:{prefix:27}}};
    pause.activeScreen = {session, options:context};
    const open = gm._openReportAttempt(id,context);
    open.mistakeCount = 1; open.mistakeEvents.push({concept:'block_size',correct:false});
    h.advance(7000);
    const saved = await gm.saveProgressToActiveSlot(2,'NOVA CHECKPOINT');
    assert.equal(saved.saved,true);
    const record = clone(h.disk.get(2));
    assert.equal(record._ip2liveProgress.schemaVersion,2);
    assert.equal(record._ip2liveProgress.reportContext.attempts[id].attemptId,open.attemptId);
    assert.equal(record._ip2liveProgress.reportContext.attempts[id].elapsedBeforeResumeMs,7000);
    assert.equal(record._ip2liveProgress.gameStates.gameplaySessions.terminal.state.bossBulletImpacts,4);
    assert.equal(record._ip2liveProgress.gameplayState.managers.VLSMAllocatorGameplayManager._state.allocations.hq.cidr,'172.30.32.0/23');
    game.ip2liveGameStates.neuralLifeForce.lifeForce = 10;
    assert.equal(record._ip2liveProgress.gameStates.neuralLifeForce.lifeForce,68,'save is detached from live state');

    h.fail(true); game.variables.doorOpen = false;
    const failed = await gm.saveProgressToActiveSlot(2,'FAILED');
    assert.equal(failed.saved,false);
    assert.deepEqual(h.disk.get(2),record,'failed native write preserves core and matching story snapshot together');
    assert.equal(h.env.IP2Live.StoryPersistence._pending.size,0);
    h.fail(false);

    h.advance(86400000);
    const loaded = new Game(2);
    await loaded.load();
    assert.equal(Game.current,game,'slot inspection does not replace the running story');
    assert.equal(loaded.infiltratorName,'NOVA');
    Game.current = loaded;
    const restored = await gm.restoreProgressFromSlot(2,loaded);
    assert.equal(restored.restored,true);
    assert.equal(gm._activeGameplayNode,null);
    assert.equal(pause.activeScreen,null);
    assert.equal(allocator._active,false,'transient terminal ownership is cleared before restoring a story');
    assert.equal(allocator._activeAttempt,null);
    assert.deepEqual(clone(allocator._triggerLocks),{});
    assert.equal(allocator._state.allocations.hq.cidr,'172.30.32.0/23','VLSM branches survive an application restart');
    assert.equal(h.env.IP2Live.CIDRGameplayState.handoffs.panel.prefix,27,'CIDR prerequisite handoffs survive loading');
    assert.deepEqual(clone(loaded.ip2liveGameStates),record._ip2liveProgress.gameStates);
    assert.equal(loaded.hero.position.x,8);
    assert.equal(h.qm.completedObjectives.quest.first,true);
    const resumed = gm._openReportAttempt(id,{...context,resumeGameplay:true});
    assert.equal(resumed.attemptId,open.attemptId);
    assert.equal(resumed.mistakeEvents.length,1);
    assert.equal(h.events.filter(e=>e.eventType==='attempt_start').length,1,'resume does not count as a new launch');
    h.advance(3000);
    const ended = gm._closeReportAttempt(id,{result:{correctDecisions:2,totalDecisions:2}},true);
    assert.equal(ended.durationMs,10000,'offline day is excluded from restored attempt duration');

    const olderCheckpoint = new Game(2); await olderCheckpoint.load();
    Game.current = olderCheckpoint; await gm.restoreProgressFromSlot(2,olderCheckpoint);
    const replay = gm._openReportAttempt(id,{...context,resumeGameplay:true});
    assert.notEqual(replay.attemptId,open.attemptId,'replaying a finished checkpoint creates a separate attempt');

    // The loaded core snapshot wins over unrelated/newer sidecars and cached profiles.
    h.env.IP2Live.DesktopStorage = {readProgressSnapshot:async()=>({mapId:8,profileName:'OTHER'})};
    const exact = await gm.getSlotProgressSnapshot(2,{loadedGame:olderCheckpoint});
    assert.equal(exact.mapId,3); assert.equal(exact.profileId,'profile-nova');
    const other = clone(record); other._ip2liveProgress.profileName='OTHER'; other._ip2liveProgress.profileId='profile-other';
    h.disk.set(3,other);
    const inspected = new Game(3); await inspected.load();
    assert.equal(inspected.infiltratorName,'OTHER'); assert.equal(Game.current,olderCheckpoint);
    assert.equal((await gm.getSlotProgressSnapshot(2,{loadedGame:olderCheckpoint})).profileName,'NOVA');

    // Legacy native saves still load without fabricating telemetry or overwriting their core map.
    h.disk.set(4,{currentMapId:5,heroPosition:[1,0,2],vars:{legacy:true}});
    const legacy = new Game(4); await legacy.load(); Game.current=legacy;
    const legacyRestore = await gm.restoreProgressFromSlot(4,legacy);
    assert.equal(legacyRestore.reason,'core-save-only'); assert.equal(legacy.currentMapID,5);
    assert.equal(legacy._ip2liveRestoredReportAttempts,undefined);
    assert.equal(allocator._state,null,'legacy loading never inherits another story\'s VLSM allocations');
    assert.equal(h.env.IP2Live.CIDRGameplayState,undefined);

    h.env.IP2Live.PracticeMode = {active:true};
    assert.equal((await gm.saveProgressToActiveSlot(1)).reason,'practice-mode');
    h.env.IP2Live.PracticeMode.active=false;
    pause.activeScreen={options:{developerTest:true}};
    assert.equal((await gm.saveProgressToActiveSlot(1)).reason,'not-story-gameplay');
    await assert.rejects(h.platform.registerSave(1,'',{currentMapId:5}),/Only Story Mode/);
    assert.equal(h.disk.has(1),false);

    const malformed=clone(record); malformed._ip2liveProgress.mapId=7; h.disk.set(5,malformed);
    await assert.rejects(new Game(5).load(),/snapshot is invalid/);
    const future=clone(record); future._ip2liveProgress.schemaVersion=999; h.disk.set(6,future);
    await assert.rejects(new Game(6).load(),/unsupported version/);

    // The reserved autosave route and native payload hooks work in either load path.
    pause.activeScreen=null;
    Game.current=olderCheckpoint;
    gm._reportActiveAttempts={[id]:replay};
    gm.clearActiveSaveSlot(); olderCheckpoint.slot=-1;
    h.load('modules/story_autosave.js');
    const autosave=h.env.IP2Live.StoryAutosave;
    autosave.beginStory(olderCheckpoint,{scene:h.env.Scene.Map.current,preserveId:true,checkpoint:false});
    const checkpoint=await autosave.checkpoint('gameplay_paused');
    assert.equal(checkpoint.saved,true);
    assert.equal(h.recovery.record.version,2);
    assert.equal(h.recovery.record.snapshot.reportContext.attempts[id].attemptId,replay.attemptId);
    let transition;
    h.env.IP2Live.MenuTransition={replace(factory,options){transition={factory,options};return true;}};
    assert.equal(await autosave.resume(),true);
    const resumedScene=await transition.factory(); transition.options.onReady(resumedScene);
    assert.equal(Game.current.slot,-1,'recovery does not claim a numbered save slot');
    assert.equal(Game.current.ip2liveGameStates.gameplaySessions.terminal.state.bossBulletImpacts,4);
    assert.equal(Game.current._ip2liveRestoredReportAttempts[id].attemptId,replay.attemptId);

    const sourceGame=Game.current, sourceScreen={options:context}, sourceAttempts={example:{attemptId:'source'}};
    const sourceAllocations=allocator._state;
    pause.activeScreen=sourceScreen;gm._reportActiveAttempts=sourceAttempts;gm._activeGameplayNode='source-node';
    autosave.replaceWithStory(async()=>{
        Game.current=new Game();gm.resetStoryRuntime(Game.current);throw new Error('destination failed');
    });
    await assert.rejects(transition.factory(),/destination failed/);transition.options.onFailure();
    assert.equal(Game.current,sourceGame);assert.equal(pause.activeScreen,sourceScreen);
    assert.equal(gm._reportActiveAttempts,sourceAttempts);assert.equal(gm._activeGameplayNode,'source-node');
    assert.equal(allocator._state,sourceAllocations,'failed replacement restores manager state ownership');

    // Returning to the quest suspends a retained puzzle; idle time is excluded.
    gm._reportActiveAttempts={};pause.activeScreen=null;
    const inMemory=gm._openReportAttempt(id,context);h.advance(2000);
    assert.equal(gm._suspendReportAttempt(id,'returned_to_quest'),true);
    h.advance(90000);
    const pending=gm.buildStoryProgressSnapshot(sourceGame,{slot:-2});
    assert.equal(pending.reportContext.attempts[id].elapsedBeforeResumeMs,2000);
    gm._openReportAttempt(id,{...context,resumeGameplay:true});h.advance(1000);
    assert.equal(gm._closeReportAttempt(id,{result:{correctDecisions:2,totalDecisions:2}},true).durationMs,3000);
    const quitting=gm._openReportAttempt(id,context);h.advance(2000);gm._activeGameplayNode=null;
    await gm.prepareForShutdown('test_quit');
    assert.equal(h.recovery.record.snapshot.reportContext.attempts[id].attemptId,quitting.attemptId);
    assert.equal(h.recovery.record.snapshot.reportContext.attempts[id].elapsedBeforeResumeMs,2000);
    assert.equal(h.events.some(event=>event.eventType==='attempt_end'&&event.attemptId===quitting.attemptId),false,
        'orderly shutdown saves an unfinished attempt instead of ending it');
    let scope;
    h.env.IP2Live.ReportManager={export:async options=>{scope=options.scopeDays;return {ok:true};}};
    await gm.exportProgressReport({scopeDays:0});assert.equal(scope,0,'all-history report scope survives GameManager dispatch');
    console.log('Story persistence: atomic core snapshots, legacy load, profile isolation and report continuity passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
