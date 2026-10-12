# האתר והמערכת של חי אליאסי

`https://chaieliasi1.github.io/`

| נתיב | מה זה |
|---|---|
| `admin/` | מערכת הניהול: היום, לקוחות, כלים, מספרים. סיסמה. נשמר בגוגל דרך Apps Script (`../onboarding/apps-script/Crm.gs`). |
| `plan/` | מערכת התוכניות הכלכליות (במקום קובץ האקסל). מערכת נפרדת עם בקאנד משלה (`../plan-backend/`, הכתובת ב-`plan/api.js`). לקוח: `?t=<קישור>` + קוד. חי: `?admin` עם סיסמה משלה. ממערכת הניהול רק קישור מכרטיס הלקוח. הדגמה: `/plan/?mock&admin` (סיסמה 1234). |
| `tools/<slug>/` | כל כלי (מחשבון, מדריך). נכנס לקטלוג לבד לפי תגיות `tool:*` בראש הקובץ. |
| `index.html` | הספרייה הציבורית. כרגע `noindex` ולא מקושרת. |
| `shared/` | עיצוב, לוגו, חיבור לגוגל (`api.js`), טופס ליד (`lead.js`), מצב הדגמה (`mock.js`). |
| `scripts/build-catalog.mjs` | בונה `catalog.json` מתיקיית `tools/`. רץ ב-GitHub Action בכל push. |
| `scripts/serve.mjs` | שרת מקומי לבדיקות: `node scripts/serve.mjs` ואז `/admin/?mock` (סיסמה 1234). |

כלי חדש: לבקש מקלוד. הסקיל `new-tool` (`finance/.claude/skills/new-tool`) בונה, בודק ומפרסם.

מערכת הקליטה (חוזה + שאלון) נשארת בריפו `onboarding` ובכתובת `/onboarding/`.
