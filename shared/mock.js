// מצב הדגמה: מחקה את Crm.gs בדפדפן, עם נתונים לדוגמה. שום דבר לא נשלח לגוגל.
// הסיסמה בהדגמה: 1234. איפוס: localStorage.removeItem('hub-mock')
(function () {
  const KEY = 'hub-mock';
  const DAY = 86400000;
  const MEETINGS = 4;
  let db = null;

  function fail(code) { const e = new Error(code); e.code = code; throw e; }
  const id = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => b.toString(16).padStart(2, '0')).join('');
  const iso = t => new Date(t).toISOString();
  const addMonths = (t, n) => { const d = new Date(t); d.setMonth(d.getMonth() + n); return d.toISOString(); };
  const digits = p => { const d = String(p || '').replace(/\D/g, ''); return d.indexOf('972') === 0 ? '0' + d.slice(3) : d; };

  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* memory only */ } }
  function load() {
    if (db) return db;
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db) { db = seed(); save(); }
    return db;
  }

  function person(o) {
    const now = Date.now();
    return Object.assign({
      id: id(), name: '', phone: '', email: '', gender: '', stage: 'new', source: 'tool', tool: '', referredBy: '',
      amount: 0, paid: 0, meetingsDone: 0, nextMeetingAt: '', nextMeetingKind: '', created: iso(now), updated: iso(now), contactedAt: '',
      endedAt: '', followupAt: '', deleteAfter: addMonths(now, 24), lostReason: '', pain: '', onboardingToken: '',
      contractUrl: '', questionnaireUrl: ''
    }, o);
  }

  function seed() {
    const now = Date.now();
    const at = (days, h) => { const d = new Date(now + days * DAY); d.setHours(h || 19, 0, 0, 0); return d.toISOString(); };
    const people = [
      person({ name: 'נועה ואיתי כהן', phone: '052-1234567', tool: 'cashflow', source: 'instagram', created: iso(now - 3 * DAY), pain: 'כל חודש נגמר במינוס ואנחנו לא מבינים לאן הולך הכסף' }),
      person({ name: 'שירה לוי', phone: '054-7654321', tool: 'cashflow', created: iso(now - 5 * 3600000), pain: 'רוצה להתחיל לחסוך לדירה' }),
      person({ name: 'דניאל ומיכל אברהם', phone: '050-1112233', stage: 'intro', source: 'referral', referredBy: 'יעל ורון מזרחי', created: iso(now - 6 * DAY), contactedAt: iso(now - 5 * DAY), nextMeetingAt: at(1, 20), nextMeetingKind: 'intro' }),
      person({ name: 'אורי ותמר פרץ', phone: '053-4445566', stage: 'sent', source: 'instagram', amount: 2400, gender: 'c', created: iso(now - 10 * DAY), onboardingToken: 'a'.repeat(64) }),
      person({ name: 'יעל ורון מזרחי', phone: '058-9998877', email: 'yael@example.com', stage: 'active', source: 'tool', tool: 'cashflow', amount: 2400, paid: 1200, meetingsDone: 2, created: iso(now - 70 * DAY), nextMeetingAt: at(2, 19), nextMeetingKind: 'process', contractUrl: '#demo', questionnaireUrl: '#demo' }),
      person({ name: 'משפחת ביטון', phone: '052-3332211', stage: 'ended', source: 'referral', referredBy: 'יעל ורון מזרחי', amount: 2200, paid: 2200, meetingsDone: 4, created: iso(now - 220 * DAY), endedAt: iso(now - 95 * DAY), followupAt: iso(now - 3 * DAY), deleteAfter: addMonths(now - 95 * DAY, 6), contractUrl: '#demo', questionnaireUrl: '#demo' }),
      person({ name: 'גיל סויסה', phone: '054-1010101', stage: 'lost', lostReason: 'לא מתאים כרגע', tool: 'cashflow', created: iso(now - 40 * DAY) })
    ];
    const events = [];
    const ev = (p, kind, text, data, when) => events.push({ personId: p.id, at: when || p.created, kind, text, data: data || null });
    ev(people[0], 'lead', 'השאיר פרטים במחשבון תזרים: ' + people[0].pain, { tool: 'cashflow', toolTitle: 'מחשבון תזרים', src: 'instagram', values: { 'הכנסות': '18,500 ₪', 'הוצאות קבועות': '9,200 ₪', 'הלוואות ומשכנתא': '5,100 ₪', 'הוצאות משתנות': '6,000 ₪', 'פער חודשי': '-1,800 ₪', 'מצב': 'תזרים שלילי' } });
    ev(people[1], 'lead', 'השאירה פרטים במחשבון תזרים: ' + people[1].pain, { tool: 'cashflow', toolTitle: 'מחשבון תזרים', src: 'tool', values: { 'פער חודשי': '2,300 ₪', 'מצב': 'תזרים חיובי' } });
    ev(people[2], 'note', 'פנו בעקבות המלצה של יעל ורון. רוצים לסדר את החובות לפני לידה.');
    ev(people[2], 'meeting', 'נקבעה שיחת היכרות');
    ev(people[3], 'onboarding', 'נוצר קישור לחוזה ולשאלון, על סך 2,400 ₪');
    ev(people[4], 'payment', '', { amount: 1200, method: 'bit' }, iso(now - 62 * DAY));
    ev(people[4], 'meeting', 'התקיימה פגישה 2 מתוך 4\nבנינו תקציב חודשי. משימה: לבטל שני מנויים.', null, iso(now - 20 * DAY));
    ev(people[5], 'payment', '', { amount: 2200, method: 'transfer' }, iso(now - 200 * DAY));
    ev(people[5], 'stage', 'סיים', null, people[5].endedAt);
    return { people, events, agenda: [
      { title: 'שיחת היכרות: דניאל ומיכל אברהם', start: at(1, 20), end: at(1, 21) },
      { title: 'פגישה 3 מתוך 4: יעל ורון מזרחי', start: at(2, 19), end: at(2, 20) }
    ] };
  }

  const summary = p => {
    const s = Object.assign({}, p);
    delete s.email; delete s.gender; delete s.pain; delete s.lostReason; delete s.contractUrl; delete s.questionnaireUrl; delete s.onboardingToken;
    return s;
  };
  const find = pid => load().people.find(p => p.id === pid) || fail('not_found');
  const event = (pid, kind, text, data) => load().events.push({ personId: pid, at: iso(Date.now()), kind, text: text || '', data: data || null });
  function get(pid) {
    const p = find(pid);
    return {
      person: Object.assign({}, p, { onboardingUrl: p.onboardingToken && p.stage === 'sent' ? 'https://chaieliasi1.github.io/onboarding/c.html?t=' + p.onboardingToken : '' }),
      events: load().events.filter(e => e.personId === pid).slice().reverse()
    };
  }
  function stage(p, s) {
    p.stage = s;
    if (s === 'contact' && !p.contactedAt) p.contactedAt = iso(Date.now());
    if (s === 'ended') { p.endedAt = iso(Date.now()); p.followupAt = addMonths(Date.now(), 3); p.deleteAfter = addMonths(Date.now(), 6); }
    if (s === 'lost') p.followupAt = '';
  }
  const LABEL = { new: 'ליד חדש', contact: 'בקשר', intro: 'שיחת היכרות', sent: 'נשלח חוזה', signed: 'חתם', active: 'בליווי', ended: 'סיים', lost: 'לא רלוונטי' };
  const fmt = t => new Date(t).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

  function handle(req) {
    const d = load();
    const done = r => { save(); return r; };
    if (req.action === 'lead') {
      if (req.hp) return {};
      const name = String(req.name || '').trim();
      if (name.length < 2 || digits(req.phone).length < 9 || !/^[a-z0-9-]{1,40}$/.test(req.tool || '')) fail('invalid');
      const src = { ig: 'instagram', instagram: 'instagram', wa: 'whatsapp', ref: 'referral' }[String(req.src || '').toLowerCase()] || 'tool';
      let p = d.people.find(x => digits(x.phone) === digits(req.phone));
      if (p) { if (p.stage === 'lost') p.stage = 'new'; p.updated = iso(Date.now()); }
      else { p = person({ name, phone: req.phone, tool: req.tool, source: src, pain: req.pain || '' }); d.people.push(p); }
      event(p.id, 'lead', 'השאיר פרטים ב' + (req.toolTitle || req.tool) + (req.pain ? ': ' + req.pain : ''), { tool: req.tool, toolTitle: req.toolTitle, src, values: req.data || {} });
      console.log('[demo] lead mail to Hai', req);
      return done({});
    }
    if (req.password !== '1234') fail('auth');
    const p = req.id ? find(req.id) : null;
    switch (req.action) {
      case 'crm_list':
        return {
          people: d.people.map(summary),
          payments: d.events.filter(e => e.kind === 'payment').map(e => ({ personId: e.personId, at: e.at, amount: e.data.amount })),
          agenda: d.agenda.filter(a => new Date(a.end) > Date.now() - DAY)
        };
      case 'crm_get': return get(p.id);
      case 'crm_create': {
        const name = String(req.name || '').trim();
        if (name.length < 2) fail('invalid');
        if (req.phone && d.people.some(x => digits(x.phone) === digits(req.phone))) fail('exists');
        const n = person({ name, phone: req.phone || '', source: req.source || 'other', referredBy: req.referredBy || '' });
        d.people.push(n);
        event(n.id, 'note', 'נוסף ידנית');
        return done({ id: n.id });
      }
      case 'crm_update': {
        const x = req.patch || {};
        ['name', 'phone', 'email', 'gender', 'source', 'referredBy', 'lostReason'].forEach(k => { if (k in x) p[k] = String(x[k]).trim(); });
        if ('amount' in x) p.amount = Math.round(Number(x.amount)) || 0;
        if (x.stage && x.stage !== p.stage) { stage(p, x.stage); event(p.id, 'stage', LABEL[x.stage] + (x.stage === 'lost' && p.lostReason ? ': ' + p.lostReason : '')); }
        p.updated = iso(Date.now());
        return done(get(p.id));
      }
      case 'crm_note':
        if (!String(req.text || '').trim()) fail('invalid');
        event(p.id, 'note', req.text.trim());
        if (p.stage === 'new') stage(p, 'contact');
        return done(get(p.id));
      case 'crm_payment': {
        const a = Math.round(Number(req.amount));
        if (!a) fail('invalid');
        p.paid += a;
        event(p.id, 'payment', req.note || '', { amount: a, method: req.method || 'other' });
        return done(get(p.id));
      }
      case 'crm_meeting': {
        const start = new Date(req.at);
        if (isNaN(start)) fail('invalid');
        const kind = p.nextMeetingAt && p.nextMeetingKind ? p.nextMeetingKind : ['sent', 'signed', 'active'].includes(p.stage) ? 'process' : 'intro';
        p.nextMeetingKind = kind;
        const title = (kind === 'process' ? 'פגישה ' + (p.meetingsDone + 1) + ' מתוך ' + MEETINGS : 'שיחת היכרות') + ': ' + p.name;
        d.agenda = d.agenda.filter(a => !a.title.endsWith(': ' + p.name));
        d.agenda.push({ title, start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString() });
        d.agenda.sort((a, b) => a.start.localeCompare(b.start));
        p.nextMeetingAt = start.toISOString();
        if (['new', 'contact'].includes(p.stage)) stage(p, 'intro');
        event(p.id, 'meeting', 'נקבעה ' + title.split(':')[0] + ' ל-' + fmt(start));
        console.log('[demo] calendar event', title);
        return done(get(p.id));
      }
      case 'crm_meeting_done': {
        let label = 'התקיימה שיחת היכרות';
        const kind = p.nextMeetingKind || (['sent', 'signed', 'active'].includes(p.stage) ? 'process' : 'intro');
        p.nextMeetingKind = '';
        if (kind === 'process' && ['sent', 'signed', 'active'].includes(p.stage)) {
          p.meetingsDone += 1;
          label = 'התקיימה פגישה ' + p.meetingsDone + ' מתוך ' + MEETINGS;
          stage(p, p.meetingsDone >= MEETINGS ? 'ended' : 'active');
        }
        d.agenda = d.agenda.filter(a => !a.title.endsWith(': ' + p.name));
        p.nextMeetingAt = '';
        event(p.id, 'meeting', label + (req.summary ? '\n' + req.summary : ''));
        if (p.stage === 'ended' && p.meetingsDone >= MEETINGS) event(p.id, 'stage', LABEL.ended);
        return done(get(p.id));
      }
      case 'crm_followup_done': {
        const ended = new Date(p.endedAt || Date.now()).getTime();
        const first = p.followupAt && new Date(p.followupAt) < new Date(addMonths(ended, 4));
        p.followupAt = first ? addMonths(ended, 6) : '';
        event(p.id, 'note', 'מעקב ' + (first ? '3' : '6') + ' חודשים אחרי סיום' + (req.summary ? '\n' + req.summary : ''));
        return done(get(p.id));
      }
      case 'crm_onboard': {
        const a = Math.round(Number(req.amount));
        if (!(a > 0) || !['c', 'm', 'f'].includes(req.gender)) fail('invalid');
        p.onboardingToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
        p.amount = a; p.gender = req.gender;
        stage(p, 'sent');
        event(p.id, 'onboarding', 'נוצר קישור לחוזה ולשאלון, על סך ' + a.toLocaleString('he-IL') + ' ₪');
        const g = get(p.id);
        return done(Object.assign({ url: g.person.onboardingUrl }, g));
      }
      case 'crm_delete':
        if (req.confirm !== true) fail('invalid');
        d.people = d.people.filter(x => x.id !== p.id);
        d.events = d.events.filter(e => e.personId !== p.id);
        return done({});
    }
    fail('invalid');
  }

  window.HaiMock = { handle };
})();
