(function(){
"use strict";
var TYPES=[{k:'IN',zh:'进货',c:'#16a34a'},{k:'OUT',zh:'出货',c:'#dc2626'},{k:'ENT',zh:'招待',c:'#7c3aed'},{k:'FOC',zh:'免费',c:'#ea580c'}];
var TMAP={};TYPES.forEach(function(t){TMAP[t.k]=t});
var CAT_EMOJI={'Beer':'🍺','Soft Drink':'🥤','Liquor':'🥃','Wine':'🍷','Food':'🍟','Fruit':'🍎','Tea':'🍵'};
var LS_KEY='stocktake_local_v1',UI_KEY='stocktake_ui_v1';
var S;try{S=JSON.parse(document.getElementById('state').textContent)}catch(e){S={iseq:1,seq:1,items:[],tx:[]}}
var saving=false,mode='local';
try{var l0=localStorage.getItem(LS_KEY);if(l0)S=JSON.parse(l0)}catch(e){}
function saveLocal(){try{localStorage.setItem(LS_KEY,JSON.stringify(S));return true}catch(e){toast('保存失败：手机存储不可用');return false}}
try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
var deferredPrompt=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredPrompt=e;render()});
function isStandalone(){return (window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone}
function daysSinceBackup(){var b=S.lastBackup;if(!b)return 999;return Math.floor((Date.now()-b)/86400000)}
function needBackup(){return S.tx.length>0&&daysSinceBackup()>=7}

function pad(n){return String(n).padStart(2,'0')}
function ymd(x){return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate())}
function today(){return ymd(new Date())}
function addDays(d,n){var x=new Date(d+'T00:00:00');x.setDate(x.getDate()+n);return ymd(x)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function emo(c){return CAT_EMOJI[c]||'📦'}
function catOf(i){return (i&&i.cat)||'Other'}
function ico(i){return (i&&i.icon)||emo(catOf(i))}
function item(id){for(var i=0;i<S.items.length;i++)if(S.items[i].id===id)return S.items[i];return null}
function cats(){var a=[];S.items.forEach(function(i){var c=catOf(i);if(a.indexOf(c)<0)a.push(c)});return a}
function sign(t){return t==='IN'?1:-1}
/* balance per item: before = strictly before date d; upto = through date d (inclusive) */
function balMap(d,inclusive){var b={};S.items.forEach(function(i){b[i.id]=+i.open||0});S.tx.forEach(function(x){if(!(x.item in b))return;if(d&&(inclusive?x.date>d:x.date>=d))return;b[x.item]+=sign(x.type)*x.qty});return b}
function fmtDate(d){var x=new Date(d+'T00:00:00');var w='日一二三四五六'[x.getDay()];var lbl=d===today()?' · 今天':d===addDays(today(),-1)?' · 昨天':'';return d+'（周'+w+'）'+lbl}
function shortDate(d){var x=new Date(d+'T00:00:00');return d.slice(5)+' '+'日一二三四五六'[x.getDay()]}

var U={tab:'order',type:'OUT',date:today(),cat:'ALL',q:'',cart:{},note:'',from:today().slice(0,8)+'01',to:today(),fItems:[],fTypes:['IN','OUT','ENT','FOC'],sumMode:'item'};
try{var su=localStorage.getItem(UI_KEY);if(su)Object.assign(U,JSON.parse(su))}catch(e){}
U.sheet=null;
function persistUI(){try{localStorage.setItem(UI_KEY,JSON.stringify({tab:U.tab,type:U.type,date:U.date,cat:U.cat,cart:U.cart,note:U.note,from:U.from,to:U.to,fItems:U.fItems,fTypes:U.fTypes,sumMode:U.sumMode}))}catch(e){}}

var app=document.getElementById('app');
var toastEl=document.createElement('div');toastEl.className='toast';document.body.appendChild(toastEl);
var tt;function toast(m){toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(tt);tt=setTimeout(function(){toastEl.classList.remove('show')},2200)}

function commit(fn,msg,undo){
  var snap=JSON.stringify(S);
  fn();
  if(!saveLocal()){S=JSON.parse(snap);if(undo)undo();}
  else toast(msg);
  persistUI();render();
}
function setSv(){var el=document.getElementById('sv');if(el)el.textContent=saving?'保存中…':''}

/* ---------- views ---------- */
function render(){
  app.style.setProperty('--tc',TMAP[U.type].c);
  var h='<header class="top"><div class="brand"><div class="logo">ST</div><div><div class="t1">Stock Take</div><div class="t2">'+S.items.length+' 个 item · '+S.tx.length+' 条记录'+'</div></div></div><div class="hr">'+(deferredPrompt&&!isStandalone()?'<button class="inst" data-act="install">⬇ 安装</button>':'')+'<button class="gear" data-act="openset">⚙️'+(needBackup()?'<i></i>':'')+'</button></div></header>';
  h+='<main>'+(U.tab==='order'?vOrder():U.tab==='rec'?vRec():U.tab==='sum'?vSum():vItems())+'</main>';
  if(U.tab==='order')h+=cartBar();
  h+=nav()+sheet();
  app.innerHTML=h;
}
function nav(){
  return '<nav class="bn">'+[['order','🛒','点单'],['rec','🧾','记录'],['sum','📊','汇总'],['items','📦','商品']].map(function(n){return '<button class="nb '+(U.tab===n[0]?'on':'')+'" data-act="nav" data-v="'+n[0]+'"><span>'+n[1]+'</span>'+n[2]+'</button>'}).join('')+'</nav>';
}
function vOrder(){
  var seg=TYPES.map(function(x){return '<button class="seg '+(U.type===x.k?'on':'')+'" style="--c:'+x.c+'" data-act="type" data-v="'+x.k+'"><b>'+x.k+'</b><small>'+x.zh+'</small></button>'}).join('');
  var cs=cats();
  var chips=cs.length>1?'<div class="chips">'+['ALL'].concat(cs).map(function(c){return '<button class="chip '+(U.cat===c?'on':'')+'" data-act="cat" data-v="'+esc(c)+'">'+(c==='ALL'?'全部':emo(c)+' '+esc(c))+'</button>'}).join('')+'</div>':'';
  return '<section class="ordtop"><label class="datebox">📅 <input type="date" data-in="date" value="'+U.date+'"></label><div class="segs">'+seg+'</div><div class="search"><span>🔍</span><input data-in="q" placeholder="搜索 item…" value="'+esc(U.q)+'"></div>'+chips+'</section><div id="grid" class="grid">'+gridHtml()+'</div>';
}
function gridHtml(){
  var q=U.q.trim().toLowerCase(),ob=balMap(U.date,false),cb=balMap(U.date,true);
  if(U.cat!=='ALL'&&cats().indexOf(U.cat)<0)U.cat='ALL';
  var list=S.items.filter(function(i){return (U.cat==='ALL'||catOf(i)===U.cat)&&(!q||i.name.toLowerCase().indexOf(q)>=0)});
  if(!list.length)return '<div class="empty">没有 item，去「商品」新增。</div>';
  return list.map(function(i){
    var n=U.cart[U.type+'|'+i.id]||0,o=ob[i.id],c=cb[i.id];
    return '<div class="card '+(n?'sel':'')+'" data-act="inc" data-id="'+i.id+'"><div class="ic">'+ico(i)+'</div><div class="nm">'+esc(i.name)+'</div>'+
      '<div class="ocb"><div><small>Opening</small><b>'+o+'</b></div><span>→</span><div><small>Closing</small><b class="'+(c<0?'neg':'')+'">'+c+'</b></div></div><div class="step">'+
      (n?'<button data-act="dec" data-id="'+i.id+'">−</button><input type="number" inputmode="numeric" min="0" data-in="qty" data-id="'+i.id+'" value="'+n+'"><button data-act="inc" data-id="'+i.id+'">+</button>':'<button class="addbtn" data-act="inc" data-id="'+i.id+'">+ 加入</button>')+'</div></div>';
  }).join('');
}
function cartLines(){return Object.keys(U.cart).filter(function(k){return U.cart[k]>0}).map(function(k){var p=k.split('|');return {k:k,t:p[0],id:+p[1],q:U.cart[k]}}).filter(function(l){return item(l.id)&&TMAP[l.t]})}
function sumQ(L){return L.reduce(function(a,b){return a+b.q},0)}
function cartBar(){
  var L=cartLines();if(!L.length)return '';
  var byT=TYPES.filter(function(t){return L.some(function(l){return l.t===t.k})}).map(function(t){return '<span class="bdg" style="--c:'+t.c+'">'+t.k+' '+sumQ(L.filter(function(l){return l.t===t.k}))+'</span>'}).join('');
  return '<div class="cartbar"><button class="cartinfo" data-act="opencart"><span class="bag">🧺<i>'+L.length+'</i></span><span><b>'+sumQ(L)+'</b> 件</span><span class="bdgs">'+byT+'</span></button><button class="go" data-act="opencart">提交 ›</button></div>';
}
function vCartSheet(){
  var L=cartLines(),cb=balMap(U.date,true);
  var rows=L.map(function(l){var i=item(l.id),t=TMAP[l.t];var after=cb[i.id]+L.filter(function(x){return x.id===i.id}).reduce(function(a,x){return a+sign(x.t)*x.q},0);
    return '<div class="cl"><span class="bdg" style="--c:'+t.c+'">'+t.k+'</span><span class="cn">'+ico(i)+' '+esc(i.name)+'<small> 提交后 Closing '+after+'</small></span><div class="step sm" style="--tc:'+t.c+'"><button data-act="cdec" data-k="'+l.k+'">−</button><span>'+l.q+'</span><button data-act="cinc" data-k="'+l.k+'">+</button></div></div>'}).join('');
  return '<h3>确认提交</h3><div class="sub">日期 <input type="date" data-in="date" value="'+U.date+'"></div>'+(rows||'<div class="empty">空的</div>')+'<textarea data-in="note" placeholder="备注（可选，例如：客人 / 原因）">'+esc(U.note)+'</textarea><div class="row2"><button class="ghost" data-act="clearcart">清空</button><button class="primary" data-act="submit" '+(L.length?'':'disabled')+'>确认提交（'+sumQ(L)+' 件）</button></div>';
}
function filterBar(withTypes){
  var n=U.fItems.length,one=n===1&&item(U.fItems[0]);
  var lbl=n===0?'全部 item':one?esc(one.name):'已选 '+n+' 个 item';
  var h='<section class="filters"><div class="dr">📅<input type="date" data-in="from" value="'+U.from+'"><span>→</span><input type="date" data-in="to" value="'+U.to+'"></div>'+
   '<div class="qd">'+[['today','今天'],['yday','昨天'],['week','本周'],['month','本月'],['lmonth','上月'],['all','全部']].map(function(r){return '<button class="mini" data-act="range" data-v="'+r[0]+'">'+r[1]+'</button>'}).join('')+'</div>'+
   '<button class="picker '+(n?'on':'')+'" data-act="openpick"><span>📦 '+lbl+'</span><span>▾</span></button>';
  if(withTypes)h+='<div class="tchips">'+TYPES.map(function(t){return '<button class="tchip '+(U.fTypes.indexOf(t.k)>=0?'on':'')+'" style="--c:'+t.c+'" data-act="ftype" data-v="'+t.k+'">'+t.k+'</button>'}).join('')+'</div>';
  if(n)h+='<div class="selchips">'+U.fItems.map(function(id){var i=item(id);return i?'<span class="sc">'+esc(i.name)+'<button data-act="unpick" data-id="'+id+'">×</button></span>':''}).join('')+'</div>';
  return h+'</section>';
}
function selIds(){return S.items.filter(function(i){return !U.fItems.length||U.fItems.indexOf(i.id)>=0}).map(function(i){return i.id})}
function filtTx(withTypes){
  return S.tx.filter(function(x){return x.date>=U.from&&x.date<=U.to&&(!U.fItems.length||U.fItems.indexOf(x.item)>=0)&&(!withTypes||U.fTypes.indexOf(x.type)>=0)});
}
/* totals over selected items for the range */
function rangeTotals(){
  var ids=selIds(),ob=balMap(U.from,false),cb=balMap(U.to,true),T={open:0,IN:0,OUT:0,ENT:0,FOC:0,close:0};
  ids.forEach(function(id){T.open+=ob[id];T.close+=cb[id]});
  filtTx(false).forEach(function(x){T[x.type]+=x.qty});
  return T;
}
function statsHtml(T){
  return '<div class="stats6"><div class="st ob"><small>Opening Bal</small><b>'+T.open+'</b></div>'+TYPES.map(function(t){return '<div class="st" style="--c:'+t.c+'"><small>'+t.k+'</small><b>'+T[t.k]+'</b></div>'}).join('')+'<div class="st cbx2"><small>Closing Bal</small><b class="'+(T.close<0?'neg':'')+'">'+T.close+'</b></div></div>';
}
function vRec(){
  var L=filtTx(true).sort(function(a,b){return b.date.localeCompare(a.date)||b.ts-a.ts});
  var h=filterBar(true)+statsHtml(rangeTotals());
  if(!L.length)return h+'<div class="empty">这个范围没有记录</div>';
  h+='<div class="acts"><span>'+L.length+' 条记录</span><button class="ghost sm" data-act="csvrec">复制 CSV</button></div><div style="height:8px"></div><div class="list">';
  var cur='';
  L.forEach(function(x){
    if(x.date!==cur){cur=x.date;h+='<div class="dh">'+fmtDate(cur)+'</div>'}
    var i=item(x.item),t=TMAP[x.type];
    h+='<div class="rw"><div class="ic sm">'+ico(i)+'</div><div class="rm"><div class="rn">'+esc(i?i.name:'(已删除)')+'</div>'+(x.note?'<div class="rnote">'+esc(x.note)+'</div>':'')+'</div><span class="bdg" style="--c:'+t.c+'">'+t.k+'</span><b class="rq" style="color:'+t.c+'">'+(x.type==='IN'?'+':'−')+x.qty+'</b><button class="del '+(U.pendDel===x.id?'arm':'')+'" data-act="deltx" data-id="'+x.id+'">'+(U.pendDel===x.id?'删除?':'×')+'</button></div>';
  });
  return h+'</div>';
}
function sumRows(){
  var ob=balMap(U.from,false);
  return S.items.filter(function(i){return !U.fItems.length||U.fItems.indexOf(i.id)>=0}).map(function(i){
    var r={i:i,open:ob[i.id],IN:0,OUT:0,ENT:0,FOC:0};
    S.tx.forEach(function(x){if(x.item===i.id&&x.date>=U.from&&x.date<=U.to)r[x.type]+=x.qty});
    r.close=r.open+r.IN-r.OUT-r.ENT-r.FOC;return r;
  });
}
function dayRows(){
  var ids=selIds(),set={};ids.forEach(function(id){set[id]=1});
  var open=0,ob=balMap(U.from,false);ids.forEach(function(id){open+=ob[id]});
  var by={};S.tx.forEach(function(x){if(set[x.item]&&x.date>=U.from&&x.date<=U.to){var d=by[x.date]||(by[x.date]={IN:0,OUT:0,ENT:0,FOC:0});d[x.type]+=x.qty}});
  var days=[],d=U.from,n=0;while(d<=U.to&&n<400){days.push(d);d=addDays(d,1);n++}
  var showAll=days.length<=62,R=[];
  days.forEach(function(d){var m=by[d]||{IN:0,OUT:0,ENT:0,FOC:0};var close=open+m.IN-m.OUT-m.ENT-m.FOC;
    if(showAll||by[d])R.push({d:d,open:open,IN:m.IN,OUT:m.OUT,ENT:m.ENT,FOC:m.FOC,close:close});open=close});
  return R;
}
function z(v){return v?String(v):'<span class="zero">0</span>'}
function thead(first){return '<thead><tr><th>'+first+'</th><th class="obh">Opening Bal</th>'+TYPES.map(function(t){return '<th style="--c:'+t.c+'">'+t.k+'</th>'}).join('')+'<th class="cbh">Closing Bal</th></tr></thead>'}
function trow(label,r){return '<tr><td>'+label+'</td><td class="obc">'+r.open+'</td><td>'+z(r.IN)+'</td><td>'+z(r.OUT)+'</td><td>'+z(r.ENT)+'</td><td>'+z(r.FOC)+'</td><td class="cb2 '+(r.close<0?'neg':'')+'">'+r.close+'</td></tr>'}
function vSum(){
  var T=rangeTotals();
  var h=filterBar(false)+statsHtml(T);
  h+='<div class="segs2"><button class="'+(U.sumMode==='item'?'on':'')+'" data-act="smode" data-v="item">按 Item</button><button class="'+(U.sumMode==='day'?'on':'')+'" data-act="smode" data-v="day">按日期</button></div>';
  h+='<div class="acts"><span>'+(U.sumMode==='day'?'每天 Closing = 第二天 Opening':'Opening = '+U.from+' 开始前的结余')+'</span><button class="ghost sm" data-act="csvsum">复制 CSV</button></div>';
  if(U.sumMode==='day'){
    var D=dayRows();if(!D.length)return h+'<div class="empty">这个范围没有记录</div>';
    return h+'<div class="tw"><table>'+thead('日期')+'<tbody>'+D.map(function(r){return trow(shortDate(r.d),r)}).join('')+'</tbody><tfoot>'+trow('合计',T)+'</tfoot></table></div>';
  }
  var R=sumRows();if(!R.length)return h+'<div class="empty">没有 item</div>';
  return h+'<div class="tw"><table>'+thead('Item')+'<tbody>'+R.map(function(r){return trow(ico(r.i)+' '+esc(r.i.name),r)}).join('')+'</tbody><tfoot>'+trow('合计',T)+'</tfoot></table></div>';
}
function vItems(){
  var bal=balMap(null);
  var h='<div class="ihead"><div>'+S.items.length+' 个 item · 点一下可编辑</div><button class="primary sm" data-act="newitem">+ 新增 item</button></div>';
  if(!S.items.length)return h+'<div class="empty">还没有 item</div>';
  var cs=cats();
  cs.forEach(function(c){
    h+=(cs.length>1?'<div class="gh">'+emo(c)+' '+esc(c)+'</div>':'<div style="height:6px"></div>')+'<div class="list">'+S.items.filter(function(i){return catOf(i)===c}).map(function(i){
      return '<div class="rw click" data-act="edititem" data-id="'+i.id+'"><div class="ic sm">'+ico(i)+'</div><div class="rm"><div class="rn">'+esc(i.name)+'</div><div class="rnote">起始库存 '+(+i.open||0)+' '+esc(i.unit||'')+'</div></div><div class="rr"><small>现在</small><b class="'+(bal[i.id]<0?'neg':'')+'">'+bal[i.id]+'</b></div><span class="chev">›</span></div>';
    }).join('')+'</div>';
  });
  return h;
}
function vPickSheet(){
  return '<h3>选择 item <small>（可多选）</small></h3><div class="search"><span>🔍</span><input data-in="pq" placeholder="搜索…" value="'+esc(U.pq||'')+'"></div><div class="row2 tight"><button class="mini" data-act="pall">全选</button><button class="mini" data-act="pnone">清空</button><span class="cnt" id="pcnt">已选 '+U.tmp.length+'</span></div><div id="plist" class="plist">'+pickList()+'</div><button class="primary full" data-act="papply">确定</button>';
}
function pickVisible(){var q=(U.pq||'').toLowerCase();return S.items.filter(function(i){return !q||i.name.toLowerCase().indexOf(q)>=0})}
function pickList(){
  var vis=pickVisible(),h='',cs=cats();
  cs.forEach(function(c){
    var its=vis.filter(function(i){return catOf(i)===c});if(!its.length)return;
    var all=its.every(function(i){return U.tmp.indexOf(i.id)>=0});
    if(cs.length>1)h+='<div class="pc" data-act="pcat" data-v="'+esc(c)+'"><span class="cbx '+(all?'on':'')+'"></span>'+emo(c)+' '+esc(c)+'</div>';
    h+=its.map(function(i){return '<div class="pi" data-act="ptog" data-id="'+i.id+'"><span class="cbx '+(U.tmp.indexOf(i.id)>=0?'on':'')+'"></span>'+ico(i)+' '+esc(i.name)+'</div>'}).join('');
  });
  return h||'<div class="empty">没有结果</div>';
}
function updPick(){var a=document.getElementById('plist'),b=document.getElementById('pcnt');if(a)a.innerHTML=pickList();if(b)b.textContent='已选 '+U.tmp.length}
function vEditSheet(){
  var e=U.edit,isNew=!e.id,cnt=isNew?0:S.tx.filter(function(x){return x.item===e.id}).length;
  return '<h3>'+(isNew?'新增 item':'编辑 item')+'</h3>'+
  '<div class="two"><label class="fl" style="flex:0 0 70px">图标<input data-in="ef" data-f="icon" value="'+esc(e.icon)+'" placeholder="🍋" style="text-align:center"></label><label class="fl">名称<input data-in="ef" data-f="name" value="'+esc(e.name)+'" placeholder="例如 lemon"></label></div>'+
  '<label class="fl">类别<input data-in="ef" data-f="cat" list="catlist" value="'+esc(e.cat)+'" placeholder="Item"></label><datalist id="catlist">'+cats().map(function(c){return '<option value="'+esc(c)+'">'}).join('')+'</datalist>'+
  '<div class="two"><label class="fl">单位<input data-in="ef" data-f="unit" value="'+esc(e.unit)+'" placeholder="pcs / kg / btl"></label><label class="fl">起始库存<input type="number" inputmode="numeric" data-in="ef" data-f="open" value="'+esc(e.open)+'"></label></div>'+
  '<div class="hint">起始库存 = 开始用这个系统之前的数量。之后每天的 Opening / Closing Bal 会自动计算。</div>'+
  '<div class="row2">'+(isNew?'':'<button class="danger" data-act="delitem">'+(U.pendDelItem?'确定删除'+(cnt?'（连同 '+cnt+' 条记录）':'')+'？':'删除')+'</button>')+'<button class="primary" data-act="saveitem">保存</button></div>';
}
function vCsvSheet(){return '<h3>CSV <small>（复制后贴到 Excel / Google Sheets）</small></h3><textarea class="csvbox" readonly>'+esc(U.csv)+'</textarea><div class="row2"><button class="ghost" data-act="copycsv">复制</button><button class="primary" data-act="dlcsv">⬇ 下载 CSV 文件</button></div>'}
function vSetSheet(){
  var d=daysSinceBackup(),last=S.lastBackup?new Date(S.lastBackup).toLocaleString():'从未备份';
  return '<h3>设置 · 备份</h3>'+
  (needBackup()?'<div class="warn">已经 '+(d>=999?'很久':d+' 天')+'没有备份了，建议现在下载一次备份。</div>':'')+
  '<div class="setrow"><div><b>下载备份</b><small>上次：'+esc(last)+'</small></div><button class="primary sm" data-act="backup">⬇ 下载</button></div>'+
  '<div class="setrow"><div><b>恢复备份</b><small>选之前下载的 .json 文件，会覆盖现在的数据</small></div><label class="ghost sm filebtn">选择文件<input type="file" accept=".json,application/json" data-in="restore" hidden></label></div>'+
  (U.restoreData?'<div class="warn">要用这个备份覆盖吗？（'+U.restoreData.items.length+' 个 item，'+U.restoreData.tx.length+' 条记录）<div class="row2"><button class="ghost" data-act="restorecancel">取消</button><button class="danger" data-act="restoreok">确定覆盖</button></div></div>':'')+
  '<div class="setrow"><div><b>安装到桌面</b><small>'+(isStandalone()?'已经是 app 模式 ✓':deferredPrompt?'点右边按钮安装':'Chrome：⋮ → 安装应用 / 添加到主屏幕')+'</small></div>'+(deferredPrompt&&!isStandalone()?'<button class="primary sm" data-act="install">安装</button>':'')+'</div>'+
  '<div class="hint">数据只存在这台手机的这个 app 里。清除浏览器数据或卸载会丢失，请定期下载备份（存到 Google Drive / WhatsApp 发给自己都可以）。</div>';
}
function download(name,text,type){
  try{var blob=new Blob([text],{type:type});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(url);a.remove()},1500);return true}catch(e){toast('下载失败');return false}
}
function sheet(){
  if(!U.sheet)return '';
  var b=U.sheet==='cart'?vCartSheet():U.sheet==='pick'?vPickSheet():U.sheet==='edit'?vEditSheet():U.sheet==='csv'?vCsvSheet():U.sheet==='set'?vSetSheet():'';
  return '<div class="ov" data-act="close"></div><div class="sheet"><div class="grab"></div>'+b+'</div>';
}

