/* 家庭回憶錄主程式：文字存 localStorage（fm_ 前綴），照片與錄音存 IndexedDB */
(function(){
'use strict';
var D = window.FM, PREFIX = 'fm_', WARN_KEY = PREFIX + 'warned', FOLD_KEY = PREFIX + 'fold';
var $ = function(id){ return document.getElementById(id); };
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(k, v); return true; }catch(e){ return false; } }
function uid(p){ return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function toast(t){ var e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function(){ e.classList.remove('show'); }, 2600); }
function stageOf(id){ return D.STAGES.filter(function(s){ return s.id === id; })[0] || D.STAGES[0]; }
function qOf(id){ return D.QUESTIONS.filter(function(q){ return q.id === id; })[0]; }
function parseYear(v){ var n = parseInt(String(v).trim(), 10); if(!n || n < 1) return null; if(n <= 150) n += 1911; return n >= 1800 && n <= 2200 ? n : null; }

/* ================= 媒體（IndexedDB） ================= */
var dbp = null, memStore = {}, urlCache = {};
function db(){
  if(dbp) return dbp;
  dbp = new Promise(function(res){
    try{
      var r = indexedDB.open('family-memoir', 1);
      r.onupgradeneeded = function(){ r.result.createObjectStore('media', {keyPath:'id'}); };
      r.onsuccess = function(){ res(r.result); };
      r.onerror = function(){ res(null); };
    }catch(e){ res(null); }
  });
  return dbp;
}
function putMedia(id, blob){ return db().then(function(d){ if(!d){ memStore[id] = blob; return; } return new Promise(function(res, rej){ var t = d.transaction('media', 'readwrite'); t.objectStore('media').put({id:id, blob:blob}); t.oncomplete = res; t.onerror = function(){ rej(t.error); }; t.onabort = function(){ rej(t.error); }; }); }); }
function getMedia(id){ return db().then(function(d){ if(!d) return memStore[id] || null; return new Promise(function(res){ var r = d.transaction('media').objectStore('media').get(id); r.onsuccess = function(){ res(r.result ? r.result.blob : null); }; r.onerror = function(){ res(null); }; }); }); }
function delMedia(id){ if(urlCache[id]){ URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; } return db().then(function(d){ if(!d){ delete memStore[id]; return; } return new Promise(function(res){ var t = d.transaction('media', 'readwrite'); t.objectStore('media').delete(id); t.oncomplete = res; t.onerror = res; }); }); }
function mediaUrl(id){ if(urlCache[id]) return Promise.resolve(urlCache[id]); return getMedia(id).then(function(b){ if(!b) return null; urlCache[id] = URL.createObjectURL(b); return urlCache[id]; }); }
function hydrate(root){ return Promise.all([].map.call(root.querySelectorAll('[data-media]'), function(el){ return mediaUrl(el.getAttribute('data-media')).then(function(u){ if(u) el.src = u; }); })); }
function shrink(file){
  return new Promise(function(res, rej){
    var img = new Image(), u = URL.createObjectURL(file);
    img.onload = function(){
      var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob(function(b){ b ? res(b) : rej(new Error('blob')); }, 'image/jpeg', .84);
    };
    img.onerror = function(){ URL.revokeObjectURL(u); rej(new Error('img')); };
    img.src = u;
  });
}
function b2d(blob){ return new Promise(function(res, rej){ var r = new FileReader(); r.onload = function(){ res(r.result); }; r.onerror = rej; r.readAsDataURL(blob); }); }
function d2b(url){ var i = url.indexOf(','), mime = url.slice(5, i).split(';')[0], bin = atob(url.slice(i + 1)), a = new Uint8Array(bin.length); for(var j = 0; j < bin.length; j++) a[j] = bin.charCodeAt(j); return new Blob([a], {type:mime}); }

/* ================= 狀態 ================= */
var S = {cur:null, books:[]}, set = {fs:'m', dir:'v', bfs:'13.5', ev:true, lastExport:{}}, tab = 'today';
function load(){
  try{ var s = JSON.parse(lsGet(PREFIX + 'books') || 'null'); if(s && s.books) S = s; }catch(e){}
  try{ var t = JSON.parse(lsGet(PREFIX + 'set') || 'null'); if(t) Object.keys(t).forEach(function(k){ set[k] = t[k]; }); }catch(e){}
  if(!S.books.length) newBook('我們家的回憶錄');
  if(!book()) S.cur = S.books[0].id;
}
function save(){ if(!lsSet(PREFIX + 'books', JSON.stringify(S))) toast('瀏覽器空間已滿，這次沒有存到。請先匯出備份'); }
function saveSet(){ lsSet(PREFIX + 'set', JSON.stringify(set)); }
function book(){ return S.books.filter(function(b){ return b.id === S.cur; })[0]; }
function newBook(title){ var b = {id:uid('b'), title:title, subject:'', birth:null, editor:'', dedication:'', afterword:'', people:[], memories:[], order:D.STAGES.map(function(s){ return s.id; }), chapterNames:{}}; S.books.push(b); S.cur = b.id; save(); return b; }
function norm(b){ b.people = b.people || []; b.memories = b.memories || []; b.chapterNames = b.chapterNames || {}; b.order = (b.order || []).filter(function(id){ return D.STAGES.some(function(s){ return s.id === id; }); }); D.STAGES.forEach(function(s){ if(b.order.indexOf(s.id) < 0) b.order.push(s.id); }); return b; }
function chapName(b, id){ return (b.chapterNames && b.chapterNames[id]) || stageOf(id).n; }
function memTitle(m){ if(m.title) return m.title; var q = m.qid && qOf(m.qid); return q ? q.q : (m.text || '一段回憶').split('\n')[0].slice(0, 24); }
function person(b, id){ return b.people.filter(function(p){ return p.id === id; })[0]; }
function loadSample(){
  var have = S.books.filter(function(b){ return b.id === D.SAMPLE.id; })[0];
  if(have){ S.cur = have.id; save(); renderAll(); toast('已切換到範例'); return; }
  var b = JSON.parse(JSON.stringify(D.SAMPLE)), jobs = [];
  b.memories.forEach(function(m, i){ m.id = 'sm' + i; m.updatedAt = 1; m.photos = []; m.audio = []; m.who = m.who || []; if(m.art){ var id = 'art-' + m.art; m.photos.push(id); jobs.push(putMedia(id, new Blob([D.ART[m.art]], {type:'image/svg+xml'}))); delete m.art; } });
  norm(b); S.books.push(b); S.cur = b.id; save();
  Promise.all(jobs).then(function(){ renderAll(); toast('已載入虛構範例，可隨時在書櫃刪除'); });
}

