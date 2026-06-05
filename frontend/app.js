// 今日拍板 v2 — 四页 SPA：对话规划 / 地图路线 / 发现 / 历史
// ----------------------------------------------------------------

// ===== 全局状态 =====
const S = {
  sessionId: null,
  scene: 'family',
  plans: [],
  currentPlan: null,
  currentIntent: null,
  extras: [],
  mapInstance: null,
  mapLayers: [],
  planSummary: '',   // 用于 /api/chat 上下文
};

// ===== DOM 引用 =====
const $ = id => document.getElementById(id);
const chat       = $('chat');
const inputEl    = $('input');
const sendBtn    = $('send');
const relayMask  = $('relayMask');
const relayCard  = $('relayCard');
const askMask    = $('askMask');
const askChat    = $('askChat');
const askInput   = $('askInput');
const askSend    = $('askSend');
const askClose   = $('askClose');
const mapTitle   = $('mapTitle');
const mapMeta    = $('mapMeta');
const mapSteps   = $('mapSteps');
const discoverList = $('discoverList');
const historyList  = $('historyList');

// ===== 工具 =====
function esc(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function scrollDown(){ chat.scrollTop = chat.scrollHeight; }
function node(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }

function msgBot(html){
  const n = node(`<div class="msg bot"><div class="bubble">${html}</div></div>`);
  chat.appendChild(n); scrollDown(); return n;
}
function msgUser(text){
  chat.appendChild(node(`<div class="msg user"><div class="bubble">${esc(text)}</div></div>`));
  scrollDown();
}

let thinkNode = null;
function showThink(text){
  thinkNode = node(`<div class="msg bot"><div class="bubble">
    <div style="font-size:13px;color:#8a8f99;margin-bottom:6px">${text}</div>
    <div class="thinking"><span></span><span></span><span></span></div>
  </div></div>`);
  chat.appendChild(thinkNode); scrollDown();
}
function hideThink(){ if(thinkNode){ thinkNode.remove(); thinkNode=null; } }

// ===== 底部导航 =====
let activeTab = 'chat';
document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => switchPage(btn.dataset.page);
});

function switchPage(name){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  $(`page-${name}`).classList.add('active');
  document.querySelector(`.tab[data-page="${name}"]`).classList.add('active');
  activeTab = name;

  if(name === 'map')      initMapPage();
  if(name === 'discover') initDiscoverPage();
  if(name === 'history')  renderHistoryPage();
}

// ===== 对话流 =====
async function doPlan(text){
  msgUser(text);
  $('examples')?.remove();
  showThink('正在理解你的需求，推断隐藏偏好…');

  let data;
  try {
    const r = await fetch('/api/plan', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({text}),
    });
    data = await r.json();
  } catch(e){ hideThink(); msgBot('网络出错了，请重试。'); return; }
  hideThink();

  S.sessionId    = data.session_id;
  S.scene        = data.intent.scene;
  S.plans        = data.plans;
  S.currentIntent= data.intent;

  renderIntent(data.intent);
  msgBot(`好的，根据你的情况帮你想到了几个要点（见上）。<br>下面是为「${sceneLabel(data.intent)}」量身定制的方案：`);
  data.plans.forEach(p => renderPlan(p, p.id === data.recommended_plan_id));
}

function sceneLabel(intent){
  if(intent.scene==='family'){
    return intent.members?.some(m=>m.role==='child') ? `全家(${intent.party_size}人)` : '二人';
  }
  return `朋友局(${intent.party_size}人)`;
}

