/* ייבוא מקובץ האקסל הישן ("קובץ תוכנית כלכלית 2026") לתוכנית באפליקציה.
   Plan.gs (plan_import) מחזיר את התאים הגולמיים של הלשוניות, וכאן הם הופכים לתוכנית.
   מתאים שורות לפי השם שלהן, כך שגם קובץ שהלקוח שינה בו שמות נכנס, ושורה לא מוכרת נוספת כשורה חדשה. */
(function (root) {
  'use strict';
  const C = root.PlanCalc || (typeof require !== 'undefined' ? require('./calc.js') : null);

  const SHEET = { home: 'מיפוי לבית', business: 'מיפוי לעסק', loans: 'הלוואות + תשלומים', lt: 'בניית תכנית כלכלית לטווח ארוך', form: 'טופס התקדמות' };
  // old label -> label in the app (only where they differ)
  const ALIAS = {
    'עסקאות תשלומים': 'עסקאות בתשלומים', 'ועד בית/דמי ניהול': 'ועד בית / דמי ניהול', 'שכירות': 'שכירות',
    'בעל עבודה 1 (תלוש בלבד)': 'בעל - עבודה 1 (תלוש)', 'בעל עבודה 2': 'בעל - עבודה 2',
    'אישה עבודה 1 (תלוש בלבד)': 'אישה - עבודה 1 (תלוש)', 'אישה עבודה 2': 'אישה - עבודה 2', 'ביטוחים': 'ביטוחים'
  };
  // rows in the old mapping that are computed from another part of the file. Their numbers come in through that part.
  const SKIP = ['גיליון הלוואות ותשלומים', 'סך הכל', 'סה"כ', 'סה"כ הכנסות'];

  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const key = s => norm(s).replace(/["'״׳]/g, '').replace(/\s*[-/]\s*/g, '-');
  const num = v => (typeof v === 'number' ? v : Number(String(v || '').replace(/[,₪\s]/g, '')) || 0);
  const val = v => { const n = num(v); return n ? n : ''; };
  const cell = (g, r, c) => (g && g[r - 1] && g[r - 1][c - 1] !== undefined ? g[r - 1][c - 1] : '');
  const col = s => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const at = (g, ref) => { const m = ref.match(/^([A-Z]+)(\d+)$/); return cell(g, Number(m[2]), col(m[1])); };
  const day = v => { const s = String(v || ''); const m = s.match(/^(\d{4})-(\d\d)-(\d\d)/); return m ? m[3] + '/' + m[2] + '/' + m[1] : norm(s); };

  function findByLabel(list, label) {
    const k = key(ALIAS[norm(label)] || label);
    return list.find(x => key(x.label) === k) || list.find(x => key(x.label).replace(/\(.*\)/, '') === k.replace(/\(.*\)/, ''));
  }

  /* ---------- the mapping of one book ---------- */
  function importBook(plan, bk, g, L) {
    const book = plan[bk];
    let found = false;
    // expenses: label in H, number in I, groups by the headers in G
    let group = 'save';
    for (let r = 4; r <= 62; r++) {
      const head = norm(cell(g, r, col('G')));
      if (head.startsWith('חסכונות')) group = 'save';
      else if (head.startsWith('חודשיות קבועות')) group = 'fixed';
      else if (head.startsWith('חודשיות משתנות')) group = 'var';
      else if (head.startsWith('הוצאות')) break; // cross-account block at the bottom
      const label = norm(cell(g, r, col('H')));
      if (!label || SKIP.includes(label) || / - חשבון (עסק|בית)$/.test(label)) continue;
      const v = num(cell(g, r, col('I')));
      let c = findByLabel(book.cats, label);
      if (c && C.isLinked(c) && C.LINKED[c.calc]) { if (v) found = true; continue; } // comes from loans, savings...
      if (!c) {
        if (!v) continue;
        c = Object.assign(group === 'var' ? { m: ['', '', ''] } : { amount: '' }, { id: C.uid(), label, group });
        book.cats.push(c);
      }
      if (v) found = true;
      if (c.m) c.m = v ? [v, v, v] : ['', '', ''];
      else c.amount = val(v);
    }
    // incomes: label in K, number in M
    for (let r = 7; r <= 18; r++) {
      const label = norm(cell(g, r, col('K')));
      if (!label || SKIP.includes(label)) continue;
      const v = num(cell(g, r, col('M')));
      let i = findByLabel(book.incomes, label);
      if (i && i.calc) continue;
      if (!i) { if (!v) continue; i = { id: C.uid(), label, amount: '' }; book.incomes.push(i); }
      if (v) found = true;
      i.amount = val(v);
      if (/תלוש/.test(label)) i.payslip = true;
    }
    // bank accounts
    const bankRows = rowsAfter(g, 'K', /^חשבון$/, 4);
    const banks = bankRows.map(r => ({ id: C.uid(), label: norm(cell(g, r, col('K'))) || 'עובר ושב', date: day(cell(g, r, col('L'))), balance: val(cell(g, r, col('M'))), limit: val(cell(g, r, col('N'))) }))
      .filter(b => b.balance !== '' || b.limit !== '');
    if (banks.length) { book.bank = banks; found = true; }
    // credit cards
    const cards = rowsAfter(g, 'A', /^מספר כרטיס/, 7).map(r => ({
      id: C.uid(), label: norm(cell(g, r, 1)), day: val(cell(g, r, 2)), limit: val(cell(g, r, 3)), balance: val(cell(g, r, 4)), fixed: val(cell(g, r, 5))
    })).filter(c => c.label || c.limit || c.balance || c.fixed);
    if (cards.length) { book.cards = cards.map(c => Object.assign(c, { label: c.label || 'כרטיס' })); found = true; }
    // loans: name in Q, R..W, note Y. Row 8 is the mortgage
    const loans = [];
    for (let r = 8; r <= 24; r++) {
      const name = norm(cell(g, r, col('Q'))) || (r === 8 ? 'משכנתא' : '');
      const principal = num(cell(g, r, col('S'))), payment = num(cell(g, r, col('W')));
      if (/^(מעל|מתחת|סך)/.test(name) || !(principal || payment)) continue;
      loans.push({
        id: C.uid(), label: name || 'הלוואה', mortgage: r === 8 || /משכנתא/.test(name),
        original: val(cell(g, r, col('R'))), principal: val(principal), asOf: day(cell(g, r, col('T'))),
        rate: val(cell(g, r, col('U'))), left: val(cell(g, r, col('V'))), payment: val(payment), note: norm(cell(g, r, col('Y')))
      });
    }
    // mortgage property value
    const mv = num(cell(g, 34, col('Q')));
    if (mv) { book.mortgage = { lender: norm(cell(g, 34, col('P'))), value: mv }; found = true; }
    // installments: header "שם העסק"
    const inst = [];
    const ih = findRow(g, /^שם העסק$/, 30, 45);
    if (ih) {
      const c0 = ih.col - 1; // card column is just before the store name
      for (let r = ih.row + 1; r <= ih.row + 21; r++) {
        const store = norm(cell(g, r, c0 + 1)), total = num(cell(g, r, c0 + 2)), no = num(cell(g, r, c0 + 4)), amount = num(cell(g, r, c0 + 5));
        if (!amount || !total) continue;
        inst.push(installment(norm(cell(g, r, c0)), store, total, no, amount, L.start));
      }
    }
    // savings: AA..AD, rows 7-15
    for (let r = 7; r <= 15; r++) {
      const label = norm(cell(g, r, col('AA')));
      if (!label) continue;
      const monthly = num(cell(g, r, col('AB'))), balance = num(cell(g, r, col('AC')));
      let s = findByLabel(book.savings, label);
      if (!s) { if (!monthly && !balance) continue; s = C.sline(label); book.savings.push(s); }
      if (monthly || balance) found = true;
      s.monthly = val(monthly); s.balance = val(balance); s.due = day(cell(g, r, col('AD')));
    }
    const score = cell(g, 21, col('AB'));
    if (num(score)) book.credit = { score: num(score), date: day(cell(g, 21, col('AD'))) };
    // helper calculators
    const calc = (k, labelCol, valueCol, r1, r2) => {
      const items = [];
      for (let r = r1; r <= r2; r++) {
        const label = norm(cell(g, r, col(labelCol))), v = num(cell(g, r, col(valueCol)));
        if (label && v) items.push({ id: C.uid(), label, amount: v });
      }
      if (items.length) { book.calcs[k] = items; found = true; }
    };
    calc('insurance', 'AF', 'AH', 7, 14);
    calc('subscriptions', 'AJ', 'AL', 7, 17);
    calc('annual', 'AF', 'AG', 21, 29);
    calc('education', 'AJ', 'AL', 38, 47);
    // paid from this account for the other book: label row, 3-month total in the row below
    const cross = [];
    const ch = findRow(g, /^הוצאות (עסק|בית)$/, 40, 52);
    if (ch) {
      for (let r = ch.row + 1; r <= 63; r++) {
        const label = norm(cell(g, r, ch.col));
        if (!label || label === 'ביטוח חובה' || label === 'ביטוח מקיף') continue;
        const v = num(cell(g, r + 1, ch.col));
        if (v) cross.push({ id: C.uid(), label, m: [v / 3, v / 3, v / 3].map(x => Math.round(x)) });
        r++;
      }
    }
    if (cross.length) { book.forOther = cross; found = true; }
    // loan consolidation simulations
    book.sims = [simAt(g, 32, loans), simAt(g, 50, loans)];
    if (loans.length || inst.length) found = true;
    book.loans = loans;
    book.installments = inst;
    return found;
  }

  function installment(card, store, total, no, amount, start) {
    // the old file holds "payment number this month". The app keeps the first month and moves by itself.
    const first = no > 0 ? C.ymAdd(start, -(no - 1)) : start;
    return { id: C.uid(), card, label: store || 'עסקה', total, amount, first };
  }

  function simAt(g, row, loans) {
    const s = C.sim();
    const amount = num(cell(g, row, col('AC'))), payment = num(cell(g, row, col('AD')));
    if (!amount) return s;
    s.amount = amount;
    if (payment) s.payment = payment;
    for (let r = row + 1; r <= row + 12; r++) {
      const name = norm(cell(g, r, col('AB')));
      const l = name && loans.find(x => key(x.label) === key(name));
      if (l) s.closes.push(l.id);
    }
    return s;
  }

  function rowsAfter(g, letter, re, n) {
    const c = col(letter);
    for (let r = 1; r <= (g ? g.length : 0); r++) {
      if (re.test(norm(cell(g, r, c)))) return Array.from({ length: n }, (_, i) => r + 1 + i);
    }
    return [];
  }
  function findRow(g, re, r1, r2) {
    for (let r = r1; r <= r2; r++) {
      const row = (g && g[r - 1]) || [];
      for (let c = 1; c <= row.length; c++) if (re.test(norm(row[c - 1]))) return { row: r, col: c };
    }
    return null;
  }

  /* ---------- the separate loans sheet ---------- */
  function importLoansSheet(plan, g, start) {
    if (!g) return;
    const book = plan.home;
    for (let r = 11; r <= 78; r++) {
      const name = norm(cell(g, r, col('G')));
      const principal = num(cell(g, r, col('I'))), payment = num(cell(g, r, col('M')));
      if (!name || /^(מעל|מתחת|סך)/.test(name) || !(principal || payment)) continue;
      book.loans.push({
        id: C.uid(), label: name, mortgage: /משכנתא/.test(name), original: val(cell(g, r, col('H'))), principal: val(principal),
        asOf: day(cell(g, r, col('J'))), rate: val(cell(g, r, col('K'))), left: val(cell(g, r, col('L'))), payment: val(payment), note: norm(cell(g, r, col('O')))
      });
    }
    for (let r = 8; r <= 170; r++) {
      const total = num(cell(g, r, col('S'))), amount = num(cell(g, r, col('V')));
      if (!total || !amount) continue;
      book.installments.push(installment(norm(cell(g, r, col('Q'))), norm(cell(g, r, col('R'))), total, num(cell(g, r, col('U'))), amount, start));
    }
  }

  /* ---------- long-term plan ---------- */
  function importLongTerm(plan, g) {
    if (!g) return;
    const lt = plan.lt;
    const v = ref => val(at(g, ref));
    lt.emergency = { have: v('G5'), monthly: v('K5') };
    lt.long = { target: v('F6'), have: v('G6'), monthly: v('K6') };
    lt.kids = { target: v('F7'), have: v('G7'), monthly: v('K7') };
    lt.goalsHave = v('G8');
    lt.buffer = { target: v('F9'), have: v('G9'), monthly: v('K9') };
    lt.account = { have: v('G10'), monthly: v('K10') };
    const goals = [];
    for (let r = 22; r <= 28; r++) {
      const label = norm(cell(g, r, col('C')));
      const amount = num(cell(g, r, col('E')));
      if (!label || !amount) continue; // the template keeps "1" in the months of empty goals
      goals.push({ id: C.uid(), label, months: val(cell(g, r, col('D'))), amount: val(amount), other: val(cell(g, r, col('G'))) });
    }
    if (goals.length) lt.goals = goals;
    const after = [];
    for (let r = 19; r <= 24; r++) {
      const label = norm(cell(g, r, col('J'))), amount = num(cell(g, r, col('K')));
      if (label && amount) after.push({ id: C.uid(), label, amount });
    }
    if (after.length) lt.after = after;
  }

  /* ---------- progress form ---------- */
  const FORM = [
    [/^תאריך:?$/, 'date'], [/^נושא הפגישה/, 'topic'], [/^מטרת הפגישה/, 'purpose'], [/^משימות עד/, 'tasks'],
    [/^האם יישמת/, 'applied'], [/^מה לקח(ת|תי) מ/, 'took'], [/^ממה שעבדת/, 'achieved'], [/^ציין מה השיפור/, 'improvement'],
    [/^משהו שהיית רוצה/, 'ask'], [/^כיום אתה מסיים/, 'goalsReached'], [/^איך השגת/, 'impact'], [/^בהנחה שתמשיך/, 'yearFromNow'],
    [/^תרצה להגיד/, 'words']
  ];
  const BOUNDARY = /^(פגישה מס|למילוי ע|להזכירך|התכנית הכלכלית שלי)/;
  function importForm(plan, g) {
    if (!g) return;
    const goals = norm(cell(g, 2, col('D'))) || norm(cell(g, 1, col('E')));
    if (goals) plan.goalsText = goals;
    let meeting = null;
    const labelAt = r => { const a = norm(cell(g, r, 1)); return FORM.find(([re]) => re.test(a)) || (BOUNDARY.test(a) ? ['b', null] : null); };
    for (let r = 1; r <= Math.min(g.length, 185); r++) {
      const a = norm(cell(g, r, 1));
      const m = a.match(/^פגישה מס'?\s*(\d)/);
      if (m) { meeting = plan.meetings[Number(m[1]) - 1] || null; continue; }
      const hit = labelAt(r);
      if (!meeting || !hit || !hit[1]) continue;
      // the answer: the rest of this row, then the rows under it until the next label
      const parts = [];
      (g[r - 1] || []).slice(1).forEach(x => { const s = norm(x); if (s) parts.push(s); });
      for (let k = r + 1; k <= Math.min(g.length, r + 8) && !labelAt(k); k++) {
        (g[k - 1] || []).forEach(x => { const s = norm(x); if (s && (typeof x === 'string' || hit[1] === 'date')) parts.push(s); });
      }
      const text = hit[1] === 'date' ? day(parts[0]) : parts.join('\n');
      if (text) meeting[hit[1]] = text;
    }
  }

  /* ---------- months: budget (I/N) and actual (J/O) ---------- */
  function importMonth(plan, ymKey, bk, g) {
    const has = r => C.has(r) && r !== '';
    const any = g.some((row, i) => i >= 3 && i <= 62 && (num(row[col('J') - 1]) || num(row[col('O') - 1])));
    if (!any) return false;
    if (bk === 'business' && !plan.hasBusiness) return false;
    const m = C.ensureMonth(plan, ymKey);
    const mb = m[bk] || (m[bk] = C.rebudget(plan, ymKey, bk));
    let group = 'save';
    for (let r = 4; r <= 62; r++) {
      const head = norm(cell(g, r, col('G')));
      if (head.startsWith('חסכונות')) group = 'save';
      else if (head.startsWith('חודשיות קבועות')) group = 'fixed';
      else if (head.startsWith('חודשיות משתנות') || head.startsWith('הוצאות')) group = 'var';
      const raw = norm(cell(g, r, col('H')));
      if (!raw || SKIP.includes(raw)) continue;
      const b = cell(g, r, col('I')), a = cell(g, r, col('J'));
      if (!num(b) && !num(a)) continue;
      const label = raw.replace(/ - חשבון (עסק|בית)$/, '');
      let row = mb.rows.find(x => key(x.label) === key(ALIAS[label] || label)) ||
        mb.rows.find(x => key(x.label).startsWith(key(label) + '(')) ||
        (raw.endsWith('חשבון בית') || raw.endsWith('חשבון עסק') ? mb.rows.find(x => x.label.startsWith(label + ' (')) : null);
      if (!row) { row = { id: C.uid(), label: raw, group, extra: true, b: 0, a: '' }; mb.rows.push(row); }
      row.b = num(b);
      row.a = has(a) && num(a) ? num(a) : '';
    }
    for (let r = 7; r <= 17; r++) {
      const label = norm(cell(g, r, col('L')));
      if (!label) continue;
      const b = cell(g, r, col('N')), a = cell(g, r, col('O'));
      if (!num(b) && !num(a)) continue;
      let row = mb.inc.find(x => key(x.label) === key(ALIAS[label] || label));
      if (!row) { row = { id: C.uid(), label, b: 0, a: '' }; mb.inc.push(row); }
      row.b = num(b);
      row.a = num(a) ? num(a) : '';
    }
    return true;
  }

  /* ---------- everything ---------- */
  function importOld(raw, opts) {
    opts = opts || {};
    const S = raw.sheets || {};
    const year = (String(raw.title || '').match(/20\d\d/) || [String(new Date().getFullYear())])[0];
    const plan = C.newPlan({ name: opts.name || '', start: year + '-01' });
    const L = { start: plan.start };
    // installments: "payment number this month" is read as of today's month in that year
    const nowKey = C.ym();
    L.start = nowKey.slice(0, 4) === year ? nowKey : year + '-01';
    plan.hasBusiness = !!S[SHEET.business] && importBook(plan, 'business', S[SHEET.business], L);
    importBook(plan, 'home', S[SHEET.home], L);
    importLoansSheet(plan, S[SHEET.loans], L.start);
    importLongTerm(plan, S[SHEET.lt]);
    importForm(plan, S[SHEET.form]);
    const done = [];
    C.MONTHS.forEach((name, i) => {
      const k = year + '-' + String(i + 1).padStart(2, '0');
      const h = S[name] && importMonth(plan, k, 'home', S[name]);
      const b = S[name + ' עסק'] && importMonth(plan, k, 'business', S[name + ' עסק']);
      if (h || b) done.push(k);
    });
    if (done.length) plan.start = done[0];
    return { plan, months: done.length, business: plan.hasBusiness };
  }

  const api = { importOld };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlanImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
