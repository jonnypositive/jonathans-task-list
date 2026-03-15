// ── Load config then boot ─────────────────────────────────────────────────────
let CFG = {};

async function loadConfig() {
  try {
    const r = await fetch('/config.json');
    if (r.ok) CFG = await r.json();
  } catch(e) {}
  // Defaults if config missing
  if (!CFG.ownerName) CFG.ownerName = 'Jonathan';
  if (!CFG.reportTitle) CFG.reportTitle = 'Daily Task List';
  if (!CFG.timezone) CFG.timezone = 'America/Denver';
  if (!CFG.sections) CFG.sections = {};
  if (!CFG.meetings) CFG.meetings = {};
}

// ── Section metadata (from config) ───────────────────────────────────────────
function getSM() {
  const defaults = {
    calls:          {label:'In-House Clients and Groups', hasArrival:false,hasPerp:false,hasDateRange:true},
    dbr:            {label:'DBR',                    hasArrival:true, hasPerp:false,hasDateRange:false},
    proposals_prep: {label:'Proposals: Prep',        hasArrival:true, hasPerp:false,hasDateRange:false},
    proposals_out:  {label:'Proposals: Out',         hasArrival:true, hasPerp:false,hasDateRange:false},
    contracts_prep: {label:'Contracts: Prep',        hasArrival:true, hasPerp:false,hasDateRange:false},
    contracts_out:  {label:'Contracts: Out',         hasArrival:true, hasPerp:false,hasDateRange:false},
    tasks:          {label:'Tasks',                  hasArrival:false,hasPerp:true, hasDateRange:false},
    prospecting:    {label:'Prospecting',            hasArrival:false,hasPerp:false,hasDateRange:false},
    culture:        {label:'Culture Club',           hasArrival:false,hasPerp:false,hasDateRange:false},
    affinity:       {label:'Sales Manager Affinity', hasArrival:false,hasPerp:false,hasDateRange:false},
    travel:         {label:'Travel',                 hasArrival:false,hasPerp:false,hasDateRange:true},
  };
  const sm = {};
  Object.keys(defaults).forEach(id => {
    const def = defaults[id];
    const cfg = (CFG.sections && CFG.sections[id]) || {};
    if (cfg.enabled === false) return;
    sm[id] = {
      label: cfg.label || def.label,
      arr:   cfg.hasArrival !== undefined ? cfg.hasArrival : def.hasArrival,
      perp:  cfg.hasPerp    !== undefined ? cfg.hasPerp    : def.hasPerp,
      dr:    cfg.hasDateRange !== undefined ? cfg.hasDateRange : def.hasDateRange,
    };
  });
  return sm;
}

let SM = {};
let AIDS = [];