/* ================= 今日一問 ================= */
var CN = '〇一二三四五六七八九';
function digitsCn(n){ return String(n).replace(/\d/g, function(d){ return CN[d]; }); }
function numCn(n){ if(n < 10) return CN[n]; if(n < 20) return '十' + (n % 10 ? CN[n % 10] : ''); if(n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : ''); if(n < 1000){ var h = Math.floor(n / 100), r = n % 100; return CN[h] + '百' + (r === 0 ? '' : r < 10 ? '〇' + CN[r] : r < 20 ? '一' + numCn(r) : numCn(r)); } return digitsCn(n); }
function lunar(d){
  try{
    var p = new Intl.DateTimeFormat('zh-TW-u-ca-chinese', {month:'long', day:'numeric'}).formatToParts(d), m = '', day = '';
    p.forEach(function(x){ if(x.type === 'month') m = x.value; if(x.type === 'day') day = x.value; });
    var n = parseInt(day, 10); if(!n) return '';
    var ds = n <= 10 ? '初' + (n === 10 ? '十' : CN[n]) : n < 20 ? '十' + CN[n - 10] : n === 20 ? '二十' : n < 30 ? '廿' + CN[n - 20] : '三十';
    return '農曆' + m + ds;
  }catch(e){ return ''; }
}
function todayKey(){ var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function tearCount(){ try{ var t = JSON.parse(lsGet(PREFIX + 'tear') || '{}'); return t.d === todayKey() ? t.n : 0; }catch(e){ return 0; } }
function pickQ(){
  var b = book(), done = {}; b.memories.forEach(function(m){ if(m.qid) done[m.qid] = 1; });
  var left = D.QUESTIONS.filter(function(q){ return !done[q.id]; });
  if(!left.length) return null;
  var day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 864e5);
  return left[(day * 37 + tearCount() * 11) % left.length];
}
function sheetHtml(q){
  var d = new Date(), wd = d.getDay(), day = Math.floor(Date.now() / 864e5);
  var head = '<div class="cal-meta"><span>' + (d.getMonth() + 1) + ' 月</span><span>' + esc(lunar(d)) + '</span></div>' +
    '<div class="cal-day' + (wd === 0 || wd === 6 ? ' rest' : '') + '">' + d.getDate() + '</div>' +
    '<div class="cal-week">星期' + '日一二三四五六'[wd] + '</div>';
  if(!q) return head + '<div class="cal-stage">一百二十題都問完了</div><p class="cal-q">想到什麼，就寫下來吧。</p>';
  var st = stageOf(q.stage);
  return head + '<div class="cal-stage">今天問：' + esc(st.n) + '</div><p class="cal-q">' + esc(q.q) + '</p>' +
    '<div class="cal-yj"><span><b>宜</b>' + esc(st.yi) + '</span><span><b>忌</b>' + esc(D.JI[(day + tearCount()) % D.JI.length]) + '</span></div>';
}
function renderToday(){
  var b = book(), q = pickQ(), d = new Date(), done = {};
  b.memories.forEach(function(m){ if(m.qid) done[m.qid] = 1; });
  var answered = Object.keys(done).length;
  var open = {}; document.querySelectorAll('#v-today .stg[open]').forEach(function(e){ open[e.getAttribute('data-s')] = 1; });
  var stg = D.STAGES.map(function(s){
    var qs = D.QUESTIONS.filter(function(x){ return x.stage === s.id; }), c = qs.filter(function(x){ return done[x.id]; }).length;
    return '<details class="stg" data-s="' + s.id + '"' + (open[s.id] ? ' open' : '') + '><summary>' + esc(s.n) + '<span class="cnt">' + c + '／' + qs.length + '</span><span class="bar"><i style="width:' + Math.round(c / qs.length * 100) + '%"></i></span></summary><ul class="qlist">' +
      qs.map(function(x){ return '<li><button type="button" data-q="' + x.id + '"' + (done[x.id] ? ' class="done"' : '') + '>' + esc(x.q) + '</button></li>'; }).join('') + '</ul></details>';
  }).join('');
  var setup = b.subject ? '' : '<div class="setup"><h3>這本回憶錄要寫誰？</h3><div class="grid2"><label class="f">主角的名字<input id="suName" maxlength="20" placeholder="例如：阿嬤 林春梅"></label><label class="f">出生年 <small>西元或民國</small><input id="suBirth" inputmode="numeric" maxlength="4"></label></div><div class="row"><button class="btn" type="button" id="suOk">開始</button><button class="btn" type="button" data-sample>先看虛構範例</button></div></div>';
  $('v-today').innerHTML = setup + '<div class="today"><div class="calwrap"><div class="nail"></div><div class="cal"><div class="cal-head">民國' + digitsCn(d.getFullYear() - 1911) + '年 ' + d.getFullYear() + '</div><div class="cal-stack" id="calStack"><div class="cal-sheet" id="calSheet">' + sheetHtml(q) + '</div></div></div>' +
    '<div class="cal-act"><button class="btn primary" type="button" id="ansBtn">' + (q ? '回答這一題' : '寫一段回憶') + '</button><button class="btn" type="button" id="tearBtn"' + (q ? '' : ' disabled') + '>撕掉，換一題</button><button class="btn" type="button" id="shareQ"' + (q ? '' : ' disabled') + '>傳給家人問</button></div></div>' +
    '<div class="side"><h2>' + esc(b.title) + '</h2><p class="progress">已經留下 ' + b.memories.length + ' 段回憶，回答了 ' + answered + ' 題。也可以從下面挑想問的題目。</p>' + stg + '</div></div>';
  $('ansBtn').onclick = function(){ var c = pickQ(); openEditor(null, c); };
  $('tearBtn').onclick = tear;
  $('shareQ').onclick = function(){ var c = pickQ(); if(c) openShare('想問您一件事：\n' + c.q + '\n\n您慢慢想，用說的也可以，我再幫您記進家裡的回憶錄。'); };
  if($('suOk')) $('suOk').onclick = function(){ var n = $('suName').value.trim(); if(!n){ toast('請先填主角的名字'); $('suName').focus(); return; } b.subject = n; b.birth = parseYear($('suBirth').value); if(b.title === '我們家的回憶錄') b.title = n + '的回憶錄'; save(); renderAll(); };
}
function tear(){
  var sheet = $('calSheet'), c = sheet.cloneNode(true); c.removeAttribute('id'); c.classList.add('tear'); $('calStack').appendChild(c);
  setTimeout(function(){ if(c.parentNode) c.parentNode.removeChild(c); }, 700);
  lsSet(PREFIX + 'tear', JSON.stringify({d:todayKey(), n:tearCount() + 1}));
  sheet.innerHTML = sheetHtml(pickQ());
}
function openShare(t){ $('shText').value = t; lineHref(); $('shOther').hidden = !navigator.share; $('shareBox').classList.add('show'); document.body.style.overflow = 'hidden'; $('shLine').focus(); }
function closeShare(){ $('shareBox').classList.remove('show'); document.body.style.overflow = ''; }
function lineHref(){ $('shLine').href = 'https://line.me/R/share?text=' + encodeURIComponent($('shText').value.trim()); }
function copy(t, msg){ function fb(){ var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try{ document.execCommand('copy'); toast(msg); }catch(e){ toast('無法複製，請手動選取'); } a.remove(); } if(navigator.clipboard) navigator.clipboard.writeText(t).then(function(){ toast(msg); }, fb); else fb(); }

