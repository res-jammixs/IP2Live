const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
const context=vm.createContext({IP2Live:{},window:{},Core:{Game:{current:null}},Common:{Platform:{}},Data:{},Manager:{Stack:{}},
    Scene:{Map:class{},Base:class{}},Graphic:{},Model:{},Main:{},THREE:{},inject(){},console:{log(){},warn(){},error(){}},setTimeout,clearTimeout});
for(const file of ['gameplay/common/gameplay_definition.js','modules/game_manager.js'])vm.runInContext(fs.readFileSync(path.join(root,'Plugins/IP2Live_Core',file),'utf8'),context,{filename:file});
const gm=context.IP2Live.GameManager,assignments=gm.getAllGameplayAssignments();
const maps=Object.values(gm.flowConfig.maps).map(map=>{const rows=assignments.filter(a=>Number(a.mapId)===Number(map.id));return {mapId:map.id,stage:map.stage||0,level:map.level||0,name:map.name,
    combinedEnabled:map.combinedGameplayEnabled===true,questCount:new Set(rows.map(a=>a.id)).size,objectiveCount:rows.length,
    gameplays:[...new Set(rows.map(a=>a.gameplayId))],tutorialObjectives:rows.filter(a=>a.tutorial||a.harderIntro).map(a=>a.objectiveId)};});
fs.writeFileSync(path.join(__dirname,'curriculum.json'),JSON.stringify({source:'GameManager.getAllGameplayAssignments() evaluated in an isolated VM; configuration only, not a campaign playthrough.',maps,assignments,catalog:gm.gameplayCatalog},null,2));
console.log(JSON.stringify(maps,null,2));
