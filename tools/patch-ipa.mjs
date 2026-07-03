#!/usr/bin/env node
// World Flipper CN iOS (AIR AOT) IPA patcher — the iOS analog of patch-apk.mjs.
//
// iOS is AOT: the AS3 (DevConfig.sdkDummy / DevConfig_gf_ios.apiServer / FileReader)
// is compiled into the native Mach-O, so FFDec -replace can't be used. Instead we
// redirect the client by binary-patching the embedded endpoint URL string CONSTANTS
// in the Mach-O to point at the local server (scheme https->http, host->HOST:PORT),
// in place, null-padded to the original length. This baked-in redirect is the CN
// philosophy (patch the client, no proxy/wireguard).
//
//   https://<x>.leiting.com<path>   ->   http://HOST:PORT<path>\0...   (if it fits)
//
// The game API host is NOT patched directly — it flows from the patched
// update.leiting.com -> version.dis (served locally) -> local apiPath. Login goes to
// the local server's leiting mock. Missing-asset (FileReader) crash is avoided by the
// launcher serving the full CDN, not a code patch.
//
// After patching, the Mach-O signature is invalid — the IPA MUST be re-signed
// (Sideloadly with the user's Apple ID does this on install; it re-hashes the patched
// binary). cryptid=0 (decrypted dump) confirms re-signing is viable.
//
// Usage: node patch-ipa.mjs --ipa=in.ipa --host=192.168.x.x --port=8001 --out=out.ipa
//        node patch-ipa.mjs --bin=worldflipper --host=... --port=... --out=patched.bin   (test mode)

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const HOST = args.host, PORT = args.port, OUT = args.out;
const GUARD_MODE = args['guard-mode'] || 'launch';   // launch|all|none (default: only the launch guard)
const fail = m => { console.log('ERROR ' + m); process.exit(1); };
if (!HOST || !PORT || !OUT || (!args.ipa && !args.bin)) fail('需要 --ipa(或 --bin) --host --port --out');

const HOST_PORT = `${HOST}:${PORT}`;                // e.g. 192.168.68.103:8001
const TARGET = `http://${HOST_PORT}`;               // replacement scheme+authority (e.g. 26 bytes)
const HOST_RE = /https?:\/\/[A-Za-z0-9.-]+\.(?:leiting\.com|roguelike\.com|cl2009\.com)(?::\d+)?/;
// optional whitelist: only redirect URLs whose host contains one of these substrings
const HOSTS = args.hosts ? String(args.hosts).split(',').filter(Boolean) : null;