/* ================= 寫回憶 ================= */
var ed = null, rec = null, sr = null;
function draftKey(){ return PREFIX + 'draft'; }
function openEditor(mem, q){
  var b = book();
  ed = {id:mem ? mem.id : null, qid:mem ? mem.qid : (q ? q.id : null), photos:mem ? (mem.photos || []).slice() : [], audio:mem ? (mem.audio || []).slice() : [], added:[], removed:[]};
  $('edHead').textContent = mem ? '修改這段回憶' : '寫下這段回憶';
  var qq = ed.qid && qOf(ed.qid);
  $('edQ').textContent = qq ? qq.q : ''; $('edQ').hidden = !qq;
  var text = mem ? mem.text : '';
  if(!mem){ try{ var dr = JSON.parse(lsGet(draftKey()) || 'null'); if(dr && dr.b === b.id && dr.q === ed.qid && dr.t){ text = dr.t; toast('已帶回上次沒存的草稿'); } }catch(e){} }
  $('edText').value = text || '';
  $('edName').value = mem && mem.title || '';
  $('edStage').innerHTML = D.STAGES.map(function(s){ return '<option value="' + s.id + '">' + esc(chapName(b, s.id)) + '</option>'; }).join('');
  $('edStage').value = mem ? mem.stage : (qq ? qq.stage : 'root');
  $('edYear').value = mem && mem.year || '';
  $('edPlace').value = mem && mem.place || '';
  $('edTeller').value = mem ? (mem.teller || '') : (b.subject || '');
  $('edInc').checked = !mem || mem.include !== false;
  $('edDel').hidden = !mem;
  $('edWhoWrap').hidden = !b.people.length;
  $('edWho').innerHTML = b.people.map(function(p){ return '<label><input type="checkbox" value="' + p.id + '"' + (mem && (mem.who || []).indexOf(p.id) >= 0 ? ' checked' : '') + '>' + esc(p.name) + '</label>'; }).join('');
  $('edMic').hidden = !(window.SpeechRecognition || window.webkitSpeechRecognition);
  $('edRec').hidden = !(navigator.mediaDevices && window.MediaRecorder);
  renderEdMedia();
  $('editor').classList.add('show'); document.body.style.overflow = 'hidden';
  $('editor').scrollTop = 0; $('edText').focus();
}
function renderEdMedia(){
  var h = ed.photos.map(function(id){ return '<div class="mi"><img data-media="' + esc(id) + '" alt="回憶照片"><button class="delm" type="button" data-delm="' + esc(id) + '" aria-label="移除照片">✕</button></div>'; }).join('') +
    ed.audio.map(function(id){ return '<div class="au"><audio controls data-media="' + esc(id) + '"></audio><button class="delm" type="button" data-delm="' + esc(id) + '" aria-label="移除錄音">✕</button></div>'; }).join('');
  $('edMedia').innerHTML = h; hydrate($('edMedia'));
}
function stopCapture(){ if(rec){ rec.cancelled = true; rec.stop(); } if(sr){ try{ sr.stop(); }catch(e){} } }
function closeEditor(){ stopCapture(); $('editor').classList.remove('show'); document.body.style.overflow = ''; ed = null; }
function cancelEditor(){
  if(!ed) return;
  var dirty = $('edText').value.trim() && !ed.id;
  if(dirty && !confirm('這段故事還沒儲存。草稿會留著，下次回答同一題時會帶回來。確定要離開嗎？')) return;
  ed.added.forEach(delMedia); closeEditor();
}
function saveEditor(){
  var b = book(), text = $('edText').value.trim();
  if(!text && !ed.photos.length && !ed.audio.length){ toast('先寫幾句話，或加一張照片、一段錄音'); $('edText').focus(); return; }
  var yv = $('edYear').value.trim(), y = yv ? parseYear(yv) : null;
  if(yv && !y){ toast('年份看不懂，請填西元（1968）或民國（57）'); $('edYear').focus(); return; }
  var m = ed.id ? b.memories.filter(function(x){ return x.id === ed.id; })[0] : null;
  if(!m){ m = {id:uid('m'), qid:ed.qid}; b.memories.push(m); }
  m.text = text; m.title = $('edName').value.trim(); m.stage = $('edStage').value; m.year = y; m.place = $('edPlace').value.trim(); m.teller = $('edTeller').value.trim();
  m.who = [].map.call($('edWho').querySelectorAll('input:checked'), function(i){ return i.value; });
  m.photos = ed.photos; m.audio = ed.audio; m.include = $('edInc').checked; m.updatedAt = Date.now();
  ed.removed.forEach(delMedia);
  try{ localStorage.removeItem(draftKey()); }catch(e){}
  save(); closeEditor(); renderAll(); toast('已儲存回憶');
}
function deleteMemory(){
  if(!ed || !ed.id || !confirm('確定要刪除這段回憶？照片和錄音也會一起刪除。')) return;
  var b = book(), m = b.memories.filter(function(x){ return x.id === ed.id; })[0];
  (m.photos || []).concat(m.audio || [], ed.added).forEach(delMedia);
  b.memories = b.memories.filter(function(x){ return x !== m; }); save(); closeEditor(); renderAll(); toast('已刪除回憶');
}
function toggleRec(){
  var btn = $('edRec');
  if(rec){ rec.stop(); return; }
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
    var chunks = [], r = new MediaRecorder(stream), t0 = Date.now(), tm;
    rec = r;
    r.ondataavailable = function(e){ if(e.data.size) chunks.push(e.data); };
    r.onstop = function(){
      clearInterval(tm); stream.getTracks().forEach(function(t){ t.stop(); }); rec = null;
      btn.classList.remove('rec'); btn.textContent = '⏺ 錄下聲音';
      if(r.cancelled || !ed) return;
      var id = uid('a'), bl = new Blob(chunks, {type:r.mimeType || 'audio/webm'}), cur = ed;
      putMedia(id, bl).then(function(){ cur.audio.push(id); cur.added.push(id); if(ed === cur) renderEdMedia(); toast('錄音已加入'); }).catch(function(){ toast('空間不足，錄音沒有存到'); });
    };
    r.start(); btn.classList.add('rec');
    tm = setInterval(function(){ var s = Math.floor((Date.now() - t0) / 1000); btn.textContent = '⏹ 停止錄音 ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); if(s >= 900) r.stop(); }, 500);
    btn.textContent = '⏹ 停止錄音 0:00';
  }).catch(function(){ toast('沒有麥克風權限，請到瀏覽器設定允許'); });
}
function toggleMic(){
  var btn = $('edMic');
  if(sr){ sr.stop(); return; }
  var R = window.SpeechRecognition || window.webkitSpeechRecognition, r = new R();
  r.lang = 'zh-TW'; r.continuous = true; r.interimResults = false;
  r.onresult = function(e){ for(var i = e.resultIndex; i < e.results.length; i++){ if(e.results[i].isFinal){ var a = $('edText'); a.value += e.results[i][0].transcript; a.dispatchEvent(new Event('input')); } } };
  r.onerror = function(e){ toast(e.error === 'not-allowed' ? '沒有麥克風權限，請到瀏覽器設定允許' : '語音輸入中斷，請再按一次'); };
  r.onend = function(){ sr = null; btn.classList.remove('rec'); btn.textContent = '🎤 用說的輸入'; };
  sr = r; r.start(); btn.classList.add('rec'); btn.textContent = '⏹ 停止語音輸入';
}

