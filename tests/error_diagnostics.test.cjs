const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');
const adapters = ['gameplay1/IPWires/ip_wires_diagnostic.js','gameplay2/IPPatchPanel/ip_patchpanel_diagnostic.js',
    'gameplay3/CIDRPanel/ip_cidrpanel_diagnostic.js','gameplay4/SubnetSimulator/ip_subnetsim_diagnostic.js',
    'gameplay4_5/HostPowerReactor/ip_host_power_diagnostic.js','gameplay5/CIDRQuarantine/ip_cidr_quarantine_diagnostic.js',
    'gameplay6/CIDRQuarantineMatrix/ip_subnet_blaster_diagnostic.js','gameplay7/NetworkRepair/network_repair_diagnostic.js',
    'gameplay8/VLSMAllocator/ip_vlsm_allocator_diagnostic.js'];
const wire = {stepKey:'ip_classification', concept:'ipv4_classification', sourceId:'ip-1',sourceText:'172.16.2.3',submitted:'C',expected:'B',correct:false};
function harness() {
    let now = 100000, focused, frame = 0;
    const frames = [], raf = new Map(), checkpoints = [], events = [], timers = [];
    class Element {
        constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.attributes = {}; this.listeners = {}; this.className = ''; this.scrollTop = 0; this._text = ''; }
        get isConnected() { return this === document.body || this === document.head || !!(this.parentNode && this.parentNode.isConnected); }
        get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
        set textContent(text) { this._text = String(text); this.children = []; }
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
        append(...children) { children.forEach(c => this.appendChild(c)); }
        replaceChildren(...children) { this.children.forEach(c => c.parentNode = null); this.children = []; this._text = ''; this.append(...children); }
        remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; }
        setAttribute(name, value) { this.attributes[name] = String(value); }
        getAttribute(name) { return this.attributes[name]; }
        get classList() { return {toggle:(name, on) => { const values = new Set(this.className.split(' ')); if (on) values.add(name); else values.delete(name); this.className = [...values].join(' '); }}; }
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
        removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
        click() { for (const fn of this.listeners.click || []) fn({stopPropagation(){}}); }
        contains(node) { return node === this || this.children.some(child => child.contains(node)); }
        querySelectorAll(selector) { return this.children.flatMap(c => [(c.tagName === 'button' && (!selector.includes(':disabled') || !c.disabled) ? c : null), ...c.querySelectorAll(selector)]).filter(Boolean); }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        getClientRects() { return this.isConnected ? [this.getBoundingClientRect()] : []; }
        getBoundingClientRect() { const left = parseFloat(this.style.left) || 1000, top = parseFloat(this.style.top) || 60, width = parseFloat(this.style.width) || 240, height = this.className === 'ip2-error-hud' ? 64 : 110; return {left,top,width,height,right:left+width,bottom:top+height}; }
        focus() { focused = this; }
    }
    const document = {createElement:tag=>new Element(tag),createTextNode:text=>{const n=new Element('#text');n.textContent=text;return n;},getElementById:id=>document.head.children.find(n=>n.id===id),
        addEventListener(){},removeEventListener(){},get activeElement(){return focused;}};
    document.head = new Element('head'); document.body = new Element('body');
    const context = vm.createContext({console, document, window:{innerWidth:1280,innerHeight:720,matchMedia:()=>({matches:false})},
        performance:{now:()=>now},Date:class extends Date {static now(){return now;}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
        requestAnimationFrame:fn=>{raf.set(++frame,fn);return frame;},cancelAnimationFrame:id=>raf.delete(id),
        Core:{Game:{current:{infiltratorName:'Student',_ip2liveProfileId:'student-a',currentMapID:4,ip2liveGameStates:{}}}},
        Common:{Platform:{},ScreenResolution:{SCREEN_X:1280,SCREEN_Y:720}},Data:{Keyboards:{checkCancelMenu:key=>key==='cancel'}},
        Scene:{Base:class{constructor(load){if(this.initialize)this.initialize();if(load&&this.load)this.load();}},Map:{current:{id:4,drawHUD(){},draw3D(){}}}},
        Manager:{Stack:{get top(){return frames.at(-1);},push:s=>frames.push(s),pop:()=>{const scene=frames.pop();if(scene&&scene.close)scene.close();return scene;}}},
        IP2Live:{InputGuard:{reset(){}},QuestMinimap:{_container:new Element('map'),_shouldHide:()=>false,isActive:()=>true,update(){}}}, inject(){},Graphic:{},Model:{},Main:{},THREE:{}});
    const load = file => vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
    load('modules/game_manager.js'); load('gameplay/common/ip_class_ranges.js'); load('gameplay/common/gameplay_diagnostic.js'); adapters.forEach(f=>load('gameplay/'+f));
    load('modules/error_diagnostics.js'); load('modules/screens/error-diagnostics.js');
    const gm = context.IP2Live.GameManager; gm._queueCheckpoint = reason=>checkpoints.push(reason); gm._logTelemetryEvent=(type,data)=>events.push({type,data});
    gm._stageFor=()=>({stage:2,level:1}); gm._runTimingDialogues=()=>false; gm._setState=function(state){this.state=state;};
    frames.push(context.Scene.Map.current);
    return {context,gm,journal:context.IP2Live.ErrorDiagnostics,checkpoints,events,frames,load,document,
        advance(ms){now+=ms;const pending=[...raf.values()];raf.clear();pending.forEach(fn=>fn(now));},
        attempt(rows=[wire],extra={}) {return {attemptId:'attempt-1',gameplayId:'ip_class_wires',profileId:'student-a',stageId:2,levelId:1,outcome:'passed',payload:{result:{decisionHistory:rows},mistakes:rows},...extra};}};
}