// ===== 约束卡 =====
const consMap = {
  max_travel_minutes:'别跑太远', kid_friendly:'孩子能玩',
  need_kid_seat:'孩子吃饭', low_cal_diet:'减脂友好',
  need_private_room:'聚会包厢', group_activity:'成人活动',
};
function renderIntent(intent){
  const inferred = (intent.constraints||[]).filter(c=>c.source==='inferred');
  if(!inferred.length) return;
  const lines = inferred.map(c=>`<div class="con"><b>${esc(consMap[c.key]||c.key)}</b>：${esc(c.reason)}</div>`).join('');
  const n = node(`<div class="msg bot" style="max-width:100%">
    <div class="intent-card">
      <div class="ic-title">🧠 我帮你想到的（你没说，但很重要）</div>${lines}
    </div></div>`);
  chat.appendChild(n); scrollDown();
}

// ===== 方案卡 =====
function renderPlan(plan, recommended){
  const steps = plan.steps.map(s=>`
    <div class="step">
      <div class="dot">${slotIcon(s.slot)}</div>
      <div class="sbody">
        <div class="stime">${esc(s.time_range)} · ${esc(s.slot)}</div>
        <div class="sname">${esc(s.venue.name)}</div>
        <div class="swhy">${esc(s.why)}</div>
        ${s.venue.address ? `<div class="saddr" onclick="openMapForVenue('${s.venue.id}')">📍 ${esc(s.venue.address)} → 查看地图</div>` : ''}
      </div>
    </div>`).join('');
  const tags = plan.highlights.map(h=>`<span class="t">${esc(h)}</span>`).join('');
  const aud  = S.scene==='friends'?'friends':'spouse';
  const audLabel = S.scene==='friends'?'朋友':'老婆';

  const n = node(`<div class="msg bot" style="max-width:100%;width:100%">
    <div class="plan-card ${recommended?'recommended':''}">
      <div class="plan-head">
        <span class="pt">${esc(plan.title)}</span>
        ${recommended?'<span class="badge">推荐</span>':''}
      </div>
      <div class="plan-meta">约 ${Math.round(plan.total_minutes/60)} 小时 · 预估总花费 ¥${plan.total_cost}</div>
      <div class="plan-steps">${steps}</div>
      <div class="plan-tags">${tags}</div>
      <div class="relay-trigger">
        <button class="rt" data-plan='${JSON.stringify(plan)}' data-aud="${aud}">📲 递给${audLabel}看看</button>
      </div>
      <div class="plan-actions">
        <button class="btn btn-blue js-map">🗺️ 看路线</button>
        <button class="btn btn-primary js-choose">就选这个 →</button>
      </div>
    </div></div>`);

  n.querySelector('.rt').onclick = () => openRelay(plan, aud);
  n.querySelector('.js-map').onclick = () => loadPlanToMap(plan);
  n.querySelector('.js-choose').onclick = () => choosePlan(plan);
  chat.appendChild(n); scrollDown();
}
function slotIcon(slot){ return ({'活动':'🎯','正餐':'🍽','附加活动':'✨'})[slot]||'📍'; }

// ===== 打开地图页（全程路线） =====
function loadPlanToMap(plan){
  S.currentPlan = plan;
  // 收集方案摘要给追问用
  S.planSummary = plan.steps.map(s=>`${s.slot}：${s.venue.name}`).join('，');
  switchPage('map');
}

// 点击地址跳到地图查看单个场所
function openMapForVenue(venueId){
  const allVenues = S.plans.flatMap(p=>p.steps.map(s=>s.venue));
  const v = allVenues.find(v=>v.id===venueId);
  if(!v) return;
  S.currentPlan = { steps:[{slot:'场所', time_range:'', venue:v, why:'', order:1}], title:v.name, total_minutes:0, total_cost:0 };
  switchPage('map');
}
window.openMapForVenue = openMapForVenue;

