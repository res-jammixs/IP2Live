const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'../Plugins/IP2Live_Core');

function harness() {
    const timers=[],loads=[],checkpoints=[],attempts=[],storage=new Map(); let resets=0;
    class Base { constructor(){this.loading=false;this.initialize?.();} close(){} }
    class MapScene extends Base {
        constructor(id){super();this.id=id;this.loading=true;this.heroMapObject={position:{x:0,y:0,z:0}};MapScene.current=this;}
        update(){} drawHUD(){} onMouseUp(){return false;}
    }
    const stack={content:[],get top(){return this.content.at(-1);},push(s){this.content.push(s);},
        pop(){const s=this.content.pop();s?.close?.();return s;},replace(s){this.pop();this.push(s);},clearHUD(){},requestPaintHUD:false};
    const game={currentMapID:3,infiltratorName:'NOVA',_ip2liveStoryRunId:'ending-test-story',ip2liveGameStates:{}};
    const env=vm.createContext({console:{log(){},warn(){}},window:{},
        setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},
        localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
        Core:{Game:{current:game}},Scene:{Base,Map:MapScene},Manager:{Stack:stack},
        Common:{Constants:{SQUARE_SIZE:1},ScreenResolution:{SCREEN_X:1280,SCREEN_Y:720},Platform:{ctx:{canvas:{width:1280,height:720}}}},
        Data:{Systems:{},TitlescreenGameover:{isTitleBackgroundVideo:false}},IP2Live:{InputGuard:{reset(){resets++;}}},
    });
    const load=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),env,{filename:file});
    load('modules/game_manager.js');load('modules/map_manager.js');load('modules/quest_manager.js');load('modules/story_completion.js');
    const ip=env.IP2Live,gm=ip.GameManager,maps=ip.MapManager,qm=ip.QuestManager;
    // Use the production completion service with a minimal view: the cutscene
    // renderer and saves are covered by story_completion.test.cjs.
    ip.StoryEndingScreen=class extends Base {constructor(record){super();this.record=record;this.phase='cutscene';}close(){ip.StoryCompletion.release(this);}};
    ip.LoadingScreen2={show(options){loads.push(options);}};
    ip.StoryAutosave={checkpoint:async()=>({saved:true})}; gm.saveProgressToActiveSlot=async()=>({saved:true});
    gm._queueCheckpoint=reason=>checkpoints.push(reason);gm._drawDeveloperQuestButton=()=>{};
    gm.on(gm.EVENT.GAMEPLAY_COMPLETED,payload=>attempts.push(payload));
    gm._injectMapHooks();maps._injectMapHooks();maps.registerStageQuests(qm);
    const source=new MapScene(3);source.loading=false;stack.push(source);qm.ensureMapQuestFor(3,source);
    return {env,ip,gm,maps,qm,game,source,stack,loads,timers,attempts,checkpoints,get resets(){return resets;},
        finishLoad(){assert.equal(loads.length,1);loads.shift().onComplete();const target=stack.top;target.loading=false;target.update();return target;}};
}

test('developer toolbar prepares every Story quest, teleports, and triggers the ending only at its marker', async()=>{
    const h=harness();const {gm,qm,maps,game,stack}=h;
    gm._drawEndingSimulationButton(h.env.Common.Platform.ctx,h.source);
    const button=gm._simulateEndingButtonRect;assert.equal(button.title,'Simulate Ending');assert.equal(button.active,true);
    assert.equal(h.source.onMouseUp(button.x+button.w/2,button.y+button.h/2),true);
    assert.equal(h.loads.length,1);assert.equal(gm.simulateEnding(),false,'rapid clicks cannot queue another teleport');
    assert.equal(h.ip.StoryCompletion.activeScene,null);
    const target=h.finishLoad();assert.equal(target.id,18);assert.equal(game.currentMapID,18);
    assert.equal(qm.activeQuestId,'stage.default_exit.18');assert.equal(qm.activeObjectiveId,'reach_stage_exit');
    assert.equal(qm.guideActive,true);assert.equal(qm.allowCompletion,true);
    for(const [mapId,queue] of Object.entries(qm.mapQuestQueues)) for(const id of queue.questIds) {
        for(const objective of qm.quests[id].objectives) assert.equal(!!qm.completedObjectives[id]?.[objective.id],id!=='stage.default_exit.18',`${mapId}: ${id}/${objective.id}`);
    }
    qm.update({scene:target});assert.equal(stack.top,target,'arrival at the authored spawn does not start the ending');
    assert.deepEqual(h.attempts,[],'simulated completion creates no successful assessment attempts');
    assert.ok(h.checkpoints.includes('developer_ending_simulation_ready'));assert.ok(h.resets>=2);
    const exit=maps.exitFor(18);Object.assign(target.heroMapObject.position,{x:exit.x+.5,y:exit.y,z:exit.z+.5});qm.update({scene:target});
    const ending=stack.top;assert.equal(ending.phase,'cutscene');assert.equal(ending.record.name,'NOVA');
    assert.equal(qm.completedObjectives['stage.default_exit.18'].reach_stage_exit,true);
    qm.update({scene:target});assert.equal(stack.top,ending,'the marker opens only one ending');
    await ending.saveTask;
});

test('re-simulation clears a current award and preserves prepared quests across delayed map-entry reset',()=>{
    const h=harness();h.game.ip2liveGameStates.storyCompletion={id:'old',status:'completed'};
    assert.equal(h.gm.simulateEnding(),true);assert.equal(h.game.ip2liveGameStates.storyCompletion,undefined);
    // Model an early floor reset during map initialization before onAfterLoad.
    h.qm._resetMapEntryQuests(18);
    const target=h.finishLoad();h.qm.ensureMapQuestFor(18,target);
    assert.equal(h.qm.activeQuestId,'stage.default_exit.18');
    assert.ok(h.qm.mapQuestQueues[18].questIds.filter(id=>id!=='stage.default_exit.18').every(id=>h.qm._isQuestFinished(id)));
    assert.equal(h.ip.StoryCompletion.activeScene,null);
});

test('disabled, covered, busy and optional game modes cannot simulate Story completion',()=>{
    for(const setup of [h=>{h.gm.enableDeveloperButtons=false;},h=>{h.gm.enableEndingSimulationButton=false;},
        h=>{h.stack.push({});},h=>{h.source.loading=true;},h=>{h.gm._activeGameplayNode='busy';},
        h=>{h.ip.DialogueManager={isActive:()=>true};},h=>{h.ip.PracticeMode={active:true};},
        h=>{h.ip.EndlessMode={active:true};},h=>{h.ip.PVPMode={active:true};}]) {
        const h=harness(),before=JSON.stringify(h.qm.snapshotProgress().completedObjectives);setup(h);
        assert.equal(h.gm.simulateEnding(),false);assert.equal(h.loads.length,0);
        assert.equal(JSON.stringify(h.qm.completedObjectives),before);
    }
});

test('a rejected map launch restores the previous quest state and completion record',()=>{
    const h=harness(),before=JSON.stringify(h.qm.completedObjectives),record={id:'earned-story'};
    h.game.ip2liveGameStates.storyCompletion=record;h.gm.startMapFlow=()=>false;
    assert.equal(h.gm.simulateEnding(),false);assert.equal(h.gm._endingSimulationPending,null);
    assert.equal(JSON.stringify(h.qm.completedObjectives),before);assert.equal(h.game.ip2liveGameStates.storyCompletion,record);
});