test('groups repeated errors while preserving distinct corrections and observed decision identities',()=>{
    const h=harness(), rows=[wire,{...wire,correct:true},{...wire,sourceId:'ip-2',submitted:null},wire];
    assert.equal(h.journal.recordAttempt(h.attempt(rows)),2);
    assert.equal(h.journal.entries().length,2);
    assert.equal(h.journal.entries()[0].occurrences,2);
    assert.match(h.journal.entries()[0].why,/172\.16\.2\.3.*Class B.*128-191/);
    assert.equal(h.journal.recordAttempt(h.attempt(rows)),0);
    assert.equal(h.journal.acknowledge(h.journal.entries()[0].id),true);
    assert.equal(h.journal.recordAttempt(h.attempt(rows)),0,'acknowledged decisions cannot resurrect');
    assert.equal(h.journal.recordAttempt(h.attempt([...rows,wire])),1,'a new submission after acknowledgement can create a new recap');
    assert.equal(h.journal.entries().length,2);
});

test('fallback mistakes and later full decision history reconcile without duplication',()=>{
    const h=harness();
    assert.equal(h.journal.recordAttempt(h.attempt([],{payload:{mistakes:[wire]}})),1);
    assert.equal(h.journal.recordAttempt(h.attempt([wire])),0);
});

