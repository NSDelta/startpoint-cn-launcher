'use strict';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);
let cfg = null;
let status = 'stopped';

// ====================== i18n (繁體 ⇄ 简体) ======================
// Source text is authored in Traditional. Default = Traditional. Switching to
// Simplified converts text nodes via a 繁→簡 char map; switching back restores originals.
const T2S = {
  '設':'设','啟':'启','動':'动','執':'执','錯':'误','誤':'误','偵':'侦','測':'测','載':'载','遊':'游','戲':'戏',
  '資':'资','約':'约','後':'后','語':'语','體':'体','簡':'简','過':'过','錄':'录','覽':'览','瀏':'浏','機':'机',
  '這':'这','電':'电','腦':'脑','區':'区','網':'网','連':'连','擬':'拟','線':'线','儲':'储','導':'导','標':'标',
  '選':'选','並':'并','簽':'签','產':'产','裝':'装','開':'开','時':'时','間':'间','發':'发','郵':'邮','頁':'页',
  '範':'范','匯':'汇','檔':'档','擇':'择','編':'编','輯':'辑','補':'补','戰':'战','個':'个','稱':'称','號':'号',
  '級':'级','別':'别','隊':'队','長':'长','費':'费','屑':'屑','羈':'羁','絆':'绊','證':'证','驗':'验','經':'经',
  '驟':'骤','轉':'转','狀':'状','態':'态','復':'复','進':'进','數':'数','強':'强','類':'类','題':'题','統':'统',
  '訂':'订','隨':'随','積':'积','歸':'归','佔':'占','請':'请','輸':'输','準':'准','備':'备','項':'项','緒':'绪',
  '面':'面','闆':'板','關':'关','閉':'闭','視':'视','窗':'窗','頭':'头','實':'实','際':'际','變':'变','數':'数',
  '當':'当','應':'应','將':'将','處':'处','點':'点','擊':'击','態':'态','獨':'独','創':'创','從':'从','體':'体',
  '無':'无','業':'业','權':'权','險':'险','員':'员','館':'馆','聯':'联','戰':'战','顯':'显','現':'现','觀':'观',
  '對':'对','齊':'齐','慢':'慢','滑':'滑','動':'动','畫':'画','浮':'浮','現':'现','離':'离','潔':'洁','淨':'净',
  '檢':'检','查':'查','備':'备','圖':'图','標':'标','籤':'签','屬':'属','於':'于','預':'预','設':'设','總':'总',
  '節':'节','約':'约','銷':'销','處':'处','錯':'错','麼':'么','歲':'岁','屬':'属','龍':'龙','寶':'宝','幣':'币',
  '滿':'满','關':'关','卡':'卡','獲':'获','贈':'赠','禮':'礼','劵':'券','張':'张','贈':'赠','當':'当','僅':'仅'
};
const t2s = (s) => s.replace(/[一-鿿]/g, (c) => T2S[c] || c);
let lang = 'tw'; // tw | cn | en
const _orig = new WeakMap();

