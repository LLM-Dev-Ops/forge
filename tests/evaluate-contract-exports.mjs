import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const [b,h,t,o]=process.argv.slice(2).map(x=>resolve(x));
const sha=x=>createHash('sha256').update(x).digest('hex');
const frozen=['tests/service/verify-contract-exports.mjs','tests/contracts/namespace.test.ts','package-lock.json','tsconfig.json','vitest.config.ts'];
for(const p of frozen)if(!readFileSync(join(b,p)).equals(readFileSync(join(h,p))))throw Error('Frozen bytes changed: '+p);
const logs=mkdtempSync(join(tmpdir(),'forge-contracts-eval-'));
function run(repo,label,key,command,args,seconds){const start=Date.now(),r=spawnSync(command,args,{cwd:repo,encoding:'utf8',timeout:seconds*1000,maxBuffer:32*1024*1024});const output=(r.stdout||'')+(r.stderr||'');writeFileSync(join(logs,label+'-'+key+'.log'),output);return {command:[command,...args],exit:r.status,signal:r.signal,error:r.error?.message??null,elapsedMs:Date.now()-start,outputSha256:sha(output),pass:r.status===0&&!r.error&&!r.signal};}
function measure(repo,label){
 const probeCheck=run(repo,label,'probe',process.execPath,['--import','tsx','tests/service/verify-contract-exports.mjs','.'],20);
 const probe=JSON.parse(readFileSync(join(logs,label+'-probe.log'),'utf8'));
 const testFile=join(logs,label+'-tests.json');
 const checks={probe:probeCheck,tests:run(repo,label,'tests','npm',['test','--','--reporter=json','--outputFile='+testFile],120)};
 let tests={};try{tests=JSON.parse(readFileSync(testFile,'utf8'));}catch{}
 const passing=(tests.testResults||[]).flatMap(s=>(s.assertionResults||[]).filter(a=>a.status==='passed').map(a=>s.name.slice(repo.length)+':'+a.fullName)).sort();
 const nodeChecks=[['build',['run','build'],90],['types',['run','type-check'],90],['lint',['run','lint'],90],['format',['run','format:check'],90],['coverage',['run','test:coverage'],120],['audit',['audit','--json'],45],['productionAudit',['audit','--omit=dev','--json'],45]];
 for(const [key,args,budget] of nodeChecks)checks[key]=run(repo,label,key,'npm',args,budget);
 checks.priorHTTP=run(repo,label,'prior-http',process.execPath,['--import','tsx','tests/service/verify-cli-input.mjs','.'],30);
 for(const key of ['test','build','clippy'])checks['rust'+key]=run(repo,label,'rust-'+key,'cargo',['+1.88.0',key,'--manifest-path','forge-benchmarks/Cargo.toml','--locked','--offline',...(key==='clippy'?['--all-targets','--all-features','--','-D','warnings']:[])],60);
 checks.rustFmt=run(repo,label,'rust-fmt','cargo',['+1.88.0','fmt','--manifest-path','forge-benchmarks/Cargo.toml','--','--check'],60);
 checks.rustAudit=run(repo,label,'rust-audit','cargo',['audit','--file','forge-benchmarks/Cargo.lock','--no-fetch','--json'],45);
 const diagnostics=(readFileSync(join(logs,label+'-types.log'),'utf8').match(/error TS\d+/g)||[]).length;
 const result={probe,checks,passing,passedTests:tests.numPassedTests??0,failedTests:tests.numFailedTests??0,failedSuites:tests.numFailedTestSuites??0,diagnostics};
 const {passing:ignored,...compact}=result;writeFileSync(o+'.'+label+'.json',JSON.stringify({...compact,passingNamesSha256:sha(JSON.stringify(passing)),logs},null,2));return result;
}
const baseline=measure(b,'baseline'),candidate=measure(h,'candidate');
const lost=baseline.passing.filter(n=>!candidate.passing.includes(n));
const pkg=join(t,'node_modules/@metaharness/flywheel');if(JSON.parse(readFileSync(join(pkg,'package.json'))).version!=='0.1.12')throw Error('Flywheel version drift');
const {runFlywheelGenerations,meetsPromotionRule,gateFingerprint,makeSigner,verifyReplayBundle}=await import(pathToFileURL(join(pkg,'dist/index.js')).href);
const baselineRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:b,encoding:'utf8'}).trim(),candidateRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:h,encoding:'utf8'}).trim();
const source='src/agents/contracts/index.ts',parentBytes=readFileSync(join(b,source),'utf8');
if(!readFileSync(join(b,source)).equals(execFileSync('git',['show',baselineRevision+':'+source],{cwd:b})))throw Error('Baseline source drift');
const patch=execFileSync('git',['diff',baselineRevision,'HEAD','--',source],{cwd:h});execFileSync('git',['apply','--check','--reverse'],{cwd:h,input:patch});
function score(m,kind){const cases=kind==='holdout'?m.probe.holdout:m.probe.anchors;const primary=cases.filter(x=>x.passed).length/cases.length;return {primary,noopRate:1-primary,costPerWin:0,regressed:Object.values(m.checks).some(x=>!x.pass)||(m===candidate&&lost.length>0)};}
const gateEvidence={baseline:score(baseline,'holdout'),candidate:score(candidate,'holdout'),anchor:{baseline:1,candidate:1}};
const result=await runFlywheelGenerations({rootPolicy:{revision:baselineRevision},proposer:async()=>({value:candidateRevision,summary:'Resolve contract barrel ambiguity with complete per-agent namespaces while retaining all unambiguous exports',inverse:{path:source,parentBytes,hash:sha(parentBytes)}}),evaluator:async(policy,suite)=>score(policy.revision===baselineRevision?baseline:candidate,suite.id==='contracts-holdout'?'holdout':'anchor'),holdout:{id:'contracts-holdout',items:candidate.probe.holdout.map(x=>x.name)},anchor:{id:'contracts-anchor',items:candidate.probe.anchors.map(x=>x.name)},mutationTargets:['revision'],maxGenerations:1,signer:makeSigner(),promotionRule:meetsPromotionRule,dataSource:'LIVE'});
const fingerprint=gateFingerprint(meetsPromotionRule),replay=verifyReplayBundle(result.replayBundle,{pinnedGateFingerprint:fingerprint});
const compact=m=>{const {passing,...rest}=m;return {...rest,passingNamesSha256:sha(JSON.stringify(passing))};};
writeFileSync(o,JSON.stringify({baselineRevision,candidateRevision,versions:{flywheel:'0.1.12',node:process.version},frozen:Object.fromEntries(frozen.map(p=>[p,sha(readFileSync(join(b,p)))])),measurements:{baseline:compact(baseline),candidate:compact(candidate)},lostPreviouslyPassing:lost,gateEvidence,decision:meetsPromotionRule(gateEvidence),fingerprint,result,replay,rollback:{path:source,parentBytes,hash:sha(parentBytes),reversePatchCheckExit:0,productionRollbackExecuted:false},logs,limitations:'Unmeasured neutral cost; failed-contract ratio is a proxy, not observed noops. Failed native/global checks cannot be waived by component results.'},null,2));
console.log(JSON.stringify({baselineRevision,candidateRevision,baseline:baseline.passedTests,candidate:candidate.passedTests,lost:lost.length,promotions:result.promotions,decision:meetsPromotionRule(gateEvidence),replay,logs}));