// ===== 地图页 =====
function initMapPage(){
  if(!S.mapInstance){
    S.mapInstance = L.map('map').setView([40.0000, 116.4700], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap',maxZoom:19
    }).addTo(S.mapInstance);
  }
  // 清除旧图层
  S.mapLayers.forEach(l=>S.mapInstance.removeLayer(l));
  S.mapLayers = [];

  const plan = S.currentPlan;
  if(!plan || !plan.steps.length){
    mapTitle.textContent='全程路线';
    mapMeta.textContent='选好方案后查看路线';
    mapSteps.innerHTML='<div class="map-empty">💡 在规划页选择方案后，<br>点击「看路线」即可显示全程地图</div>';
    return;
  }

  mapTitle.textContent = plan.title || '全程路线';

  // 出发点
  const home = {lat:40.0000, lng:116.4700, name:'出发点（望京）'};
  const homeIcon = L.divIcon({html:'🏠',iconSize:[28,28],className:'',iconAnchor:[14,28]});
  const hm = L.marker([home.lat,home.lng],{icon:homeIcon})
    .bindPopup(`<div class="map-popup"><strong>出发点</strong><br>${home.name}</div>`)
    .addTo(S.mapInstance);
  S.mapLayers.push(hm);

  const points = [[home.lat, home.lng]];
  const stepCards = [];

  plan.steps.forEach((step, i) => {
    const v = step.venue;
    if(!v.lat || !v.lng) return;
    const icon = L.divIcon({
      html:`<div style="background:${i===0?'#ffd100':'#ff6900'};color:#1a1a1a;border-radius:50%;width:28px;height:28px;display:grid;place-items:center;font-weight:700;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,.3)">${i+1}</div>`,
      iconSize:[28,28], className:'', iconAnchor:[14,28]
    });
    const marker = L.marker([v.lat,v.lng],{icon})
      .bindPopup(`<div class="map-popup">
        <strong>${esc(v.name)}</strong><br>
        ${esc(step.slot)} · ${esc(step.time_range)}<br>
        📍 ${esc(v.address||'')}<br>
        ⭐ ${v.rating} · 人均¥${v.price_per_person}
      </div>`)
      .addTo(S.mapInstance);
    S.mapLayers.push(marker);
    points.push([v.lat, v.lng]);

    // 计算与上一点的距离
    const prev = points[points.length-2];
    const dist = calcDist(prev[0],prev[1],v.lat,v.lng);
    const walkMin = Math.round(dist/80);  // 步行约80m/min

    stepCards.push(`<div class="map-step-card">
      <div class="ms-num">${i+1}</div>
      <div class="ms-body">
        <div class="ms-name">${esc(step.slot)} · ${esc(v.name)}</div>
        <div class="ms-addr">📍 ${esc(v.address||'')}</div>
        <div class="ms-dist">🚶 距上一点约 ${dist<1000?dist+'m':(dist/1000).toFixed(1)+'km'}，步行约${walkMin}分钟</div>
      </div>
    </div>`);
  });

  // 连接路线
  if(points.length > 1){
    const polyline = L.polyline(points,{color:'#ff6900',weight:3,opacity:.8,dashArray:'6,6'}).addTo(S.mapInstance);
    S.mapLayers.push(polyline);
    S.mapInstance.fitBounds(polyline.getBounds(),{padding:[20,20]});
  }

  mapMeta.textContent = `${plan.steps.length} 个站点 · 全程约 ${plan.total_minutes} 分钟`;
  mapSteps.innerHTML = stepCards.join('')+`
    <div style="padding:8px 4px;text-align:center">
      <button class="btn btn-primary" style="width:100%;margin-top:4px" onclick="openAskFromMap()">💬 问我怎么去 / 有什么好建议</button>
    </div>`;

  // 小延迟后重绘（Leaflet 在隐藏 div 中初始化需要 invalidateSize）
  setTimeout(()=>S.mapInstance.invalidateSize(),50);
}

window.openAskFromMap = () => openAsk();

function calcDist(lat1,lng1,lat2,lng2){
  const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}

