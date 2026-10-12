/* התוכנית הכלכלית: האפליקציה. החישובים ב-calc.js, האחסון ב-Plan.gs דרך shared/api.js.
   מערכת נפרדת ממערכת הניהול. כניסה: לקוח עם ?t=<token> + קוד. חי: ?admin (רשימת התוכניות) או ?id=<תוכנית>, עם סיסמה משלה.
   ממערכת הניהול מגיעים בקישור ?admin&new=<שם>&phone=<טלפון>, שפותח טופס תוכנית חדשה. */
(function () {
  'use strict';
  const C = window.PlanCalc;
  const $ = id => document.getElementById(id);
  const view = $('view');

  const S = {
    plan: null, version: 0, role: '', name: '', sheetUrl: '',
    auth: null,            // { token, pin } or { password, id }
    phone: '',
    dirty: false, saving: false, failed: false, timer: 0,
    book: 'home', month: C.ym(), year: C.ym().slice(0, 4)
  };

  /* ---------- tiny DOM helper (same as admin): strings always go in as text ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (k.startsWith('aria-')) { el.setAttribute(k, String(v)); continue; }
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v; // trusted, static markup only
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach(c => { if (c != null && c !== false) el.append(c.nodeType ? c : String(c)); });
    return el;
  }
  const card = (...kids) => h('div', { class: 'card' }, kids);
  const sec = (title, extra) => h('h2', { class: 'sec' }, title, extra || null);
  // a negative number is isolated as left-to-right, so the minus stays in front of it in Hebrew text
  const money = n => {
    const v = Math.round(C.num(n));
    const s = Math.abs(v).toLocaleString('he-IL');
    return (v < 0 ? '⁦-' + s + '⁩' : s) + ' ₪';
  };
  const plain = n => Math.round(C.num(n)).toLocaleString('he-IL');
  const months = n => (n == null ? 'אין הפרשה' : n <= 0 ? 'הושג' : C.yearsMonths(Math.ceil(n)));
  const pct = n => Math.round(C.num(n) * 100) + '%';

  /* ---------- live numbers: recomputed after every keystroke, without redrawing the form ---------- */
  let lives = [];
  function live(tag, attrs, fn) {
    const el = h(tag, attrs);
    const upd = () => {
      const v = fn(el);
      if (v === undefined) return;
      if (v && v.nodeType) { el.textContent = ''; el.append(v); } else el.textContent = v;
    };
    lives.push(upd);
    upd();
    return el;
  }
  const refresh = () => lives.forEach(f => f());
  const toneClass = v => 'tone-' + C.tone(v);

  /* ---------- fields bound to the plan ---------- */
  const fmtNum = v => (C.has(v) ? Number(v).toLocaleString('he-IL', { maximumFractionDigits: 2 }) : '');
  function numIn(obj, key, o) {
    o = o || {};
    let focused = false;
    const inp = h('input', {
      class: 'field num' + (o.small ? ' sm' : ''), inputmode: o.neg ? 'text' : 'decimal', autocomplete: 'off', enterkeyhint: 'next',
      'aria-label': o.label || '', placeholder: o.ph || '', id: o.id || null, readonly: o.readonly || null
    });
    const show = () => { inp.value = focused ? (C.has(obj[key]) ? String(obj[key]) : '') : fmtNum(obj[key]); };
    inp.addEventListener('focus', () => { focused = true; show(); setTimeout(() => inp.select(), 0); });
    inp.addEventListener('blur', () => { focused = false; show(); });
    inp.addEventListener('input', () => {
      const s = inp.value.replace(/[^\d.\-]/g, '').replace(/(?!^)-/g, '');
      obj[key] = s === '' || s === '-' || s === '.' ? '' : Number(s);
      if (o.on) o.on(obj[key]);
      changed();
    });
    show();
    if (o.unit === false) return inp;
    return h('div', { class: 'money' + (o.unit ? ' unit' : '') , 'data-unit': o.unit || null }, inp);
  }
  function textIn(obj, key, o) {
    o = o || {};
    const id = o.id || (key === 'label' && obj.id ? 'f-' + obj.id : null);
    const inp = h(o.area ? 'textarea' : 'input', { class: 'field' + (o.cls ? ' ' + o.cls : ''), 'aria-label': o.label || '', placeholder: o.ph || '', id, autocomplete: 'off', readonly: o.readonly || null, maxlength: o.max || (o.area ? 4000 : 120) });
    inp.value = obj[key] || '';
    inp.addEventListener('input', () => { obj[key] = inp.value; if (o.on) o.on(); changed(); });
    return inp;
  }
  function monthIn(obj, key, o) {
    const inp = h('input', { class: 'field', type: 'month', 'aria-label': (o && o.label) || '', value: obj[key] || '' });
    inp.addEventListener('change', () => { obj[key] = inp.value; changed(); });
    return inp;
  }
  function check(obj, key, label, on) {
    const inp = h('input', { type: 'checkbox', checked: !!obj[key] });
    inp.addEventListener('change', () => { obj[key] = inp.checked; if (on) on(); changed(); });
    return h('label', { class: 'check' }, inp, h('span', {}, label));
  }
  const delBtn = (label, fn) => h('button', { class: 'del', type: 'button', 'aria-label': 'מחיקת ' + (label || 'שורה'), onclick: fn }, '×');

  /* ---------- feedback ---------- */
  let toastTimer;
  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast' + (bad ? ' bad' : ''); }, 2800);
  }
  function openSheet(content, focus) {
    const d = $('dlg');
    d.textContent = '';
    d.append(content);
    d.showModal();
    if (focus) setTimeout(() => focus.focus(), 60);
  }
  const closeSheet = () => { $('dlg').close(); redraw(); };
  const closeX = () => h('button', { class: 'x', type: 'button', 'aria-label': 'סגירה', onclick: closeSheet }, '×');
  $('dlg').addEventListener('click', e => { if (e.target === $('dlg')) closeSheet(); });
  $('dlg').addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });

  /* ---------- storage ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* session only */ } }
  };
  async function api(action, data) {
    return Api.call(action, Object.assign({}, S.auth, data));
  }
  function setState(text, cls) {
    const el = $('saveState');
    el.textContent = text;
    el.className = 'save-state' + (cls ? ' ' + cls : '');
  }
  function changed() {
    S.dirty = true;
    refresh();
    setState('שומר…');
    clearTimeout(S.timer);
    S.timer = setTimeout(save, 1500);
  }
  async function save() {
    if (!S.dirty) return;
    if (S.saving) { clearTimeout(S.timer); S.timer = setTimeout(save, 800); return; }
    S.saving = true;
    S.dirty = false;
    try {
      const r = await api('plan_save', { version: S.version, data: JSON.stringify(S.plan), tables: C.tables(S.plan) });
      S.version = r.version;
      S.failed = false;
      setState(S.dirty ? 'שומר…' : 'נשמר', S.dirty ? '' : 'ok');
    } catch (err) {
      S.dirty = true;
      if (err.code === 'conflict') { S.saving = false; return conflict(); }
      S.failed = true;
      setState('לא נשמר', 'bad');
      if (err.code === 'pin' || err.code === 'locked' || err.code === 'auth') { gate(Api.errText(err.code)); }
      else toast(err.code === 'network' ? 'אין חיבור. נשמור כשהחיבור יחזור.' : Api.errText(err.code), true);
    } finally { S.saving = false; }
  }
  window.addEventListener('online', () => { if (S.dirty) save(); });
  window.addEventListener('beforeunload', e => { if (S.dirty) { save(); e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && S.dirty) save(); });

  async function conflict() {
    const fresh = await api('plan_get').catch(() => null);
    if (!fresh) return;
    const keepMine = confirm('התוכנית עודכנה ממכשיר אחר (או על ידי ' + (S.role === 'admin' ? 'הלקוח' : 'חי') + ') בזמן שעבדת.\n\nאישור: לשמור את מה שעשית כאן מעל הגרסה ההיא.\nביטול: לטעון את הגרסה החדשה במקום.');
    S.version = fresh.version;
    if (keepMine) { S.dirty = true; save(); return; }
    S.plan = upgrade(JSON.parse(fresh.data));
    S.dirty = false;
    setState('נטען מחדש', 'ok');
    route();
  }

  /* ---------- older saved plans get the keys added later ---------- */
  function upgrade(p) {
    const base = C.newPlan({ name: S.name });
    Object.keys(base).forEach(k => { if (p[k] === undefined) p[k] = base[k]; });
    ['home', 'business'].forEach(bk => Object.keys(base[bk]).forEach(k => { if (p[bk][k] === undefined) p[bk][k] = base[bk][k]; }));
    Object.keys(base.lt).forEach(k => { if (p.lt[k] === undefined) p.lt[k] = base.lt[k]; });
    return p;
  }

  /* ---------- entry ---------- */
  const params = new URLSearchParams(location.search);
  const MOCK_Q = Api.MOCK && params.has('mock') ? '?mock' : '';
  const ADMIN = params.has('admin') || params.has('id');
  const adminHref = id => '?' + (MOCK_Q ? 'mock&' : '') + (id ? 'id=' + id : 'admin');

  /* ---------- Hai: all the plans ---------- */
  const intlPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('0') ? '972' + d.slice(1) : d; };
  const waUrl = (phone, text) => 'https://wa.me/' + intlPhone(phone) + '?text=' + encodeURIComponent(text);
  const firstName = name => String(name).split(/\s+ו?/)[0];
  const planText = (name, url, pin) => 'היי ' + firstName(name) + ', כאן חי 🙂\nזו התוכנית הכלכלית. עליה נעבוד בפגישות, ואיתה ממשיכים גם אחרי.\nהקוד לכניסה: ' + pin + '\n' + url;
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const t = h('textarea', {}, text); document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    toast(msg || 'הועתק');
  }
  const ago = iso => {
    const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
    return days < 1 ? 'היום' : days === 1 ? 'אתמול' : days < 30 ? 'לפני ' + days + ' ימים' : new Date(iso).toLocaleDateString('he-IL');
  };
  // the link + PIN, right after creating a plan or a new PIN. The PIN is shown only here.
  function sentCard(name, phone, url, pin, id) {
    return card(h('div', { class: 'row' },
      h('h2', {}, name),
      h('p', { class: 'hint' }, 'הקוד מוצג רק עכשיו. אם הוא יאבד, יוצרים קוד חדש מתוך התוכנית.'),
      h('div', { class: 'pin-show' }, h('small', {}, 'קוד'), h('b', { dir: 'ltr' }, pin)),
      h('div', { class: 'linkbox' }, url),
      h('div', { class: 'btns' },
        phone ? h('a', { class: 'ghost wa', href: waUrl(phone, planText(name, url, pin)), target: '_blank', rel: 'noopener' }, 'שליחה בוואטסאפ') : null,
        h('button', { class: 'ghost', type: 'button', onclick: () => copy(planText(name, url, pin), 'ההודעה הועתקה') }, 'העתקה'),
        id ? h('a', { class: 'ghost', href: adminHref(id) }, 'פתיחת התוכנית') : null)));
  }
  function startAdmin() {
    const password = store.get('plan-admin');
    $('gate').hidden = true;
    if (params.get('id')) {
      S.auth = { password, id: params.get('id') };
      load().catch(err => { if (err.code === 'auth' || err.code === 'locked') store.set('plan-admin', ''); gate(Api.errText(err.code)); });
      return;
    }
    S.auth = { password };
    renderPlans();
  }
  async function renderPlans() {
    $('who').textContent = 'מערכת התוכניות';
    document.title = 'התוכניות הכלכליות';
    $('tabs').hidden = true;
    view.hidden = false;
    view.textContent = '';
    view.append(head('תוכניות', 'כל התוכניות הכלכליות של הלקוחות'), h('div', { class: 'spinner' }));
    let plans;
    try { plans = (await api('plan_list')).plans; }
    catch (err) {
      if (err.code === 'auth' || err.code === 'locked') { store.set('plan-admin', ''); gate(Api.errText(err.code)); return; }
      view.lastChild.replaceWith(card(h('div', { class: 'all-clear' }, Api.errText(err.code))));
      return;
    }
    view.lastChild.remove();

    // new plan. From the admin card: ?admin&new=<name>&phone=<phone>
    const name = h('input', { class: 'field', id: 'np-name', autocomplete: 'off', maxlength: 80, value: params.get('new') || '' });
    const phone = h('input', { class: 'field', id: 'np-phone', type: 'tel', inputmode: 'tel', autocomplete: 'off', value: params.get('phone') || '' });
    const err = h('p', { class: 'err', role: 'alert' });
    const go = h('button', { class: 'go', type: 'submit' }, 'פתיחת תוכנית');
    const same = params.get('new') && plans.find(x => x.name === params.get('new'));
    const box = h('div');
    const count = h('span', { class: 'n' }, String(plans.length));
    let draw = () => {};
    box.append(h('form', { class: 'card', novalidate: true, onsubmit: async e => {
      e.preventDefault();
      err.textContent = '';
      if (name.value.trim().length < 2) { err.textContent = 'צריך שם.'; name.focus(); return; }
      go.disabled = true;
      try {
        const r = await api('plan_create', { name: name.value.trim(), phone: phone.value.trim() });
        box.textContent = '';
        box.append(sentCard(r.name, r.phone, r.url, r.pin, r.id));
        plans.unshift(r);
        count.textContent = String(plans.length);
        draw();
        history.replaceState(null, '', location.pathname + adminHref());
        toast('התוכנית נפתחה');
      } catch (x) { err.textContent = Api.errText(x.code); go.disabled = false; }
    } }, h('div', { class: 'row' },
      h('h2', {}, 'תוכנית חדשה'),
      same ? h('p', { class: 'warn-line' }, 'כבר יש תוכנית בשם הזה. אפשר לפתוח אותה מהרשימה למטה.') : null,
      h('label', { class: 'lbl', for: 'np-name' }, 'שם הלקוח'), name,
      h('label', { class: 'lbl', for: 'np-phone' }, 'טלפון (לשליחה בוואטסאפ, לא חובה)'), phone,
      h('p', { class: 'hint mt' }, 'נוצרים קישור, קוד בן 4 ספרות וגיליון בדרייב בתיקייה "תוכניות כלכליות".'),
      err, go)));
    view.append(box);

    const search = h('input', { class: 'field search', type: 'search', placeholder: 'חיפוש לפי שם', 'aria-label': 'חיפוש' });
    const list = h('div');
    draw = () => {
      const q = search.value.trim();
      const items = plans.filter(x => !q || x.name.includes(q));
      list.textContent = '';
      list.append(items.length ? card(items.map(x => h('a', { class: 'item', href: adminHref(x.id) },
        h('div', { class: 'main' }, h('b', {}, x.name), h('small', {}, x.version ? 'עודכנה ' + ago(x.updated) : 'עוד לא מולאה'))))) :
        card(h('div', { class: 'all-clear' }, q ? 'לא נמצא' : 'עוד אין תוכניות')));
    };
    search.addEventListener('input', draw);
    view.append(sec('כל התוכניות', count), search, list);
    draw();
    if (params.get('new') && !same) setTimeout(() => phone.value ? go.focus() : phone.focus(), 60);
  }
  async function newPinSheet() {
    if (!confirm('ליצור קוד חדש ללקוח? הקוד הקודם יפסיק לעבוד.')) return;
    try {
      const r = await api('plan_pin');
      openSheet(h('div', {}, h('div', { class: 'row' }, closeX(), h('h2', {}, 'קישור וקוד חדש')), sentCard(S.name, S.phone, r.url, r.pin)));
    } catch (err) { toast(Api.errText(err.code), true); }
  }
  async function deletePlan() {
    if (!confirm('למחוק לצמיתות את התוכנית של ' + S.name + '?\nהגיליון בדרייב עובר לפח, והקישור של הלקוח יפסיק לעבוד.')) return;
    try {
      await api('plan_delete', { confirm: true });
      S.dirty = false;
      location.href = adminHref();
    } catch (err) { toast(Api.errText(err.code), true); }
  }
  function gate(msg) {
    $('tabs').hidden = true;
    view.hidden = true;
    const g = $('gate');
    g.hidden = false;
    g.textContent = '';
    if (ADMIN) {
      const pw = h('input', { class: 'field', id: 'pw', type: 'password', autocomplete: 'current-password' });
      const err = h('p', { class: 'err', role: 'alert' }, msg || '');
      const go = h('button', { class: 'go', type: 'submit' }, 'כניסה');
      g.append(h('form', { class: 'card gate', novalidate: true, onsubmit: async e => {
        e.preventDefault();
        go.disabled = true;
        err.textContent = '';
        try {
          await Api.call('plan_list', { password: pw.value });
          store.set('plan-admin', pw.value);
          startAdmin();
        } catch (x) { err.textContent = Api.errText(x.code); go.disabled = false; }
      } }, h('div', { class: 'row' },
        h('h2', {}, 'מערכת התוכניות'),
        h('label', { class: 'lbl', for: 'pw' }, 'סיסמה'), pw, err, go)));
      setTimeout(() => pw.focus(), 60);
      return;
    }
    if (!S.auth || !S.auth.token) {
      g.append(card(h('div', { class: 'row' }, h('h2', {}, 'התוכנית הכלכלית שלכם'),
        h('p', { class: 'hint' }, 'נכנסים דרך הקישור האישי ששלח לכם חי. אם הקישור אבד, אפשר לבקש ממנו קישור חדש.'))));
      return;
    }
    const pin = h('input', { class: 'field pin', id: 'pin', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 4, pattern: '[0-9]*', 'aria-describedby': 'pinErr' });
    const remember = h('input', { type: 'checkbox', checked: true });
    const err = h('p', { class: 'err', id: 'pinErr', role: 'alert' }, msg || '');
    const go = h('button', { class: 'go', type: 'submit' }, 'כניסה');
    g.append(h('form', { class: 'card gate', novalidate: true, onsubmit: async e => {
      e.preventDefault();
      if (!/^\d{4}$/.test(pin.value)) { err.textContent = 'הקוד הוא 4 ספרות.'; pin.focus(); return; }
      go.disabled = true;
      S.auth.pin = pin.value;
      try {
        await load();
        store.set('plan-pin', remember.checked ? pin.value : '');
      } catch (x) {
        err.textContent = Api.errText(x.code);
        go.disabled = false;
        pin.select();
      }
    } }, h('div', { class: 'row' },
      h('h2', {}, 'הקוד שקיבלתם מחי'),
      h('p', { class: 'hint' }, 'ארבע ספרות. אפשר לבקש ממנו קוד חדש בכל זמן.'),
      h('label', { class: 'sr', for: 'pin' }, 'קוד'), pin, err,
      h('label', { class: 'check', style: 'margin-top:12px' }, remember, h('span', {}, 'לזכור במכשיר הזה')),
      go)));
    setTimeout(() => pin.focus(), 60);
  }

  async function load() {
    const r = await api('plan_get');
    S.role = r.role;
    S.phone = r.phone || '';
    S.name = r.name;
    S.version = r.version;
    S.sheetUrl = r.sheetUrl || '';
    if (r.data) S.plan = upgrade(JSON.parse(r.data));
    else { S.plan = C.newPlan({ name: r.name, start: C.ym() }); S.dirty = true; }
    $('who').textContent = S.role === 'admin' ? 'התוכנית של ' + (S.name || '') : 'התוכנית הכלכלית שלכם';
    document.title = S.role === 'admin' ? 'תוכנית: ' + S.name : 'התוכנית הכלכלית שלי';
    $('gate').hidden = true;
    view.hidden = false;
    $('tabs').hidden = false;
    setState(S.dirty ? 'שומר…' : 'נשמר', S.dirty ? '' : 'ok');
    if (S.dirty) save();
    route();
  }

  /* ---------- router ---------- */
  const TABS = { home: renderHome, month: renderMonth, map: renderMap, debts: renderDebts, goals: renderGoals, year: renderYear, meetings: renderMeetings };
  const PARENT = { year: 'home', meetings: 'home' };
  function route() {
    if (!S.plan) return;
    if ($('dlg').open) return;
    const tab = TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'home';
    document.querySelectorAll('.tabs a').forEach(a => {
      if (a.dataset.tab === (PARENT[tab] || tab)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    lives = [];
    view.textContent = '';
    window.scrollTo(0, 0);
    if (!S.plan.hasBusiness) S.book = 'home';
    TABS[tab]();
  }
  window.addEventListener('hashchange', route);
  // same screen again, keeping the scroll (after adding or removing a row)
  function redraw() { const y = window.scrollY; route(); window.scrollTo(0, y); }

  /* ---------- shared pieces ---------- */
  function bookSwitch(on) {
    if (!S.plan.hasBusiness) return null;
    return h('div', { class: 'seg', role: 'group', 'aria-label': 'בית או עסק' }, ['home', 'business'].map(bk =>
      h('button', { type: 'button', 'aria-pressed': S.book === bk, onclick: () => { S.book = bk; (on || route)(); } }, C.BOOKS[bk])));
  }
  const head = (title, sub, extra) => h('div', { class: 'head' }, h('div', {}, h('h1', {}, title), sub ? h('small', {}, sub) : null), extra || null);
  const stat = (label, fn, cls) => h('div', { class: 'stat' + (cls ? ' ' + cls : '') }, h('small', {}, label), live('b', {}, fn));
  const tonedStat = (label, fn) => {
    const wrap = h('div', { class: 'stat' }, h('small', {}, label));
    wrap.append(live('b', {}, el => { const v = fn(); el.className = toneClass(v); return money(v); }));
    return wrap;
  };

  /* ================= home ================= */
  function renderHome() {
    const p = S.plan;
    const key = C.ym();
    const hour = new Date().getHours();
    view.append(head(hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב', C.ymLabel(key)));
    const d = C.digest(p, key);
    const kind = { actual: 'לפי מה שמילאתם החודש', budget: 'לפי התקציב של החודש', mapping: 'לפי המיפוי' }[d.cashflowKind];
    view.append(h('a', { class: 'card hero-num', href: '#month' },
      h('small', {}, 'התזרים של ' + C.MONTHS[Number(key.slice(5)) - 1]),
      h('b', { class: toneClass(d.cashflow) }, money(d.cashflow)),
      h('span', { class: 'hint' }, kind),
      h('span', { class: 'go-link' }, d.month && d.month.started ? 'להמשיך למלא' : d.month ? 'למלא את הביצוע' : 'לפתוח את החודש')));

    const lt = d.lt;
    const em = lt.items[0];
    view.append(h('div', { class: 'tiles' },
      h('a', { class: 'card tile', href: '#debts' }, h('small', {}, 'שווי נקי'), h('b', {}, money(d.net.net))),
      h('a', { class: 'card tile', href: '#goals' }, h('small', {}, 'קרן חירום'), h('b', {}, em.target ? pct(Math.min(1, em.have / em.target)) : 'לא הוגדר')),
      h('a', { class: 'card tile', href: '#year' }, h('small', {}, 'חודשים שמולאו השנה'), h('b', {}, String(d.year.months))),
      h('a', { class: 'card tile', href: '#map' }, h('small', {}, 'תזרים במיפוי'), h('b', { class: toneClass(d.mapping.cashflow) }, money(d.mapping.cashflow)))));

    // goals progress
    const goals = lt.items.filter(i => i.target > 0);
    if (goals.length) {
      view.append(sec('היעדים'), card(goals.map(i => h('a', { class: 'item', href: '#goals' },
        h('div', { class: 'main' }, h('b', {}, i.label), h('small', {}, money(i.have) + ' מתוך ' + money(i.target) + ' · ' + months(i.months))),
        h('div', { class: 'meter', 'aria-label': pct(Math.min(1, i.have / i.target)) }, h('i', { style: 'width:' + Math.min(100, Math.round(i.have / i.target * 100)) + '%' }))))));
    }

    // average month in practice vs the mapping (old: "הכנסה/הוצאה ממוצעת חודשית" vs "הכנסות/הוצאות במיפוי")
    if (d.year.months) {
      view.append(sec('ממוצע בפועל מול המיפוי'), h('div', { class: 'card sum-grid' },
        h('div', { class: 'sg-head' }, h('span', {}), h('small', {}, 'במיפוי'), h('small', {}, 'בפועל')),
        h('div', {}, h('span', {}, 'הכנסה בחודש'), h('b', {}, money(d.mapping.income)), h('b', {}, money(d.year.income.avg))),
        h('div', {}, h('span', {}, 'הוצאה בחודש'), h('b', {}, money(d.mapping.expenses)), h('b', {}, money(d.year.expenses.avg)))));
    }

    view.append(sec('עוד'), card(
      h('a', { class: 'item', href: '#year' }, h('div', { class: 'main' }, h('b', {}, 'סיכום שנתי'), h('small', {}, 'הכנסות, הוצאות ותזרים לפי חודש'))),
      h('a', { class: 'item', href: '#meetings' }, h('div', { class: 'main' }, h('b', {}, 'הפגישות והמטרות שלנו'), h('small', {}, 'מה סיכמנו, המשימות ומה לקחתם מכל פגישה'))),
      h('button', { class: 'item', type: 'button', onclick: settingsSheet }, h('div', { class: 'main' }, h('b', {}, 'הגדרות'), h('small', {}, S.plan.hasBusiness ? 'יש גם עסק' : 'בית בלבד')))));
    if (S.role === 'admin') {
      view.append(sec('לחי בלבד'), card(
        h('button', { class: 'item', type: 'button', onclick: newPinSheet }, h('div', { class: 'main' }, h('b', {}, 'קישור וקוד ללקוח'), h('small', {}, 'יוצר קוד חדש ושולח בוואטסאפ'))),
        S.sheetUrl ? h('a', { class: 'item', href: S.sheetUrl, target: '_blank', rel: 'noopener' }, h('div', { class: 'main' }, h('b', {}, 'הגיליון בדרייב'), h('small', {}, 'עותק קריא שמתעדכן בכל שמירה'))) : null,
        h('button', { class: 'item', type: 'button', onclick: importSheet }, h('div', { class: 'main' }, h('b', {}, 'ייבוא מקובץ האקסל הישן'), h('small', {}, 'מעביר את המיפוי, החודשים, החובות והיעדים'))),
        h('a', { class: 'item', href: adminHref() }, h('div', { class: 'main' }, h('b', {}, 'כל התוכניות'))),
        h('button', { class: 'item danger-item', type: 'button', onclick: deletePlan }, h('div', { class: 'main' }, h('b', {}, 'מחיקת התוכנית'), h('small', {}, 'לפי בקשה או מדיניות פרטיות. הגיליון עובר לפח')))));
    }
  }

  function settingsSheet() {
    const p = S.plan;
    openSheet(h('div', {},
      h('div', { class: 'row' }, closeX(), h('h2', {}, 'הגדרות')),
      h('div', { class: 'row' },
        check(p, 'hasBusiness', 'יש גם עסק (מיפוי, חודשים וחובות נפרדים לעסק)'),
        h('p', { class: 'hint', style: 'margin-top:8px' }, 'משכורת מהעסק לבית נכנסת לבד להכנסות הבית.'),
        h('label', { class: 'lbl', for: 'st-start', style: 'margin-top:16px' }, 'חודש תחילת התהליך'),
        Object.assign(monthIn(p, 'start'), { id: 'st-start' }))));
  }

  async function importSheet() {
    const src = h('input', { class: 'field', id: 'imp-src', dir: 'ltr', placeholder: 'https://docs.google.com/spreadsheets/d/…', autocomplete: 'off' });
    const err = h('p', { class: 'err', role: 'alert' });
    const go = h('button', { class: 'go', type: 'submit' }, 'ייבוא');
    openSheet(h('form', { novalidate: true, onsubmit: async e => {
      e.preventDefault();
      err.textContent = '';
      go.disabled = true;
      try {
        const raw = await api('plan_import', { source: src.value.trim() });
        const res = PlanImport.importOld(raw, { name: S.name });
        const msg = 'נמצאו ' + res.months + ' חודשים עם ביצוע' + (res.business ? ', כולל עסק' : '') + '.\nהייבוא מחליף את כל מה שיש עכשיו בתוכנית. להמשיך?';
        if (!confirm(msg)) { go.disabled = false; return; }
        S.plan = upgrade(res.plan);
        S.plan.name = S.name;
        $('dlg').close();
        changed();
        toast('יובא. כדאי לעבור על המיפוי.');
        location.hash = 'map';
        route();
      } catch (x) {
        err.textContent = x.code ? Api.errText(x.code) : 'לא הצלחתי לקרוא את הקובץ.';
        go.disabled = false;
      }
    } },
      h('div', { class: 'row' }, closeX(), h('h2', {}, 'ייבוא מהקובץ הישן')),
      h('div', { class: 'row' },
        h('label', { class: 'lbl', for: 'imp-src' }, 'קישור לגיליון של הלקוח בדרייב'),
        h('p', { class: 'hint' }, 'הקובץ צריך להיות גיליון גוגל בדרייב שלך (לא קובץ אקסל שהועלה). קובץ אקסל פותחים ב"פתיחה באמצעות Google Sheets" ושומרים.'),
        src, err, go)), src);
  }

  /* ================= mapping ================= */
  function renderMap() {
    const p = S.plan, bk = S.book, book = p[bk];
    const sum = () => C.mappingSummary(p, bk);
    view.append(head('מיפוי', 'החודש הממוצע. ממנו נבנה התקציב של כל חודש.', bookSwitch()));
    view.append(h('div', { class: 'card sum-bar' },
      stat('הכנסות', () => money(sum().income)),
      stat('הוצאות + חיסכון', () => money(sum().expenses + sum().savings)),
      tonedStat('תזרים', () => sum().cashflow)));

    // incomes
    const incBox = h('div');
    const drawInc = () => {
      incBox.textContent = '';
      incBox.append(card(book.incomes.map((i, idx) => i.calc ? linkedRow(i.label, () => C.linkedValue(p, bk, i.calc), i.calc) :
        h('div', { class: 'line' },
          textIn(i, 'label', { cls: 'name', label: 'שם ההכנסה' }),
          numIn(i, 'amount', { label: i.label }),
          delBtn(i.label, () => { book.incomes.splice(idx, 1); changed(); drawInc(); }))),
        addBtn('הכנסה', () => { const x = { id: C.uid(), label: '', amount: '' }; book.incomes.push(x); drawInc(); return x; })));
    };
    drawInc();
    view.append(sec('הכנסות'), incBox);

    Object.keys(C.GROUPS).forEach(g => {
      const box = h('div');
      const draw = () => {
        box.textContent = '';
        const rows = book.cats.filter(c => c.group === g);
        box.append(card(rows.map(c => catRow(p, bk, c, draw)),
          g === 'var' ? crossInfo(p, bk) : null,
          addBtn('שורה', () => { const c = g === 'var' ? { id: C.uid(), label: '', group: g, m: ['', '', ''] } : { id: C.uid(), label: '', group: g, amount: '' }; book.cats.push(c); draw(); return c; })));
      };
      draw();
      view.append(sec(C.GROUPS[g], live('span', { class: 'n' }, () => money(C.sum(C.mappingRows(p, bk).filter(r => r.group === g), r => r.value)))), box);
      if (g === 'var') view.append(h('p', { class: 'note' }, 'בהוצאות המשתנות מזינים 3 חודשים מדפי החשבון והאשראי. הממוצע נכנס לתקציב.'));
    });

    if (p.hasBusiness) {
      const other = bk === 'home' ? 'העסק' : 'הבית';
      const box = h('div');
      const draw = () => {
        box.textContent = '';
        box.append(card(book.forOther.map((x, idx) => varRow(x, () => { book.forOther.splice(idx, 1); changed(); draw(); })),
          addBtn('שורה', () => { const x = { id: C.uid(), label: '', m: ['', '', ''] }; book.forOther.push(x); draw(); return x; })));
      };
      draw();
      view.append(sec('הוצאות של ' + other + ' שיורדות מחשבון ' + (bk === 'home' ? 'הבית' : 'העסק')), box,
        h('p', { class: 'note' }, 'נספרות בתקציב של ' + other + '.'));
    }

    // helper calculators
    view.append(sec('מחשבוני עזר'), card(Object.keys(C.CALCS).filter(k => book.calcs[k]).map(k =>
      h('button', { class: 'item', type: 'button', onclick: () => calcSheet(bk, k) },
        h('div', { class: 'main' }, h('b', {}, C.CALCS[k].label), h('small', {}, book.calcs[k].filter(x => C.num(x.amount)).length + ' שורות' + (C.CALCS[k].yearly ? ' · סכומים שנתיים' : ''))),
        h('span', { class: 'amt' }, money(C.calcTotal(book, k)))))));

    // savings + bank
    view.append(sec('חסכונות'), savingsCard(book));
    view.append(sec('חשבונות בנק'), bankCard(book));
  }

  // fn adds a row and returns it; the new row's name field gets the focus
  function addBtn(what, fn) {
    return h('button', { class: 'add', type: 'button', onclick: () => {
      const row = fn();
      changed();
      if (row && row.id) setTimeout(() => { const el = document.getElementById('f-' + row.id); if (el) el.focus(); }, 0);
    } }, '+ ' + what);
  }
  function linkedRow(label, fn, calc) {
    const to = { savings: '#map', loans: '#debts', mortgage: '#debts', installments: '#debts', sim1: '#debts', sim2: '#debts', bizSalary: '#map' }[calc];
    return h('div', { class: 'line linked' },
      h('div', { class: 'name static' }, h('span', {}, label), h('small', {}, C.LINKED[calc] || '')),
      live('span', { class: 'amt' }, () => money(fn())),
      calc === 'bizSalary' ? h('button', { class: 'go-mini', type: 'button', onclick: () => { S.book = 'business'; route(); } }, 'לעסק') :
        to && to !== '#map' ? h('a', { class: 'go-mini', href: to }, 'פתיחה') : h('span', { class: 'del-space' }));
  }
  function catRow(p, bk, c, redraw) {
    const book = p[bk];
    const remove = () => { book.cats.splice(book.cats.indexOf(c), 1); changed(); redraw(); };
    if (c.calc && C.LINKED[c.calc]) return linkedRow(c.label, () => C.lineValue(p, bk, c), c.calc);
    if (c.calc && C.CALCS[c.calc] && C.calcTotal(book, c.calc)) {
      return h('div', { class: 'line linked' },
        h('div', { class: 'name static' }, h('span', {}, c.label), h('small', {}, 'מהמחשבון')),
        live('span', { class: 'amt' }, () => money(C.lineValue(p, bk, c))),
        h('button', { class: 'go-mini', type: 'button', onclick: () => calcSheet(bk, c.calc) }, 'מחשבון'));
    }
    if (c.m) {
      const row = varRow(c, remove);
      if (c.calc && C.CALCS[c.calc]) row.querySelector('.name-wrap').append(h('button', { class: 'link-btn sm', type: 'button', onclick: () => calcSheet(bk, c.calc) }, 'מחשבון'));
      return row;
    }
    return h('div', { class: 'line' },
      h('div', { class: 'name-wrap' }, textIn(c, 'label', { cls: 'name', label: 'שם השורה' }),
        c.calc && C.CALCS[c.calc] ? h('button', { class: 'link-btn sm', type: 'button', onclick: () => calcSheet(bk, c.calc) }, 'מחשבון') : null),
      numIn(c, 'amount', { label: c.label }),
      delBtn(c.label, remove));
  }
  function varRow(c, remove) {
    return h('div', { class: 'line var' },
      h('div', { class: 'name-wrap' }, textIn(c, 'label', { cls: 'name', label: 'שם השורה' })),
      live('span', { class: 'amt', title: 'ממוצע' }, () => money(C.avg3(c.m))),
      delBtn(c.label, remove),
      h('div', { class: 'three' }, [0, 1, 2].map(i => numIn(c.m, i, { label: c.label + ' חודש ' + (i + 1), ph: 'חודש ' + (i + 1), small: true, unit: false }))));
  }
  function crossInfo(p, bk) {
    const rows = C.mappingRows(p, bk).filter(r => r.cross && r.value);
    return rows.length ? rows.map(r => h('div', { class: 'line linked' }, h('div', { class: 'name static' }, h('span', {}, r.label)), h('span', { class: 'amt' }, money(r.value)), h('span', { class: 'del-space' }))) : null;
  }

  function calcSheet(bk, k) {
    const book = S.plan[bk];
    const list = book.calcs[k];
    const meta = C.CALCS[k];
    const box = h('div', { class: 'row' });
    const draw = () => {
      box.textContent = '';
      list.forEach((x, idx) => box.append(h('div', { class: 'line' },
        textIn(x, 'label', { cls: 'name', label: 'שם' }),
        numIn(x, 'amount', { label: x.label + (meta.yearly ? ' לשנה' : ' לחודש') }),
        delBtn(x.label, () => { list.splice(idx, 1); changed(); draw(); }))));
      box.append(addBtn('שורה', () => { const x = { id: C.uid(), label: '', amount: '' }; list.push(x); draw(); return x; }));
    };
    draw();
    openSheet(h('div', {},
      h('div', { class: 'row' }, closeX(), h('h2', {}, 'מחשבון ' + meta.label)),
      h('p', { class: 'row hint flat' }, meta.yearly ? 'מזינים כמה זה עולה בשנה. לתקציב נכנס חלקי 12.' : 'מזינים כמה זה עולה בחודש.'),
      box,
      h('div', { class: 'row total' }, h('span', {}, 'בחודש'), live('b', {}, () => money(C.calcTotal(book, k))))));
  }

  function savingsCard(book) {
    const box = h('div');
    const draw = () => {
      box.textContent = '';
      box.append(card(book.savings.map((s, idx) => h('div', { class: 'block' },
        h('div', { class: 'block-top' }, textIn(s, 'label', { cls: 'name', label: 'שם החיסכון' }), delBtn(s.label, () => { book.savings.splice(idx, 1); changed(); draw(); })),
        h('div', { class: 'grid2' },
          h('label', {}, h('small', {}, 'הפרשה חודשית'), numIn(s, 'monthly', { label: s.label + ' הפרשה חודשית' })),
          h('label', {}, h('small', {}, 'סכום מצטבר'), numIn(s, 'balance', { label: s.label + ' סכום מצטבר' }))))),
        addBtn('חיסכון', () => { const x = C.sline(''); book.savings.push(x); draw(); return x; }),
        h('div', { class: 'row total' }, h('span', {}, 'סה"כ חסכונות'), live('b', {}, () => money(C.sum(book.savings, s => s.balance)) + ' · ' + money(C.sum(book.savings, s => s.monthly)) + ' בחודש'))));
    };
    draw();
    return box;
  }
  function bankCard(book) {
    const box = h('div');
    const draw = () => {
      box.textContent = '';
      box.append(card(book.bank.map((b, idx) => h('div', { class: 'block' },
        h('div', { class: 'block-top' }, textIn(b, 'label', { cls: 'name', label: 'שם החשבון' }), delBtn(b.label, () => { book.bank.splice(idx, 1); changed(); draw(); })),
        h('div', { class: 'grid2' },
          h('label', {}, h('small', {}, 'יתרה היום'), numIn(b, 'balance', { label: b.label + ' יתרה', neg: true })),
          h('label', {}, h('small', {}, 'מסגרת'), numIn(b, 'limit', { label: b.label + ' מסגרת' }))))),
        addBtn('חשבון', () => { const x = { id: C.uid(), label: '', date: '', balance: '', limit: '' }; book.bank.push(x); draw(); return x; })));
    };
    draw();
    return box;
  }

  /* ================= month ================= */
  function renderMonth() {
    const p = S.plan;
    const key = S.month;
    const nav = h('div', { class: 'month-nav' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'החודש הקודם', onclick: () => { S.month = C.ymAdd(key, -1); route(); }, html: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
      h('h1', {}, C.ymLabel(key)),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'החודש הבא', onclick: () => { S.month = C.ymAdd(key, 1); route(); }, html: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' }));
    view.append(nav);
    const sw = bookSwitch();
    if (sw) view.append(sw);
    const m = p.months[key];
    const mb = m && m[S.book];
    if (!mb) {
      const has = Object.keys(p.months).length;
      view.append(card(h('div', { class: 'row center' },
        h('h2', {}, 'החודש עוד לא נפתח'),
        h('p', { class: 'hint' }, has ? 'התקציב יועתק מהחודש הקודם. אחר כך אפשר לשנות כל שורה.' : 'התקציב ייבנה מהמיפוי. אחר כך אפשר לשנות כל שורה.'),
        h('button', { class: 'go', type: 'button', onclick: () => {
          const mm = C.ensureMonth(p, key);
          if (!mm[S.book]) C.rebudget(p, key, S.book);
          changed(); route();
        } }, 'פתיחת ' + C.ymLabel(key)))));
      return;
    }
    const s = () => C.monthSummary(mb);
    view.append(h('div', { class: 'card sum-grid' },
      h('div', { class: 'sg-head' }, h('span', {}), h('small', {}, 'תקציב'), h('small', {}, 'בפועל')),
      h('div', {}, h('span', {}, 'הכנסות'), live('b', {}, () => money(s().incB)), live('b', {}, () => money(s().incA))),
      h('div', {}, h('span', {}, 'הוצאות'), live('b', {}, () => money(s().expB)), live('b', {}, () => money(s().expA))),
      h('div', {}, h('span', {}, 'חיסכון'), live('b', {}, () => money(s().saveB)), live('b', {}, () => money(s().saveA))),
      h('div', { class: 'sg-total' }, h('span', {}, 'תזרים'), live('b', {}, el => { el.className = toneClass(s().cashB); return money(s().cashB); }),
        live('b', { title: 'אפור: עוד לא מולאו גם הכנסות וגם הוצאות' }, el => { const x = s(); el.className = x.filled ? toneClass(x.cashA) : 'muted'; return x.started ? money(x.cashA) : 'עוד לא מולא'; }))));
    view.append(h('p', { class: 'note' }, 'בסוף החודש ממלאים בעמודה "בפועל" כמה יצא באמת, לפי האפליקציה שבה אתם מתעדים הוצאות.'));

    // rows with no budget and nothing spent stay hidden, so the month fits on a phone
    const shown = r => S.showAll || r.extra || C.num(r.b) || C.has(r.a);
    const hidden = mb.inc.concat(mb.rows).filter(r => !shown(r)).length;
    if (hidden || S.showAll) {
      view.append(h('button', { class: 'link-btn show-all', type: 'button', onclick: () => { S.showAll = !S.showAll; redraw(); } },
        S.showAll ? 'להסתיר שורות ריקות' : 'להציג גם ' + hidden + ' שורות בלי תקציב'));
    }
    view.append(sec('הכנסות'), card(mb.inc.filter(shown).map(r => monthLine(r, true, () => { mb.inc.splice(mb.inc.indexOf(r), 1); changed(); redraw(); })),
      addBtn('הכנסה', () => { const x = { id: C.uid(), label: '', b: 0, a: '', extra: true }; mb.inc.push(x); redraw(); return x; })));
    Object.keys(C.GROUPS).forEach(g => {
      const rows = mb.rows.filter(r => r.group === g);
      view.append(sec(C.GROUPS[g], live('span', { class: 'n' }, () => money(C.sum(rows, r => r.a)) + ' / ' + money(C.sum(rows, r => r.b)))),
        card(rows.filter(shown).map(r => monthLine(r, false, () => { mb.rows.splice(mb.rows.indexOf(r), 1); changed(); redraw(); })),
          addBtn('שורה', () => { const x = { id: C.uid(), label: '', group: g, b: 0, a: '', extra: true }; mb.rows.push(x); redraw(); return x; })));
    });

    // checking-account check
    const acct = (p[S.book].bank[0] || {});
    view.append(sec('בדיקת עובר ושב'), flowCard(mb, acct));
    view.append(sec('הערות לחודש'), card(h('div', { class: 'row' }, textIn(mb, 'note', { area: true, label: 'הערות לחודש', ph: 'מה היה מיוחד החודש, מה לשפר בחודש הבא' }))));
    view.append(h('button', { class: 'ghost wide', type: 'button', onclick: () => {
      if (!confirm('לבנות מחדש את התקציב של ' + C.ymLabel(key) + ' מהמיפוי? מה שמילאתם ב"בפועל" נשאר.')) return;
      C.rebudget(p, key, S.book); changed(); redraw(); toast('התקציב עודכן מהמיפוי');
    } }, 'עדכון התקציב מהמיפוי'));
  }

  // income above budget is good news: only expenses turn red
  function monthLine(r, income, remove) {
    const bar = live('div', { class: 'bar' }, el => {
      const b = C.num(r.b), a = C.num(r.a);
      el.className = 'bar' + (C.has(r.a) && b && a > b ? (income ? ' good' : ' over') : '');
      el.style.setProperty('--w', (b ? Math.min(100, Math.round(a / b * 100)) : (a ? 100 : 0)) + '%');
    });
    return h('div', { class: 'mline' + (r.extra ? ' extra' : '') },
      r.extra ? textIn(r, 'label', { cls: 'name', label: 'שם השורה', ph: 'שורה חדשה' }) : h('div', { class: 'name static' }, h('span', {}, r.label)),
      h('label', { class: 'mcol' }, h('small', {}, 'תקציב'), numIn(r, 'b', { label: r.label + ' תקציב', small: true, unit: false })),
      h('label', { class: 'mcol' }, h('small', {}, 'בפועל'), numIn(r, 'a', { label: r.label + ' בפועל', small: true, unit: false })),
      r.extra && remove ? delBtn(r.label, remove) : h('span', { class: 'del-space' }),
      bar);
  }

  function flowCard(mb, acct) {
    mb.flow = mb.flow || { start: '', items: [] };
    const f = mb.flow;
    const box = h('div');
    const draw = () => {
      box.textContent = '';
      box.append(card(
        h('div', { class: 'row' },
          h('p', { class: 'hint' }, 'מה נכנס ומה יורד מהחשבון ובאיזה יום. כך רואים מתי החשבון מגיע לנקודה הכי נמוכה.'),
          h('label', { class: 'lbl', for: 'fl-start' }, 'יתרה בתחילת החודש'), numIn(f, 'start', { id: 'fl-start', neg: true, label: 'יתרה בתחילת החודש' })),
        f.items.map((x, idx) => h('div', { class: 'line flow' },
          h('select', { class: 'field sm dir', 'aria-label': 'נכנס או יורד', onchange: e => { x.dir = e.target.value; changed(); } },
            h('option', { value: 'out', selected: x.dir !== 'in' }, 'יורד'), h('option', { value: 'in', selected: x.dir === 'in' }, 'נכנס')),
          textIn(x, 'label', { cls: 'name', label: 'מה', ph: 'מה' }),
          numIn(x, 'day', { label: 'יום בחודש', ph: 'יום', small: true, unit: false }),
          numIn(x, 'amount', { label: 'סכום', small: true }),
          delBtn(x.label, () => { f.items.splice(idx, 1); changed(); draw(); }))),
        addBtn('תנועה', () => { const x = { id: C.uid(), label: '', day: '', amount: '', dir: 'out' }; f.items.push(x); draw(); return x; }),
        live('div', { class: 'row total' }, el => {
          const r = C.flowCheck(f, acct.limit);
          if (!r.steps.length) return 'עוד אין תנועות';
          el.className = 'row total ' + (r.overLimit ? 'tone-neg' : r.minus ? 'tone-mid' : 'tone-pos');
          return 'הנקודה הכי נמוכה: ' + money(r.low.balance) + (r.low.day ? ' ביום ' + r.low.day : '') + (r.overLimit ? ' · מעבר למסגרת' : r.minus ? ' · במינוס' : '') + ' · סוף החודש ' + money(r.end);
        })));
    };
    draw();
    return box;
  }

  /* ================= debts ================= */
  function renderDebts() {
    const p = S.plan, bk = S.book, book = p[bk];
    const d = () => C.debtStats(book);
    view.append(head('חובות ונכסים', null, bookSwitch()));
    view.append(h('div', { class: 'card sum-bar' },
      stat('חובות (בלי משכנתא)', () => money(d().principal)),
      stat('החזר בחודש', () => money(d().payments + d().cardFixed + d().mortgagePayment)),
      tonedStat('שווי נקי', () => C.netWorth(p, C.ym()).net)));
    view.append(h('p', { class: 'note' }, 'שווי נקי: חסכונות, יתרות בבנק ושווי הדירה, פחות משכנתא, הלוואות, אשראי ועסקאות בתשלומים.'));

    // loans
    const lbox = h('div');
    const drawLoans = () => {
      lbox.textContent = '';
      lbox.append(card(book.loans.map((l, idx) => h('div', { class: 'block' },
        h('div', { class: 'block-top' }, textIn(l, 'label', { cls: 'name', label: 'שם הנושה' }),
          live('span', { class: 'badge' }, () => (l.mortgage ? 'משכנתא' : C.num(l.left) > 18 ? 'מעל 18 תשלומים' : C.has(l.left) ? 'עד 18 תשלומים' : '')),
          delBtn(l.label, () => { book.loans.splice(idx, 1); book.sims.forEach(s => { s.closes = s.closes.filter(x => x !== l.id); }); changed(); drawLoans(); })),
        h('div', { class: 'grid2' },
          h('label', {}, h('small', {}, 'יתרת קרן'), numIn(l, 'principal', { label: l.label + ' יתרת קרן' })),
          h('label', {}, h('small', {}, 'החזר חודשי'), numIn(l, 'payment', { label: l.label + ' החזר חודשי' })),
          h('label', {}, h('small', {}, 'תשלומים שנותרו'), numIn(l, 'left', { label: l.label + ' תשלומים שנותרו', unit: false })),
          h('label', {}, h('small', {}, 'ריבית שנתית'), numIn(l, 'rate', { label: l.label + ' ריבית', unit: '%' })),
          h('label', {}, h('small', {}, 'סכום מקורי'), numIn(l, 'original', { label: l.label + ' סכום מקורי' })),
          h('label', {}, h('small', {}, 'נכון לתאריך'), textIn(l, 'asOf', { label: 'נכון לתאריך', ph: 'dd/mm/yyyy' }))),
        h('div', { class: 'block-foot' }, check(l, 'mortgage', 'משכנתא'), live('span', { class: 'hint' }, () => 'נותר לשלם כולל ריבית: ' + money(C.loanRow(l).remaining)))))
        , addBtn('הלוואה', () => { const x = { id: C.uid(), label: '', original: '', principal: '', asOf: '', rate: '', left: '', payment: '', note: '' }; book.loans.push(x); drawLoans(); return x; }),
        h('div', { class: 'row total' }, h('span', {}, 'נותר לשלם (בלי משכנתא)'), live('b', {}, () => money(d().remaining)))));
    };
    drawLoans();
    view.append(sec('הלוואות ומשכנתא'), lbox,
      h('p', { class: 'note' }, 'לא לשכוח: אוברדראפט, הלוואות דרך המשכורת או מהעבודה, גמ"חים, חברים ומשפחה, מכולת, רופא שיניים, שיקים בחוץ.'));

    // installments
    const ibox = h('div');
    const drawInst = () => {
      ibox.textContent = '';
      const now = C.ym();
      ibox.append(card(book.installments.map((it, idx) => h('div', { class: 'block' },
        h('div', { class: 'block-top' }, textIn(it, 'label', { cls: 'name', label: 'מה נקנה', ph: 'מה נקנה' }), delBtn(it.label, () => { book.installments.splice(idx, 1); changed(); drawInst(); })),
        h('div', { class: 'grid2' },
          h('label', {}, h('small', {}, 'סכום תשלום'), numIn(it, 'amount', { label: it.label + ' סכום תשלום' })),
          h('label', {}, h('small', {}, 'מספר תשלומים'), numIn(it, 'total', { label: it.label + ' מספר תשלומים', unit: false })),
          h('label', {}, h('small', {}, 'תשלום ראשון'), monthIn(it, 'first', { label: 'חודש התשלום הראשון' })),
          h('label', {}, h('small', {}, 'כרטיס'), textIn(it, 'card', { label: 'כרטיס' }))),
        live('div', { class: 'block-foot hint' }, () => {
          const x = C.installmentAt(it, now);
          if (!it.first || !C.num(it.total)) return 'ממלאים את חודש התשלום הראשון והמספר מתעדכן לבד כל חודש';
          if (x.no < 1) return 'מתחיל בעוד ' + (1 - x.no) + ' חודשים · נותר לשלם ' + money(x.remaining);
          if (!x.active) return 'הסתיים';
          return 'החודש תשלום ' + x.no + ' מתוך ' + C.num(it.total) + ' · נותר לשלם ' + money(x.remaining);
        }))),
        addBtn('עסקה בתשלומים', () => { const x = { id: C.uid(), card: '', label: '', total: '', amount: '', first: C.ym() }; book.installments.push(x); drawInst(); return x; }),
        h('div', { class: 'row total' }, h('span', {}, 'החודש'), live('b', {}, () => money(C.installmentStats(book, now).monthly) + ' · נותר ' + money(C.installmentStats(book, now).remaining)))));
    };
    drawInst();
    view.append(sec('עסקאות בתשלומים'), ibox);

    // cards
    const cbox = h('div');
    const drawCards = () => {
      cbox.textContent = '';
      cbox.append(card(book.cards.map((c, idx) => h('div', { class: 'block' },
        h('div', { class: 'block-top' }, textIn(c, 'label', { cls: 'name', label: 'כרטיס', ph: 'שם הכרטיס' }), delBtn(c.label, () => { book.cards.splice(idx, 1); changed(); drawCards(); })),
        h('div', { class: 'grid2' },
          h('label', {}, h('small', {}, 'מסגרת'), numIn(c, 'limit', { label: c.label + ' מסגרת' })),
          h('label', {}, h('small', {}, 'סל מצטבר'), numIn(c, 'balance', { label: c.label + ' סל מצטבר' })),
          h('label', {}, h('small', {}, 'חיוב קבוע בחודש'), numIn(c, 'fixed', { label: c.label + ' חיוב קבוע' })),
          h('label', {}, h('small', {}, 'יום חיוב'), numIn(c, 'day', { label: c.label + ' יום חיוב', unit: false }))))),
        addBtn('כרטיס אשראי', () => { const x = { id: C.uid(), label: '', day: '', limit: '', balance: '', fixed: '' }; book.cards.push(x); drawCards(); return x; })));
    };
    drawCards();
    view.append(sec('כרטיסי אשראי'), cbox);

    // spitzer calculator (not saved: a scratch pad)
    const sp = { amount: '', months: '', rate: '' };
    view.append(sec('מחשבון הלוואה (שפיצר)'), card(h('div', { class: 'row' },
      h('div', { class: 'grid3' },
        h('label', {}, h('small', {}, 'סכום'), numIn(sp, 'amount', { label: 'סכום הלוואה' })),
        h('label', {}, h('small', {}, 'חודשים'), numIn(sp, 'months', { label: 'חודשים', unit: false })),
        h('label', {}, h('small', {}, 'ריבית'), numIn(sp, 'rate', { label: 'ריבית שנתית', unit: '%' }))),
      live('p', { class: 'total-line' }, () => {
        const pay = C.pmt(sp.rate, sp.months, sp.amount);
        return pay ? 'החזר חודשי: ' + money(pay) + ' · סה"כ ' + money(pay * C.num(sp.months)) : 'ממלאים סכום, חודשים וריבית';
      }))));

    // consolidation simulations
    book.sims.forEach((s, i) => view.append(sec('סימולציה ' + (i + 1) + ' לסגירת הלוואות'), simCard(book, s)));

    if (bk === 'home') {
      const m = () => C.mortgageStats(p);
      view.append(sec('משכנתא'), card(h('div', { class: 'row' },
        h('div', { class: 'grid2' },
          h('label', {}, h('small', {}, 'שווי הנכס'), numIn(book.mortgage, 'value', { label: 'שווי הנכס' })),
          h('label', {}, h('small', {}, 'גוף מממן'), textIn(book.mortgage, 'lender', { label: 'גוף מממן' }))),
        live('div', { class: 'facts mt' }, () => {
          const x = m();
          if (!x.value) return h('div', {}, h('small', {}, 'ממלאים את שווי הנכס, ואת המשכנתא כהלוואה עם סימון "משכנתא"'));
          return h('div', { class: 'facts-in' },
            h('div', {}, h('small', {}, 'אחוז מימון'), h('b', {}, pct(x.share))),
            h('div', {}, h('small', {}, 'עד 50% מימון'), h('b', {}, money(Math.max(0, x.to50)))),
            h('div', {}, h('small', {}, 'עד 70% מימון'), h('b', {}, money(Math.max(0, x.to70)))),
            h('div', {}, h('small', {}, 'כושר החזר'), h('b', { class: x.ratio > 0.4 ? 'tone-neg' : x.ratio > 0.3 ? 'tone-mid' : '' }, x.payslips ? pct(x.ratio) : '—')));
        }),
        h('p', { class: 'hint mt' }, 'כושר החזר: החזרי המשכנתא וההלוואות חלקי ההכנסות שמסומנות "תלוש" במיפוי.'))));
    }

    view.append(sec('דירוג אשראי'), card(h('div', { class: 'row grid2' },
      h('label', {}, h('small', {}, 'דירוג'), numIn(book.credit, 'score', { label: 'דירוג אשראי', unit: false })),
      h('label', {}, h('small', {}, 'נכון לתאריך'), textIn(book.credit, 'date', { label: 'נכון לתאריך', ph: 'dd/mm/yyyy' })))));
  }

  function simCard(book, s) {
    const box = h('div');
    const draw = () => {
      box.textContent = '';
      box.append(card(h('div', { class: 'row' },
        h('div', { class: 'grid3' },
          h('label', {}, h('small', {}, 'הלוואה חדשה'), numIn(s, 'amount', { label: 'סכום ההלוואה החדשה' })),
          h('label', {}, h('small', {}, 'חודשים'), numIn(s, 'months', { label: 'חודשים', unit: false })),
          h('label', {}, h('small', {}, 'ריבית'), numIn(s, 'rate', { label: 'ריבית', unit: '%' }))),
        h('label', { class: 'lbl mt' }, 'סוגרים איתה את:'),
        book.loans.filter(l => !l.mortgage).length ? h('div', { class: 'pills' }, book.loans.filter(l => !l.mortgage).map(l =>
          h('label', {}, h('input', { type: 'checkbox', checked: s.closes.includes(l.id), onchange: e => { s.closes = e.target.checked ? s.closes.concat(l.id) : s.closes.filter(x => x !== l.id); changed(); } }),
            h('span', {}, (l.label || 'הלוואה') + ' · ' + money(l.principal))))) : h('p', { class: 'hint' }, 'עוד אין הלוואות ברשימה למעלה.'),
        live('div', { class: 'facts mt' }, () => {
          const r = C.simResult(book, s);
          return h('div', { class: 'facts-in' },
            h('div', {}, h('small', {}, 'החזר חדש'), h('b', {}, money(r.payment))),
            h('div', {}, h('small', {}, 'נשאר ביד'), h('b', { class: r.cashLeft < 0 ? 'tone-neg' : '' }, money(r.cashLeft))),
            h('div', {}, h('small', {}, 'חיסכון בחודש'), h('b', { class: r.saving > 0 ? 'tone-pos' : r.saving < 0 ? 'tone-neg' : '' }, money(r.saving))));
        }),
        h('div', { class: 'mt' }, check(s, 'on', 'להכניס את החיסכון לתקציב (כמו שורת הסימולציה במיפוי)')))));
    };
    draw();
    return box;
  }

  /* ================= goals ================= */
  function renderGoals() {
    const p = S.plan, lt = p.lt;
    const L = () => C.longTerm(p);
    view.append(head('יעדים ותוכנית לטווח ארוך', 'לפי החודש הממוצע במיפוי'));
    view.append(h('div', { class: 'card sum-bar' },
      stat('הכנסות', () => money(L().avg.income)),
      stat('הוצאות', () => money(L().avg.fixed + L().avg.variable)),
      tonedStat('פנוי לחיסכון', () => L().avg.cashflow)));

    view.append(sec('המטרות שלנו במילים'), card(h('div', { class: 'row' }, textIn(p, 'goalsText', { area: true, label: 'המטרות שלנו', ph: 'מה חשוב לנו להשיג בתהליך' }))));

    // where the money goes every month
    const rows = [
      ['emergency', 'קרן חירום', 'יעד: 3 חודשי הוצאות', false],
      ['long', 'חיסכון לטווח ארוך', '', true],
      ['kids', 'חיסכון לילדים', '', true],
      ['goals', 'מטרות ויעדים', 'מהרשימה למטה', false],
      ['buffer', 'תזרים ביטחון בעובר ושב', '', true],
      ['account', 'סכום בעובר ושב', 'יעד: חודש הוצאות', false]
    ];
    view.append(sec('לאן הולך הכסף כל חודש'), card(rows.map(([k, label, note, ownTarget]) => {
      const item = () => L().items.find(i => i.key === k);
      const o = k === 'goals' ? null : lt[k];
      return h('div', { class: 'block' },
        h('div', { class: 'block-top' }, h('b', { class: 'name static' }, label), live('span', { class: 'badge' }, () => months(item().months))),
        h('div', { class: 'grid3' },
          h('label', {}, h('small', {}, 'יעד'), ownTarget ? numIn(o, 'target', { label: label + ' יעד' }) : live('div', { class: 'ro' }, () => money(item().target))),
          h('label', {}, h('small', {}, 'יש היום'), k === 'goals' ? numIn(lt, 'goalsHave', { label: label + ' קיים' }) : numIn(o, 'have', { label: label + ' קיים' })),
          h('label', {}, h('small', {}, 'בחודש'), k === 'goals' ? live('div', { class: 'ro' }, () => money(item().monthly)) : numIn(o, 'monthly', { label: label + ' הפרשה חודשית' }))),
        note ? h('small', { class: 'hint' }, note) : null,
        live('div', { class: 'meter wide' }, el => { const i = item(); el.textContent = ''; el.append(h('i', { style: 'width:' + (i.target ? Math.min(100, Math.round(i.have / i.target * 100)) : 0) + '%' })); }));
    }),
    h('div', { class: 'row total' }, h('span', {}, 'פנוי אחרי ההפרשות'), live('b', {}, el => { const v = L().free; el.className = toneClass(v); return money(v); })),
    live('div', { class: 'row hint flat' }, () => {
      const x = L();
      return 'חסכונות קיימים: ' + money(x.existing) + ' · נשאר להפקדה חד פעמית: ' + money(x.oneTime) +
        (x.emergencyMonths != null ? ' · קרן החירום מתמלאת בעוד ' + months(x.emergencyMonths) : '');
    })));

    // goals list
    const gbox = h('div');
    const drawGoals = () => {
      gbox.textContent = '';
      gbox.append(card(lt.goals.map((g, idx) => h('div', { class: 'block' },
        h('div', { class: 'block-top' }, textIn(g, 'label', { cls: 'name', label: 'היעד' }), delBtn(g.label, () => { lt.goals.splice(idx, 1); changed(); drawGoals(); })),
        h('div', { class: 'grid3' },
          h('label', {}, h('small', {}, 'סכום'), numIn(g, 'amount', { label: g.label + ' סכום' })),
          h('label', {}, h('small', {}, 'בעוד חודשים'), numIn(g, 'months', { label: g.label + ' חודשים', unit: false })),
          h('label', {}, h('small', {}, 'מקור מימון אחר'), numIn(g, 'other', { label: g.label + ' מימון אחר' }))),
        live('div', { class: 'block-foot hint' }, () => 'חיסכון חודשי: ' + money(C.goalMonthly(g))))),
        addBtn('יעד', () => { const x = { id: C.uid(), label: '', months: '', amount: '', other: '' }; lt.goals.push(x); drawGoals(); return x; }),
        h('div', { class: 'row total' }, h('span', {}, 'סה"כ ליעדים'), live('b', {}, () => money(L().goalsMonthly) + ' בחודש'))));
    };
    drawGoals();
    view.append(sec('יעדים'), gbox);

    // after the emergency fund is full
    const abox = h('div');
    const drawAfter = () => {
      abox.textContent = '';
      abox.append(card(lt.after.map((a, idx) => h('div', { class: 'line' },
        textIn(a, 'label', { cls: 'name', label: 'לאן' }), numIn(a, 'amount', { label: a.label + ' בחודש' }),
        delBtn(a.label, () => { lt.after.splice(idx, 1); changed(); drawAfter(); }))),
        addBtn('שורה', () => { const x = { id: C.uid(), label: '', amount: '' }; lt.after.push(x); drawAfter(); return x; }),
        h('div', { class: 'row total' }, h('span', {}, 'פנוי'), live('b', {}, el => { const v = L().after; el.className = toneClass(v); return money(v); }))));
    };
    drawAfter();
    view.append(sec('אחרי שקרן החירום מלאה'), abox, h('p', { class: 'note' }, 'ההפרשה לקרן החירום מתפנה. כאן מחליטים לאן היא עוברת.'));

    // expected long-term savings
    view.append(sec('כמה יהיה בעוד כמה שנים'), card(h('div', { class: 'row' },
      h('label', { class: 'lbl', for: 'hz' }, 'בעוד כמה חודשים'), numIn(lt, 'horizon', { id: 'hz', unit: false, label: 'חודשים' }),
      live('p', { class: 'total-line' }, () => {
        const parts = [['חיסכון לטווח ארוך', lt.long], ['חיסכון לילדים', lt.kids]].filter(([, o]) => C.num(o.have) || C.num(o.monthly))
          .map(([label, o]) => C.expectedSentence(label, o.have, o.monthly, lt.horizon));
        return parts.length ? parts.join('. ') + '.' : 'ממלאים למעלה כמה יש היום וכמה מפרישים בחודש לחיסכון לטווח ארוך או לילדים.';
      }),
      h('p', { class: 'hint' }, 'בלי תשואה: רק מה שיש היום ועוד ההפרשות.'))));
  }

  /* ================= year ================= */
  function renderYear() {
    const p = S.plan;
    const years = new Set(Object.keys(p.months).map(k => k.slice(0, 4)).concat(C.ym().slice(0, 4)));
    const sel = h('select', { class: 'field sm', 'aria-label': 'שנה', onchange: e => { S.year = e.target.value; route(); } },
      Array.from(years).sort().map(y => h('option', { value: y, selected: y === S.year }, y)));
    view.append(h('a', { class: 'back', href: '#home' }, 'חזרה'), head('סיכום שנתי', null, sel));
    const sw = bookSwitch();
    if (sw) view.append(sw);
    const y = C.yearSummary(p, S.year, S.book);
    if (!y.months) {
      view.append(card(h('div', { class: 'all-clear' }, h('b', {}, 'עוד אין חודשים עם ביצוע ב-' + S.year), 'אחרי שממלאים "בפועל" בחודש, הוא נכנס לכאן.')));
      return;
    }
    const max = Math.max(1, ...y.rows.map(r => Math.max(r.income, r.expenses)));
    view.append(card(h('div', { class: 'row' },
      h('div', { class: 'legend' }, h('span', { class: 'k inc' }, 'הכנסות'), h('span', { class: 'k exp' }, 'הוצאות')),
      h('div', { class: 'ybars', role: 'img', 'aria-label': 'הכנסות והוצאות לפי חודש' }, y.rows.map(r => h('div', { class: r.filled ? '' : 'nodata' },
        h('div', { class: 'pair' }, h('i', { class: 'inc', style: 'height:' + Math.round(r.income / max * 100) + '%' }), h('i', { class: 'exp', style: 'height:' + Math.round(r.expenses / max * 100) + '%' })),
        h('small', {}, r.name.slice(0, 3))))))));
    const block = (title, st) => card(h('div', { class: 'row' }, h('h2', {}, title), h('div', { class: 'facts-in' },
      h('div', {}, h('small', {}, 'סה"כ'), h('b', { class: title === 'תזרים' ? toneClass(st.total) : '' }, money(st.total))),
      h('div', {}, h('small', {}, 'ממוצע לחודש'), h('b', {}, money(st.avg))),
      h('div', {}, h('small', {}, 'הגבוה'), h('b', {}, st.max.name), h('small', {}, money(st.max.value))),
      h('div', {}, h('small', {}, 'הנמוך'), h('b', {}, st.min.name), h('small', {}, money(st.min.value))))));
    view.append(sec('על פני ' + y.months + ' חודשים'), block('הכנסות', y.income), block('הוצאות', y.expenses), block('תזרים', y.cashflow));
    view.append(card(y.rows.filter(r => r.filled).map(r => h('a', { class: 'item', href: '#month', onclick: () => { S.month = r.key; } },
      h('div', { class: 'main' }, h('b', {}, r.name), h('small', {}, money(r.income) + ' הכנסות · ' + money(r.expenses) + ' הוצאות')),
      h('span', { class: 'amt ' + toneClass(r.cashflow) }, money(r.cashflow))))));
  }

  /* ================= meetings ================= */
  function renderMeetings() {
    const p = S.plan;
    const admin = S.role === 'admin';
    view.append(h('a', { class: 'back', href: '#home' }, 'חזרה'), head('הפגישות שלנו', 'מה סיכמנו ומה לקחתם מכל פגישה'));
    view.append(card(h('div', { class: 'row' }, h('label', { class: 'lbl', for: 'gt' }, 'המטרות שלנו בתוכנית'), textIn(p, 'goalsText', { area: true, id: 'gt', label: 'המטרות' }))));
    const ADV = [['date', 'תאריך'], ['topic', 'נושא הפגישה'], ['purpose', 'מטרת הפגישה'], ['tasks', 'משימות עד הפגישה הבאה', true]];
    const CLI = n => [
      n > 1 ? ['applied', 'יישמתם את המשימות מהפגישה הקודמת?', true] : null,
      ['took', n === 4 ? 'מה לקחתם מפגישת הסיכום?' : 'מה לקחתם מהפגישה?', true],
      n > 1 && n < 4 ? ['achieved', 'איזה יעד כבר הושג או בדרך?', true] : null,
      n > 1 && n < 4 ? ['improvement', 'מה השתפר בתזרים מאז הפגישה הראשונה?', true] : null,
      n < 4 ? ['ask', 'משהו שתרצו לבקש ממני?', true] : null,
      n === 4 ? ['goalsReached', 'אילו מהמטרות שהגדרתם בהתחלה השגתם, או שאתם בדרך?', true] : null,
      n === 4 ? ['impact', 'איך זה ישפיע על החיים שלכם מעכשיו?', true] : null,
      n === 4 ? ['yearFromNow', 'אם תמשיכו בדרך הזו, איך ייראו החיים בעוד שנה?', true] : null,
      n === 4 ? ['words', 'כמה מילים בשבילי', true] : null
    ].filter(Boolean);
    p.meetings.forEach(m => {
      const filled = ADV.some(([k]) => m[k]) || CLI(m.n).some(([k]) => m[k]);
      view.append(h('details', { class: 'card meeting', open: filled || m.n === 1 || null },
        h('summary', {}, h('b', {}, 'פגישה ' + m.n + (m.n === 4 ? ' · סיכום' : '')), h('small', {}, m.topic || (filled ? '' : 'עוד לא התקיימה'))),
        h('div', { class: 'row' }, h('h3', {}, 'מה סיכמנו'),
          ADV.map(([k, label, area]) => h('label', { class: 'fld' }, h('small', {}, label),
            admin ? textIn(m, k, { area, label }) : h('div', { class: 'ro-text' }, m[k] || '—')))),
        h('div', { class: 'row' }, h('h3', {}, 'אצלכם'),
          CLI(m.n).map(([k, label, area]) => h('label', { class: 'fld' }, h('small', {}, label), textIn(m, k, { area, label }))))));
    });
  }

  /* ---------- start ---------- */
  $('demo').hidden = !Api.MOCK;
  if (ADMIN) {
    if (!store.get('plan-admin')) { gate(); return; }
    startAdmin();
    return;
  }
  const t = params.get('t');
  if (t) {
    // keep the link in this device, then take it out of the address bar
    if (t !== store.get('plan-token')) store.set('plan-pin', '');
    store.set('plan-token', t);
    history.replaceState(null, '', location.pathname + MOCK_Q + location.hash);
  }
  const token = t || store.get('plan-token');
  S.auth = token ? { token, pin: store.get('plan-pin') } : null;
  if (!token || !S.auth.pin) { gate(); return; }
  load().catch(err => { store.set('plan-pin', ''); gate(Api.errText(err.code)); });
})();