test('each gameplay has a targeted explanation, including both harder variants',()=>{
    const h=harness(), cases=[
        ['ip_class_wires',wire,/128-191/],['ip_class_wires_harder',wire,/128-191/],
        ['ip_patch_panel_classes',{stepKey:'mask_classification',sourceText:'255.255.0.0',submitted:'C',expected:'B',correct:false},/default mask.*Class B.*\/16/],
        ['ip_cidr_binary_panel',{stepKey:'subnet_mask_binary',submitted:'0000',expected:'1111',targetMask:'255.255.0.0',correct:false},/128, 64, 32/],
        ['ip_cidr_binary_panel_harder',{stepKey:'cidr_prefix',submitted:24,expected:16,targetMask:'255.255.0.0',correct:false},/total number.*1-bits/],
        ['ip_subnet_simulator',{stepKey:'usableHosts',submitted:32,expected:30,hostBits:5,borrowedBits:3,correct:false},/2\^h − 2/],
        ['ip_host_power_reactor',{stepKey:'minimum_host_bits',submitted:5,expected:6,requiredHosts:31,correct:false},/31.*30 usable hosts/],
        ['ip_cidr_quarantine',{stepKey:'route_host_bits',issueType:'virus',submitted:{hitVirus:true},expected:{hitVirus:false},correct:false},/virus.*separate/],
        ['ip_cidr_quarantine_matrix',{stepKey:'subnet_block_size',submitted:30,expected:32,hostBits:5,issueType:'usable_hosts_instead_of_total_addresses',correct:false},/all addresses/],
        ['ip_network_repair',{stepKey:'formula_order',slot:2,submitted:'h',expected:'2',correct:false},/Slot 3/],
        ['ip_vlsm_allocator',{stepKey:'vlsm_overlap_check',issueType:'overlap',submitted:'172.30.32.0/24',expected:{nonOverlapping:true},correct:false},/non-overlapping/],
    ];
    for(const [id,row,expected] of cases){const a=h.context.IP2Live.GameplayDiagnostics.get(id);assert.notEqual(a.label,id);const explanation=a.explain(row);assert.match(explanation.why,expected);assert.ok(explanation.hint);assert.ok(explanation.title);}
    assert.equal(Object.keys(h.context.IP2Live.GameplayDiagnostics.adapters).length,11);
    const masks=h.context.IP2Live.GameplayDiagnostics.get('ip_patch_panel_classes').explain(cases[2][1]);
    assert.doesNotMatch(masks.why,/first octet.*255/,'default masks are not classified as Class E IP addresses');
});

test('only Story assessments enter the journal; clean passes and clean cancellation add nothing',()=>{
    const h=harness();
    for(const flags of [{tutorial:true},{developerTest:true},{tutorialReplay:true},{simulated:true},{profileId:'another-profile'},{result:{developerFail:true}}])assert.equal(h.journal.recordAttempt(h.attempt([wire],flags)),0);
    for(const mode of ['PracticeMode','PVPMode','EndlessMode']){h.context.IP2Live[mode]={active:true};assert.equal(h.journal.recordAttempt(h.attempt()),0);h.context.IP2Live[mode].active=false;}
    assert.equal(h.journal.recordAttempt(h.attempt([{...wire,correct:true}])),0);
    assert.equal(h.journal.recordAttempt(h.attempt([],{outcome:'cancelled',cancelled:true})),0);
    assert.equal(h.journal.getState(false),null);
    assert.equal(h.journal.recordAttempt(h.attempt([],{outcome:'failed',failureReason:'timeout'})),1);
    assert.match(h.journal.entries()[0].why,/not evidence of a particular calculation error/);
});

test('state survives JSON save/load, acknowledgements persist and campaigns remain isolated',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt());const id=h.journal.entries()[0].id;
    const save=JSON.stringify(h.context.Core.Game.current.ip2liveGameStates);
    h.context.Core.Game.current={_ip2liveProfileId:'student-b',ip2liveGameStates:{}};assert.equal(h.journal.entries().length,0);
    h.context.Core.Game.current={_ip2liveProfileId:'student-a',ip2liveGameStates:JSON.parse(save)};assert.equal(h.journal.entries()[0].id,id);
    h.journal.acknowledge(id);const acknowledged=JSON.parse(JSON.stringify(h.context.Core.Game.current.ip2liveGameStates));
    h.context.Core.Game.current.ip2liveGameStates=acknowledged;assert.equal(h.journal.recordAttempt(h.attempt()),0);assert.equal(h.journal.entries().length,0);
    assert.ok(h.checkpoints.includes('diagnostic_error_acknowledged'));
});

test('real GameManager completion/failure routes feed the journal and keep assessment records intact',()=>{
    const h=harness(), payload={questId:'q1',objectiveId:'o1',mapId:4,result:{telemetrySchemaVersion:2,decisionHistory:[wire,{...wire,correct:true}]}};
    h.gm._openReportAttempt('ip_class_wires',payload);h.gm.handleGameplayCompleted('ip_class_wires',payload);
    assert.equal(h.journal.entries().length,1);const telemetry=h.events.find(e=>e.type==='attempt_end').data;
    assert.equal(telemetry.correctDecisions,1);assert.equal(telemetry.incorrectDecisions,1);
    h.journal.acknowledge(h.journal.entries()[0].id);assert.equal(telemetry.incorrectDecisions,1,'debug is acknowledgement, not a score edit');
    h.gm._openReportAttempt('ip_class_wires',{...payload,objectiveId:'o2'});h.gm.handleGameplayFailed('ip_class_wires',{...payload,objectiveId:'o2',result:{...payload.result,reason:'attempts_exhausted'}});
    assert.equal(h.journal.entries().length,1,'terminal failure does not duplicate its recorded wrong answer');
});

