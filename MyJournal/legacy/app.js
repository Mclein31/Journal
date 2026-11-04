/* ── STATE ── */
let tasks    = JSON.parse(localStorage.getItem('mlw_t') || '[]');
let journals = JSON.parse(localStorage.getItem('mlw_j') || '[]');
let gallery  = [];
let prefs    = JSON.parse(localStorage.getItem('mlw_p') || '{"theme":"pink","hFont":"Gaegu","bFont":"Caveat","dark":false,"showDone":true,"groupByDate":true,"showOverdue":true,"gv":"clothesline","bg":"none","bgUrl":"","lastTab":"schedule","autoKoOnSave":true}');
let saveState = 'saved';
let undoStack = null;


/* ── BUILT-IN EMPANADA BACKGROUND ── */
// Tiled emoji background — no external file needed
const EMPANADA_BG = null; // uses CSS emoji pattern instead

let filt='all', sort='date', editTId=null, editJId=null, curPage=0, selMood='', showIdx=false;

const QUOTES=[
  {t:"You are enough, just as you are.",a:"— Megan Markle"},
  {t:"She believed she could, so she did.",a:"— R.S. Grey"},
  {t:"A little progress each day adds up to big results.",a:"— Satya Nadella"},
  {t:"Be yourself; everyone else is already taken.",a:"— Oscar Wilde"},
  {t:"Small steps are still steps.",a:"— Unknown"},
  {t:"You deserve the love you give to others.",a:"— Unknown"},
  {t:"The secret of getting ahead is getting started.",a:"— Mark Twain"},
  {t:"Make today so awesome, yesterday gets jealous.",a:"— Unknown"},
  {t:"Bloom where you are planted.",a:"— Unknown"},
  {t:"Kindness is always fashionable.",a:"— Amelia Barr"},
];

const CAT={
  personal:{l:'Personal',e:'🌸',s:'#f4a7b9'},
  work    :{l:'Work',    e:'💼',s:'#90caf9'},
  health  :{l:'Health',  e:'🌿',s:'#a8d5ba'},
  creative:{l:'Creative',e:'🎨',s:'#ffcc80'},
  study   :{l:'Study',   e:'📚',s:'#ce93d8'},
  social  :{l:'Social',  e:'💬',s:'#f48fb1'},
  other   :{l:'Other',   e:'✦', s:'#b0bec5'},
};

function normalizePrefs(){
  const defaults={theme:'pink',hFont:'Gaegu',bFont:'Caveat',dark:false,showDone:true,groupByDate:true,showOverdue:true,gv:'clothesline',bg:'none',bgUrl:'',lastTab:'schedule',autoKoOnSave:true};
  let touched=false;
  for(const k of Object.keys(defaults)){
    if(prefs[k]===undefined){prefs[k]=defaults[k];touched=true;}
  }
  if(touched)localStorage.setItem('mlw_p',JSON.stringify(prefs));
}

async function bootApp(){
  normalizePrefs();
  applyPrefs();
  startClock();
  const q=QUOTES[new Date().getDay()%QUOTES.length];
  document.getElementById('qt').textContent='"'+q.t+'"';
  document.getElementById('qa').textContent=q.a;
  try{
    gallery=await MLWStorage.loadGallery();
  }catch{
    gallery=JSON.parse(localStorage.getItem('mlw_g')||'[]');
  }
  initRouting();
  registerGalleryDelegation();
  registerServiceWorker();
  renderAll();
  renderCal();
  updateStorageBar();
  dismissSplash();
}

function save(){
  saveState='saving';
  updateSaveStatus();
  localStorage.setItem('mlw_t',JSON.stringify(tasks));
  localStorage.setItem('mlw_j',JSON.stringify(journals));
  localStorage.setItem('mlw_p',JSON.stringify(prefs));
  Promise.resolve(MLWStorage.persistGallery(gallery)).then((result)=>{
    if(result&&result.error){
      saveState='error';
      toast('⚠️ Storage full — export a backup or remove photos');
    }else saveState='saved';
    updateSaveStatus();
    updateStorageBar();
  });
}
function renderAll(){renderTasks();renderJournal();renderGallery();updateBadges();}

/* ── CLOCK ── */
function startClock(){
  const el=document.getElementById('clock');
  function tick(){el.textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})+'  ·  '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});}
  tick();setInterval(tick,1000);
}

/* ── TABS ── */
function switchTab(n,b){
  document.querySelectorAll('.tab').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(x=>{x.classList.remove('active');x.removeAttribute('aria-current');});
  document.getElementById('tab-'+n).classList.add('active');
  b.classList.add('active');
  b.setAttribute('aria-current','page');
  prefs.lastTab=n;
  localStorage.setItem('mlw_p',JSON.stringify(prefs));
  const hash='#'+n;
  if(location.hash!==hash)history.replaceState(null,'',hash);
}

/* ── BADGES ── */
function updateBadges(){
  document.getElementById('bs').textContent=tasks.filter(t=>!t.completed).length;
  document.getElementById('bj').textContent=journals.length;
  document.getElementById('bg').textContent=gallery.length;
}

/* ── TOAST ── */
function toast(m,opts){
  const el=document.createElement('div');el.className='toast';
  const span=document.createElement('span');span.textContent=m;el.appendChild(span);
  if(opts&&opts.undo){
    const btn=document.createElement('button');btn.type='button';btn.className='toast-undo';btn.textContent='Undo';
    btn.onclick=()=>{opts.undo();el.remove();};
    el.appendChild(btn);
    el.style.pointerEvents='auto';
  }
  document.getElementById('tc').appendChild(el);
  setTimeout(()=>el.remove(),opts&&opts.undo?4500:2700);
}
function undoPush(){/* reserved */}

function updateSaveStatus(){
  const el=document.getElementById('save-status');
  if(!el)return;
  el.dataset.state=saveState;
  el.textContent=saveState==='saving'?'Saving…':saveState==='error'?'Save failed':'All changes saved';
}

async function updateStorageBar(){
  const el=document.getElementById('storage-info');
  if(!el||!MLWStorage.storageInfo)return;
  const {used,quota}=await MLWStorage.storageInfo();
  const usedMb=(used/1048576).toFixed(1);
  if(quota){
    const pct=Math.min(100,Math.round((used/quota)*100));
    el.textContent=`Storage: ${usedMb} MB · ${pct}% of browser quota`;
    el.classList.toggle('storage-warn',pct>85);
  }else el.textContent=`Local data: ~${usedMb} MB`;
}