// English is a phrase table keyed by the Traditional source string (Simplified stays a char-map of the
// same source, so we only maintain zh-Hant + en). Missing key → falls back to the Traditional source.
// Dynamic values use {name} placeholders filled by tr(s, params) AFTER translation.
const EN = {
  // nav
  '控制': 'Control', '設定': 'Settings', '打包 APK': 'Build APK', '打包 IPA': 'Build IPA', '管理面板': 'Admin', '日誌': 'Logs',
  // first-run wizard
  '首次設定': 'First-time setup',
  '偵測到尚未下載遊戲資源。需先下載約': 'Game assets not downloaded yet. A one-time',
  '的本地資源(一次性,之後全程本地)。': 'local asset download is required (everything stays local afterward).',
  '語言': 'Language', '繁體中文': 'Traditional Chinese', '简体中文': 'Simplified Chinese',
  '下載來源': 'Download source', '直連 GitHub': 'Direct GitHub',
  '鏡像 gh-proxy.com': 'Mirror gh-proxy.com', '鏡像 ghfast.top': 'Mirror ghfast.top', '鏡像 ghp.ci': 'Mirror ghp.ci',
  '自訂…': 'Custom…', 'https://你的鏡像/(結尾要有 /)': 'https://your-mirror/ (must end with /)',
  '從網路下載': 'Download from web', '匯入本地資源檔': 'Import local asset files',
  '被牆、無法連 GitHub 獲取 CDN 時,請用「匯入本地資源檔」選擇提供的': 'If GitHub is blocked, use “Import local asset files” and select the provided',
  '(可一次多選)。': '(multi-select supported).',
  '略過(我已有資源 / 稍後再說)': 'Skip (I already have the assets / later)',
  // control
  '啟動': 'Start', '停止': 'Stop', '已停止': 'Stopped', '啟動中…': 'Starting…', '執行中': 'Running', '錯誤': 'Error',
  '伺服器日誌': 'Server log', '清空': 'Clear',
  // settings
  '伺服器目錄': 'Server directory', '瀏覽': 'Browse', '主機 IP': 'Host IP', '偵測本機 IP': 'Detect local IP',
  '個人連接埠(遊戲 API)': 'Personal port (game API)', '聯機連接埠(多人對戰)': 'Co-op port (multiplayer)',
  '資源版本': 'Asset version', '儲存': 'Save', '已儲存': 'Saved', '被其他程式佔用': 'in use by another app',
  '(個人)': '(personal)', '(聯機)': '(co-op)',
  '連接埠被佔用:{list} — 請到「設定」改用其他埠': 'Port(s) in use: {list} — go to Settings and pick another port',
  '已偵測:{ip}': 'Detected: {ip}', '已偵測本機 IP:{ip}': 'Detected local IP: {ip}',
  '進階設定': 'Advanced', '客戶端雲端下載資源': 'Client cloud asset download', '測試 Beta': 'Beta',
  '開啟後,客戶端改從雲端 CDN 直接下載遊戲資源,變更後需重新啟動伺服器。': 'When on, the client downloads game assets straight from the cloud CDN. Restart the server after changing this.',
  // APK / IPA
  '打包重定向 APK': 'Build redirected APK', '重導目標:': 'Redirect target: ', '原始 APK': 'Original APK',
  '選擇 World Flipper 的 APK': 'Choose the World Flipper APK', '開始打包': 'Start build',
  '準備中…': 'Preparing…', '錯誤:': 'Error: ', '完成': 'Done', '已產出:': 'Output: ', '步驟': 'Step',
  '把它裝到模擬器 / 手機即可(若已裝舊版且簽章不同,需先解除安裝)。': 'Install it on your emulator / phone (if an older build with a different signature is installed, uninstall it first).',
  '請先選擇原始 APK': 'Please choose the original APK first', 'APK 打包完成': 'APK build complete',
  '打包重定向 IPA（iOS）': 'Build redirected IPA (iOS)', '原始 IPA': 'Original IPA',
  '選擇 World Flipper 國服的 IPA': 'Choose the World Flipper CN IPA',
  '用 Sideloadly／AltStore 以你的 Apple ID 簽名後安裝到 iPhone(會自動重簽 patch 後的二進位)。': 'Sign with your Apple ID via Sideloadly / AltStore and install to iPhone (the patched binary is re-signed automatically).',
  '請先選擇原始 IPA': 'Please choose the original IPA first', 'IPA 打包完成': 'IPA build complete',
  // admin
  '玩家': 'Players', '修改存檔': 'Edit save', '裝置': 'Device', '帳號 / 存檔': 'Accounts / Saves', '伺服器時間': 'Server time', '群發郵件': 'Broadcast mail', '未啟動': 'Not running',
  '刷新': 'Refresh', '上一頁': 'Previous page', '下一頁': 'Next page', '暫無玩家': 'No players', '(無名)': '(unnamed)', '載入中…': 'Loading…', '載入失敗': 'Load failed',
  // player detail
  '重置每日挑戰': 'Reset daily challenge', '匯出存檔': 'Export save', '匯入覆蓋': 'Import & overwrite', '清空信箱': 'Clear mailbox',
  '每日重置': 'Daily reset', '每週重置': 'Weekly reset', '已每日重置': 'Daily reset done', '已每週重置': 'Weekly reset done', '裝置名稱': 'Device name',
  '強制輪替每日任務:快照目前進度作基準 + 清除任務快取,下次登入重新產生當日任務。不影響道具/角色/貨幣/存檔。': 'Force-rotate daily missions: snapshot current progress as the baseline + clear the mission cache; the day\'s missions regenerate on next login. Does not touch items / characters / currency / save.',
  '強制輪替每週任務:快照目前進度作基準 + 清除任務快取,下次登入重新產生本週任務。不影響道具/角色/貨幣/存檔。': 'Force-rotate weekly missions: snapshot current progress as the baseline + clear the mission cache; this week\'s missions regenerate on next login. Does not touch items / characters / currency / save.',
  '玩家欄位': 'Player fields', '角色': 'Characters', '角色商務碼 (code)': 'Character code', '新增角色': 'Add character', '進化': 'Evolution', '暫無角色': 'No characters',
  '道具': 'Items', '道具 ID': 'Item ID', '數量': 'Qty', '新增/設定': 'Add / Set', '暫無道具': 'No items',
  '裝備': 'Equipment', '等級': 'Level', '強化': 'Enhance', '暫無裝備': 'No equipment',
  '查表': 'Lookup', '名稱': 'Name', '關閉': 'Close', '無符合結果': 'No matches',
  '搜尋名稱或 ID…': 'Search by name or ID…', '僅顯示前 {n} 筆,請再縮小搜尋': 'Showing first {n} — narrow your search',
  '關卡進度': 'Quest progress', '清空全部': 'Clear all', '已過': 'Cleared', '是': 'Yes', '高分': 'High score', '暫無關卡記錄': 'No quest records',
  '抽選紀錄': 'Draw records', '暫無抽選記錄': 'No draw records',
  // resource field labels
  '名字': 'Name', '個性簽名': 'Signature', '稱號/等級ID': 'Title / Degree ID', '生日': 'Birthday', '性別/Role': 'Gender / Role', '隊長角色ID': 'Leader character ID',
  '星導石(免費)': 'Gems (free)', '星導石(付費)': 'Gems (paid)', 'Mana(免費)': 'Mana (free)', 'Mana(付費)': 'Mana (paid)',
  '體力': 'Stamina', '隊伍槽': 'Party slots', '星屑': 'Star crumb', '羈絆證': 'Bond token', '經驗池': 'Exp pool',
  '教程步驟': 'Tutorial step', '教程跳過(true/false)': 'Skip tutorial (true/false)', '教程抽卡角色ID': 'Tutorial gacha char ID',
  '轉移狀態': 'Transition state', '自動3倍速(true/false)': 'Auto 3x speed (true/false)', '體力恢復時間': 'Stamina heal time', '最後登入時間': 'Last login time', '經驗池時間': 'Exp pool time',
  // detail toasts / confirms
  '已更新 {f}': 'Updated {f}', '更新失敗': 'Update failed', '請輸入角色 code': 'Enter a character code', '已新增角色': 'Character added', '新增失敗': 'Add failed', '已刪除角色': 'Character deleted', '刪除失敗': 'Delete failed',
  '請輸入道具 ID': 'Enter an item ID', '已設定道具': 'Item set', '設定失敗': 'Set failed', '道具 {id} = {v}': 'Item {id} = {v}', '已刪除道具': 'Item deleted',
  '失敗': 'Failed', '已重置每日挑戰': 'Daily challenge reset', '已清空信箱(刪除 {n})': 'Mailbox cleared (deleted {n})',
  '已刪除關卡記錄': 'Quest record deleted', '清空此玩家所有關卡進度?': 'Clear ALL quest progress for this player?', '已清空關卡進度': 'Quest progress cleared',
  '已刪除抽選記錄': 'Draw record deleted', '清空此玩家所有抽選紀錄?': 'Clear ALL draw records for this player?', '已清空抽選紀錄': 'Draw records cleared',
  // accounts / saves
  '暫無裝置(玩家首次登入遊戲後自動產生)': 'No devices (created automatically after a player first logs in)',
  '帳號': 'Account', '存檔': 'saves', '新建存檔': 'New save', '匯入存檔': 'Import save', '刪除帳號': 'Delete account', '刪除裝置': 'Delete device', '操作': 'Actions', '生效': 'active', '切換': 'Switch', '改名': 'Rename', '複製': 'Clone', '刪除': 'Delete',
  '已切換生效存檔': 'Active save switched', '已複製存檔': 'Save cloned', '已新建存檔': 'Save created', '讀取檔案失敗': 'Failed to read file', '已匯入為新存檔': 'Imported as new save', '匯入失敗': 'Import failed',
  '確定刪除存檔 #{id}?': 'Delete save #{id}?', '已刪除存檔': 'Save deleted', '確定刪除裝置 #{id} 及其所有存檔?': 'Delete device #{id} and all its saves?', '已刪除裝置': 'Device deleted',
  '請輸入新名字': 'Enter a new name', '已改名': 'Renamed', '改名失敗': 'Rename failed', '匯出失敗': 'Export failed', '已匯出存檔': 'Save exported',
  '用檔案覆蓋存檔 #{id} 的所有資料?此動作無法復原。': 'Overwrite ALL data of save #{id} with this file? This cannot be undone.', '已匯入覆蓋存檔': 'Save overwritten from file',
  // server time
  '目前:': 'Now: ', '設定時間': 'Set time', '從日曆挑選日期時間': 'Pick date & time from calendar', '套用': 'Apply', '重置為系統時間': 'Reset to system time',
  '自訂': 'Custom', '系統時間': 'System time', '請輸入時間': 'Enter a time', '伺服器時間已設定': 'Server time set', '已重置為系統時間': 'Reset to system time',
  // mail
  '群發郵件(發送給所有存檔)': 'Broadcast mail (send to all saves)', '附件類型': 'Attachment type',
  '道具 (Item)': 'Item', '付費星導石 (Paid Vmoney)': 'Paid gems (Vmoney)', '免費星導石 (Free Vmoney)': 'Free gems (Vmoney)', '角色 (Character)': 'Character', '裝備 (Equipment)': 'Equipment', '星之碎片 (Star Crumb)': 'Star Crumb', '法力 (Mana)': 'Mana', '經驗池 (Exp Pool)': 'Exp Pool', '羈絆之證 (Bond Token)': 'Bond Token', 'Boss Boost 點': 'Boss Boost pts', 'Boost 點': 'Boost pts', 'Rank 點': 'Rank pts',
  '附件 ID': 'Attachment ID', '道具ID / 角色code / 裝備ID': 'Item ID / character code / equipment ID',
  '只有「道具 / 角色 / 裝備」需要填附件 ID;其他資源類型直接填數量即可。角色 / 裝備每封數量固定 1。': 'Only Item / Character / Equipment need an attachment ID; other resource types just need a quantity. Character / Equipment are fixed at 1 per mail.',
  '標題(選填,≤64)': 'Subject (optional, ≤64)', '正文(選填,≤512)': 'Body (optional, ≤512)', '發送': 'Send', '已發送': 'Sent',
  // logs
  '全部日誌': 'All logs', '除錯模式': 'Debug mode', '資料夾': 'Folder',
  '開啟後才會把完整日誌寫入 logs 資料夾(輪替壓縮,保留最後 9 個);關閉時只在此顯示,不佔磁碟': 'When on, full logs are written to the logs folder (rotated & compressed, last 9 kept); when off they show here only and use no disk',
  '開啟 log 資料夾': 'Open log folder',
  '除錯模式已開(日誌寫入 logs 資料夾)': 'Debug mode ON (logs written to logs folder)', '除錯模式已關(僅畫面顯示)': 'Debug mode OFF (screen only)', '切換失敗': 'Toggle failed', '無法開啟 log 資料夾': 'Cannot open log folder',
  // modals
  '尚未下載遊戲資源': 'Game assets not downloaded',
  '未下載資源(CDN)時,遊戲將無法載入(伺服器仍可啟動,僅供管理面板使用)。建議先下載或匯入資源。': 'Without assets (CDN) the game cannot load (the server still starts, for admin use only). Download or import assets first.',
  '前往下載 / 匯入': 'Go to download / import', '仍要啟動': 'Start anyway', '取消': 'Cancel',
  '連接埠已被佔用': 'Port already in use', '請輸入新的連接埠': 'Enter a new port', '套用並啟動': 'Apply & start',
  '尚未下載遊戲資源,點此下載或匯入': 'Game assets not downloaded — click to download or import',
  '埠號無效': 'Invalid port', '已更換埠號': 'Port changed', '埠號 {p} 仍被佔用': 'Port {p} is still in use', '連接埠 {p} 已被佔用,請改用其他埠號。': 'Port {p} is in use, please choose another.',
  // wizard progress
  '下載': 'Downloading', '解壓': 'Extracting', '解壓中…': 'Extracting…', '個項目': 'items', '資源下載完成': 'Assets downloaded',
  '無法連線到 GitHub(可能被牆)。請在「下載來源」改選鏡像,或用下方「匯入本地資源檔」。': 'Cannot reach GitHub (possibly blocked). Switch the download source to a mirror, or use “Import local asset files” below.',
  '無法連線到 GitHub,可能被牆': 'Cannot reach GitHub (possibly blocked)',
};

