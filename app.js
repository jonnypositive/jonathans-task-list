// ── Load config then boot ──────────────────────────────────────────────────
let CFG = {};
async function loadConfig() {
  try { const r = await fetch('/config.json'); if (r.ok) CFG = await r.json(); } catch(e) {}
  if (!CFG.ownerName)   CFG.ownerName   = 'Jonathan';
  if (!CFG.reportTitle) CFG.reportTitle = 'Daily Task List';
  if (!CFG.timezone)    CFG.timezone    = 'America/Denver';
  if (!CFG.sections)    CFG.sections    = {};
  if (!CFG.meetings)    CFG.meetings    = {};
}

// ── Section metadata ───────────────────────────────────────────────────────
// CHANGE 2: "calls" label → "Hot Dates and In-House Groups", hasTime:true
// CHANGE 5: "notes" section removed entirely
function getSM() {
  const defaults = {
    calls:          {label:'Hot Dates and In-House Groups', hasArrival:false, hasPerp:false, hasDateRange:true,  hasTime:true},
    dbr:            {label:'DBR',                           hasArrival:true,  hasPerp:false, hasDateRange:false, hasTime:false, hasValue:true, hasArrDate:true},
    proposals_out:  {label:'Funnel',                hasArrival:true,  hasPerp:false, hasDateRange:false, hasTime:false, hasValue:true, hasArrDate:true},
    contracts_out:  {label:'Contracts: Out',                hasArrival:true,  hasPerp:false, hasDateRange:false, hasTime:false, hasValue:true},
    contracts_closed:{label:'Contracts: Closed',             hasArrival:true,  hasPerp:false, hasDateRange:false, hasTime:false, hasValue:true},
    tasks:          {label:'Tasks',                         hasArrival:false, hasPerp:true,  hasDateRange:false, hasTime:false, hasDueDate:true},
    prospecting:    {label:'Prospecting',                   hasArrival:false, hasPerp:false, hasDateRange:false, hasTime:false},
    one_on_one:     {label:'One on One Items',              hasArrival:false, hasPerp:false, hasDateRange:false, hasTime:false},
    culture:        {label:'Culture Club',                  hasArrival:false, hasPerp:false, hasDateRange:false, hasTime:false},
    affinity:       {label:'Sales Manager Affinity',        hasArrival:false, hasPerp:false, hasDateRange:false, hasTime:false},
    travel:         {label:'Travel',                        hasArrival:false, hasPerp:false, hasDateRange:true,  hasTime:false},
    // NOTE: "notes" section intentionally removed (Change #5)
  };
  const sm = {};
  Object.keys(defaults).forEach(id => {
    const def = defaults[id];
    const cfg = (CFG.sections && CFG.sections[id]) || {};
    if (cfg.enabled === false) return;
    sm[id] = {
      label:    id==='proposals_out' ? def.label : (cfg.label || def.label),
      arr:      cfg.hasArrival !== undefined ? cfg.hasArrival : def.hasArrival,
      perp:     cfg.hasPerp    !== undefined ? cfg.hasPerp    : def.hasPerp,
      dr:       cfg.hasDateRange !== undefined ? cfg.hasDateRange : def.hasDateRange,
      time:     def.hasTime    || false,
      dueDate:  def.hasDueDate || false,
      val:      def.hasValue   || false,
      ad:       def.hasArrDate || false,
    };
  });
  return sm;
}

let SM = {};
let AIDS = [];

// Sections that use the Prospect / P3 / P2 / Tentative labels instead of High / Med / Low.
// The stored field is still "priority"; only its allowed values and display change.
const PRI_SECS = ['dbr','proposals_out'];
const PRI={definite:'Definite',tentative:'Tentative',p2:'P2',p3:'P3',prospect:'Prospect',gmcvb:'GMCVB'};
// Sort rank: Definite is always first. Proposals: Out then runs Tentative, P2, P3, Prospect, unlabeled.
const PRI_RANK_PO={definite:0,tentative:1,p2:2,p3:3,prospect:4,none:5,gmcvb:6};
function priRank(sid,t){const p=t.priority||'none';if(p==='definite')return 0;if(sid==='proposals_out')return PRI_RANK_PO[p]!==undefined?PRI_RANK_PO[p]:5;return 1;}
// DBR now carries Decision Date (stored in `arrival`, same as Proposals: Out) and Arrival Date (`arrDate`).
// One time: dates that were entered as the old DBR "Arrival" move to `arrDate`.
function migrateDbr(){
  if(T.__meta&&T.__meta.dbrDec)return;
  (T.dbr||[]).forEach(t=>{if(t.arrival&&!t.arrDate){t.arrDate=t.arrival;t.arrival=undefined;}});
  T.__meta=Object.assign({},T.__meta,{dbrDec:true});
}
function srtPri(a,sid){const w=a.filter(t=>t.text).map((t,i)=>({t,i,r:priRank(sid,t)}));w.sort((x,y)=>x.r-y.r||x.i-y.i);return[...w.map(o=>o.t),...a.filter(t=>!t.text)];}
// True only for the old "High" flag, and never in the sections that use the new labels
function hi(sid,t){return t.priority==='high'&&!PRI_SECS.includes(sid);}
function parseVal(raw){const n=parseFloat(String(raw).replace(/[^0-9.]/g,''));return isNaN(n)||n<0?null:n;}
function fmtVal(v){const n=Number(v);return '$'+n.toLocaleString('en-US',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2});}