// ===== 发现页 =====
async function initDiscoverPage(){
  if(discoverList.dataset.loaded) return;
  discoverList.dataset.loaded='1';
  discoverList.innerHTML='<div style="padding:30px;text-align:center;color:#8a8f99">加载中…</div>';
  try {
    const r = await fetch('/api/discover');
    const data = await r.json();
    renderDiscover(data.spots);
  } catch(e){
    discoverList.innerHTML='<div style="padding:30px;text-align:center;color:#fa5151">加载失败，请重试</div>';
  }
}

function renderDiscover(spots){
  discoverList.innerHTML = spots.map(s=>`
    <div class="disc-card" onclick="discoverSpotDetail(${JSON.stringify(s).replace(/"/g,'&quot;')})">
      <div class="disc-emoji">${s.img_emoji}</div>
      <div class="disc-body">
        <div class="disc-name">${esc(s.name)}</div>
        <div class="disc-cat">${esc(s.category)}</div>
        <div class="disc-heat">${s.heat} 热度</div>
        <div class="disc-tip">💡 ${esc(s.tip)}</div>
        <div class="disc-price">${s.price===0?'免费':`人均 ¥${s.price}`}</div>
      </div>
      <div class="disc-add"><button onclick="event.stopPropagation();addDiscoverToChat('${esc(s.name)}')">加入计划</button></div>
    </div>`).join('');
}

window.discoverSpotDetail = (s) => {
  // 在地图上显示该场所
  S.currentPlan = {
    title: s.name, total_minutes: s.duration_min, total_cost: s.price,
    steps:[{slot:'发现', time_range:'', order:1, why:s.tip,
            venue:{id:'d'+s.id,name:s.name,lat:s.lat,lng:s.lng,
                   address:`${s.category} · ${s.name}`,rating:4.5,
                   price_per_person:s.price,category:s.category,tags:[]}}]
  };
  switchPage('map');
};

window.addDiscoverToChat = (name) => {
  switchPage('chat');
  setTimeout(()=>{
    inputEl.value = `我想去${name}，帮我规划一下下午`;
    inputEl.focus();
  }, 100);
};

// ===== 历史页 =====
const HIST_KEY = 'jinripaibanHistory';

function saveHistory(plan, summary){
  const hist = JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
  hist.unshift({
    id: Date.now(),
    planId: plan.id,
    title: plan.title,
    summary,
    steps: plan.steps.map(s=>`${s.slot}：${s.venue.name}`),
    plan,
    date: new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}),
  });
  localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(0,20)));
}

function renderHistoryPage(){
  const hist = JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
  if(!hist.length){
    historyList.innerHTML='<div class="hist-empty">📭 还没有决策记录<br><span style="font-size:12px;margin-top:6px;display:block">规划并执行一次方案后，记录会出现在这里</span></div>';
    return;
  }
  historyList.innerHTML = hist.map(h=>`
    <div class="hist-card">
      <div class="hist-head">
        <span class="hist-title">${esc(h.title)}</span>
        <span class="hist-time">${esc(h.date)}</span>
      </div>
      <div class="hist-steps">${h.steps.map(s=>`• ${esc(s)}`).join('<br>')}</div>
      <div class="hist-actions">
        <button class="hist-btn ghost" onclick="histView(${h.id})">查看地图</button>
        <button class="hist-btn primary" onclick="histRerun(${h.id})">重新执行</button>
      </div>
    </div>`).join('');
}

window.histView = (id) => {
  const hist = JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
  const h = hist.find(x=>x.id===id);
  if(h){ S.currentPlan=h.plan; switchPage('map'); }
};
window.histRerun = (id) => {
  const hist = JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
  const h = hist.find(x=>x.id===id);
  if(h){ choosePlan(h.plan); switchPage('chat'); }
};