test('return-to-world captures current decisions, deduplicates resume and ignores blank cancellation',()=>{
    const h=harness(), data={questId:'q1',objectiveId:'o1',mapId:4};h.gm._openReportAttempt('ip_class_wires',data);
    const screen={options:{...data,gameplayId:'ip_class_wires'},decisionHistory:[wire]};
    h.context.IP2Live.GameplayPause={activeScreen:screen,releaseActiveScreen(){this.activeScreen=null;},findSession:()=>({})};
    h.gm.handleGameplayCancelled('ip_class_wires',{...data,result:{cancelled:true}});assert.equal(h.journal.entries().length,1);
    h.gm.handleGameplayCompleted('ip_class_wires',{...data,result:{decisionHistory:[wire]}});assert.equal(h.journal.entries().length,1);
});

test('badge placement, sidebar selection, pixel dissolve and empty state follow real journal actions',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt([wire,{...wire,sourceId:'ip-2',submitted:'A'}]));h.journal.updateHUD();
    const ui=h.journal._ui;assert.equal(ui.root.style.top,'182px');assert.equal(ui.badge.textContent,'2');
    ui.trigger.click();assert.equal(h.frames.at(-1),ui.screen);assert.equal(ui.trigger.getAttribute('aria-expanded'),'true');
    assert.equal(ui.rows.size,2);ui.rows.values().next().value.click();assert.match(ui.detail.textContent,/172\.16\.2\.3.*YOU SUBMITTED.*EXPECTED RESULT/s);
    const before=JSON.stringify(h.events);ui.debugButton.click();assert.equal(h.journal.entries().length,1);
    h.advance(200);assert.match([...ui.rows.values()][0].style.maskImage,/linear-gradient/);
    h.advance(600);assert.equal(ui.rows.size,1);assert.equal(ui.badge.textContent,'1');assert.equal(JSON.stringify(h.events),before);
    ui.rows.values().next().value.click();ui.debugButton.click();h.advance(700);assert.match(ui.detail.textContent,/Error memory is clear/);
    ui.closeButton.click();assert.equal(h.frames.length,1);assert.equal(ui.trigger.getAttribute('aria-expanded'),'false');
});

test('opening/closing a hidden HUD cannot repeatedly reset gameplay input; profile switches remove the old view',()=>{
    const h=harness();let resets=0;h.context.IP2Live.InputGuard.reset=()=>resets++;
    h.journal.updateHUD();const first=h.journal._ui;
    h.frames.push({});h.journal.updateHUD();h.journal.updateHUD();assert.equal(resets,0);assert.equal(first.visible,false);
    h.frames.pop();h.journal.updateHUD();first.trigger.click();
    h.context.Core.Game.current={_ip2liveProfileId:'student-b',ip2liveGameStates:{}};h.journal.updateHUD();
    assert.equal(first.root.isConnected,false);assert.equal(first.overlay,null);assert.equal(h.frames.length,1);
});

test('leaving a recap unresolved and Escape closing preserve every mistake',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt());h.journal.updateHUD();const ui=h.journal._ui;
    ui.open();ui.rows.values().next().value.click();ui.leave();assert.equal(h.journal.entries().length,1);assert.equal(ui.selected,null);
    ui.screen.onKeyPressed('Escape');assert.equal(h.frames.length,1);assert.equal(h.journal.entries().length,1);
});

