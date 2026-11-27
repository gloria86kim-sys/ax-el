/* 미션 02 「내 수업을 다시 쓰다」 */
(() => {
const D = window.M2DATA, CFG = window.SAVE_DKU || {};
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl = v => esc(v).replace(/\n/g, '<br>');
const ls = { get: k => { try { return localStorage.getItem(k) } catch (e) { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} } };
const wsCode = () => ls.get('eq-code') || '';
const eqSt = (() => { try { return JSON.parse(ls.get('eq-st') || '{}') } catch (e) { return {} } })();
const S = { sb: null, uid: null, online: false, isOp: false, crit: [], diag: null, step: 1, busy: '', opTab: 'status', opSel: null, all: [], shares: [], guide: [], roster: [], pub: null, bStep: 0, bCase: 0 };
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 3200) };
const norm = s => String(s || '').replace(/[\s .,;:!?'"“”‘’()\[\]{}<>\-–—_/|·•※]/g, '').toLowerCase();
const today = () => new Date().toLocaleDateString('ko-KR');

/* ---------- 연결 ---------- */
async function connect() {
  if (!CFG.supabaseUrl || !window.supabase) { setNet('서버 설정이 없어 이 기기에만 저장돼요'); return }
  S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { global: { headers: { 'x-ws-code': wsCode() } } });
  try {
    let { data } = await S.sb.auth.getSession();
    if (!data.session) { const r = await S.sb.auth.signInAnonymously(); if (r.error) throw r.error; data = { session: r.data.session } }
    S.uid = data.session.user.id; S.online = true; setNet('서버에 안전하게 저장 중');
    const op = await S.sb.rpc('m2_is_op'); S.isOp = !!op.data;
  } catch (e) { setNet('로그인을 할 수 없어 이 기기에만 저장돼요. 진행자에게 알려 주세요'); console.warn(e) }
}
function setNet(m) { const n = $('#net'); if (n) n.textContent = m }
async function loadCriteria() {
  if (!S.online) return;
  const { data, error } = await S.sb.from('m2_criteria').select('id,data,updated_at');
  if (error) return;
  S.crit = (data || []).map(r => ({ ...r.data, id: r.id, updated_at: r.updated_at })).sort((a, b) => a.id.localeCompare(b.id));
}
const critSetLabel = () => S.crit.length ? `등록 기준 ${S.crit.length}건 (최종 수정 ${new Date(S.crit.map(c => c.updated_at || '').sort().pop() || Date.now()).toLocaleDateString('ko-KR')})` : '기준 미등록';

/* ---------- AI ---------- */
async function ai(prompt, tier = 'default') {
  const fn = CFG.supabaseUrl.replace(/\/$/, '') + '/functions/v1/' + (CFG.aiFunction || 'ai');
  const res = await fetch(fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey, 'x-ws-code': wsCode() }, body: JSON.stringify({ prompt, tier }) });
  if (!res.ok || !res.body) { let b = ''; try { b = await res.text() } catch (e) {} throw new Error(res.status === 403 ? '워크숍 입장 코드가 맞지 않아요' : 'AI 응답 오류 (' + res.status + ') ' + b.slice(0, 120)) }
  const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '', text = '';
  for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue; try { const j = JSON.parse(d); const c = j.choices && j.choices[0]; if (c && c.delta && c.delta.content) text += c.delta.content } catch (e) {} } }
  return text;
}
async function aiJSON(prompt, tier) {
  let last;
  for (let k = 0; k < 2; k++) {
    try { const t = await ai(prompt + (k ? '\n\n[주의] 직전 응답이 JSON으로 읽히지 않았어요. 설명 없이 JSON 객체 하나만 출력해요.' : ''), tier); const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error('JSON 없음'); return JSON.parse(m[0]) } catch (e) { last = e }
  }
  throw last;
}

/* ---------- 저장 ---------- */
let saveT = null;
function blank() { return { stage: 'start', source: null, fileName: '', pages: 0, lines: [], header: '', fields: {}, tables: { T1: [], T2: [], T3: [], T4: [] }, extract: null, questions: [], answers: {}, result: null, comments: [], decisions: {}, versions: [], log: [] } }
async function loadMine() {
  const local = (() => { try { return JSON.parse(ls.get('m2-mine') || 'null') } catch (e) { return null } })();
  if (S.online) {
    const { data } = await S.sb.from('m2_diag').select('data,team,name').eq('uid', S.uid).maybeSingle();
    if (data && data.data && data.data.stage) { S.diag = data.data; S.diag.team = data.team; S.diag.name = data.name; return }
  }
  S.diag = local || blank();
}
function save(now) {
  ls.set('m2-mine', JSON.stringify(S.diag));
  clearTimeout(saveT); saveT = setTimeout(flush, now ? 10 : 900);
}
async function flush() {
  if (!S.online) return;
  const d = S.diag; d.team = d.team || eqSt.team || ''; d.name = d.name || eqSt.me || '';
  const { error } = await S.sb.from('m2_diag').upsert({ uid: S.uid, team: d.team, name: d.name, status: statusOf(d), data: d, updated_at: new Date().toISOString() });
  if (error) { toast('서버 저장에 실패했어요. 입력 내용은 이 기기에 남아 있어요'); console.warn(error) }
}
const statusOf = d => !d || d.stage === 'start' ? '미시작' : d.versions && d.versions.length ? '제출 완료' : d.result ? '결과 생성' : '진단 중';

/* ---------- 문서 모델 ---------- */
const FIELDS = Object.fromEntries(D.FORM.sections.flatMap(s => (s.fields || []).map(([id, n]) => [id, { id, name: n, sec: s.title }])));
const COLS = Object.fromEntries(D.FORM.sections.filter(s => s.table).map(s => [s.table, { sec: s.title, cols: s.cols }]));
function cellName(id) {
  if (id === 'SUPPL') return '과제, 평가 보완 안내(별도)';
  if (FIELDS[id]) return FIELDS[id].name;
  const m = id.match(/^(T\d)\.r(\d+)\.(\w+)$/); if (m) { const t = COLS[m[1]], c = t.cols.find(x => x[0] === m[3]); const row = (S.diag.tables[m[1]] || [])[+m[2]] || {};
    const lbl = m[1] === 'T1' ? `${row.times || +m[2] + 1}차시` : m[1] === 'T2' ? `${row.cat || '순번 ' + (row.no || +m[2] + 1)}` : `${+m[2] + 1}행`;
    return `${t.sec} > ${lbl} > ${c ? c[1].split(' ')[0] : m[3]}` }
  return id;
}
function cellPage(id, d = S.diag) { if (FIELDS[id]) return (d.fields[id] || {}).page; const m = id.match(/^(T\d)\.r(\d+)/); return m ? ((d.tables[m[1]] || [])[+m[2]] || {}).page : null }
function cellVal(id, d = S.diag, ver) {
  if (ver && ver.final && id in ver.final) return ver.final[id];
  if (FIELDS[id]) return (d.fields[id] || {}).v || '';
  const m = id.match(/^(T\d)\.r(\d+)\.(\w+)$/); return m ? (((d.tables[m[1]] || [])[+m[2]] || {})[m[3]] || '') : '';
}
const isEditable = id => id === 'SUPPL' || D.FORM.editable.includes(id) || D.FORM.editable.includes(id.replace(/\.r\d+\./, '.'));
const allText = d => [d.header, ...Object.values(d.fields).map(f => f.v), ...Object.values(d.tables).flat().flatMap(r => Object.values(r))].join(' ');
function cellIds(d = S.diag) {
  const ids = ['F22', 'F23', 'F24', 'F25', 'F26'];
  ['T1', 'T2'].forEach(t => (d.tables[t] || []).forEach((r, i) => COLS[t].cols.forEach(([c]) => ids.push(`${t}.r${i}.${c}`))));
  return ids;
}