// ── Default data ───────────────────────────────────────────────────────────
const INIT={
  calls:[{text:'Linda Jones In House',done:false,priority:'none',travelStart:'2026-03-23',travelEnd:'2026-03-26'}],
  dbr:[{text:'Barr Brands',done:false,priority:'high',arrDate:'2026-06-01'}],
  proposals_prep:[{text:'PBR – Pending',done:false,priority:'none'},{text:'',done:false,priority:'none'},{text:'',done:false,priority:'none'}],
  proposals_out:[
    {text:'USAFA Captains',done:false,priority:'none',arrival:'2026-05-29'},
    {text:'US Figure Skating – Kevin Handling',done:false,priority:'none',arrival:'2026-07-12'},
    {text:'Sublime Summer Retreat',done:false,priority:'none',arrival:'2026-07-19'},
    {text:'RMAC Advisory Meetings (2026-2028)',done:false,priority:'none',arrival:'2026-07-26'},
    {text:'James Garner Party (Allison Krauss)',done:false,priority:'none',arrival:'2026-08-13'},
    {text:'New Mexico United/USL',done:false,priority:'none',arrival:'2026-09-18'},
    {text:'Eastern Washington W Soccer',done:false,priority:'none',arrival:'2026-09-19'},
    {text:'Purina',done:false,priority:'none',arrival:'2026-10-01'},
    {text:'RMAC 2026 Fall Meeting – Cvent',done:false,priority:'none',arrival:'2026-10-05'},
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
  contracts_closed:[
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
    {text:'PBR – USAFA Football Contract Status',done:false,priority:'high'},
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
    {text:'Marc Goodman – Politis Specialty Foods',done:false,priority:'high'},
    {text:'Sue Dorsey – Gates Foundation',done:false,priority:'high'},
    {text:'Yoga Retreat Synergy Leads',done:false,priority:'none'},
    {text:'F&B – Shamrock Foods',done:false,priority:'none'},
    {text:'F&B – What Chefs Want',done:false,priority:'none'},
    {text:'F&B – Swire Coke',done:false,priority:'none'},
    {text:'F&B – Southern Wine & Spirits',done:false,priority:'none'},
    {text:'F&B – Breakthru Beverage',done:false,priority:'none'},
    {text:'F&B – Republic National Distributing',done:false,priority:'none'},
    {text:'North Dakota State Football',done:false,priority:'none'},
    {text:'Kroger',done:false,priority:'none'},
    {text:'Kim Bilsky',done:false,priority:'none'},
    {text:'Amy McKenny',done:false,priority:'none'},
    {text:'USAFA Summer Camps',done:false,priority:'none'},
    {text:'AHA Hockey – 2027 Teams',done:false,priority:'none'},
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
};

// ── State ──────────────────────────────────────────────────────────────────
let T={}, filt='all', ec=null, openDP=null, openNotes=null;
let dragSrc=null, dragIdx=null, dropTargetIdx=null;
let syncTimer=null;

// ── Sync helpers ───────────────────────────────────────────────────────────
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
      // Only use cloud data if it has tasks AND no error field
      if(d&&d.tasks&&!d.error){
        T=d.tasks;
        if(!T.one_on_one)T.one_on_one=(T.proposals_prep||[]).filter(t=>t.text).map(t=>({...t}));
        AIDS.forEach(id=>{if(!T[id])T[id]=INIT[id]?JSON.parse(JSON.stringify(INIT[id])):[];});
        migrateDbr();
        PRI_SECS.forEach(id=>{if(T[id])T[id]=ss(id,T[id]);});
        setSyncStatus('saved','Synced');
        return;
      }
    }
  }catch(e){}
  // Fall back to localStorage
  try{
    const s=localStorage.getItem('jdtl_v5');
    if(s){
      T=JSON.parse(s);
      if(!T.one_on_one)T.one_on_one=(T.proposals_prep||[]).filter(t=>t.text).map(t=>({...t}));
      AIDS.forEach(id=>{if(!T[id])T[id]=INIT[id]?JSON.parse(JSON.stringify(INIT[id])):[];});
      migrateDbr();
      PRI_SECS.forEach(id=>{if(T[id])T[id]=ss(id,T[id]);});
      setSyncStatus('saved','Loaded from local cache');
      return;
    }
  }catch(e){}
  T=JSON.parse(JSON.stringify(INIT));
  setSyncStatus('error','Using default data');
}
async function saveToCloud(){
  setSyncStatus('syncing','Saving...');
  try{
    const r=await fetch('/.netlify/functions/data',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({tasks:T})
    });
    if(r.ok){setSyncStatus('saved','Saved');return;}
  }catch(e){}
  localStorage.setItem('jdtl_v5',JSON.stringify(T));
  setSyncStatus('error','Cloud unavailable, saved locally');
}
function scheduleSave(){
  clearTimeout(syncTimer);
  setSyncStatus('syncing','Saving...');
  syncTimer=setTimeout(saveToCloud,1200);
}