test('achievements anchor below the diagnostic area, including scaled minimap bounds',()=>{
    const h=harness();h.load('modules/achievements.js');h.journal.updateHUD();
    const achievements=h.context.IP2Live.Achievements;achievements.show({id:'test',title:'Network insight'});achievements.update(100000);achievements.update(100500);
    assert.equal(achievements._element.style.top,'258px');
    assert.ok(parseFloat(achievements._element.style.top)>h.journal.getHudBounds().bottom);
    h.context.IP2Live.QuestMinimap._container.getBoundingClientRect=()=>({left:800,right:965,top:40,bottom:300,width:165,height:260});h.journal.updateHUD();achievements.update(100600);
    assert.equal(h.journal._ui.root.style.left,'800px');assert.equal(h.journal._ui.root.style.width,'165px');assert.equal(achievements._element.style.top,'388px');
});

test('new errors and acknowledgement request Story autosave even without a numbered save slot',()=>{
    const h=harness(), saves=[];h.context.IP2Live.StoryAutosave={checkpoint:reason=>{saves.push(reason);return Promise.resolve({saved:true});}};
    h.journal.recordAttempt(h.attempt());h.journal.acknowledge(h.journal.entries()[0].id);
    assert.deepEqual(saves,['diagnostic_errors_logged','diagnostic_error_acknowledged']);
});

test('achievements wait while reading diagnostics and when the space below the badge is too short',()=>{
    const h=harness();h.load('modules/achievements.js');h.journal.updateHUD();const ui=h.journal._ui, awards=h.context.IP2Live.Achievements;
    ui.open();awards.show({title:'Review complete'});awards.update(100000);assert.equal(awards.active,null);assert.equal(awards.queue.length,1);
    ui.close();awards.update(100100);assert.ok(awards.active);
    h.context.window.innerHeight=350;awards.update(100200);assert.equal(awards._element.style.opacity,'0');
    h.context.window.innerHeight=720;awards.update(100300);assert.ok(Number(awards._element.style.opacity)>0);
});

test('an external scene pop closes the sidebar without popping the underlying world',()=>{
    const h=harness();h.journal.updateHUD();const ui=h.journal._ui;ui.open();h.context.Manager.Stack.pop();
    assert.equal(h.frames.length,1);assert.equal(ui.screen,null);assert.equal(ui.overlay,null);
});

test('an in-place profile switch cannot expose another learner’s recaps',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt());h.context.Core.Game.current._ip2liveProfileId='student-b';
    assert.equal(h.journal.entries().length,0);
    assert.equal(h.journal.recordAttempt(h.attempt([wire],{profileId:'student-b',attemptId:'b1'})),1);
    assert.equal(h.journal.getState().profileId,'student-b');assert.equal(h.journal.entries().length,1);
});

test('the actual Story snapshot and restore pipeline retains unresolved recaps and cleared identities',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt([wire,{...wire,sourceId:'ip-2',submitted:'A'}]));
    h.journal.acknowledge(h.journal.entries()[0].id);
    const snapshot=h.gm.buildStoryProgressSnapshot(h.context.Core.Game.current,{slot:1});
    assert.equal(snapshot.gameStates.errorDiagnostics.entries.length,1);
    assert.equal(Object.keys(snapshot.gameStates.errorDiagnostics.seen).length,2);
    h.context.Core.Game.current={infiltratorName:'Student',_ip2liveProfileId:'student-a',currentMapID:4};
    h.gm.restoreProgressFromSnapshot(snapshot,h.context.Core.Game.current,1);
    assert.equal(h.journal.entries().length,1);assert.equal(h.journal.recordAttempt(h.attempt([wire,{...wire,sourceId:'ip-2',submitted:'A'}])),0);
});

test('different IP examples with the same class confusion share one latest recap and repeat count',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt());const first=h.journal.entries()[0].id;
    const next={...wire,sourceText:'150.25.1.2',sourceId:'next-ip'};
    assert.equal(h.journal.recordAttempt(h.attempt([next],{attemptId:'another-attempt'})),0);
    assert.equal(h.journal.entries().length,1);assert.equal(h.journal.entries()[0].id,first);
    assert.equal(h.journal.entries()[0].occurrences,2);assert.match(h.journal.entries()[0].why,/150\.25\.1\.2/);
    h.journal.recordAttempt(h.attempt([next],{attemptId:'another-attempt'}));assert.equal(h.journal.entries()[0].occurrences,2,'callback replay does not inflate counts');
    assert.equal(h.journal.recordAttempt(h.attempt([{...wire,expected:'D',sourceText:'233.49.87.179'}],{attemptId:'different-class'})),1);
    assert.equal(h.journal.entries().length,2,'a different class correction stays separate');
});

