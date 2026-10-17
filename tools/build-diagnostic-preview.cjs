/** Build a self-contained preview using the actual journal, explanations and UI. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = [
    'gameplay/common/ip_class_ranges.js', 'gameplay/common/gameplay_diagnostic.js',
    'gameplay/gameplay1/IPWires/ip_wires_diagnostic.js','gameplay/gameplay2/IPPatchPanel/ip_patchpanel_diagnostic.js',
    'gameplay/gameplay3/CIDRPanel/ip_cidrpanel_diagnostic.js','gameplay/gameplay4/SubnetSimulator/ip_subnetsim_diagnostic.js',
    'gameplay/gameplay4_5/HostPowerReactor/ip_host_power_diagnostic.js','gameplay/gameplay5/CIDRQuarantine/ip_cidr_quarantine_diagnostic.js',
    'gameplay/gameplay6/CIDRQuarantineMatrix/ip_subnet_blaster_diagnostic.js','gameplay/gameplay7/NetworkRepair/network_repair_diagnostic.js',
    'gameplay/gameplay8/VLSMAllocator/ip_vlsm_allocator_diagnostic.js','modules/error_diagnostics.js',
    'modules/screens/error-diagnostics.js','modules/achievements.js',
];
const scripts = files.map(file => 'new Function("IP2Live","Common","Core","Data","Manager","Scene",' +
    JSON.stringify(fs.readFileSync(path.join(root,'Plugins/IP2Live_Core',file),'utf8')).replace(/<\/script/gi,'<\\/script') + ')(IP2Live,Common,Core,Data,Manager,Scene);').join('\n');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IP2Live · Story Error Diagnostics Preview</title>
<style>
@font-face{font-family:Oxanium-Medium;src:url('../../Fonts/Oxanium-Medium.ttf')}
*{box-sizing:border-box}body{margin:0;min-height:100vh;overflow:hidden;background:radial-gradient(ellipse at 40% 70%,#14353b44,transparent 50%),repeating-linear-gradient(90deg,#0d202830 0 1px,transparent 1px 90px),repeating-linear-gradient(0deg,#0d202830 0 1px,transparent 1px 90px),#060c12;color:#cde3eb;font-family:Oxanium-Medium,sans-serif}
.world{position:absolute;inset:35% 20% 0;perspective:600px;overflow:hidden}.floor{position:absolute;inset:0;background:repeating-linear-gradient(90deg,#22434630 0 2px,transparent 2px 60px),repeating-linear-gradient(0deg,#22434630 0 2px,transparent 2px 60px);transform:rotateX(55deg)scale(2);transform-origin:center top}.hero{position:absolute;left:50%;top:30%;width:28px;height:40px;background:linear-gradient(#c3a886 0 30%,#4c8186 30% 70%,#2b4c58 70%);box-shadow:0 0 55px #7ff5e029;image-rendering:pixelated}
.quest{position:absolute;top:100px;left:24px;max-width:430px;width:32vw;border-left:3px solid #ef537d;padding:23px;background:repeating-linear-gradient(120deg,#ff6b9006 0 1px,transparent 1px 9px),linear-gradient(120deg,#251824,#101b27);clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}.quest small{color:#ed7b9f;letter-spacing:2px;font-size:11px}.quest h2{font-size:18px;font-weight:500;margin:15px 0 10px}.quest p{font-size:11px;color:#94afbf;line-height:1.7}
.map{position:fixed;right:20px;top:60px;width:240px;padding:12px;background:linear-gradient(145deg,#142634,#09141e);border:1px solid #49657480;border-radius:14px}.map-head{font-size:10px;display:flex;justify-content:space-between;color:#a1c4d2;letter-spacing:.6px;margin-bottom:12px}.grid{position:relative;height:205px;background:repeating-linear-gradient(90deg,#25677918 0 1px,transparent 1px 12px),repeating-linear-gradient(0deg,#25677918 0 1px,transparent 1px 12px),#091722;border:1px solid #24445460;border-radius:7px}.dot{position:absolute;width:8px;height:8px;border:1px solid #ef7796;background:#b73b5c;border-radius:50%;box-shadow:0 0 0 4px #f1507818}.player{position:absolute;left:23%;top:62%;width:9px;height:12px;background:#92f6ff;clip-path:polygon(50% 0,100% 100%,50% 75%,0 100%);filter:drop-shadow(0 0 6px #40e6ff)}.map-foot{font-size:10px;margin-top:12px;display:flex;justify-content:space-between;color:#75bfd0}
.preview{position:absolute;bottom:18px;left:24px;font-size:11px;max-width:430px;color:#7e9eac;line-height:1.8}.preview button{font:inherit;border:1px solid #54798680;border-radius:6px;background:#142934;color:#c2e4e8;padding:8px 12px;margin:8px 8px 0 0;cursor:pointer}.label{position:absolute;top:24px;left:24px;letter-spacing:2px;font-size:11px;color:#8bb6c0}@media(max-width:740px){.quest{width:43vw;left:12px;padding:15px}.map{width:180px;right:12px}.grid{height:155px}.preview{max-width:50vw}.map-head{font-size:8px}.quest h2{font-size:14px}}
</style></head><body><div class="label">NEURAL DECK / STORY MODE</div><div class="world"><div class="floor"></div><div class="hero"></div></div><section class="quest"><small>QUEST AREA / REQUIRED</small><h2>REPAIR THE BRANCH NETWORK</h2><p>Review your previous mistakes, then return to the terminal and try again.</p></section><div class="map"><div class="map-head"><b>QUEST MAP</b><span>STAGE 4 · LEVEL 3</span></div><div class="grid"><i class="dot" style="left:32%;top:22%"></i><i class="dot" style="left:70%;top:65%"></i><i class="dot" style="left:65%;top:40%"></i><i class="player"></i></div><div class="map-foot"><span>X:6 Z:17</span><span>QUESTS 3/7</span></div></div><div class="preview">LOCAL UI PREVIEW · Simulated world and example decisions.<br>Repeated errors share one recap. Pin one, then try the next quest.<br><button id="add">Log another mistake</button><button id="next">Start next quest</button><button id="award">Show achievement</button></div>
<script>
const IP2Live={},Common={},Core={Game:{current:{_ip2liveProfileId:'preview',currentMapID:18,ip2liveGameStates:{}}}},Data={Keyboards:{checkCancelMenu:key=>key==='Escape'}};
const stack=[],Manager={Stack:{get top(){return stack.at(-1)},push:s=>stack.push(s),pop:()=>stack.pop()}};
class MapScene{draw3D(){}drawHUD(){}};const Scene={Base:class{},Map:MapScene};Scene.Map.current=new MapScene();stack.push(Scene.Map.current);
IP2Live.GameManager={_queueCheckpoint(){}};IP2Live.InputGuard={reset(){}};IP2Live.QuestMinimap={_container:document.querySelector('.map'),_shouldHide:()=>false};
IP2Live.QuestManager={activeQuestId:'preview-quest-1',activeMapId:18};
${scripts}
let attemptNumber=0,questNumber=1;
function record(gameplayId,row){IP2Live.ErrorDiagnostics.recordAttempt({gameplayId,attemptId:'preview-'+(++attemptNumber),profileId:'preview',questId:IP2Live.QuestManager.activeQuestId,mapId:18,stageId:4,levelId:3,outcome:'passed',payload:{result:{decisionHistory:[{...row,correct:false}]}}});}
record('ip_class_wires',{stepKey:'ip_classification',sourceText:'172.16.2.3',sourceId:'wire-1',submitted:'C',expected:'B'});
record('ip_patch_panel_classes',{stepKey:'mask_classification',sourceText:'255.255.0.0',submitted:'A',expected:'B'});
record('ip_cidr_binary_panel',{stepKey:'cidr_prefix',submitted:24,expected:16,targetMask:'255.255.0.0'});
record('ip_host_power_reactor',{stepKey:'minimum_host_bits',submitted:5,expected:6,requiredHosts:31,issueType:'insufficient_host_capacity'});
record('ip_vlsm_allocator',{stepKey:'vlsm_overlap_check',submitted:'172.30.32.0/24',expected:{optimalPrefix:24,parentCIDR:'172.30.32.0/20',nonOverlapping:true},issueType:'overlap',detail:'This subnet collides with HQ.',hint:'Move to the next aligned block outside the existing HQ allocation.'});
document.querySelector('#add').onclick=()=>record('ip_class_wires',{stepKey:'ip_classification',sourceText:'192.168.3.10',submitted:'B',expected:'C'});
document.querySelector('#next').onclick=()=>{IP2Live.QuestManager.activeQuestId='preview-quest-'+(++questNumber);IP2Live.ErrorDiagnostics.beginQuest(IP2Live.QuestManager.activeQuestId,18);document.querySelector('.quest h2').textContent='BRANCH REPAIR / QUEST '+questNumber;};
document.querySelector('#award').onclick=()=>IP2Live.Achievements.show({title:'Network Insight',description:'You reviewed a subnetting mistake.',id:'preview-'+Date.now()});
function tick(){IP2Live.ErrorDiagnostics.updateHUD();if(Manager.Stack.top!==Scene.Map.current&&Manager.Stack.top.update)Manager.Stack.top.update();requestAnimationFrame(tick);}tick();
const params=new URLSearchParams(location.search);if(params.has('panel')){IP2Live.ErrorDiagnostics._ui.open();if(params.has('detail')){const ui=IP2Live.ErrorDiagnostics._ui;ui.selected=IP2Live.ErrorDiagnostics.entries()[0].id;ui.renderList();ui.renderDetail();}}
document.body.dataset.previewState='ready';
</script></body></html>`;
const output = path.join(root,'tests/fixtures/error_diagnostics_preview.html');
fs.writeFileSync(output,html);
console.log(output);
