import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {Phase2Cache,CACHE_CONFIG}=await import(pathToFileURL(resolve(process.argv[2],'src/phase2/cache.ts')));
const make=()=>new Phase2Cache();
const caches=[];
const own=()=>{const c=make();caches.push(c);return c;};
try {
 const c=own();c.set('', 'oldest', 'historical_read');
 for(let i=1;i<CACHE_CONFIG.MAX_ENTRIES;i++)c.set(`k${i}`,i,'historical_read');
 c.set('overflow1',1,'historical_read');
 const emptyEvicted=!c.has('');
 c.set('overflow2',2,'historical_read');
 const bounded=c.getStats().entries===CACHE_CONFIG.MAX_ENTRIES;
 const replacement=own();for(let i=0;i<CACHE_CONFIG.MAX_ENTRIES;i++)replacement.set(`r${i}`,i,'historical_read');
 replacement.set(`r${CACHE_CONFIG.MAX_ENTRIES-1}`,'updated','historical_read');
 const history=own();history.set('shared','lineage','lineage_lookup');
 const lineage=own();lineage.set('shared','historical','historical_read');
 const holdout=[emptyEvicted,bounded,replacement.has('r0'),replacement.getStats().entries===CACHE_CONFIG.MAX_ENTRIES,
  await history.getOrFetchHistorical('shared',async()=>'expected-history')==='expected-history',
  await lineage.getOrFetchLineage('shared',async()=>'expected-lineage')==='expected-lineage'];
 const a=own();a.set('key',42,'historical_read');
 let calls=0;const memo=own();const fetch=async()=>{calls++;return 'memo';};
 const first=await memo.getOrFetchHistorical('memo',fetch),second=await memo.getOrFetchHistorical('memo',fetch);
 const anchor=[a.get('key')===42,a.has('key'),a.getByCategory('historical_read').length===1,a.getByCategory('lineage_lookup').length===0,
  replacement.get(`r${CACHE_CONFIG.MAX_ENTRIES-1}`)==='updated',first==='memo'&&second==='memo'&&calls===1,a.delete('key')&&!a.has('key'),(a.set('x',1,'lineage_lookup'),a.clear(),a.getStats().entries===0)];
 console.log(JSON.stringify({holdout,anchor}));
 if(process.argv.includes('--assert')&&![...holdout,...anchor].every(Boolean))process.exitCode=1;
} finally {for(const c of caches)c.stopCleanup();}
