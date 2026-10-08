/* מערכת הניהול: היום, אנשים, כרטיס, כלים, מספרים. מדברת עם Crm.gs דרך shared/api.js. */
(function () {
  'use strict';

  const STAGES = [
    ['new', 'ליד חדש'], ['contact', 'בקשר'], ['intro', 'שיחת היכרות'], ['sent', 'נשלח חוזה'],
    ['signed', 'חתם'], ['active', 'בליווי'], ['ended', 'סיים'], ['lost', 'לא רלוונטי']
  ];
  const STAGE = Object.fromEntries(STAGES);
  const SOURCE = { tool: 'כלי באתר', instagram: 'אינסטגרם', referral: 'המלצה', whatsapp: 'וואטסאפ', other: 'אחר' };
  const METHOD = { bit: 'ביט', transfer: 'העברה', cash: 'מזומן', other: 'אחר' };
  const GENDER = { c: 'זוג', m: 'זכר', f: 'נקבה' };
  const FILTERS = [
    ['all', 'הכל', null], ['leads', 'לידים', ['new', 'contact', 'intro']], ['process', 'בתהליך', ['sent', 'signed', 'active']],
    ['ended', 'סיימו', ['ended']], ['lost', 'לא רלוונטי', ['lost']]
  ];
  const CLIENT = ['signed', 'active', 'ended'];
  const MEETINGS = 4;
  const DAY = 86400000;
  const SITE = new URL('..', location.href).href; // hub root

  const $ = id => document.getElementById(id);
  const view = $('view');
  const S = { password: '', people: [], payments: [], agenda: [], loadedAt: 0, catalog: null, filter: 'all', q: '' };

  /* ---------- tiny DOM helper: strings always go in as text ---------- */
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
  const ICON = {
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>'
  };

  /* ---------- formatting ---------- */
  const money = n => Math.round(Number(n) || 0).toLocaleString('he-IL') + ' ₪';
  const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function dayLabel(iso) {
    const diff = Math.round((startOfDay(iso) - startOfDay(Date.now())) / DAY);
    if (diff === 0) return 'היום';
    if (diff === 1) return 'מחר';
    if (diff === -1) return 'אתמול';
    const d = new Date(iso);
    if (diff > 1 && diff < 7) return 'יום ' + d.toLocaleDateString('he-IL', { weekday: 'long' }).replace('יום ', '');
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : '2-digit' });
  }
  const time = iso => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const when = iso => dayLabel(iso) + ' ' + time(iso);
  function ago(iso) {
    const days = Math.floor((Date.now() - new Date(iso)) / DAY);
    if (days < 1) return 'היום';
    if (days === 1) return 'אתמול';
    if (days < 30) return 'לפני ' + days + ' ימים';
    const m = Math.round(days / 30);
    return m === 1 ? 'לפני חודש' : 'לפני ' + m + ' חודשים';
  }
  const toolTitle = slug => {
    const t = S.catalog && S.catalog.find(x => x.slug === slug);
    return t ? t.title : slug;
  };
  const sourceText = p => p.source === 'tool' ? (p.tool ? toolTitle(p.tool) : SOURCE.tool) :
    (SOURCE[p.source] || 'אחר') + (p.tool ? ' · ' + toolTitle(p.tool) : '');
  const intlPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('0') ? '972' + d.slice(1) : d; };
  const waUrl = (phone, text) => 'https://wa.me/' + intlPhone(phone) + (text ? '?text=' + encodeURIComponent(text) : '');
  const firstName = name => String(name).split(/\s+ו?/)[0];
  const onboardText = (name, url) => 'היי ' + firstName(name) + ', כאן חי 🙂\nלפני שיוצאים לדרך, הנה ההסכמות לחתימה ושאלון קצר לפני הפגישה הראשונה:\n' + url;

  /* ---------- feedback ---------- */
  let toastTimer;
  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast' + (bad ? ' bad' : ''); }, 2600);
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const t = h('textarea', {}, text);
      document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
    }
    toast(msg || 'הועתק');
  }

  /* ---------- data ---------- */
  async function api(action, data) {
    try {
      return await Api.call(action, Object.assign({ password: S.password }, data));
    } catch (err) {
      if (err.code === 'auth' || err.code === 'locked') { logout(Api.errText(err.code)); }
      throw err;
    }
  }
  async function loadAll() {
    const btn = $('refresh');
    btn.classList.add('spin');
    try {
      const res = await api('crm_list');
      S.people = res.people;
      S.payments = res.payments || [];
      S.agenda = res.agenda || [];
      S.loadedAt = Date.now();
    } finally { btn.classList.remove('spin'); }
  }
  async function loadCatalog() {
    if (S.catalog) return S.catalog;
    try {
      const r = await fetch(SITE + 'catalog.json', { cache: 'no-store' });
      S.catalog = (await r.json()).tools;
    } catch (e) { S.catalog = null; }
    return S.catalog;
  }
  // keep the list in step with a card we just changed
  function merge(person) {
    const i = S.people.findIndex(x => x.id === person.id);
    if (i >= 0) S.people[i] = Object.assign(S.people[i], person);
    else S.people.push(person);
  }

  /* ---------- login ---------- */
  const store = {
    get() { try { return localStorage.getItem('hub-admin') || ''; } catch (e) { return ''; } },
    set(v) { try { v ? localStorage.setItem('hub-admin', v) : localStorage.removeItem('hub-admin'); } catch (e) { /* session only */ } }
  };
  function showApp(on) {
    $('login').hidden = on;
    view.hidden = !on;
    $('tabs').hidden = !on;
    $('refresh').hidden = !on;
    if (!on) setTimeout(() => $('pw').focus(), 50);
  }
  function logout(msg) {
    store.set('');
    S.password = '';
    showApp(false);
    $('loginErr').textContent = msg || '';
  }
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('loginForm').querySelector('button');
    S.password = $('pw').value;
    $('loginErr').textContent = '';
    btn.disabled = true;
    try {
      await loadAll();
      store.set(S.password);
      $('pw').value = '';
      showApp(true);
      route();
    } catch (err) {
      $('loginErr').textContent = Api.errText(err.code);
    } finally { btn.disabled = false; }
  });

  /* ---------- router ---------- */
  function route() {
    const hash = location.hash.slice(1);
    const tab = hash.startsWith('p=') ? 'people' : (['today', 'people', 'tools', 'stats'].includes(hash) ? hash : 'today');
    document.querySelectorAll('.tabs a').forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    view.textContent = '';
    window.scrollTo(0, 0);
    if (hash.startsWith('p=')) return renderPerson(hash.slice(2));
    ({ today: renderToday, people: renderPeople, tools: renderTools, stats: renderStats })[tab]();
  }
  window.addEventListener('hashchange', () => { if (S.password) route(); });
  $('refresh').addEventListener('click', async () => {
    try { await loadAll(); S.catalog = null; await loadCatalog(); route(); toast('עודכן'); }
    catch (err) { toast(Api.errText(err.code), true); }
  });
  // back to the app after a while away: fresh data
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.password && Date.now() - S.loadedAt > 120000 && !$('dlg').open) {
      loadAll().then(() => { if (!location.hash.startsWith('#p=')) route(); }).catch(() => {});
    }
  });

  /* ---------- pieces ---------- */
  const badge = stage => h('span', { class: 'badge ' + stage }, STAGE[stage] || stage);
  const sec = (title, n, hot) => h('h2', { class: 'sec' }, title, n != null ? h('span', { class: 'n' + (hot ? ' hot' : '') }, n) : null);
  const card = (...kids) => h('div', { class: 'card' }, kids);
  const waQuick = (phone, label) => h('a', { class: 'quick', href: waUrl(phone), target: '_blank', rel: 'noopener', 'aria-label': 'וואטסאפ ל' + label, html: ICON.wa, onclick: e => e.stopPropagation() });
  function personItem(p, sub, end) {
    return h('a', { class: 'item', href: '#p=' + p.id },
      h('div', { class: 'main' }, h('b', {}, p.name), h('small', {}, sub)),
      h('div', { class: 'end' }, end));
  }
  const byName = name => S.people.find(p => p.name === name);

  /* ---------- today ---------- */
  function renderToday() {
    const now = Date.now();
    const hour = new Date().getHours();
    view.append(h('div', { class: 'head' },
      h('h1', {}, hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב'),
      h('small', {}, new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }))));

    // calendar: next 7 days
    const agenda = S.agenda.filter(a => new Date(a.end) > now);
    view.append(sec('ביומן השבוע', agenda.length));
    view.append(agenda.length ? card(agenda.map(a => {
      const p = S.people.find(x => a.title.endsWith(': ' + x.name));
      const inner = [h('div', { class: 'when' }, a.allDay ? 'כל היום' : time(a.start), h('small', {}, dayLabel(a.start))),
        h('div', { class: 'main' }, h('b', {}, a.title.split(': ').pop()), h('small', {}, a.title.includes(': ') ? a.title.split(': ')[0] : ''))];
      return p ? h('a', { class: 'item', href: '#p=' + p.id }, inner) : h('div', { class: 'item' }, inner);
    })) : card(h('div', { class: 'all-clear' }, 'אין פגישות ב-7 הימים הקרובים')));

    const lists = [
      ['לחזור אליהם', S.people.filter(p => p.stage === 'new').sort((a, b) => a.created.localeCompare(b.created)),
        p => personItem(p, sourceText(p) + ' · ' + ago(p.created), [now - new Date(p.created) > 2 * DAY ? h('span', { class: 'dot', title: 'מחכה מעל יומיים' }) : null, waQuick(p.phone, p.name)]), true],
      ['לקבוע פגישה', S.people.filter(p => ['signed', 'active'].includes(p.stage) && !p.nextMeetingAt),
        p => personItem(p, p.meetingsDone ? 'היו ' + p.meetingsDone + ' מתוך ' + MEETINGS + ' פגישות' : 'חתם, עוד לא נקבעה פגישה ראשונה', badge(p.stage))],
      ['חוזה שעוד לא נחתם', S.people.filter(p => p.stage === 'sent' && now - new Date(p.updated) > 3 * DAY),
        p => personItem(p, 'נשלח ' + ago(p.updated), waQuick(p.phone, p.name))],
      ['תשלום פתוח', S.people.filter(p => CLIENT.includes(p.stage) && p.amount > p.paid),
        p => personItem(p, 'שולם ' + money(p.paid) + ' מתוך ' + money(p.amount), h('span', { class: 'amt' }, money(p.amount - p.paid)))],
      ['מעקב אחרי סיום', S.people.filter(p => p.followupAt && new Date(p.followupAt) <= now && p.stage !== 'lost'),
        p => personItem(p, 'סיים ' + ago(p.endedAt), waQuick(p.phone, p.name))],
      ['למחוק לפי מדיניות הפרטיות', S.people.filter(p => p.deleteAfter && new Date(p.deleteAfter) <= now),
        p => personItem(p, 'עבר מועד השמירה', badge(p.stage))]
    ];
    let any = false;
    lists.forEach(([title, items, row, hot]) => {
      if (!items.length) return;
      any = true;
      view.append(sec(title, items.length, hot), card(items.map(row)));
    });
    if (!any) view.append(sec('משימות'), card(h('div', { class: 'all-clear' }, h('b', {}, 'הכל מטופל'), 'אין לידים שמחכים, תשלומים פתוחים או מעקבים.')));
  }

  /* ---------- people ---------- */
  function renderPeople() {
    view.append(h('div', { class: 'head' }, h('h1', {}, 'אנשים'), h('small', {}, S.people.length + ' בסך הכל')));
    const search = h('input', { class: 'field search', type: 'search', placeholder: 'חיפוש לפי שם או טלפון', value: S.q, 'aria-label': 'חיפוש' });
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'סינון לפי שלב' });
    const list = h('div');
    const draw = () => {
      const f = FILTERS.find(x => x[0] === S.filter);
      const q = S.q.trim();
      const qd = q.replace(/\D/g, '');
      const items = S.people
        .filter(p => !f[2] || f[2].includes(p.stage))
        .filter(p => !q || p.name.includes(q) || (qd.length > 2 && p.phone.replace(/\D/g, '').includes(qd)))
        .sort((a, b) => b.updated.localeCompare(a.updated));
      list.textContent = '';
      list.append(items.length ? card(items.map(p => personItem(p, sourceText(p) + ' · ' + ago(p.updated), badge(p.stage))))
        : card(h('div', { class: 'all-clear' }, q ? 'לא נמצא אף אחד' : 'אין כאן אף אחד עדיין')));
      chips.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === S.filter));
    };
    FILTERS.forEach(([k, label, stages]) => {
      const n = stages ? S.people.filter(p => stages.includes(p.stage)).length : S.people.length;
      chips.append(h('button', { type: 'button', 'data-f': k, onclick: () => { S.filter = k; draw(); } }, label + ' ' + n));
    });
    search.addEventListener('input', () => { S.q = search.value; draw(); });
    view.append(search, chips, list, h('button', { class: 'fab', type: 'button', onclick: addPerson }, 'הוספה'));
    draw();
  }

  function addPerson() {
    let source = 'referral';
    const name = h('input', { class: 'field', id: 'np-name', autocomplete: 'off', maxlength: 80 });
    const phone = h('input', { class: 'field', id: 'np-phone', type: 'tel', inputmode: 'tel', autocomplete: 'off' });
    const ref = h('input', { class: 'field', id: 'np-ref', autocomplete: 'off', list: 'np-people', placeholder: 'מי המליץ (לא חובה)' });
    const dl = h('datalist', { id: 'np-people' }, S.people.map(p => h('option', { value: p.name })));
    const refWrap = h('div', {}, h('label', { class: 'lbl', for: 'np-ref' }, 'ממליץ'), ref, dl);
    const pills = h('div', { class: 'pills', role: 'radiogroup', 'aria-label': 'מקור' }, ['referral', 'instagram', 'whatsapp', 'other'].map(k =>
      h('label', {}, h('input', { type: 'radio', name: 'np-src', value: k, checked: k === source, onchange: () => { source = k; refWrap.hidden = k !== 'referral'; } }), h('span', {}, SOURCE[k]))));
    const err = h('p', { class: 'err', role: 'alert' });
    const go = h('button', { class: 'go', type: 'submit' }, 'הוספה');
    const form = h('form', { novalidate: true, onsubmit: async e => {
      e.preventDefault();
      err.textContent = '';
      if (name.value.trim().length < 2) { err.textContent = 'צריך שם.'; name.focus(); return; }
      go.disabled = true;
      try {
        const res = await api('crm_create', { name: name.value.trim(), phone: phone.value.trim(), source, referredBy: source === 'referral' ? ref.value.trim() : '' });
        await loadAll();
        closeSheet();
        location.hash = 'p=' + res.id;
      } catch (x) { err.textContent = Api.errText(x.code); go.disabled = false; }
    } },
      h('div', { class: 'row' }, closeX(), h('h2', {}, 'הוספה ידנית')),
      h('div', { class: 'row' },
        h('label', { class: 'lbl', for: 'np-name' }, 'שם'), name,
        h('label', { class: 'lbl', for: 'np-phone' }, 'טלפון'), phone,
        h('span', { class: 'lbl' }, 'איך הגיע'), pills, refWrap, err, go));
    openSheet(form, name);
  }

  /* ---------- sheet ---------- */
  function openSheet(content, focus) {
    const d = $('dlg');
    d.textContent = '';
    d.append(content);
    d.showModal();
    if (focus) setTimeout(() => focus.focus(), 60);
  }
  function closeSheet() { $('dlg').close(); }
  const closeX = () => h('button', { class: 'x', type: 'button', 'aria-label': 'סגירה', onclick: closeSheet }, '×');
  $('dlg').addEventListener('click', e => { if (e.target === $('dlg')) closeSheet(); });

  /* ---------- person ---------- */
  async function renderPerson(id) {
    view.append(h('a', { class: 'back', href: '#people' }, 'חזרה לרשימה'), h('div', { class: 'spinner' }));
    let res;
    try { res = await api('crm_get', { id }); }
    catch (err) {
      view.textContent = '';
      view.append(h('a', { class: 'back', href: '#people' }, 'חזרה לרשימה'), card(h('div', { class: 'all-clear' }, Api.errText(err.code))));
      return;
    }
    if (location.hash !== '#p=' + id) return; // moved on while loading
    drawPerson(res);
  }

  function drawPerson(res) {
    const p = res.person;
    merge(p);
    view.textContent = '';
    // every action returns the fresh card: redraw in place, keep scroll
    const act = async (btn, action, data, done) => {
      if (btn) btn.disabled = true;
      try {
        const r = await api(action, Object.assign({ id: p.id }, data));
        const y = window.scrollY;
        drawPerson(r);
        window.scrollTo(0, y);
        if (done) done(r);
        return r;
      } catch (err) {
        toast(Api.errText(err.code), true);
        if (btn) btn.disabled = false;
      }
    };

    /* header */
    const ref = p.referredBy && byName(p.referredBy);
    view.append(h('a', { class: 'back', href: '#people' }, 'חזרה לרשימה'));
    view.append(h('div', { class: 'card' },
      h('div', { class: 'who' },
        h('div', { class: 'top' }, h('h1', {}, p.name), badge(p.stage)),
        h('p', { class: 'meta' }, sourceText(p), ' · נוסף ' + ago(p.created),
          p.referredBy ? [' · המליץ: ', ref ? h('a', { href: '#p=' + ref.id }, p.referredBy) : p.referredBy] : null),
        p.phone ? h('button', { class: 'phone-copy', type: 'button', 'aria-label': 'העתקת הטלפון ' + p.phone, onclick: () => copy(p.phone, 'הטלפון הועתק'), html: '<span dir="ltr">' + p.phone.replace(/[<>&"]/g, '') + '</span>' + ICON.copy }) : null,
        p.phone ? h('div', { class: 'btns', style: 'margin-top:14px' },
          h('a', { class: 'ghost wa', href: waUrl(p.phone), target: '_blank', rel: 'noopener', html: ICON.wa + '<span>וואטסאפ</span>' }),
          h('a', { class: 'ghost', href: 'tel:' + p.phone, html: ICON.phone + '<span>חיוג</span>' })) : null),
      h('div', { class: 'row' },
        h('label', { class: 'lbl', for: 'stage' }, 'שלב'),
        h('select', { class: 'field', id: 'stage', onchange: e => {
          const stage = e.target.value;
          let lostReason;
          if (stage === 'lost') {
            lostReason = prompt('למה לא רלוונטי? (לא חובה)', '');
            if (lostReason === null) { e.target.value = p.stage; return; }
          }
          act(e.target, 'crm_update', { patch: lostReason != null ? { stage, lostReason } : { stage } }, () => toast('השלב עודכן'));
        } }, STAGES.map(([k, l]) => h('option', { value: k, selected: k === p.stage }, l))),
        p.stage === 'lost' && p.lostReason ? h('p', { class: 'hint', style: 'margin-top:.5rem' }, 'סיבה: ' + p.lostReason) : null)));

    /* the next step */
    const next = [];
    // from "contract sent" on, a new meeting is one of the four (same rule as Crm.gs)
    const inProcess = ['sent', 'signed', 'active'].includes(p.stage);
    if (['signed', 'active', 'ended'].includes(p.stage)) {
      next.push(h('div', { class: 'row' },
        h('h2', {}, p.stage === 'ended' ? 'הליווי הסתיים' : 'התקיימו ' + p.meetingsDone + ' מתוך ' + MEETINGS + ' פגישות'),
        h('div', { class: 'progress', 'aria-label': p.meetingsDone + ' מתוך ' + MEETINGS + ' פגישות התקיימו' },
          Array.from({ length: MEETINGS }, (_, i) => h('i', { class: i < p.meetingsDone ? 'on' : '' })))));
    }
    if (p.nextMeetingAt) {
      const d = new Date(p.nextMeetingAt);
      // an intro set before signing stays an intro (same rule as Crm.gs)
      const isProcess = (p.nextMeetingKind || (inProcess ? 'process' : 'intro')) === 'process' && inProcess;
      next.push(h('div', { class: 'row' },
        h('div', { class: 'nextup' },
          h('div', { class: 'cal' }, h('i', {}, d.toLocaleDateString('he-IL', { month: 'short' })), h('b', {}, d.getDate())),
          h('div', {}, h('b', {}, isProcess ? 'פגישה ' + (p.meetingsDone + 1) + ' מתוך ' + MEETINGS : 'שיחת היכרות'), h('div', { class: 'hint', style: 'margin:0' }, when(p.nextMeetingAt)))),
        h('div', { class: 'btns', style: 'margin-top:1rem' },
          h('button', { class: 'ghost', type: 'button', onclick: () => meetingDone(p, act, isProcess) }, 'התקיימה'),
          h('button', { class: 'ghost', type: 'button', onclick: () => scheduleSheet(p, act, isProcess) }, 'שינוי מועד'))));
    } else if (p.stage !== 'lost' && p.stage !== 'ended') {
      next.push(h('div', { class: 'row' },
        h('h2', {}, inProcess ? 'קביעת הפגישה הבאה' : 'קביעת שיחת היכרות'),
        h('p', { class: 'hint' }, 'נכנס ליומן גוגל שלך עם תזכורת שעה לפני.'),
        h('button', { class: 'ghost', type: 'button', style: 'width:100%;padding-block:.75rem', onclick: () => scheduleSheet(p, act, inProcess) }, 'בחירת מועד')));
    }
    if (['new', 'contact', 'intro'].includes(p.stage)) {
      next.push(onboardRow(p, act));
    }
    if (p.stage === 'sent' && p.onboardingUrl) {
      next.push(h('div', { class: 'row' },
        h('h2', {}, 'החוזה והשאלון נשלחו'),
        h('p', { class: 'hint' }, 'מחכה לחתימה. ברגע שימלאו, הכרטיס יעבור לבד ל"חתם".'),
        h('div', { class: 'linkbox' }, p.onboardingUrl),
        h('div', { class: 'btns' },
          h('a', { class: 'ghost wa', href: waUrl(p.phone, onboardText(p.name, p.onboardingUrl)), target: '_blank', rel: 'noopener' }, 'שליחה שוב'),
          h('button', { class: 'ghost', type: 'button', onclick: () => copy(p.onboardingUrl, 'הקישור הועתק') }, 'העתקה'))));
    }
    if (p.followupAt && p.stage === 'ended') {
      const due = new Date(p.followupAt) <= Date.now();
      next.push(h('div', { class: 'row' },
        h('h2', {}, due ? 'הגיע הזמן לבדוק מה שלומם' : 'מעקב הבא'),
        h('p', { class: 'hint' }, (due ? 'היה מתוכנן ל' : 'מתוכנן ל') + dayLabel(p.followupAt) + '. שיחה קצרה: איך מחזיקים, מה השתנה, אולי המלצה.'),
        h('button', { class: 'ghost', type: 'button', style: 'width:100%;padding-block:.75rem', onclick: () => followupSheet(p, act) }, 'סימון שבוצע')));
    }
    if (next.length) view.append(sec('הצעד הבא'), card(next));

    /* money */
    if (p.amount > 0 || CLIENT.includes(p.stage) || p.paid) {
      const left = p.amount - p.paid;
      view.append(sec('תשלום'), card(
        h('div', { class: 'row' },
          h('div', { class: 'facts' },
            h('div', {}, h('small', {}, 'סוכם'), h('b', {}, money(p.amount))),
            h('div', {}, h('small', {}, 'שולם'), h('b', {}, money(p.paid))),
            h('div', { class: left > 0 ? 'due' : 'clear' }, h('small', {}, 'נשאר'), h('b', {}, money(Math.max(left, 0))))),
          h('button', { class: 'ghost', type: 'button', style: 'width:100%;margin-top:.9rem;padding-block:.75rem', onclick: () => paymentSheet(p, act) }, 'רישום תשלום'))));
    }

    /* documents */
    if (p.contractUrl || p.questionnaireUrl) {
      view.append(sec('מסמכים'), card(h('div', { class: 'row docs' },
        p.contractUrl ? h('a', { href: p.contractUrl, target: '_blank', rel: 'noopener' }, 'חוזה חתום') : null,
        p.questionnaireUrl ? h('a', { href: p.questionnaireUrl, target: '_blank', rel: 'noopener' }, 'שאלון אפיון') : null)));
    }

    /* note */
    const note = h('textarea', { class: 'field', id: 'note', placeholder: 'מה דיברנו, מה סיכמנו, מה לזכור' });
    const noteBtn = h('button', { class: 'go', type: 'submit' }, 'שמירה');
    view.append(sec('הערה'), card(h('form', { class: 'row', novalidate: true, onsubmit: e => {
      e.preventDefault();
      if (!note.value.trim()) { note.focus(); return; }
      act(noteBtn, 'crm_note', { text: note.value.trim() }, () => toast('נשמר'));
    } }, h('label', { class: 'sr', for: 'note' }, 'הערה'), note, noteBtn)));

    /* timeline */
    view.append(sec('ציר זמן', res.events.length), card(h('ul', { class: 'tl' }, res.events.map(ev => {
      let text = ev.text;
      if (ev.kind === 'payment' && ev.data) text = 'תשלום ' + money(ev.data.amount) + ' ב' + (METHOD[ev.data.method] || '') + (ev.text ? '\n' + ev.text : '');
      const values = ev.data && ev.data.values && Object.keys(ev.data.values).length ? ev.data.values : null;
      return h('li', { class: ev.kind },
        h('time', {}, when(ev.at)),
        h('p', {}, text),
        values ? h('dl', { class: 'kv' }, Object.keys(values).map(k => [h('dt', {}, k), h('dd', {}, values[k])])) : null);
    }))));

    /* details */
    view.append(sec('פרטים'), card(detailsForm(p, act)));
  }

  function onboardRow(p, act) {
    const amount = h('input', { class: 'field', id: 'ob-amount', inputmode: 'numeric', autocomplete: 'off', placeholder: '0', value: p.amount ? p.amount.toLocaleString('he-IL') : '' });
    amount.addEventListener('input', () => { const d = amount.value.replace(/\D/g, '').slice(0, 7); amount.value = d ? Number(d).toLocaleString('he-IL') : ''; });
    const genders = h('div', { class: 'pills', role: 'radiogroup', 'aria-label': 'פנייה בחוזה' }, Object.keys(GENDER).map(k =>
      h('label', {}, h('input', { type: 'radio', name: 'ob-g', value: k, checked: k === (p.gender || '') }), h('span', {}, GENDER[k]))));
    const err = h('p', { class: 'err', role: 'alert' });
    const go = h('button', { class: 'go', type: 'submit' }, 'יצירת קישור לחוזה ולשאלון');
    return h('form', { class: 'row', novalidate: true, onsubmit: e => {
      e.preventDefault();
      const sum = Number(amount.value.replace(/\D/g, ''));
      const g = genders.querySelector('input:checked');
      err.textContent = '';
      if (!(sum > 0) || !g) { err.textContent = 'צריך סכום ופנייה (זוג / זכר / נקבה).'; return; }
      act(go, 'crm_onboard', { amount: sum, gender: g.value }, r => {
        toast('הקישור מוכן');
        if (p.phone) window.open(waUrl(p.phone, onboardText(p.name, r.url)), '_blank');
      });
    } },
      h('h2', {}, 'סגרנו? שליחת חוזה ושאלון'),
      h('label', { class: 'lbl', for: 'ob-amount' }, 'הסכום שסגרנו'), h('div', { class: 'money' }, amount),
      h('span', { class: 'lbl' }, 'פנייה בחוזה'), genders, err, go);
  }

  function scheduleSheet(p, act, inProcess) {
    const pad = n => String(n).padStart(2, '0');
    const base = p.nextMeetingAt ? new Date(p.nextMeetingAt) : (() => { const d = new Date(Date.now() + DAY); d.setHours(20, 0, 0, 0); return d; })();
    const local = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    const at = h('input', { class: 'field', id: 'm-at', type: 'datetime-local', value: local(base), min: local(new Date()) });
    const len = h('div', { class: 'pills', role: 'radiogroup', 'aria-label': 'משך' }, [30, 60, 90].map(m =>
      h('label', {}, h('input', { type: 'radio', name: 'm-len', value: m, checked: m === (inProcess ? 90 : 30) }), h('span', {}, m === 90 ? 'שעה וחצי' : m === 60 ? 'שעה' : 'חצי שעה'))));
    const go = h('button', { class: 'go', type: 'submit' }, 'קביעה ביומן');
    openSheet(h('form', { novalidate: true, onsubmit: async e => {
      e.preventDefault();
      if (!at.value) { at.focus(); return; }
      go.disabled = true;
      const r = await act(null, 'crm_meeting', { at: new Date(at.value).toISOString(), minutes: Number(len.querySelector('input:checked').value) });
      if (r) { closeSheet(); toast('נקבע ביומן'); loadAll().catch(() => {}); } else go.disabled = false;
    } },
      h('div', { class: 'row' }, closeX(), h('h2', {}, (inProcess ? 'פגישה ' + (p.meetingsDone + 1) : 'שיחת היכרות') + ' עם ' + p.name)),
      h('div', { class: 'row' }, h('label', { class: 'lbl', for: 'm-at' }, 'מתי'), at, h('span', { class: 'lbl' }, 'כמה זמן'), len, go)), at);
  }

  function meetingDone(p, act, inProcess) {
    const sum = h('textarea', { class: 'field', id: 'md-sum', placeholder: inProcess ? 'מה עשינו, מה המשימות עד הפגישה הבאה' : 'איך היה, מה הם צריכים' });
    const go = h('button', { class: 'go', type: 'submit' }, 'שמירה');
    const last = inProcess && p.meetingsDone + 1 >= MEETINGS;
    openSheet(h('form', { novalidate: true, onsubmit: async e => {
      e.preventDefault();
      go.disabled = true;
      const r = await act(null, 'crm_meeting_done', { summary: sum.value.trim() });
      if (r) { closeSheet(); toast(last ? 'הליווי הסתיים. מעקב בעוד 3 חודשים' : 'נשמר'); loadAll().catch(() => {}); } else go.disabled = false;
    } },
      h('div', { class: 'row' }, closeX(), h('h2', {}, inProcess ? 'פגישה ' + (p.meetingsDone + 1) + ' התקיימה' : 'שיחת ההיכרות התקיימה')),
      h('div', { class: 'row' }, h('label', { class: 'lbl', for: 'md-sum' }, 'סיכום קצר (לא חובה)'), sum,
        last ? h('p', { class: 'hint', style: 'margin-top:.7rem' }, 'זו הפגישה האחרונה. הכרטיס יעבור ל"סיים" ויקבע מעקב בעוד 3 חודשים.') : null, go)), sum);
  }

  function followupSheet(p, act) {
    const sum = h('textarea', { class: 'field', id: 'fu-sum', placeholder: 'מה שלומם, מה מחזיק, מה לא' });
    const go = h('button', { class: 'go', type: 'submit' }, 'שמירה');
    openSheet(h('form', { novalidate: true, onsubmit: async e => {
      e.preventDefault();
      go.disabled = true;
      const r = await act(null, 'crm_followup_done', { summary: sum.value.trim() });
      if (r) { closeSheet(); toast('נשמר'); } else go.disabled = false;
    } },
      h('div', { class: 'row' }, closeX(), h('h2', {}, 'מעקב עם ' + p.name)),
      h('div', { class: 'row' }, h('label', { class: 'lbl', for: 'fu-sum' }, 'סיכום (לא חובה)'), sum, go)), sum);
  }

  function paymentSheet(p, act) {
    const left = Math.max(p.amount - p.paid, 0);
    const amount = h('input', { class: 'field', id: 'pay-amt', inputmode: 'numeric', autocomplete: 'off', value: left ? left.toLocaleString('he-IL') : '' });
    amount.addEventListener('input', () => { const d = amount.value.replace(/\D/g, '').slice(0, 7); amount.value = d ? Number(d).toLocaleString('he-IL') : ''; });
    const methods = h('div', { class: 'pills', role: 'radiogroup', 'aria-label': 'אמצעי תשלום' }, Object.keys(METHOD).map((k, i) =>
      h('label', {}, h('input', { type: 'radio', name: 'pay-m', value: k, checked: i === 0 }), h('span', {}, METHOD[k]))));
    const err = h('p', { class: 'err', role: 'alert' });
    const go = h('button', { class: 'go', type: 'submit' }, 'רישום');
    openSheet(h('form', { novalidate: true, onsubmit: async e => {
      e.preventDefault();
      const sum = Number(amount.value.replace(/\D/g, ''));
      if (!(sum > 0)) { err.textContent = 'צריך סכום.'; amount.focus(); return; }
      go.disabled = true;
      const r = await act(null, 'crm_payment', { amount: sum, method: methods.querySelector('input:checked').value });
      if (r) { closeSheet(); toast('התשלום נרשם'); loadAll().catch(() => {}); } else go.disabled = false;
    } },
      h('div', { class: 'row' }, closeX(), h('h2', {}, 'תשלום מ' + p.name)),
      h('div', { class: 'row' }, h('label', { class: 'lbl', for: 'pay-amt' }, 'סכום'), h('div', { class: 'money' }, amount),
        h('span', { class: 'lbl' }, 'איך שילמו'), methods, err, go)), amount);
  }

  function detailsForm(p, act) {
    const f = (id, label, value, attrs) => [h('label', { class: 'lbl', for: id }, label), h('input', Object.assign({ class: 'field', id, value: value || '', autocomplete: 'off' }, attrs))];
    const source = h('select', { class: 'field', id: 'd-source' }, Object.keys(SOURCE).map(k => h('option', { value: k, selected: k === p.source }, SOURCE[k])));
    const go = h('button', { class: 'go', type: 'submit' }, 'שמירת פרטים');
    const form = h('form', { novalidate: true, onsubmit: e => {
      e.preventDefault();
      const v = id => form.querySelector('#' + id).value.trim();
      if (v('d-name').length < 2) { toast('צריך שם', true); return; }
      act(go, 'crm_update', { patch: {
        name: v('d-name'), phone: v('d-phone'), email: v('d-email'), source: source.value, referredBy: v('d-ref'),
        amount: Number(v('d-amount').replace(/\D/g, '')) || 0
      } }, () => toast('נשמר'));
    } },
      f('d-name', 'שם', p.name, { maxlength: 80 }),
      f('d-phone', 'טלפון', p.phone, { type: 'tel', inputmode: 'tel' }),
      f('d-email', 'מייל', p.email, { type: 'email', dir: 'ltr' }),
      h('label', { class: 'lbl', for: 'd-source' }, 'מקור'), source,
      f('d-ref', 'ממליץ', p.referredBy, { list: 'd-people' }),
      h('datalist', { id: 'd-people' }, S.people.filter(x => x.id !== p.id).map(x => h('option', { value: x.name }))),
      f('d-amount', 'סכום הליווי', p.amount ? String(p.amount) : '', { inputmode: 'numeric' }),
      go,
      h('button', { class: 'ghost danger', type: 'button', onclick: async e => {
        if (!confirm('למחוק לצמיתות את ' + p.name + '?\nנמחקים הכרטיס, ציר הזמן, ואם יש, גם החוזה והשאלון מהדרייב.')) return;
        e.target.disabled = true;
        try {
          await api('crm_delete', { id: p.id, confirm: true });
          S.people = S.people.filter(x => x.id !== p.id);
          toast('נמחק');
          location.hash = 'people';
        } catch (err) { toast(Api.errText(err.code), true); e.target.disabled = false; }
      } }, 'מחיקה לפי בקשה או מדיניות פרטיות'));
    return h('details', { class: 'row more' }, h('summary', {}, 'עריכת פרטים'), form);
  }

  /* ---------- tools ---------- */
  async function renderTools() {
    view.append(h('div', { class: 'head' }, h('h1', {}, 'כלים'), h('small', {}, 'מתעדכן לבד מכל כלי חדש')));
    const box = h('div', {}, h('div', { class: 'spinner' }));
    view.append(box);
    const tools = await loadCatalog();
    box.textContent = '';
    if (!tools) { box.append(card(h('div', { class: 'all-clear' }, 'לא הצלחתי לטעון את רשימת הכלים.'))); return; }
    if (!tools.length) { box.append(card(h('div', { class: 'all-clear' }, 'עוד אין כלים. מבקשים מקלוד כלי חדש, והוא יופיע כאן.'))); return; }
    tools.forEach(t => {
      const url = SITE + t.path;
      const leads = S.people.filter(p => p.tool === t.slug).length;
      box.append(h('div', { class: 'card tool' }, h('div', { class: 'row' },
        h('h2', {}, t.title),
        t.description ? h('p', {}, t.description) : null,
        h('div', { class: 'tags' },
          h('span', { class: 'badge' }, t.type),
          t.lead ? h('span', { class: 'badge' }, leads + ' לידים') : h('span', { class: 'badge' }, 'בלי טופס ליד'),
          t.public ? h('span', { class: 'badge contact' }, 'בספרייה') : h('span', { class: 'badge' }, 'לא בספרייה')),
        h('div', { class: 'btns' },
          h('a', { class: 'ghost wa', href: 'https://wa.me/?text=' + encodeURIComponent(t.title + '\n' + url), target: '_blank', rel: 'noopener', html: ICON.wa + '<span>שיתוף</span>' }),
          h('button', { class: 'ghost', type: 'button', onclick: () => copy(url, 'הקישור הועתק') }, 'העתקה'),
          h('button', { class: 'ghost', type: 'button', onclick: () => copy(url + '?src=ig', 'קישור לאינסטגרם הועתק') }, 'לאינסטגרם'),
          h('a', { class: 'ghost', href: url, target: '_blank', rel: 'noopener' }, 'פתיחה')))));
    });
    view.append(h('p', { class: 'note', style: 'margin-top:1.2rem' },
      'קישור "לאינסטגרם" מסמן לידים שהגיעו ממנו כמקור אינסטגרם. ',
      h('a', { href: SITE, target: '_blank', rel: 'noopener' }, 'הספרייה'), ' עדיין לא מקושרת לשום מקום.'));
  }

  /* ---------- stats ---------- */
  let period = 'all';
  function renderStats() {
    view.append(h('div', { class: 'head' }, h('h1', {}, 'מספרים')));
    const chips = h('div', { class: 'chips' });
    const body = h('div');
    const draw = () => {
      const from = period === 'all' ? 0 : Date.now() - Number(period) * DAY;
      const people = S.people.filter(p => new Date(p.created) >= from);
      const clients = people.filter(p => CLIENT.includes(p.stage));
      const income = S.payments.filter(x => new Date(x.at) >= from).reduce((s, x) => s + x.amount, 0);
      const open = S.people.filter(p => CLIENT.includes(p.stage)).reduce((s, p) => s + Math.max(p.amount - p.paid, 0), 0);
      body.textContent = '';
      body.append(h('div', { class: 'tiles' },
        h('div', { class: 'card tile' }, h('small', {}, 'פניות'), h('b', {}, people.length)),
        h('div', { class: 'card tile' }, h('small', {}, 'הפכו ללקוחות'), h('b', {}, clients.length)),
        h('div', { class: 'card tile' }, h('small', {}, 'אחוז המרה'), h('b', {}, people.length ? Math.round(clients.length / people.length * 100) + '%' : '0%')),
        h('div', { class: 'card tile' }, h('small', {}, 'הכנסות'), h('b', {}, money(income)))));
      if (open) body.append(h('p', { class: 'note', style: 'margin-top:.7rem' }, 'עוד ' + money(open) + ' פתוחים לגבייה.'));

      // where people come from, and how many of them become clients
      const groups = {};
      people.forEach(p => {
        const k = p.source === 'tool' ? 'כלי: ' + toolTitle(p.tool) : SOURCE[p.source] || 'אחר';
        groups[k] = groups[k] || { n: 0, c: 0 };
        groups[k].n++;
        if (CLIENT.includes(p.stage)) groups[k].c++;
      });
      const keys = Object.keys(groups).sort((a, b) => groups[b].n - groups[a].n);
      body.append(sec('מאיפה מגיעים'), card(keys.length ? keys.map(k => h('div', { class: 'item' },
        h('div', { class: 'main' }, h('b', {}, k), h('small', {}, groups[k].c + ' הפכו ללקוחות')),
        h('div', { class: 'share', style: 'width:45%' }, h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.round(groups[k].n / people.length * 100) + '%' })), h('span', { class: 'amt' }, groups[k].n)))) :
        h('div', { class: 'all-clear' }, 'אין עדיין נתונים')));

      // referrers
      const refs = {};
      S.people.forEach(p => { if (p.referredBy) refs[p.referredBy] = (refs[p.referredBy] || 0) + 1; });
      const rk = Object.keys(refs).sort((a, b) => refs[b] - refs[a]).slice(0, 5);
      if (rk.length) body.append(sec('ממליצים'), card(rk.map(n => {
        const p = byName(n);
        const inner = [h('div', { class: 'main' }, h('b', {}, n)), h('span', { class: 'amt' }, refs[n] === 1 ? 'המלצה אחת' : refs[n] + ' המלצות')];
        return p ? h('a', { class: 'item', href: '#p=' + p.id }, inner) : h('div', { class: 'item' }, inner);
      })));

      // income per month, last 6 months
      const months = [];
      const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
      for (let i = 5; i >= 0; i--) { const m = new Date(d); m.setMonth(d.getMonth() - i); months.push(m); }
      const sums = months.map((m, i) => {
        const end = i < 5 ? months[i + 1] : new Date(8.64e15);
        return S.payments.filter(x => new Date(x.at) >= m && new Date(x.at) < end).reduce((s, x) => s + x.amount, 0);
      });
      const max = Math.max(...sums, 1);
      body.append(sec('הכנסות לפי חודש'), card(h('div', { class: 'row' }, h('div', { class: 'bars' }, months.map((m, i) =>
        h('div', {}, h('em', {}, sums[i] ? Math.round(sums[i] / 100) / 10 + 'K' : ''), h('i', { style: 'height:' + Math.round(sums[i] / max * 100) + '%' }),
          h('small', {}, m.toLocaleDateString('he-IL', { month: 'short' }))))))));
    };
    [['all', 'מאז ומעולם'], ['30', '30 יום'], ['90', '3 חודשים'], ['365', 'שנה']].forEach(([k, l]) =>
      chips.append(h('button', { type: 'button', 'aria-pressed': k === period, onclick: e => {
        period = k;
        chips.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === e.target));
        draw();
      } }, l)));
    view.append(chips, body);
    draw();
  }

  /* ---------- start ---------- */
  $('demo').hidden = !Api.MOCK;
  loadCatalog();
  S.password = store.get();
  if (!S.password) { showApp(false); return; }
  showApp(true);
  view.append(h('div', { class: 'spinner' }));
  loadAll().then(route).catch(err => {
    if (err.code !== 'auth' && err.code !== 'locked') {
      view.textContent = '';
      view.append(card(h('div', { class: 'all-clear' }, Api.errText(err.code))));
    }
  });
})();