// ── Default data ──────────────────────────────────────────────────────────────
const INIT={
  calls:[{text:'Linda Jones In House',done:false,priority:'none',travelStart:'2026-03-23',travelEnd:'2026-03-26'}],
  dbr:[{text:'Barr Brands',done:false,priority:'high',arrival:'2026-06-01'}],
  proposals_prep:[{text:'PBR \u2013 Pending',done:false,priority:'none'},{text:'',done:false,priority:'none'},{text:'',done:false,priority:'none'}],
  proposals_out:[
    {text:'USAFA Captains',done:false,priority:'none',arrival:'2026-05-29'},
    {text:'US Figure Skating \u2013 Kevin Handling',done:false,priority:'none',arrival:'2026-07-12'},
    {text:'Sublime Summer Retreat',done:false,priority:'none',arrival:'2026-07-19'},
    {text:'RMAC Advisory Meetings (2026-2028)',done:false,priority:'none',arrival:'2026-07-26'},
    {text:'James Garner Party (Allison Krauss)',done:false,priority:'none',arrival:'2026-08-13'},
    {text:'New Mexico United/USL',done:false,priority:'none',arrival:'2026-09-18'},
    {text:'Eastern Washington W Soccer',done:false,priority:'none',arrival:'2026-09-19'},
    {text:'Purina',done:false,priority:'none',arrival:'2026-10-01'},
    {text:'RMAC 2026 Fall Meeting \u2013 Cvent',done:false,priority:'none',arrival:'2026-10-05'},
    {text:'UCONN Football Team',done:false,priority:'none',arrival:'2026-10-30'},
    {text:"Ziggi's 2027 Franchise Conference",done:false,priority:'none',arrival:'2027-09-12'},
    {text:'LeMans',done:false,priority:'none',arrival:'2027-09-29'},
    {text:'',done:false,priority:'none'},{text:'',done:false,priority:'none'}
  ],
  contracts_prep:[
    {text:'US Foods Addendum',done:false,priority:'high'},
    {text:'IPT Credits - Addendum',done:false,priority:'high',arrival:'2026-11-08'},
    {text:'HPN Alliance',done:false,priority:'high',arrival:'2027-06-21'},
    {text:'',done:false,priority:'none'}
  ],
  contracts_out:[
    {text:'San Francisco 49ers',done:false,priority:'high',arrival:'2026-11-16'},
    {text:'AOAF Addendum',done:false,priority:'none',arrival:'2026-04-16'},
    {text:'',done:false,priority:'none'},{text:'',done:false,priority:'none'}
  ],
  tasks:[
    {text:'Delphi Task List',done:false,priority:'none',perpetual:true},
    {text:'Funnel Updates/P&Ts',done:false,priority:'none',perpetual:true},
    {text:'Monthly Forecast',done:false,priority:'none',perpetual:true},
    {text:'MIC Contact Report',done:false,priority:'none',perpetual:true},
    {text:'Update Decision Due Dates (04/01/2026)',done:false,priority:'none',perpetual:true},
    {text:'Turnovers',done:false,priority:'none',perpetual:true},
    {text:'Expense Report: MIC On-Site Expenses 3/13',done:false,priority:'high'},
    {text:'PBR \u2013 USAFA Football Contract Status',done:false,priority:'high'},
    {text:'Yoga on the Range Marketing Plan',done:false,priority:'high'},
    {text:'Send Follow Up Emails to MIC Panelists',done:false,priority:'high'},
    {text:'Send email to Leslie and Jenni Garrity re: MIC Session',done:false,priority:'high'},
    {text:'Sports AV Pricing',done:false,priority:'none'},
    {text:'Register for MPI WEC',done:false,priority:'none'},
    {text:'Hockey Coaches Event at Aviator',done:false,priority:'none'},
    {text:'Basketball Coaches Post-Season Event at Aviator',done:false,priority:'none'},
    {text:'Bus Parking Doc for CSMs - Danielle',done:false,priority:'none'},
    {text:'Available Dates Report',done:false,priority:'none'},
    {text:'Room Selection Logic for App',done:false,priority:'none'},
    {text:'Taco Bell Deal',done:false,priority:'none'},
    {text:'Make Tour Connection & Dest West Folders',done:false,priority:'none'},
    {text:'Destination West Planning',done:false,priority:'none'},
    {text:"Cayley's Marketing List Client Contacts",done:false,priority:'none'},
    {text:'',done:false,priority:'none'},{text:'',done:false,priority:'none'},{text:'',done:false,priority:'none'},
  ],
  prospecting:[
    {text:'Marc Goodman \u2013 Politis Specialty Foods',done:false,priority:'high'},
    {text:'Sue Dorsey \u2013 Gates Foundation',done:false,priority:'high'},
    {text:'Yoga Retreat Synergy Leads',done:false,priority:'none'},
    {text:'F&B \u2013 Shamrock Foods',done:false,priority:'none'},
    {text:'F&B \u2013 What Chefs Want',done:false,priority:'none'},
    {text:'F&B \u2013 Swire Coke',done:false,priority:'none'},
    {text:'F&B \u2013 Southern Wine & Spirits',done:false,priority:'none'},
    {text:'F&B \u2013 Breakthru Beverage',done:false,priority:'none'},
    {text:'F&B \u2013 Republic National Distributing',done:false,priority:'none'},
    {text:'North Dakota State Football',done:false,priority:'none'},
    {text:'Kroger',done:false,priority:'none'},
    {text:'Kim Bilsky',done:false,priority:'none'},
    {text:'Amy McKenny',done:false,priority:'none'},
    {text:'USAFA Summer Camps',done:false,priority:'none'},
    {text:'AHA Hockey \u2013 2027 Teams',done:false,priority:'none'},
    {text:'Knowland Prospecting',done:false,priority:'none'},
    {text:'USA Water Polo',done:false,priority:'none'},
    {text:'Denver Citywides Leads',done:false,priority:'none'},
    {text:'Check in on LinkedIn',done:false,priority:'none'},
    {text:'',done:false,priority:'none'},{text:'',done:false,priority:'none'},
  ],
  culture:[
    {text:'Q1 Team Events',done:false,priority:'high'},
    {text:'Meeting: March 18 @ 2:30',done:false,priority:'high'},
    {text:'',done:false,priority:'none'}
  ],
  affinity:[
    {text:'Meeting: March 26 @ 11 am',done:false,priority:'high'},
    {text:'',done:false,priority:'none'},{text:'',done:false,priority:'none'}
  ],
  travel:[
    {text:'Destination West - Boulder',done:false,priority:'none',travelStart:'2026-04-19',travelEnd:'2026-04-21'},
    {text:'Florida Trip',done:false,priority:'none',travelStart:'2026-04-22',travelEnd:'2026-04-29'},
    {text:'Tour Connection NYC',done:false,priority:'none',travelStart:'2026-04-29',travelEnd:'2026-05-02'},
    {text:'MPI WEC San Antonio',done:false,priority:'none',travelStart:'2026-06-01',travelEnd:'2026-06-04'},
    {text:'Lamont AXS Las Vegas',done:false,priority:'none',travelStart:'2026-06-21',travelEnd:'2026-06-23'},
    {text:'Connect Fall Marketplace Tampa',done:false,priority:'none',travelStart:'2026-08-24',travelEnd:'2026-08-26'},
    {text:'Beyond Dallas and Houston',done:false,priority:'none',travelStart:'2026-09-07',travelEnd:'2026-09-10'},
  ],
  recap:'Your most pressing items today are the Expense Report from MIC On-Site, the follow-up emails to MIC panelists, the email to Leslie and Jenni Garrity regarding the MIC session, the Yoga on the Range Marketing Plan, and the PBR/USAFA Football Contract status.',
};

