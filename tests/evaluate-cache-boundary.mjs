import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const [baseline,candidate,tools,output]=process.argv.slice(2).map(p=>resolve(p));
const fw=await import(resolve(tools,'node_modules/@metaharness/flywheel/dist/index.js'));
const rev=root=>{const r=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();};
const old=rev(baseline),head=rev(candidate),gates=JSON.parse(readFileSync(new URL('./cache-boundary-gates.json',import.meta.url)));
const lock=readFileSync(resolve(baseline,'package-lock.json'));
if(!lock.equals(readFileSync(resolve(candidate,'package-lock.json'))))throw Error('Dependency graph changed');
const probe=resolve(candidate,'tests/service/probe-cache-boundary.mjs');
const observations=[],trials=[];
function run(root){const start=performance.now();const r=spawnSync(process.execPath,['--import','tsx',probe,root],{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:2000000});if(r.status!==0)throw Error(r.stderr||'Native probe unavailable');const p=JSON.parse(r.stdout);if(p.holdout.length!==6||p.anchor.length!==8)throw Error('Frozen suite changed');return {...p,ms:performance.now()-start};}
for(let i=0;i<5;i++)for(const root of i%2?[candidate,baseline]:[baseline,candidate])trials.push({trial:i,revision:rev(root),...run(root)});
const parent=readFileSync(resolve(baseline,'src/phase2/cache.ts'),'utf8');
const result=await fw.runFlywheelGenerations({rootPolicy:{revision:old},mutationTargets:['revision'],maxGenerations:1,
 holdout:{id:'cache-boundary-holdout',items:Array.from({length:6},(_,i)=>i)},anchor:{id:'cache-boundary-anchor',items:Array.from({length:8},(_,i)=>i)},
 proposer:async()=>({value:head,summary:'Bound empty-key eviction and replacement writes; check helper categories',inverse:{path:'src/phase2/cache.ts',parentBytes:parent,hash:createHash('sha256').update(parent).digest('hex')}}),
 evaluator:async(policy,suite)=>{const r=run(policy.revision===old?baseline:candidate);observations.push({revision:policy.revision,suite:suite.id,...r});const bits=suite.id==='cache-boundary-holdout'?r.holdout:r.anchor;return {primary:bits.filter(Boolean).length/bits.length,noopRate:0,costPerWin:0,regressed:!r.anchor.every(Boolean)||!Object.values(gates.required).every(v=>v===true)};},
 signer:fw.makeSigner(),promotionRule:fw.meetsPromotionRule,dataSource:'LIVE',now:g=>`2026-11-04-pm-generation-${g}`});
const replay=fw.verifyReplayBundle(result.replayBundle,{pinnedGateFingerprint:fw.gateFingerprint(fw.meetsPromotionRule),promotionRule:fw.meetsPromotionRule});
const benchmark=Object.fromEntries([old,head].map(revision=>{const rows=trials.filter(x=>x.revision===revision);return[revision,{medianMs:rows.map(x=>x.ms).sort((a,b)=>a-b)[2],holdouts:rows.flatMap(x=>x.holdout).filter(Boolean).length,anchors:rows.flatMap(x=>x.anchor).filter(Boolean).length}]}));
writeFileSync(output,JSON.stringify({scope:'Actual in-process cache with real timers and isolated node processes. Full acceptance fail-closed. Neutral cost axes are unmeasured. No speedup claim.',old,head,lockSha256:createHash('sha256').update(lock).digest('hex'),gates,observations,trials,benchmark,replay,bundle:result.replayBundle},null,2)+'\n');
console.log(JSON.stringify({benchmark,replay,verifiedImprovements:result.replayBundle.verified_improvements}));if(!replay.pass)process.exitCode=1;