// convert a captured (whitespace-preserving) text-node / attribute value for the current language
function conv(o) {
  if (lang === 'cn') return t2s(o);
  if (lang === 'en') { const k = o.trim(); if (!k) return o; const en = EN[k]; return en == null ? o : o.replace(k, en); }
  return o;
}
function applyLang(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n; while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) {
    if (!_orig.has(node)) _orig.set(node, node.nodeValue);
    node.nodeValue = conv(_orig.get(node));
  }
  if (!root.querySelectorAll) return;
  root.querySelectorAll('[placeholder]').forEach((el) => {
    if (el.__ph === undefined) el.__ph = el.getAttribute('placeholder');
    el.setAttribute('placeholder', conv(el.__ph));
  });
  root.querySelectorAll('[title]').forEach((el) => {
    if (el.__ti === undefined) el.__ti = el.getAttribute('title');
    el.setAttribute('title', conv(el.__ti));
  });
  // 動態設定的文字(statusText/toggle 等,以 setTx 標了 data-i18n=源字串):一律從「源 key」重譯,
  // 不依賴文字節點的 _orig —— 否則 `textContent = tr(...)` 產生的新節點會把 _orig 記成已翻譯字串而卡住。
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tr(el.dataset.i18n); });
  // id→名稱欄:依當前語言用 nameOf 覆寫(en=拼音/英文;名稱不在字典,故不能靠上面的文字走訪)。
  root.querySelectorAll('[data-nm]').forEach((el) => {
    const s = el.dataset.nm, i = s.indexOf(':');
    el.textContent = nameOf(s.slice(0, i), s.slice(i + 1));
  });
}
// 設定「會隨語言變」的動態文字:記住源字串於 data-i18n,applyLang 才能正確重譯(防上述 _orig 污染)。
function setTx(el, key) { if (!el) return; el.dataset.i18n = key; el.textContent = tr(key); }
const LANG_LABEL = { tw: '繁', cn: '简', en: 'EN' };
const LANG_NEXT = { tw: 'cn', cn: 'en', en: 'tw' };
function setLang(l) {
  lang = ['tw', 'cn', 'en'].includes(l) ? l : 'tw';
  document.documentElement.lang = lang === 'cn' ? 'zh-Hans' : lang === 'en' ? 'en' : 'zh-Hant';
  $('langToggle').textContent = LANG_LABEL[lang];
  applyLang(document.body);
  try { localStorage.setItem('lang', lang); } catch {}
}
$('langToggle').addEventListener('click', () => setLang(LANG_NEXT[lang] || 'tw'));
// localized text for dynamically built strings; params fill {name} placeholders after translation
const tr = (s, params) => {
  let out = lang === 'cn' ? t2s(s) : lang === 'en' ? (EN[s] != null ? EN[s] : s) : s;
  if (params) out = out.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
  return out;
};

// ====================== API proxy (routed through Rust → no CORS) ======================
async function api(method, path, jsonBody) {
  const opts = { method, path };
  if (jsonBody !== undefined) { opts.body = JSON.stringify(jsonBody); opts.contentType = 'application/json'; }
  const res = await invoke('api_request', opts);
  let data = null;
  if (res.body) { try { data = JSON.parse(res.body); } catch { data = res.body; } }
  return { status: res.status, data, location: res.location };
}
async function apiForm(method, path, formObj) {
  const body = new URLSearchParams(formObj).toString();
  return invoke('api_request', { method, path, body, contentType: 'application/x-www-form-urlencoded' });
}

// ====================== toast ======================
let toastTimer = null;
function toast(msg, kind = 'ok', params) {
  const t = $('toast');
  t.textContent = tr(msg, params);
  t.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 2400);
}

// ====================== tabs ======================
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    $(t.dataset.tab).classList.add('active');
    if (t.dataset.tab === 'admin') onEnterAdmin();
    if (t.dataset.tab === 'apk') refreshApkTab();
    if (t.dataset.tab === 'ios') refreshIosTab();
  });
});
document.querySelectorAll('.subtab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.subtab').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.subpanel').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    $('sub-' + t.dataset.sub).classList.add('active');
    if (t.dataset.sub === 'time') syncServerTime();
    if (t.dataset.sub === 'accounts') loadAccounts();
  });
});
function gotoTab(name) {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((x) => x.classList.toggle('active', x.id === name));
}

// ====================== status + 控制頁動畫 ======================
const STATUS_LABEL = { stopped: '已停止', starting: '啟動中…', running: '執行中', error: '錯誤' };
function renderStatus(s) {
  status = s;
  $('statusDot').className = 'dot ' + s;
  setTx($('statusText'), STATUS_LABEL[s] || s);
  const btn = $('toggle');
  btn.dataset.state = s;
  setTx(btn, (s === 'running' || s === 'starting') ? '停止' : '啟動');
  $('url').textContent = (s === 'running' && cfg) ? `http://${cfg.host}:${cfg.port}` : '';
  // running → button slides aside + live log appears; stopped → back to center
  $('controlStage').classList.toggle('running', s === 'running' || s === 'starting');
  updateAdminGate();
  if (s === 'running') startClock(); else stopClock();
}

// ====================== control (start with port check) ======================
$('toggle').addEventListener('click', async () => {
  if (status === 'running' || status === 'starting') { await invoke('stop_server'); return; }
  // 沒下載 CDN 時不要默默啟動一個跑不了遊戲的 server,先提示
  const st = await invoke('cdn_status');
  if (!st.present) { $('cdnGate').style.display = 'flex'; return; }
  await ensurePortsForStart(doStart);
});
$('cdnGateCancel').addEventListener('click', () => ($('cdnGate').style.display = 'none'));
$('cdnGateDownload').addEventListener('click', () => { $('cdnGate').style.display = 'none'; showFirstRun(true); });
$('cdnGateStart').addEventListener('click', () => { $('cdnGate').style.display = 'none'; ensurePortsForStart(doStart); });

async function doStart() {
  try { await invoke('start_server'); }
  catch (e) { appendLog('[launcher] ' + e); toast(String(e), 'err'); }
}

// Ensure the configured port is free; if not, prompt for a new one, then run `next`.
async function ensurePortThen(next) {
  const host = (cfg && cfg.host) || '127.0.0.1';
  const port = Number((cfg && cfg.port) || 8001);
  const free = await invoke('port_available', { host, port });
  if (free) { next(); return; }
  promptPort(port, next);
}

// For PACKAGING (APK/IPA): the target is always cfg.host:cfg.port. If OUR server is running it is
// legitimately holding that port — that's exactly what we bake in — so proceed WITHOUT the free-port
// check (which would otherwise misfire as "port busy" and wrongly prompt to change the baked port).
// Only when the server is stopped do we run the free-check (warns if another app holds the port).
// Packaging just bakes cfg.host:cfg.port into the APK/IPA — port availability is a server-start /
// settings concern, not a packaging one. So always proceed (no free-port check, no popup).
function ensurePortForPackaging(next) { next(); }

// Before STARTING: the server binds TWO ports — the main HTTP port (cfg.port, e.g. 8001) AND a TCP
// session server for multi-battle (SESSION_PORT, default 8003, bound on 0.0.0.0). The main port is
// blocking (prompt to change if busy); the session port is only needed for co-op, so if it's taken
// we just WARN (single-player still works) rather than block startup.
// Before starting, BOTH server ports must be free: 個人 (cfg.port) + 聯機 (cfg.sessionPort). If either
// is held by another app, BLOCK the start and send the user to 設定 to pick a free port (no runtime
// change-port popup) — the server never starts on a taken port, so it can't crash on the session bind
// and multiplayer always works on a free port.
async function ensurePortsForStart(next) {
  const host = (cfg && cfg.host) || '127.0.0.1';
  const main = parseInt((cfg && cfg.port) || 8001);
  const session = parseInt((cfg && cfg.sessionPort) || 8003);
  const mainFree = await invoke('port_available', { host, port: main });
  const sessFree = await invoke('port_available', { host: '0.0.0.0', port: session });
  const busy = [];
  if (!mainFree) busy.push(`${main}${tr('(個人)')}`);
  if (!sessFree) busy.push(`${session}${tr('(聯機)')}`);
  if (busy.length) {
    toast('連接埠被佔用:{list} — 請到「設定」改用其他埠', 'err', { list: busy.join('、') });
    return;
  }
  next();
}

let portOnDone = null;
function promptPort(busyPort, onDone) {
  portOnDone = onDone || doStart;
  $('portModalMsg').textContent = tr('連接埠 {p} 已被佔用,請改用其他埠號。', { p: busyPort });
  $('portModalInput').value = String(busyPort + 1);
  $('portModal').style.display = 'flex';
  $('portModalInput').focus();
}
$('portModalCancel').addEventListener('click', () => { portOnDone = null; $('portModal').style.display = 'none'; });
$('portModalOk').addEventListener('click', async () => {
  const np = Number($('portModalInput').value.trim());
  if (!np || np < 1 || np > 65535) return toast('埠號無效', 'err');
  const host = (cfg && cfg.host) || '127.0.0.1';
  const free = await invoke('port_available', { host, port: np });
  if (!free) { $('portModalInput').value = String(np + 1); return toast('埠號 {p} 仍被佔用', 'err', { p: np }); }
  cfg = await invoke('save_config', { ui: { port: String(np) } });
  $('port').value = cfg.port;
  refreshApkTab();
  $('portModal').style.display = 'none';
  toast('已更換埠號');
  const cb = portOnDone; portOnDone = null; if (cb) cb();
});

// ====================== settings ======================
async function loadConfig() {
  cfg = await invoke('get_config');
  $('serverPath').value = cfg.serverPath || '';
  $('host').value = cfg.host || '';
  $('resVersion').value = cfg.resVersion || '';
  const dbg = $('debugLog'); if (dbg) dbg.checked = !!cfg.debugLog;
  const cc = $('cloudCdn'); if (cc) cc.checked = !!cfg.cloudCdn;
  $('port').value = cfg.port || '8001';
  $('sessionPort').value = cfg.sessionPort || '8003';
  checkPortWarn('port', 'portWarn');
  checkPortWarn('sessionPort', 'sessionPortWarn');
}