test('quest changes delete unpinned logs, retain pins and do not clear on a restart of the same quest',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt([wire,{...wire,submitted:'A'}],{questId:'q1',mapId:4}));
    const pinned=h.journal.entries()[0];h.journal.setPinned(pinned.id,true);
    assert.equal(h.journal.beginQuest('q1',4),0);assert.equal(h.journal.entries().length,2);
    assert.equal(h.journal.beginQuest('q2',4),1);assert.equal(h.journal.entries()[0].id,pinned.id);
    assert.equal(h.journal.entries()[0].pinned,true);assert.ok(h.checkpoints.includes('diagnostic_quest_changed'));
    assert.equal(h.journal.recordAttempt(h.attempt([wire],{questId:'q2',mapId:4,attemptId:'q2-attempt'})),1);
    assert.equal(h.journal.entries().length,2);
    h.journal.setPinned(pinned.id,false);h.journal.beginQuest('q3',4);assert.equal(h.journal.entries().length,0);
});

test('actual QuestManager start/advance clears logs at the quest boundary, not an objective change',()=>{
    const h=harness();h.load('modules/quest_manager.js');const quests=h.context.IP2Live.QuestManager;
    quests.registerQuest({id:'q1',objectives:[{id:'o1'},{id:'o2'}]});quests.registerQuest({id:'q2',objectives:[{id:'o1'}]});
    quests.startQuest('q1',{mapId:4});h.journal.recordAttempt(h.attempt([wire],{questId:'q1',mapId:4}));
    quests.completeObjective('o1');assert.equal(h.journal.entries().length,1);assert.equal(quests.activeQuestId,'q1');
    quests.startQuest('q1',{restart:true,mapId:4});assert.equal(h.journal.entries().length,1);
    quests.startQuest('q2',{mapId:4});assert.equal(h.journal.entries().length,0);
    assert.equal(quests.startQuest('missing',{mapId:4}),false);
});