/* ================= 回憶盒 ================= */
function byYear(a, c){ return (a.year || 9999) - (c.year || 9999); }
function renderBox(){
  var b = book(), kw = $('fq').value.trim(), fs = $('fs').value, fp = $('fp').value;
  $('fs').innerHTML = '<option value="">全部章節</option>' + b.order.map(function(id){ return '<option value="' + id + '">' + esc(chapName(b, id)) + '</option>'; }).join(''); $('fs').value = fs;
  $('fp').innerHTML = '<option value="">全部家人</option>' + b.people.map(function(p){ return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join(''); $('fp').value = person(b, fp) ? fp : ''; fp = $('fp').value;
  var list = b.memories.filter(function(m){
    if(fs && m.stage !== fs) return false;
    if(fp && (m.who || []).indexOf(fp) < 0) return false;
    if(kw){ var names = (m.who || []).map(function(id){ var p = person(b, id); return p ? p.name : ''; }).join(' '); if((memTitle(m) + m.text + (m.place || '') + (m.teller || '') + names).indexOf(kw) < 0) return false; }
    return true;
  }).sort(byYear);
  $('boxLead').textContent = b.memories.length ? '共 ' + b.memories.length + ' 段回憶，依年份排列。點一下可以修改。' : '回答今天的問題，第一段回憶就會放進來。';
  $('boxList').innerHTML = list.length ? '<div class="cards">' + list.map(function(m){
    var ph = (m.photos || [])[0];
    return '<button class="card" type="button" data-mem="' + esc(m.id) + '">' + (ph ? '<div class="ph"><img data-media="' + esc(ph) + '" alt=""></div>' : '') + '<h3>' + esc(memTitle(m)) + '</h3><p>' + esc(m.text) + '</p><div class="m">' + esc([m.year, m.place, m.teller].filter(Boolean).join('・')) + ((m.audio || []).length ? '・🔊 有錄音' : '') + (m.include === false ? '・不收進書裡' : '') + '</div></button>';
  }).join('') + '</div>' : '<div class="empty"><p>' + (b.memories.length ? '找不到符合的回憶，換個關鍵字或清除篩選。' : '這裡還是空的。') + '</p>' + (b.memories.length ? '' : '<button class="btn" type="button" data-tab="today">去看今天的問題</button>') + '</div>';
  hydrate($('boxList'));
}

/* ================= 年表 ================= */
function renderTime(){
  var b = book(), showEv = set.tlEv !== false; $('tlEv').checked = showEv;
  var years = {}, undated = [];
  b.memories.forEach(function(m){ if(m.year){ (years[m.year] = years[m.year] || {m:[], e:[]}).m.push(m); } else undated.push(m); });
  var ys = Object.keys(years).map(Number), lo = b.birth || (ys.length ? Math.min.apply(null, ys) : null);
  if(!b.memories.length && !lo){ $('tlList').innerHTML = '<div class="empty"><p>填好回憶的年份，年表就會排出來。</p></div>'; return; }
  if(showEv && lo) D.EVENTS.forEach(function(e){ if(e[0] >= lo){ (years[e[0]] = years[e[0]] || {m:[], e:[]}).e.push(e[1]); } });
  var h = Object.keys(years).map(Number).sort(function(a, c){ return a - c; }).map(function(y){
    var age = b.birth && y >= b.birth ? (y === b.birth ? '出生那年' : (b.subject || '主角') + ' ' + (y - b.birth) + ' 歲') : '';
    return '<div class="ty"><div class="y">' + y + '<small>民國' + (y >= 1912 ? ' ' + (y - 1911) + ' 年' : '前') + (age ? '<span class="ag">' + esc(age) + '</span>' : '') + '</small></div><div>' +
      years[y].e.map(function(t){ return '<p class="ev">' + esc(t) + '</p>'; }).join('') +
      years[y].m.map(tmHtml).join('') + '</div></div>';
  }).join('');
  if(undated.length) h += '<div class="ty"><div class="y" style="font-family:var(--kai);font-size:1.3rem">年份未知<small>補上年份就會排進去</small></div><div>' + undated.map(tmHtml).join('') + '</div></div>';
  $('tlList').innerHTML = '<div class="tl">' + h + '</div>';
}
function tmHtml(m){ return '<button class="tm" type="button" data-mem="' + esc(m.id) + '"><b>' + esc(memTitle(m)) + '</b><span>' + esc(m.text) + '</span></button>'; }

/* ================= 家族樹 ================= */
function treeLayout(b){
  var P = b.people, g = {}, byId = {}, NW = 128, NH = 66, GX = 22, GY = 64, SP = 30;
  P.forEach(function(p){ g[p.id] = 0; byId[p.id] = p; });
  for(var it = 0; it < 40; it++){ P.forEach(function(p){ [p.father, p.mother].forEach(function(id){ if(byId[id] && g[p.id] < g[id] + 1) g[p.id] = g[id] + 1; }); if(byId[p.spouse] && g[p.id] < g[p.spouse]) g[p.id] = g[p.spouse]; }); }
  var rows = {}; P.forEach(function(p){ (rows[g[p.id]] = rows[g[p.id]] || []).push(p); });
  var gens = Object.keys(rows).map(Number).sort(function(a, c){ return a - c; }), x = {}, rowUnits = {};
  gens.forEach(function(k){
    var seen = {}, units = [];
    rows[k].forEach(function(p){ if(seen[p.id]) return; seen[p.id] = 1; var s = byId[p.spouse], u = [p]; if(s && g[s.id] === k && !seen[s.id]){ seen[s.id] = 1; if(!p.father && !p.mother && (s.father || s.mother)) u = [p, s]; else u = [s, p]; } units.push(u); });
    function want(u){ var v = []; u.forEach(function(p){ [p.father, p.mother].forEach(function(id){ if(x[id] != null) v.push(x[id] + NW / 2); }); }); return v.length ? v.reduce(function(a, c){ return a + c; }, 0) / v.length : null; }
    var idx = units.map(function(u, i){ var w = want(u); return {u:u, w:w == null ? 1e6 + i : w}; }).sort(function(a, c){ return a.w - c.w; });
    var cur = 0; rowUnits[k] = idx.map(function(o){ return o.u; });
    idx.forEach(function(o){ var uw = o.u.length * NW + (o.u.length - 1) * SP, st = o.w < 1e6 ? Math.max(cur, o.w - uw / 2) : cur; o.u.forEach(function(p, i){ x[p.id] = st + i * (NW + SP); }); cur = st + uw + GX; });
  });
  gens.slice().reverse().forEach(function(k){
    var cur = 0;
    rowUnits[k].forEach(function(u){
      var kids = P.filter(function(c){ return u.some(function(p){ return c.father === p.id || c.mother === p.id; }); });
      var uw = u.length * NW + (u.length - 1) * SP, st = x[u[0].id];
      if(kids.length){ var c = kids.reduce(function(a, q){ return a + x[q.id] + NW / 2; }, 0) / kids.length; st = c - uw / 2; }
      st = Math.max(st, cur); u.forEach(function(p, i){ x[p.id] = st + i * (NW + SP); }); cur = st + uw + GX;
    });
  });
  var minX = Math.min.apply(null, P.map(function(p){ return x[p.id]; })), W = 0;
  P.forEach(function(p){ x[p.id] -= minX - 8; W = Math.max(W, x[p.id] + NW + 8); });
  var y = {}; gens.forEach(function(k, i){ rows[k].forEach(function(p){ y[p.id] = 8 + i * (NH + GY); }); });
  return {x:x, y:y, W:W, H:gens.length * (NH + GY) - GY + 16, NW:NW, NH:NH, GY:GY, byId:byId};
}
function treeSvg(b, interactive){
  var L = treeLayout(b), s = '', C = '#2f6b5e', drawn = {};
  b.people.forEach(function(p){ var q = L.byId[p.spouse]; if(q && L.y[q.id] === L.y[p.id] && !drawn[q.id]){ drawn[p.id] = 1; var l = Math.min(L.x[p.id], L.x[q.id]) + L.NW, r = Math.max(L.x[p.id], L.x[q.id]), yy = L.y[p.id] + L.NH / 2; s += '<path d="M' + l + ' ' + (yy - 3) + 'H' + r + 'M' + l + ' ' + (yy + 3) + 'H' + r + '" stroke="' + C + '" stroke-width="2"/>'; } });
  b.people.forEach(function(c){
    var ps = [c.father, c.mother].filter(function(id){ return L.byId[id]; }); if(!ps.length) return;
    var px = ps.reduce(function(a, id){ return a + L.x[id] + L.NW / 2; }, 0) / ps.length, top = L.y[ps[0]] + (ps.length > 1 ? L.NH / 2 : L.NH), cy = L.y[c.id], cx = L.x[c.id] + L.NW / 2, mid = cy - L.GY / 2;
    s += '<path d="M' + px + ' ' + top + 'V' + mid + 'H' + cx + 'V' + cy + '" fill="none" stroke="' + C + '" stroke-width="2"/>';
  });
  b.people.forEach(function(p){
    var X = L.x[p.id], Y = L.y[p.id], yrs = (p.birth || '') + (p.death ? '–' + p.death : (p.birth ? '–' : ''));
    s += '<g' + (interactive ? ' class="tn" tabindex="0" role="button" aria-label="修改 ' + esc(p.name) + '" data-person="' + esc(p.id) + '"' : '') + '><rect x="' + X + '" y="' + Y + '" width="' + L.NW + '" height="' + L.NH + '" rx="5" fill="' + (p.death ? '#ece9dc' : '#fff') + '" stroke="' + C + '" stroke-width="1.5"/>' +
      '<text x="' + (X + L.NW / 2) + '" y="' + (Y + 26) + '" text-anchor="middle" font-size="18" font-weight="700" fill="#1f2b27" font-family="LXGW WenKai TC,serif">' + esc(p.name) + '</text>' +
      '<text x="' + (X + L.NW / 2) + '" y="' + (Y + 49) + '" text-anchor="middle" font-size="12" fill="#4a5e56" font-family="Noto Sans TC,sans-serif">' + esc([p.rel, yrs].filter(Boolean).join('  ')) + '</text></g>';
  });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + L.W + ' ' + L.H + '" width="' + L.W + '" height="' + L.H + '" role="img" aria-label="家族樹">' + s + '</svg>';
}
var treeZ = 'fit';
function renderTree(){
  var b = book();
  if(!b.people.length){ $('treeBox').innerHTML = '<div class="empty"><p>先把主角加進來，再加上父母、配偶和孩子。</p></div>'; return; }
  var L = treeLayout(b), gens = {};
  b.people.forEach(function(p){ (gens[L.y[p.id]] = gens[L.y[p.id]] || []).push(p); });
  var list = Object.keys(gens).map(Number).sort(function(x, y){ return x - y; }).map(function(k, i){
    return '<h3>第' + numCn(i + 1) + '代</h3>' + gens[k].map(function(p){ return '<button type="button" data-person="' + esc(p.id) + '"><b>' + esc(p.name) + '</b><span>' + esc([p.rel, (p.birth || '') + (p.death ? '–' + p.death : '')].filter(Boolean).join('・')) + '</span></button>'; }).join('');
  }).join('');
  $('treeBox').innerHTML = '<div class="treebar"><button type="button" data-tz="-" aria-label="縮小">－</button><button type="button" data-tz="fit">全圖</button><button type="button" data-tz="+" aria-label="放大">＋</button></div><div class="treebox" id="treeScroll">' + treeSvg(b, true) + '</div><div class="plist">' + list + '</div>';
  fitTree();
}
function fitTree(){
  var box = $('treeScroll'); if(!box) return;
  var sv = box.querySelector('svg'), vb = sv.viewBox.baseVal, fit = Math.min(1, (box.clientWidth - 26) / vb.width);
  var z = treeZ === 'fit' ? Math.max(fit, .42) : treeZ;
  sv.style.width = Math.round(vb.width * z) + 'px'; sv.style.height = Math.round(vb.height * z) + 'px';
  if(treeZ === 'fit') box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
}
function zoomTree(c){
  var box = $('treeScroll'), sv = box.querySelector('svg'), now = sv.getBoundingClientRect().width / sv.viewBox.baseVal.width;
  treeZ = c === 'fit' ? 'fit' : Math.max(.42, Math.min(2, now * (c === '+' ? 1.25 : .8))); fitTree();
}
var pn = null;
function openPerson(p){
  var b = book(); pn = p ? p.id : null;
  $('pnHead').textContent = p ? '修改家人' : '新增家人';
  $('pnName').value = p ? p.name : ''; $('pnRel').value = p && p.rel || ''; $('pnBirth').value = p && p.birth || ''; $('pnDeath').value = p && p.death || ''; $('pnNote').value = p && p.note || '';
  var others = b.people.filter(function(x){ return !p || x.id !== p.id; }), opt = '<option value="">（未設定）</option>' + others.map(function(x){ return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('');
  ['pnFather', 'pnMother', 'pnSpouse'].forEach(function(id){ $(id).innerHTML = opt; });
  $('pnFather').value = p && p.father || ''; $('pnMother').value = p && p.mother || ''; $('pnSpouse').value = p && p.spouse || '';
  $('pnDel').hidden = !p; $('pnMem').hidden = !p;
  $('person').classList.add('show'); document.body.style.overflow = 'hidden'; $('pnName').focus();
}
function closePerson(){ $('person').classList.remove('show'); document.body.style.overflow = ''; }
function isAncestor(b, a, c, seen){ seen = seen || {}; if(!c || seen[c]) return false; seen[c] = 1; var p = person(b, c); if(!p) return false; return p.father === a || p.mother === a || isAncestor(b, a, p.father, seen) || isAncestor(b, a, p.mother, seen); }
function savePerson(){
  var b = book(), name = $('pnName').value.trim();
  if(!name){ toast('請填姓名'); $('pnName').focus(); return; }
  var id = pn || uid('p'), fa = $('pnFather').value, mo = $('pnMother').value, sp = $('pnSpouse').value;
  if(pn && (isAncestor(b, pn, fa) || isAncestor(b, pn, mo))){ toast('父母不能是自己的晚輩，請重新選擇'); return; }
  var p = person(b, id); if(!p){ p = {id:id}; b.people.push(p); }
  var old = p.spouse;
  p.name = name; p.rel = $('pnRel').value.trim(); p.birth = parseYear($('pnBirth').value); p.death = parseYear($('pnDeath').value); p.note = $('pnNote').value.trim(); p.father = fa; p.mother = mo; p.spouse = sp;
  if(old && old !== sp){ var o = person(b, old); if(o && o.spouse === id) o.spouse = ''; }
  if(sp){ var s = person(b, sp); if(s){ if(s.spouse && s.spouse !== id){ var o2 = person(b, s.spouse); if(o2) o2.spouse = ''; } s.spouse = id; } }
  save(); closePerson(); renderAll(); toast('已儲存家人');
}
function deletePerson(){
  var b = book(), p = person(b, pn); if(!p || !confirm('確定要把「' + p.name + '」從家族樹移除？回憶內容不會刪除。')) return;
  b.people = b.people.filter(function(x){ return x !== p; });
  b.people.forEach(function(x){ ['father', 'mother', 'spouse'].forEach(function(k){ if(x[k] === p.id) x[k] = ''; }); });
  b.memories.forEach(function(m){ m.who = (m.who || []).filter(function(id){ return id !== p.id; }); });
  save(); closePerson(); renderAll(); toast('已移除家人');
}

/* ================= 成書：實際量測分頁 ================= */
var pages = [], spreadAt = 0, curPage = 0, buildSeq = 0;
function vtext(t){ return set.dir === 'v' ? String(t).replace(/\d+/g, function(s){ return s.length >= 4 || s[0] === '0' ? digitsCn(s) : numCn(parseInt(s, 10)); }) : String(t); }
function yearText(y){ return set.dir === 'v' ? digitsCn(y) : String(y); }
function chapterList(b){ return b.order.map(function(id){ return {id:id, list:b.memories.filter(function(m){ return m.stage === id && m.include !== false; }).sort(byYear)}; }).filter(function(c){ return c.list.length; }); }
function buildBook(){
  var seq = ++buildSeq, b = book(), host = $('printBook'), dir = set.dir === 'v' ? 'vert' : 'horz';
  host.innerHTML = ''; host.style.setProperty('--bfs', set.bfs + 'pt');
  var cur = null, n = 0, toc = [];
  function page(cls){ var p = document.createElement('div'); p.className = 'bpage ' + dir + ' ' + (cls || ''); host.appendChild(p); return p; }
  function body(cls){ var p = page(cls), bd = document.createElement('div'); bd.className = 'bbody'; p.appendChild(bd); cur = bd; return bd; }
  function fits(){ return dir === 'vert' ? cur.scrollWidth <= cur.clientWidth + 1 : cur.scrollHeight <= cur.clientHeight + 1; }
  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
  function add(e){ cur.appendChild(e); if(fits()) return; cur.removeChild(e); if(cur.children.length) body(); cur.appendChild(e); }
  function addPara(text, keep){
    var p = el('p', 'tx'), rest = text, first = true;
    while(rest){
      var e = p.cloneNode(false); if(!first) e.classList.add('cont'); e.textContent = rest; cur.appendChild(e);
      if(fits()) return;
      var lo = 0, hi = rest.length;
      while(lo < hi){ var mid = (lo + hi + 1) >> 1; e.textContent = rest.slice(0, mid); if(fits()) lo = mid; else hi = mid - 1; }
      while(lo > 0 && /^[，。、；：！？」』）…]/.test(rest.slice(lo))) lo--;
      if(first && keep && lo < 24){ cur.removeChild(e); keep.forEach(function(k){ if(k.parentNode) k.parentNode.removeChild(k); }); body(); keep.forEach(function(k){ cur.appendChild(k); }); keep = null; continue; }
      if(lo === 0){ cur.removeChild(e); if(!cur.children.length){ e.textContent = rest; cur.appendChild(e); return; } body(); continue; }
      e.textContent = rest.slice(0, lo); rest = rest.slice(lo); first = false; body();
    }
  }
  return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function(){
    var ids = []; b.memories.forEach(function(m){ if(m.include !== false) (m.photos || []).forEach(function(id){ ids.push(id); }); });
    return Promise.all(ids.map(function(id){ return mediaUrl(id).then(function(u){ if(!u) return; var i = new Image(); i.src = u; return i.decode ? i.decode().catch(function(){}) : null; }); }));
  }).then(function(){
    if(seq !== buildSeq) return null;
    var cp = page('cover');
    cp.innerHTML = '<div class="stitch"></div><div class="label">' + esc(vtext(b.title || '我們家的回憶錄')) + '</div><div class="sub">' + esc(vtext(b.subject ? b.subject + ' 口述' : '')) + (b.editor ? '<br>' + esc(vtext(b.editor)) + ' 編' : '') + '</div>';
    if(b.dedication){ body('center'); cur.appendChild(el('p', 'ded', vtext(b.dedication))); }
    var chs = chapterList(b), rows = [], lo = b.birth || 0;
    b.memories.forEach(function(m){ if(m.year && m.include !== false) rows.push({y:m.year, t:memTitle(m)}); });
    var tocNames = chs.map(function(c){ return vtext(chapName(b, c.id)); });
    if(rows.length) tocNames.push('人生年表'); if(b.people.length) tocNames.push('家族樹'); if(b.afterword) tocNames.push('後記');
    body(); cur.appendChild(el('h2', 'ch', '目錄'));
    var tocRows = tocNames.map(function(t){ var r = el('p', 'toc'), s = el('span', '', '〇〇〇'); r.appendChild(el('span', '', t)); r.appendChild(s); add(r); return s; });
    if(!chs.length){ body('center'); cur.appendChild(el('p', 'ded', '回憶收進書裡之後，內容會出現在這裡。')); }
    chs.forEach(function(c, i){
      body();
      var start = cur;
      cur.appendChild(el('p', 'chno', '第' + numCn(i + 1) + '章'));
      cur.appendChild(el('h2', 'ch', vtext(chapName(b, c.id))));
      toc.push({t:vtext(chapName(b, c.id)), pg:start});
      c.list.forEach(function(m){
        var h = el('h3', 'mt', vtext(memTitle(m))), meta = [m.year ? yearText(m.year) + '年' : '', m.place, m.teller ? m.teller + '口述' : ''].filter(Boolean).join('・'), mt = el('p', 'meta', vtext(meta));
        add(h); var keep = [h]; if(meta){ cur.appendChild(mt); keep.push(mt); }
        var paras = String(m.text || '').split(/\n+/).map(function(s){ return s.trim(); }).filter(Boolean);
        paras.forEach(function(t, k){ addPara(vtext(t), k === 0 ? keep : null); });
        (m.photos || []).forEach(function(id){ var f = el('figure'), im = el('img'); im.alt = ''; im.src = urlCache[id] || ''; f.appendChild(im); add(f); });
      });
    });
    if(rows.length){
      if(set.ev && b.birth) D.EVENTS.forEach(function(e){ if(e[0] >= lo) rows.push({y:e[0], t:e[1], e:1}); });
      rows.sort(function(a, c){ return a.y - c.y || (a.e ? -1 : 1); });
      body(); cur.appendChild(el('h2', 'ch', '人生年表')); toc.push({t:'人生年表', pg:cur});
      rows.forEach(function(r){ var e = el('p', 'tlr' + (r.e ? ' e' : '')), bb = el('b', '', yearText(r.y)); e.appendChild(bb); e.appendChild(document.createTextNode('　' + vtext(r.t))); add(e); });
    }
    if(b.people.length){ body('flat'); cur.appendChild(el('h2', 'ch', '家族樹')); toc.push({t:'家族樹', pg:cur}); var tp = el('div', 'treepg'); tp.innerHTML = treeSvg(b, false); cur.appendChild(tp); }
    if(b.afterword){ body(); cur.appendChild(el('h2', 'ch', '後記')); toc.push({t:'後記', pg:cur}); b.afterword.split(/\n+/).forEach(function(t){ if(t.trim()) addPara(vtext(t.trim())); }); }
    pages = [].slice.call(host.children);
    pages.forEach(function(p, i){ if(i === 0) return; var s = el('div', 'pno', String(i + 1)); p.appendChild(s); });
    toc.forEach(function(t, i){ var pg = pages.indexOf(t.pg.parentNode) + 1; tocRows[i].textContent = set.dir === 'v' ? numCn(pg) : String(pg); });
    return pages;
  });
}
function spreads(){ var one = ($('spreadWrap').clientWidth - 24) / 1118.8 < .5, a = []; if(!pages.length) return a; a.push([0]); for(var i = 1; i < pages.length; i += one ? 1 : 2) a.push(one || i + 1 >= pages.length ? [i] : [i, i + 1]); return a; }
function showSpread(){
  var sp = spreads(); if(!sp.length) return;
  spreadAt = sp.length - 1; sp.some(function(s, i){ if(s.indexOf(curPage) >= 0){ spreadAt = i; return true; } });
  var host = $('spread'), now = sp[spreadAt], order = set.dir === 'v' ? now.slice().reverse() : now;
  host.innerHTML = ''; order.forEach(function(i){ host.appendChild(pages[i].cloneNode(true)); });
  var avail = $('spreadWrap').clientWidth - 24, full = now.length * 559.4, z = Math.min(1, avail / full, Math.max(.34, (window.innerHeight - 190) / 794));
  var zm = $('spreadZoom'); zm.style.zoom = z;
  var first = now[0] + 1, last = now[now.length - 1] + 1;
  $('pgInfo').textContent = (first === last ? '第 ' + first + ' 頁' : '第 ' + first + '–' + last + ' 頁') + '／共 ' + pages.length + ' 頁';
  var v = set.dir === 'v', atEnd = spreadAt >= sp.length - 1, atStart = spreadAt <= 0;
  $('navL').textContent = v ? '← 下一頁' : '← 上一頁'; $('navR').textContent = v ? '上一頁 →' : '下一頁 →';
  $('navL').disabled = v ? atEnd : atStart; $('navR').disabled = v ? atStart : atEnd;
}
function turn(d){ var sp = spreads(); if(!sp.length) return; var i = Math.max(0, Math.min(spreadAt + d, sp.length - 1)); curPage = sp[i][0]; showSpread(); }
function renderBook(){
  var b = book();
  $('bTitle').value = b.title || ''; $('bSubject').value = b.subject || ''; $('bEditor').value = b.editor || ''; $('bDed').value = b.dedication || ''; $('bAft').value = b.afterword || '';
  renderChaps(); return buildBook().then(function(r){ if(r) showSpread(); });
}
function renderChaps(){
  var b = book();
  $('chapList').innerHTML = b.order.map(function(id, i){
    var n = b.memories.filter(function(m){ return m.stage === id && m.include !== false; }).length;
    return '<div class="chap"><input data-chap="' + id + '" value="' + esc(chapName(b, id)) + '" maxlength="16" aria-label="章節名稱"><span class="n">' + n + ' 段</span><button type="button" data-up="' + i + '"' + (i ? '' : ' disabled') + ' aria-label="往前移">↑</button><button type="button" data-down="' + i + '"' + (i < b.order.length - 1 ? '' : ' disabled') + ' aria-label="往後移">↓</button></div>';
  }).join('');
}

/* ================= 備份 ================= */
function refsOf(b){ var a = []; b.memories.forEach(function(m){ a = a.concat(m.photos || [], m.audio || []); }); return a.filter(function(v, i, s){ return s.indexOf(v) === i; }); }
function packBook(){
  var b = book(), media = {}, d = new Date();
  return Promise.all(refsOf(b).map(function(id){ return getMedia(id).then(function(bl){ if(!bl) return; return b2d(bl).then(function(u){ media[id] = u; }); }); })).then(function(){
    return {book:b, blob:new Blob([JSON.stringify({app:'family-memoir', v:1, book:b, media:media})], {type:'application/json'}), name:(b.title || '回憶錄').replace(/[\\/:*?"<>|]/g, '') + '-備份-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '.json'};
  });
}
function markBackup(b){ set.lastExport[b.id] = Date.now(); saveSet(); renderSettings(); }
function exportBook(){
  toast('正在打包，照片多時要等一下');
  packBook().then(function(p){
    var a = document.createElement('a'); a.href = URL.createObjectURL(p.blob); a.download = p.name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
    markBackup(p.book); toast('已匯出備份檔');
  });
}
function canShareFile(){ try{ return !!(navigator.canShare && navigator.canShare({files:[new File(['x'], 'x.json', {type:'application/json'})]})); }catch(e){ return false; } }
function shareBook(){
  toast('正在打包，照片多時要等一下');
  packBook().then(function(p){
    var f = new File([p.blob], p.name, {type:'application/json'});
    return navigator.share({files:[f], title:p.name}).then(function(){ markBackup(p.book); toast('已傳出備份檔'); });
  }).catch(function(e){ if(!e || e.name !== 'AbortError') toast('這台裝置傳不出去，請改用「匯出這本書」'); });
}
function mergeList(oldL, newL){ var ix = {}; oldL.forEach(function(x){ ix[x.id] = x; }); var c = 0; newL.forEach(function(x){ var o = ix[x.id]; if(!o){ oldL.push(x); c++; } else if((x.updatedAt || 0) > (o.updatedAt || 0)){ Object.keys(x).forEach(function(k){ o[k] = x[k]; }); c++; } }); return c; }
function importFile(f){
  var r = new FileReader();
  r.onerror = function(){ toast('讀不到這個檔案'); };
  r.onload = function(){
    var d; try{ d = JSON.parse(r.result); }catch(e){ d = null; }
    if(!d || d.app !== 'family-memoir' || !d.book || !d.book.id || !Array.isArray(d.book.memories)){ toast('這不是家庭回憶錄的備份檔'); return; }
    Promise.all(Object.keys(d.media || {}).map(function(id){ return putMedia(id, d2b(d.media[id])); })).then(function(){
      var have = S.books.filter(function(b){ return b.id === d.book.id; })[0], msg;
      if(have){ norm(have); var c = mergeList(have.memories, d.book.memories || []); mergeList(have.people, d.book.people || []); msg = '已合併，更新 ' + c + ' 段回憶'; S.cur = have.id; }
      else { S.books.push(norm(d.book)); S.cur = d.book.id; msg = '已匯入《' + d.book.title + '》'; }
      save(); renderAll(); toast(msg);
    }).catch(function(){ toast('匯入失敗，裝置空間可能不足'); });
  };
  r.readAsText(f);
}
function deleteBook(id){
  var b = S.books.filter(function(x){ return x.id === id; })[0]; if(!b) return;
  if(!confirm('確定要刪除《' + b.title + '》？裡面的回憶、照片和錄音都會消失，無法復原。')) return;
  refsOf(b).forEach(function(mid){ var used = S.books.some(function(o){ return o !== b && refsOf(o).indexOf(mid) >= 0; }); if(!used) delMedia(mid); });
  S.books = S.books.filter(function(x){ return x !== b; });
  if(!S.books.length) newBook('我們家的回憶錄');
  if(!book()) S.cur = S.books[0].id;
  save(); renderAll(); renderSettings(); toast('已刪除');
}
function clearAll(){
  if(!confirm('確定要清除這台裝置上的全部回憶、照片和錄音？無法復原，請先確認已匯出備份。')) return;
  try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf(PREFIX) === 0) localStorage.removeItem(k); }); }catch(e){}
  db().then(function(d){ if(d) d.close(); var r = indexedDB.deleteDatabase('family-memoir'); r.onsuccess = r.onerror = r.onblocked = function(){ location.reload(); }; });
}

/* ================= 設定與關於 ================= */
function applySet(){ if(set.fs === 'm') document.documentElement.removeAttribute('data-fs'); else document.documentElement.setAttribute('data-fs', set.fs); }
function seg(id, v){ [].forEach.call($(id).children, function(c){ c.classList.toggle('on', c.getAttribute('data-v') === String(v)); }); }
function renderSettings(){
  seg('segFs', set.fs); seg('segDir', set.dir); seg('segBfs', set.bfs); $('setEv').checked = !!set.ev;
  $('ssFs').textContent = {m:'標準', l:'大', xl:'特大'}[set.fs];
  $('ssLay').textContent = (set.dir === 'v' ? '直排' : '橫排') + '・' + {'12':'小', '13.5':'中', '15.5':'大'}[set.bfs] + '字';
  $('ssShelf').textContent = S.books.length + ' 本'; $('shareBook').hidden = !canShareFile();
  var t = set.lastExport[S.cur]; $('ssData').textContent = t ? '上次備份 ' + new Date(t).toLocaleDateString('zh-TW') : '這本書還沒備份過';
  $('shelfList').innerHTML = S.books.map(function(b){ return '<div class="shelf"><b>' + esc(b.title) + (b.sample ? '（虛構範例）' : '') + '</b><span style="font-size:.84rem;color:var(--sub)">' + b.memories.length + ' 段</span><button class="btn small" type="button" data-open-book="' + esc(b.id) + '"' + (b.id === S.cur ? ' disabled' : '') + '>打開</button><button class="btn small danger" type="button" data-del-book="' + esc(b.id) + '">刪除</button></div>'; }).join('');
}
function saveFold(){ var o = []; document.querySelectorAll('.set-sec').forEach(function(d){ if(d.open) o.push(d.getAttribute('data-sec')); }); lsSet(FOLD_KEY, JSON.stringify(o)); }
function restoreFold(){ var o = []; try{ o = JSON.parse(lsGet(FOLD_KEY) || '[]') || []; }catch(e){} document.querySelectorAll('.set-sec').forEach(function(d){ d.open = o.indexOf(d.getAttribute('data-sec')) >= 0; }); }
function openAbout(sec){ $('about').classList.add('show'); document.body.style.overflow = 'hidden'; if(sec === 'creator') setTimeout(function(){ $('creatorBox').scrollIntoView({block:'center'}); }, 30); else $('about').scrollTop = 0; }
function closeAbout(){ $('about').classList.remove('show'); if(!$('settings').classList.contains('show')) document.body.style.overflow = ''; lsSet(WARN_KEY, '1'); }
function closeSet(){ $('settings').classList.remove('show'); document.body.style.overflow = ''; }

/* ================= 共用：跑馬燈／PWA ================= */
function initMarquee(){
  var URL_ = "https://script.google.com/macros/s/AKfycbwKX0DNNbY8y4nf90BFTHtxgfqJcHHcZasRrgycl4QAe52_hkjMWSkYk4xOsqU-JPCROw/exec";
  var KEY = PREFIX + 'marquee', REFRESH = 20 * 60 * 1000, bar = $('marqueeBar'), track = $('marqueeTrack'), lastKey = null;
  function loadCache(){ try{ return JSON.parse(lsGet(KEY) || '[]'); }catch(e){ return []; } }
  function appendText(c, text){ var re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, li = 0, m; while((m = re.exec(text))){ if(m.index > li) c.appendChild(document.createTextNode(text.slice(li, m.index))); var a = document.createElement('a'); a.href = m[2]; a.textContent = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = 'inherit'; a.style.textDecoration = 'underline'; c.appendChild(a); li = re.lastIndex; } if(li < text.length) c.appendChild(document.createTextNode(text.slice(li))); }
  function renderM(items){
    if(!items || !items.length) return;
    var k = JSON.stringify(items); if(k === lastKey) return; lastKey = k; track.innerHTML = '';
    var fr = document.createDocumentFragment();
    function pass(){ items.forEach(function(it, i){ if(i > 0) fr.appendChild(document.createTextNode('　★　')); appendText(fr, String(it)); }); }
    pass(); fr.appendChild(document.createTextNode('　★　')); pass(); track.appendChild(fr);
    bar.classList.add('show'); document.body.classList.add('has-marquee');
    track.style.animationDuration = Math.max(track.scrollWidth / 2 / 80, 10) + 's';
  }
  function fetchM(){ fetch(URL_, {method:'POST', body:JSON.stringify({serial:''})}).then(function(r){ return r.json(); }).then(function(d){ if(d && Array.isArray(d.marquee) && d.marquee.length){ lsSet(KEY, JSON.stringify(d.marquee)); renderM(d.marquee); } }).catch(function(){}); }
  renderM(loadCache()); fetchM(); setInterval(fetchM, REFRESH);
}
function initPwa(){
  var dp = null, ua = navigator.userAgent || '';
  var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var mac = /Macintosh/.test(ua) && !ios, safari = /^((?!chrome|crios|fxios|edgios|android).)*safari/i.test(ua);
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  function fbMsg(){ if(ios) return '請點畫面上的「分享」圖示，選「加入主畫面」'; if(mac && safari) return '請用選單列「檔案」→「加入 Dock」（Safari 17 以上）'; return '目前瀏覽器不支援安裝，或已安裝過'; }
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); dp = e; });
  window.addEventListener('appinstalled', function(){ dp = null; toast('已加入主畫面'); });
  document.querySelectorAll('[data-install]').forEach(function(b){
    if(standalone){ b.style.display = 'none'; return; }
    b.addEventListener('click', function(){ if(!dp){ toast(fbMsg()); return; } try{ dp.prompt(); dp.userChoice.then(function(){ dp = null; }); }catch(e){ toast(fbMsg()); } });
  });
  if('serviceWorker' in navigator && location.protocol !== 'file:'){ window.addEventListener('load', function(){ navigator.serviceWorker.register('service-worker.js').catch(function(){}); }); }
}