// ---- ports (個人 8001 / 聯機 8003): free-text input + custom dropdown of AVAILABLE ports ----
// Dropdown lists unoccupied ports 10 at a time (scroll near the bottom → ajax-loads the next 10),
// excluding the OTHER launcher port so the two never collide. Typing a custom port still works.
function portHost() { return ($('host').value || (cfg && cfg.host) || '127.0.0.1'); }
const PORT_BATCH = 10;
const _portDDs = [];
function closeAllPortDd(except) { for (const d of _portDDs) if (d !== except) d.close(); }
function setupPortDropdown(inputId, def, otherInputId, warnId) {
  const inp = $(inputId);
  const dd = document.createElement('div');
  dd.className = 'port-dd';
  dd.style.display = 'none';
  inp.parentElement.appendChild(dd);
  let nextStart = def, loading = false, done = false, open = false;
  const rec = { portrow: inp.parentElement, close: () => closeDd() };
  _portDDs.push(rec);
  async function loadBatch() {
    if (loading || done) return;
    loading = true;
    let free = [];
    try { free = await invoke('list_free_ports', { host: portHost(), start: nextStart, count: PORT_BATCH }); } catch (e) {}
    if (!free.length) { done = true; loading = false; return; }
    const other = $(otherInputId) ? $(otherInputId).value.trim() : '';
    for (const p of free) {
      if (String(p) === other || dd.querySelector(`[data-p="${p}"]`)) continue;
      const o = document.createElement('div');
      o.className = 'port-opt'; o.dataset.p = p; o.textContent = p;
      o.addEventListener('mousedown', (e) => { e.preventDefault(); inp.value = p; closeDd(); checkPortWarn(inputId, warnId); });
      dd.appendChild(o);
    }
    nextStart = Math.max(...free) + 1;
    loading = false;
    if (dd.querySelectorAll('.port-opt').length < PORT_BATCH && !done) loadBatch(); // filtered → keep filling to ~10
  }
  function openDd() {
    if (open) return;
    closeAllPortDd(rec); // 一次只開一個
    dd.innerHTML = ''; nextStart = def; done = false; open = true; dd.style.display = 'block';
    loadBatch();
  }
  function closeDd() { if (!open) return; open = false; dd.style.display = 'none'; }
  // 只在「直接按下輸入框」時開/關:mousedown 不會被 <label> 轉發,也不受視窗重新聚焦(focus)影響 → 不會自己冒出來。
  inp.addEventListener('mousedown', () => { open ? closeDd() : openDd(); });
  dd.addEventListener('scroll', () => { if (dd.scrollTop + dd.clientHeight >= dd.scrollHeight - 24) loadBatch(); });
}
// 共用關閉:點任一下拉外面就關(pointerdown 涵蓋觸控);選定/開另一個由上面處理。
document.addEventListener('pointerdown', (e) => { for (const d of _portDDs) if (!d.portrow.contains(e.target)) d.close(); });
// 通用彈窗(.modal:pickerModal / cdnGate 等):點背景關 + Esc 關(firstrun 是 .overlay,不受影響)。
document.querySelectorAll('.modal').forEach((m) => { m.addEventListener('mousedown', (e) => { if (e.target === m) m.style.display = 'none'; }); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeAllPortDd();
  document.querySelectorAll('.modal').forEach((m) => { if (m.style.display !== 'none') m.style.display = 'none'; });
});
async function checkPortWarn(inputId, warnId) {
  const warn = $(warnId); if (!warn) return;
  // while running, the ports are legitimately held by us → not a conflict
  if (status === 'running' || status === 'starting') { warn.textContent = ''; return; }
  const port = parseInt($(inputId).value); if (!port) { warn.textContent = ''; return; }
  let free = true;
  try { free = await invoke('port_available', { host: portHost(), port }); } catch (e) {}
  warn.textContent = free ? '' : tr('被其他程式佔用');
}
$('port').addEventListener('change', () => checkPortWarn('port', 'portWarn'));
$('sessionPort').addEventListener('change', () => checkPortWarn('sessionPort', 'sessionPortWarn'));
setupPortDropdown('port', 8001, 'sessionPort', 'portWarn');
setupPortDropdown('sessionPort', 8003, 'port', 'sessionPortWarn');
$('pickDir').addEventListener('click', async () => {
  const dir = await invoke('pick_dir');
  if (dir) $('serverPath').value = dir;
});
$('detectIp').addEventListener('click', async () => {
  const ip = await invoke('local_ip');
  $('host').value = ip;
  toast('已偵測:{ip}', 'ok', { ip });
});
$('save').addEventListener('click', async () => {
  cfg = await invoke('save_config', {
    ui: {
      serverPath: $('serverPath').value.trim(),
      host: $('host').value.trim(),
      port: $('port').value.trim(),
      sessionPort: $('sessionPort').value.trim(),
      resVersion: $('resVersion').value.trim(),
      cloudCdn: $('cloudCdn').checked,
    },
  });
  checkPortWarn('port', 'portWarn');
  checkPortWarn('sessionPort', 'sessionPortWarn');
  $('saveMsg').textContent = tr('已儲存');
  setTimeout(() => ($('saveMsg').textContent = ''), 2000);
});

// ====================== 首啟精靈 + CDN 下載 ======================
let cdnDownloading = false;
let cdnPresent = false;

function showFirstRun(show) {
  $('firstrun').style.display = show ? 'flex' : 'none';
  document.body.classList.toggle('firstrun-active', show); // 暗掉並停用上方 tab
  updateCdnFab();
}
// 只要資源尚未「完整」(cdnPresent 來自完成標記)且精靈未開啟,就顯示懸浮球。
// 即使下載/解壓中被略過,球仍會出現(點它可開回精靈看進度);完整後才永久消失。
function updateCdnFab() {
  const wizardOpen = $('firstrun').style.display !== 'none';
  $('cdnFab').style.display = (!cdnPresent && !wizardOpen) ? 'flex' : 'none';
}
async function checkFirstRun() {
  const st = await invoke('cdn_status');
  cdnPresent = st.present;
  showFirstRun(!st.present);
}
$('wizSkip').addEventListener('click', () => showFirstRun(false));
$('cdnFab').addEventListener('click', () => showFirstRun(true));
$('wizLang').addEventListener('change', () => setLang($('wizLang').value === 's' ? 'cn' : 'tw'));
$('wizMirror').addEventListener('change', () => {
  const custom = $('wizMirror').value === '__custom';
  $('wizMirrorCustom').style.display = custom ? 'block' : 'none';
});
function getMirror() {
  const v = $('wizMirror').value;
  if (v === '__custom') { let m = $('wizMirrorCustom').value.trim(); if (m && !m.endsWith('/')) m += '/'; return m; }
  return v;
}

$('wizDownload').addEventListener('click', () => startCdn(() => invoke('cdn_download', { mirror: getMirror() })));
$('wizImport').addEventListener('click', async () => {
  const files = await invoke('pick_files_any');
  if (!files || files.length === 0) return;
  startCdn(() => invoke('cdn_import', { archivePaths: files }), '解壓中…');
});

function startCdn(action, label) {
  if (cdnDownloading) return;
  cdnDownloading = true;
  $('wizDownload').disabled = true;
  $('wizImport').disabled = true;
  $('wizProgWrap').style.display = 'block';
  $('wizProgText').style.color = '';
  $('wizProgText').textContent = tr(label || '準備中…');
  $('wizProgBar').style.width = '0%';
  action().catch((e) => cdnError(String(e)));
}
function fmtGB(b) { return (b / 1073741824).toFixed(2) + 'GB'; }
function cdnError(msg) {
  cdnDownloading = false;
  $('wizDownload').disabled = false;
  $('wizImport').disabled = false;
  $('wizProgText').style.color = 'var(--danger)';
  // 連線類錯誤(很可能 GitHub 被牆)→ 給明確指引,而非丟原始錯誤
  const netish = /tim(e|ed)\s?out|timeout|connect|dns|resolve|network|os error|sending request|reach|handshake|tls/i.test(msg);
  if (netish) {
    $('wizProgText').textContent = tr('無法連線到 GitHub(可能被牆)。請在「下載來源」改選鏡像,或用下方「匯入本地資源檔」。');
    toast('無法連線到 GitHub,可能被牆', 'err');
  } else {
    $('wizProgText').textContent = tr('錯誤:') + msg;
    toast(msg, 'err');
  }
}
listen('cdn-progress', (e) => {
  const p = e.payload;
  $('wizProgBar').style.width = p.percent + '%';
  $('wizProgText').style.color = '';
  $('wizProgText').textContent = p.phase === 'download'
    ? tr('下載') + ` ${fmtGB(p.current)} / ${fmtGB(p.total)} (${p.percent}%)`
    : tr('解壓') + ` ${p.current}${p.total ? '/' + p.total : ''} ` + tr('個項目');
});
listen('cdn-done', async () => {
  cdnDownloading = false;
  cdnPresent = true; // 資源已就緒 → 之後不再顯示懸浮球
  $('wizDownload').disabled = false;
  $('wizImport').disabled = false;
  $('wizProgBar').style.width = '100%';
  $('wizProgText').style.color = 'var(--primary)';
  $('wizProgText').textContent = tr('完成');
  toast('資源下載完成');
  // 下載完 → 收起精靈,跳到設定並自動偵測本機 IP
  setTimeout(async () => {
    showFirstRun(false);
    const ip = await invoke('local_ip');
    $('host').value = ip;
    cfg = await invoke('save_config', { ui: { host: ip } });
    gotoTab('settings');
    toast('已偵測本機 IP:{ip}', 'ok', { ip });
  }, 900);
});
listen('cdn-error', (e) => cdnError(String(e.payload)));