/* ---------- 1단계: PDF 읽기 ---------- */
async function readPdf(file) {
  if (!window.pdfjsLib) throw new Error('PDF 도구를 불러오지 못했어요');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p), tc = await page.getTextContent();
    const rows = [];
    tc.items.forEach(it => { if (!it.str || !it.str.trim()) return; const x = it.transform[4], y = it.transform[5];
      let r = rows.find(r => Math.abs(r.y - y) < 3); if (!r) { r = { y, items: [] }; rows.push(r) } r.items.push({ x, s: it.str, w: it.width }) });
    rows.sort((a, b) => b.y - a.y).forEach(r => { r.items.sort((a, b) => a.x - b.x); let t = '', end = null;
      r.items.forEach(i => { if (end !== null && i.x - end > 6) t += '   '; t += i.s; end = i.x + (i.w || 0) }); lines.push({ p, t: t.trim() }) });
  }
  return { pages: pdf.numPages, lines };
}
function formPrompt() {
  return D.FORM.sections.map(s => s.fields ? `[${s.title}] ` + s.fields.map(([id, n]) => `${id}=${n}`).join(', ') : `[${s.title}] 표 ${s.table}: 열 ` + s.cols.map(([k, n]) => `${k}=${n}`).join(', ')).join('\n');
}
async function extract(text, hasPages) {
  const p = `당신은 단국대학교 국문 강의계획서의 내용을 정해진 양식 칸에 옮기는 도우미예요.
[양식 정의: 항목 ID=실제 항목명]
${formPrompt()}
[규칙]
- 값은 아래 원문에 있는 글자를 그대로 옮김. 고쳐 쓰거나 요약하거나 지어내지 않음. 여러 줄은 줄바꿈으로 이어 붙임
- 다른 열의 글자가 같은 줄에 섞여 있으면 해당 열의 글자만 골라 옮김
- 항목명은 있는데 값이 비어 있으면 status "empty", 항목명 자체를 찾지 못하면 status "missing", 값이 있으면 "found"
- ${hasPages ? '각 값의 쪽 번호(page)를 원문 줄 앞의 [p숫자]에서 가져옴' : '쪽 번호는 null'}
- T1은 차시마다 한 행. 한 차시 칸에 여러 수업주제가 있으면 한 행 안에서 줄바꿈으로 이음. 반복된 표 머리글은 행으로 넣지 않음
- T2는 순번, 구분, 비율, 비고를 원문 그대로. "전체" 합계 행은 넣지 않음
- T3은 핵심가치 표. 병합 칸의 값은 해당하는 행마다 반복해서 채움
- header에는 문서 제목 줄(예: 강의계획서 [연도 학기])을 그대로 넣음
[출력] JSON 하나만: {"header":"","fields":{"F01":{"status":"found","value":"","page":1},...F01~F27 모두},"tables":{"T1":[{"times":"","topic":"","goal":"","method":"","assign":"","page":1}],"T2":[{"no":"","cat":"","ratio":"","note":"","page":1}],"T3":[{"value":"","major":"","detail":"","sub":"","def":"","type":"","pct":"","page":1}],"T4":[{"kind":"","title":"","author":"","pub":"","page":1}]}}
[원문]
${text}`;
  return aiJSON(p);
}
function verify(v, hay) {
  const a = norm(v); if (!a) return true; if (hay.includes(a)) return true;
  const seg = 10, parts = []; for (let i = 0; i < a.length; i += seg) parts.push(a.slice(i, i + seg));
  const ok = parts.filter(x => x.length < 4 || hay.includes(x)).length; return ok / parts.length >= 0.8;
}
function applyExtract(j, source, raw) {
  const d = S.diag, hay = norm(raw); d.header = j.header || ''; d.fields = {}; d.extract = { at: new Date().toISOString(), unverified: [] };
  Object.keys(FIELDS).forEach(id => { const f = (j.fields || {})[id] || {}; let st = ['found', 'empty', 'missing'].includes(f.status) ? f.status : 'missing'; const v = st === 'found' ? String(f.value || '') : '';
    let ok = st !== 'found' || verify(v, hay); if (!ok) d.extract.unverified.push(id);
    d.fields[id] = { v, page: f.page || null, status: ok ? st : 'unverified' } });
  ['T1', 'T2', 'T3', 'T4'].forEach(t => { d.tables[t] = (((j.tables || {})[t]) || []).map(r => { const o = { page: r.page || null }; COLS[t].cols.forEach(([c]) => o[c] = String(r[c] ?? ''));
    const bad = COLS[t].cols.some(([c]) => o[c] && !verify(o[c], hay)); if (bad) { o._unverified = true; d.extract.unverified.push(t) } return o }) });
  d.source = source; d.stage = 'extracted';
  const need = ['S3', 'S4', 'S5'], gotS = { S3: ['F24', 'F25'].some(id => d.fields[id].status === 'found'), S4: d.tables.T1.length > 0, S5: d.tables.T2.length > 0 };
  d.extract.full = source === 'pdf' && need.every(s => gotS[s]) && d.fields.F01.status === 'found';
  d.extract.scope = Object.keys(gotS).filter(k => gotS[k]).map(k => D.FORM.sections.find(s => s.id === k).title);
  S.step = 1; save(true);
}

/* ---------- 2단계: 수업 의도 질문 (문서로 확인되지 않는 것만) ---------- */
function buildQuestions() {
  const d = S.diag, t = allText(d), qs = [];
  const exam = (d.tables.T2 || []).some(r => /중간|기말|시험/.test(r.cat) && parseFloat(r.ratio) > 0);
  if (!exam && !/구술|면담|실기|시연|감독|수업\s*중\s*작성/.test(t)) qs.push({ id: 'Q1', topic: '학생의 독립 수행', q: '학생이 AI 없이 혼자 해내는지 확인하는 평가가 있나요?', opts: ['감독하는 시험이 있어요', '구술이나 면담으로 확인해요', '실기나 시연을 직접 봐요', '수업 중에 직접 쓰게 해요', '따로 확인하지 않아요'] });
  if (!/AI|인공지능|생성형|챗GPT|ChatGPT|GPT/i.test(t)) qs.push({ id: 'Q2', topic: 'AI 허용 범위', q: '이 과목에서 학생의 AI 사용을 어디까지 허용하시나요?', opts: ['모든 과제에서 허용하고 사용 내역을 받아요', '일부 과제에서만 허용해요', '모든 평가에서 금지해요'] });
  if (!/구술|면담|질의|디펜스|시연|관찰/.test(t)) qs.push({ id: 'Q3', topic: '수행 확인 방법', q: '제출물을 학생이 직접 했는지 어떻게 확인하시나요?', opts: ['짧은 구술 확인을 해요', '수업 중 과정을 관찰해요', '발표 질의응답으로 확인해요', '따로 확인하지 않아요'] });
  d.questions = qs.slice(0, 3);
}

/* ---------- 3단계: 진단 ---------- */
function docForPrompt(d) {
  return cellIds(d).map(id => { const v = cellVal(id, d); return v ? `<${id}> (${cellName(id)}) ${v.replace(/\s+/g, ' ')}` : `<${id}> (${cellName(id)}) [비어 있음]` }).join('\n');
}
async function diagnose() {
  const d = S.diag;
  if (!S.crit.length) { d.result = computeResult([], d); d.result.noCriteria = true; save(true); return }
  const ans = d.questions.map(q => { const a = d.answers[q.id] || {}; return `${q.id} ${q.topic}: ${a.choice || '응답 없음'}${a.memo ? ' / 메모: ' + a.memo : ''}` }).join('\n') || '질문 없음(문서로 확인됨)';
  const crit = S.crit.map(c => `${c.id} [${D.ELEMENTS.find(e => e.id === c.el).name}] ${c.text} (출처: ${c.doc} ${c.clause}; 관련 칸: ${(c.fields || []).join(', ')})`).join('\n');
  const p = `당신은 대학 강의계획서의 평가 설계를 진단하는 조력자예요. 아래 기준만 써서 판정해요.
[진단 기준]
${crit}
[강의계획서 원문: <칸 ID> (양식 항목명) 내용]
${docForPrompt(d)}
[교수 응답: 강의계획서에 적힌 내용이 아님]
${ans}
[규칙]
- 기준마다 판정 하나: met(충족), partial(부분 충족), unmet(미충족), check(원문을 확인할 수 없거나 근거가 부족), na(이 과목에 해당 없음)
- 판정은 강의계획서에 적힌 글만으로 함. 교수 응답은 판정을 올리는 근거로 쓰지 않음. 교수 응답이 그 기준을 실제로 운영함을 보여 주면 answer를 true로 둠
- refs에는 근거가 된 칸 ID를 넣고, quote에는 그 칸의 원문을 한 글자도 바꾸지 않고 짧게 발췌함. 칸이 비어 있어 미충족이면 quote는 빈 문자열
- 원문 근거 없이 있다고 말하지 않음. 확신이 없으면 check
- partial과 unmet에만 fixes를 줌. 각 fix의 target은 수정 가능한 칸 ID(F22, F24, F25, F26, T1.r숫자.goal, T1.r숫자.method, T1.r숫자.assign, T2.r숫자.note) 중 하나이고, 맞는 칸이 없으면 "SUPPL"
- mode는 replace(칸 내용을 새 문장으로 바꿈) 또는 append(칸 끝에 덧붙임). text는 강의계획서에 바로 넣을 문장(정중한 ~합니다 체, 가운뎃점과 대시 쓰지 않음)
- 여러 칸을 고쳐야 하면 fix를 칸마다 따로 만듦
- missed에는 지금 평가로 확인하기 어려운 학생 수행을 한 줄로 씀(partial, unmet일 때)
- reason은 교수님께 설명하듯 ~해요 체 1~2문장
[출력] JSON 하나만: {"judgments":[{"crit":"E1-01","verdict":"partial","refs":["F24"],"quote":"","answer":false,"reason":"","missed":"","fixes":[{"target":"F26","mode":"append","text":""}]}]}`;
  const j = await aiJSON(p);
  const list = validateJudgments(j.judgments || [], d);
  d.result = computeResult(list, d); d.result.critSet = critSetLabel(); d.result.critIds = S.crit.map(c => c.id + '@' + (c.updated_at || '')); d.result.at = new Date().toISOString();
  d.comments = []; d.decisions = {}; d.stage = 'diagnosed'; save(true);
  try { await makeComments() } catch (e) { d.commentErr = String(e.message || e); save() }
}
function validateJudgments(arr, d) {
  const ids = new Set(cellIds(d)), out = [];
  S.crit.forEach(c => {
    const j = arr.find(x => x && x.crit === c.id) || { verdict: 'check', reason: 'AI가 이 기준을 판정하지 않아 확인 필요로 두었어요.' };
    let v = D.VERDICT[j.verdict] ? j.verdict : 'check'; const refs = (j.refs || []).filter(r => ids.has(r)); let reason = String(j.reason || '');
    const q = String(j.quote || '').trim();
    let qOk = true;
    if (q && !refs.some(r => verify(q, norm(cellVal(r, d))))) { v = 'check'; qOk = false; reason = '원문 근거를 대조하지 못해 확인 필요로 두었어요. ' + reason }
    if (['met', 'partial'].includes(v) && !q) { v = 'check'; reason = '원문 발췌가 없어 확인 필요로 두었어요. ' + reason }
    const fixes = ['partial', 'unmet'].includes(v) ? (j.fixes || []).filter(f => f && f.text && (f.target === 'SUPPL' || (ids.has(f.target) && isEditable(f.target)))).map((f, k) => ({ k: c.id + '#' + k, target: f.target, mode: f.mode === 'replace' ? 'replace' : 'append', text: String(f.text).replace(/[·—–]/g, ', ') })) : [];
    out.push({ crit: c.id, el: c.el, verdict: v, refs, quote: qOk ? q : '', answer: !!j.answer, reason, missed: String(j.missed || ''), fixes, critRef: { doc: c.doc, org: c.org, ver: c.ver, clause: c.clause, cat: c.cat, level: c.level } });
  });
  return out;
}
function computeResult(js, d) {
  const els = D.ELEMENTS.map(e => {
    const mine = js.filter(j => j.el === e.id), judg = mine.filter(j => ['met', 'partial', 'unmet'].includes(j.verdict));
    const got = judg.reduce((a, j) => a + D.VERDICT[j.verdict][1], 0), max = judg.length * 2;
    const score = max ? Math.round(got / max * 100) : null, checks = mine.filter(j => j.verdict === 'check').length;
    const status = !mine.length ? '확인 필요' : !judg.length ? (mine.every(j => j.verdict === 'na') ? '해당 없음' : '확인 필요') : judg.every(j => j.verdict === 'met') ? '충족' : '보완 필요';
    return { id: e.id, name: e.name, score, n: judg.length, checks, status, unmet: judg.filter(j => j.verdict === 'unmet').length, noCrit: !S.crit.some(c => c.el === e.id) };
  });
  const prio = els.filter(e => e.status === '보완 필요').sort((a, b) => (a.score - b.score) || (b.unmet - a.unmet)).slice(0, 2).map(e => e.id);
  return { judgments: js, els, prio };
}
async function makeComments() {
  const d = S.diag, cand = d.result.judgments.filter(j => d.result.prio.includes(j.el) && ['partial', 'unmet'].includes(j.verdict) && j.quote && j.missed).slice(0, 2);
  if (!cand.length) { d.comments = []; save(); return }
  const p = `강의계획서의 평가 문구에서 실제로 드러난 허점을 보고, 그 허점을 이용할 법한 가상의 학생 한마디를 만들어요.
[대상]
${cand.map(j => `${j.crit}: 평가 문구 "${j.quote}" / 확인하기 어려운 학생 수행: ${j.missed}`).join('\n')}
[규칙]
- 대상마다 1개, 가상의 학생 1인칭으로 1~2문장. 평가 문구 속 구체적 허점(분량, 참고문헌 수, 발언 횟수, 형식 충족, 팀 기여, 완성품 외형, AI 사용 내역 체크, 출석 등) 한 가지를 잡음
- 말투는 능청, 자랑, 순진한 척, 억울한 척, 지나치게 논리적인 척 중에서 대상마다 다르게 고르고, 시작 문구도 서로 다르게 씀
- 교수의 능력, 인격, 외모를 놀리지 않고, 실제 학생이 그렇게 했다고 단정하지 않음. 가운뎃점과 대시 쓰지 않음
- 원문과 맞지 않거나 허점이 모호하면 그 대상은 skip을 true로 둠
[말투 예시, 그대로 쓰지 말 것] "히히히, 두 편 읽고 완료했지롱~~ 나머지 여덟 편은 참고문헌 칸에서 열일했어요." / "저도 '동의합니다'를 세 번 말했어요. 참여 점수도 세 번 들어가죠?"
[출력] JSON 하나만: {"comments":[{"crit":"","skip":false,"tone":"","comment":""}]}`;
  const j = await aiJSON(p, 'quick');
  const seen = new Set();
  d.comments = (j.comments || []).filter(c => c && !c.skip && c.comment && cand.some(x => x.crit === c.crit)).filter(c => { const k = c.comment.slice(0, 6); if (seen.has(k) || seen.has(c.tone)) return false; seen.add(k); seen.add(c.tone); return true })
    .slice(0, 2).map(c => { const jd = cand.find(x => x.crit === c.crit); return { crit: c.crit, tone: c.tone, comment: c.comment.replace(/[·—–]/g, ', '), quote: jd.quote, refs: jd.refs, missed: jd.missed, fix: (jd.fixes[0] || {}).k || null } });
  save();
}