// ── Date helpers ───────────────────────────────────────────────────────────
function srt(a,sid){
  const p=a.filter(t=>t.perpetual),h=a.filter(t=>!t.perpetual&&t.text&&hi(sid,t)&&!t.done);
  const r=a.filter(t=>!t.perpetual&&t.text&&!(hi(sid,t)&&!t.done)),b=a.filter(t=>!t.perpetual&&!t.text);
  return[...p,...h,...r,...b];
}
function srtDR(a,sid){const h=a.filter(t=>t.text&&hi(sid,t)&&!t.done),r=a.filter(t=>t.text&&!(hi(sid,t)&&!t.done));return[...h,...r];}
function ss(sid,a){if(PRI_SECS.includes(sid))return srtPri(a,sid);return SM[sid]&&SM[sid].dr?srtDR(a,sid):srt(a,sid);}
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
  const m=CFG.meetings&&CFG.meetings[key];
  if(!m)return '';
  const anchor=new Date(m.anchor+'T00:00:00');
  const tz=CFG.timezone||'America/Denver';
  const nowMT=new Date(new Date().toLocaleString('en-US',{timeZone:tz}));
  let next=new Date(anchor);
  while(next<=nowMT)next.setDate(next.getDate()+(m.intervalDays||14));
  const dateStr=next.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:tz}).replace(/,\s+\d{4}$/,'');
  return dateStr+' @ '+m.time;
}
function dbrDate(){
  const tz=CFG.timezone||'America/Denver';
  const n=new Date(),day=n.getDay(),h=n.getHours();let d=new Date(n);
  if(day===0)d.setDate(d.getDate()+1);else if(day===6)d.setDate(d.getDate()+2);
  else if(h>=(CFG.dbr&&CFG.dbr.afterHour||9)){d.setDate(d.getDate()+(day===5?3:1));if(d.getDay()===6)d.setDate(d.getDate()+2);if(d.getDay()===0)d.setDate(d.getDate()+1);}
  return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:tz});
}

// ── Actions ────────────────────────────────────────────────────────────────
function sf(f){filt=f;['fAll','fActive','fDone'].forEach(id=>document.getElementById(id).classList.remove('on'));document.getElementById('f'+f[0].toUpperCase()+f.slice(1)).classList.add('on');render();}
function tog(sid,idx){const t=T[sid][idx];if(t.perpetual)return;t.done=!t.done;T[sid]=ss(sid,T[sid]);scheduleSave();render();}
function cyc(sid,idx){const o=PRI_SECS.includes(sid)?['none','prospect','p3','p2','tentative','definite','gmcvb']:['none','high','med','low'];let c=T[sid][idx].priority||'none';if(!o.includes(c))c='none';T[sid][idx].priority=o[(o.indexOf(c)+1)%o.length];T[sid]=ss(sid,T[sid]);scheduleSave();render();}
function del(sid,idx){T[sid].splice(idx,1);T[sid]=ss(sid,T[sid]);scheduleSave();render();}
function clearDone(){AIDS.forEach(id=>{T[id]=ss(id,T[id].filter(t=>!t.done||t.perpetual));});scheduleSave();render();}
function scrollToTop(){document.getElementById('appTop').scrollIntoView({behavior:'smooth'});window.scrollTo({top:0,behavior:'smooth'});}
function tDP(sid,idx){const k=sid+'_'+idx;openDP=(openDP===k)?null:k;render();if(openDP){setTimeout(()=>{const d=document.getElementById('da_'+openDP);if(d)d.focus();},80);}}
function tAD(sid,idx){const k='ad_'+sid+'_'+idx;openDP=(openDP===k)?null:k;render();if(openDP){setTimeout(()=>{const d=document.getElementById('dad_'+sid+'_'+idx);if(d)d.focus();},80);}}
function cAD(sid,idx){const d=document.getElementById('dad_'+sid+'_'+idx);if(!d)return;T[sid][idx].arrDate=d.value?efy(d.value):undefined;scheduleSave();openDP=null;render();}
function clAD(sid,idx){T[sid][idx].arrDate=undefined;scheduleSave();openDP=null;render();}
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
function tVal(sid,idx){const k='val_'+sid+'_'+idx;openDP=(openDP===k)?null:k;render();if(openDP){setTimeout(()=>{const d=document.getElementById('dv_'+sid+'_'+idx);if(d){d.focus();d.select();}},80);}}
function cVal(sid,idx){const d=document.getElementById('dv_'+sid+'_'+idx);if(!d)return;const n=d.value.trim()?parseVal(d.value):null;T[sid][idx].value=n===null?undefined:n;scheduleSave();openDP=null;render();}
function clVal(sid,idx){T[sid][idx].value=undefined;scheduleSave();openDP=null;render();}

// CHANGE 6: Toggle inline notes panel
function toggleNotes(sid,idx){
  const k=sid+'_'+idx;
  openNotes=(openNotes===k)?null:k;
  render();
  if(openNotes){setTimeout(()=>{const ta=document.getElementById('nta_'+k);if(ta)ta.focus();},80);}
}
function saveNotes(sid,idx){
  const k=sid+'_'+idx,ta=document.getElementById('nta_'+k);
  if(ta){T[sid][idx].notes=ta.value;scheduleSave();}
  openNotes=null;render();
}
function closeNotes(){openNotes=null;render();}

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