async function exportBackup(){
  const meta=gallery.map(({id,date,name})=>({id,date,name}));
  const photos=await MLWStorage.exportGalleryBlobs(meta);
  const payload={version:1,exportedAt:new Date().toISOString(),tasks,journals,prefs,gallery:meta,photos};
  MLWUtils.downloadJSON(`my-little-world-backup-${todayStr()}.json`,payload);
  toast('📦 Backup downloaded!');
}

async function importBackup(file){
  const text=await file.text();
  let data;
  try{data=JSON.parse(text);}catch{toast('⚠️ Invalid backup file');return;}
  if(!data||!Array.isArray(data.tasks)||!Array.isArray(data.journals)) {toast('⚠️ Backup format not recognized');return;}
  if(!confirm('Replace all current data with this backup?'))return;
  MLWStorage.revokeGalleryUrls(gallery);
  tasks=data.tasks;
  journals=data.journals;
  prefs={...prefs,...data.prefs};
  const meta=Array.isArray(data.gallery)?data.gallery:[];
  const photos=data.photos||{};
  gallery=await MLWStorage.importGalleryBlobs(meta,photos);
  applyPrefs();
  save();renderAll();closeModal('set-modal');
  toast('✓ Backup restored!');
}

function initRouting(){
  const tabs=['schedule','journal','gallery'];
  const go=()=>{
    const name=(location.hash.replace('#','')||prefs.lastTab||'schedule').toLowerCase();
    const n=tabs.includes(name)?name:'schedule';
    const btns=document.querySelectorAll('.nb');
    const idx=tabs.indexOf(n);
    if(btns[idx])switchTab(n,btns[idx]);
  };
  window.addEventListener('hashchange',go);
  if(!location.hash&&prefs.lastTab)history.replaceState(null,'','#'+prefs.lastTab);
  go();
}

function registerGalleryDelegation(){
  const track=document.getElementById('photos-track');
  const gv=document.getElementById('gv');
  const handler=(e)=>{
    const del=e.target.closest('[data-del-photo]');
    if(del){e.stopPropagation();delPhoto(del.dataset.delPhoto);return;}
    const zoom=e.target.closest('[data-zoom-photo]');
    if(zoom){openLBById(zoom.dataset.zoomPhoto);return;}
  };
  track&&track.addEventListener('click',handler);
  gv&&gv.addEventListener('click',handler);
}

function registerServiceWorker(){
  if(!('serviceWorker'in navigator))return;
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

function promptInstall(){
  const deferred=window._mlwInstallPrompt;
  if(deferred){deferred.prompt();deferred.userChoice.then(()=>{window._mlwInstallPrompt=null;hideInstallBanner();});}
}
function hideInstallBanner(){const b=document.getElementById('install-banner');if(b)b.hidden=true;}
window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();window._mlwInstallPrompt=e;const b=document.getElementById('install-banner');if(b)b.hidden=false;});

/* ── MODALS ── */
function openModal(id){document.getElementById(id).classList.add('open');document.body.style.overflow='hidden';}
function closeModal(id){document.getElementById(id).classList.remove('open');document.body.style.overflow='';}
function oClick(e,id){if(e.target===document.getElementById(id))closeModal(id);}
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.ov.open').forEach(m=>closeModal(m.id));});

/* ── TASKS ── */
function openTask(id){
  editTId=id||null;
  if(id){
    const t=tasks.find(t=>t.id===id);
    document.getElementById('tmH').textContent='✦ Edit Task';
    document.getElementById('tT').value=t.title;
    document.getElementById('tD').value=t.date||'';
    document.getElementById('tTm').value=t.time||'';
    document.getElementById('tCat').value=t.cat||'personal';
    document.getElementById('tPri').value=t.pri||'medium';
    document.getElementById('tN').value=t.notes||'';
  }else{
    document.getElementById('tmH').textContent='✦ Add New Task';
    document.getElementById('tT').value='';
    document.getElementById('tD').value=todayStr();
    document.getElementById('tTm').value='';
    document.getElementById('tCat').value='personal';
    document.getElementById('tPri').value='medium';
    document.getElementById('tN').value='';
  }
  openModal('task-modal');
  setTimeout(()=>document.getElementById('tT').focus(),220);
}

function saveTask(){
  const title=document.getElementById('tT').value.trim();
  if(!title){toast('⚠️ Please enter a title!');return;}
  const d={title,date:document.getElementById('tD').value,time:document.getElementById('tTm').value,cat:document.getElementById('tCat').value,pri:document.getElementById('tPri').value,notes:document.getElementById('tN').value.trim()};
  if(editTId){
    const i=tasks.findIndex(t=>t.id===editTId);tasks[i]={...tasks[i],...d};toast('✏️ Task updated!');
  }else{
    tasks.push({id:uid(),completed:false,createdAt:Date.now(),...d});toast('✓ Task added!');
  }
  save();renderTasks();updateBadges();closeModal('task-modal');
}

function delTask(id){
  if(!confirm('Delete this task?'))return;
  const removed=tasks.find(t=>t.id===id);
  tasks=tasks.filter(t=>t.id!==id);
  save();renderTasks();updateBadges();
  if(removed)undoPush({type:'task',item:removed});
  toast('🗑️ Task deleted',{undo:()=>{tasks.push(removed);save();renderTasks();updateBadges();}});
}
function togDone(id){const t=tasks.find(t=>t.id===id);if(!t)return;t.completed=!t.completed;save();renderTasks();updateBadges();if(t.completed)toast('🎉 Task done!');}
function setF(f,el){filt=f;document.querySelectorAll('.filter-row .chip').forEach(c=>c.classList.remove('active'));el.classList.add('active');renderTasks();}
function setSort(v){sort=v;renderTasks();}
function toggleShowDone(){prefs.showDone=!prefs.showDone;document.getElementById('sdTog').classList.toggle('on',prefs.showDone);save();renderTasks();}
function toggleGroup(){prefs.groupByDate=!prefs.groupByDate;document.getElementById('grpTog').classList.toggle('on',prefs.groupByDate);save();renderTasks();}
function toggleOverdue(){prefs.showOverdue=!prefs.showOverdue;document.getElementById('ovTog').classList.toggle('on',prefs.showOverdue);save();renderTasks();}
function toggleAutoKo(){
  prefs.autoKoOnSave=!prefs.autoKoOnSave;
  document.getElementById('koTog').classList.toggle('on',prefs.autoKoOnSave);
  save();
}