// ── State ─────────────────────────────────────────────────────────────────────
let T={},filt='all',ec=null,openDP=null;
let dragSrc=null,dragIdx=null,dropTargetIdx=null;
let syncTimer=null;

// ── Sync helpers ──────────────────────────────────────────────────────────────
function setSyncStatus(state,msg){
  const el=document.getElementById('syncStatus');
  const msgEl=document.getElementById('syncMsg');
  el.className='sync-status '+state;
  msgEl.textContent=msg;
}

async function loadFromCloud(){
  setSyncStatus('syncing','Loading...');
  try{
    const r=await fetch('/.netlify/functions/data?action=load');
    if(r.ok){
      const d=await r.json();
      if(d&&d.tasks){
        T=d.tasks;
        AIDS.forEach(id=>{if(!T[id])T[id]=INIT[id]?JSON.parse(JSON.stringify(INIT[id])):[];});
        if(d.recap)document.getElementById('recapText').textContent=d.recap;
        setSyncStatus('saved','Synced');
        return;
      }
    }
  }catch(e){}
  try{
    const s=localStorage.getItem('jdtl_v5');
    if(s){T=JSON.parse(s);AIDS.forEach(id=>{if(!T[id])T[id]=INIT[id]?JSON.parse(JSON.stringify(INIT[id])):[];});}
    else T=JSON.parse(JSON.stringify(INIT));
  }catch(e){T=JSON.parse(JSON.stringify(INIT));}
  setSyncStatus('error','Offline — local only');
}

async function saveToCloud(){
  setSyncStatus('syncing','Saving...');
  const recap=document.getElementById('recapText').textContent;
  try{
    const r=await fetch('/.netlify/functions/data',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({tasks:T,recap})
    });
    if(r.ok){setSyncStatus('saved','Saved');return;}
  }catch(e){}
  localStorage.setItem('jdtl_v5',JSON.stringify(T));
  setSyncStatus('error','Cloud unavailable — saved locally');
}

function scheduleSave(){
  clearTimeout(syncTimer);
  setSyncStatus('syncing','Saving...');
  syncTimer=setTimeout(saveToCloud,1200);
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function srt(a){
  const p=a.filter(t=>t.perpetual),h=a.filter(t=>!t.perpetual&&t.text&&t.priority==='high'&&!t.done);
  const r=a.filter(t=>!t.perpetual&&t.text&&!(t.priority==='high'&&!t.done)),b=a.filter(t=>!t.perpetual&&!t.text);
  return[...p,...h,...r,...b];
}
function srtDR(a){const h=a.filter(t=>t.text&&t.priority==='high'&&!t.done),r=a.filter(t=>t.text&&!(t.priority==='high'&&!t.done));return[...h,...r];}
function ss(sid,a){return SM[sid]&&SM[sid].dr?srtDR(a):srt(a);}

function efy(s){
  if(!s)return s;const p=s.split('-');if(p.length!==3)return s;
  let y=parseInt(p[0],10);if(isNaN(y))return s;
  if(y>=1&&y<=99)y=y<50?2000+y:1900+y;
  return String(y).padStart(4,'0')+'-'+p[1]+'-'+p[2];
}
function fmt(s){
  if(!s)return null;const f=efy(s),p=f.split('-');if(p.length!==3)return s;
  const y=parseInt(p[0],10),m=parseInt(p[1],10),d=parseInt(p[2],10);
  if(isNaN(y)||isNaN(m)||isNaN(d))return s;return m+'/'+d+'/'+String(y).slice(-2);
}

function getMeetingDate(key){
  const m = CFG.meetings && CFG.meetings[key];
  if (!m) return '';
  const anchor = new Date(m.anchor + 'T00:00:00');
  const tz = CFG.timezone || 'America/Denver';
  const nowMT = new Date(new Date().toLocaleString('en-US',{timeZone:tz}));
  let next = new Date(anchor);
  while(next <= nowMT) next.setDate(next.getDate() + (m.intervalDays || 14));
  const dateStr = next.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:tz}).replace(/,\s+\d{4}$/,'');
  return dateStr + ' @ ' + m.time;
}

