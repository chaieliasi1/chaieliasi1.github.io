// מערכת התוכניות מדברת עם פרויקט Apps Script משלה (finance/plan-backend), לא עם מערכת הניהול.
// כתובת ה-Web app אחרי הפריסה (plan-backend/SETUP.md, שלב 4). ריק = מצב הדגמה.
window.PLAN_API = 'https://script.google.com/macros/s/AKfycbwzSeadKsujIYpQz3TpdnUYhMBlE374xLdqOdpn-Y0zeO9Ccu7hbRg_NBBGv-fWAPn1/exec';

(function () {
  const API = window.PLAN_API;
  const MOCK = !API || new URLSearchParams(location.search).has('mock');
  const BASE = new URL('.', document.currentScript.src).href; // .../plan/

  const ERR = {
    auth: 'סיסמה שגויה.',
    locked: 'יותר מדי ניסיונות. אפשר לנסות שוב בעוד רבע שעה.',
    no_password: 'לא הוגדרה סיסמה למערכת התוכניות.',
    invalid: 'חלק מהפרטים חסרים או לא תקינים.',
    not_found: 'התוכנית לא נמצאה. אולי נמחקה.',
    pin: 'הקוד לא נכון.',
    bad_link: 'הקישור לא תקין. אפשר לבקש מחי קישור חדש.',
    conflict: 'התוכנית עודכנה ממכשיר אחר בזמן הזה.',
    demo: 'במצב הדגמה אין ייבוא מגוגל.',
    network: 'בעיית תקשורת. בדקו את החיבור ונסו שוב.'
  };

  function fail(code) {
    const e = new Error(code);
    e.code = code;
    throw e;
  }

  let mock = null;
  function loadMock() {
    if (!mock) {
      mock = new Promise((ok, no) => {
        const s = document.createElement('script');
        s.src = BASE + 'mock.js';
        s.onload = () => ok(window.PlanMock);
        s.onerror = no;
        document.head.appendChild(s);
      });
    }
    return mock;
  }

  async function call(action, data) {
    const req = Object.assign({ action }, data);
    if (MOCK) {
      const m = await loadMock();
      await new Promise(r => setTimeout(r, 250));
      try { return JSON.parse(JSON.stringify(m.handle(req))); } catch (e) { fail(e.code || 'invalid'); }
    }
    let res;
    try {
      // text/plain keeps this a "simple" request, so Apps Script needs no CORS preflight
      const r = await fetch(API, { method: 'POST', body: JSON.stringify(req) });
      res = await r.json();
    } catch (e) {
      fail('network');
    }
    if (!res.ok) fail(res.error);
    return res;
  }

  window.Api = { call, MOCK, errText: c => ERR[c] || ERR.network };
})();