/* ---------- 결정과 확정 ---------- */
function finalOf(d, decisions) {
  const final = {}, suppl = [], applied = [];
  d.result.judgments.forEach(j => j.fixes.forEach(f => { const dc = decisions[f.k]; if (!dc || dc.mode === 'keep') return;
    const text = dc.mode === 'edit' ? (dc.text || '').trim() : f.text; if (!text) return;
    if (f.target === 'SUPPL') { suppl.push(text); applied.push({ k: f.k, crit: j.crit, el: j.el, target: 'SUPPL', before: '', after: text, reason: j.reason, missed: j.missed, critRef: j.critRef }); return }
    const before = final[f.target] ?? cellVal(f.target, d);
    const after = f.mode === 'replace' && dc.mode !== 'edit' ? text : dc.mode === 'edit' && dc.replace ? text : (before ? before.replace(/\s+$/, '') + '\n' + text : text);
    final[f.target] = after; applied.push({ k: f.k, crit: j.crit, el: j.el, target: f.target, before: cellVal(f.target, d), after, add: text, reason: j.reason, missed: j.missed, critRef: j.critRef }) }));
  return { final, suppl, applied };
}
function confirmVersion() {
  const d = S.diag, f = finalOf(d, d.decisions);
  const v = { v: (d.versions.length ? d.versions[d.versions.length - 1].v : 0) + 1, at: new Date().toISOString(), decisions: JSON.parse(JSON.stringify(d.decisions)), ...f, critSet: d.result.critSet, scores: d.result.els.map(e => ({ id: e.id, score: e.score, status: e.status, n: e.n, checks: e.checks })) };
  d.versions.push(v); d.stage = 'confirmed'; save(true); return v;
}

/* ---------- 공유 (익명) ---------- */
function anon(t, d = S.diag) {
  let s = String(t || ''); [cellVal('F01', d), cellVal('F14', d), cellVal('F20', d), cellVal('F03', d), cellVal('F17', d), d.name].filter(x => x && x.trim().length >= 2).forEach(w => { s = s.split(w.trim()).join('○○') });
  return s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '○○').replace(/\d{2,4}-\d{3,4}-\d{4}/g, '○○');
}
function sharePayload(a, d = S.diag) {
  const c = d.comments.find(x => x.crit === a.crit);
  return { team: d.team || '', element: D.ELEMENTS.find(e => e.id === a.el).name, item: a.target === 'SUPPL' ? '과제, 평가 보완 안내(별도)' : cellName(a.target).replace(/\d+차시/, '○차시'), formVer: D.FORM.ver,
    before: anon(a.before), comment: c ? anon(c.comment) : '', missed: anon(a.missed), after: anon(a.after), reason: anon(a.reason), condition: (a.critRef || {}).cond || '', crit: `${(a.critRef || {}).doc || ''} ${(a.critRef || {}).clause || ''} (${(a.critRef || {}).ver || ''})` };
}
async function share(kind, a, v) {
  if (!S.online) { toast('서버에 연결되지 않아 공유할 수 없어요'); return }
  const { error } = await S.sb.from('m2_shares').insert({ kind, ver: v.v, item_key: a.k, payload: sharePayload(a) });
  if (error && !/duplicate/.test(error.message)) { toast('공유하지 못했어요: ' + error.message); return }
  S.diag.shared = S.diag.shared || {}; S.diag.shared[`${kind}:${v.v}:${a.k}`] = true; save(); toast(kind === 'brief' ? '브리핑 후보로 공유했어요' : '가이드북 사례로 공유했어요'); render();
}