// ===== 接力浮层 =====
async function openRelay(plan, audience){
  S.currentPlan = plan;
  try {
    const r = await fetch('/api/relay',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({plan,audience,scene:S.scene}),
    });
    const card = await r.json();
    const focus = card.focus_points.map(f=>`<div class="rfocus">${esc(f)}</div>`).join('');
    const actions = card.quick_actions.map((a,i)=>
      `<button class="ra ${i===0?'primary':'sec'}" data-i="${i}">${esc(a)}</button>`).join('');
    relayCard.innerHTML=`
      <div class="rh">${esc(card.headline)}</div>
      ${focus}
      <div class="ractions">${actions}</div>
      <div class="relay-hint">👆 把手机递给${audience==='friends'?'朋友':'TA'}，一键拍板</div>`;
    relayCard.querySelectorAll('.ra').forEach(btn=>{
      btn.onclick=()=>{
        relayMask.hidden=true;
        if(+btn.dataset.i===0){
          msgBot(`✅ ${audience==='friends'?'朋友':'老婆'}同意了「${card.quick_actions[0]}」，那就这么定！`);
          choosePlan(plan);
        } else {
          msgBot(`收到反馈「${card.quick_actions[+btn.dataset.i]}」，你想怎么调整？告诉我新的要求，我重新帮你规划。`);
          inputEl.focus();
        }
      };
    });
  } catch(e){
    relayCard.innerHTML='<div style="padding:20px;text-align:center">加载失败</div>';
  }
  relayMask.hidden=false;
}
relayMask.onclick = e => { if(e.target===relayMask) relayMask.hidden=true; };

// ===== 确认方案 → 额外选项 → 执行 =====
function choosePlan(plan){
  S.currentPlan=plan;
  S.extras=[];
  S.planSummary = plan.steps.map(s=>`${s.slot}：${s.venue.name}`).join('，');

  const n = node(`<div class="msg bot" style="max-width:100%;width:100%">
    <div class="plan-card">
      <div class="plan-head"><span class="pt">确认「${esc(plan.title)}」</span></div>
      <div class="extras">
        <div class="el">要不要顺手安排点惊喜？（送到餐厅）</div>
        <div class="opts">
          <span class="opt" data-x="蛋糕">🎂 蛋糕</span>
          <span class="opt" data-x="鲜花">💐 鲜花</span>
          <span class="opt" data-x="买菜">🛒 宵夜食材</span>
        </div>
      </div>
      <div class="plan-actions">
        <button class="btn btn-blue js-ask2">💬 再问一下</button>
        <button class="btn btn-primary js-exec">🚀 一键安排所有</button>
      </div>
    </div></div>`);

  n.querySelectorAll('.opt').forEach(o=>{
    o.onclick=()=>{
      o.classList.toggle('on');
      const x=o.dataset.x;
      S.extras = o.classList.contains('on') ? [...S.extras,x] : S.extras.filter(v=>v!==x);
    };
  });
  n.querySelector('.js-exec').onclick = () => doExecute(plan);
  n.querySelector('.js-ask2').onclick = () => openAsk();
  chat.appendChild(n); scrollDown();
}

async function doExecute(plan){
  showThink('正在并行下单：预约餐厅、购票、安排惊喜…');
  let res;
  try {
    const r = await fetch('/api/execute',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({session_id:S.sessionId,plan,extras:S.extras}),
    });
    res = await r.json();
  } catch(e){ hideThink(); msgBot('执行出错，请重试。'); return; }
  hideThink();
  renderExecResult(res, plan);
}

