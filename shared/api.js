// כתובת ה-Web app של Apps Script (אותה כתובת כמו ב-onboarding/api.js). ריק = מצב הדגמה.
window.HAI_API = 'https://script.google.com/macros/s/AKfycbylfirMmGbkhhPEhMBzkRdIOkWL8JPYSbm08Oij52B1HxBA0hFlm0Zry5kUpHQ-dVTlCA/exec';

(function () {
  const API = window.HAI_API;
  const MOCK = !API || new URLSearchParams(location.search).has('mock');
  const BASE = new URL('.', document.currentScript.src).href; // .../shared/

  const ERR = {
    auth: 'סיסמה שגויה.',
    locked: 'יותר מדי ניסיונות. אפשר לנסות שוב בעוד רבע שעה.',
    no_password: 'לא הוגדרה סיסמת ניהול.',
    invalid: 'חלק מהפרטים חסרים או לא תקינים.',
    exists: 'כבר יש כרטיס עם הטלפון הזה.',
    not_found: 'הכרטיס לא נמצא. אולי נמחק.',
    busy: 'יש עומס רגעי. נסו שוב בעוד כמה דקות.',
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
        s.onload = () => ok(window.HaiMock);
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
      await new Promise(r => setTimeout(r, 350));
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

  window.Api = { call, MOCK, BASE, errText: c => ERR[c] || ERR.network };
})();