function renderTasks(){
  const list=document.getElementById('task-list');list.innerHTML='';
  let items=tasks.filter(t=>filt==='all'||t.cat===filt);
  if(!prefs.showDone)items=items.filter(t=>!t.completed);
  const today=todayStr();
  document.getElementById('sTot').textContent=tasks.length;
  document.getElementById('sDone').textContent=tasks.filter(t=>t.completed).length;
  document.getElementById('sToday').textContent=tasks.filter(t=>t.date===today&&!t.completed).length;
  if(items.length===0){list.innerHTML='<div class="empty-st"><div class="ei">📋</div><h3>Nothing here yet</h3><p>Add a task and get things done ♡</p></div>';return;}
  const po={high:0,medium:1,low:2};
  items.sort((a,b)=>{
    if(!prefs.showDone&&a.completed!==b.completed)return a.completed?1:-1;
    if(sort==='priority')return(po[a.pri||'medium']||1)-(po[b.pri||'medium']||1);
    if(sort==='category')return(a.cat||'').localeCompare(b.cat||'');
    if(sort==='az')return a.title.localeCompare(b.title);
    return(a.date||'9999')<(b.date||'9999')?-1:1;
  });
  const overdue=items.filter(t=>t.date&&t.date<today&&!t.completed);
  if(prefs.showOverdue&&overdue.length){
    const b=document.createElement('div');b.className='overdue-banner';
    b.innerHTML=`<span style="font-size:1.1rem">⚠️</span><div><strong style="font-size:.87rem;color:#c62828">${overdue.length} overdue task${overdue.length>1?'s':''}</strong><br><span style="font-size:.77rem;color:#e57373">Don't forget them!</span></div>`;
    list.appendChild(b);
  }
  if(prefs.groupByDate&&sort==='date'){
    const groups={};
    items.forEach(t=>{const k=t.date||'no-date';if(!groups[k])groups[k]=[];groups[k].push(t);});
    Object.keys(groups).sort().forEach(k=>{
      const d=document.createElement('div');d.className='ddiv';d.textContent=k==='no-date'?'📌 No Date':fmtDateFull(k);list.appendChild(d);
      groups[k].forEach(t=>list.appendChild(mkCard(t)));
    });
  }else{items.forEach(t=>list.appendChild(mkCard(t)));}
}

function mkCard(t){
  const card=document.createElement('div');card.className='tc-card'+(t.completed?' done':'');
  const m=CAT[t.cat]||CAT.other;const p=t.pri||'medium';
  card.style.setProperty('--sc',m.s);
  card.innerHTML=`
    <div class="tc-chk" onclick="togDone('${t.id}')">${t.completed?'✓':''}</div>
    <div class="tc-body">
      <div class="tc-title">${esc(t.title)}</div>
      <div class="tc-meta">
        ${t.date?`<span class="tc-time">📅 ${fmtDate(t.date)}${t.time?' · '+fmtTime(t.time):''}</span>`:''}
        <span class="tc-cat c-${t.cat}">${m.e} ${m.l}</span>
        <span class="tc-pri p-${p}">${{high:'🔴 High',medium:'🟡 Med',low:'🟢 Low'}[p]}</span>
      </div>
      ${t.notes?`<div class="tc-notes">${esc(t.notes)}</div>`:''}
    </div>
    <div class="tc-acts">
      <button class="iBtn" onclick="openTask('${t.id}')" title="Edit">✏️</button>
      <button class="iBtn del" onclick="delTask('${t.id}')" title="Delete">🗑️</button>
    </div>`;
  return card;
}

/* ── JOURNAL ── */
function openJournal(id){
  editJId=id||null;selMood='';
  document.querySelectorAll('.mood-c').forEach(c=>c.classList.remove('on'));
  if(id){
    const e=journals.find(e=>e.id===id);
    document.getElementById('jmH').textContent='✦ Edit Entry';
    document.getElementById('jT').value=e.title;document.getElementById('jC').value=e.content;
    if(e.mood){selMood=e.mood;document.querySelectorAll('.mood-c').forEach(c=>{if(c.textContent===e.mood)c.classList.add('on');});}
  }else{
    document.getElementById('jmH').textContent='✦ New Entry';
    document.getElementById('jT').value='';document.getElementById('jC').value='';
  }
  openModal('j-modal');
}

function pickMood(el){document.querySelectorAll('.mood-c').forEach(c=>c.classList.remove('on'));el.classList.add('on');selMood=el.textContent;}

async function saveEntry(){
  let title=document.getElementById('jT').value.trim();
  let content=document.getElementById('jC').value.trim();
  if(!title&&!content){toast('⚠️ Write something first!');return;}
  const saveBtn=document.querySelector('#j-modal .btn-p');
  if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Saving…';}
  try{
    let converted=false;
    if(prefs.autoKoOnSave!==false){
      if(typeof MLWKorean==='undefined'){
        toast('⚠️ Translation script missing — use http://localhost:8080');
      }else{
        if(MLWKorean.shouldTranslate(title)){
          toast('✨ Converting title to Korean…');
          const out=await MLWKorean.prepareJournalTitle(title);
          if(out.title)title=out.title;
          converted=out.changed;
          if(out.failed){
            toast('⚠️ Title could not translate — saved in English');
          }else if(!converted){
            toast('⚠️ Title unchanged — try a short phrase (not one word)');
          }
        }
      }
    }
    if(editJId){
      const i=journals.findIndex(e=>e.id===editJId);
      journals[i]={...journals[i],title:title||'Untitled',content,mood:selMood};
      toast(converted?'🇰🇷 Title updated in Korean!':'✏️ Entry updated');
    }else{
      journals.push({id:uid(),title:title||'Untitled',content,mood:selMood,date:fullDate()});
      curPage=journals.length-1;
      toast(converted?'🇰🇷 Title saved in Korean!':'✒️ Entry written!');
    }
    save();renderJournal();updateBadges();closeModal('j-modal');
  }catch{
    toast('⚠️ Could not translate — check your internet');
  }finally{
    if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Write It ✒️';}
  }
}

function delEntry(id){
  if(!confirm('Delete this entry?'))return;
  const removed=journals.find(e=>e.id===id);
  const oldPage=curPage;
  journals=journals.filter(e=>e.id!==id);
  if(curPage>=journals.length)curPage=Math.max(0,journals.length-1);
  save();renderJournal();updateBadges();
  if(removed)toast('🗑️ Entry deleted',{undo:()=>{journals.splice(Math.min(oldPage,journals.length),0,removed);curPage=Math.min(oldPage,journals.length-1);save();renderJournal();updateBadges();}});
  else toast('🗑️ Entry deleted');
}