// CHANGE 1: openAdd now accepts a pre-selected section and opens the modal
function openAdd(pre){
  document.getElementById('mSec').value=pre||'';
  ['mtxt','marr','marrd','mts','mte','mnotes','mval'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const mtime=document.getElementById('mtime');if(mtime)mtime.value='';
  const mduedate=document.getElementById('mduedate');if(mduedate)mduedate.value='';
  document.getElementById('mpri').value='none';
  document.getElementById('mperp').checked=false;
  document.getElementById('mFields').style.display='none';
  document.getElementById('mOK').style.display='none';
  document.getElementById('modalTitle').textContent='Add task';
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
  document.getElementById('mArrDRow').style.display=m.ad?'block':'none';
  document.getElementById('marrLbl').firstChild.textContent=m.ad?'Decision date ':'Arrival date ';
  document.getElementById('mValRow').style.display=m.val?'block':'none';
  // Priority choices depend on the section: DBR and Funnel use the new labels
  const mpri=document.getElementById('mpri');
  if(PRI_SECS.includes(sid)){
    mpri.innerHTML='<option value="none">None</option><option value="prospect">Prospect</option><option value="p3">P3</option><option value="p2">P2</option><option value="tentative">Tentative</option><option value="definite">Definite</option><option value="gmcvb">GMCVB</option>';
    mpri.value=(sid==='dbr')?'prospect':'none';
  }else{
    mpri.innerHTML='<option value="none">None</option><option value="high">High</option><option value="med">Medium</option><option value="low">Low</option>';
    mpri.value='none';
  }
  document.getElementById('mDRRow').style.display=m.dr?'block':'none';
  // CHANGE 2: show time field for hot dates (calls section)
  document.getElementById('mTimeRow').style.display=m.time?'block':'none';
  // CHANGE 7: show due date for tasks section
  document.getElementById('mDueDateRow').style.display=m.dueDate?'block':'none';
  fields.style.display='block';ok.style.display='inline-block';
  // CHANGE 1: update modal title to section name
  document.getElementById('modalTitle').textContent='Add to: '+m.label;
  setTimeout(()=>document.getElementById('mtxt').focus(),50);
}

function closeM(){document.getElementById('modalWrap').style.display='none';}
function handleOverlayClick(e){if(e.target.classList.contains('movl'))closeM();}

function confirmM(){
  const sid=document.getElementById('mSec').value,txt=document.getElementById('mtxt').value.trim();
  if(!sid||!txt)return;
  const pri=document.getElementById('mpri').value,perp=document.getElementById('mperp').checked;
  const arr=document.getElementById('marr').value,ts=document.getElementById('mts').value,te=document.getElementById('mte').value;
  const mtime=document.getElementById('mtime');
  const mduedate=document.getElementById('mduedate');
  const mnotes=document.getElementById('mnotes');
  if(!T[sid])T[sid]=[];
  const task={text:txt,done:false,priority:pri};
  if(perp)task.perpetual=true;
  if(arr)task.arrival=efy(arr);
  const marrd=document.getElementById('marrd');
  if(SM[sid]&&SM[sid].ad&&marrd&&marrd.value)task.arrDate=efy(marrd.value);
  if(ts)task.travelStart=efy(ts);
  if(te)task.travelEnd=efy(te);
  // CHANGE 2: save time for hot dates
  if(mtime&&mtime.value){
    const [h,m]=mtime.value.split(':');const hh=parseInt(h);
    task.time=(hh===0?12:hh>12?hh-12:hh)+':'+m+(hh>=12?'pm':'am');
  }
  // CHANGE 7: save due date for tasks
  if(mduedate&&mduedate.value)task.dueDate=efy(mduedate.value);
  // CHANGE 6: save notes
  if(mnotes&&mnotes.value.trim())task.notes=mnotes.value.trim();
  const mval=document.getElementById('mval');
  if(SM[sid]&&SM[sid].val&&mval&&mval.value.trim()){const vn=parseVal(mval.value);if(vn!==null)task.value=vn;}
  T[sid].push(task);T[sid]=ss(sid,T[sid]);scheduleSave();closeM();render();
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeM();if(openDP){openDP=null;render();}if(openNotes){openNotes=null;render();}}
  if(e.key==='Enter'&&document.getElementById('modalWrap').style.display==='block'){
    if(document.activeElement&&document.activeElement.tagName!=='SELECT'&&document.activeElement.type!=='date'&&document.activeElement.tagName!=='TEXTAREA')confirmM();
  }
});