function dbrDate(){
  const tz=CFG.timezone||'America/Denver';
  const n=new Date(),day=n.getDay(),h=n.getHours();let d=new Date(n);
  if(day===0)d.setDate(d.getDate()+1);else if(day===6)d.setDate(d.getDate()+2);
  else if(h>=(CFG.dbr&&CFG.dbr.afterHour||9)){d.setDate(d.getDate()+(day===5?3:1));if(d.getDay()===6)d.setDate(d.getDate()+2);if(d.getDay()===0)d.setDate(d.getDate()+1);}
  return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:tz});
}

// ── Actions ───────────────────────────────────────────────────────────────────
function sf(f){filt=f;['fAll','fActive','fDone'].forEach(id=>document.getElementById(id).classList.remove('on'));document.getElementById('f'+f[0].toUpperCase()+f.slice(1)).classList.add('on');render();}
function tog(sid,idx){const t=T[sid][idx];if(t.perpetual)return;t.done=!t.done;T[sid]=ss(sid,T[sid]);scheduleSave();render();}
function cyc(sid,idx){const o=['none','high','med','low'],c=T[sid][idx].priority||'none';T[sid][idx].priority=o[(o.indexOf(c)+1)%o.length];T[sid]=ss(sid,T[sid]);scheduleSave();render();}
function del(sid,idx){T[sid].splice(idx,1);T[sid]=ss(sid,T[sid]);scheduleSave();render();}
function clearDone(){AIDS.forEach(id=>{T[id]=ss(id,T[id].filter(t=>!t.done||t.perpetual));});scheduleSave();render();}
function scrollToTop(){document.getElementById('appTop').scrollIntoView({behavior:'smooth'});window.scrollTo({top:0,behavior:'smooth'});}

function tDP(sid,idx){const k=sid+'_'+idx;openDP=(openDP===k)?null:k;render();if(openDP){setTimeout(()=>{const d=document.getElementById('da_'+openDP);if(d)d.focus();},80);}}
function cDate(sid,idx){const k=sid+'_'+idx,dp=document.getElementById('da_'+k);if(!dp)return;T[sid][idx].arrival=dp.value?efy(dp.value):undefined;scheduleSave();openDP=null;render();}
function clDate(sid,idx){T[sid][idx].arrival=undefined;scheduleSave();openDP=null;render();}
function tDR(sid,idx){const k='dr_'+sid+'_'+idx;openDP=(openDP===k)?null:k;render();if(openDP){setTimeout(()=>{const d=document.getElementById('ds_'+sid+'_'+idx);if(d)d.focus();},80);}}
function cDR(sid,idx){
  const ts=document.getElementById('ds_'+sid+'_'+idx),te=document.getElementById('de_'+sid+'_'+idx);
  if(ts)T[sid][idx].travelStart=ts.value?efy(ts.value):undefined;
  if(te)T[sid][idx].travelEnd=te.value?efy(te.value):undefined;
  scheduleSave();openDP=null;render();
}
function clDR(sid,idx){T[sid][idx].travelStart=undefined;T[sid][idx].travelEnd=undefined;scheduleSave();openDP=null;render();}

function startEdit(sid,idx,row){
  if(ec)commitEdit();ec={sid,idx};
  const sp=row.querySelector('span.tspan');if(!sp)return;
  const inp=document.createElement('input');inp.className='tedit';inp.value=T[sid][idx].text;
  inp.addEventListener('blur',commitEdit);
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){commitEdit();e.preventDefault();}if(e.key==='Escape'){ec=null;render();}});
  sp.replaceWith(inp);inp.focus();inp.select();
}
function commitEdit(){
  if(!ec)return;const{sid,idx}=ec;
  const inp=document.querySelector('input.tedit');
  if(inp){T[sid][idx].text=inp.value;T[sid]=ss(sid,T[sid]);scheduleSave();}
  ec=null;render();
}

function openAdd(pre){
  document.getElementById('mSec').value=pre||'';
  ['mtxt','marr','mts','mte'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('mpri').value='none';document.getElementById('mperp').checked=false;
  document.getElementById('mFields').style.display='none';document.getElementById('mOK').style.display='none';
  document.getElementById('modalWrap').style.display='block';
  if(pre)onSecChange();else setTimeout(()=>document.getElementById('mSec').focus(),50);
}
function onSecChange(){
  const sid=document.getElementById('mSec').value,fields=document.getElementById('mFields'),ok=document.getElementById('mOK');
  if(!sid){fields.style.display='none';ok.style.display='none';return;}
  const m=SM[sid];if(!m)return;
  document.getElementById('mTag').textContent=m.label;
  document.getElementById('mPerpRow').style.display=m.perp?'flex':'none';
  document.getElementById('mArrRow').style.display=m.arr?'block':'none';
  document.getElementById('mDRRow').style.display=m.dr?'block':'none';
  fields.style.display='block';ok.style.display='inline-block';
  setTimeout(()=>document.getElementById('mtxt').focus(),50);
}
function closeM(){document.getElementById('modalWrap').style.display='none';}
function handleOverlayClick(e){if(e.target.classList.contains('movl'))closeM();}
function confirmM(){
  const sid=document.getElementById('mSec').value,txt=document.getElementById('mtxt').value.trim();
  if(!sid||!txt)return;
  const pri=document.getElementById('mpri').value,perp=document.getElementById('mperp').checked;
  const arr=document.getElementById('marr').value,ts=document.getElementById('mts').value,te=document.getElementById('mte').value;
  if(!T[sid])T[sid]=[];
  const task={text:txt,done:false,priority:pri};
  if(perp)task.perpetual=true;if(arr)task.arrival=efy(arr);if(ts)task.travelStart=efy(ts);if(te)task.travelEnd=efy(te);
  T[sid].push(task);T[sid]=ss(sid,T[sid]);scheduleSave();closeM();render();
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeM();if(openDP){openDP=null;render();}}
  if(e.key==='Enter'&&document.getElementById('modalWrap').style.display==='block'){
    if(document.activeElement&&document.activeElement.tagName!=='SELECT'&&document.activeElement.type!=='date')confirmM();
  }
});