function goPage(dir){
  const np=curPage+dir;if(np<0||np>=journals.length)return;curPage=np;
  const b=document.getElementById('the-book');b.classList.remove('pFlip');void b.offsetWidth;b.classList.add('pFlip');
  renderJournal();
}

function toggleIdx(){
  showIdx=!showIdx;
  document.getElementById('j-idx').style.display=showIdx?'block':'none';
  if(showIdx)renderIdx();
}

function renderIdx(){
  const list=document.getElementById('idx-list'),empty=document.getElementById('idx-empty');
  list.innerHTML='';
  if(journals.length===0){empty.style.display='';return;}empty.style.display='none';
  journals.forEach((e,i)=>{
    const item=document.createElement('div');item.className='idx-item'+(i===curPage?' cur':'');
    item.innerHTML=`<span class="idx-n">${i+1}</span><span class="idx-t">${esc(e.title)}</span><span class="idx-d">${e.date?e.date.split(',')[0]:''}</span>`;
    item.onclick=()=>{curPage=i;renderJournal();if(showIdx)renderIdx();};
    list.appendChild(item);
  });
}

function renderJournal(){
  const content=document.getElementById('b-content'),pnum=document.getElementById('pnum'),pacts=document.getElementById('pacts'),plabel=document.getElementById('plabel');
  if(journals.length===0){
    content.innerHTML='<div class="j-blank"><div class="ei">🌙</div><p>Your story begins here…<br>Write your first journal entry ♡</p></div>';
    pnum.textContent='';pacts.innerHTML='';plabel.textContent='—';return;
  }
  const e=journals[curPage];
  plabel.textContent=`Page ${curPage+1} of ${journals.length}`;pnum.textContent=curPage+1;
  pacts.innerHTML=`<button class="iBtn" onclick="openJournal('${e.id}')" style="width:26px;height:26px;font-size:.76rem">✏️</button><button class="iBtn del" onclick="delEntry('${e.id}')" style="width:26px;height:26px;font-size:.76rem">🗑️</button>`;
  content.innerHTML=journalPageHTML(e);
  if(showIdx)renderIdx();
}

function journalPageHTML(e){
  const titleLang=hasHangul(e.title)?' lang="ko"':'';
  return`<div class="p-hd"><div class="p-date">${esc(e.date||'')}</div>${e.mood?`<div class="p-mood">${esc(e.mood)}</div>`:''}</div><div class="p-title"${titleLang}>${esc(e.title)}</div><div class="p-body">${esc(e.content)}</div>`;
}

/* ── GALLERY ── */
function setGV(v){
  prefs.gv=v;save();
  document.getElementById('cl-view').style.display=v==='clothesline'?'':'none';
  document.getElementById('gv').classList.toggle('show',v==='grid');
  document.getElementById('vCL').classList.toggle('on',v==='clothesline');
  document.getElementById('vGR').classList.toggle('on',v==='grid');
}

async function addPhotosFromFiles(files){
  let n=0;
  for(const f of files){
    if(!f.type.startsWith('image/'))continue;
    const src=(typeof MLWUtils!=='undefined'&&MLWUtils.compressImage)?(await MLWUtils.compressImage(f))||(await readF(f)):await readF(f);
    gallery.push({id:uid(),src,date:shortDate(),name:f.name});
    n++;
  }
  if(n){save();renderGallery();updateBadges();toast(`📷 ${n} photo${n>1?'s':''} added!`);}
}

async function handleUpload(e){
  const files=Array.from(e.target.files);
  await addPhotosFromFiles(files);
  e.target.value='';
}

function handleDrop(e){
  e.preventDefault();document.getElementById('upz').classList.remove('drag');
  const files=Array.from(e.dataTransfer.files);
  addPhotosFromFiles(files);
}

function readF(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=rej;r.readAsDataURL(f);});}
function delPhoto(id){
  const removed=gallery.find(p=>p.id===id);
  gallery=gallery.filter(p=>p.id!==id);
  save();renderGallery();updateBadges();
  if(removed)toast('🗑️ Photo removed',{undo:()=>{gallery.push(removed);save();renderGallery();updateBadges();}});
  else toast('🗑️ Photo removed');
}
function openLB(src){document.getElementById('lbImg').src=src;openModal('lightbox');}
function openLBById(id){const p=gallery.find(x=>x.id===id);if(p&&p.src)openLB(p.src);}

function renderGallery(){
  const track=document.getElementById('photos-track'),gv=document.getElementById('gv'),empty=document.getElementById('gEmpty');
  track.innerHTML='';gv.innerHTML='';
  if(gallery.length===0){empty.style.display='';return;}empty.style.display='none';
  const durs=[3.8,4.5,5.2,4.1,5.8,3.5];
  gallery.forEach((p,i)=>{
    // clothesline
    const item=document.createElement('div');item.className='ph-item '+(i%2===0?'r1':'r2');
    item.style.setProperty('--sd',durs[i%durs.length]+'s');
    item.innerHTML=`<div class="pin"><div class="pin-sp"></div></div><div class="polaroid"><img src="${p.src}" alt="${esc(p.name||'photo')}" loading="lazy" onclick="openLB('${p.src}')"><div class="polaroid-cap">${esc(p.date)}</div><button class="ph-del" onclick="delPhoto('${p.id}')">✕</button></div>`;
    track.appendChild(item);
    // grid
    const gi=document.createElement('div');gi.className='gg-item';
    gi.innerHTML=`<img src="${p.src}" alt="${esc(p.name||'photo')}" loading="lazy"><div class="gg-ov" onclick="openLB('${p.src}')"><span style="font-size:1.4rem">🔍</span><span>${esc(p.date)}</span><button class="btn btn-g btn-sm" onclick="event.stopPropagation();delPhoto('${p.id}')" style="padding:3px 12px;font-size:.74rem">Delete</button></div>`;
    gv.appendChild(gi);
  });
  setGV(prefs.gv||'clothesline');
}