/* ================= 分頁與事件 ================= */
function go(t){ tab = t; document.querySelectorAll('#tabs button').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-tab') === t); }); document.querySelectorAll('.view').forEach(function(v){ v.classList.toggle('on', v.id === 'v-' + t); }); renderView(); window.scrollTo(0, 0); }
function renderView(){ if(tab === 'today') renderToday(); else if(tab === 'box') renderBox(); else if(tab === 'time') renderTime(); else if(tab === 'tree') renderTree(); else return renderBook(); }
function renderAll(){
  norm(book());
  $('bookSel').innerHTML = S.books.map(function(b){ return '<option value="' + esc(b.id) + '">' + esc(b.title) + '</option>'; }).join(''); $('bookSel').value = S.cur;
  return renderView();
}
function bookField(id, key){ $(id).addEventListener('change', function(){ book()[key] = this.value.trim(); save(); renderAll(); }); }
function bind(){
  document.addEventListener('click', function(e){
    var t = e.target.closest('[data-tab],[data-q],[data-mem],[data-new],[data-sample],[data-person],[data-open-about],[data-delm],[data-up],[data-down],[data-open-book],[data-del-book],[data-tz]');
    if(!t) return;
    if(t.hasAttribute('data-tz')){ zoomTree(t.getAttribute('data-tz')); return; }
    if(t.hasAttribute('data-open-about')){ openAbout(t.getAttribute('data-open-about')); return; }
    if(t.hasAttribute('data-tab')){ go(t.getAttribute('data-tab')); return; }
    if(t.hasAttribute('data-q')){ var b = book(), id = t.getAttribute('data-q'), m = b.memories.filter(function(x){ return x.qid === id; })[0]; openEditor(m || null, m ? null : qOf(id)); return; }
    if(t.hasAttribute('data-mem')){ openEditor(book().memories.filter(function(x){ return x.id === t.getAttribute('data-mem'); })[0]); return; }
    if(t.hasAttribute('data-new')){ openEditor(null, null); return; }
    if(t.hasAttribute('data-sample')){ loadSample(); return; }
    if(t.hasAttribute('data-person')){ openPerson(person(book(), t.getAttribute('data-person'))); return; }
    if(t.hasAttribute('data-delm')){ var mid = t.getAttribute('data-delm'); ed.photos = ed.photos.filter(function(x){ return x !== mid; }); ed.audio = ed.audio.filter(function(x){ return x !== mid; }); ed.removed.push(mid); renderEdMedia(); return; }
    if(t.hasAttribute('data-up') || t.hasAttribute('data-down')){ var bk = book(), i = +(t.getAttribute('data-up') || t.getAttribute('data-down')), j = t.hasAttribute('data-up') ? i - 1 : i + 1, tmp = bk.order[i]; bk.order[i] = bk.order[j]; bk.order[j] = tmp; save(); renderBook(); return; }
    if(t.hasAttribute('data-open-book')){ S.cur = t.getAttribute('data-open-book'); save(); closeSet(); renderAll(); return; }
    if(t.hasAttribute('data-del-book')){ deleteBook(t.getAttribute('data-del-book')); }
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){ if($('shareBox').classList.contains('show')) closeShare(); else if($('about').classList.contains('show')) closeAbout(); else if($('person').classList.contains('show')) closePerson(); else if($('settings').classList.contains('show')) closeSet(); else if(ed) cancelEditor(); return; }
    var n = e.target.closest && e.target.closest('.tn'); if(n && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); n.dispatchEvent(new MouseEvent('click', {bubbles:true})); return; }
    if(tab === 'book' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !document.querySelector('.modal.show')){ if(e.key === 'ArrowLeft') turn(set.dir === 'v' ? 1 : -1); if(e.key === 'ArrowRight') turn(set.dir === 'v' ? -1 : 1); }
  });
  $('bookSel').onchange = function(){ S.cur = this.value; save(); renderAll(); };
  $('openSet').onclick = function(){ renderSettings(); restoreFold(); $('settings').classList.add('show'); document.body.style.overflow = 'hidden'; };
  $('setX').onclick = closeSet; $('aboutX').onclick = closeAbout; $('aboutOk').onclick = closeAbout;
  $('edX').onclick = cancelEditor; $('edCancel').onclick = cancelEditor; $('edSave').onclick = saveEditor; $('edDel').onclick = deleteMemory;
  $('edRec').onclick = toggleRec; $('edMic').onclick = toggleMic;
  $('edText').addEventListener('input', function(){ if(ed && !ed.id) lsSet(draftKey(), JSON.stringify({b:S.cur, q:ed.qid, t:this.value})); });
  $('edPhoto').onchange = function(){ var cur = ed, fs = [].slice.call(this.files); this.value = ''; fs.reduce(function(p, f){ return p.then(function(){ return shrink(f); }).then(function(bl){ var id = uid('i'); return putMedia(id, bl).then(function(){ cur.photos.push(id); cur.added.push(id); }); }); }, Promise.resolve()).then(function(){ if(ed === cur) renderEdMedia(); }).catch(function(){ toast('有照片讀不到或空間不足，請換一張'); if(ed === cur) renderEdMedia(); }); };
  $('edAi').onclick = function(){ var t = $('edText').value.trim(); if(!t){ toast('先寫下一些內容，才能複製提示詞'); return; } var q = $('edQ').hidden ? '' : '問題：' + $('edQ').textContent + '\n'; copy('請把下面的口述整理成通順的第一人稱段落。保留原本的用詞、口氣和台語說法。不要加入原文沒有的事實、日期或情緒，也不要美化。看不懂的地方用（？）標示，不要猜。\n\n' + q + '口述：\n' + t, '已複製提示詞，貼到 AI 前請拿掉敏感資料'); };
  $('pnX').onclick = closePerson; $('pnCancel').onclick = closePerson; $('pnSave').onclick = savePerson; $('pnDel').onclick = deletePerson;
  $('pnMem').onclick = function(){ var id = pn; closePerson(); go('box'); $('fp').value = id; renderBox(); };
  $('addPerson').onclick = function(){ openPerson(null); };
  ['fq', 'fs', 'fp'].forEach(function(id){ $(id).addEventListener('input', renderBox); });
  $('tlEv').onchange = function(){ set.tlEv = this.checked; saveSet(); renderTime(); };
  bookField('bTitle', 'title'); bookField('bSubject', 'subject'); bookField('bEditor', 'editor'); bookField('bDed', 'dedication'); bookField('bAft', 'afterword');
  $('chapList').addEventListener('change', function(e){ var id = e.target.getAttribute('data-chap'); if(!id) return; var b = book(), v = e.target.value.trim(); if(v && v !== stageOf(id).n) b.chapterNames[id] = v; else delete b.chapterNames[id]; save(); renderBook(); });
  $('navL').onclick = function(){ turn(set.dir === 'v' ? 1 : -1); }; $('navR').onclick = function(){ turn(set.dir === 'v' ? -1 : 1); };
  $('printBtn').onclick = function(){ buildBook().then(function(r){ if(r){ showSpread(); window.print(); } }); };
  var wide = window.innerWidth > 900, rz;
  function foldBook(){ $('bfInfo').open = wide; $('bfChap').open = wide; }
  foldBook();
  window.addEventListener('resize', function(){
    clearTimeout(rz);
    rz = setTimeout(function(){
      var w = window.innerWidth > 900; if(w !== wide){ wide = w; foldBook(); }
      if(tab === 'book') showSpread(); else if(tab === 'tree') fitTree();
    }, 120);
  });
  var tx = null;
  $('spreadWrap').addEventListener('touchstart', function(e){ tx = e.touches.length === 1 ? [e.touches[0].clientX, e.touches[0].clientY] : null; }, {passive:true});
  $('spreadWrap').addEventListener('touchend', function(e){
    if(!tx) return; var t = e.changedTouches[0], dx = t.clientX - tx[0], dy = t.clientY - tx[1]; tx = null;
    if(Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    turn(set.dir === 'v' ? (dx > 0 ? 1 : -1) : (dx < 0 ? 1 : -1));
  }, {passive:true});
  function segBind(id, key){ $(id).addEventListener('click', function(e){ var v = e.target.getAttribute('data-v'); if(!v) return; set[key] = v; saveSet(); applySet(); renderSettings(); if(tab === 'book' && key !== 'fs') renderBook(); }); }
  segBind('segFs', 'fs'); segBind('segDir', 'dir'); segBind('segBfs', 'bfs');
  $('setEv').onchange = function(){ set.ev = this.checked; saveSet(); if(tab === 'book') renderBook(); };
  $('newBook').onclick = function(){ var t = prompt('新書的名字', '我們家的回憶錄'); if(t && t.trim()){ newBook(t.trim().slice(0, 30)); closeSet(); renderAll(); } };
  $('loadSample').onclick = function(){ closeSet(); loadSample(); };
  $('shareBook').onclick = shareBook;
  $('shX').onclick = closeShare; $('shText').addEventListener('input', lineHref);
  $('shLine').onclick = function(e){ if(!$('shText').value.trim()){ e.preventDefault(); toast('先寫下要傳的話'); return; } setTimeout(closeShare, 0); };
  $('shCopy').onclick = function(){ copy($('shText').value, '已複製，可以貼到 LINE'); closeShare(); };
  $('shOther').onclick = function(){ navigator.share({text:$('shText').value}).then(closeShare).catch(function(){}); };
  $('exportBtn').onclick = exportBook; $('clearAll').onclick = clearAll;
  $('importFile').onchange = function(){ if(this.files[0]) importFile(this.files[0]); this.value = ''; };
  document.querySelectorAll('.set-sec').forEach(function(d){ d.addEventListener('toggle', saveFold); });
  $('foldOpen').onclick = function(){ document.querySelectorAll('.set-sec').forEach(function(d){ d.open = true; }); saveFold(); };
  $('foldClose').onclick = function(){ document.querySelectorAll('.set-sec').forEach(function(d){ d.open = false; }); saveFold(); };
}

load(); applySet(); bind(); renderAll(); initMarquee(); initPwa();
if(lsGet(WARN_KEY) !== '1') openAbout();
window._fm = {S:function(){ return S; }, go:go, loadSample:loadSample, buildBook:buildBook, pages:function(){ return pages; }, set:set, treeLayout:treeLayout, parseYear:parseYear, numCn:numCn, vtext:vtext};
})();