// ====================== 打包 APK ======================
let apkPatching = false;
function refreshApkTab() { $('apkTarget').textContent = cfg ? `http://${cfg.host}:${cfg.port}` : '—'; }
$('apkPick').addEventListener('click', async () => {
  const f = await invoke('pick_file');
  if (f) $('apkPath').value = f;
});
$('apkPatch').addEventListener('click', async () => {
  if (apkPatching) return;
  const apkPath = $('apkPath').value.trim();
  if (!apkPath) return toast('請先選擇原始 APK', 'err');
  // 打包會把 host:port 寫死進 APK,先確保該埠可用(否則之後伺服器起不來)
  ensurePortForPackaging(() => doPatch(apkPath));
});
function doPatch(apkPath) {
  apkPatching = true;
  $('apkPatch').disabled = true;
  $('apkOut').textContent = '';
  $('apkProgWrap').style.display = 'block';
  $('apkProgText').style.color = '';
  $('apkProgText').textContent = tr('準備中…');
  $('apkProgBar').style.width = '0%';
  invoke('patch_apk', { apkPath }).catch((e) => apkError(String(e)));
}
function apkError(msg) {
  apkPatching = false;
  $('apkPatch').disabled = false;
  $('apkProgText').style.color = 'var(--danger)';
  $('apkProgText').textContent = tr('錯誤:') + msg;
  toast(msg, 'err');
}
listen('apk-progress', (e) => {
  const p = e.payload;
  const pct = p.total ? Math.round((p.current / p.total) * 100) : 0;
  $('apkProgBar').style.width = pct + '%';
  $('apkProgText').style.color = '';
  $('apkProgText').textContent = tr('步驟') + ` ${p.current}/${p.total} — ` + tr(p.label);
});
listen('apk-done', (e) => {
  apkPatching = false;
  $('apkPatch').disabled = false;
  $('apkProgBar').style.width = '100%';
  $('apkProgText').style.color = 'var(--primary)';
  $('apkProgText').textContent = tr('完成');
  const out = String(e.payload).replace(/\s*\(.*$/, '');
  $('apkOut').innerHTML = tr('已產出:') + `<code>${out}</code><br>` + tr('把它裝到模擬器 / 手機即可(若已裝舊版且簽章不同,需先解除安裝)。');
  toast('APK 打包完成');
});
listen('apk-error', (e) => apkError(String(e.payload)));

// ====================== iOS 打包 ======================
let iosPatching = false;
function refreshIosTab() { $('iosTarget').textContent = cfg ? `http://${cfg.host}:${cfg.port}` : '—'; }
$('iosPick').addEventListener('click', async () => {
  const f = await invoke('pick_ipa');
  if (f) $('iosPath').value = f;
});
$('iosPatch').addEventListener('click', async () => {
  if (iosPatching) return;
  const ipaPath = $('iosPath').value.trim();
  if (!ipaPath) return toast('請先選擇原始 IPA', 'err');
  // 重導目標 host:port 會寫死進 IPA,先確保該埠可用
  ensurePortForPackaging(() => doPatchIpa(ipaPath));
});
function doPatchIpa(ipaPath) {
  iosPatching = true;
  $('iosPatch').disabled = true;
  $('iosOut').textContent = '';
  $('iosProgWrap').style.display = 'block';
  $('iosProgText').style.color = '';
  $('iosProgText').textContent = tr('準備中…');
  $('iosProgBar').style.width = '0%';
  invoke('patch_ipa', { ipaPath }).catch((e) => iosError(String(e)));
}
function iosError(msg) {
  iosPatching = false;
  $('iosPatch').disabled = false;
  $('iosProgText').style.color = 'var(--danger)';
  $('iosProgText').textContent = tr('錯誤:') + msg;
  toast(msg, 'err');
}
listen('ipa-progress', (e) => {
  const p = e.payload;
  const pct = p.total ? Math.round((p.current / p.total) * 100) : 0;
  $('iosProgBar').style.width = pct + '%';
  $('iosProgText').style.color = '';
  $('iosProgText').textContent = tr('步驟') + ` ${p.current}/${p.total} — ` + tr(p.label);
});
listen('ipa-done', (e) => {
  iosPatching = false;
  $('iosPatch').disabled = false;
  $('iosProgBar').style.width = '100%';
  $('iosProgText').style.color = 'var(--primary)';
  $('iosProgText').textContent = tr('完成');
  const out = String(e.payload).replace(/\s*\(.*$/, '');
  $('iosOut').innerHTML = tr('已產出:') + `<code>${out}</code><br>` + tr('用 Sideloadly／AltStore 以你的 Apple ID 簽名後安裝到 iPhone(會自動重簽 patch 後的二進位)。');
  toast('IPA 打包完成');
});
listen('ipa-error', (e) => iosError(String(e.payload)));

// ====================== 管理面板 ======================
const RESOURCE_FIELDS = [
  ['name', '名字'], ['comment', '個性簽名'], ['degreeId', '稱號/等級ID'], ['birth', '生日'],
  ['role', '性別/Role'], ['leaderCharacterId', '隊長角色ID'],
  ['freeVmoney', '星導石(免費)'], ['vmoney', '星導石(付費)'], ['freeMana', 'Mana(免費)'], ['paidMana', 'Mana(付費)'],
  ['stamina', '體力'], ['partySlot', '隊伍槽'], ['rankPoint', 'Rank'], ['starCrumb', '星屑'], ['bondToken', '羈絆證'],
  ['bossBoostPoint', 'Boss Boost'], ['boostPoint', 'Boost'], ['expPool', '經驗池'],
  ['tutorialStep', '教程步驟'], ['tutorialSkipFlag', '教程跳過(true/false)'], ['tutorialGachaCharacterId', '教程抽卡角色ID'],
  ['transitionState', '轉移狀態'], ['enableAuto3x', '自動3倍速(true/false)'],
  ['staminaHealTime', '體力恢復時間'], ['lastLoginTime', '最後登入時間'], ['expPooledTime', '經驗池時間'],
];
let currentPid = null;
let plPage = 0;
const PER_PAGE = 25;

function updateAdminGate() {
  const running = status === 'running';
  $('adminBlocked').style.display = running ? 'none' : 'flex';
  $('adminBody').classList.toggle('dimmed', !running);
}
let adminLoaded = false;
// ====================== id→名稱 查表 picker ======================
// 對齊鐵律:一律用 id 對應(id↔简名來自 CN 自家資料,永遠正確);英文層採 Global 表,點選只填 id。
let nameLookup = null;
async function loadNameLookup() {
  if (nameLookup) return nameLookup;
  try { const r = await api('GET', '/api/server/nameLookup'); if (r.status === 200 && r.data && typeof r.data === 'object') nameLookup = r.data; } catch (e) {}
  return nameLookup;
}
function nameOf(type, id) {
  const t = nameLookup && nameLookup[type]; if (!t) return '';
  const e = t[String(id)]; if (!e) return '';
  return lang === 'en' ? (e.en || e.zh || '') : (e.zh || e.en || '');
}
let pickerType = null, pickerTarget = null;
window.openPicker = async (type, targetId) => {
  await loadNameLookup();
  pickerType = type; pickerTarget = targetId;
  const label = { characters: '角色', items: '道具', equipment: '裝備' }[type] || '';
  $('pickerTitle').textContent = tr('查表') + (label ? ' — ' + tr(label) : '');
  $('pickerSearch').value = '';
  $('pickerModal').style.display = 'flex';
  renderPicker('');
  $('pickerSearch').focus();
};
window.openMailPicker = () => {
  const t = { '1': 'items', '5': 'characters', '6': 'equipment' }[$('mailType').value];
  if (t) window.openPicker(t, 'mailTypeId');
};
function renderPicker(q) {
  const src = (nameLookup && nameLookup[pickerType]) || {};
  q = q.trim().toLowerCase();
  const hits = [];
  for (const id of Object.keys(src)) {
    const e = src[id];
    if (!q || id.includes(q) || (e.zh && e.zh.toLowerCase().includes(q)) || (e.en && e.en.toLowerCase().includes(q))) hits.push(id);
  }
  const list = $('pickerList');
  list.innerHTML = hits.map((id) => {
    const e = src[id];
    const sub = lang === 'en' ? (e.zh || '') : (e.en || '');
    return `<div class="picker-row" data-id="${id}"><span class="pk-id">${id}</span><span class="pk-name">${escapeHtml(nameOf(pickerType, id))}</span><span class="pk-sub">${escapeHtml(sub)}</span></div>`;
  }).join('') || `<div class="picker-more">${tr('無符合結果')}</div>`;
  list.querySelectorAll('.picker-row').forEach((row) => row.addEventListener('click', () => {
    const inp = $(pickerTarget); if (inp) inp.value = row.dataset.id;
    $('pickerModal').style.display = 'none';
  }));
}
$('pickerSearch').addEventListener('input', () => renderPicker($('pickerSearch').value));
$('pickerClose').addEventListener('click', () => ($('pickerModal').style.display = 'none'));

function onEnterAdmin() {
  updateAdminGate();
  if (status === 'running' && !adminLoaded) { adminLoaded = true; loadPlayers(0); }
}

function fmtDate(v) { if (!v) return '—'; try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); } }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadPlayers(page) {
  plPage = Math.max(0, page);
  const r = await api('GET', `/api/player/?page=${plPage}&perPage=${PER_PAGE}`);
  const list = Array.isArray(r.data) ? r.data : [];
  $('plPage').textContent = String(plPage + 1);
  $('plPrev').disabled = plPage === 0;
  $('plNext').disabled = list.length < PER_PAGE;
  const ul = $('playerList');
  if (list.length === 0) { ul.innerHTML = `<li class="empty">${tr('暫無玩家')}</li>`; return; }
  ul.innerHTML = list.map((p) => `
    <li class="pitem${p.id === currentPid ? ' active' : ''}" data-pid="${p.id}">
      <div class="pname">${escapeHtml(p.name || tr('(無名)'))}</div>
      <div class="pmeta">ID ${p.id} · ${fmtDate(p.lastLoginTime)}</div>
    </li>`).join('');
  ul.querySelectorAll('.pitem').forEach((li) => li.addEventListener('click', () => openPlayer(Number(li.dataset.pid))));
  applyLang(ul);
}
$('plReload').addEventListener('click', () => loadPlayers(plPage));
$('plPrev').addEventListener('click', () => loadPlayers(plPage - 1));
$('plNext').addEventListener('click', () => loadPlayers(plPage + 1));