/* ── SETTINGS ── */
function applyTheme(theme,el){
  prefs.theme=theme; prefs.dark=(theme==='dark');
  document.documentElement.setAttribute('data-theme',theme==='pink'?'':theme);
  document.querySelectorAll('.sw').forEach(s=>s.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('dkTog').classList.toggle('on',prefs.dark);
  save(); toast('🎨 Theme applied!');
}

const KO_FALLBACK="'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
function headerFontStack(font){
  if(font==='Gaegu')return`'Gaegu',${KO_FALLBACK}`;
  return`'${font}',cursive,sans-serif`;
}
function bodyFontStack(font){
  if(font==='Caveat')return`'Caveat',cursive,sans-serif`;
  if(font==='Gaegu')return`'Gaegu',${KO_FALLBACK}`;
  return`'${font}',sans-serif`;
}
function hasHangul(s){return/[\u3131-\u318E\uAC00-\uD7A3]/.test(s||'');}

function applyHFont(font,el){
  prefs.hFont=font;
  const stack=headerFontStack(font);
  document.documentElement.style.setProperty('--fh-font',stack);
  document.documentElement.style.setProperty('--fd',stack);
  document.documentElement.style.setProperty('--fh',stack);
  document.documentElement.style.setProperty('--font-ko',stack);
  document.querySelectorAll('#hfont-pills .fp').forEach(b=>b.classList.remove('on'));
  el.classList.add('on'); save();
}

function applyBFont(font,el){
  prefs.bFont=font;
  const stack=bodyFontStack(font);
  document.documentElement.style.setProperty('--fb-font',stack);
  document.documentElement.style.setProperty('--fb',stack);
  document.documentElement.style.setProperty('--font-body',stack);
  document.querySelectorAll('#bfont-pills .fp').forEach(b=>b.classList.remove('on'));
  el.classList.add('on'); save();
}

/* kept for backward compat */
function applyFont(font,el){ applyBFont(font,el); }

function toggleDark(){
  prefs.dark=!prefs.dark; prefs.theme=prefs.dark?'dark':'pink';
  document.documentElement.setAttribute('data-theme',prefs.dark?'dark':'');
  document.getElementById('dkTog').classList.toggle('on',prefs.dark);
  document.querySelectorAll('.sw').forEach(s=>s.classList.remove('on'));
  document.querySelector(prefs.dark?'.sw-dark':'.sw-blossom')?.classList.add('on');
  save();
}

/* ── BACKGROUND ── */
function applyBg(type,wrapEl){
  prefs.bg=type;
  // update swatch highlights
  document.querySelectorAll('.bg-swatch').forEach(s=>s.classList.remove('on'));
  const sw=document.getElementById('bgsw-'+type);
  if(sw) sw.classList.add('on');
  // show/hide empanada input row
  const hint=document.getElementById('empanada-hint');
  const row=document.getElementById('empanada-input-row');
  if(type==='empanada'){
    if(hint) hint.style.display='none';
    if(row) row.style.display='none';
    // Use CSS emoji tiled pattern — no external file needed
    document.documentElement.style.setProperty('--bg-image','none');
    document.body.classList.add('has-bg-image');
    document.body.classList.add('bg-empanada-pattern');
    prefs.bgUrl='__builtin__';
  } else {
    if(hint) hint.style.display='none';
    if(row) row.style.display='none';
    document.documentElement.style.setProperty('--bg-image','none');
    document.body.classList.remove('has-bg-image');
    document.body.classList.remove('bg-empanada-pattern');
    prefs.bgUrl='';
  }
  save();
}

function previewEmpanada(url){
  if(!url.trim()) return;
  prefs.bgUrl=url.trim(); save();
  applyBgUrl(url.trim());
}

function loadEmpanada(e){
  const file=e.target.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=ev=>{
    prefs.bgUrl=ev.target.result; save();
    document.getElementById('empanada-url').value='(uploaded file)';
    applyBgUrl(ev.target.result);
  };
  r.readAsDataURL(file);
}

function applyBgUrl(url){
  const css=url.startsWith('data:')?`url("${url.replace(/"/g,'')}")`:`url("${url.replace(/\\/g,'/').replace(/"/g,'')}")`;
  document.documentElement.style.setProperty('--bg-image',css);
  document.body.classList.add('has-bg-image');
}

function applyPrefs(){
  // theme
  if(prefs.theme&&prefs.theme!=='pink') document.documentElement.setAttribute('data-theme',prefs.theme);
  // header font — set all header-related vars directly
  const hf=prefs.hFont||'Gaegu';
  const hstack=headerFontStack(hf);
  document.documentElement.style.setProperty('--fh-font',hstack);
  document.documentElement.style.setProperty('--fd',hstack);
  document.documentElement.style.setProperty('--fh',hstack);
  document.documentElement.style.setProperty('--font-ko',hstack);
  const bf=prefs.bFont||'Caveat';
  const bstack=bodyFontStack(bf);
  document.documentElement.style.setProperty('--fb-font',bstack);
  document.documentElement.style.setProperty('--fb',bstack);
  document.documentElement.style.setProperty('--font-body',bstack);
  // toggles
  document.getElementById('dkTog').classList.toggle('on',!!prefs.dark);
  document.getElementById('grpTog').classList.toggle('on',prefs.groupByDate!==false);
  document.getElementById('ovTog').classList.toggle('on',prefs.showOverdue!==false);
  document.getElementById('sdTog').classList.toggle('on',prefs.showDone!==false);
  document.getElementById('koTog')?.classList.toggle('on',prefs.autoKoOnSave!==false);
  // theme swatch
  const sm={pink:'.sw-blossom',mint:'.sw-mint',lavender:'.sw-lav',peach:'.sw-peach',sky:'.sw-sky',dark:'.sw-dark'};
  document.querySelector(sm[prefs.theme]||'.sw-blossom')?.classList.add('on');
  // header font pills
  document.querySelectorAll('#hfont-pills .fp').forEach(b=>{
    const label=b.textContent.trim().replace('가 ','');
    b.classList.toggle('on',label===hf);
  });
  // body font pills
  document.querySelectorAll('#bfont-pills .fp').forEach(b=>{
    const label=b.textContent.trim().replace('가 ','');
    b.classList.toggle('on',label===bf);
  });
  // background
  if(prefs.bg==='empanada'){
    document.body.classList.add('has-bg-image','bg-empanada-pattern');
    document.getElementById('bgsw-empanada')?.classList.add('on');
    document.getElementById('bgsw-none')?.classList.remove('on');
    const hint=document.getElementById('empanada-hint');
    const row=document.getElementById('empanada-input-row');
    if(hint) hint.style.display='none';
    if(row) row.style.display='none';
  } else if(prefs.bg==='custom'&&prefs.bgUrl&&prefs.bgUrl!=='__builtin__'){
    applyBgUrl(prefs.bgUrl);
    document.getElementById('bgsw-none')?.classList.add('on');
  } else {
    document.getElementById('bgsw-none')?.classList.add('on');
  }
}

async function clearAll(){
  MLWStorage.revokeGalleryUrls(gallery);
  tasks=[];journals=[];gallery=[];
  await MLWStorage.clearAllPhotos();
  localStorage.removeItem('mlw_t');
  localStorage.removeItem('mlw_j');
  localStorage.removeItem('mlw_p');
  prefs=JSON.parse('{"theme":"pink","hFont":"Gaegu","bFont":"Caveat","dark":false,"showDone":true,"groupByDate":true,"showOverdue":true,"gv":"clothesline","bg":"none","bgUrl":"","lastTab":"schedule","autoKoOnSave":true}');
  applyPrefs();
  save();renderAll();closeModal('set-modal');toast('🧹 All data cleared');
}

/* ── UTILS ── */
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2);}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function todayStr(){return new Date().toISOString().split('T')[0];}
function shortDate(){return new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function fullDate(){return new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});}
function fmtDate(d){if(!d)return'';const[y,m,day]=d.split('-').map(Number);return new Date(y,m-1,day).toLocaleDateString('en-US',{month:'short',day:'numeric'});}
function fmtDateFull(d){
  const today=todayStr();if(d===today)return'📅 Today';
  const[y,m,day]=d.split('-').map(Number);const date=new Date(y,m-1,day);
  const diff=Math.round((date-new Date(todayStr()))/(864e5));
  if(diff===1)return'📅 Tomorrow';if(diff===-1)return'⚠️ Yesterday';
  if(diff<0)return`⚠️ ${Math.abs(diff)} days ago`;
  return'📅 '+date.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
}
function fmtTime(t){if(!t)return'';const[h,m]=t.split(':').map(Number);return(h%12||12)+':'+String(m).padStart(2,'0')+(h>=12?' PM':' AM');}
function wordCount(s){return s.trim().split(/\s+/).filter(Boolean).length;}

