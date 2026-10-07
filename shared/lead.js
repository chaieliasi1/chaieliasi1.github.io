/* טופס ליד אחיד לכל הכלים. דורש את shared/api.js לפניו.
 *
 * הדרך הקלה, טופס מוכן:
 *   <hai-lead tool="cashflow" tool-title="מחשבון תזרים"></hai-lead>
 *   אפשר גם: heading, sub, button (טקסטים), ו-el.getData = () => ({ 'תווית': 'ערך' })
 *   כדי לצרף לליד את המספרים מהכלי. בסיום נשלח אירוע 'hai-lead-sent'.
 *
 * כלי עם טופס משלו: HaiLead.send({ tool, toolTitle, name, phone, pain, data })
 */
(function () {
  const ROOT = new URL('..', Api.BASE).href; // the hub root, for privacy.html
  // ?src=ig on a tool link marks the lead as coming from Instagram
  const src = new URLSearchParams(location.search).get('src') || '';

  function send(o) {
    return Api.call('lead', {
      tool: o.tool, toolTitle: o.toolTitle || '', name: o.name, phone: o.phone,
      pain: o.pain || '', data: o.data || {}, src: src, hp: o.hp || ''
    });
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class HaiLead extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready = true;
      const a = n => esc(this.getAttribute(n) || '');
      const uid = 'hl' + Math.random().toString(36).slice(2, 8);
      this.innerHTML =
        '<form class="card lead-form" novalidate><div class="row">' +
          '<h3>' + (a('heading') || 'השאירו פרטים ואני חוזר אליכם') + '</h3>' +
          '<p class="sub">' + (a('sub') || 'שיחת היכרות קצרה, בלי התחייבות.') + '</p>' +
          '<div class="fld"><label for="' + uid + 'n">שם <i>(חובה)</i></label>' +
            '<input class="field" id="' + uid + 'n" name="name" autocomplete="name" required></div>' +
          '<div class="fld"><label for="' + uid + 'p">טלפון <i>(חובה)</i></label>' +
            '<input class="field" id="' + uid + 'p" name="phone" type="tel" inputmode="tel" autocomplete="tel" required></div>' +
          '<div class="fld"><label for="' + uid + 'x">מה הכי מעיק לכם עכשיו בכסף?</label>' +
            '<textarea class="field" id="' + uid + 'x" name="pain"></textarea></div>' +
          '<input class="hp" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<p class="consent">בשליחת הטופס אתם מסכימים ל<a href="' + ROOT + 'privacy.html">מדיניות הפרטיות</a>. הפרטים משמשים רק כדי לחזור אליכם.</p>' +
          '<button class="go" type="submit">' + (a('button') || 'שלחו לי את הפרטים') + '</button>' +
          '<p class="err" role="alert"></p>' +
        '</div></form>' +
        '<div class="card lead-done" tabindex="-1" hidden><div class="row">' +
          '<h3>קיבלתי את הפרטים</h3><p>אני חוזר אליכם בימים הקרובים לתיאום שיחת היכרות.</p>' +
        '</div></div>';

      const form = this.querySelector('form');
      const err = this.querySelector('.err');
      const btn = form.querySelector('button');
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const el = form.elements;
        const name = el.name.value.trim();
        const phone = el.phone.value.trim();
        el.name.removeAttribute('aria-invalid');
        el.phone.removeAttribute('aria-invalid');
        err.textContent = '';
        if (name.length < 2) { el.name.setAttribute('aria-invalid', 'true'); err.textContent = 'צריך למלא שם.'; el.name.focus(); return; }
        if (phone.replace(/\D/g, '').length < 9) { el.phone.setAttribute('aria-invalid', 'true'); err.textContent = 'צריך מספר טלפון תקין, כולל קידומת.'; el.phone.focus(); return; }

        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'שולח...';
        try {
          await send({
            tool: this.getAttribute('tool'), toolTitle: this.getAttribute('tool-title') || document.title,
            name, phone, pain: el.pain.value.trim(), hp: el.hp.value,
            data: typeof this.getData === 'function' ? this.getData() : {}
          });
          form.hidden = true;
          const done = this.querySelector('.lead-done');
          done.hidden = false;
          done.focus({ preventScroll: true });
          done.scrollIntoView({ behavior: 'smooth', block: 'center' });
          this.dispatchEvent(new CustomEvent('hai-lead-sent', { bubbles: true }));
        } catch (x) {
          btn.disabled = false;
          btn.textContent = label;
          err.textContent = Api.errText(x.code) + ' אפשר גם לכתוב לי באינסטגרם.';
        }
      });
    }
  }
  customElements.define('hai-lead', HaiLead);

  window.HaiLead = { send };
})();