// 新增帳號/存檔走「帳號」分頁(上游 newSave 等端點);玩家分頁只負責檢視/編輯既有存檔。

// 每類各自分頁(角色/道具/裝備太多時不用一路往下滑);查表 picker 那邊反而全列不分頁。
let curDetail = null;
const DET_PAGE = 50;
const detPage = { char: 0, item: 0, equip: 0, quest: 0, drawn: 0 };

// preserve=true: an in-place refresh after an edit — keep the current scroll position and page
// numbers so the view doesn't jump back to the top. Switching players (from the list) uses the
// default (false) which resets to the top and to page 0.
async function openPlayer(pid, preserve = false) {
  const det = $('playerDetail');
  const keepScroll = preserve ? det.scrollTop : 0;
  const keepPage = preserve ? { ...detPage } : null;
  currentPid = pid;
  await loadNameLookup();
  document.querySelectorAll('.pitem').forEach((li) => li.classList.toggle('active', Number(li.dataset.pid) === pid));
  if (!preserve) det.innerHTML = `<div class="detail-empty">${tr('載入中…')}</div>`;
  const r = await api('GET', `/api/player/save?id=${pid}`);
  if (r.status !== 200 || !r.data || !r.data.data) { det.innerHTML = `<div class="detail-empty">${tr('載入失敗')}</div>`; return; }
  const d = r.data.data;
  const qp = [];
  for (const [section, arr] of Object.entries(d.questProgress || {})) for (const q of (arr || [])) qp.push({ section, ...q });
  curDetail = {
    p: d.player || {},
    chars: Object.entries(d.characterList || {}),
    items: Object.entries(d.itemList || {}),
    equips: Object.entries(d.equipmentList || {}),
    qp,
    dq: d.drawnQuestList || [],
  };
  if (keepPage) Object.assign(detPage, keepPage);
  else detPage.char = detPage.item = detPage.equip = detPage.quest = detPage.drawn = 0;
  renderDetail();
  if (preserve) $('playerDetail').scrollTop = keepScroll;
}

function detSlice(arr, cat) { return arr.slice(detPage[cat] * DET_PAGE, detPage[cat] * DET_PAGE + DET_PAGE); }
function detPager(cat, total) {
  const pages = Math.max(1, Math.ceil(total / DET_PAGE));
  if (pages <= 1) return '';
  const pg = detPage[cat];
  return `<span class="pager"><button class="mini" ${pg <= 0 ? 'disabled' : ''} onclick="detPageNav('${cat}',-1)">‹</button><span class="page">${pg + 1}/${pages}</span><button class="mini" ${pg >= pages - 1 ? 'disabled' : ''} onclick="detPageNav('${cat}',1)">›</button></span>`;
}
window.detPageNav = (cat, delta) => {
  if (!curDetail) return;
  const totals = { char: curDetail.chars.length, item: curDetail.items.length, equip: curDetail.equips.length, quest: curDetail.qp.length, drawn: curDetail.dq.length };
  const pages = Math.max(1, Math.ceil((totals[cat] || 0) / DET_PAGE));
  detPage[cat] = Math.min(pages - 1, Math.max(0, detPage[cat] + delta));
  renderDetail();
};

function renderDetail() {
  if (!curDetail) return;
  const det = $('playerDetail');
  const { p, chars, items, equips, qp, dq } = curDetail;
  const fieldsHtml = RESOURCE_FIELDS.map(([key, label]) => `
    <div class="fld"><label>${label}</label>
      <input value="${escapeHtml(p[key] == null ? '' : p[key])}" onchange="editField('${key}', this.value, this)"></div>`).join('');
  const charRows = detSlice(chars, 'char').map(([code, c]) => `
    <tr><td class="nm" data-nm="characters:${code}">${escapeHtml(nameOf('characters', code))}</td><td>${code}</td><td>${c.evolutionLevel ?? '—'}</td><td>${c.exp ?? '—'}</td><td>${c.entryCount ?? '—'}</td>
      <td><button class="x" onclick="delChar('${code}')">×</button></td></tr>`).join('');
  const itemRows = detSlice(items, 'item').map(([iid, count]) => `
    <tr><td class="nm" data-nm="items:${iid}">${escapeHtml(nameOf('items', iid))}</td><td>${iid}</td><td><input class="cell" value="${count}" onchange="setItem('${iid}', this.value)"></td>
      <td><button class="x" onclick="delItem('${iid}')">×</button></td></tr>`).join('');
  const equipRows = detSlice(equips, 'equip').map(([eid, e]) => `
    <tr><td class="nm" data-nm="equipment:${eid}">${escapeHtml(nameOf('equipment', eid))}</td><td>${eid}</td><td>${e.level ?? '—'}</td><td>${e.enhancementLevel ?? '—'}</td></tr>`).join('');
  const qpRows = detSlice(qp, 'quest').map((q) => `<tr><td>${q.section}</td><td>${q.questId}</td><td>${q.finished ? '是' : '—'}</td><td>${q.highScore ?? '—'}</td>
      <td><button class="x" onclick="delQuestProgress('${q.section}','${q.questId}')">×</button></td></tr>`).join('');
  const dqRows = detSlice(dq, 'drawn').map((x) => `<tr><td>${x.categoryId}</td><td>${x.questId}</td><td>${x.oddsId ?? '—'}</td>
    <td><button class="x" onclick="delDrawnQuest('${x.categoryId}','${x.questId}')">×</button></td></tr>`).join('');
  det.innerHTML = `
    <div class="detail-head">
      <h3>${escapeHtml(p.name || tr('(無名)'))} <span class="muted">#${currentPid}</span></h3>
      <div class="actions">
        <button class="mini" onclick="resetChallenge()">重置每日挑戰</button>
        <button class="mini" onclick="exportSave()">匯出存檔</button>
        <button class="mini" onclick="importOverwrite()">匯入覆蓋</button>
        <button class="mini" onclick="dailyReset()" title="強制輪替每日任務:快照目前進度作基準 + 清除任務快取,下次登入重新產生當日任務。不影響道具/角色/貨幣/存檔。">每日重置</button>
        <button class="mini" onclick="weeklyReset()" title="強制輪替每週任務:快照目前進度作基準 + 清除任務快取,下次登入重新產生本週任務。不影響道具/角色/貨幣/存檔。">每週重置</button>
        <button class="mini danger" onclick="clearMail()">清空信箱</button>
      </div>
    </div>
    <h4 class="sec">玩家欄位</h4>
    <div class="fldgrid">${fieldsHtml}</div>
    <h4 class="sec">${tr('角色')} (${chars.length}) ${detPager('char', chars.length)}</h4>
    <div class="addrow"><input id="addCharCode" placeholder="角色商務碼 (code)"><button class="mini" onclick="openPicker('characters','addCharCode')">查表</button><button class="mini" onclick="addChar()">新增角色</button></div>
    <table class="tbl"><thead><tr><th>名稱</th><th>code</th><th>進化</th><th>exp</th><th>entry</th><th></th></tr></thead>
      <tbody>${charRows || `<tr><td colspan="6" class="muted">${tr('暫無角色')}</td></tr>`}</tbody></table>
    <h4 class="sec">${tr('道具')} (${items.length}) ${detPager('item', items.length)}</h4>
    <div class="addrow"><input id="addItemId" placeholder="道具 ID"><button class="mini" onclick="openPicker('items','addItemId')">查表</button><input id="addItemCount" placeholder="數量" value="9999"><button class="mini" onclick="addItem()">新增/設定</button></div>
    <table class="tbl"><thead><tr><th>名稱</th><th>ID</th><th>數量</th><th></th></tr></thead>
      <tbody>${itemRows || `<tr><td colspan="4" class="muted">${tr('暫無道具')}</td></tr>`}</tbody></table>
    <h4 class="sec">${tr('裝備')} (${equips.length}) ${detPager('equip', equips.length)}</h4>
    <table class="tbl"><thead><tr><th>名稱</th><th>ID</th><th>等級</th><th>強化</th></tr></thead>
      <tbody>${equipRows || `<tr><td colspan="4" class="muted">${tr('暫無裝備')}</td></tr>`}</tbody></table>

    <h4 class="sec">${tr('關卡進度')} (${qp.length}) ${detPager('quest', qp.length)} <button class="mini danger" onclick="delAllQuestProgress()">清空全部</button></h4>
    <table class="tbl"><thead><tr><th>section</th><th>questId</th><th>已過</th><th>高分</th><th></th></tr></thead>
      <tbody>${qpRows || `<tr><td colspan="5" class="muted">${tr('暫無關卡記錄')}</td></tr>`}</tbody></table>

    <h4 class="sec">${tr('抽選紀錄')} (${dq.length}) ${detPager('drawn', dq.length)} <button class="mini danger" onclick="delAllDrawnQuest()">清空全部</button></h4>
    <table class="tbl"><thead><tr><th>category</th><th>questId</th><th>oddsId</th><th></th></tr></thead>
      <tbody>${dqRows || `<tr><td colspan="4" class="muted">${tr('暫無抽選記錄')}</td></tr>`}</tbody></table>`;
  applyLang(det);
}