/* ── WELCOME SPLASH ── */
function dismissSplash(){
  const sp=document.getElementById('splash');
  if(!sp) return;
  sp.classList.add('hide');
  setTimeout(()=>sp&&sp.remove(),700);
}

/* ── KEYBOARD SHORTCUTS ── */
let kbOpen=false;
function toggleKB(){
  kbOpen=!kbOpen;
  document.getElementById('kb-panel').classList.toggle('show',kbOpen);
}
document.addEventListener('keydown',e=>{
  const tag=document.activeElement.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
  if(e.key==='Escape'){
    document.querySelectorAll('.ov.open').forEach(m=>closeModal(m.id));
    if(kbOpen){kbOpen=false;document.getElementById('kb-panel').classList.remove('show');}
    return;
  }
  if(e.key==='n'||e.key==='N'){openTask();return;}
  if(e.key==='j'||e.key==='J'){openJournal();return;}
  if(e.key==='s'||e.key==='S'){openModal('set-modal');return;}
  if(e.key==='1'){document.querySelector('.nb').click();return;}
  if(e.key==='2'){document.querySelectorAll('.nb')[1].click();return;}
  if(e.key==='3'){document.querySelectorAll('.nb')[2].click();return;}
});

/* ── MINI CALENDAR ── */
let calYear=new Date().getFullYear(), calMonth=new Date().getMonth();
function calNav(dir){
  calMonth+=dir;
  if(calMonth<0){calMonth=11;calYear--;}
  if(calMonth>11){calMonth=0;calYear++;}
  renderCal();
}
function renderCal(){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS=['Su','Mo','Tu','We','Th','Fr','Sa'];
  document.getElementById('cal-title').textContent=MONTHS[calMonth]+' '+calYear;
  const grid=document.getElementById('cal-grid');
  grid.innerHTML='';
  DAYS.forEach(d=>{const el=document.createElement('div');el.className='cal-dow';el.textContent=d;grid.appendChild(el);});
  const first=new Date(calYear,calMonth,1).getDay();
  const daysIn=new Date(calYear,calMonth+1,0).getDate();
  const prevDays=new Date(calYear,calMonth,0).getDate();
  const today=todayStr();
  const taskDates=new Set(tasks.map(t=>t.date).filter(Boolean));
  // prev month padding
  for(let i=first-1;i>=0;i--){
    const el=document.createElement('div');el.className='cal-day other-month';el.textContent=prevDays-i;grid.appendChild(el);
  }
  for(let d=1;d<=daysIn;d++){
    const el=document.createElement('div');el.className='cal-day';
    const ds=calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    if(ds===today)el.classList.add('today');
    if(taskDates.has(ds))el.classList.add('has-task');
    el.textContent=d;
    el.title=ds;
    el.onclick=()=>jumpToDate(ds,el);
    grid.appendChild(el);
  }
  // fill remaining
  const total=first+daysIn;const remaining=(7-total%7)%7;
  for(let d=1;d<=remaining;d++){const el=document.createElement('div');el.className='cal-day other-month';el.textContent=d;grid.appendChild(el);}
}
function jumpToDate(ds,el){
  document.querySelectorAll('.cal-day.selected').forEach(x=>x.classList.remove('selected'));
  el.classList.add('selected');
  // filter tasks to that date by injecting into search
  document.getElementById('search-in').value=ds;
  document.getElementById('s-clear').style.display='';
  onSearch(ds);
}

/* ── TASK SEARCH ── */
let searchQ='';
function onSearch(v){
  searchQ=v.trim().toLowerCase();
  document.getElementById('s-clear').style.display=v?'':'none';
  renderTasks();
}
function clearSearch(){
  searchQ='';
  document.getElementById('search-in').value='';
  document.getElementById('s-clear').style.display='none';
  document.querySelectorAll('.cal-day.selected').forEach(x=>x.classList.remove('selected'));
  renderTasks();
}
function highlightMatch(text,q){
  if(!q)return esc(text);
  const re=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return esc(text).replace(re,'<mark class="search-highlight">$1</mark>');
}