function exportDoc(){
  const data={tasks:T,pillar:PIL&&PIL.text?{pillar:PIL.pillar,date:PIL.date,text:pilCurrentText()}:null,config:CFG};
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

// ── Drag and drop ──────────────────────────────────────────────────────────
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

// ── Render helpers ─────────────────────────────────────────────────────────
function pl(p,sid){return PRI_SECS.includes(sid)?(PRI[p]||'+ label'):({high:'High',med:'Med',low:'Low',none:'-'}[p]||'-');}
function bc(p,sid){return PRI_SECS.includes(sid)?(PRI[p]?'pri-'+p:'bn'):({high:'bh',med:'bm',low:'bl',none:'bn'}[p]||'bn');}

// only==='gmcvb' lists just the GMCVB-labeled tasks; DBR and Funnel hide them (they live in GMCVB Leads)
function rows(sid,arr,only){
  const m=SM[sid];if(!m)return'';
  let base=arr.map((t,i)=>({...t,_i:i}));
  if(only==='gmcvb')base=base.filter(t=>t.text&&t.priority==='gmcvb');
  else if(PRI_SECS.includes(sid))base=base.filter(t=>t.priority!=='gmcvb');
  let src=filt==='active'?base.filter(t=>!t.done):filt==='done'?base.filter(t=>t.done&&!t.perpetual):base;
  const dz=`ondragover="onDO(event,this)" ondragleave="onDL(event,this)" ondrop="onDrop(event,'${sid}',this)"`;
  if(!src.length&&only)return'';
  if(!src.length)return`<div class="tlist" ${dz}>${sid==='proposals_out'?'<div class="colhead"><span class="ch-dec">Decision Date</span><span class="ch-arr">Arrival Date</span><span class="ch-val">Value</span><span class="ch-del"></span></div>':''}<div class="noitems">No items. Use + Add task</div></div>`;
  let h='',sp=false,sh=false,st=false;
  src.forEach((t,vi)=>{
    const ri=t._i!==undefined?t._i:vi,ip=!!t.perpetual,isHi=hi(sid,t)&&!t.done&&!ip;
    if(ip&&!sp&&filt!=='done'){h+='<div class="divrow perp">Perpetual</div>';sp=true;}
    if(isHi&&!sh&&filt!=='done'){h+='<div class="divrow hi">High Priority</div>';sh=true;}
    if(!ip&&!isHi&&t.text&&!st&&filt!=='done'){h+='<div class="divrow">Today</div>';st=true;}
    const dc=t.done?' done':'',prc=ip?' prow':isHi?' hirow':'';
    const pb=ip?'<span class="perpb">∞</span>':'';
    const k=sid+'_'+ri,drk='dr_'+sid+'_'+ri,oa=(openDP===k),odr=(openDP===drk),ov=(openDP==='val_'+k),oad=(openDP==='ad_'+k),onk=(openNotes===k);
    let db='';
    // CHANGE 3: show "Decision Due Date" label for proposals_out arrival dates
    const arrLabel = (sid==='proposals_out') ? 'Decision Due Date' : '+ date';
    const arrSetLabel = (sid==='proposals_out') ? fmt(t.arrival) : fmt(t.arrival);
    if(m.arr)db=`<span class="dbadge${t.arrival?' set':''}" onclick="tDP('${sid}',${ri})">${t.arrival?arrSetLabel:arrLabel}</span>`;
    if(m.dr){
      const has=t.travelStart||t.travelEnd;
      let lbl=has?((t.travelStart?fmt(t.travelStart):'?')+' to '+(t.travelEnd?fmt(t.travelEnd):'?')):'+ dates';
      db=`<span class="dbadge${has?' set':''}" onclick="tDR('${sid}',${ri})">${lbl}</span>`;
    }
    // Proposals: Out shows Decision Date, Arrival Date and Value in aligned, color-coded columns
    let poCols='',tagLine='';
    if(sid==='dbr'){
      const hv=t.value!==undefined&&t.value!==null&&t.value!=='';
      tagLine=`<div class="tagline"><span class="pcol pc-dec${t.arrival?'':' empty'}" onclick="tDP('${sid}',${ri})">${t.arrival?'Decision '+fmt(t.arrival):'+ decision date'}</span><span class="pcol pc-arr${t.arrDate?'':' empty'}" onclick="tAD('${sid}',${ri})">${t.arrDate?'Arrival '+fmt(t.arrDate):'+ arrival date'}</span><span class="pcol pc-val${hv?'':' empty'}" onclick="tVal('${sid}',${ri})">${hv?fmtVal(t.value):'+ value'}</span></div>`;
      db='';
    }
    if(sid==='proposals_out'){
      const hv=t.value!==undefined&&t.value!==null&&t.value!=='';
      poCols=`<span class="pcol pc-dec${t.arrival?'':' empty'}" onclick="tDP('${sid}',${ri})">${t.arrival?fmt(t.arrival):'+ date'}</span><span class="pcol pc-arr${t.arrDate?'':' empty'}" onclick="tAD('${sid}',${ri})">${t.arrDate?fmt(t.arrDate):'+ date'}</span><span class="pcol pc-val${hv?'':' empty'}" onclick="tVal('${sid}',${ri})">${hv?fmtVal(t.value):'+ value'}</span>`;
      db='';
    }
    // Value ($) badge: stays with the task as it moves between sections
    const hasVal=t.value!==undefined&&t.value!==null&&t.value!=='';
    let valBadge='';
    if(m.val&&sid!=='proposals_out'&&sid!=='dbr')valBadge=`<span class="dbadge${hasVal?' set':''}" onclick="tVal('${sid}',${ri})">${hasVal?fmtVal(t.value):'+ value'}</span>`;
    // CHANGE 2: show time badge if present (hot dates / calls section)
    let timeBadge='';
    if(t.time)timeBadge=`<span class="dbadge set" style="cursor:default">@ ${t.time}</span>`;
    // CHANGE 7: show due date badge for tasks
    let dueBadge='';
    if(m.dueDate&&t.dueDate){
      const today=new Date();today.setHours(0,0,0,0);
      const due=new Date(t.dueDate+'T00:00:00');
      const isOver=due<today,isToday=due.getTime()===today.getTime();
      const dueStyle=isOver?'background:#fdecea;color:#c0392b;border-color:#e8b4b0;':isToday?'background:#fef9ec;color:#b7770d;border-color:#e8c97a;':'';
      dueBadge=`<span class="dbadge set" style="cursor:default;${dueStyle}">Due ${fmt(t.dueDate)}</span>`;
    }
    // CHANGE 6: notes badge — shows if notes exist
    const hasNotes=t.notes&&t.notes.trim().length>0;
    const notesBadge=`<span class="notes-badge" onclick="toggleNotes('${sid}',${ri})">${hasNotes?'Notes ▾':'+ Notes'}</span>`;
    const cc=ip?'chk pc':`chk${t.done?' on':''}`,cx=ip?'∞':t.done?'✓':'';
    const ts=t.done?'text-decoration:line-through;color:#aaa;':'';
    const tx=t.text||'<em style="opacity:.3">empty</em>';
    const drag=t.text?'draggable="true"':'';
    const priBadge=`<span class="pb ${bc(t.priority||'none',sid)}${PRI_SECS.includes(sid)?' lead':''}" onclick="cyc('${sid}',${ri})">${pl(t.priority||'none',sid)}</span>`;
    const leadPri=PRI_SECS.includes(sid)?priBadge:'',trailPri=PRI_SECS.includes(sid)?'':priBadge;
    h+=`<div class="trow${dc}${prc}${tagLine?' tw':''}" data-drag="${k}" ${drag} ondragstart="onDS(event,'${sid}',${ri})" ondragend="onDE()" ondragover="onRDO(event,'${sid}',${ri})" ondragleave="onRDL(event,'${sid}',${ri})">
  <div class="dh"><span></span><span></span><span></span></div>
  <div class="${cc}" onclick="tog('${sid}',${ri})">${cx}</div>
  ${leadPri}<span class="tspan" onclick="startEdit('${sid}',${ri},this.parentElement)" style="${ts}">${tx}</span>
  ${pb}${timeBadge}${dueBadge}${db}${valBadge}${notesBadge}${poCols}${trailPri}
  <button class="delbtn" onclick="del('${sid}',${ri})">&times;</button>
  ${tagLine}
</div>`;
    // Arrival date picker row
    if(oa)h+=`<div class="dprow"><span class="dplbl">${m.ad?'Decision Date:':'Arrival:'}</span><input type="date" id="da_${k}" value="${efy(t.arrival||'')}"/><button class="bp" style="font-size:11px;padding:3px 10px" onclick="cDate('${sid}',${ri})">Set</button>${t.arrival?`<button class="bd" style="font-size:11px;padding:3px 8px" onclick="clDate('${sid}',${ri})">Clear</button>`:''}<button style="font-size:11px;padding:3px 8px" onclick="openDP=null;render()">Cancel</button></div>`;
    // Arrival Date picker (Proposals: Out)
    if(oad)h+=`<div class="dprow"><span class="dplbl">Arrival Date:</span><input type="date" id="dad_${sid}_${ri}" value="${efy(t.arrDate||'')}"/><button class="bp" style="font-size:11px;padding:3px 10px" onclick="cAD('${sid}',${ri})">Set</button>${t.arrDate?`<button class="bd" style="font-size:11px;padding:3px 8px" onclick="clAD('${sid}',${ri})">Clear</button>`:''}<button style="font-size:11px;padding:3px 8px" onclick="openDP=null;render()">Cancel</button></div>`;
    // Value picker row
    if(ov)h+=`<div class="dprow"><span class="dplbl">Value ($):</span><input type="text" inputmode="decimal" id="dv_${sid}_${ri}" value="${hasVal?t.value:''}" placeholder="0" onkeydown="if(event.key==='Enter'){cVal('${sid}',${ri})}"/><button class="bp" style="font-size:11px;padding:3px 10px" onclick="cVal('${sid}',${ri})">Set</button>${hasVal?`<button class="bd" style="font-size:11px;padding:3px 8px" onclick="clVal('${sid}',${ri})">Clear</button>`:''}<button style="font-size:11px;padding:3px 8px" onclick="openDP=null;render()">Cancel</button></div>`;
    // Travel date range picker row
    if(odr)h+=`<div class="dprow"><span class="dplbl">Start:</span><input type="date" id="ds_${sid}_${ri}" value="${efy(t.travelStart||'')}"/><span class="dplbl">End:</span><input type="date" id="de_${sid}_${ri}" value="${efy(t.travelEnd||'')}"/><button class="bp" style="font-size:11px;padding:3px 10px" onclick="cDR('${sid}',${ri})">Set</button>${(t.travelStart||t.travelEnd)?`<button class="bd" style="font-size:11px;padding:3px 8px" onclick="clDR('${sid}',${ri})">Clear</button>`:''}<button style="font-size:11px;padding:3px 8px" onclick="openDP=null;render()">Cancel</button></div>`;
    // CHANGE 6: inline notes panel
    if(onk)h+=`<div class="notes-row"><textarea id="nta_${k}" placeholder="Add notes for this task...">${(t.notes||'').replace(/</g,'&lt;')}</textarea><div class="notes-row-footer"><button onclick="closeNotes()">Cancel</button><button class="bp" style="font-size:11px;padding:3px 10px" onclick="saveNotes('${sid}',${ri})">Save</button></div></div>`;
  });
  const colHead=sid==='proposals_out'?'<div class="colhead"><span class="ch-dec">Decision Date</span><span class="ch-arr">Arrival Date</span><span class="ch-val">Value</span><span class="ch-del"></span></div>':'';
  return`<div class="tlist" ${dz}>${colHead}${h}</div>`;
}

function gmcvbHTML(){
  const parts=[];
  PRI_SECS.forEach(sid=>{
    if(!SM[sid])return;
    if(!(T[sid]||[]).some(t=>t.text&&t.priority==='gmcvb'))return;
    const h=rows(sid,T[sid]||[],'gmcvb');
    if(h)parts.push(`<div class="divrow">${SM[sid].label}</div>${h}`);
  });
  const body=parts.length?parts.join(''):'<div class="noitems">No GMCVB leads yet. Set a task label to GMCVB in DBR or Funnel and it appears here.</div>';
  return`<div class="sec sfull"><div class="shead" style="cursor:default"><span class="stitle">GMCVB Leads</span></div>${body}</div>`;
}
function pipelineData(){
  const order=['definite','tentative','p2','p3'];
  const tot={};order.forEach(k=>{tot[k]={n:0,v:0};});
  PRI_SECS.forEach(sid=>{(T[sid]||[]).forEach(t=>{
    if(!t.text||t.done||!tot[t.priority])return;
    tot[t.priority].n++;const v=Number(t.value);if(!isNaN(v))tot[t.priority].v+=v;
  });});
  return tot;
}
function pipelineHTML(){
  const t=pipelineData();
  const line=(k)=>`<tr><td><span class="pb pri-${k}">${PRI[k]}</span></td><td class="n">${t[k].n} ${t[k].n===1?'task':'tasks'}</td><td class="v">${fmtVal(t[k].v)}</td></tr>`;
  const all=Object.keys(t).reduce((a,k)=>({n:a.n+t[k].n,v:a.v+t[k].v}),{n:0,v:0});
  return`<div class="sec"><div class="shead" style="cursor:default"><span class="stitle">Pipeline<span class="ssub">open items in DBR and Funnel</span></span></div><table class="pipe-tbl"><tbody>${line('definite')}${line('tentative')}${line('p2')}${line('p3')}<tr class="tot"><td>Total pipeline</td><td class="n">${all.n} ${all.n===1?'task':'tasks'}</td><td class="v">${fmtVal(all.v)}</td></tr></tbody></table></div>`;
}

function sec(cls,title,sid,sub,onHeadClick){
  const addBtn=`<button class="shead-add" onclick="event.stopPropagation();openAdd('${sid}')">+ Add</button>`;
  const clickAttr=onHeadClick?`onclick="${onHeadClick}"`:`onclick="openAdd('${sid}')"`;
  return`<div class="sec ${cls}"><div class="shead" ${clickAttr}><span class="stitle">${title}${sub?`<span class="ssub">&middot; ${sub}</span>`:''}</span>${addBtn}</div>${rows(sid,T[sid]||[])}</div>`;
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
      const cc=`chk${t.done?' on':''}`,cx=t.done?'✓':'';
      const ts=t.done?'text-decoration:line-through;color:#aaa;':'';
      const tx=t.text||'<em style="opacity:.3">empty</em>';
      const drag=t.text?'draggable="true"':'';
      const hasNotes=t.notes&&t.notes.trim().length>0;
      const notesBadge=`<span class="notes-badge" onclick="toggleNotes('prospecting',${ri})">${hasNotes?'Notes ▾':'+ Notes'}</span>`;
      const onk=(openNotes===('prospecting_'+ri));
      h+=`<div class="trow${dc}${prc}" data-drag="prospecting_${ri}" ${drag} ondragstart="onDS(event,'prospecting',${ri})" ondragend="onDE()" ondragover="onRDO(event,'prospecting',${ri})" ondragleave="onRDL(event,'prospecting',${ri})">
  <div class="dh"><span></span><span></span><span></span></div>
  <div class="${cc}" onclick="tog('prospecting',${ri})">${cx}</div>
  <span class="tspan" onclick="startEdit('prospecting',${ri},this.parentElement)" style="${ts}">${tx}</span>
  ${notesBadge}<span class="pb ${bc(t.priority||'none')}" onclick="cyc('prospecting',${ri})">${pl(t.priority||'none')}</span>
  <button class="delbtn" onclick="del('prospecting',${ri})">&times;</button>
</div>`;
      if(onk)h+=`<div class="notes-row"><textarea id="nta_prospecting_${ri}" placeholder="Add notes...">${(t.notes||'').replace(/</g,'&lt;')}</textarea><div class="notes-row-footer"><button onclick="closeNotes()">Cancel</button><button class="bp" style="font-size:11px;padding:3px 10px" onclick="saveNotes('prospecting',${ri})">Save</button></div></div>`;
    });
    return h;
  }
  const dz=`ondragover="onDO(event,this)" ondragleave="onDL(event,this)" ondrop="onDrop(event,'prospecting',this)"`;
  return`<div class="proswrap"><div class="shead" onclick="openAdd('prospecting')"><span class="stitle">${label}</span><button class="shead-add" onclick="event.stopPropagation();openAdd('prospecting')">+ Add</button></div><div class="scols"><div class="scol"><div class="tlist" ${dz}>${cr(left)}</div></div><div class="scol"><div class="tlist" ${dz}>${cr(right)}</div></div></div></div>`;
}