/* ---------- PDF (인쇄용 HTML) ---------- */
const PRINT_CSS = `@page{size:letter portrait;margin:13mm 11mm 14mm}*{box-sizing:border-box}body{margin:0;font:9.5pt/1.55 'Noto Sans KR',sans-serif;color:#222}
h1{font-size:15pt;margin:0 0 4mm;padding-left:3mm;border-left:4px solid #3b5aa8}h2{font-size:10.5pt;margin:6mm 0 2mm;padding-left:2.5mm;border-left:3px solid #3b5aa8;break-after:avoid;page-break-after:avoid}h2+table tr:first-child,h2+table thead{break-before:avoid}
.badge{display:inline-block;border:1px solid #c0392b;color:#c0392b;border-radius:3px;padding:0 6px;font-size:8.5pt;font-weight:700;margin-left:6px;vertical-align:middle}
.meta{font-size:8.5pt;color:#555;margin:-2mm 0 3mm}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:2mm}thead{display:table-header-group}
th,td{border:1px solid #c9ccd3;padding:4px 6px;vertical-align:top;text-align:left;word-break:keep-all;overflow-wrap:anywhere}th,.lb{background:#eef0f4;font-weight:500;color:#333}
tr{break-inside:avoid}.c{text-align:center}.pre{white-space:pre-wrap}.st{font-weight:700}.foot{margin-top:6mm;font-size:8pt;color:#666}`;
function printDoc(title, body) {
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet"><style>${PRINT_CSS}</style></head><body>${body}<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))<\/script></body></html>`;
  const w = window.open('', '_blank'); if (!w) { toast('팝업이 막혀 있어요. 브라우저에서 팝업을 허용해 주세요'); return html }
  w.document.open(); w.document.write(html); w.document.close(); return html;
}
function pdfA(d, v) {
  const r = d.result, dec = v.decisions;
  const rows = r.judgments.map(j => { const c = S.crit.find(x => x.id === j.crit) || j.critRef || {};
    const fx = j.fixes.map(f => { const dc = dec[f.k] || {}; const m = dc.mode === 'apply' ? '반영' : dc.mode === 'edit' ? '직접 수정' : '유지'; const t = dc.mode === 'edit' ? dc.text : dc.mode === 'apply' ? f.text : ''; return `${esc(cellName(f.target))}: <b>${m}</b>${t ? '<br>' + nl(t) : ''}` }).join('<hr style="border:0;border-top:1px dashed #ccc">');
    return `<tr><td>${esc(D.ELEMENTS.find(e => e.id === j.el).name)}<br><small>${esc(j.crit)}</small></td><td class="st">${esc(D.VERDICT[j.verdict][0])}</td><td>${j.refs.map(x => esc(cellName(x)) + (cellPage(x, d) ? ` (${cellPage(x, d)}쪽)` : '')).join('<br>') || '-'}</td><td class="pre">${esc(j.quote || '-')}</td><td>${esc(j.reason)}<br><small>${esc((c.doc || '') + ' ' + (c.clause || ''))}</small></td><td>${fx || '-'}</td></tr>` }).join('');
  const body = `<h1>진단, 보완표 <span class="badge">워크숍 진단</span></h1><p class="meta">과목명 ${esc(cellVal('F01', d) || '미확인')} | 진단일 ${new Date(r.at || Date.now()).toLocaleDateString('ko-KR')} | 확정 버전 v${v.v} (${new Date(v.at).toLocaleString('ko-KR')}) | 사용 기준: ${esc(v.critSet || r.critSet || '')} | 양식: ${esc(D.FORM.name)} ${esc(D.FORM.ver)}</p>
<h2>요소별 상태와 워크숍 진단 점수</h2><table><thead><tr><th>진단 요소</th><th>상태</th><th class="c">점수</th><th class="c">판정 건수</th><th class="c">확인 필요</th><th>연결된 양식 항목</th></tr></thead><tbody>${v.scores.map(s => { const e = D.ELEMENTS.find(x => x.id === s.id); return `<tr><td>${esc(e.name)}</td><td>${esc(s.status)}</td><td class="c">${s.score == null ? '산정 보류' : s.score}</td><td class="c">${s.n}</td><td class="c">${s.checks}</td><td>${e.links.map(l => esc(l[1])).join(', ')}${e.noField ? '<br><small>전용 입력란 없음</small>' : ''}</td></tr>` }).join('')}</tbody></table>
<p class="meta">점수 산식: 판정 가능한 기준마다 충족 2점, 부분 충족 1점, 미충족 0점. 요소 점수 = 획득점 / 최대점 × 100. 확인 필요, 해당 없음, 기준 미등록은 제외.</p>
<h2>항목별 진단과 확정 내용</h2><table><thead><tr><th style="width:11%">요소</th><th style="width:8%">판정</th><th style="width:16%">양식 항목(쪽)</th><th style="width:21%">원문 발췌</th><th style="width:22%">보완 이유와 기준</th><th style="width:22%">교수 최종 선택</th></tr></thead><tbody>${rows}</tbody></table>
<p class="foot">AX-EL Co-Define 워크숍 산출물. 교무시스템에 반영된 공식 문서가 아니에요.</p>`;
  return printDoc('진단 보완표', body);
}
function pdfB(d, v) {
  const val = id => cellVal(id, d, v), F = id => nl(val(id));
  const full = d.extract && d.extract.full, title = full ? '단국대학교 강의계획서 수정안' : '강의계획서 보완본';
  const grid = (pairs) => { let h = ''; for (let i = 0; i < pairs.length; i += 2) { const a = pairs[i], b = pairs[i + 1]; h += `<tr><td class="lb" style="width:18%">${esc(FIELDS[a].name)}</td><td style="width:32%">${F(a)}</td>${b ? `<td class="lb" style="width:18%">${esc(FIELDS[b].name)}</td><td style="width:32%">${F(b)}</td>` : '<td colspan="2"></td>'}</tr>` } return h };
  const tbl = (t, rows, w) => `<table><thead><tr>${COLS[t].cols.map(([c, n], i) => `<th class="c"${w ? ` style="width:${w[i]}%"` : ''}>${esc(n)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr>${COLS[t].cols.map(([c]) => `<td class="pre${['times', 'no', 'ratio', 'pct', 'type'].includes(c) ? ' c' : ''}">${esc(cellVal(`${t}.r${i}.${c}`, d, v))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const sec = id => D.FORM.sections.find(s => s.id === id).title;
  let body = `<h1>${title} <span class="badge">워크숍 수정안</span></h1><p class="meta">원본: ${esc(d.header || '강의계획서')} | 확정 버전 v${v.v} (${new Date(v.at).toLocaleDateString('ko-KR')}) | 교무시스템에 반영된 공식 강의계획서가 아니에요</p>`;
  if (!full) body += `<p class="meta"><b>포함 범위</b>: ${esc((d.extract && d.extract.scope || []).join(', ') || '확인된 항목')}. ${d.source === 'paste' ? '붙여넣기로 작업한 내용이에요.' : '일부 항목만 추출된 문서예요.'} 아래에 없는 항목은 원본 강의계획서를 따릅니다.</p>`;
  const has = id => (d.fields[id] || {}).status === 'found' || (v.final && id in v.final);
  if (full || ['F01', 'F02', 'F03'].some(has)) body += `<h2>${esc(sec('S1'))}</h2><table><tbody>${grid(['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09', 'F10', 'F11', 'F12', 'F13'])}</tbody></table>`;
  if (full || has('F14')) body += `<h2>${esc(sec('S2'))}</h2><table><tbody>${grid(['F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21'])}</tbody></table>`;
  if (full || ['F22', 'F24', 'F25'].some(has)) body += `<h2>${esc(sec('S3'))}</h2><table><tbody>${['F22', 'F23', 'F24', 'F25'].filter(id => full || has(id)).map(id => `<tr><td class="lb" style="width:18%">${esc(FIELDS[id].name)}</td><td class="pre">${esc(val(id))}</td></tr>`).join('')}</tbody></table>`;
  if (d.tables.T1.length) body += `<h2>${esc(sec('S4'))}</h2>` + tbl('T1', d.tables.T1, [8, 24, 24, 22, 22]);
  if (d.tables.T2.length) { const sum = d.tables.T2.reduce((a, r) => a + (parseFloat(r.ratio) || 0), 0); body += `<h2>${esc(sec('S5'))}</h2>` + tbl('T2', d.tables.T2, [10, 22, 12, 56]).replace('</tbody>', `<tr><td></td><td class="c lb">전체</td><td class="c lb">${sum}%</td><td></td></tr></tbody>`) }
  if (d.tables.T3.length) body += `<h2>${esc(sec('S6'))}</h2>` + tbl('T3', d.tables.T3, [11, 14, 14, 16, 27, 9, 9]);
  if (d.tables.T4.length) body += `<h2>${esc(sec('S7'))}</h2>` + tbl('T4', d.tables.T4, [12, 44, 22, 22]);
  if (full || has('F26')) body += `<h2>${esc(sec('S8'))}</h2><table><tbody><tr><td class="pre">${esc(val('F26'))}</td></tr></tbody></table>`;
  if (full || has('F27')) body += `<h2>${esc(sec('S9'))}</h2><table><tbody><tr><td class="pre">${esc(val('F27'))}</td></tr></tbody></table>`;
  if (v.suppl && v.suppl.length) body += `<h2>과제, 평가 보완 안내 (워크숍에서 추가, 원본 양식에 없는 항목)</h2><table><tbody>${v.suppl.map(t => `<tr><td class="pre">${esc(t)}</td></tr>`).join('')}</tbody></table>`;
  return printDoc(title, body);
}

/* ---------- 집계 (운영자) ---------- */
function aggregate(diags, rosterN) {
  const done = diags.filter(x => statusOf(x.data) === '제출 완료');
  const pick = x => { const v = x.data.versions && x.data.versions[x.data.versions.length - 1]; return v ? v.scores : (x.data.result ? x.data.result.els : []) };
  const per = D.ELEMENTS.map(e => { const sc = done.map(x => (pick(x).find(s => s.id === e.id) || {})).filter(s => s.score != null); const checks = done.reduce((a, x) => a + ((pick(x).find(s => s.id === e.id) || {}).checks || 0), 0);
    return { id: e.id, name: e.name, avg: sc.length ? Math.round(sc.reduce((a, s) => a + s.score, 0) / sc.length) : null, n: sc.length, checks } });
  const teams = Object.keys(D.TEAMS).map(t => { const ds = done.filter(x => x.team === t); const els = D.ELEMENTS.map(e => { const sc = ds.map(x => (pick(x).find(s => s.id === e.id) || {})).filter(s => s.score != null); return { id: e.id, name: e.name, avg: sc.length ? Math.round(sc.reduce((a, s) => a + s.score, 0) / sc.length) : null, n: sc.length } }).filter(e => e.avg != null);
    const srt = [...els].sort((a, b) => b.avg - a.avg); return { team: t, n: ds.length, strong: srt[0] || null, weak: srt.length > 1 ? srt[srt.length - 1] : null } });
  return { total: rosterN || diags.length, done: done.length, started: diags.filter(x => statusOf(x.data) !== '미시작').length, per, teams };
}

/* ---------- 화면 ---------- */
const route = () => (location.hash || '#prof').slice(1);
function shell(inner) { $('#app').innerHTML = inner }
function render() {
  const r = route(); $$('.tabs a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + r));
  if (r === 'op') return renderOp(); if (r === 'brief') return renderBrief(); return renderProf();
}
function stepper() { const d = S.diag; const names = ['강의계획서 불러오기', '수업 의도 확인하기', '내 수업 평가 성적표'];
  return `<ol class="steps">${names.map((n, i) => `<li class="${S.step === i + 1 ? 'on' : ''} ${i + 1 < S.step ? 'done' : ''}"><button data-a="step" data-s="${i + 1}" ${i + 1 > maxStep() ? 'disabled' : ''}><b>${i + 1}단계</b>${n}</button></li>`).join('')}</ol>` }
const maxStep = () => { const d = S.diag; return d.result ? 3 : d.stage === 'extracted' ? 2 : 1 };
function renderProf() {
  const d = S.diag; if (!d) return shell('<p class="note">불러오는 중이에요</p>');
  let h = `<section class="hero2"><p class="kick">MISSION 02</p><h1>내 수업을 다시 쓰다</h1><p>강의계획서 한 과목을 진단하고, 고칠 문구까지 받아 가요. 결과는 교수님만 볼 수 있고, 공유를 누른 사례만 익명으로 운영자에게 전달돼요.</p>
  <div class="who"><label>성함 <input id="pname" value="${esc(d.name || eqSt.me || '')}" placeholder="교수님 성함"></label><label>스쿼드 <select id="pteam">${Object.entries(D.TEAMS).map(([k, n]) => `<option value="${k}" ${(d.team || eqSt.team) === k ? 'selected' : ''}>${k} ${esc(n)}</option>`).join('')}</select></label></div></section>${stepper()}`;
  if (S.busy) h += `<div class="busy"><span class="spin"></span>${esc(S.busy)}</div>`;
  if (S.step === 1) h += step1(); else if (S.step === 2) h += step2(); else h += step3();
  shell(h);
}
function badge(st) { const m = { found: ['추출됨', 'ok'], empty: ['원본 확인, 값 없음', 'mu'], missing: ['추출 안 됨', 'warn'], unverified: ['원문 대조 필요', 'warn'] }[st] || ['', '']; return `<span class="bd ${m[1]}">${m[0]}</span>` }
function step1() {
  const d = S.diag;
  let h = `<section class="card"><h2>1단계 강의계획서 불러오기</h2><p class="sub">PDF 1개를 올리거나 내용을 붙여 넣어 주세요. 읽어 낸 내용을 단국대 양식 순서대로 보여 드려요.</p>
  <div class="up"><label class="btn">PDF 올리기<input type="file" id="pdf" accept="application/pdf" hidden></label><button class="ghost" data-a="pastebox">텍스트 붙여넣기</button></div>
  <div id="pastewrap" ${d._paste ? '' : 'hidden'}><textarea id="paste" rows="8" placeholder="강의계획서 내용을 붙여 넣어 주세요"></textarea><button class="btn" data-a="pastego">붙여넣은 내용 읽기</button></div>
  ${d.readErr ? `<div class="warnbox"><b>PDF를 읽지 못했어요.</b> ${esc(d.readErr)}<br><button class="ghost s" data-a="pastebox">텍스트 붙여넣기로 진행하기</button></div>` : ''}
  ${d.extractErr ? `<div class="warnbox"><b>내용을 정리하지 못했어요.</b> ${esc(d.extractErr)} 읽어 온 원문은 남아 있어요. <button class="ghost s" data-a="reextract">다시 시도</button></div>` : ''}</section>`;
  if (d.stage !== 'start' && d.extract) {
    const miss = Object.entries(d.fields).filter(([id, f]) => ['missing', 'unverified'].includes(f.status) && ['F01', 'F22', 'F24', 'F25', 'F26'].includes(id));
    h += `<section class="card"><h2>추출 내용 확인 <small class="note">${esc(d.fileName || (d.source === 'paste' ? '붙여넣기' : ''))}${d.pages ? ', ' + d.pages + '쪽' : ''}</small></h2>
    <p class="sub">${d.extract.full ? '전체 문서를 확인했어요. 틀린 곳이 있으면 해당 칸에서 바로 고쳐 주세요.' : '전체 문서가 확보되지 않았어요. 수정본은 「강의계획서 보완본」으로 나가요.'}${miss.length ? ` 확인이 필요한 항목이 ${miss.length}개 있어요: ${miss.map(([id]) => esc(FIELDS[id].name)).join(', ')}` : ''}</p>`;
    D.FORM.sections.forEach(s => {
      h += `<h3 class="sec">${esc(s.title)}</h3>`;
      if (s.fields) h += `<div class="fgrid ${s.kind}">${s.fields.map(([id, n]) => { const f = d.fields[id] || { status: 'missing', v: '' }; const long = s.kind === 'rows';
        return `<label class="fd ${long ? 'long' : ''}"><span>${esc(n)} ${badge(f.status)} ${f.page ? `<small>${f.page}쪽</small>` : ''}</span>${long ? `<textarea data-f="${id}" rows="3">${esc(f.v)}</textarea>` : `<input data-f="${id}" value="${esc(f.v)}">`}</label>` }).join('')}</div>`;
      else { const rows = d.tables[s.table] || []; h += rows.length ? `<div class="scroll"><table class="et"><thead><tr>${s.cols.map(([, n]) => `<th>${esc(n)}</th>`).join('')}<th>쪽</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r._unverified ? 'uv' : ''}">${s.cols.map(([c]) => `<td><textarea data-t="${s.table}.${i}.${c}" rows="2">${esc(r[c])}</textarea></td>`).join('')}<td class="c">${r.page || '-'}</td></tr>`).join('')}</tbody></table></div>${rows.some(r => r._unverified) ? '<p class="note warn">주황 줄은 원문과 대조되지 않았어요. 확인해 주세요.</p>' : ''}` : `<p class="note">${badge('missing')} 이 표를 찾지 못했어요. 필요하면 붙여넣기로 다시 읽어 주세요.</p>` }
    });
    h += `<div class="act"><button class="btn big" data-a="toq">추출 내용 확인 완료</button></div></section>`;
  }
  return h;
}
function step2() {
  const d = S.diag;
  let h = `<section class="card"><h2>2단계 수업 의도 확인하기</h2><p class="sub">강의계획서만으로 확인되지 않은 것만 여쭤봐요. 답은 강의계획서 기재 내용과 따로 저장돼요.</p>`;
  if (!d.questions.length) h += `<p>강의계획서에서 독립 수행, AI 허용 범위, 수행 확인 방법을 모두 확인했어요. 바로 진단할게요.</p>`;
  d.questions.forEach(q => { const a = d.answers[q.id] || {}; h += `<div class="q"><p class="qt"><span class="pill">${esc(q.topic)}</span> ${esc(q.q)}</p><div class="opts">${[...q.opts, '아직 정하지 않았어요'].map(o => `<button class="opt ${a.choice === o ? 'on' : ''}" data-a="ans" data-q="${q.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div><input data-memo="${q.id}" value="${esc(a.memo || '')}" placeholder="덧붙일 말(선택)"></div>` });
  h += `<div class="act"><button class="ghost" data-a="step" data-s="1">이전</button><button class="btn big" data-a="diag" ${S.busy ? 'disabled' : ''}>진단하기</button></div>${d.diagErr ? `<div class="warnbox">진단하지 못했어요. ${esc(d.diagErr)} 입력하신 내용은 그대로 있어요. <button class="ghost s" data-a="diag">다시 시도</button></div>` : ''}</section>`;
  return h;
}
function step3() {
  const d = S.diag, r = d.result; if (!r) return '<p class="note">진단 결과가 없어요</p>';
  const ver = d.versions[d.versions.length - 1];
  let h = `<section class="card"><h2>3단계 내 수업 평가 성적표 <span class="pill">워크숍 진단 점수</span></h2><p class="sub">${esc(cellVal('F01') || '과목명 미확인')} | 사용 기준: ${esc(r.critSet || critSetLabel())}${r.noCriteria ? ' | 운영자가 아직 기준을 등록하지 않아 판정하지 않았어요' : ''}</p>
  <div class="els">${r.els.map(e => `<div class="el" style="--c:${D.STATUS_COLOR[e.score == null && e.status !== '해당 없음' ? '산정 보류' : e.status]}"><span class="eln">${esc(e.name)}</span><b>${e.score == null ? '산정 보류' : e.score + '점'}</b><span class="st">${e.noCrit ? '기준 미등록' : esc(e.status)}</span><small>판정 ${e.n}건, 확인 필요 ${e.checks}건</small></div>`).join('')}</div>
  ${r.prio.length ? `<div class="prio"><b>우선 보완 2개</b> ${r.prio.map((id, i) => `<span class="pill on">${i + 1}. ${esc(D.ELEMENTS.find(e => e.id === id).name)}</span>`).join('')}</div>` : ''}
  <p class="note">점수 = 판정 가능한 기준에서 얻은 점수 / 최대점 × 100 (충족 2, 부분 충족 1, 미충족 0). 확인 필요, 해당 없음, 기준 미등록은 빼고 계산해요.</p></section>`;
  if (d.comments.length) h += `<section class="card says"><h2>"AI 시대, 학생들은 이렇게 말해요"</h2>${d.comments.map(c => `<figure><blockquote>${esc(c.comment)}</blockquote><figcaption>원문: "${esc(c.quote)}" | 놓친 수행: ${esc(c.missed)}</figcaption></figure>`).join('')}<p class="note">AI가 상상한 가상의 학생이에요. 실제 학생의 행동이 아니에요.</p></section>`;
  D.ELEMENTS.forEach(e => { const js = r.judgments.filter(j => j.el === e.id); if (!js.length) return;
    h += `<section class="card"><h2>${esc(e.name)} <small class="note">연결 양식 항목: ${e.links.map(l => esc(l[1])).join(', ')}${e.noField ? ' (전용 입력란 없음)' : ''}</small></h2>`;
    js.forEach(j => { const c = j.critRef;
      h += `<article class="jd"><div class="jh"><span class="vd v-${j.verdict}">${esc(D.VERDICT[j.verdict][0])}</span><b>${esc((S.crit.find(x => x.id === j.crit) || {}).text || j.crit)}</b></div>
      <dl><dt>양식 항목과 위치</dt><dd>${j.refs.map(x => `${esc(cellName(x))}${cellPage(x) ? ` (${cellPage(x)}쪽)` : ''}`).join(', ') || '연결된 원문 없음'}</dd>
      <dt>원문</dt><dd class="pre">${j.quote ? esc(j.quote) : '<span class="note">원문 발췌 없음</span>'}</dd>
      <dt>기준 출처</dt><dd><span class="cat cat-${c.cat}">${esc(D.CAT[c.cat] || '')}</span> ${esc(c.doc)} ${esc(c.clause)} | ${esc(c.ver)} | ${esc(c.level || '권고')}</dd>
      <dt>진단 이유</dt><dd>${esc(j.reason)}${j.answer ? '<br><span class="tag">운영 기준은 확인됨, 강의계획서에 명시 필요</span>' : ''}</dd>${j.missed ? `<dt>놓친 수행</dt><dd>${esc(j.missed)}</dd>` : ''}</dl>`;
      j.fixes.forEach(f => { const dc = d.decisions[f.k] || {}; const before = cellVal(f.target);
        h += `<div class="fx"><p class="fxh">수정 제안: <b>${esc(cellName(f.target))}</b> ${f.mode === 'replace' ? '(바꾸기)' : '(덧붙이기)'}</p>${f.target !== 'SUPPL' ? `<p class="bf"><small>지금</small> ${nl(before) || '<span class="note">비어 있음</span>'}</p>` : '<p class="note">원본 양식에 맞는 칸이 없어 별도 「과제, 평가 보완 안내」에 담는 제안이에요.</p>'}
        <p class="af"><small>제안</small> ${nl(f.text)}</p><div class="dec">${[['apply', '반영'], ['edit', '직접 수정'], ['keep', '유지']].map(([m, l]) => `<button class="db ${dc.mode === m ? 'on' : ''}" data-a="dec" data-k="${esc(f.k)}" data-m="${m}">${l}</button>`).join('')}</div>
        ${dc.mode === 'edit' ? `<textarea data-edit="${esc(f.k)}" rows="3">${esc(dc.text ?? f.text)}</textarea>${f.target !== 'SUPPL' ? `<label class="note"><input type="checkbox" data-repl="${esc(f.k)}" ${dc.replace ? 'checked' : ''}> 칸 내용 전체를 이 문장으로 바꾸기(체크하지 않으면 덧붙여요)</label>` : ''}` : ''}</div>` });
      h += `</article>` });
    h += `</section>` });
  const pending = r.judgments.flatMap(j => j.fixes).filter(f => !d.decisions[f.k]).length;
  h += `<section class="card"><h2>확정과 내려받기</h2><p class="sub">${pending ? `아직 선택하지 않은 제안이 ${pending}개 있어요. 선택하지 않은 제안은 유지로 저장돼요.` : '모든 제안을 골랐어요.'}</p>
  <div class="act"><button class="btn big" data-a="confirm">수정 확정</button>${ver ? `<button class="ghost" data-a="pdfA">진단, 보완표 PDF</button><button class="ghost" data-a="pdfB">${d.extract && d.extract.full ? '수정 강의계획서' : '강의계획서 보완본'} PDF</button>` : ''}</div>
  ${ver ? `<p class="note">확정 버전 v${ver.v} (${new Date(ver.at).toLocaleString('ko-KR')}). PDF는 이 버전으로 만들어요. 인쇄 창에서 'PDF로 저장'을 골라 주세요.</p>` : ''}</section>`;
  if (ver && ver.applied.length) h += `<section class="card"><h2>사례 공유 <small class="note">선택</small></h2><p class="sub">공유는 수정마다 따로 골라요. 이름, 과목명, 연락처를 지운 익명 문구만 전달돼요. 먼저 공개될 문구를 확인해 주세요.</p>
  ${ver.applied.map(a => { const p = sharePayload(a); const sb = d.shared && d.shared[`brief:${ver.v}:${a.k}`], sg = d.shared && d.shared[`guide:${ver.v}:${a.k}`];
    return `<details class="sh"><summary>${esc(p.element)} | ${esc(p.item)}</summary><dl><dt>기존 문구</dt><dd class="pre">${esc(p.before || '(없음)')}</dd>${p.comment ? `<dt>학생의 한마디</dt><dd>${esc(p.comment)}</dd>` : ''}<dt>놓친 수행</dt><dd>${esc(p.missed)}</dd><dt>확정 문구</dt><dd class="pre">${esc(p.after)}</dd></dl>
    <div class="act"><button class="ghost s" data-a="share" data-kind="brief" data-k="${esc(a.k)}" ${sb ? 'disabled' : ''}>${sb ? '브리핑 공유됨' : '브리핑 공유'}</button><button class="ghost s" data-a="share" data-kind="guide" data-k="${esc(a.k)}" ${sg ? 'disabled' : ''}>${sg ? '가이드북 공유됨' : '가이드북 사례 공유'}</button></div></details>` }).join('')}</section>`;
  return h;
}

/* ---------- 운영자 ---------- */
async function opLoad() {
  const [a, b, c, g, p] = await Promise.all([S.sb.from('m2_diag').select('uid,team,name,status,data,updated_at'), S.sb.from('m2_roster').select('*'), S.sb.from('m2_shares').select('*').order('at'), S.sb.from('m2_guide').select('*'), S.sb.from('m2_public').select('*').eq('id', 'brief').maybeSingle()]);
  S.all = a.data || []; S.roster = b.data || []; S.shares = c.data || []; S.guide = g.data || []; S.pub = p.data ? p.data.data : null;
}
async function renderOp() {
  if (!S.online) return shell('<section class="card"><h2>운영자</h2><p>서버에 연결되지 않았어요.</p></section>');
  if (!S.isOp) return shell(`<section class="card narrow"><h2>운영자 확인</h2><p class="sub">운영자 코드를 입력하면 이 기기가 운영자로 등록돼요.</p><input id="opcode" type="password" placeholder="운영자 코드"><div class="act"><button class="btn" data-a="opclaim">확인</button></div></section>`);
  await Promise.all([opLoad(), loadCriteria()]);
  const tabs = [['status', '진행 현황'], ['crit', '기준 관리'], ['brief', '브리핑 준비'], ['guide', '가이드북 후보']];
  let h = `<section class="hero2 op"><p class="kick">OPERATOR</p><h1>미션 02 운영자 화면</h1><div class="opt-tabs">${tabs.map(([k, n]) => `<button class="${S.opTab === k ? 'on' : ''}" data-a="optab" data-t="${k}">${n}</button>`).join('')}<button data-a="opref">새로고침</button><a class="ghost s" href="#brief" target="_blank">브리핑 화면 열기</a></div></section>`;
  if (S.opTab === 'status') h += opStatus(); else if (S.opTab === 'crit') h += opCrit(); else if (S.opTab === 'brief') h += opBrief(); else h += opGuide();
  shell(h);
}
function scoresOf(x) { const v = x.data.versions && x.data.versions[x.data.versions.length - 1]; return v ? v.scores : x.data.result ? x.data.result.els : [] }
function opStatus() {
  const rosterN = S.roster.length, ag = aggregate(S.all, rosterN);
  const rows = (S.roster.length ? S.roster.map(r => ({ r, x: S.all.find(x => x.name === r.name && x.team === r.team) })) : []).concat(S.all.filter(x => !S.roster.some(r => r.name === x.name && r.team === x.team)).map(x => ({ r: null, x })));
  let h = `<section class="card"><h2>참가자 명단 <small class="note">${rosterN}명</small></h2><p class="sub">한 줄에 한 명씩 "이름, 영역(A~E)"으로 적어 주세요. 완료 수의 분모가 돼요.</p><textarea id="roster" rows="5" placeholder="김단국, A">${esc(S.roster.map(r => r.name + ', ' + r.team).join('\n'))}</textarea><div class="act"><button class="ghost" data-a="rostersave">명단 저장</button></div></section>
  <section class="card"><h2>현황 <small class="note">제출 완료 ${ag.done} / ${ag.total}명, 시작 ${ag.started}명</small></h2>
  <div class="scroll"><table class="ot"><thead><tr><th>이름</th><th>영역</th><th>상태</th>${D.ELEMENTS.map(e => `<th>${esc(e.name)}</th>`).join('')}<th>확인 필요</th><th></th></tr></thead><tbody>${rows.map(({ r, x }) => { const sc = x ? scoresOf(x) : []; const st = x ? statusOf(x.data) : '미시작';
    return `<tr><td>${esc(r ? r.name : x.name || '(이름 없음)')}${!r ? ' <small class="note">명단 외</small>' : ''}</td><td>${esc(r ? r.team : x.team)}</td><td><span class="bd ${st === '제출 완료' ? 'ok' : st === '미시작' ? 'mu' : 'warn'}">${st}</span></td>${D.ELEMENTS.map(e => { const s = sc.find(q => q.id === e.id); return `<td class="c">${s ? (s.score == null ? '보류' : s.score) : '-'}</td>` }).join('')}<td class="c">${sc.reduce((a, s) => a + (s.checks || 0), 0)}</td><td>${x && x.data.result ? `<button class="ghost s" data-a="opsel" data-u="${x.uid}">상세</button>` : ''}</td></tr>` }).join('')}</tbody></table></div>
  <h3 class="sec">요소별 집계 <small class="note">제출 완료한 교수의 산정 가능한 점수만 평균해요</small></h3><div class="els">${ag.per.map(p => `<div class="el" style="--c:#005eb7"><span class="eln">${esc(p.name)}</span><b>${p.avg == null ? '산정 보류' : p.avg + '점'}</b><small>집계 ${p.n}명, 확인 필요 ${p.checks}건</small></div>`).join('')}</div>
  <div class="scroll"><table class="ot"><thead><tr><th>영역</th><th>제출</th><th>강점</th><th>보완점</th></tr></thead><tbody>${ag.teams.map(t => `<tr><td>${t.team} ${esc(D.TEAMS[t.team])}</td><td class="c">${t.n}</td><td>${t.strong ? esc(t.strong.name) + ' ' + t.strong.avg : '-'}</td><td>${t.weak ? esc(t.weak.name) + ' ' + t.weak.avg : '-'}</td></tr>`).join('')}</tbody></table></div></section>`;
  const x = S.all.find(q => q.uid === S.opSel);
  if (x && x.data.result) { const v = x.data.versions[x.data.versions.length - 1];
    h += `<section class="card"><h2>${esc(x.name)} 상세 <small class="note">${esc(x.data.fields && x.data.fields.F01 ? x.data.fields.F01.v : '')}</small></h2><div class="scroll"><table class="ot"><thead><tr><th>단국대 양식 항목명</th><th>원문</th><th>진단</th><th>확정 문구</th></tr></thead><tbody>${x.data.result.judgments.map(j => { const ap = v ? v.applied.filter(a => a.crit === j.crit) : [];
      return `<tr><td>${j.refs.map(id => esc(cellNameFor(id, x.data))).join('<br>') || '-'}</td><td class="pre">${esc(j.quote || '-')}</td><td><b>${esc(D.VERDICT[j.verdict][0])}</b> ${esc(j.crit)}<br><small>${esc(j.reason)}</small></td><td class="pre">${ap.map(a => esc(a.after)).join('\n\n') || '-'}</td></tr>` }).join('')}</tbody></table></div></section>` }
  return h;
}
function cellNameFor(id, d) { const keep = S.diag; S.diag = d; const n = cellName(id); S.diag = keep; return n }
function opCrit() {
  const byCat = c => D.CAT[c] || c;
  return `<section class="card"><h2>진단 기준 <small class="note">${S.crit.length}건 등록</small></h2><p class="sub">등록한 기준만 진단에 쓰여요. 기준이 없으면 교수 화면에 「기준 미등록」으로 나와요. 단국대 AX-EL&BREAK 기준은 아직 등록되지 않았어요.</p>
  <div class="act"><button class="ghost" data-a="critseed">제공 자료에서 정리한 초기 기준 ${D.CRITERIA.length}건 등록</button></div>
  <div class="scroll"><table class="ot"><thead><tr><th>ID</th><th>구분</th><th>요소</th><th>기준</th><th>출처, 조항, 버전</th><th>필수/권고</th><th></th></tr></thead><tbody>${S.crit.map(c => `<tr><td>${esc(c.id)}</td><td><span class="cat cat-${c.cat}">${esc(byCat(c.cat))}</span></td><td>${esc((D.ELEMENTS.find(e => e.id === c.el) || {}).name || c.el)}</td><td>${esc(c.text)}<br><small class="note">원문: ${esc(c.quote || '')}</small></td><td>${esc(c.doc)}<br>${esc(c.org)}<br>${esc(c.clause)} | ${esc(c.ver)}<br><small>${esc(c.cond || '')}</small></td><td>${esc(c.level)}</td><td><button class="ghost s" data-a="critedit" data-id="${esc(c.id)}">수정</button><button class="ghost s" data-a="critdel" data-id="${esc(c.id)}">삭제</button></td></tr>`).join('')}</tbody></table></div></section>
  <section class="card"><h2 id="cfh">기준 추가 또는 수정</h2><div class="fgrid grid">${[['id', '기준 ID(예: E5-06)'], ['doc', '출처 문서명'], ['org', '기관'], ['ver', '버전'], ['clause', '조항 또는 페이지'], ['quote', '원문'], ['text', '판정 문장'], ['cond', '적용 조건'], ['fields', '관련 칸 ID(쉼표로)']].map(([k, n]) => `<label class="fd ${['quote', 'text'].includes(k) ? 'long' : ''}"><span>${n}</span><input data-cf="${k}"></label>`).join('')}
  <label class="fd"><span>구분</span><select data-cf="cat"><option value="gov">정부, 교육부 기준</option><option value="dku">단국대 AX-EL&BREAK 기준</option><option value="sig">협의회 연구팀 권고</option></select></label>
  <label class="fd"><span>적용 요소</span><select data-cf="el">${D.ELEMENTS.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label><label class="fd"><span>필수/권고</span><select data-cf="level"><option>권고</option><option>필수</option></select></label></div>
  <div class="act"><button class="btn" data-a="critsave">기준 저장</button></div></section>`;
}
function opBrief() {
  const br = S.shares.filter(s => s.kind === 'brief'), sel = (S.pub && S.pub.cases || []).map(c => c.sid);
  return `<section class="card"><h2>브리핑 준비 <small class="note">${S.pub ? '고정 ' + new Date(S.pub.frozenAt).toLocaleString('ko-KR') : '아직 고정하지 않음'}</small></h2><p class="sub">교수가 브리핑 공유를 누른 사례만 보여요. 공개할 사례를 고르고 문장을 다듬은 뒤 [현재 현황 고정]을 누르면 브리핑 화면에 그 시점의 수치와 사례만 나가요.</p>
  ${br.length ? br.map(s => { const p = s.payload; const on = sel.includes(s.id); const pc = (S.pub && S.pub.cases || []).find(c => c.sid === s.id) || p;
    return `<details class="sh" ${on ? 'open' : ''}><summary><label><input type="checkbox" data-bsel="${s.id}" ${on ? 'checked' : ''}> ${esc(p.team)} | ${esc(p.element)} | ${esc(p.item)}</label></summary>${['before', 'comment', 'missed', 'after'].map(k => `<label class="fd long"><span>${{ before: '① 기존 평가 문구', comment: '② 학생의 한마디', missed: '③ 놓친 수행', after: '④ 확정된 수정 문구' }[k]}</span><textarea data-bed="${s.id}.${k}" rows="2">${esc(pc[k] || '')}</textarea></label>`).join('')}</details>` }).join('') : '<p class="note">공유된 사례가 없어요. 브리핑에는 집계만 나가요.</p>'}
  <div class="act"><button class="btn" data-a="freeze">${S.pub ? '새로 집계' : '현재 현황 고정'}</button></div></section>`;
}
function opGuide() {
  const gs = S.shares.filter(s => s.kind === 'guide'), saved = new Set(S.guide.map(g => g.key));
  return `<section class="card"><h2>가이드북 후보 <small class="note">저장 ${S.guide.length}건</small></h2><p class="sub">교수가 가이드북 사례 공유를 누른 사례예요. 같은 확정 버전은 한 번만 저장돼요.</p>
  ${gs.length ? `<div class="scroll"><table class="ot"><thead><tr><th>영역</th><th>요소, 양식 항목</th><th>수정 전</th><th>수정 후</th><th>보완 이유</th><th>기준</th><th></th></tr></thead><tbody>${gs.map(s => { const p = s.payload, key = `${s.uid}:${s.ver}:${s.item_key}`;
    return `<tr><td>${esc(p.team)}</td><td>${esc(p.element)}<br><small>${esc(p.formVer)} ${esc(p.item)}</small></td><td class="pre">${esc(p.before)}</td><td class="pre">${esc(p.after)}</td><td>${esc(p.reason)}<br><small>${esc(p.condition)}</small></td><td><small>${esc(p.crit)}</small></td><td>${saved.has(key) ? '<span class="bd ok">저장됨</span>' : `<button class="ghost s" data-a="gsave" data-id="${s.id}">가이드북 후보로 저장</button>`}</td></tr>` }).join('')}</tbody></table></div>` : '<p class="note">공유된 사례가 없어요.</p>'}</section>`;
}

/* ---------- 브리핑 ---------- */
async function renderBrief() {
  document.body.classList.add('brief-mode');
  if (S.online) { const { data } = await S.sb.from('m2_public').select('data').eq('id', 'brief').maybeSingle(); S.pub = data ? data.data : null }
  const p = S.pub;
  if (!p) return shell('<section class="bf"><h1>우리 대학 평가 중간고사</h1><p>운영자가 아직 현황을 고정하지 않았어요.</p></section>');
  const cases = p.cases || [], end = S.bCase >= cases.length;
  let h = `<section class="bf"><p class="kick">우리 대학 평가 중간고사</p><h1>참여 교수 ${p.agg.done}명 완료 <small>/ ${p.agg.total}명</small></h1><p class="note">${new Date(p.frozenAt).toLocaleString('ko-KR')} 기준 고정 집계. 미완료는 0점으로 넣지 않았어요.</p>
  <div class="bbars">${p.agg.per.map(e => `<div class="bb"><span>${esc(e.name)}</span><div class="bt"><i style="width:${e.avg || 0}%"></i></div><b>${e.avg == null ? '산정 보류' : e.avg + '점'}</b><small>집계 ${e.n}명, 확인 필요 ${e.checks}건</small></div>`).join('')}</div>
  <div class="bteams">${p.agg.teams.filter(t => t.n).map(t => `<div><b>${t.team}</b> 강점 ${t.strong ? esc(t.strong.name) : '-'}<br>보완점 ${t.weak ? esc(t.weak.name) : '-'}</div>`).join('')}</div></section>`;
  if (cases.length && !end) { const c = cases[S.bCase]; const stepsT = [['① 기존 평가 문구', c.before], ['② 학생의 한마디', c.comment], ['③ 놓친 수행', c.missed], ['④ 확정된 수정 문구', c.after]].filter(x => x[1]);
    h += `<section class="bf case"><p class="kick">익명 사례 ${S.bCase + 1} / ${cases.length} | ${esc(c.element)}</p>${stepsT.slice(0, S.bStep + 1).map(([l, t], i) => `<div class="cs ${i === 1 ? 'say' : ''}"><small>${l}</small><p class="pre">${esc(t)}</p></div>`).join('')}<div class="act"><button class="btn big" data-a="bnext">다음</button></div></section>` }
  else h += `<section class="bf q"><h1>학생이 직접 보여줘야 할 행동은 무엇인가요?</h1><p>이제 동사 카드 활동으로 넘어가요.</p>${cases.length ? '<button class="ghost" data-a="brestart">사례 처음부터</button>' : ''}</section>`;
  shell(h);
}

/* ---------- 이벤트 ---------- */
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'pdf' && t.files[0]) { const f = t.files[0]; const d = S.diag; d.readErr = ''; d.extractErr = ''; S.busy = 'PDF를 읽고 있어요'; render();
    try { const r = await readPdf(f); d.fileName = f.name; d.pages = r.pages; d.lines = r.lines; const chars = r.lines.reduce((a, l) => a + l.t.length, 0);
      if (chars < 200) { d.readErr = '글자를 읽을 수 없는 스캔 PDF로 보여요. 내용을 붙여 넣어 주세요.'; d._paste = true; S.busy = ''; save(); return render() }
      S.busy = '읽은 내용을 단국대 양식 칸에 맞추고 있어요(30초 정도)'; render();
      const raw = r.lines.map(l => `[p${l.p}] ${l.t}`).join('\n'); const j = await extract(raw, true); applyExtract(j, 'pdf', raw);
      if (d.extract.unverified.length) toast('원문과 대조되지 않은 칸이 있어요. 주황 표시를 확인해 주세요');
    } catch (err) { if (!d.lines.length) { d.readErr = 'PDF를 열 수 없어요(' + (err.message || err) + ').'; d._paste = true } else d.extractErr = String(err.message || err) }
    S.busy = ''; save(); render(); }
  if (t.id === 'pteam' || t.id === 'pname') { S.diag[t.id === 'pteam' ? 'team' : 'name'] = t.value; save() }
  if (t.dataset.repl) { const dc = S.diag.decisions[t.dataset.repl] || {}; dc.replace = t.checked; S.diag.decisions[t.dataset.repl] = dc; save() }
  if (t.dataset.bsel) { /* 브리핑 사례 선택은 고정 시 반영 */ }
});
document.addEventListener('input', e => {
  const t = e.target, d = S.diag;
  if (t.dataset.f) { d.fields[t.dataset.f] = { ...(d.fields[t.dataset.f] || {}), v: t.value, edited: true, status: t.value.trim() ? 'found' : (d.fields[t.dataset.f] || {}).status }; save() }
  else if (t.dataset.t) { const [tb, i, c] = t.dataset.t.split('.'); d.tables[tb][+i][c] = t.value; d.tables[tb][+i]._edited = true; save() }
  else if (t.dataset.memo) { d.answers[t.dataset.memo] = { ...(d.answers[t.dataset.memo] || {}), memo: t.value }; save() }
  else if (t.dataset.edit) { const dc = d.decisions[t.dataset.edit] || { mode: 'edit' }; dc.text = t.value; d.decisions[t.dataset.edit] = dc; save() }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, d = S.diag;
  if (a === 'step') { S.step = +b.dataset.s; render(); scrollTo(0, 0) }
  else if (a === 'pastebox') { d._paste = true; render(); $('#paste') && $('#paste').focus() }
  else if (a === 'pastego') { const txt = ($('#paste') || {}).value || ''; if (txt.trim().length < 30) return toast('붙여 넣은 내용이 너무 짧아요');
    d.readErr = ''; d.extractErr = ''; d.lines = txt.split('\n').map(t => ({ p: null, t })); d.fileName = ''; d.pages = 0; S.busy = '붙여 넣은 내용을 양식 칸에 맞추고 있어요'; render();
    try { const j = await extract(txt, false); applyExtract(j, 'paste', txt) } catch (err) { d.extractErr = String(err.message || err) } S.busy = ''; save(); render() }
  else if (a === 'reextract') { const raw = d.lines.map(l => (l.p ? `[p${l.p}] ` : '') + l.t).join('\n'); S.busy = '다시 정리하고 있어요'; render(); try { d.extractErr = ''; applyExtract(await extract(raw, !!d.pages), d.pages ? 'pdf' : 'paste', raw) } catch (err) { d.extractErr = String(err.message || err) } S.busy = ''; save(); render() }
  else if (a === 'toq') { buildQuestions(); save(true); S.step = 2; render(); scrollTo(0, 0) }
  else if (a === 'ans') { d.answers[b.dataset.q] = { ...(d.answers[b.dataset.q] || {}), choice: b.dataset.v }; save(); render() }
  else if (a === 'diag') { d.diagErr = ''; S.busy = '등록된 기준으로 진단하고 있어요(1분 정도)'; render(); try { await loadCriteria(); await diagnose(); S.step = 3 } catch (err) { d.diagErr = String(err.message || err) } S.busy = ''; save(true); render(); scrollTo(0, 0) }
  else if (a === 'dec') { const k = b.dataset.k, m = b.dataset.m; d.decisions[k] = { ...(d.decisions[k] || {}), mode: m }; save(); render() }
  else if (a === 'confirm') { const v = confirmVersion(); toast(`v${v.v}로 확정했어요`); render() }
  else if (a === 'pdfA' || a === 'pdfB') { const v = d.versions[d.versions.length - 1]; if (!v) return; await loadCriteria(); (a === 'pdfA' ? pdfA : pdfB)(d, v) }
  else if (a === 'share') { const v = d.versions[d.versions.length - 1], it = v.applied.find(x => x.k === b.dataset.k); if (it) await share(b.dataset.kind, it, v) }
  else if (a === 'opclaim') { const { data, error } = await S.sb.rpc('m2_claim_op', { code: ($('#opcode') || {}).value || '' }); if (error || !data) return toast('운영자 코드가 맞지 않아요'); S.isOp = true; render() }
  else if (a === 'optab') { S.opTab = b.dataset.t; render() }
  else if (a === 'opref') { render() }
  else if (a === 'opsel') { S.opSel = b.dataset.u; render() }
  else if (a === 'rostersave') { const rows = ($('#roster').value || '').split('\n').map(l => l.split(/[,\t]/).map(x => x.trim())).filter(x => x[0] && /^[A-E]$/i.test(x[1] || '')).map(x => ({ name: x[0], team: x[1].toUpperCase() }));
    await S.sb.from('m2_roster').delete().neq('name', '\u0000'); if (rows.length) { const { error } = await S.sb.from('m2_roster').insert(rows); if (error) return toast('명단 저장 실패: ' + error.message) } toast(`명단 ${rows.length}명을 저장했어요`); render() }
  else if (a === 'critseed') { const { error } = await S.sb.from('m2_criteria').upsert(D.CRITERIA.map(c => ({ id: c.id, data: c, updated_at: new Date().toISOString() }))); if (error) return toast('등록 실패: ' + error.message); toast('초기 기준을 등록했어요'); render() }
  else if (a === 'critedit') { const c = S.crit.find(x => x.id === b.dataset.id); $$('[data-cf]').forEach(el => { const v = c[el.dataset.cf]; el.value = Array.isArray(v) ? v.join(', ') : (v || '') }); $('#cfh').scrollIntoView() }
  else if (a === 'critdel') { if (!confirm2(b, '한 번 더 누르면 삭제돼요')) return; await S.sb.from('m2_criteria').delete().eq('id', b.dataset.id); render() }
  else if (a === 'critsave') { const c = {}; $$('[data-cf]').forEach(el => c[el.dataset.cf] = el.value.trim()); if (!c.id || !c.text || !c.doc) return toast('기준 ID, 출처 문서명, 판정 문장은 꼭 적어 주세요'); c.fields = (c.fields || '').split(',').map(x => x.trim()).filter(Boolean);
    const { error } = await S.sb.from('m2_criteria').upsert({ id: c.id, data: c, updated_at: new Date().toISOString() }); if (error) return toast('저장 실패: ' + error.message); toast('기준을 저장했어요'); render() }
  else if (a === 'freeze') { const ag = aggregate(S.all, S.roster.length); const ids = $$('[data-bsel]').filter(x => x.checked).map(x => x.dataset.bsel);
    const cases = ids.map(id => { const s = S.shares.find(q => q.id === id); const c = { sid: id, element: s.payload.element }; ['before', 'comment', 'missed', 'after'].forEach(k => { const el = $(`[data-bed="${id}.${k}"]`); c[k] = el ? el.value : s.payload[k] }); return c });
    const data = { frozenAt: new Date().toISOString(), agg: { total: ag.total, done: ag.done, per: ag.per, teams: ag.teams.map(t => ({ team: t.team, n: t.n, strong: t.strong && { name: t.strong.name }, weak: t.weak && { name: t.weak.name } })) }, cases };
    const { error } = await S.sb.from('m2_public').upsert({ id: 'brief', data, updated_at: data.frozenAt }); if (error) return toast('고정 실패: ' + error.message); toast('현재 현황을 고정했어요'); render() }
  else if (a === 'gsave') { const s = S.shares.find(q => q.id === b.dataset.id); const key = `${s.uid}:${s.ver}:${s.item_key}`; const { error } = await S.sb.from('m2_guide').insert({ key, data: { ...s.payload, ver: s.ver, sharedAt: s.at } });
    if (error && /duplicate|unique/i.test(error.message)) toast('이미 저장된 버전이에요'); else if (error) return toast('저장 실패: ' + error.message); else toast('가이드북 후보로 저장했어요'); render() }
  else if (a === 'bnext') { const c = (S.pub.cases || [])[S.bCase]; const n = [c.before, c.comment, c.missed, c.after].filter(Boolean).length; if (S.bStep < n - 1) S.bStep++; else { S.bCase++; S.bStep = 0 } renderBrief() }
  else if (a === 'brestart') { S.bCase = 0; S.bStep = 0; renderBrief() }
});
function confirm2(b, msg) { if (b.dataset.armed) return true; b.dataset.armed = 1; b.textContent = '정말 삭제'; toast(msg); setTimeout(() => { delete b.dataset.armed; b.textContent = '삭제' }, 3000); return false }
window.addEventListener('hashchange', () => { document.body.classList.remove('brief-mode'); render() });

/* ---------- 시작 ---------- */
(async () => {
  render();
  await connect(); await loadCriteria(); await loadMine();
  if (!S.diag.team && eqSt.team) S.diag.team = eqSt.team; if (!S.diag.name && eqSt.me) S.diag.name = eqSt.me;
  S.step = S.diag.result ? 3 : 1; render();
})();
window.__M2 = { S, aggregate, computeResult, validateJudgments, finalOf, applyExtract, buildQuestions, pdfA, pdfB, verify, norm, anon, sharePayload, statusOf, cellName };
})();
