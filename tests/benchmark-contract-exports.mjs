import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const [base,head]=process.argv.slice(2).map(x=>resolve(x)),trials=[];
for(let i=0;i<5;i++)for(const[label,repo]of(i%2?[['candidate',head],['baseline',base]]:[['baseline',base],['candidate',head]])){
 const start=process.hrtime.bigint(),r=spawnSync(process.execPath,['--import','tsx','tests/service/verify-contract-exports.mjs','.'],{cwd:repo,encoding:'utf8',timeout:20000});
 if(r.error||r.signal)throw r.error||Error(r.signal);const p=JSON.parse(r.stdout);trials.push({trial:i,label,exit:r.status,elapsedMs:Number(process.hrtime.bigint()-start)/1e6,holdout:p.holdout.filter(x=>x.passed).length,anchors:p.anchors.filter(x=>x.passed).length});
}
console.log(JSON.stringify({trials,note:'Alternating fresh-process native module correctness/stability, not an SDK-generation throughput or model benchmark.'}));