function buildSectionDropdown(){
  const sel=document.getElementById('mSec');
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
    ' · '+
    now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:tz});
  document.title=(CFG.ownerName?CFG.ownerName+"'s ":'')+(CFG.reportTitle||'Daily Task List');
  document.querySelector('.hdr-left h1').textContent=(CFG.ownerName?CFG.ownerName+"'s ":'')+(CFG.reportTitle||'Daily Task List');
  const logoImg=document.querySelector('.hdr-logo img');
  if(CFG.logo){logoImg.src=CFG.logo;logoImg.style.display='';document.querySelector('.hdr').style.background=CFG.logoBackground||'#1F3864';}
  else{logoImg.style.display='';}
  let ta=0,td=0,th=0;
  AIDS.forEach(id=>(Array.isArray(T[id])?T[id]:[]).forEach(t=>{if(t.text){ta++;if(t.done)td++;if(hi(id,t)&&!t.done)th++;}}));
  document.getElementById('sT').textContent=ta;
  document.getElementById('sD').textContent=td;
  document.getElementById('sR').textContent=ta-td;
  document.getElementById('sH').textContent=th;
  const cultureLabel=(SM.culture?SM.culture.label:'Culture Club')+' — '+getMeetingDate('culture');
  const affinityLabel=(SM.affinity?SM.affinity.label:'Sales Manager Affinity')+' — '+getMeetingDate('affinity');
  g.innerHTML='';
  // CHANGE 2: "calls" section now renders as "Hot Dates and In-House Groups"
  g.innerHTML+=pipelineHTML();
  if(SM.dbr)g.innerHTML+=sec('sec',SM.dbr.label,'dbr',dbrDate());
  if(SM.proposals_out){g.innerHTML+=sec('sfull',SM.proposals_out.label,'proposals_out');g.innerHTML+=gmcvbHTML();}