/* ── JOURNAL SEARCH ── */
let jSearchQ='';
function onJSearch(v){
  jSearchQ=v.trim().toLowerCase();
  document.getElementById('js-clear').style.display=v?'':'none';
  renderJournalSearch();
}
function clearJSearch(){
  jSearchQ='';
  document.getElementById('j-search').value='';
  document.getElementById('js-clear').style.display='none';
  renderJournalSearch();
}
function renderJournalSearch(){
  const bar=document.getElementById('j-meta-bar');
  if(!jSearchQ){bar.innerHTML='';return;}
  const matches=journals.filter(e=>(e.title+' '+e.content).toLowerCase().includes(jSearchQ));
  if(!matches.length){bar.innerHTML=`<span style="color:var(--txl);font-family:var(--fb)">No entries match "${esc(jSearchQ)}"</span>`;return;}
  bar.innerHTML=`<span>Found <strong>${matches.length}</strong> entr${matches.length===1?'y':'ies'} — </span>`
    +matches.map((e,i)=>`<span class="chip" style="cursor:pointer;padding:3px 12px;font-size:.78rem" onclick="jumpEntry('${e.id}')">${esc(e.title.slice(0,20))}</span>`).join('');
}
function jumpEntry(id){
  const i=journals.findIndex(e=>e.id===id);
  if(i>=0){curPage=i;renderJournal();}
}

/* ── WORD COUNT ── */
const WC_GOAL=200;
function updateWC(){
  const v=document.getElementById('jC').value;
  const wc=wordCount(v);
  document.getElementById('wc-label').textContent=wc+' word'+(wc===1?'':'s');
  const pct=Math.min(100,Math.round(wc/WC_GOAL*100));
  document.getElementById('wc-fill').style.width=pct+'%';
  document.getElementById('wc-goal').textContent='Goal: '+WC_GOAL;
}

/* ── PROGRESS RINGS ── */
function setRing(id,pct,max){
  const circ=94.2;
  const el=document.getElementById(id);
  if(!el)return;
  const offset=circ-(circ*Math.min(1,pct/(max||1)));
  el.style.strokeDashoffset=offset;
}

/* ── CONFETTI ── */
const canvas=document.getElementById('confetti-canvas');
canvas.width=window.innerWidth;canvas.height=window.innerHeight;
window.addEventListener('resize',()=>{canvas.width=window.innerWidth;canvas.height=window.innerHeight;});
const ctx=canvas.getContext('2d');
let particles=[];
function launchConfetti(){
  const colors=['#f4a7b9','#c8a2c8','#a8d5ba','#f9d89c','#f4c2a1','#7adbb8','#b39ddb'];
  for(let i=0;i<80;i++){
    particles.push({
      x:Math.random()*canvas.width,y:-10,
      vx:(Math.random()-0.5)*4,vy:Math.random()*3+2,
      r:Math.random()*6+3,
      color:colors[Math.floor(Math.random()*colors.length)],
      spin:Math.random()*0.2-0.1,angle:Math.random()*Math.PI*2,
      life:1
    });
  }
  if(particles.length>0)requestAnimationFrame(tickConfetti);
}
function tickConfetti(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  particles=particles.filter(p=>p.life>0);
  particles.forEach(p=>{
    p.x+=p.vx;p.y+=p.vy;p.vy+=0.08;p.angle+=p.spin;p.life-=0.012;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.globalAlpha=p.life;ctx.fillStyle=p.color;
    ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r*1.6);
    ctx.restore();
  });
  if(particles.length>0)requestAnimationFrame(tickConfetti);
  else ctx.clearRect(0,0,canvas.width,canvas.height);
}

/* ── PHOTO CAPTION EDITING ── */
function editCaption(id,inputEl){
  const p=gallery.find(p=>p.id===id);if(!p)return;
  p.date=inputEl.value;
  save();
}

/* ── OVERRIDE renderTasks TO USE SEARCH + RINGS ── */
const _origRenderTasks=renderTasks;
renderTasks=function(){
  const list=document.getElementById('task-list');list.innerHTML='';
  let items=tasks.filter(t=>filt==='all'||t.cat===filt);
  if(!prefs.showDone)items=items.filter(t=>!t.completed);
  // apply search
  if(searchQ){
    items=items.filter(t=>(t.title+' '+(t.notes||'')).toLowerCase().includes(searchQ)||
      (t.date&&t.date.includes(searchQ)));
  }
  const today=todayStr();
  const tot=tasks.length, done=tasks.filter(t=>t.completed).length;
  const todayCnt=tasks.filter(t=>t.date===today&&!t.completed).length;
  document.getElementById('sTot').textContent=tot;
  document.getElementById('sDone').textContent=done;
  document.getElementById('sToday').textContent=todayCnt;
  setRing('ring-tot',tot,Math.max(tot,10));
  setRing('ring-done',done,Math.max(tot,1));
  setRing('ring-today',todayCnt,Math.max(todayCnt,5));
  renderCal();
  if(items.length===0){
    list.innerHTML=searchQ
      ?`<div class="empty-st"><div class="ei">🔍</div><h3>No results</h3><p>Nothing matches "<em>${esc(searchQ)}</em>"</p></div>`
      :`<div class="empty-st"><div class="ei">📋</div><h3>Nothing here yet</h3><p>Add a task and get things done ♡</p></div>`;
    return;
  }
  const po={high:0,medium:1,low:2};
  items.sort((a,b)=>{
    if(!prefs.showDone&&a.completed!==b.completed)return a.completed?1:-1;
    if(sort==='priority')return(po[a.pri||'medium']||1)-(po[b.pri||'medium']||1);
    if(sort==='category')return(a.cat||'').localeCompare(b.cat||'');
    if(sort==='az')return a.title.localeCompare(b.title);
    return(a.date||'9999')<(b.date||'9999')?-1:1;
  });
  const overdue=items.filter(t=>t.date&&t.date<today&&!t.completed);
  if(prefs.showOverdue&&overdue.length){
    const b=document.createElement('div');b.className='overdue-banner';
    b.innerHTML=`<span style="font-size:1.1rem">⚠️</span><div><strong style="font-size:.87rem;color:#c62828">${overdue.length} overdue task${overdue.length>1?'s':''}</strong><br><span style="font-size:.77rem;color:#e57373">Don't forget them!</span></div>`;
    list.appendChild(b);
  }
  if(prefs.groupByDate&&sort==='date'&&!searchQ){
    const groups={};
    items.forEach(t=>{const k=t.date||'no-date';if(!groups[k])groups[k]=[];groups[k].push(t);});
    Object.keys(groups).sort().forEach(k=>{
      const d=document.createElement('div');d.className='ddiv';d.textContent=k==='no-date'?'📌 No Date':fmtDateFull(k);list.appendChild(d);
      groups[k].forEach(t=>list.appendChild(mkCard(t,searchQ)));
    });
  }else{
    items.forEach(t=>list.appendChild(mkCard(t,searchQ)));
  }
};

