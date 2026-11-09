// Targeted code/controller audit, not automatic map qualification or a human clear.
// All storage is the loader's fake storage or explicitly isolated MemoryAdapters.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {loadEditor,ROOT,makeCanvas} from '../../tools/loader.mjs';
const RA=loadEditor(),LD=RA.LevelData,records=[];
RA.Assets=class{loadAll(cb){cb();}frames(){return {};}image(){return null;}};
RA.SoundBank=class{resume(){}};
const e=new RA.Editor(makeCanvas());RA.editor=e;
const html=readFileSync(join(ROOT,'editor.html'),'utf8');
const themeTag=html.match(/<button[^>]*id="btn-theme"[^>]*>/)[0];
const inline=themeTag.match(/onclick="([^"]+)"/)[1];
e.theme='light';document.body.dataset.theme='light';e.dirty=false;
localStorage.setItem('ra_editor_preferences_v1',JSON.stringify({schemaVersion:1,theme:'light',autoGrow:false}));
const hashBefore=LD.hashSync(e.model.toData()),themeButton=document.getElementById('btn-theme');
let toggles=0;const original=e.toggleTheme;e.toggleTheme=function(){toggles++;return original.call(this);};
// Emulate the two callbacks registered by actual HTML + Editor.wire for one click.
new Function(inline).call(themeButton);
const afterInline=e.theme;
themeButton.dispatch('click',{});
records.push({name:'Single theme click has two real callbacks',before:'light',inline,afterInline,
  afterListener:e.theme,toggleCalls:toggles,stored:JSON.parse(localStorage.getItem('ra_editor_preferences_v1')),
  mapHashUnchanged:LD.hashSync(e.model.toData())===hashBefore,
  scope:'Actual callbacks; DOM substitute does not itself execute inline HTML, so both callbacks are invoked explicitly.'});
const beforeGear={hash:LD.hashSync(e.model.toData()),objects:e.model.data.objects.length,
  paths:e.model.data.paths.length,undo:e.undoStack.length,dirty:e.dirty};
document.getElementById('gear-mode').value='pingpong';
const begun=e.beginGearGesture({c:5,r:12}),cancelled=e.cancelGearGesture();
records.push({name:'Cancel a newly placed gear gesture',begun,cancelled,before:beforeGear,
  after:{hash:LD.hashSync(e.model.toData()),objects:e.model.data.objects.length,
    paths:e.model.data.paths.length,undo:e.undoStack.length,dirty:e.dirty}});
const data=JSON.parse(JSON.stringify(RA.B4_SAMPLES.normal1));
data.id='review24_memory_only';data.title='Synthetic history fixture; not a human clear';data.contentHash=null;
const hash=LD.hashSync(data);
data.certification={contentHash:hash,rulesVersion:'old-review-rules',rulesFingerprint:'old-review-fingerprint',
  profileId:'run-v1',status:'passed',completedAt:'2026-11-08T00:00:00Z',source:'local-playtest'};
// A synthetic historical record tests storage policy; no user map is certified.
const repo=RA.ContentRepository.create({adapter:new RA.ContentRepository.MemoryAdapter()});
const saved=await repo.saveDraft('review-memory',data,0);
const published=await repo.publish({draftId:'review-memory',expectedRevision:saved.value.revision,receipt:data.certification});
const eligible=await repo.listEligible();
const importedRepo=RA.ContentRepository.create({adapter:new RA.ContentRepository.MemoryAdapter()});
const imported=await importedRepo.importLevel(LD.encode(data).value);
const importPublish=await importedRepo.publishImported({draftId:imported.value.draftId,expectedRevision:imported.value.revision});
records.push({name:'Same historical manual-pass declaration, local versus JSON import',
  hash,localPublish:published,localCandidateCount:eligible.value.length,
  imported,importPublish,
  note:'Synthetic in-memory history fixture, not an actual author clear or user storage mutation.'});
const returned=new RA.Editor(makeCanvas(),{repo});
await returned.refreshDrafts(true);
records.push({name:'Plain editor.html boot does not restore originating draft',
  trialReturnHref:readFileSync(join(ROOT,'trial.html'),'utf8').match(/<a[^>]*id="btn-done-editor"[^>]*>/)?.[0]||null,
  editorDraftId:returned.draftId,currentMapId:returned.model.data.id,storedDraftCount:returned._drafts.length,
  note:'Draft exists, but constructor creates a new map and list refresh asks user to open a draft manually.'});
const oldData=JSON.parse(JSON.stringify(RA.B4_SAMPLES.normal1));
sessionStorage.setItem('RA_STANDARD_V1',JSON.stringify({version:1,from:'editor',template:oldData,
  draftId:'review-old-page',revision:1,contentHash:LD.hashSync(oldData),
  rulesVersion:RA.RULES.rulesVersion,rulesFingerprint:RA.RULES.rulesFingerprint,profile:'standard-v1'}));
const getId=document.getElementById.bind(document),oldCanvas=makeCanvas();
document.getElementById=id=>id==='std-canvas'?oldCanvas:getId(id);
vm.runInThisContext(readFileSync(join(ROOT,'js/standard.js'),'utf8'),{filename:'js/standard.js'});
records.push({name:'Old standard page remains executable with V1 handoff',
  standardHtmlLoadsOldController:readFileSync(join(ROOT,'standard.html'),'utf8').includes('src="js/standard.js"'),
  createdSession:!!RA.standard?.session,floorCount:RA.standard?.session?.floorCount,
  initialCooldown:RA.standard?.session?.run?.haloCooldownRemaining,
  note:'Old controller boots three floors/CD20; no frames, finish, or certificate save were simulated.'});
const runtimeFiles=['editor.html','css/editor.css','js/editor.js','js/trial.js','js/trial-session.js',
  'js/content-repository.js','js/level-data.js','js/session.js','js/world.js'];
const fileHashes=Object.fromEntries(runtimeFiles.map(f=>[f,createHash('sha256').update(readFileSync(join(ROOT,f))).digest('hex')]));
const result={date:'2026-11-08',head:'d41e07d',delivery:'B4-R7 uncommitted working tree',
  scope:'Code/controller audit only; no actual browser screen or map compliance tests. User reports trial playing correctly.',
  records,fileHashes};
writeFileSync(join(ROOT,'docs/checks/review-B4R7-2026-11-08-editor-audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));process.exit(0);
