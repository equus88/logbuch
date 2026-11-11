// Utilidades compartidas: fechas, formato, HTML seguro, hoja modal y avisos.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const nowISO = () => new Date().toISOString();

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
// Semana de lunes a domingo
export const weekStart = (s = today()) => { const d = parseYmd(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return ymd(d); };
export const weekDays = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
export const monthKey = (s) => s.slice(0, 7);
export const addMonths = (key, n) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const dayShort = (s) => DIAS[parseYmd(s).getDay()];
export const fmtDate = (s) => { if (!s) return '—'; const d = parseYmd(s); return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
export const fmtLong = (s) => { const d = parseYmd(s); return `${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
export const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return `${MESES[m - 1]} ${y}`; };
export const relDays = (s) => {
  if (!s) return 'sin registros';
  const n = daysBetween(s, today());
  return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`;
};

const NF = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
export const money = (n) => { n = Math.round(+n || 0); return (n < 0 ? '−' : '') + '$' + NF.format(Math.abs(n)); };
export const num = (n, d = 1) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: d }).format(+n || 0);
export const parseMoney = (s) => { s = String(s ?? '').trim(); const neg = /^[-−]/.test(s); const n = Number(s.replace(/[^\d]/g, '')) || 0; return neg ? -n : n; };
export const parseNum = (s) => { const n = parseFloat(String(s ?? '').replace(',', '.')); return isFinite(n) ? n : null; };
export const mins = (m) => { m = Math.round(+m || 0); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; };
export const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(1, a / b)) : 0);

// ---------- Piezas de formulario ----------
export function chips(name, options, value, { required = false } = {}) {
  return `<div class="chips" role="radiogroup">${options.map(([v, label]) => `
    <label class="chip"><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(value) ? 'checked' : ''} ${required ? 'required' : ''}><span>${esc(label)}</span></label>`).join('')}</div>`;
}
export function field(label, inner, hint = '') {
  return `<label class="f"><span class="f-l">${esc(label)}</span>${inner}${hint ? `<small class="f-h">${esc(hint)}</small>` : ''}</label>`;
}
export function group(label, inner) {
  return `<fieldset class="f"><legend class="f-l">${esc(label)}</legend>${inner}</fieldset>`;
}
export const bar = (p, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.round(p * 100)}%"></i></div>`;

// ---------- Hoja modal ----------
// Abre un formulario en una hoja inferior. Resuelve con FormData al guardar,
// con 'delete' si se pulsa eliminar, o null si se cierra.
export function sheet({ title, body, submit = 'Guardar', danger = null, onOpen = null }) {
  const dlg = document.getElementById('sheet');
  dlg.innerHTML = `<form method="dialog" novalidate>
    <header class="sheet-h"><h2>${esc(title)}</h2><button type="button" class="btn-text" data-close>Cerrar</button></header>
    <div class="sheet-b">${body}</div>
    <footer class="sheet-f">${danger ? `<button type="button" class="btn danger" data-delete>${esc(danger)}</button>` : ''}<span class="grow"></span><button type="submit" class="btn pri">${esc(submit)}</button></footer>
  </form>`;
  return new Promise((resolve) => {
    const form = dlg.querySelector('form');
    let done = false;
    const finish = (v) => { if (done) return; done = true; dlg.close(); resolve(v); };
    dlg.querySelector('[data-close]').onclick = () => finish(null);
    const delBtn = dlg.querySelector('[data-delete]');
    if (delBtn) delBtn.onclick = () => { if (confirm('¿Eliminar este registro? No se puede deshacer.')) finish('delete'); };
    // Botones con data-resolve="valor" cierran la hoja devolviendo ese valor
    dlg.querySelectorAll('[data-resolve]').forEach((b) => { b.onclick = () => finish(b.dataset.resolve); });
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      finish(new FormData(form));
    };
    dlg.onclose = () => finish(null);
    dlg.showModal();
    if (onOpen) onOpen(dlg);
  });
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// Comparte un archivo (hoja de compartir de iOS) o lo descarga.
export async function deliverFile(name, text, type = 'application/json') {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