window.editField = async (field, value, el) => {
  const r = await api('PATCH', `/api/player/${currentPid}/field`, { field, value });
  if (r.status === 200) { if (el) { el.classList.add('ok'); setTimeout(() => el.classList.remove('ok'), 800); } toast('已更新 {f}', 'ok', { f: field }); }
  else { if (el) { el.classList.add('err'); setTimeout(() => el.classList.remove('err'), 1200); } toast((r.data && r.data.error) || '更新失敗', 'err'); }
};
window.addChar = async () => {
  const code = Number($('addCharCode').value.trim());
  if (!code) return toast('請輸入角色 code', 'err');
  const r = await api('POST', `/api/player/${currentPid}/character`, { code });
  if (r.status === 200) { toast('已新增角色'); openPlayer(currentPid, true); } else toast((r.data && r.data.error) || '新增失敗', 'err');
};
window.delChar = async (code) => {
  const r = await api('DELETE', `/api/player/${currentPid}/character/${code}`);
  if (r.status === 200) { toast('已刪除角色'); openPlayer(currentPid, true); } else toast((r.data && r.data.error) || '刪除失敗', 'err');
};
window.addItem = async () => {
  const id = Number($('addItemId').value.trim()), count = Number($('addItemCount').value.trim());
  if (!id) return toast('請輸入道具 ID', 'err');
  const r = await api('POST', `/api/player/${currentPid}/item`, { id, count });
  if (r.status === 200) { toast('已設定道具'); openPlayer(currentPid, true); } else toast((r.data && r.data.error) || '設定失敗', 'err');
};
window.setItem = async (itemId, value) => {
  const r = await api('POST', `/api/player/${currentPid}/item`, { id: Number(itemId), count: Number(value) });
  if (r.status === 200) toast('道具 {id} = {v}', 'ok', { id: itemId, v: Number(value) }); else toast((r.data && r.data.error) || '設定失敗', 'err');
};
window.delItem = async (itemId) => {
  const r = await api('DELETE', `/api/player/${currentPid}/item/${itemId}`);
  if (r.status === 200) { toast('已刪除道具'); openPlayer(currentPid, true); } else toast((r.data && r.data.error) || '刪除失敗', 'err');
};
window.resetChallenge = async () => {
  const r = await api('POST', `/api/player/${currentPid}/reset_challenge`, {});
  if (r.status === 200) toast('已重置每日挑戰'); else toast((r.data && r.data.error) || '失敗', 'err');
};
window.clearMail = async () => {
  const r = await api('DELETE', `/api/player/${currentPid}/mail`);
  if (r.status === 200) toast('已清空信箱(刪除 {n})', 'ok', { n: r.data.deleted ?? 0 }); else toast((r.data && r.data.error) || '失敗', 'err');
};
window.dailyReset = async () => {
  const r = await api('POST', `/api/player/${currentPid}/daily_reset`, {});
  if (r.status === 200) { toast('已每日重置'); openPlayer(currentPid, true); } else toast((r.data && r.data.error) || '失敗', 'err');
};
window.weeklyReset = async () => {
  const r = await api('POST', `/api/player/${currentPid}/weekly_reset`, {});
  if (r.status === 200) { toast('已每週重置'); openPlayer(currentPid, true); } else toast((r.data && r.data.error) || '失敗', 'err');
};
window.delQuestProgress = async (section, questId) => {
  const r = await api('DELETE', `/api/player/${currentPid}/quest_progress/${section}/${questId}`);
  if (r.status === 200) { toast('已刪除關卡記錄'); openPlayer(currentPid, true); } else toast((r.data && r.data.error) || '失敗', 'err');
};
window.delAllQuestProgress = async () => {
  if (!confirm(tr('清空此玩家所有關卡進度?'))) return;
  const r = await api('DELETE', `/api/player/${currentPid}/quest_progress`);
  if (r.status === 200) { toast('已清空關卡進度'); openPlayer(currentPid, true); } else toast((r.data && r.data.error) || '失敗', 'err');
};
window.delDrawnQuest = async (cat, questId) => {
  const r = await api('DELETE', `/api/player/${currentPid}/drawn_quest/${cat}/${questId}`);
  if (r.status === 200) { toast('已刪除抽選記錄'); openPlayer(currentPid, true); } else toast((r.data && r.data.error) || '失敗', 'err');
};
window.delAllDrawnQuest = async () => {
  if (!confirm(tr('清空此玩家所有抽選紀錄?'))) return;
  const r = await api('DELETE', `/api/player/${currentPid}/drawn_quest`);
  if (r.status === 200) { toast('已清空抽選紀錄'); openPlayer(currentPid, true); } else toast((r.data && r.data.error) || '失敗', 'err');
};

// ====================== 伺服器時間 ======================
let clock = null, clockTimer = null, clockSyncCounter = 0;
async function syncServerTime() {
  const r = await api('GET', '/api/server/currentTime');
  if (r.status === 200 && r.data && r.data.date) {
    clock = { baseMs: Date.parse(r.data.date), t0: Date.now() };
    setTx($('timeCustom'), r.data.isCustom ? '自訂' : '系統時間');
    $('timeCustom').className = 'badge ' + (r.data.isCustom ? 'warn' : '');
    renderClock();
  }
}
function renderClock() {
  if (!clock) { $('timeNow').textContent = '—'; return; }
  $('timeNow').textContent = new Date(clock.baseMs + (Date.now() - clock.t0)).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}
function startClock() {
  if (clockTimer) return;
  clockSyncCounter = 0; syncServerTime();
  clockTimer = setInterval(() => { renderClock(); if (++clockSyncCounter >= 30) { clockSyncCounter = 0; syncServerTime(); } }, 1000);
}
function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } clock = null; $('timeNow').textContent = '—'; }
$('timeSet').addEventListener('click', async () => {
  // datetime-local value is "YYYY-MM-DDTHH:MM[:SS]"; ensure seconds before sending.
  let t = $('timePick').value.trim();
  if (!t) return toast('請輸入時間', 'err');
  if (/T\d\d:\d\d$/.test(t)) t += ':00';
  const r = await api('GET', `/api/server/time?time=${encodeURIComponent(t)}`);
  if (r.status === 200) { toast('伺服器時間已設定'); syncServerTime(); } else toast((r.data && r.data.message) || '設定失敗', 'err');
});
$('timeReset').addEventListener('click', async () => { await api('GET', '/api/server/resetTime'); toast('已重置為系統時間'); syncServerTime(); });

// ====================== 群發郵件 ======================
// 只有 道具(1)/角色(5)/裝備(6) 需要附件 ID,其餘資源類型隱藏 ID 欄。
const MAIL_NEEDS_ID = ['1', '5', '6'];
function updateMailTypeId() { $('mailTypeIdRow').style.display = MAIL_NEEDS_ID.includes($('mailType').value) ? 'block' : 'none'; }
$('mailType').addEventListener('change', updateMailTypeId);
updateMailTypeId();

$('mailSend').addEventListener('click', async () => {
  const form = {
    type: $('mailType').value, type_id: $('mailTypeId').value.trim(),
    number: $('mailNumber').value.trim() || '1', subject: $('mailSubject').value.trim(), description: $('mailDesc').value.trim(),
  };
  const res = await apiForm('POST', '/api/mail/send', form);
  const loc = res.location || '';
  const m = decodeURIComponent((loc.match(/[?&](ok|error)=([^&]*)/) || [])[2] || '');
  const isErr = /error=/.test(loc);
  $('mailMsg').textContent = m || tr(res.status < 400 ? '已發送' : '失敗');
  $('mailMsg').style.color = isErr ? 'var(--danger)' : 'var(--primary)';
  if (m) toast(m, isErr ? 'err' : 'ok');
});