function exportDoc(){
  const data={tasks:T,recap:document.getElementById('recapText').textContent,config:CFG};
  setSyncStatus('syncing','Generating...');
  fetch('/.netlify/functions/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
    .then(r=>{if(!r.ok)throw new Error('Export failed');return r.blob();})
    .then(blob=>{
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      const tz=CFG.timezone||'America/Denver';
      const now=new Date();
      const parts=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:tz}).formatToParts(now);
      const mo=parts.find(p=>p.type==='month').value;
      const dd=parts.find(p=>p.type==='day').value;
      const yy=parts.find(p=>p.type==='year').value;
      const name=(CFG.ownerName||'task')+'_list_'+mo+'-'+dd+'-'+yy+'.docx';
      a.href=url;a.download=name;
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSyncStatus('saved','Export ready');
    })
    .catch(()=>setSyncStatus('error','Export failed'));
}

// ── Drag and drop ─────────────────────────────────────────────────────────────
function onDS(e,sid,idx){dragSrc=sid;dragIdx=idx;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',sid+'|'+idx);setTimeout(()=>{const el=document.querySelector('[data-drag="'+sid+'_'+idx+'"]');if(el)el.classList.add('dragging');},0);}
function onDE(){document.querySelectorAll('.dragging,.drag-over,.drop-above').forEach(el=>el.classList.remove('dragging','drag-over','drop-above'));dropTargetIdx=null;}
function onDO(e,l){e.preventDefault();e.dataTransfer.dropEffect='move';document.querySelectorAll('.drag-over').forEach(el=>{if(el!==l)el.classList.remove('drag-over');});l.classList.add('drag-over');}
function onDL(e,l){if(!l.contains(e.relatedTarget))l.classList.remove('drag-over');}
function onRDO(e,sid,idx){if(dragSrc!==sid)return;e.preventDefault();e.stopPropagation();document.querySelectorAll('.drop-above').forEach(el=>el.classList.remove('drop-above'));const el=document.querySelector('[data-drag="'+sid+'_'+idx+'"]');if(el)el.classList.add('drop-above');dropTargetIdx=idx;}
function onRDL(e,sid,idx){if(e.relatedTarget&&e.relatedTarget.closest&&e.relatedTarget.closest('[data-drag="'+sid+'_'+idx+'"]'))return;const el=document.querySelector('[data-drag="'+sid+'_'+idx+'"]');if(el)el.classList.remove('drop-above');}
function onDrop(e,destSid,l){
  e.preventDefault();l.classList.remove('drag-over');document.querySelectorAll('.drop-above').forEach(el=>el.classList.remove('drop-above'));
  if(dragSrc===null||dragIdx===null)return;
  const task={...T[dragSrc][dragIdx]};
  if(!task.text&&dragSrc===destSid){dragSrc=null;dragIdx=null;return;}
  T[dragSrc].splice(dragIdx,1);
  if(dragSrc===destSid){
    let ins=dropTargetIdx!==null?dropTargetIdx:T[destSid].length;
    if(dropTargetIdx!==null&&dropTargetIdx>dragIdx)ins--;
    T[destSid].splice(ins,0,task);
    const nb=T[destSid].filter(t=>t.text||t.perpetual),bl=T[destSid].filter(t=>!t.text&&!t.perpetual);
    T[destSid]=[...nb,...bl];
  }else{
    T[dragSrc]=ss(dragSrc,T[dragSrc]);task.done=false;
    T[destSid]=T[destSid]||[];T[destSid].push(task);T[destSid]=ss(destSid,T[destSid]);
  }
  dragSrc=null;dragIdx=null;dropTargetIdx=null;scheduleSave();render();
}

// ── Render helpers ────────────────────────────────────────────────────────────
function pl(p){return{high:'High',med:'Med',low:'Low',none:'\u2013'}[p]||'\u2013';}
function bc(p){return{high:'bh',med:'bm',low:'bl',none:'bn'}[p]||'bn';}

function rows(sid,arr){
  const m=SM[sid];if(!m)return'';
  let src=filt==='active'?arr.map((t,i)=>({...t,_i:i})).filter(t=>!t.done):filt==='done'?arr.map((t,i)=>({...t,_i:i})).filter(t=>t.done&&!t.perpetual):arr;
  const dz=`ondragover="onDO(event,this)" ondragleave="onDL(event,this)" ondrop="onDrop(event,'${sid}',this)"`;
  if(!src.length)return`<div class="tlist" ${dz}><div class="noitems">No items — use + Add task</div></div>`;
  let h='',sp=false,sh=false,st=false;
  src.forEach((t,vi)=>{
    const ri=t._i!==undefined?t._i:vi,ip=!!t.perpetual,isHi=t.priority==='high'&&!t.done&&!ip;
    if(ip&&!sp&&filt!=='done'){h+='<div class="divrow perp">Perpetual</div>';sp=true;}
    if(isHi&&!sh&&filt!=='done'){h+='<div class="divrow hi">High Priority</div>';sh=true;}
    if(!ip&&!isHi&&t.text&&!st&&filt!=='done'){h+='<div class="divrow">Today</div>';st=true;}
    const dc=t.done?' done':'',prc=ip?' prow':isHi?' hirow':'';
    const pb=ip?'<span class="perpb">\u221e</span>':'';
    const k=sid+'_'+ri,drk='dr_'+sid+'_'+ri,oa=(openDP===k),odr=(openDP===drk);
    let db='';
    if(m.arr)db=`<span class="dbadge${t.arrival?' set':''}" onclick="tDP('${sid}',${ri})">${t.arrival?fmt(t.arrival):'+ date'}</span>`;
    if(m.dr){const has=t.travelStart||t.travelEnd,lbl=has?((t.travelStart?fmt(t.travelStart):'?')+'\u2013'+(t.travelEnd?fmt(t.travelEnd):'?')):'+ dates';db=`<span class="dbadge${has?' set':''}" onclick="tDR('${sid}',${ri})">${lbl}</span>`;}
    const cc=ip?'chk pc':`chk${t.done?' on':''}`,cx=ip?'\u221e':t.done?'\u2713':'';
    const ts=t.done?'text-decoration:line-through;color:#aaa;':'';
    const tx=t.text||'<em style="opacity:.3">empty</em>';
    const drag=t.text?'draggable="true"':'';
    h+=`<div class="trow${dc}${prc}" data-drag="${k}" ${drag} ondragstart="onDS(event,'${sid}',${ri})" ondragend="onDE()" ondragover="onRDO(event,'${sid}',${ri})" ondragleave="onRDL(event,'${sid}',${ri})">
      <div class="dh"><span></span><span></span><span></span></div>
      <div class="${cc}" onclick="tog('${sid}',${ri})">${cx}</div>
      <span class="tspan" onclick="startEdit('${sid}',${ri},this.parentElement)" style="${ts}">${tx}</span>
      ${pb}${db}<span class="pb ${bc(t.priority||'none')}" onclick="cyc('${sid}',${ri})">${pl(t.priority||'none')}</span>
      <button class="delbtn" onclick="del('${sid}',${ri})">&times;</button>
    </div>`;
    if(oa)h+=`<div class="dprow"><span class="dplbl">Arrival:</span><input type="date" id="da_${k}" value="${efy(t.arrival||'')}"/><button class="bp" style="font-size:11px;padding:3px 10px" onclick="cDate('${sid}',${ri})">Set</button>${t.arrival?`<button class="bd" style="font-size:11px;padding:3px 8px" onclick="clDate('${sid}',${ri})">Clear</button>`:''}<button style="font-size:11px;padding:3px 8px" onclick="openDP=null;render()">Cancel</button></div>`;
    if(odr)h+=`<div class="dprow"><span class="dplbl">Start:</span><input type="date" id="ds_${sid}_${ri}" value="${efy(t.travelStart||'')}"/><span class="dplbl">End:</span><input type="date" id="de_${sid}_${ri}" value="${efy(t.travelEnd||'')}"/><button class="bp" style="font-size:11px;padding:3px 10px" onclick="cDR('${sid}',${ri})">Set</button>${(t.travelStart||t.travelEnd)?`<button class="bd" style="font-size:11px;padding:3px 8px" onclick="clDR('${sid}',${ri})">Clear</button>`:''}<button style="font-size:11px;padding:3px 8px" onclick="openDP=null;render()">Cancel</button></div>`;
  });
  return`<div class="tlist" ${dz}>${h}</div>`;
}

function sec(cls,title,sid,sub){
  return`<div class="sec ${cls}"><div class="shead"><span class="stitle">${title}${sub?`<span class="ssub">&mdash; ${sub}</span>`:''}</span></div>${rows(sid,T[sid]||[])}</div>`;
}

function prosCols(){
  const all=T.prospecting||[];
  const src=filt==='active'?all.filter(t=>!t.done):filt==='done'?all.filter(t=>t.done):all;
  const wi=src.map((t,i)=>({...t,_i:i}));
  const mid=Math.ceil(wi.length/2),left=wi.slice(0,mid),right=wi.slice(mid);
  const label=SM.prospecting?SM.prospecting.label:'Prospecting';
  function cr(items){
    if(!items.length)return`<div class="noitems">Empty</div>`;
    let h='',sh=false,st=false;
    items.forEach(t=>{
      const ri=t._i,isHi=t.priority==='high'&&!t.done;
      if(isHi&&!sh&&filt!=='done'){h+='<div class="divrow hi">High Priority</div>';sh=true;}
      if(!isHi&&t.text&&!st&&filt!=='done'){h+='<div class="divrow">Today</div>';st=true;}
      const dc=t.done?' done':'',prc=isHi?' hirow':'';
      const cc=`chk${t.done?' on':''}`,cx=t.done?'\u2713':'';
      const ts=t.done?'text-decoration:line-through;color:#aaa;':'';
      const tx=t.text||'<em style="opacity:.3">empty</em>';
      const drag=t.text?'draggable="true"':'';
      h+=`<div class="trow${dc}${prc}" data-drag="prospecting_${ri}" ${drag} ondragstart="onDS(event,'prospecting',${ri})" ondragend="onDE()" ondragover="onRDO(event,'prospecting',${ri})" ondragleave="onRDL(event,'prospecting',${ri})">
        <div class="dh"><span></span><span></span><span></span></div>
        <div class="${cc}" onclick="tog('prospecting',${ri})">${cx}</div>
        <span class="tspan" onclick="startEdit('prospecting',${ri},this.parentElement)" style="${ts}">${tx}</span>
        <span class="pb ${bc(t.priority||'none')}" onclick="cyc('prospecting',${ri})">${pl(t.priority||'none')}</span>
        <button class="delbtn" onclick="del('prospecting',${ri})">&times;</button>
      </div>`;
    });
    return h;
  }
  const dz=`ondragover="onDO(event,this)" ondragleave="onDL(event,this)" ondrop="onDrop(event,'prospecting',this)"`;
  return`<div class="proswrap"><div class="shead"><span class="stitle">${label}</span></div><div class="scols"><div class="scol"><div class="tlist" ${dz}>${cr(left)}</div></div><div class="scol"><div class="tlist" ${dz}>${cr(right)}</div></div></div></div>`;
}

// ── Build section dropdown from config ────────────────────────────────────────
function buildSectionDropdown(){
  const sel=document.getElementById('mSec');
  // Clear existing options except the placeholder
  while(sel.options.length>1)sel.remove(1);
  Object.entries(SM).forEach(([id,m])=>{
    const opt=document.createElement('option');
    opt.value=id;opt.textContent=m.label;
    sel.appendChild(opt);
  });
}

function render(){
  const g=document.getElementById('grid');
  const tz=CFG.timezone||'America/Denver';
  const now=new Date();
  document.getElementById('titleDate').textContent=
    now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:tz})+
    ' \u00b7 '+
    now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:tz});

  // Update page title
  document.title=(CFG.ownerName?CFG.ownerName+"'s ":'')+(CFG.reportTitle||'Daily Task List');
  document.querySelector('.hdr-left h1').textContent=(CFG.ownerName?CFG.ownerName+"'s ":'')+(CFG.reportTitle||'Daily Task List');

  // Update logo
  const logoImg=document.querySelector('.hdr-logo img');
  if(CFG.logo){
    logoImg.src=CFG.logo;
    logoImg.style.display='';
    document.querySelector('.hdr').style.background=CFG.logoBackground||'#1F3864';
  } else {
    logoImg.style.display='none';
  }

  let ta=0,td=0,th=0;
  AIDS.forEach(id=>(T[id]||[]).forEach(t=>{if(t.text){ta++;if(t.done)td++;if(t.priority==='high'&&!t.done)th++;}}));
  document.getElementById('sT').textContent=ta;
  document.getElementById('sD').textContent=td;
  document.getElementById('sR').textContent=ta-td;
  document.getElementById('sH').textContent=th;

  const cultureLabel=(SM.culture?SM.culture.label:'Culture Club')+' \u2014 '+getMeetingDate('culture');
  const affinityLabel=(SM.affinity?SM.affinity.label:'Sales Manager Affinity')+' \u2014 '+getMeetingDate('affinity');

  g.innerHTML='';
  if(SM.calls)  g.innerHTML+=sec('sec',SM.calls.label,'calls');
  if(SM.dbr)    g.innerHTML+=sec('sec',SM.dbr.label,'dbr',dbrDate());
  if(SM.proposals_prep||SM.proposals_out){
    g.innerHTML+=`<div class="pwrap"><div class="shead"><span class="stitle">Proposals</span></div><div class="scols">
      <div class="scol"><div class="scholdr"><span>${SM.proposals_prep?SM.proposals_prep.label:'Prep'}</span></div>${rows('proposals_prep',T.proposals_prep||[])}</div>
      <div class="scol"><div class="scholdr"><span>${SM.proposals_out?SM.proposals_out.label:'Out'}</span></div>${rows('proposals_out',T.proposals_out||[])}</div>
    </div></div>`;
  }
  if(SM.contracts_prep||SM.contracts_out){
    g.innerHTML+=`<div class="cwrap"><div class="shead"><span class="stitle">Contracts</span></div><div class="scols">
      <div class="scol"><div class="scholdr"><span>${SM.contracts_prep?SM.contracts_prep.label:'Prep'}</span></div>${rows('contracts_prep',T.contracts_prep||[])}</div>
      <div class="scol"><div class="scholdr"><span>${SM.contracts_out?SM.contracts_out.label:'Out'}</span></div>${rows('contracts_out',T.contracts_out||[])}</div>
    </div></div>`;
  }
  if(SM.tasks)       g.innerHTML+=sec('sfull',SM.tasks.label,'tasks');
  if(SM.prospecting) g.innerHTML+=prosCols();
  if(SM.culture)     g.innerHTML+=sec('sec',cultureLabel,'culture');
  if(SM.affinity)    g.innerHTML+=sec('sec',affinityLabel,'affinity');
  if(SM.travel)      g.innerHTML+=sec('sfull',SM.travel.label,'travel');
}