for (const failedQuest of ['wire.one', 'wire.two']) test(`three wrong IP Wires submissions retain one recap after ${failedQuest === 'wire.one' ? 'first-quest retry' : 'failure rollback'}`,()=>{
    const h=harness();
    h.load('modules/quest_manager.js');h.load('modules/game-state/neural_life_force_manager.js');
    h.load('gameplay/gameplay1/IPWires/ip_wires_core.js');h.load('gameplay/gameplay1/IPWires/ip_wires_gameplay.js');
    const ip=h.context.IP2Live, quests=ip.QuestManager;
    for(const id of ['wire.one','wire.two']) quests.registerQuest({id,objectives:[{id:'repair',neuralGameplayId:'ip_class_wires'}]});
    quests.registerMapQuests(4,['wire.one','wire.two'],{autoStart:false});quests.startQuest(failedQuest,{mapId:4});
    h.context.Common.Platform.ctx={canvas:{width:1280,height:720}};
    const options={questId:failedQuest,objectiveId:'repair',mapId:4,spec:{id:failedQuest,objectiveId:'repair',mapId:4}};
    h.gm._openReportAttempt('ip_class_wires',options);
    const screen=new ip.WiresGameplayScreen({...options,onFailed:result=>ip.GameplayManager._failWireGameplay(options,result)});
    const source=screen.leftItems.find(item=>item.className==='B');source.ip='172.16.2.3';
    h.frames.push(screen);
    for(let submission=0;submission<3;submission++) {
        for(const item of screen.leftItems) screen.connections[item.id]=item.className;
        screen.connections[source.id]='C';screen._evaluateConnections();
        screen.verdictTimer=0;screen._resolveFailedVerdict();
    }
    assert.equal(screen._finished,true);assert.equal(h.frames.at(-1),h.context.Scene.Map.current);
    assert.equal(quests.activeQuestId,'wire.one');assert.equal(ip.NeuralLifeForce.getState().lifeForce,90);
    const completion=h.events.find(event=>event.type==='attempt_end').data;
    assert.equal(completion.outcome,'failed');assert.equal(completion.incorrectDecisions,3);
    assert.equal(completion.neuralRecovery,failedQuest==='wire.one'?'retry-first-quest':'rollback-previous-quest');
    assert.equal(h.journal.entries().length,1,'the failed attempt must remain reviewable in its recovery quest');
    const recap=h.journal.entries()[0];assert.equal(recap.occurrences,3);assert.equal(recap.questId,failedQuest);
    assert.equal(recap.row.submitted,'C');assert.equal(recap.row.expected,'B');assert.equal(recap.row.sourceText,source.ip);
    h.journal.updateHUD();const ui=h.journal._ui;assert.equal(ui.badge.textContent,'1');
    ui.trigger.click();assert.equal(ui.rows.size,1);ui.rows.values().next().value.click();
    assert.match(ui.detail.textContent,/Seen 3 times/);assert.match(ui.detail.textContent,/172\.16\.2\.3.*Class B/s);ui.closeButton.click();
    h.context.Core.Game.current.ip2liveGameStates=JSON.parse(JSON.stringify(h.context.Core.Game.current.ip2liveGameStates));
    h.journal.updateHUD();h.journal.updateHUD();assert.equal(h.journal.entries()[0].occurrences,3,'world refresh and save reload retain the failure recap');
    assert.equal(h.journal.recordAttempt(completion),0,'a mirrored terminal callback cannot inflate the repeated count');
    quests.startQuest('wire.two',{mapId:4});assert.equal(h.journal.entries().length,0,'starting another quest still clears unpinned errors');
    assert.equal(h.journal.recordAttempt(completion),0,'the cleared failed attempt cannot return from a late callback');
});

test('late completion of the previous quest cannot resurrect its expired recaps',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt([wire],{questId:'q1',mapId:4}));h.journal.beginQuest('q2',4);
    assert.equal(h.journal.recordAttempt(h.attempt([{...wire,sourceId:'late-wrong'}],{questId:'q1',mapId:4,attemptId:'late-completion'})),0);
    assert.equal(h.journal.entries().length,0);
    assert.equal(h.journal.recordAttempt(h.attempt([{...wire,sourceId:'new-wrong'}],{questId:'q2',mapId:4,attemptId:'new-attempt'})),1);
    assert.equal(h.journal.entries().length,1);
});

test('only a terminal failure returning to its actual recovery quest can bypass expired-quest cleanup',()=>{
    for(const flags of [{outcome:'passed'},{outcome:'cancelled'},{neuralRecovery:null},{rollbackQuestId:'q3'},
        {mapId:5},{failureReason:'time_expired'},{tutorial:true},{developerTest:true}]) {
        const h=harness();h.context.IP2Live.QuestManager={activeQuestId:'q1',activeMapId:4};
        const attempt=h.attempt([wire],{questId:'q2',mapId:4,outcome:'failed',failureReason:'attempts_exhausted',
            neuralRecovery:'rollback-previous-quest',rollbackQuestId:'q1',...flags});
        assert.equal(h.journal.recordAttempt(attempt),0,JSON.stringify(flags));assert.equal(h.journal.entries().length,0);
    }
    const h=harness();h.context.IP2Live.QuestManager={activeQuestId:'q1',activeMapId:4};
    assert.equal(h.journal.recordAttempt(h.attempt([wire],{questId:'q2',mapId:4,outcome:'failed',failureReason:'hearts_exhausted',
        neuralRecovery:'rollback-previous-quest',rollbackQuestId:'q1'})),1,'heart-based terminal failures also retain their recap');
});