// ====================== 帳號 / 存檔管理 ======================
$('acctReload').addEventListener('click', loadAccounts);

async function loadAccounts() {
  const r = await api('GET', '/api/server/accounts');
  const list = Array.isArray(r.data) ? r.data : [];
  const wrap = $('acctList');
  if (list.length === 0) {
    wrap.innerHTML = `<div class="muted" style="padding:16px">${tr('暫無裝置(玩家首次登入遊戲後自動產生)')}</div>`;
    return;
  }
  wrap.innerHTML = list.map((a) => `
    <div class="acct-card">
      <div class="acct-head">
        <b>${tr('裝置')} #${a.id}</b> <span class="muted">${a.saves.length} ${tr('存檔')}</span>
        ${a.deviceId ? `<input class="cell" id="dev_${a.deviceId}" value="${escapeHtml(a.deviceName || '')}" placeholder="${tr('裝置名稱')}"><button class="mini" onclick="renameDevice(${a.deviceId})">${tr('改名')}</button>` : ''}
        <span class="spacer"></span>
        <button class="mini" onclick="acctNewSave(${a.id})">新建存檔</button>
        <button class="mini" onclick="acctImportNew(${a.id})">匯入存檔</button>
        <button class="mini danger" onclick="acctDeleteAccount(${a.id})">刪除裝置</button>
      </div>
      <table class="tbl"><thead><tr><th>ID</th><th>名字</th><th>角色</th><th>操作</th></tr></thead><tbody>
      ${a.saves.map((s) => `
        <tr>
          <td>${s.id}</td>
          <td>${escapeHtml(s.name || '')}${s.active ? ' <span class="badge warn">生效</span>' : ''}</td>
          <td>${s.charCount}</td>
          <td class="acct-actions">
            <button class="mini" onclick="acctActivate(${s.id})" ${s.active ? 'disabled' : ''}>切換</button>
            <input class="cell" id="rn_${s.id}" placeholder="${escapeHtml(s.name || '')}">
            <button class="mini" onclick="acctRename(${s.id})">改名</button>
            <button class="mini" onclick="acctClone(${a.id}, ${s.id})">複製</button>
            <button class="mini danger" onclick="acctDeleteSave(${s.id})">刪除</button>
          </td>
        </tr>`).join('')}
      </tbody></table>
    </div>`).join('');
  applyLang(wrap);
}
async function acctPost(path) { const res = await invoke('api_request', { method: 'POST', path }); return res.status < 400; }
window.acctActivate = async (pid) => { (await acctPost(`/api/server/activateSave?playerId=${pid}`)) ? (toast('已切換生效存檔'), loadAccounts()) : toast('失敗', 'err'); };
window.acctClone = async (aid, pid) => { (await acctPost(`/api/server/cloneSave?playerId=${pid}&accountId=${aid}`)) ? (toast('已複製存檔'), loadAccounts()) : toast('失敗', 'err'); };
window.acctNewSave = async (aid) => { (await acctPost(`/api/server/newSave?accountId=${aid}`)) ? (toast('已新建存檔'), loadAccounts()) : toast('失敗', 'err'); };
// 從檔案匯入為「新存檔」(在該帳號下新增一個存檔槽)
window.acctImportNew = async (aid) => {
  const f = await invoke('pick_file_any'); if (!f) return;
  let content; try { content = await invoke('read_text_file', { path: f }); } catch (e) { return toast('讀取檔案失敗', 'err'); }
  const r = await invoke('api_request', { method: 'POST', path: `/api/server/importSave?accountId=${aid}`, body: content, contentType: 'application/json' });
  if (r.status === 200) { toast('已匯入為新存檔'); loadAccounts(); }
  else { let msg = '匯入失敗'; try { msg = JSON.parse(r.body).error || msg; } catch (e) {} toast(msg, 'err'); }
};
window.acctDeleteSave = async (pid) => { if (!confirm(tr('確定刪除存檔 #{id}?', { id: pid }))) return; (await acctPost(`/api/server/deleteSave?playerId=${pid}`)) ? (toast('已刪除存檔'), loadAccounts()) : toast('失敗', 'err'); };
window.acctDeleteAccount = async (aid) => { if (!confirm(tr('確定刪除裝置 #{id} 及其所有存檔?', { id: aid }))) return; (await acctPost(`/api/server/deleteAccount?id=${aid}`)) ? (toast('已刪除裝置'), loadAccounts()) : toast('失敗', 'err'); };
window.acctRename = async (pid) => {
  const name = $('rn_' + pid).value.trim();
  if (!name) return toast('請輸入新名字', 'err');
  const res = await apiForm('POST', '/api/server/renameSave', { playerId: String(pid), name });
  res.status < 400 ? (toast('已改名'), loadAccounts()) : toast('改名失敗', 'err');
};
// 裝置改名(device_bindings.name,上游 /api/server/device/rename,body {device_id,name})
window.renameDevice = async (deviceId) => {
  const name = $('dev_' + deviceId).value.trim();
  const r = await api('POST', '/api/server/device/rename', { device_id: deviceId, name });
  (r.status < 400) ? (toast('已改名'), loadAccounts()) : toast('改名失敗', 'err');
};

// 匯出單一玩家存檔 JSON
window.exportSave = async () => {
  const r = await invoke('api_request', { method: 'GET', path: `/api/player/save?id=${currentPid}` });
  if (r.status !== 200 || !r.body) return toast('匯出失敗', 'err');
  const saved = await invoke('save_text_file', { defaultName: `save_${currentPid}.json`, content: r.body });
  if (saved) toast('已匯出存檔');
};

// 匯入並「覆蓋」目前這個存檔(不可復原)
window.importOverwrite = async () => {
  if (!confirm(tr('用檔案覆蓋存檔 #{id} 的所有資料?此動作無法復原。', { id: currentPid }))) return;
  const f = await invoke('pick_file_any'); if (!f) return;
  let content; try { content = await invoke('read_text_file', { path: f }); } catch (e) { return toast('讀取檔案失敗', 'err'); }
  const r = await invoke('api_request', { method: 'POST', path: `/api/server/importSave?playerId=${currentPid}`, body: content, contentType: 'application/json' });
  if (r.status === 200) { toast('已匯入覆蓋存檔'); openPlayer(currentPid); }
  else { let msg = '匯入失敗'; try { msg = JSON.parse(r.body).error || msg; } catch (e) {} toast(msg, 'err'); }
};

// ====================== log ======================
// 日誌分頁 = 全部;控制頁的即時日誌 = 只 server(排除 [apk] / [cdn])。
// Cap each log panel to the last LOG_CAP lines. Appending a text node + removing the oldest is O(1)
// per line — unlike `textContent += line` (O(n²): re-processes the whole growing string each line),
// which made the UI progressively lag after a day of logs. Bounded nodes → bounded memory too.
const LOG_CAP = 1500;
function appendTo(id, line) {
  const el = $(id);
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.appendChild(document.createTextNode(line + '\n'));
  while (el.childNodes.length > LOG_CAP) el.removeChild(el.firstChild);
  if (atBottom) el.scrollTop = el.scrollHeight; // only autoscroll if the user was already at the bottom
}
function appendLog(line) {
  appendTo('allLogOut', line);
  if (!/^\[apk\]|^\[cdn\]|^\[ipa\]/.test(line)) appendTo('logOut', line);
}
$('clearLog').addEventListener('click', () => ($('logOut').textContent = ''));
$('clearAllLog').addEventListener('click', () => ($('allLogOut').textContent = ''));
$('debugLog').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  try { await invoke('set_debug_log', { enabled }); toast(enabled ? tr('除錯模式已開(日誌寫入 logs 資料夾)') : tr('除錯模式已關(僅畫面顯示)')); }
  catch (err) { toast(tr('切換失敗'), 'err'); e.target.checked = !enabled; }
});
$('openLogDir').addEventListener('click', () => invoke('open_log_dir').catch(() => toast(tr('無法開啟 log 資料夾'), 'err')));
listen('server-log', (e) => appendLog(typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload)));
listen('server-state', (e) => renderStatus(e.payload));

// ====================== init ======================
(async () => {
  try { setLang(localStorage.getItem('lang') || 'tw'); } catch { setLang('tw'); }
  await loadConfig();
  // 首次啟動(host 仍是預設 127.0.0.1)→ 自動偵測本機 IP,
  // 即使使用者手動把 .cdn 貼進去而跳過下載精靈,也會把 IP 設好。
  if (!cfg.host || cfg.host === '127.0.0.1') {
    const ip = await invoke('local_ip');
    if (ip && ip !== '127.0.0.1') {
      cfg = await invoke('save_config', { ui: { host: ip } });
      $('host').value = cfg.host;
    }
  }
  const st = await invoke('server_state');
  renderStatus(st.status);
  await checkFirstRun();
})();