// ── AI Recap Generator ────────────────────────────────────────────────────────
async function generateRecap(){
  const btn = document.getElementById('recapGenBtn');
  const el  = document.getElementById('recapText');
  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = 'Generating...';

  // Build task summary from current data
  const tz = CFG.timezone || 'America/Denver';
  const today = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:tz});
  const lines = [];

  AIDS.forEach(sid => {
    const m = SM[sid]; if(!m) return;
    const active = (T[sid]||[]).filter(t=>t.text&&!t.done);
    if(!active.length) return;
    lines.push(m.label+':');
    active.forEach(t=>{
      let line='  - '+t.text;
      if(t.priority==='high') line+=' [HIGH PRIORITY]';
      if(t.perpetual)         line+=' [perpetual]';
      if(t.arrival)           line+=' (arrival: '+fmt(t.arrival)+')';
      if(t.travelStart||t.travelEnd) line+=' (travel: '+(t.travelStart?fmt(t.travelStart):'?')+' to '+(t.travelEnd?fmt(t.travelEnd):'?')+')';
      lines.push(line);
    });
  });

  const owner = CFG.ownerName || 'the user';
  const sectionNotes = "Note: In-House Clients and Groups refers to clients who are physically staying at or visiting the hotel — this is NOT travel for the report owner, do not treat these dates as travel items.";
  const prompt = `Today is ${today}. You are a helpful assistant reviewing ${owner}'s daily task list. Based on the following active tasks, write a practical daily recap of 4-6 sentences highlighting: immediate priorities, time-sensitive items, upcoming travel, and overall workload. ${sectionNotes}

Respond ONLY with a JSON object like this (no other text):
{"paragraphs":["Sentence one.","Sentence two.","Sentence three.","Sentence four."]}

Task list:
${lines.join('\n')}`;

  try {
    const resp = await fetch('/.netlify/functions/recap',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt})
    });
    const data = await resp.json();
    const text = data.text;
    if(text){
      let paras = [];
      try {
        const j = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}')+1));
        if(j.paragraphs && Array.isArray(j.paragraphs)) paras = j.paragraphs.filter(p=>p.trim());
      } catch(e) {
        paras = text.split(/\.\s+(?=[A-Z])/).map((p,i,a)=>p.trim()+(i<a.length-1?'.':'')).filter(p=>p.length>1);
      }
      if(paras.length>0){
        el.innerHTML = paras.map(p=>'<p style="margin:0 0 8px 0">'+p.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</p>').join('');
      } else {
        el.textContent = text;
      }
      scheduleSave();
    } else {
      el.textContent = 'Unable to generate recap — please try again.';
    }
  } catch(err){
    el.textContent = 'Unable to generate recap — check your connection.';
  }

  btn.disabled = false;
  btn.classList.remove('loading');
  btn.textContent = 'Generate with AI';
}
document.getElementById('recapText').addEventListener('blur',()=>scheduleSave());

// ── Init ──────────────────────────────────────────────────────────────────────
async function init(){
  await loadConfig();
  SM = getSM();
  AIDS = Object.keys(SM);
  buildSectionDropdown();
  await loadFromCloud();
  sf('all');
  render();
  // Auto-generate recap in background after load
  setTimeout(generateRecap, 1500);
}

init();