if(SM.contracts_out||SM.contracts_closed){
    g.innerHTML+=`<div class="cwrap"><div class="shead" style="pointer-events:none"><span class="stitle">Contracts</span></div><div class="scols">
      <div class="scol"><div class="scholdr"><span>${SM.contracts_out?SM.contracts_out.label:'Out'}</span><button class="scholdr-add" onclick="openAdd('contracts_out')">+ Add</button></div>${rows('contracts_out',T.contracts_out||[])}</div>
      <div class="scol"><div class="scholdr"><span>${SM.contracts_closed?SM.contracts_closed.label:'Closed'}</span><button class="scholdr-add" onclick="openAdd('contracts_closed')">+ Add</button></div>${rows('contracts_closed',T.contracts_closed||[])}</div>
    </div></div>`;
  }
  // CHANGE 4: Tasks section — no page-break CSS anywhere
  if(SM.tasks)g.innerHTML+=sec('sfull',SM.tasks.label,'tasks');
  g.innerHTML+='<div class="sec3">'+(SM.calls?sec('sec',SM.calls.label,'calls'):'')+(SM.prospecting?sec('sec',SM.prospecting.label,'prospecting'):'')+(SM.one_on_one?sec('sec',SM.one_on_one.label,'one_on_one'):'')+'</div>';
  if(SM.culture)g.innerHTML+=sec('sec',cultureLabel,'culture');
  if(SM.affinity)g.innerHTML+=sec('sec',affinityLabel,'affinity');
  if(SM.travel)g.innerHTML+=sec('sfull',SM.travel.label,'travel');
  // CHANGE 5: no Notes section rendered
}