test('old save journals compact duplicate recaps automatically without dropping pins',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt());const state=h.journal.getState(), recent=JSON.parse(JSON.stringify(state.entries[0]));
    const older={...recent,id:'old-observation',sequence:0,pinned:true,row:{...wire,sourceText:'180.2.3.4'}};
    delete state.groupingVersion;state.entries=[recent,older];h.journal.entries();
    assert.equal(state.entries.length,1);assert.equal(state.entries[0].occurrences,2);assert.equal(state.entries[0].pinned,true);
    assert.equal(state.entries[0].id,recent.id);assert.match(state.entries[0].why,/172\.16\.2\.3/);
});

test('sidebar pin control updates its selected row, groups pins first and survives save/restore',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt([wire,{...wire,submitted:'A'}],{questId:'q1',mapId:4}));h.journal.updateHUD();const ui=h.journal._ui;
    ui.open();const oldest=h.journal.entries()[1];ui.rows.get(oldest.id).click();ui.pinButton.click();
    assert.equal(ui.pinButton.getAttribute('aria-pressed'),'true');assert.match(ui.pinButton.textContent,/Pinned/);
    assert.equal(ui.rows.keys().next().value,oldest.id,'pinned entry moves into the first group');
    assert.match(ui.list.textContent,/PINNED/);
    const snapshot=h.gm.buildStoryProgressSnapshot(h.context.Core.Game.current,{slot:1});
    h.gm.restoreProgressFromSnapshot(snapshot,h.context.Core.Game.current,1);h.journal.beginQuest('q2',4);
    assert.equal(h.journal.entries().length,1);assert.equal(h.journal.entries()[0].pinned,true);
});

test('pinned mistakes merge across quests and retain their pin with the newest example',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt([wire],{questId:'q1',mapId:4}));const id=h.journal.entries()[0].id;h.journal.setPinned(id,true);
    h.journal.beginQuest('q2',4);assert.equal(h.journal.recordAttempt(h.attempt([{...wire,sourceText:'188.2.3.4'}],{questId:'q2',mapId:4,attemptId:'next'})),0);
    assert.equal(h.journal.entries().length,1);assert.equal(h.journal.entries()[0].pinned,true);assert.equal(h.journal.entries()[0].occurrences,2);
    assert.equal(h.journal.entries()[0].questId,'q2');assert.match(h.journal.entries()[0].why,/188\.2\.3\.4/);
});

test('quest cleanup respects mode isolation, map identity and restore into the same quest',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt([wire],{questId:'q1',mapId:4}));
    for(const mode of ['PracticeMode','PVPMode','EndlessMode']){h.context.IP2Live[mode]={active:true};assert.equal(h.journal.beginQuest('q2',4),0);h.context.IP2Live[mode].active=false;}
    assert.equal(h.journal.entries().length,1);const saved=JSON.parse(JSON.stringify(h.context.Core.Game.current.ip2liveGameStates));
    h.context.Core.Game.current.ip2liveGameStates=saved;assert.equal(h.journal.beginQuest('q1',4),0);assert.equal(h.journal.entries().length,1);
    assert.equal(h.journal.beginQuest('q1',5),1);assert.equal(h.journal.entries().length,0);
});

test('quest cleanup updates an open sidebar and removes its stale selection and toast',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt([wire],{questId:'q1',mapId:4}));h.journal.updateHUD();const ui=h.journal._ui;
    ui.open();ui.rows.values().next().value.click();h.journal.beginQuest('q2',4);
    assert.equal(ui.rows.size,0);assert.equal(ui.selected,null);assert.equal(ui.badge.textContent,'0');
    assert.match(ui.detail.textContent,/Error memory is clear/);assert.equal(h.journal._pendingCount,0);
});

test('an unpinned error from an older quest clears on the next quest change, even when revisiting its original quest',()=>{
    const h=harness();h.journal.recordAttempt(h.attempt([wire],{questId:'q1',mapId:4}));const id=h.journal.entries()[0].id;
    h.journal.setPinned(id,true);h.journal.beginQuest('q2',4);h.journal.setPinned(id,false);
    assert.equal(h.journal.entries().length,1);assert.equal(h.journal.beginQuest('q1',4),1);assert.equal(h.journal.entries().length,0);
});