// Redirect every leiting/roguelike/cl2009 endpoint in the Mach-O by replacing ONLY the
// authority (scheme://host[:port]) in place, padded to the EXACT original authority length.
//
// WHY authority-only + same-length (the load-black fix): the URLs live in two storage forms —
// (a) null-terminated C-strings, and (b) AIR's SEQUENTIAL length-prefixed constant pool, where
// pooled strings sit back-to-back each preceded by a u30 length byte (e.g. update.leiting.com is
// followed immediately by [0x0e]"onQuerySuccess"...). The old patcher SHORTENED the string and
// rewrote buf[off-1]; for a pooled string that shifts everything downstream AND desyncs the
// sequential parser (it then reads the next string's length from the wrong offset) → the whole
// pool corrupts → AIR content-load THROWS → black screen before any network request. The
// buf[off-1] heuristic also false-positives on any preceding data byte that equals the length.
// By overwriting exactly authLen bytes and never shifting/padding/prefix-touching, the pool stays
// byte-for-byte in sync and C-strings are equally valid. Length is preserved via userinfo padding
// (http://0000@host:port/...), which the server ignores and which is safe before a path (so base
// URLs that the client concatenates onto still resolve to host:port).
function patchBuffer(buf) {
  const s = buf.toString('latin1');
  const re = new RegExp(HOST_RE.source, 'g');        // AUTHORITY ONLY — never the greedy path
  let m, patched = 0, skipped = [], seen = new Set();
  while ((m = re.exec(s))) {
    const auth = m[0], off = m.index;
    if (HOSTS && !HOSTS.some(h => auth.includes(h))) continue;   // whitelist: skip non-listed hosts
    const authLen = Buffer.byteLength(auth, 'latin1');
    const deficit = authLen - TARGET.length;         // spare bytes to absorb via userinfo padding
    if (deficit < 0) {                               // target authority longer than original → would shift, skip
      const host = auth.replace(/^https?:\/\//, '');
      if (!seen.has(host)) { skipped.push(`${host} (auth ${authLen} < ${TARGET.length})`); seen.add(host); }
      continue;
    }
    // Build a replacement authority of EXACTLY authLen bytes. deficit==0 → plain TARGET; else pad
    // userinfo: "http://" + (deficit-1 filler) + "@" + HOST_PORT  ⇒ 7 + deficit + len(HOST_PORT) = authLen.
    const paddedAuth = deficit === 0 ? TARGET
      : `http://${'0'.repeat(deficit - 1)}@${HOST_PORT}`;
    Buffer.from(paddedAuth, 'latin1').copy(buf, off);   // overwrite authority in place — same length, nothing shifts
    patched++;
  }
  return { patched, skipped };
}

// Block non-redirectable external hosts (e.g. pv.sohu.com IP-geo lookup — its authority is too
// short to same-length-rewrite to our LAN server). Rewrite the authority to a dead loopback of
// the SAME length → the on-device request gets ECONNREFUSED → the SDK falls back to a default →
// ZERO external traffic leaves the phone. Fully local/offline guarantee.
const BLOCK_RE = /https?:\/\/[A-Za-z0-9.-]+\.sohu\.com(?::\d+)?/;
const DEAD_HOST_PORT = '127.0.0.1:1';              // nothing listens on :1 → fast connection-refused
const DEAD_TARGET = `http://${DEAD_HOST_PORT}`;    // 18 bytes
function patchBlock(buf) {
  const s = buf.toString('latin1');
  const re = new RegExp(BLOCK_RE.source, 'g');
  let m, blocked = 0, hosts = new Set();
  while ((m = re.exec(s))) {
    const auth = m[0], off = m.index, authLen = Buffer.byteLength(auth, 'latin1');
    const deficit = authLen - DEAD_TARGET.length;
    if (deficit < 0) continue;                       // sohu authority is always >= 18
    const padded = deficit === 0 ? DEAD_TARGET : `http://${'0'.repeat(deficit - 1)}@${DEAD_HOST_PORT}`;
    Buffer.from(padded, 'latin1').copy(buf, off);    // same length, nothing shifts
    blocked++; hosts.add(auth.replace(/^https?:\/\//, ''));
  }
  return { blocked, hosts: [...hosts] };
}

// Neutralize the app's deliberate "fatal abort" idiom that crashes a RE-SIGNED build at
// launch (integrity/entitlement guards). Pattern: MOVZ X8,#0 (0xd2800008) then within 3
// words a store to [X8] (writing 0xDEADBEEF to address 0 = intentional crash, since page 0
// is never mapped on iOS). We NOP the store so the abort becomes a no-op and execution
// continues. Only matches stores to a JUST-ZEROED X8 → never touches a legitimate store.
// mode: 'launch' = NOP only the launch-timer guard at file 0xb00c (minimal, proven to keep
//        AIR content-load intact); 'all' = NOP every safe-fall-through abort; 'none' = skip.
function deguardBuffer(buf, mode) {
  if (mode === 'none') return 0;
  if (mode === 'launch') {                    // only the launch guard — avoid disturbing content-load
    if (buf.readUInt32LE(0xb00c) === 0xb9000109) { buf.writeUInt32LE(0xd503201f, 0xb00c); return 1; }
    return 0;
  }
  const NOP = 0xd503201f, RET = 0xd65f03c0; let n = 0, skipped = 0; const len = buf.length & ~3;
  const isStoreToX8 = (w) => (((w >>> 5) & 31) === 8) &&
    [0xB9000000, 0xF9000000, 0x39000000, 0x79000000].includes((w & 0xFFC00000) >>> 0);
  // Only NOP an abort whose fall-through is SAFE: a RET (or unconditional B) appears within a few
  // words after the store. NOPping an abort with code after it would run that code with the bad
  // state the abort guarded against — risking exactly the black-screen we're chasing.
  const safeFallthrough = (strOff) => {
    for (let j = 1; j <= 6; j++) {
      const w = buf.readUInt32LE(strOff + 4 * j);
      if (w === RET) return true;
      if ((w & 0xFC000000) >>> 0 === 0x14000000) return true;   // B (tail branch)
      if ((w >>> 24) === 0xa8 || (w >>> 24) === 0xa9) continue;  // LDP epilogue → keep scanning
    }
    return false;
  };
  for (let o = 0; o + 28 <= len; o += 4) {
    if (buf.readUInt32LE(o) !== 0xd2800008) continue;       // MOVZ X8,#0
    for (let k = 1; k <= 3; k++) {
      const w = buf.readUInt32LE(o + 4 * k);
      if (isStoreToX8(w)) {
        if (safeFallthrough(o + 4 * k)) { buf.writeUInt32LE(NOP, o + 4 * k); n++; }
        else skipped++;
        break;
      }
      if ((w & 31) === 8) break;                            // X8 reloaded → not a null-store
    }
  }
  if (skipped) console.log(`  (skipped ${skipped} abort sites with unsafe fall-through — left intact)`);
  return n;
}

// Suppress the Leiting first-login real-name notice (实名提示 / FirstLoginTipsView).
// LTLoginManager -shouldShowFirstLoginTip is a BOOL predicate gating the notice; force it to
// return NO (mov w0,#0 ; ret) so the SDK skips the notice and continues straight to the game.
// Guarded by the method's prologue signature (stp x22,x21,[sp,#-0x30]! = 0xa9bd57f6) so a
// binary change can't corrupt the wrong site — mismatch => skip, leave bytes intact.
function patchFirstLoginTip(buf) {
  const OFF = 0x6ae0dc;
  if (OFF + 8 > buf.length || buf.readUInt32LE(OFF) !== 0xa9bd57f6) return 0;
  buf.writeUInt32LE(0x52800000, OFF);       // mov w0, #0
  buf.writeUInt32LE(0xd65f03c0, OFF + 4);   // ret
  return 1;
}

// Skip the Leiting login dialog on a FRESH install (no stored credential). The SDK's login
// decision (sub @0x68e7xx) shows the dialog (homeViewWithCallbackCancel:) when the stored token
// is nil / empty / "(null)"; otherwise it takes the auto-login path (checkLogin:callback:), which
// our mock server accepts for any credential. NOP the 3 dialog-jump branches so a fresh launch
// falls through to auto-login → guest login succeeds with no dialog. Verified in-memory: fresh
// state reaches handleLoginSuccess, no dialog, no crash. SAFE for the normal (valid-token) case:
// those branches never fire when a real token exists, so NOPping them changes nothing there.
// Each site is signature-guarded (cbz/cbnz encoding) so a binary change can't corrupt the wrong word.
function patchLoginDialog(buf) {
  const NOP = 0xd503201f;
  const sites = [[0x68e878, 0xb4000820], [0x68e898, 0xb40006a0], [0x68e8d8, 0x35000538]];
  let n = 0;
  for (const [off, want] of sites) {
    if (off + 4 <= buf.length && buf.readUInt32LE(off) === want) { buf.writeUInt32LE(NOP, off); n++; }
  }
  return n;   // 3 = fully applied
}

// Suppress the Leiting post-login welcome banner ("…，欢迎入园。" floating toast that briefly shows
// the masked account name after every login). frida discovery (probe-discover-ui.js) proved the
// banner that ACTUALLY fires is drawn by the INSTANCE method -[LTLoginManager showWelcomeView:]
// (rva 0x6adb14), which dispatches a block that calls +[LTWelcomeView showMoleWelcomeView:] to build
// it. (An earlier attempt patched the same-named CLASS method +[LTWelcomeView showWelcomeView:]
// @0x64b238 — WRONG object, no effect.) All three sites are cosmetic, side-effect-only, and do NOT
// gate progression; each is signature-guarded.
function patchWelcomeBanner(buf) {
  let n = 0;
  // (1) THE real one: stub -[LTLoginManager showWelcomeView:] entry -> return nil (sub sp,#0x50 = 0xd10143ff)
  const MAIN = 0x6adb14;
  if (MAIN + 8 <= buf.length && buf.readUInt32LE(MAIN) === 0xd10143ff) {
    buf.writeUInt32LE(0xd2800000, MAIN);      // mov x0, #0
    buf.writeUInt32LE(0xd65f03c0, MAIN + 4);  // ret
    n++;
  }
  // (2) also stub +[LTWelcomeView showWelcomeView:] (sub sp,#0x1c0 = 0xd10703ff) — a second banner
  // path; harmless defense-in-depth.
  const CLS = 0x64b238;
  if (CLS + 8 <= buf.length && buf.readUInt32LE(CLS) === 0xd10703ff) {
    buf.writeUInt32LE(0xd2800000, CLS);       // mov x0, #0
    buf.writeUInt32LE(0xd65f03c0, CLS + 4);   // ret
    n++;
  }
  // (3) NOP the +[LTWelcomeView showWelcomeView:] call in the login-success path (0x634890).
  const CALL = 0x634890;
  if (CALL + 4 <= buf.length && buf.readUInt32LE(CALL) === 0x9546daf4) {
    buf.writeUInt32LE(0xd503201f, CALL);      // nop
    n++;
  }
  return n;   // 3 = all applied
}

// Skip the Leiting agreement dialogs on first install so the game enters straight away.
// (A) EULA / 使用许可协议 (class ShowProtocolView, shown post-login by -showLicenseView:callbackBean:
//     @0x6c6c78). Its decision at 0x6c6cfc already has a branch to the "already-agreed" skip target
//     0x6c6ddc (which calls the same -showNoticeTip:callbackBean: continuation as the post-agree
//     callback). Force that branch unconditional (tbnz→b) → always take the already-agreed path.
//     DEVICE-VERIFIED: EULA no longer appears, game proceeds.
// (B) 隐私政策 popup (class ProtocolPrivacyPopView, shown first by native AS3-AOT show-funcs
//     @0x68dd30 & @0x698b08 via -initWithType:). Stub both show-funcs to `mov x0,#0 ; ret` so the
//     popup is never built. Both signature-guarded.
function patchAgreementDialogs(buf) {
  let n = 0;
  // (A) EULA gate: 0x6c6cfc tbnz w0,#0,0x6c6ddc (0x37000700) -> b 0x6c6ddc (0x14000038).
  //     Gated behind --agreement while we confirm it isn't what broke the standalone build's
  //     boot networking (ResVer.null / no server requests). Default OFF for a safe working build.
  const EULA = 0x6c6cfc;
  if (PATCH_AGREEMENT && EULA + 4 <= buf.length && buf.readUInt32LE(EULA) === 0x37000700) { buf.writeUInt32LE(0x14000038, EULA); n++; }
  // (B) privacy popup (ProtocolPrivacyPopView). SAFE approach = patch the "should I show privacy?"
  //     GATE predicates to return NO (already-agreed / returning-user path) so the caller never calls
  //     the show-funcs (0x68dd30/0x698b08) — which also register the boot observer/view-stack, so
  //     stubbing THEM broke boot networking. Returning NO from the gate = returning-user behavior
  //     (boots fine). Two BOOL predicates (prologue stp x20,x19,[sp,#-0x20]! = 0xa9be4ff4):
  //     -[LeitingSDK needShowPrivacy]@0x698990 and +[GDPRManage needShowPrivacyProtocolView]@0x60f15c.
  //     Gated behind --privacy until full-flow validated on the STANDALONE build.
  if (PATCH_PRIVACY) {
    for (const off of [0x698990, 0x60f15c]) {
      if (off + 8 <= buf.length && buf.readUInt32LE(off) === 0xa9be4ff4) {
        buf.writeUInt32LE(0x52800000, off);      // mov w0, #0  (return NO)
        buf.writeUInt32LE(0xd65f03c0, off + 4);  // ret
        n++;
      }
    }
  }
  return n;   // 0 = no agreement; 1 = EULA; 3 = EULA + both privacy gates (--privacy)
}
// EULA skip (0x6c6cfc) is DEVICE-VERIFIED SAFE on the standalone build (game enters full-flow),
// so it is default-ON. Pass --agreement=false to disable. Privacy stub stays default-OFF (it broke
// boot networking — see patchAgreementDialogs note).
const PATCH_AGREEMENT = args['agreement'] !== 'false' && args['agreement'] !== false;
// Privacy GATE approach (needShowPrivacy/needShowPrivacyProtocolView -> NO) is DEVICE-VERIFIED SAFE
// on the standalone build (full-flow: no privacy popup, game enters). Default-ON. --privacy=false to disable.
const PATCH_PRIVACY = args['privacy'] !== 'false' && args['privacy'] !== false;

const MACHO_REL = 'Payload/worldflipper.app/worldflipper';

if (args.bin) {
  // test mode: patch a raw extracted Mach-O
  const buf = readFileSync(args.bin);
  const r = patchBuffer(buf);
  const blk = patchBlock(buf);
  const guards = deguardBuffer(buf, GUARD_MODE);
  const tip = patchFirstLoginTip(buf);
  const dlg = patchLoginDialog(buf);
  const wel = patchWelcomeBanner(buf);
  const agr = patchAgreementDialogs(buf);
  if (blk.blocked) console.log(`blocked ${blk.blocked} external request(s) -> dead loopback (zero external): ${blk.hosts.join(', ')}`);
  console.log(tip ? '  suppressed 实名提示 (shouldShowFirstLoginTip -> NO)' : '  [!] 实名提示 patch site signature mismatch — skipped');
  console.log(dlg === 3 ? '  skipped login dialog on fresh install (force auto-login, 3/3 branches NOPed)' : `  [!] login-dialog patch only ${dlg}/3 branches matched — skipped`);
  console.log(wel === 3 ? '  suppressed 欢迎入园 welcome banner (LTLoginManager showWelcomeView: + 2 extra, 3/3)' : `  [!] welcome-banner patch only ${wel}/3 sites matched — skipped`);
  console.log(agr===0 ? '  agreement dialogs LEFT INTACT (default; use --agreement / --privacy to strip)' : ('  skipped 使用许可协议 EULA' + (agr>=3 ? ' + 隐私政策 popup' : '') + ` [${agr} site(s)]`));
  if (args['crash-longjmp'] && buf.readUInt32LE(0x57d834c) === 0xb0005190) { buf.writeUInt32LE(0xd4200000, 0x57d834c); console.log('  [diag] _longjmp stub -> BRK (AS3 throws now crash -> .ips backtrace = throw site)'); }
  writeFileSync(OUT, buf);
  console.log(`patched ${r.patched} URL constants -> ${TARGET}`);
  console.log(`neutralized ${guards} deliberate-abort guards (0xDEADBEEF null-write)`);
  if (r.skipped.length) console.log(`skipped (too long, ${r.skipped.length}): ` + r.skipped.slice(0, 12).join(', '));
  console.log('DONE ' + OUT);
} else {
  // full IPA mode: copy IPA -> jar x the Mach-O -> patch -> jar uf0 back (store).
  // Mirrors patch-apk.mjs (uses the launcher's bundled JDK `jar`). cwd must be the
  // dir holding the relative entry path so jar updates the right entry.
  const { execFileSync } = await import('node:child_process');
  const TOTAL = 4; let step = 0;
  const progress = (label) => console.log(`STEP ${++step}/${TOTAL} ${label}`);
  const RES = args.res || path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'resources');
  const JAR = args.jar || path.join(RES, 'jdk', 'bin', 'jar.exe');
  if (!existsSync(JAR)) fail(`找不到 jar.exe：${JAR}(用 --jar= 指定)`);
  const WORK = args.work || path.join(os.tmpdir(), 'wf-ipa-patch');
  rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true });
  progress('複製 IPA');
  const ipaCopy = path.join(WORK, 'in.ipa');
  copyFileSync(args.ipa, ipaCopy);                                   // ASCII work path
  progress('解出原生二進位');
  const ex = path.join(WORK, 'ex'); mkdirSync(ex, { recursive: true });
  execFileSync(JAR, ['xf', ipaCopy, MACHO_REL], { cwd: ex });
  const binPath = path.join(ex, MACHO_REL);
  if (!existsSync(binPath)) fail('IPA 內找不到 Mach-O：' + MACHO_REL);
  progress('改寫端點 URL + 解除防重簽 guard');
  const buf = readFileSync(binPath);
  const r = patchBuffer(buf);
  const blk = patchBlock(buf);
  const guards = deguardBuffer(buf, GUARD_MODE);
  const tip = patchFirstLoginTip(buf);
  const dlg = patchLoginDialog(buf);
  const wel = patchWelcomeBanner(buf);
  const agr = patchAgreementDialogs(buf);
  if (blk.blocked) console.log(`blocked ${blk.blocked} external request(s) -> dead loopback (zero external): ${blk.hosts.join(', ')}`);
  console.log(tip ? '  suppressed 实名提示 (shouldShowFirstLoginTip -> NO)' : '  [!] 实名提示 patch site signature mismatch — skipped');
  console.log(dlg === 3 ? '  skipped login dialog on fresh install (force auto-login, 3/3 branches NOPed)' : `  [!] login-dialog patch only ${dlg}/3 branches matched — skipped`);
  console.log(wel === 3 ? '  suppressed 欢迎入园 welcome banner (LTLoginManager showWelcomeView: + 2 extra, 3/3)' : `  [!] welcome-banner patch only ${wel}/3 sites matched — skipped`);
  console.log(agr===0 ? '  agreement dialogs LEFT INTACT (default; use --agreement / --privacy to strip)' : ('  skipped 使用许可协议 EULA' + (agr>=3 ? ' + 隐私政策 popup' : '') + ` [${agr} site(s)]`));
  if (args['crash-longjmp'] && buf.readUInt32LE(0x57d834c) === 0xb0005190) { buf.writeUInt32LE(0xd4200000, 0x57d834c); console.log('  [diag] _longjmp stub -> BRK (AS3 throws now crash -> .ips backtrace = throw site)'); }
  writeFileSync(binPath, buf);
  console.log(`patched ${r.patched} URL constants -> ${TARGET}`);
  console.log(`neutralized ${guards} deliberate-abort guards (0xDEADBEEF null-write)`);
  if (r.skipped.length) console.log(`skipped (${r.skipped.length} non-critical, too short): ` + r.skipped.slice(0, 8).join(', '));
  progress('重組 IPA');
  copyFileSync(ipaCopy, OUT);
  execFileSync(JAR, ['uf0', path.resolve(OUT), MACHO_REL], { cwd: ex });  // replace entry, stored
  rmSync(WORK, { recursive: true, force: true });
  console.log(`DONE ${OUT}  (host=${HOST}:${PORT}; 重簽: Sideloadly 用你的 Apple ID 安裝時會重新簽名 patch 後的二進位)`);
}