// ── The James Daily Pillar ─────────────────────────────────────────────────
let PIL=null;
function pilEl(){return document.getElementById('pillarText');}
function pilEsc(x){return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function pilRender(msg){
  const nm=document.getElementById('pillarName'),dt=document.getElementById('pillarDate'),el=pilEl();
  if(!PIL||!PIL.text){
    nm.textContent='Today\'s pillar';dt.textContent='';
    el.innerHTML='<p style="color:#888;font-style:italic">'+pilEsc(msg||'The message is drafted at 8 am each weekday. Use Redraft to create it now, or click here to write your own.')+'</p>';
    return;
  }
  nm.textContent=PIL.pillar||'';
  dt.textContent=PIL.date?new Date(PIL.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}):'';
  el.innerHTML=PIL.text.split(/\n\s*\n/).filter(p=>p.trim()).map((p,i)=>'<p'+(i===0?' class="pil-head"':'')+'>'+pilEsc(p.trim())+'</p>').join('');
}
function pilCurrentText(){
  const el=pilEl();
  const kids=Array.from(el.children).map(c=>(c.textContent||'').trim()).filter(Boolean);
  return (kids.length?kids:[(el.textContent||'').trim()].filter(Boolean)).join('\n\n');
}
function pilEtNow(){
  const tz=CFG.timezone||'America/New_York';
  const o={};
  new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hour12:false,weekday:'short'}).formatToParts(new Date()).forEach(p=>{o[p.type]=p.value;});
  return{iso:o.year+'-'+o.month+'-'+o.day,hour:(+o.hour)%24,weekday:o.weekday!=='Sat'&&o.weekday!=='Sun'};
}
async function pilGenerate(force){
  const btn=document.getElementById('pillarGenBtn');
  btn.disabled=true;btn.textContent='Drafting...';
  try{
    const r=await fetch('/.netlify/functions/pillar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'generate',force:!!force})});
    const d=await r.json();
    if(r.ok&&d&&d.text){PIL=d;pilRender();}
    else pilRender(PIL&&PIL.text?null:'Could not draft the message right now. Click Redraft to try again, or click here to write your own.');
  }catch(e){if(!PIL||!PIL.text)pilRender('Could not reach the drafting service. Click Redraft to try again.');}
  btn.disabled=false;btn.textContent='Redraft';
}
function pillarRedraft(){
  if(PIL&&PIL.edited&&!confirm('Redrafting replaces your edits to today\'s message. Continue?'))return;
  pilGenerate(true);
}
function pillarCopy(){
  const head=(PIL&&PIL.pillar?'The James Daily Pillar: '+PIL.pillar+'\n\n':'');
  const txt=head+pilCurrentText();
  const done=()=>{const b=document.getElementById('pillarCopyBtn');b.textContent='Copied';setTimeout(()=>{b.textContent='Copy to share';},1500);};
  try{navigator.clipboard.writeText(txt).then(done,()=>{});}catch(e){}
}
async function pilSave(){
  const text=pilCurrentText();
  if(!text||(PIL&&text===PIL.text))return;
  PIL=Object.assign({},PIL||{},{text,edited:true});
  try{await fetch('/.netlify/functions/pillar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',text})});}catch(e){}
}
async function loadPillar(){
  try{
    const r=await fetch('/.netlify/functions/pillar');
    if(r.ok){const d=await r.json();if(d&&d.text)PIL=d;}
  }catch(e){}
  pilRender();
  // Safety net: if the 8 am draft has not landed yet on a weekday, draft it now
  const n=pilEtNow();
  if(n.weekday&&n.hour>=8&&(!PIL||PIL.date!==n.iso))pilGenerate(false);
}
pilEl().addEventListener('blur',pilSave);

// ── Init ───────────────────────────────────────────────────────────────────
async function init(){
  await loadConfig();
  SM=getSM();
  AIDS=Object.keys(SM);
  buildSectionDropdown();
  await loadFromCloud();
  sf('all');
  render();
  loadPillar();
}
init();
