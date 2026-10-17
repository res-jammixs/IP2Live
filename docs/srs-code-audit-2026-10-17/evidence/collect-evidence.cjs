const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const out = __dirname;
const walk = dir => fs.readdirSync(path.join(root, dir), {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name).replaceAll('\\','/')]);
const sourcePaths = [...walk('Plugins'), ...walk('Scripts'), ...walk('deployment'), ...walk('tools'), ...walk('tests'),
    ...fs.readdirSync(root).filter(f=>/\.(json|md)$/.test(f)), ...walk('docs').filter(f=>!f.includes('/srs-code-audit-2026-10-17/'))]
    .filter(f=>/\.(js|cjs|mjs|json|md|ps1|html|css)$/.test(f) && !f.includes('/fixtures/legacy-project-saves/'));
const manifest = [...new Set(sourcePaths)].sort().map(file=>({path:file,bytes:fs.statSync(path.join(root,file)).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}));
const git = args => cp.execFileSync('git', args, {cwd:root,encoding:'utf8'}).trim();
const version = {capturedAtUTC:new Date().toISOString(),head:git(['rev-parse','HEAD']),branch:git(['branch','--show-current']),
    dirty:true,description:git(['log','-1','--date=iso-strict','--format=%h %ad %s']),node:process.version,
    status:git(['status','--porcelain=v1']).split(/\r?\n/).filter(line=>!line.includes('srs-code-audit-2026-10-17/')),
    scope:'Local working tree. No deployed URL or release artifact inspected. Asset binaries and personal save fixture contents are excluded.'};
fs.writeFileSync(path.join(out,'source-manifest.json'),JSON.stringify({version,files:manifest},null,2));
const symbols=[];
for(const item of manifest.filter(item=>item.path.startsWith('Plugins/')&&/\.js$/.test(item.path))) {
    const lines=fs.readFileSync(path.join(root,item.path),'utf8').split(/\r?\n/);
    for(let i=0;i<lines.length;i++) if(/^\s*(?:async\s+)?[A-Za-z_$][\w$]*\s*\([^;]*\)\s*\{|^\s*class\s+|VERSION\s*[:=]/.test(lines[i]))
        symbols.push({file:item.path,line:i+1,declaration:lines[i].trim()});
}
fs.writeFileSync(path.join(out,'source-symbols.json'),JSON.stringify(symbols,null,2));
const tests=walk('tests').filter(f=>/\.test\.(cjs|mjs)$/.test(f)).sort();
const execution=cp.spawnSync(process.execPath,['--test',...tests],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,timeout:120000});
const log=(execution.stdout||'')+(execution.stderr||'');
fs.writeFileSync(path.join(out,'automated-tests.log'),log);
const cases=log.split(/\r?\n/).filter(line=>/^(?:✔|✖|ok |not ok )/.test(line));
const summary={startedVersion:version.head,workingTreeManifest:'source-manifest.json',executedAtUTC:new Date().toISOString(),command:'node --test '+tests.join(' '),
    exitCode:execution.status,error:execution.error&&execution.error.message,files:tests.length,cases,
    totals:log.split(/\r?\n/).filter(line=>/^(?:ℹ|#) (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)/.test(line))};
fs.writeFileSync(path.join(out,'test-execution.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({head:version.head,manifestFiles:manifest.length,testFiles:tests.length,exitCode:execution.status,totals:summary.totals,failing:cases.filter(line=>/^(?:✖|not ok )/.test(line))},null,2));