function renderExecResult(res, plan){
  const items = res.items.map(it=>{
    const icon = it.status==='success'?'✅':it.status==='fallback'?'🔄':'⚠️';
    const cls = it.status==='failed'?'failed':'';
    const note = it.fallback_note?`<div class="enote">↳ ${esc(it.fallback_note)}</div>`:'';
    return `<div class="exec-item ${cls}"><span class="ei">${icon}</span>
      <div class="ed"><b>${esc(it.action)}</b>　${esc(it.detail)}${note}</div></div>`;
  }).join('');

  const n = node(`<div class="msg bot" style="max-width:100%;width:100%">
    <div class="exec-card">
      <div class="eh">${res.all_success?'🎉 全部搞定！':'已尽力安排（部分需你确认）'}</div>
      ${items}
      <div class="share-box">${esc(res.itinerary.share_text)}</div>
      <button class="share-btn js-share">📤 复制行程，发给朋友/家庭群</button>
      <button class="ask-btn js-ask">💬 问问助手：路线怎么走 / 有什么建议</button>
    </div></div>`);

  n.querySelector('.js-share').onclick = () => {
    navigator.clipboard?.writeText(res.itinerary.share_text);
    msgBot('✅ 行程文案已复制，去粘贴到聊天里吧！');
    saveHistory(plan, res.itinerary.summary);
  };
  n.querySelector('.js-ask').onclick = () => openAsk();
  chat.appendChild(n); scrollDown();

  // 执行完自动把路线载入地图
  S.currentPlan = plan;

  // 提示用户去看地图
  setTimeout(()=>{
    msgBot('路线已就绪，切换到「🗺️ 地图」页可查看全程路线和步行距离，也可在地图页追问助手路线建议。');
  }, 600);
}

// ===== 追问助手 =====
let askContext = '';
function openAsk(){
  askContext = S.planSummary;
  askMask.hidden = false;
  askInput.focus();
}
askClose.onclick = () => { askMask.hidden=true; };
askMask.onclick = e => { if(e.target===askMask) askMask.hidden=true; };

async function sendAsk(){
  const msg = askInput.value.trim();
  if(!msg) return;
  askInput.value='';
  const userBubble = node(`<div class="ask-bubble user">${esc(msg)}</div>`);
  askChat.appendChild(userBubble);
  askChat.scrollTop = askChat.scrollHeight;

  const loadingBubble = node(`<div class="ask-bubble bot">…</div>`);
  askChat.appendChild(loadingBubble);
  askChat.scrollTop = askChat.scrollHeight;

  try {
    const r = await fetch('/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:msg, context:askContext}),
    });
    const d = await r.json();
    loadingBubble.textContent = d.reply;
  } catch(e){
    loadingBubble.textContent = '暂时无法回答，请稍后再试。';
  }
  askChat.scrollTop = askChat.scrollHeight;
}

askSend.onclick = sendAsk;
askInput.onkeydown = e => { if(e.key==='Enter') sendAsk(); };

// ===== 主输入 =====
function submit(){
  const t = inputEl.value.trim();
  if(!t) return;
  inputEl.value='';
  doPlan(t);
}
sendBtn.onclick = submit;
inputEl.onkeydown = e => { if(e.key==='Enter') submit(); };
document.querySelectorAll('.chip').forEach(c=>{
  c.onclick = () => doPlan(c.dataset.text);
});

// ===== 初始化 =====
// 地图页初始占位（等 Leaflet loaded）
setTimeout(() => {
  if(typeof L !== 'undefined'){
    S.mapInstance = L.map('map').setView([40.0000,116.4700],14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap',maxZoom:19
    }).addTo(S.mapInstance);
    // 加默认地标
    L.marker([40.0000,116.4700],{icon:L.divIcon({html:'🏠',iconSize:[28,28],className:'',iconAnchor:[14,28]})})
      .bindPopup('出发点：望京')
      .addTo(S.mapInstance);
    // 把发现页场所预标
    fetch('/api/discover').then(r=>r.json()).then(({spots})=>{
      spots.forEach(s=>{
        L.circleMarker([s.lat,s.lng],{radius:6,color:'#ffd100',fillColor:'#ff6900',fillOpacity:.7,weight:2})
          .bindPopup(`<div class="map-popup"><strong>${esc(s.name)}</strong><br>${s.img_emoji} ${esc(s.tip)}</div>`)
          .addTo(S.mapInstance);
      });
    }).catch(()=>{});
  }
}, 300);
