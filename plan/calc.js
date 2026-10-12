/* התוכנית הכלכלית: מבנה הנתונים וכל החישובים. פונקציות טהורות, בלי DOM.
   מחליף את קובץ האקסל "קובץ תוכנית כלכלית 2026". כל חישוב מציין מאיפה הוא בא בקובץ הישן.
   רץ בדפדפן (window.PlanCalc) וב-Node לבדיקות (onboarding/tests/plan-test.js). */
(function (root) {
  'use strict';

  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const GROUPS = { save: 'חסכונות והשקעות', fixed: 'הוצאות קבועות', var: 'הוצאות משתנות' };
  const BOOKS = { home: 'בית', business: 'עסק' };
  // מחשבוני עזר. yearly = הסכום שמוזן הוא שנתי ומחולק ל-12
  const CALCS = {
    insurance: { label: 'ביטוחים', yearly: false },
    subscriptions: { label: 'מנויים', yearly: false },
    annual: { label: 'הוצאות שנתיות', yearly: true },
    education: { label: 'חינוך, חוגים וקייטנות', yearly: false },
    gifts: { label: 'מתנות לאירועים', yearly: true },
    cosmetics: { label: 'קוסמטיקה', yearly: false }
  };
  // שורות שהסכום שלהן מחושב מחלק אחר בתוכנית
  const LINKED = {
    savings: 'מהחסכונות', loans: 'מההלוואות וכרטיסי האשראי', mortgage: 'מההלוואות',
    installments: 'מהעסקאות בתשלומים', sim1: 'מסימולציה 1', sim2: 'מסימולציה 2', bizSalary: 'מהמיפוי של העסק'
  };
  const OK_LINE = 1000; // התזרים צבוע: מתחת ל-0 אדום, עד 1,000 צהוב, מעל ירוק (כמו בקובץ)

  /* ---------- small helpers ---------- */
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const has = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const sum = (arr, f) => (arr || []).reduce((s, x) => s + num(f ? f(x) : x), 0);
  const round = (n, d) => { const p = Math.pow(10, d || 0); return Math.round(num(n) * p) / p; };
  let seq = 0;
  const uid = () => Date.now().toString(36).slice(-5) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

  function ym(d) { d = d ? new Date(d) : new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function ymAdd(key, n) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return ym(d);
  }
  function ymDiff(a, b) { // months from a to b
    const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number);
    return (by - ay) * 12 + (bm - am);
  }
  const ymLabel = key => { const [y, m] = key.split('-').map(Number); return MONTHS[m - 1] + ' ' + y; };
  const tone = v => (num(v) < 0 ? 'neg' : num(v) <= OK_LINE ? 'mid' : 'pos');

  /* ---------- defaults: the categories of the old template ---------- */
  const line = (label, extra) => Object.assign({ id: uid(), label, amount: '' }, extra);
  const vline = (label, extra) => Object.assign({ id: uid(), label, m: ['', '', ''] }, extra);
  const cat = (group, label, extra) => group === 'var' ? Object.assign(vline(label, extra), { group }) : Object.assign(line(label, extra), { group });

  function homeBook() {
    return {
      incomes: [
        line('בעל - עבודה 1 (תלוש)', { payslip: true }), line('בעל - עבודה 2'),
        line('אישה - עבודה 1 (תלוש)', { payslip: true }), line('אישה - עבודה 2'),
        line('קצבת ילדים'), line('קצבאות נוספות'), line('סיוע בשכר דירה'), line('מזונות'),
        line('הכנסה מנכס'), line('סיוע מההורים'), line('הכנסות מהעסק', { calc: 'bizSalary' })
      ],
      cats: [
        cat('save', 'הוראות קבע לחיסכון', { calc: 'savings' }), cat('save', 'ליווי פיננסי'),
        cat('fixed', 'משכנתא', { calc: 'mortgage' }), cat('fixed', 'שכר דירה'), cat('fixed', 'ועד בית'), cat('fixed', 'גז'),
        cat('fixed', 'ארנונה'), cat('fixed', 'מים וביוב'), cat('fixed', 'חשמל'), cat('fixed', 'תרומות בהוראת קבע'),
        cat('fixed', 'חינוך, חוגים וקייטנות', { calc: 'education' }), cat('fixed', 'ביטוחי בריאות וחיים', { calc: 'insurance' }),
        cat('fixed', 'מנויים', { calc: 'subscriptions' }), cat('fixed', 'הוצאות שנתיות', { calc: 'annual' }), cat('fixed', 'בריאות'),
        cat('fixed', 'ריבית על המינוס'), cat('fixed', 'עמלת פעולות בערוץ ישיר'), cat('fixed', 'עמלת SMS'), cat('fixed', 'דמי כרטיס אשראי'),
        cat('fixed', 'החזר הלוואות + חיוב קבוע', { calc: 'loans' }), cat('fixed', 'עסקאות בתשלומים', { calc: 'installments' }),
        cat('fixed', 'סימולציה 1 לסגירת הלוואות', { calc: 'sim1' }), cat('fixed', 'סימולציה 2 לסגירת הלוואות', { calc: 'sim2' }),
        cat('var', 'מזון לבית'), cat('var', 'אוכל בחוץ ובילויים'), cat('var', 'פארם'), cat('var', 'דלק וחניה'),
        cat('var', 'מתנות לאירועים ולשמחות', { calc: 'gifts' }), cat('var', 'ביגוד והנעלה'), cat('var', 'תחב"צ'), cat('var', 'כבישי אגרה'),
        cat('var', 'תספורת וקוסמטיקה', { calc: 'cosmetics' }), cat('var', 'תחביבים'), cat('var', 'סיגריות'), cat('var', 'חופשה/טיול'),
        cat('var', 'עוזרת/שמרטף'), cat('var', 'תיקוני רכב'), cat('var', 'בריאות שוטף'), cat('var', 'בעלי חיים'),
        cat('var', 'דמי כיס/ילדים'), cat('var', 'יהדות/חגים'), cat('var', 'שונות'), cat('var', 'ביט ללא מעקב'), cat('var', 'מזומן ללא מעקב')
      ],
      // paid from this account, belongs to the other book (old: "הוצאות עסק" in the home mapping)
      forOther: [vline('קידום ממומן'), vline('סחורה'), vline('פרילנסרים'), vline('שונות עסק')],
      calcs: {
        insurance: [line('ביטוח בריאות'), line('ביטוח חיים'), line('ביטוח רכוש (נכס / תכולה)'), line('תאונות אישיות'), line('קופת חולים - שב"ן')],
        subscriptions: [line('Spotify / Apple Music'), line('כבלים / Hot / Yes'), line('Netflix'), line('ספק אינטרנט'), line('ספורט / חדר כושר'), line('טלפון נייד'), line('מפעל הפיס / הגרלות')],
        annual: [line('חופשות'), line('רישיון רכב + טסט'), line('מתנות לבני/בנות זוג'), line('קייטנות'), line('ביטוח חובה'), line('ביטוח מקיף'), line('בעלי חיים')],
        education: [line('מעון'), line('גן'), line('בית ספר'), line('חוג'), line('לימודים')],
        gifts: [line('חתונה'), line('חינה'), line('בר/בת מצווה'), line('יום הולדת'), line('מתנה לחג')],
        cosmetics: [line('תספורת'), line('ציפורניים'), line('טיפוח')]
      },
      savings: [sline('קרן חירום'), sline('חיסכון בבית (מזומן)'), sline('חיסכון בבנק'), sline('חיסכון לטווח ארוך'),
        sline('קרן השתלמות'), sline('פנסיה'), sline('קופת גמל להשקעה'), sline('חסכונות ילדים')],
      bank: [{ id: uid(), label: 'עובר ושב', date: '', balance: '', limit: '' }],
      cards: [],
      loans: [],
      installments: [],
      mortgage: { lender: '', value: '' },
      sims: [sim(), sim()],
      credit: { score: '', date: '' }
    };
  }
  function businessBook() {
    return {
      incomes: [line('סליקה'), line('העברות'), line('ביט'), line('הפקדות מזומן')],
      cats: [
        cat('save', 'הוראות קבע לחיסכון', { calc: 'savings' }), cat('save', 'ליווי פיננסי'),
        cat('fixed', 'משכורת לחשבון הבית', { home: true }), cat('fixed', 'שכירות'), cat('fixed', 'ועד בית / דמי ניהול'), cat('fixed', 'חשמל'),
        cat('fixed', 'מים'), cat('fixed', 'ארנונה'), cat('fixed', 'גז'), cat('fixed', 'עמלות וריביות בנקים'),
        cat('fixed', 'ביטוחים', { calc: 'insurance' }), cat('fixed', 'מנויים', { calc: 'subscriptions' }), cat('fixed', 'הוצאות שנתיות', { calc: 'annual' }),
        cat('fixed', 'רואה חשבון'), cat('fixed', 'מקדמות ביטוח לאומי'), cat('fixed', 'מקדמות מס הכנסה'), cat('fixed', 'מע"מ'),
        cat('fixed', 'החזר הלוואות + חיוב קבוע', { calc: 'loans' }), cat('fixed', 'עסקאות בתשלומים', { calc: 'installments' }),
        cat('fixed', 'סימולציה 1 לסגירת הלוואות', { calc: 'sim1' }), cat('fixed', 'סימולציה 2 לסגירת הלוואות', { calc: 'sim2' }),
        cat('var', 'סחורה'), cat('var', 'קידום ממומן'), cat('var', 'צרכי משרד'), cat('var', 'קמפיינים'), cat('var', 'שיווק'),
        cat('var', 'ספקים'), cat('var', 'משכורות עובדים'), cat('var', 'ביטוח לאומי עובדים'), cat('var', 'פרילנסרים'), cat('var', 'צילום'),
        cat('var', 'עריכה'), cat('var', 'קורסים מקצועיים'), cat('var', 'שונות'), cat('var', 'ביט ללא מעקב'), cat('var', 'מזומן ללא מעקב')
      ],
      forOther: [vline('מסעדות ובילויים'), vline('מזון'), vline('ביגוד'), vline('שונות בית')],
      calcs: {
        insurance: [line('ביטוח עסק'), line('ביטוח אחריות מקצועית')],
        subscriptions: [line('תוכנות ואפליקציות'), line('ספק אינטרנט'), line('טלפון נייד')],
        annual: [line('דוח שנתי'), line('רישיון רכב + טסט'), line('ביטוחי רכב'), line('בלאי')],
        education: [], gifts: [], cosmetics: []
      },
      savings: [sline('קרן חירום לעסק'), sline('חיסכון בבנק'), sline('קרן השתלמות'), sline('פנסיה')],
      bank: [{ id: uid(), label: 'חשבון העסק', date: '', balance: '', limit: '' }],
      cards: [], loans: [], installments: [],
      mortgage: { lender: '', value: '' },
      sims: [sim(), sim()],
      credit: { score: '', date: '' }
    };
  }
  function sline(label) { return { id: uid(), label, monthly: '', balance: '', due: '' }; }
  function sim() { return { on: false, amount: '', months: '', rate: '', payment: '', closes: [] }; }

  function meetings() {
    return [1, 2, 3, 4].map(n => ({
      n, date: '', topic: '', purpose: '', tasks: '',
      applied: '', took: '', achieved: '', improvement: '', ask: '',
      // meeting 4 only
      goalsReached: '', impact: '', yearFromNow: '', words: ''
    }));
  }

  function newPlan(opts) {
    opts = opts || {};
    const start = opts.start || ym();
    return {
      v: 1,
      name: opts.name || '',
      start, // YYYY-MM, first month of the process
      goalsText: '',
      hasBusiness: !!opts.hasBusiness,
      home: homeBook(),
      business: businessBook(),
      months: {},
      lt: {
        emergency: { have: '', monthly: '' },
        long: { target: '', have: '', monthly: '' },
        kids: { target: '', have: '', monthly: '' },
        goalsHave: '',
        buffer: { target: '', have: '', monthly: '' },
        account: { have: '', monthly: '' },
        horizon: 120, // months for "expected long-term savings"
        after: [line('חיסכון לטווח ארוך'), line('חיסכון לילדים'), line('השקעות')],
        goals: [
          { id: uid(), label: 'חופשה', months: '', amount: '', other: '' },
          { id: uid(), label: 'רהיט', months: '', amount: '', other: '' },
          { id: uid(), label: 'רכב', months: '', amount: '', other: '' }
        ]
      },
      meetings: meetings()
    };
  }

  /* ---------- 7: Spitzer loan payment (old: =-(PMT(rate/12, months, amount))) ---------- */
  function pmt(ratePct, months, amount) {
    const n = num(months), pv = num(amount), r = num(ratePct) / 100 / 12;
    if (!(n > 0) || !pv) return 0;
    if (!r) return pv / n;
    return pv * r / (1 - Math.pow(1 + r, -n));
  }

  /* ---------- 1: variable expense = 3 months / 3 (old: =K47/3) ---------- */
  const avg3 = m => sum(m) / 3;

  /* ---------- 10: helper calculators ---------- */
  function calcTotal(book, key) {
    const list = (book.calcs && book.calcs[key]) || [];
    const t = sum(list, x => x.amount);
    return CALCS[key] && CALCS[key].yearly ? t / 12 : t;
  }

  /* ---------- 5 + 11: loans and cards ---------- */
  function loanRow(l) {
    const left = num(l.left), pay = num(l.payment);
    return { remaining: pay * left, long: left > 18 }; // old: =M11*L11, split at 18 payments
  }
  function debtStats(book) {
    const loans = book.loans || [];
    const nonMort = loans.filter(l => !l.mortgage);
    const mort = loans.filter(l => l.mortgage);
    const cards = book.cards || [];
    return {
      payments: sum(nonMort, l => l.payment),                       // old: W17+W25
      cardFixed: sum(cards, c => c.fixed),                           // old: E40
      principal: sum(nonMort, l => l.principal) + sum(cards, c => c.balance), // old: S27, now every row counts
      remaining: sum(nonMort, l => loanRow(l).remaining),            // old: X17+X25, now every row counts
      mortgagePayment: sum(mort, l => l.payment),
      mortgagePrincipal: sum(mort, l => l.principal),
      mortgageRemaining: sum(mort, l => loanRow(l).remaining),
      cardLimit: sum(cards, c => c.limit),
      cardBalance: sum(cards, c => c.balance)
    };
  }

  /* ---------- 6: installments. The current payment moves by itself every month ---------- */
  function installmentAt(it, key) {
    const total = Math.max(0, Math.round(num(it.total)));
    if (!it.first || !total) return { no: 0, left: 0, active: false, remaining: 0 };
    const no = ymDiff(it.first, key) + 1;          // payment number in this month
    const active = no >= 1 && no <= total;
    const left = no < 1 ? total : Math.max(0, total - no); // old: =S8-U8
    return { no, left, active, remaining: left * num(it.amount) }; // old: =V8*T8
  }
  function installmentStats(book, key) {
    const rows = (book.installments || []).map(it => installmentAt(it, key));
    return {
      monthly: sum((book.installments || []).filter((it, i) => rows[i].active), it => it.amount),
      remaining: sum(rows, r => r.remaining)
    };
  }

  /* ---------- 8: loan consolidation (old: AC46 = AC32-SUM(AC33:AC44), AD46 = SUM(AD33:AD44)-AD32) ---------- */
  function simResult(book, s) {
    s = s || sim();
    const closed = (book.loans || []).filter(l => (s.closes || []).includes(l.id));
    const payment = has(s.payment) ? num(s.payment) : pmt(s.rate, s.months, s.amount);
    const balances = sum(closed, l => l.principal);
    const oldPayments = sum(closed, l => l.payment);
    return {
      payment,
      closed: closed.length,
      balances,
      cashLeft: num(s.amount) - balances,     // what's left of the new loan after closing
      saving: oldPayments - payment           // monthly saving
    };
  }

  /* ---------- the mapping: one number per line ---------- */
  function linkedValue(plan, bookKey, key, month) {
    const book = plan[bookKey];
    switch (key) {
      case 'savings': return sum(book.savings, s => s.monthly);                       // old: I4 = AB16
      case 'loans': { const d = debtStats(book); return d.payments + d.cardFixed; }   // old: I29 = W27+E40
      case 'mortgage': return debtStats(book).mortgagePayment;                        // old: I11 = W8
      case 'installments': return installmentStats(book, month || ym()).monthly; // old: I30 = W64. The mapping is "now": installments of this month
      case 'sim1': case 'sim2': {
        const s = book.sims[key === 'sim1' ? 0 : 1];
        return s && s.on ? -simResult(book, s).saving : 0;                             // old: I32 = -AD46
      }
      case 'bizSalary': {
        if (!plan.hasBusiness || bookKey !== 'home') return 0;
        const c = plan.business.cats.find(x => x.home);
        return c ? lineValue(plan, 'business', c, month) : 0;                          // old: M17 = 'מיפוי לעסק'!I12
      }
      default: return CALCS[key] ? calcTotal(book, key) : 0;
    }
  }
  function isLinked(c) { return !!(c.calc && (LINKED[c.calc] || CALCS[c.calc])); }
  function lineValue(plan, bookKey, c, month) {
    if (c.calc && LINKED[c.calc]) return linkedValue(plan, bookKey, c.calc, month);
    // a helper calculator wins only when it has numbers in it
    if (c.calc && CALCS[c.calc]) {
      const v = calcTotal(plan[bookKey], c.calc);
      if (v) return v;
    }
    return c.m ? avg3(c.m) : num(c.amount);
  }
  function crossLines(plan, bookKey) {
    // lines the other account pays for this book (old: H59..H62 "- חשבון עסק")
    if (!plan.hasBusiness) return [];
    const other = bookKey === 'home' ? 'business' : 'home';
    return (plan[other].forOther || []).map(x => ({
      id: 'x-' + x.id, label: x.label + (other === 'home' ? ' (מחשבון הבית)' : ' (מחשבון העסק)'),
      group: 'var', cross: true, value: avg3(x.m)
    }));
  }
  function mappingRows(plan, bookKey, month) {
    const book = plan[bookKey];
    const rows = book.cats.map(c => ({ id: c.id, label: c.label, group: c.group, calc: c.calc || '', value: lineValue(plan, bookKey, c, month) }));
    return rows.concat(crossLines(plan, bookKey));
  }

  /* ---------- 2 + 3: totals and cashflow (old: C61 = M19-I10-I63, C63 = M19-I63) ---------- */
  function mappingSummary(plan, bookKey, month) {
    const book = plan[bookKey];
    const incomes = book.incomes.map(i => ({ id: i.id, label: i.label, value: i.calc ? linkedValue(plan, bookKey, i.calc, month) : num(i.amount) }));
    const rows = mappingRows(plan, bookKey, month);
    const by = g => sum(rows.filter(r => r.group === g), r => r.value);
    const income = sum(incomes, i => i.value);
    const savings = by('save'), fixed = by('fixed'), variable = by('var');
    const expenses = fixed + variable;
    return {
      incomes, rows, income, savings, fixed, variable, expenses,
      cashflow: income - savings - expenses,       // "תזרים חודשי בחשבון"
      cashflowNoSavings: income - expenses,        // "תזרים חודשי ללא הפרשות לחיסכון"
      bank: sum(book.bank, b => b.balance)
    };
  }

  /* ---------- 4: net worth (old: AC18 = AC16+M29+Q34-S8-S27-X64 + business) ---------- */
  function netWorthBook(plan, bookKey, month) {
    const book = plan[bookKey];
    const d = debtStats(book);
    const assets = sum(book.savings, s => s.balance) + sum(book.bank, b => b.balance) + num(book.mortgage && book.mortgage.value);
    const debts = d.mortgagePrincipal + d.principal + installmentStats(book, month || ym()).remaining;
    return { assets, debts, net: assets - debts };
  }
  function netWorth(plan, month) {
    const h = netWorthBook(plan, 'home', month);
    if (!plan.hasBusiness) return h;
    const b = netWorthBook(plan, 'business', month);
    return { assets: h.assets + b.assets, debts: h.debts + b.debts, net: h.net + b.net };
  }

  /* ---------- 9: mortgage (old: S34 = R34/Q34, U34 = (50%-S34)*Q34, Z34 = (Y34+X34)/W34) ---------- */
  function mortgageStats(plan) {
    const book = plan.home;
    const d = debtStats(book);
    const value = num(book.mortgage.value);
    const share = value ? d.mortgagePrincipal / value : 0;
    const payslips = sum(book.incomes.filter(i => i.payslip), i => i.amount);
    return {
      value, principal: d.mortgagePrincipal, share,
      to50: value ? (0.5 - share) * value : 0,
      to70: value ? (0.7 - share) * value : 0,
      payslips,
      ratio: payslips ? (d.mortgagePayment + d.payments) / payslips : 0
    };
  }

  /* ---------- 12: a month, budget vs actual ---------- */
  function monthRowsFrom(plan, bookKey, key, prev) {
    // budget comes from last month when there is one, otherwise from the mapping
    const map = mappingSummary(plan, bookKey, key);
    const prevRows = prev && prev.rows ? Object.fromEntries(prev.rows.map(r => [r.id, r])) : null;
    const prevInc = prev && prev.inc ? Object.fromEntries(prev.inc.map(r => [r.id, r])) : null;
    const pick = (r, p) => {
      // linked lines (installments, loans...) always follow the current data
      if (r.calc && LINKED[r.calc]) return round(r.value);
      return p && has(p.b) ? num(p.b) : round(r.value);
    };
    const rows = map.rows.map(r => ({ id: r.id, label: r.label, group: r.group, calc: r.calc || '', b: pick(r, prevRows && prevRows[r.id]), a: '' }));
    if (prevRows) prev.rows.filter(r => r.extra).forEach(r => rows.push({ id: r.id, label: r.label, group: r.group, extra: true, b: r.b, a: '' }));
    const inc = map.incomes.map(i => {
      const p = prevInc && prevInc[i.id];
      return { id: i.id, label: i.label, b: p && has(p.b) && !isIncLinked(plan, bookKey, i.id) ? num(p.b) : round(i.value), a: '' };
    });
    return { rows, inc, flow: { start: '', items: [] }, note: '' };
  }
  function isIncLinked(plan, bookKey, id) { const i = plan[bookKey].incomes.find(x => x.id === id); return !!(i && i.calc); }

  function ensureMonth(plan, key) {
    plan.months = plan.months || {};
    if (plan.months[key]) return plan.months[key];
    const prevKey = Object.keys(plan.months).filter(k => k < key).sort().pop();
    const prev = prevKey ? plan.months[prevKey] : null;
    const m = { home: monthRowsFrom(plan, 'home', key, prev && prev.home) };
    if (plan.hasBusiness) m.business = monthRowsFrom(plan, 'business', key, prev && prev.business);
    plan.months[key] = m;
    return m;
  }
  // refresh the budget of an existing month from the mapping, keeping what was spent
  function rebudget(plan, key, bookKey) {
    const m = plan.months[key];
    const fresh = monthRowsFrom(plan, bookKey, key, null);
    const old = m && m[bookKey];
    if (old) {
      const a = Object.fromEntries(old.rows.map(r => [r.id, r.a]));
      const ai = Object.fromEntries(old.inc.map(r => [r.id, r.a]));
      fresh.rows.forEach(r => { if (r.id in a) r.a = a[r.id]; });
      old.rows.filter(r => r.extra).forEach(r => fresh.rows.push(r));
      fresh.inc.forEach(r => { if (r.id in ai) r.a = ai[r.id]; });
      fresh.flow = old.flow; fresh.note = old.note;
    }
    m[bookKey] = fresh;
    return fresh;
  }

  function monthSummary(mb) {
    if (!mb) return null;
    const g = (grp, f) => sum(mb.rows.filter(r => r.group === grp), f);
    // a month counts (home screen, annual report) once it has actual income and actual expenses
    const filled = mb.rows.some(r => has(r.a)) && mb.inc.some(r => has(r.a));
    const started = mb.rows.some(r => has(r.a)) || mb.inc.some(r => has(r.a));
    const incB = sum(mb.inc, r => r.b), incA = sum(mb.inc, r => r.a);
    const saveB = g('save', r => r.b), saveA = g('save', r => r.a);
    const expB = g('fixed', r => r.b) + g('var', r => r.b), expA = g('fixed', r => r.a) + g('var', r => r.a);
    return {
      filled, started, incB, incA, saveB, saveA, expB, expA,
      cashB: incB - saveB - expB, cashA: incA - saveA - expA,   // old: D40 / D61
      freeB: incB - expB, freeA: incA - expA                    // old: D42 / D63 (this one goes to the annual report)
    };
  }

  /* ---------- 12b: checking-account check: does the balance hold until the salary? ---------- */
  function flowCheck(flow, limit) {
    const items = ((flow && flow.items) || []).filter(x => has(x.amount))
      .map(x => ({ label: x.label, day: Math.min(31, Math.max(1, Math.round(num(x.day) || 1))), amount: num(x.amount) * (x.dir === 'in' ? 1 : -1) }))
      .sort((a, b) => a.day - b.day || b.amount - a.amount);
    let bal = num(flow && flow.start);
    let low = { day: 0, balance: bal };
    const steps = items.map(x => {
      bal += x.amount;
      if (bal < low.balance) low = { day: x.day, balance: bal };
      return Object.assign({ balance: bal }, x);
    });
    const lim = -Math.abs(num(limit));
    return { steps, end: bal, low, overLimit: low.balance < lim, minus: low.balance < 0 };
  }

  /* ---------- 13: annual report. Fixed: negative months count, empty months don't ---------- */
  function yearSummary(plan, year, bookKey) {
    bookKey = bookKey || 'home';
    const rows = MONTHS.map((name, i) => {
      const key = year + '-' + String(i + 1).padStart(2, '0');
      const m = plan.months && plan.months[key];
      const s = m ? monthSummary(m[bookKey]) : null;
      return { key, name, filled: !!(s && s.filled), income: s ? s.incA : 0, expenses: s ? s.expA : 0, cashflow: s ? s.freeA : 0 };
    });
    const done = rows.filter(r => r.filled);
    const stat = f => {
      if (!done.length) return { total: 0, avg: 0, max: null, min: null };
      const total = sum(done, f);
      const max = done.reduce((a, b) => (f(b) > f(a) ? b : a));
      const min = done.reduce((a, b) => (f(b) < f(a) ? b : a));
      return { total, avg: total / done.length, max: { name: max.name, value: f(max) }, min: { name: min.name, value: f(min) } };
    };
    return { rows, months: done.length, income: stat(r => r.income), expenses: stat(r => r.expenses), cashflow: stat(r => r.cashflow) };
  }

  /* ---------- 14: long-term plan (old sheet "בניית תכנית כלכלית לטווח ארוך") ---------- */
  function goalMonthly(g) { // fixed: other funding is taken off before dividing
    const m = num(g.months);
    return m > 0 ? Math.max(0, num(g.amount) - num(g.other)) / m : 0;
  }
  function longTerm(plan) {
    const map = mappingSummary(plan, 'home');
    const lt = plan.lt;
    const avg = { income: map.income, fixed: map.fixed, variable: map.variable };
    avg.cashflow = avg.income - avg.fixed - avg.variable;                 // old: C8 = C5-C6-C7
    const monthlyExp = avg.fixed + avg.variable;
    const existing = sum(plan.home.savings, s => s.balance);              // old: C10
    const goals = (lt.goals || []).map(g => Object.assign({}, g, { monthly: goalMonthly(g) }));
    const goalsTotal = sum(goals, g => g.amount);                           // old: F32
    const goalsMonthly = sum(goals, g => g.monthly);                        // old: G32
    const items = [
      { key: 'emergency', label: 'קרן חירום', target: monthlyExp * 3, have: num(lt.emergency.have), monthly: num(lt.emergency.monthly) }, // old: F5 = (C6+C7)*3
      { key: 'long', label: 'חיסכון לטווח ארוך', target: num(lt.long.target), have: num(lt.long.have), monthly: num(lt.long.monthly) },
      { key: 'kids', label: 'חיסכון לילדים', target: num(lt.kids.target), have: num(lt.kids.have), monthly: num(lt.kids.monthly) },
      { key: 'goals', label: 'מטרות ויעדים', target: goalsTotal, have: num(lt.goalsHave), monthly: goalsMonthly },
      { key: 'buffer', label: 'תזרים ביטחון בעובר ושב', target: num(lt.buffer.target), have: num(lt.buffer.have), monthly: num(lt.buffer.monthly) },
      { key: 'account', label: 'סכום בעובר ושב', target: monthlyExp, have: num(lt.account.have), monthly: num(lt.account.monthly) } // old: F10 = C6+C7
    ];
    items.forEach(it => {
      const gap = Math.max(0, it.target - it.have);
      it.months = it.monthly > 0 ? gap / it.monthly : (gap > 0 ? null : 0);  // old: E192 = (B-C)/D
    });
    const emergency = items[0];
    const free = avg.cashflow - sum(items, i => i.monthly);                 // old: K12 = K4-SUM(K5:K10)
    const after = avg.cashflow - sum(lt.after, a => a.amount);              // old: K26 = K18-SUM(K19:K24)
    return {
      avg, existing, bankToday: map.bank, items, goals, goalsTotal, goalsMonthly,
      oneTime: existing - sum(items, i => i.have),                          // old: G12 = G4-SUM(G5:G10)
      free, after,
      emergencyMonths: emergency.monthly > 0 ? Math.max(0, emergency.target - emergency.have) / emergency.monthly : null // old: J17
    };
  }

  /* ---------- 15: progress form sentence ---------- */
  function yearsMonths(months) {
    const m = Math.max(0, Math.round(num(months)));
    const y = Math.floor(m / 12), r = m % 12;
    const ms = r === 1 ? 'חודש אחד' : r + ' חודשים';
    const ys = y === 1 ? 'שנה אחת' : y === 2 ? 'שנתיים' : y + ' שנים';
    if (!y) return ms;
    if (!r) return ys;
    return ys + ' ו-' + ms;
  }
  function expected(have, monthly, months) { return num(have) + num(monthly) * num(months); } // old: E199 = C+D*B
  function expectedSentence(label, have, monthly, months) {
    if (!(num(months) > 0)) return '';
    return 'סכום החיסכון הצפוי ב' + label + ' הוא ' + Math.round(expected(have, monthly, months)).toLocaleString('he-IL') + ' ₪ לאחר תקופה של ' + yearsMonths(months);
  }

  /* ---------- 16: home screen digest ---------- */
  function digest(plan, key) {
    key = key || ym();
    const home = mappingSummary(plan, 'home', key);
    const m = plan.months && plan.months[key];
    const ms = m ? monthSummary(m.home) : null;
    const year = yearSummary(plan, key.slice(0, 4), 'home');
    return {
      key, mapping: home, month: ms,
      cashflow: ms && ms.filled ? ms.cashA : (ms ? ms.cashB : home.cashflow),
      cashflowKind: ms && ms.filled ? 'actual' : ms ? 'budget' : 'mapping',
      net: netWorth(plan, key),
      year,
      lt: longTerm(plan)
    };
  }

  /* ---------- readable copy for the client's Google Sheet (Plan.gs writes it as is) ---------- */
  function tables(plan) {
    const r = n => Math.round(num(n));
    const out = {};
    const books = plan.hasBusiness ? ['home', 'business'] : ['home'];
    books.forEach(bk => {
      const s = mappingSummary(plan, bk);
      const rows = [['מיפוי ' + BOOKS[bk], '', ''], ['הכנסות', '', '']];
      s.incomes.forEach(i => rows.push(['', i.label, r(i.value)]));
      Object.keys(GROUPS).forEach(g => {
        rows.push([GROUPS[g], '', '']);
        s.rows.filter(x => x.group === g).forEach(x => rows.push(['', x.label, r(x.value)]));
      });
      rows.push(['', '', ''], ['סה"כ הכנסות', '', r(s.income)], ['סה"כ חסכונות', '', r(s.savings)], ['סה"כ הוצאות', '', r(s.expenses)],
        ['תזרים חודשי', '', r(s.cashflow)], ['תזרים ללא הפרשות לחיסכון', '', r(s.cashflowNoSavings)]);
      out['מיפוי ' + BOOKS[bk]] = rows;
    });
    const months = [['חודש', 'חשבון', 'קבוצה', 'שורה', 'תקציב', 'ביצוע']];
    Object.keys(plan.months || {}).sort().forEach(k => books.forEach(bk => {
      const mb = plan.months[k][bk];
      if (!mb) return;
      mb.inc.forEach(x => months.push([ymLabel(k), BOOKS[bk], 'הכנסות', x.label, r(x.b), has(x.a) ? r(x.a) : '']));
      mb.rows.forEach(x => months.push([ymLabel(k), BOOKS[bk], GROUPS[x.group] || '', x.label, r(x.b), has(x.a) ? r(x.a) : '']));
    }));
    out['חודשים'] = months;
    const debts = [['חשבון', 'סוג', 'שם', 'יתרה', 'החזר חודשי', 'תשלומים שנותרו', 'נותר לתשלום']];
    books.forEach(bk => {
      const b = plan[bk];
      b.loans.forEach(l => debts.push([BOOKS[bk], l.mortgage ? 'משכנתא' : 'הלוואה', l.label, r(l.principal), r(l.payment), r(l.left), r(loanRow(l).remaining)]));
      b.cards.forEach(c => debts.push([BOOKS[bk], 'כרטיס אשראי', c.label, r(c.balance), r(c.fixed), '', '']));
      b.installments.forEach(it => { const x = installmentAt(it, ym()); debts.push([BOOKS[bk], 'תשלומים', it.label, '', r(it.amount), x.left, r(x.remaining)]); });
    });
    out['חובות'] = debts;
    const lt = longTerm(plan);
    const goals = [['מוצר', 'סכום יעד', 'סכום קיים', 'הפרשה חודשית', 'חודשים ליעד']];
    lt.items.forEach(i => goals.push([i.label, r(i.target), r(i.have), r(i.monthly), i.months == null ? '' : Math.ceil(i.months)]));
    goals.push(['', '', '', '', ''], ['יעד', 'סכום', 'מקור מימון אחר', 'חודשים', 'חיסכון חודשי']);
    lt.goals.forEach(g => goals.push([g.label, r(g.amount), r(g.other), r(g.months), r(g.monthly)]));
    out['יעדים'] = goals;
    return out;
  }

  const api = {
    MONTHS, GROUPS, BOOKS, CALCS, LINKED, OK_LINE, tables,
    num, has, sum, round, uid, ym, ymAdd, ymDiff, ymLabel, tone,
    newPlan, homeBook, businessBook, sline, sim, meetings,
    pmt, avg3, calcTotal, loanRow, debtStats, installmentAt, installmentStats, simResult,
    isLinked, lineValue, linkedValue, mappingRows, mappingSummary, netWorth, netWorthBook, mortgageStats,
    ensureMonth, rebudget, monthSummary, flowCheck, yearSummary,
    goalMonthly, longTerm, yearsMonths, expected, expectedSentence, digest
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlanCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
