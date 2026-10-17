const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
const git=(...args)=>cp.spawnSync('git',args,{cwd:root,encoding:'utf8'});
const examples=[
 ['7819666','Plugins/IP2Live_Core/modules/practice_mode.js',['configureScreen(screen)','isUnlocked(id)']],
 ['61de0bb','Plugins/IP2Live_Core/modules/screens/gameplay-pause.js',['captureScreen','STORAGE_KEY']],
 ['efd11ba','Plugins/IP2Live_Core/gameplay/gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js',['Subnet Blaster','defaults:','waves(problem)']],
 ['d4b87d2','Plugins/IP2Live_Core/gameplay/gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js',['_submitSegmentation','borrow_bits']],
 ['86c103b','Plugins/IP2Live_Core/modules/game-state/neural_life_force_manager.js',['handleTerminalFailure','lifeForce','_rollbackToPreviousQuest']],
 ['a434e7f','Plugins/IP2Live_Core/modules/pvp_mode.js',['startAI','startLan','active:']],
];
const history=examples.map(([commit,file,terms])=>{
 const previous=git('show',commit+'^:'+file),current=git('show',commit+':'+file);
 const extract=r=>r.status===0?r.stdout.split(/\r?\n/).map((text,i)=>({line:i+1,text:text.trim()})).filter(row=>terms.some(term=>row.text.includes(term))).slice(0,18):[];
 return {commit,description:git('show','-s','--format=%h %cs %s',commit).stdout.trim(),file,previousFileExists:previous.status===0,currentFileExists:current.status===0,
 previous:extract(previous),atCommit:extract(current),note:'Selected historical source comparison; does not establish the date of MVP validation or an approved MVP baseline.'};
});
const ctx=vm.createContext({IP2Live:{},window:{},console:{log(){}}});
for(const file of ['ip_cidr_tools.js','ip_class_ranges.js'])vm.runInContext(fs.readFileSync(path.join(root,'Plugins/IP2Live_Core/gameplay/common',file),'utf8'),ctx);
const tools=ctx.IP2Live.CIDRTools, ranges=ctx.IP2Live.IPClassRanges;
const probes=[
 {function:'CIDRTools.ipToInt',input:'1..2.3',actual:tools.ipToInt('1..2.3'),formatted:tools.intToIp(tools.ipToInt('1..2.3'))},
 {function:'CIDRTools.parseCIDR',input:'192.168.1.0/',actual:tools.parseCIDR('192.168.1.0/')},
 {function:'CIDRTools.ipToInt',input:'256.0.0.1',actual:tools.ipToInt('256.0.0.1')},
 {function:'IPClassRanges.classifyAddress',input:'172.invalid',actual:ranges.classifyAddress('172.invalid')},
 {function:'CIDRTools.usableHosts',input:31,actual:tools.usableHosts(31)},
 {function:'CIDRTools.usableHosts',input:32,actual:tools.usableHosts(32)},
];
fs.writeFileSync(path.join(__dirname,'history-and-boundaries.json'),JSON.stringify({history,probes,
 note:'Read-only isolated VM probes, not approved acceptance tests. Permissive parsing is confirmed; exposure through controlled gameplay widgets requires separate investigation.'},null,2));
console.log(JSON.stringify({history:history.map(({commit,file,previousFileExists,currentFileExists})=>({commit,file,previousFileExists,currentFileExists})),probes},null,2));
