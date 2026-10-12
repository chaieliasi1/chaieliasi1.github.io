// מצב הדגמה: מחקה את plan-backend/Plan.gs בדפדפן. שום דבר לא נשלח לגוגל.
// סיסמה: 1234. לקוח לדוגמה: /plan/?mock&t=bbbb… (64 פעמים b), קוד 1234. איפוס: localStorage.removeItem('plan-mock')
(function () {
  const KEY = 'plan-mock';
  const DEMO_TOKEN = 'b'.repeat(64);
  let plans = null;

  function fail(code) { const e = new Error(code); e.code = code; throw e; }
  const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
  const iso = () => new Date().toISOString();
  const newPin = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  const url = t => location.origin + location.pathname + '?mock&t=' + t;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(plans)); } catch (e) { /* memory only */ } };

  // read on every call, like the real backend: two tabs (Hai and the client) see each other's saves
  function load() {
    try { plans = JSON.parse(localStorage.getItem(KEY)) || plans; } catch (e) { /* keep memory */ }
    if (!plans) {
      plans = [{ id: 'dd00000001', token: DEMO_TOKEN, pin: '1234', name: 'יעל ורון מזרחי', phone: '058-9998877', data: '', version: 0, created: iso(), updated: iso(), demo: true }];
      save();
    }
    return plans;
  }
  const summary = p => ({ id: p.id, name: p.name, phone: p.phone, url: url(p.token), sheetUrl: 'https://docs.google.com/spreadsheets/', created: p.created, updated: p.updated, version: p.version });

  function access(req) {
    if (req.password) {
      if (req.password !== '1234') fail('auth');
      const p = load().find(x => x.id === req.id) || fail('not_found');
      return { p, role: 'admin' };
    }
    const p = load().find(x => x.token === req.token) || fail('bad_link');
    if (String(req.pin) !== p.pin) fail('pin');
    return { p, role: 'client' };
  }

  // a plan with numbers in it, so the demo has something to show
  function demoPlan(C, name) {
    const p = C.newPlan({ name, start: C.ymAdd(C.ym(), -2) });
    const L = (list, label) => list.find(x => x.label === label);
    const h = p.home;
    p.goalsText = 'לצאת מהמינוס, לבנות קרן חירום ולחסוך לדירה';
    L(h.incomes, 'בעל - עבודה 1 (תלוש)').amount = 11800;
    L(h.incomes, 'אישה - עבודה 1 (תלוש)').amount = 9400;
    L(h.incomes, 'קצבת ילדים').amount = 340;
    const set = (label, v) => { const c = L(h.cats, label); if (c.m) c.m = v; else c.amount = v; };
    set('שכר דירה', 5200); set('ועד בית', 120); set('ארנונה', 480); set('מים וביוב', 150); set('חשמל', 420); set('גז', 60);
    set('ליווי פיננסי', 600); set('דמי כרטיס אשראי', 25);
    set('מזון לבית', [3400, 3100, 3600]); set('אוכל בחוץ ובילויים', [1200, 900, 1500]); set('פארם', [300, 250, 350]);
    set('דלק וחניה', [900, 850, 950]); set('ביגוד והנעלה', [600, 0, 900]); set('בעלי חיים', [200, 200, 200]); set('שונות', [400, 300, 500]);
    L(h.calcs.insurance, 'ביטוח בריאות').amount = 180; L(h.calcs.insurance, 'ביטוח חיים').amount = 120;
    L(h.calcs.subscriptions, 'Netflix').amount = 55; L(h.calcs.subscriptions, 'ספק אינטרנט').amount = 100;
    L(h.calcs.subscriptions, 'טלפון נייד').amount = 90; L(h.calcs.subscriptions, 'ספורט / חדר כושר').amount = 250;
    L(h.calcs.annual, 'חופשות').amount = 8000; L(h.calcs.annual, 'רישיון רכב + טסט').amount = 1400; L(h.calcs.annual, 'ביטוח מקיף').amount = 3600;
    L(h.calcs.education, 'גן').amount = 1400;
    L(h.savings, 'קרן חירום').monthly = 500; L(h.savings, 'קרן חירום').balance = 6000;
    L(h.savings, 'קרן השתלמות').balance = 48000; L(h.savings, 'חסכונות ילדים').monthly = 100; L(h.savings, 'חסכונות ילדים').balance = 4200;
    Object.assign(h.bank[0], { label: 'עובר ושב - לאומי', balance: -2400, limit: 10000 });
    h.cards = [{ id: C.uid(), label: 'ויזה כאל', day: 10, limit: 18000, balance: 0, fixed: 0 }, { id: C.uid(), label: 'מקס', day: 2, limit: 8000, balance: 3500, fixed: 0 }];
    h.loans = [
      { id: C.uid(), label: 'הלוואת רכב', original: 70000, principal: 41000, asOf: '', rate: 6.5, left: 28, payment: 1650, note: '' },
      { id: C.uid(), label: 'הלוואה מהבנק', original: 25000, principal: 9800, asOf: '', rate: 9.9, left: 12, payment: 880, note: 'ריבית גבוהה' }
    ];
    h.installments = [
      { id: C.uid(), card: 'ויזה כאל', label: 'מכונת כביסה', total: 12, amount: 210, first: C.ymAdd(p.start, -4) },
      { id: C.uid(), card: 'מקס', label: 'טיסה', total: 6, amount: 650, first: C.ymAdd(p.start, 1) }
    ];
    Object.assign(h.sims[0], { amount: 52000, months: 72, rate: 5.5, closes: h.loans.map(l => l.id) });
    Object.assign(p.lt, { emergency: { have: 6000, monthly: 800 }, goalsHave: 0 });
    p.lt.long.target = 200000; p.lt.long.monthly = 300;
    p.lt.goals[0] = { id: C.uid(), label: 'חופשה בקיץ', months: 8, amount: 9000, other: 1000 };
    p.lt.goals[2] = { id: C.uid(), label: 'החלפת רכב', months: 36, amount: 30000, other: 10000 };
    p.lt.goals.splice(1, 1);
    // two months done, the current one half way
    const actual = [[1.05, 0.98], [0.97, 1.12]];
    for (let i = 0; i < 3; i++) {
      const key = C.ymAdd(p.start, i);
      const m = C.ensureMonth(p, key).home;
      if (i < 2) {
        m.inc.forEach(r => { if (r.b) r.a = Math.round(r.b * actual[i][0] / 10) * 10; });
        m.rows.forEach((r, j) => { if (r.b) r.a = Math.round(r.b * (r.group === 'var' ? actual[i][1] + (j % 3) * 0.04 : 1) / 10) * 10; });
      } else {
        m.flow = { start: -2400, items: [
          { id: C.uid(), label: 'משכורת', day: 10, amount: 11800, dir: 'in' }, { id: C.uid(), label: 'משכורת', day: 1, amount: 9400, dir: 'in' },
          { id: C.uid(), label: 'שכר דירה', day: 1, amount: 5200, dir: 'out' }, { id: C.uid(), label: 'ויזה כאל', day: 10, amount: 7800, dir: 'out' },
          { id: C.uid(), label: 'מקס', day: 2, amount: 2900, dir: 'out' }, { id: C.uid(), label: 'הלוואות', day: 15, amount: 2530, dir: 'out' }
        ] };
      }
    }
    Object.assign(p.meetings[0], { topic: 'היכרות ומיפוי', purpose: 'להבין לאן הולך הכסף', tasks: 'להוציא דפי חשבון של 3 חודשים\nלבדוק את דוח האשראי',
      took: 'שאנחנו מוציאים הרבה יותר על אוכל בחוץ ממה שחשבנו' });
    Object.assign(p.meetings[1], { topic: 'בניית תקציב', purpose: 'תקציב חודשי ראשון', tasks: 'לבטל את חדר הכושר\nלפתוח הוראת קבע לקרן חירום',
      applied: 'כן, חוץ מחדר הכושר', took: 'שיש לנו תוכנית', achieved: 'התחלנו קרן חירום', improvement: 'בערך 800 ₪ בחודש' });
    return p;
  }

  function handle(req) {
    const all = load();
    const done = r => { save(); return r; };
    switch (req.action) {
      case 'plan_get': {
        const { p, role } = access(req);
        if (p.demo && !p.data && window.PlanCalc) { p.data = JSON.stringify(demoPlan(window.PlanCalc, p.name)); save(); }
        return { role, id: role === 'admin' ? p.id : '', name: p.name, phone: role === 'admin' ? p.phone : '', version: p.version, updated: p.updated, data: p.data || '', sheetUrl: role === 'admin' ? 'https://docs.google.com/spreadsheets/' : '' };
      }
      case 'plan_save': {
        const { p } = access(req);
        if (Number(req.version) !== p.version) fail('conflict');
        const data = typeof req.data === 'string' ? req.data : JSON.stringify(req.data);
        try { JSON.parse(data); } catch (e) { fail('invalid'); }
        p.data = data; p.version += 1; p.updated = iso();
        return done({ version: p.version, updated: p.updated });
      }
    }
    if (req.password !== '1234') fail('auth');
    const p = req.id ? (all.find(x => x.id === req.id) || fail('not_found')) : null;
    switch (req.action) {
      case 'plan_list': return { plans: all.map(summary).sort((a, b) => b.updated.localeCompare(a.updated)) };
      case 'plan_create': {
        const name = String(req.name || '').replace(/\s+/g, ' ').trim();
        if (name.length < 2) fail('invalid');
        const n = { id: hex(5), token: hex(32), pin: newPin(), name, phone: String(req.phone || '').trim(), data: '', version: 0, created: iso(), updated: iso() };
        all.push(n);
        return done(Object.assign(summary(n), { pin: n.pin }));
      }
      case 'plan_pin':
        p.pin = newPin();
        return done({ pin: p.pin, url: url(p.token) });
      case 'plan_delete':
        if (req.confirm !== true) fail('invalid');
        plans = all.filter(x => x.id !== p.id);
        return done({});
      case 'plan_import':
        fail('demo');
    }
    fail('invalid');
  }

  window.PlanMock = { handle };
})();