/* ---------- csv ---------- */
function cq(s){s=String(s==null?'':s);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function csvSum(){
  var T=rangeTotals(),L;
  if(U.sumMode==='day'){L=['Date,Opening Bal,IN,OUT,ENT,FOC,Closing Bal'];dayRows().forEach(function(r){L.push([r.d,r.open,r.IN,r.OUT,r.ENT,r.FOC,r.close].join(','))})}
  else{L=['Item,Unit,Opening Bal,IN,OUT,ENT,FOC,Closing Bal'];sumRows().forEach(function(r){L.push([cq(r.i.name),cq(r.i.unit),r.open,r.IN,r.OUT,r.ENT,r.FOC,r.close].join(','))})}
  L.push(['TOTAL'].concat(U.sumMode==='day'?[]:['']).concat([T.open,T.IN,T.OUT,T.ENT,T.FOC,T.close]).join(','));
  return 'Stock Take '+U.from+' to '+U.to+'\n'+L.join('\n');
}
function csvRec(){var L=['Date,Item,Type,Qty,Note'];filtTx(true).sort(function(a,b){return a.date.localeCompare(b.date)||a.ts-b.ts}).forEach(function(x){var i=item(x.item);L.push([x.date,cq(i?i.name:''),x.type,x.qty,cq(x.note)].join(','))});return L.join('\n')}

/* ---------- actions ---------- */
function setRange(v){
  var t=today(),d=new Date();
  if(v==='today'){U.from=U.to=t}
  else if(v==='yday'){U.from=U.to=addDays(t,-1)}
  else if(v==='week'){U.from=addDays(t,-((d.getDay()+6)%7));U.to=t}
  else if(v==='month'){U.from=t.slice(0,8)+'01';U.to=t}
  else if(v==='lmonth'){U.from=ymd(new Date(d.getFullYear(),d.getMonth()-1,1));U.to=ymd(new Date(d.getFullYear(),d.getMonth(),0))}
  else if(v==='all'){U.from=S.tx.reduce(function(a,x){return x.date<a?x.date:a},t);U.to=S.tx.reduce(function(a,x){return x.date>a?x.date:a},t)}
}
var delTimer;
function act(a,el){
  var id=+el.dataset.id,v=el.dataset.v,k;
  switch(a){
  case 'nav':U.tab=v;U.pendDel=null;window.scrollTo(0,0);break;
  case 'type':U.type=v;break;
  case 'cat':U.cat=v;break;
  case 'smode':U.sumMode=v;break;
  case 'inc':k=U.type+'|'+id;U.cart[k]=(U.cart[k]||0)+1;break;
  case 'dec':k=U.type+'|'+id;U.cart[k]=(U.cart[k]||0)-1;if(U.cart[k]<=0)delete U.cart[k];break;
  case 'opencart':U.sheet='cart';break;
  case 'close':U.sheet=null;U.pendDelItem=false;break;
  case 'cinc':U.cart[el.dataset.k]++;break;
  case 'cdec':k=el.dataset.k;U.cart[k]--;if(U.cart[k]<=0)delete U.cart[k];if(!cartLines().length)U.sheet=null;break;
  case 'clearcart':U.cart={};U.note='';U.sheet=null;break;
  case 'submit':{
    var L=cartLines();if(!L.length)return;
    var oldCart=JSON.parse(JSON.stringify(U.cart)),oldNote=U.note,date=U.date,note=U.note.trim(),n=sumQ(L);
    commit(function(){var ts=Date.now();L.forEach(function(l){S.tx.push({id:S.seq++,date:date,item:l.id,type:l.t,qty:l.q,note:note,ts:ts})});U.cart={};U.note='';U.sheet=null},
      '✓ 已提交 '+n+' 件（'+date+'）',function(){U.cart=oldCart;U.note=oldNote});
    return;}
  case 'range':setRange(v);break;
  case 'openpick':U.tmp=U.fItems.slice();U.pq='';U.sheet='pick';break;
  case 'ptog':{var ix=U.tmp.indexOf(id);if(ix>=0)U.tmp.splice(ix,1);else U.tmp.push(id);updPick();return;}
  case 'pcat':{var its=pickVisible().filter(function(i){return catOf(i)===v}).map(function(i){return i.id});var all=its.every(function(x){return U.tmp.indexOf(x)>=0});
    if(all)U.tmp=U.tmp.filter(function(x){return its.indexOf(x)<0});else its.forEach(function(x){if(U.tmp.indexOf(x)<0)U.tmp.push(x)});updPick();return;}
  case 'pall':pickVisible().forEach(function(i){if(U.tmp.indexOf(i.id)<0)U.tmp.push(i.id)});updPick();return;
  case 'pnone':U.tmp=[];updPick();return;
  case 'papply':U.fItems=U.tmp.length===S.items.length?[]:U.tmp.slice();U.sheet=null;break;
  case 'unpick':U.fItems=U.fItems.filter(function(x){return x!==id});break;
  case 'ftype':{var j=U.fTypes.indexOf(v);if(j>=0)U.fTypes.splice(j,1);else U.fTypes.push(v);break;}
  case 'deltx':
    if(U.pendDel===id){U.pendDel=null;commit(function(){S.tx=S.tx.filter(function(x){return x.id!==id})},'已删除记录');return}
    U.pendDel=id;clearTimeout(delTimer);delTimer=setTimeout(function(){U.pendDel=null;render()},3000);break;
  case 'newitem':U.edit={name:'',icon:'',cat:U.cat!=='ALL'?U.cat:(cats()[0]||'Item'),unit:'',open:0};U.pendDelItem=false;U.sheet='edit';break;
  case 'edititem':{var it=item(id);U.edit={id:it.id,name:it.name,icon:it.icon||'',cat:it.cat||'',unit:it.unit||'',open:it.open||0};U.pendDelItem=false;U.sheet='edit';break;}
  case 'saveitem':{
    var e=U.edit,nm=String(e.name||'').trim();if(!nm){toast('请填写名称');return}
    if(S.items.some(function(i){return i.name.toLowerCase()===nm.toLowerCase()&&i.id!==e.id})){toast('已有同名 item');return}
    var rec={name:nm,icon:String(e.icon||'').trim(),cat:String(e.cat||'').trim()||'Item',unit:String(e.unit||'').trim(),open:Math.floor(+e.open||0)};
    commit(function(){if(e.id){Object.assign(item(e.id),rec)}else{rec.id=S.iseq++;S.items.push(rec)}U.sheet=null},e.id?'已更新 item':'已新增 '+nm);
    return;}
  case 'delitem':{
    if(!U.pendDelItem){U.pendDelItem=true;break}
    var did=U.edit.id;
    commit(function(){S.items=S.items.filter(function(i){return i.id!==did});S.tx=S.tx.filter(function(x){return x.item!==did});U.fItems=U.fItems.filter(function(x){return x!==did});Object.keys(U.cart).forEach(function(k){if(+k.split('|')[1]===did)delete U.cart[k]});U.sheet=null;U.pendDelItem=false},'已删除 item');
    return;}
  case 'openset':U.sheet='set';U.restoreData=null;break;
  case 'backup':{var st=Date.now();S.lastBackup=st;saveLocal();download('stocktake-backup-'+today()+'.json',JSON.stringify(S),'application/json');toast('✓ 备份已下载');break;}
  case 'restorecancel':U.restoreData=null;break;
  case 'restoreok':{var rd=U.restoreData;U.restoreData=null;commit(function(){S=rd;U.cart={};U.fItems=[];U.sheet=null},'✓ 已恢复备份');return;}
  case 'install':if(deferredPrompt){deferredPrompt.prompt();deferredPrompt.userChoice.then(function(){deferredPrompt=null;render()})}return;
  case 'dlcsv':download('stocktake-'+(U.csvName||'export')+'-'+today()+'.csv','\ufeff'+U.csv,'text/csv;charset=utf-8');return;
  case 'csvsum':U.csvName=U.sumMode==='day'?'daily':'summary';U.csv=csvSum();U.sheet='csv';break;
  case 'csvrec':U.csvName='records';U.csv=csvRec();U.sheet='csv';break;
  case 'copycsv':
    try{navigator.clipboard.writeText(U.csv).then(function(){toast('已复制')},function(){toast('复制失败，请手动全选复制')})}catch(err){toast('复制失败，请手动全选复制')}
    return;
  default:return;
  }
  persistUI();render();
}
app.addEventListener('click',function(e){
  if(e.target.closest('input,textarea'))return;
  var el=e.target.closest('[data-act]');if(!el||!app.contains(el))return;
  act(el.dataset.act,el);
});
app.addEventListener('input',function(e){
  var el=e.target,k=el.dataset&&el.dataset.in;if(!k)return;
  if(k==='q'){U.q=el.value;var g=document.getElementById('grid');if(g)g.innerHTML=gridHtml()}
  else if(k==='note'){U.note=el.value;persistUI()}
  else if(k==='pq'){U.pq=el.value;updPick()}
  else if(k==='ef'){U.edit[el.dataset.f]=el.value}
});
app.addEventListener('change',function(e){
  var el=e.target,k=el.dataset&&el.dataset.in;if(!k)return;
  if(k==='date'){if(el.value)U.date=el.value}
  else if(k==='from'||k==='to'){if(el.value)U[k]=el.value;if(U.from>U.to){if(k==='from')U.to=U.from;else U.from=U.to}}
  else if(k==='restore'){var f=el.files&&el.files[0];if(!f)return;var rdr=new FileReader();rdr.onload=function(){try{var d=JSON.parse(rdr.result);if(!d||!Array.isArray(d.items)||!Array.isArray(d.tx))throw 0;U.restoreData=d;render()}catch(err){toast('不是有效的备份文件')}};rdr.readAsText(f);return}
  else if(k==='qty'){var v=Math.max(0,Math.floor(+el.value||0)),key=U.type+'|'+el.dataset.id;if(v)U.cart[key]=v;else delete U.cart[key]}
  else return;
  persistUI();render();
});
render();
})();

if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})})}