/* ── OVERRIDE mkCard TO SUPPORT SEARCH HIGHLIGHT + OVERDUE TAG ── */
function mkCard(t,q){
  const card=document.createElement('div');card.className='tc-card'+(t.completed?' done':'');
  const m=CAT[t.cat]||CAT.other;const p=t.pri||'medium';
  const today=todayStr();
  const isOverdue=t.date&&t.date<today&&!t.completed;
  card.style.setProperty('--sc',isOverdue?'#ff8a8a':m.s);
  const titleHtml=q?highlightMatch(t.title,q):esc(t.title);
  const notesHtml=t.notes?(q?highlightMatch(t.notes,q):esc(t.notes)):'';
  card.innerHTML=`
    <div class="tc-chk" onclick="togDone('${t.id}')">${t.completed?'✓':''}</div>
    <div class="tc-body">
      <div class="tc-title">${titleHtml} ${isOverdue?'<span class="overdue-tag">Overdue</span>':''}</div>
      <div class="tc-meta">
        ${t.date?`<span class="tc-time">📅 ${fmtDate(t.date)}${t.time?' · '+fmtTime(t.time):''}</span>`:''}
        <span class="tc-cat c-${t.cat}">${m.e} ${m.l}</span>
        <span class="tc-pri p-${p}">${{high:'🔴 High',medium:'🟡 Med',low:'🟢 Low'}[p]}</span>
      </div>
      ${notesHtml?`<div class="tc-notes">${notesHtml}</div>`:''}
    </div>
    <div class="tc-acts">
      <button class="iBtn" onclick="openTask('${t.id}')" title="Edit">✏️</button>
      <button class="iBtn del" onclick="delTask('${t.id}')" title="Delete">🗑️</button>
    </div>`;
  return card;
}

/* ── OVERRIDE togDone TO ADD CONFETTI ── */
const _origTogDone=togDone;
togDone=function(id){
  const t=tasks.find(t=>t.id===id);if(!t)return;
  const wasCompleted=t.completed;
  t.completed=!t.completed;
  save();renderTasks();updateBadges();
  if(!wasCompleted&&t.completed){toast('🎉 Task done!');launchConfetti();}
};

/* ── OVERRIDE renderJournal TO ADD META BAR ── */
const _origRenderJournal=renderJournal;
renderJournal=function(){
  const content=document.getElementById('b-content'),pnum=document.getElementById('pnum'),pacts=document.getElementById('pacts'),plabel=document.getElementById('plabel');
  if(journals.length===0){
    content.innerHTML='<div class="j-blank"><div class="ei">🌙</div><p>Your story begins here…<br>Write your first journal entry ♡</p></div>';
    pnum.textContent='';pacts.innerHTML='';plabel.textContent='—';
    document.getElementById('j-meta-bar').innerHTML='';
    return;
  }
  const e=journals[curPage];
  plabel.textContent=`Page ${curPage+1} of ${journals.length}`;pnum.textContent=curPage+1;
  pacts.innerHTML=`<button class="iBtn" onclick="openJournal('${e.id}')" style="width:26px;height:26px;font-size:.76rem" title="Edit">✏️</button><button class="iBtn del" onclick="delEntry('${e.id}')" style="width:26px;height:26px;font-size:.76rem" title="Delete">🗑️</button>`;
  content.innerHTML=journalPageHTML(e);
  const wc=wordCount(e.content||'');
  const chars=(e.content||'').length;
  const bar=document.getElementById('j-meta-bar');
  bar.innerHTML=`<span>📝 ${wc} word${wc===1?'':'s'}</span><span>🔤 ${chars} char${chars===1?'':'s'}</span><span>📅 ${e.date?e.date.split(',').slice(0,2).join(','):'—'}</span>`;
  if(showIdx)renderIdx();
  renderJournalSearch();
};

/* ── OVERRIDE renderGallery TO USE EDITABLE CAPTIONS ── */
const _origRenderGallery=renderGallery;
renderGallery=function(){
  const track=document.getElementById('photos-track'),gv=document.getElementById('gv'),empty=document.getElementById('gEmpty');
  track.innerHTML='';gv.innerHTML='';
  if(gallery.length===0){empty.style.display='';return;}empty.style.display='none';
  const durs=[3.8,4.5,5.2,4.1,5.8,3.5,4.3,5.0];
  gallery.forEach((p,i)=>{
    const item=document.createElement('div');item.className='ph-item '+(i%2===0?'r1':'r2');
    item.style.setProperty('--sd',durs[i%durs.length]+'s');
    item.innerHTML=`
      <div class="pin"><div class="pin-sp"></div></div>
      <div class="polaroid">
        <img src="${p.src}" alt="${esc(p.name||'photo')}" loading="lazy" data-zoom-photo="${p.id}" style="cursor:zoom-in">
        <div class="polaroid-cap">
          <input class="pol-caption-input" value="${esc(p.date)}" onchange="editCaption('${p.id}',this)" onclick="event.stopPropagation()" title="Click to edit caption">
        </div>
        <button type="button" class="ph-del" data-del-photo="${p.id}">✕</button>
      </div>`;
    track.appendChild(item);
    const gi=document.createElement('div');gi.className='gg-item';gi.setAttribute('data-zoom-photo',p.id);
    gi.innerHTML=`<img src="${p.src}" alt="${esc(p.name||'photo')}" loading="lazy"><div class="gg-ov"><span style="font-size:1.4rem">🔍</span><span>${esc(p.date)}</span><button type="button" class="btn btn-g btn-sm" data-del-photo="${p.id}" style="padding:3px 12px;font-size:.74rem">Delete</button></div>`;
    gv.appendChild(gi);
  });
  // gallery stats
  const statsEl=document.querySelector('.gallery-stats');
  if(statsEl)statsEl.remove();
  const stats=document.createElement('div');stats.className='gallery-stats';
  stats.innerHTML=`<span>📸 ${gallery.length} photo${gallery.length===1?'':'s'}</span>`;
  document.getElementById('cl-view').after(stats);
  setGV(prefs.gv||'clothesline');
};

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',bootApp);
}else{
  bootApp();
}
