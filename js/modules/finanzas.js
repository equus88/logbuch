// Módulo Finanzas: libro de caja adaptado del Kassenbuch.
// Mantiene el mismo formato de movimientos, fondos y deudas, así una copia
// exportada del Kassenbuch se importa sin transformaciones.
import { all, put, del, getMeta, setMeta } from '../db.js';
import { esc, uid, nowISO, today, fmtDate, money, num, parseMoney, parseNum, chips, field, group, sheet, toast, monthKey, addMonths, monthLabel, bar } from '../util.js';

const STORE = 'finanzas';
export const CATS = {
  ingreso: [['freelance', 'Freelance'], ['salario', 'Salario'], ['prima', 'Prima, cesantías o bonos'], ['otros_ing', 'Otros ingresos']],
  gasto: [
    ['ss', 'Seguridad social (PILA)'], ['manejo', 'Cuota de manejo'], ['impuestos', 'Impuestos y trámites'],
    ['energia', 'Energía'], ['internet', 'Internet'], ['aseo', 'Aseo y otros servicios'], ['casa', 'Aporte a la casa o arriendo'],
    ['mercado', 'Mercado y proteína'], ['fuera', 'Comidas fuera y domicilios'], ['transporte', 'Transporte'], ['celular', 'Celular'],
    ['salud', 'Salud y medicamentos'], ['cuidado', 'Cuidado personal'], ['carrera', 'Carrera y certificaciones'], ['idiomas', 'Idiomas'],
    ['entreno', 'Equipo de entrenamiento'], ['ocio', 'Ocio y suscripciones'], ['ropa', 'Ropa'], ['imprevistos', 'Imprevistos'], ['otros', 'Otros gastos'],
  ],
};
const TIPOS = [['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['deuda', 'Pago de deuda'], ['aporte', 'Aporte a fondo'], ['retiro', 'Retiro de fondo']];
const catName = (id) => [...CATS.ingreso, ...CATS.gasto].find((c) => c[0] === id)?.[1] || id || '—';

export function defaultConfig() {
  return {
    v: 1,
    param: { trm: 0, eur: 0 },
    disponible: 0,
    fondos: [
      { id: 'emergencia', n: 'Fondo de emergencia', saldo: 0, minimo: 1500000, meta: 10000000 },
      { id: 'mudanza', n: 'Fondo de mudanza', saldo: 0, meta: 6500000 },
      { id: 'alemania', n: 'Fondo de traslado a Alemania', saldo: 0, metaEUR: 9000 },
    ],
    deudas: [],
    mudado: false,
    base: { tarjeta: 0 },
  };
}
export function normalize(c) {
  const d = defaultConfig();
  if (!c || typeof c !== 'object') return d;
  for (const k of Object.keys(d)) if (c[k] == null) c[k] = d[k];
  c.param = { ...d.param, ...c.param };
  c.base = { ...d.base, ...c.base };
  for (const f of d.fondos) if (!c.fondos.some((x) => x.id === f.id)) c.fondos.push(f);
  return c;
}
export async function getConfig() { return normalize(await getMeta('finanzas.cfg', null)); }
export async function saveConfig(c) { await setMeta('finanzas.cfg', c); }

const fx = (c, d) => (d.moneda === 'USD' ? +c.param.trm || 0 : 1);
const mRate = (ea) => Math.pow(1 + (+ea || 0) / 100, 1 / 12) - 1;
const cardDebt = (c) => c.deudas.find((d) => d.tipo === 'rotativo' && d.moneda !== 'USD') || null;
const fondo = (c, id) => c.fondos.find((f) => f.id === id) || { saldo: 0, meta: 0, minimo: 0, metaEUR: 0 };

// Efecto de un movimiento sobre disponible, deudas y fondos (misma lógica del Kassenbuch)
export function computeEffects(c, m) {
  const e = { disp: 0, deuda: null, fondo: null, interes: 0 };
  const v = +m.monto || 0;
  if (m.tipo === 'ingreso' || m.tipo === 'ajuste') e.disp = v;
  else if (m.tipo === 'gasto') {
    const cd = m.medio === 'tarjeta' ? cardDebt(c) : null;
    if (cd) e.deuda = { id: cd.id, delta: v }; else e.disp = -v;
  } else if (m.tipo === 'deuda') {
    e.disp = -v;
    const d = c.deudas.find((x) => x.id === m.deudaId);
    if (d) {
      const r = fx(c, d);
      let cap = v, int = 0;
      if (d.tipo === 'cuota') { int = Math.round(Math.max(0, (+d.saldo || 0) * r) * mRate(d.tasaEA)); cap = Math.max(0, v - int); }
      e.interes = int;
      e.deuda = { id: d.id, delta: -(r > 0 ? cap / r : cap) };
    }
  } else if (m.tipo === 'aporte') { e.disp = -v; e.fondo = { id: m.fondoId, delta: v }; }
  else if (m.tipo === 'retiro') { e.disp = v; e.fondo = { id: m.fondoId, delta: -v }; }
  return e;
}
export function applyEffects(c, e, sign) {
  if (!e) return;
  c.disponible = Math.round((+c.disponible || 0) + sign * (e.disp || 0));
  if (e.deuda) { const d = c.deudas.find((x) => x.id === e.deuda.id); if (d) d.saldo = Math.round(((+d.saldo || 0) + sign * e.deuda.delta) * 100) / 100; }
  if (e.fondo) { const f = c.fondos.find((x) => x.id === e.fondo.id); if (f) f.saldo = Math.round((+f.saldo || 0) + sign * e.fondo.delta); }
}

export function statsOf(movs) {
  const s = { ing: 0, gas: 0, deuda: 0, interes: 0, aporte: 0, retiro: 0, horas: 0, byCat: {} };
  for (const m of movs) {
    const v = +m.monto || 0;
    if (m.tipo === 'ingreso') { s.ing += v; s.byCat[m.cat] = (s.byCat[m.cat] || 0) + v; if (m.cat === 'freelance') s.horas += +m.horas || 0; }
    else if (m.tipo === 'gasto') { s.gas += v; s.byCat[m.cat] = (s.byCat[m.cat] || 0) + v; }
    else if (m.tipo === 'deuda') { s.deuda += v; s.interes += m.ef?.interes || 0; }
    else if (m.tipo === 'aporte') s.aporte += v;
    else if (m.tipo === 'retiro') s.retiro += v;
  }
  s.excedente = s.ing - s.gas - s.interes;
  return s;
}

// Escalera de prioridades financieras del documento maestro
export function ladder(c) {
  const E = fondo(c, 'emergencia'), M = fondo(c, 'mudanza'), A = fondo(c, 'alemania');
  const tarj = c.deudas.filter((d) => d.tipo === 'rotativo').reduce((a, d) => a + Math.max(0, +d.saldo || 0) * fx(c, d), 0);
  const base = Math.max(+c.base.tarjeta || 0, tarj);
  const Ameta = (+A.metaEUR || 0) * (+c.param.eur || 0);
  const mk = (k, n, v, meta) => { const p = meta > 0 ? Math.max(0, Math.min(1, v / meta)) : 1; return { k, n, v, meta, p, falta: Math.max(0, meta - v), done: p >= 0.9999 }; };
  const steps = [
    mk(1, 'Colchón mínimo', +E.saldo || 0, +E.minimo || 0),
    { k: 2, n: 'Tarjeta en cero', p: base > 0 ? (base - tarj) / base : 1, falta: tarj, done: tarj < 1 },
    mk(3, 'Fondo de emergencia', +E.saldo || 0, +E.meta || 0),
    mk(4, 'Mudanza', +M.saldo || 0, +M.meta || 0),
    mk(5, 'Alemania', +A.saldo || 0, Ameta),
  ];
  if (c.mudado) Object.assign(steps[3], { p: 1, done: true, falta: 0 });
  if (!Ameta) Object.assign(steps[4], { p: 0, done: false });
  return { steps, cur: steps.find((s) => !s.done) || null, tarj };
}

export const balance = (c) => {
  const fondos = c.fondos.reduce((a, f) => a + (+f.saldo || 0), 0);
  const deudas = c.deudas.reduce((a, d) => a + (+d.saldo || 0) * fx(c, d), 0);
  return { disp: +c.disponible || 0, fondos, deudas, pat: (+c.disponible || 0) + fondos - deudas };
};

// ---------- Formularios ----------
async function movForm(c, defaults = {}) {
  const tipo0 = defaults.tipo || 'gasto';
  const catOpts = (t) => (CATS[t] || []).map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('');
  const fd = await sheet({
    title: 'Registrar movimiento',
    body: `
      ${group('Tipo', chips('tipo', TIPOS, tipo0, { required: true }))}
      ${field('Valor (COP)', `<input name="monto" inputmode="numeric" required placeholder="0" autocomplete="off">`)}
      ${field('Fecha', `<input type="date" name="fecha" value="${today()}" required>`)}
      <div data-for="gasto ingreso">${field('Categoría', `<select name="cat">${catOpts(tipo0)}</select>`)}</div>
      <div data-for="gasto">${group('Medio de pago', chips('medio', [['cuenta', 'Cuenta o efectivo'], ['tarjeta', 'Tarjeta de crédito']], 'cuenta'))}</div>
      <div data-for="ingreso">${field('Horas facturadas', `<input name="horas" inputmode="decimal" placeholder="Solo freelance">`)}</div>
      <div data-for="deuda">${field('Deuda', `<select name="deudaId">${c.deudas.map((d) => `<option value="${d.id}">${esc(d.n)}</option>`).join('') || '<option value="">Primero agrega una deuda en Ajustes</option>'}</select>`)}</div>
      <div data-for="aporte retiro">${field('Fondo', `<select name="fondoId">${c.fondos.map((f) => `<option value="${f.id}">${esc(f.n)}</option>`).join('')}</select>`)}</div>
      ${field('Descripción', `<input name="desc" autocomplete="off">`)}`,
    onOpen: (dlg) => {
      const sync = () => {
        const t = dlg.querySelector('[name=tipo]:checked').value;
        dlg.querySelectorAll('[data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(t); });
        if (CATS[t]) dlg.querySelector('[name=cat]').innerHTML = catOpts(t);
      };
      dlg.querySelectorAll('[name=tipo]').forEach((r) => r.addEventListener('change', sync));
      sync();
    },
  });
  if (!fd) return false;
  const monto = Math.abs(parseMoney(fd.get('monto')));
  if (!monto) { toast('Escribe un valor mayor que cero'); return false; }
  const t = fd.get('tipo');
  const m = { id: uid(), fecha: fd.get('fecha'), tipo: t, monto, desc: fd.get('desc').trim(), creado: nowISO() };
  if (t === 'gasto' || t === 'ingreso') m.cat = fd.get('cat');
  if (t === 'gasto') m.medio = fd.get('medio') || 'cuenta';
  if (t === 'ingreso' && fd.get('horas')) m.horas = parseNum(fd.get('horas'));
  if (t === 'deuda') { m.deudaId = fd.get('deudaId'); if (!m.deudaId) { toast('No hay deudas registradas'); return false; } }
  if (t === 'aporte' || t === 'retiro') m.fondoId = fd.get('fondoId');
  m.ef = computeEffects(c, m);
  applyEffects(c, m.ef, 1);
  await put(STORE, m);
  await saveConfig(c);
  toast('Movimiento registrado');
  return true;
}

async function delMov(c, m) {
  if (!confirm(`¿Eliminar este movimiento de ${money(m.monto)}? Se revierte su efecto en saldos.`)) return false;
  applyEffects(c, m.ef || computeEffects(c, m), -1);
  await del(STORE, m.id);
  await saveConfig(c);
  return true;
}

async function editSaldos(c) {
  const fd = await sheet({
    title: 'Saldos, fondos y deudas',
    body: `
      ${field('Disponible en cuentas (COP)', `<input name="disponible" inputmode="numeric" value="${num(c.disponible, 0)}">`, 'Lo que tienes hoy fuera de los fondos.')}
      <div class="grid2">
        ${field('TRM (COP por USD)', `<input name="trm" inputmode="numeric" value="${c.param.trm || ''}">`)}
        ${field('COP por EUR', `<input name="eur" inputmode="numeric" value="${c.param.eur || ''}">`)}
      </div>
      <h3>Fondos</h3>
      ${c.fondos.map((f) => `<div class="card-f"><b>${esc(f.n)}</b><div class="grid2">
        ${field('Saldo', `<input name="f_saldo_${f.id}" inputmode="numeric" value="${num(f.saldo, 0)}">`)}
        ${f.metaEUR != null ? field('Meta (EUR)', `<input name="f_metaEUR_${f.id}" inputmode="numeric" value="${f.metaEUR}">`) : field('Meta (COP)', `<input name="f_meta_${f.id}" inputmode="numeric" value="${num(f.meta, 0)}">`)}
        ${f.minimo != null ? field('Mínimo (COP)', `<input name="f_minimo_${f.id}" inputmode="numeric" value="${num(f.minimo, 0)}">`) : ''}
      </div></div>`).join('')}
      <h3>Deudas</h3>
      ${c.deudas.map((d) => `<div class="card-f"><b>${esc(d.n)}</b> <span class="muted small">${d.tipo === 'rotativo' ? 'Tarjeta' : 'Crédito'} · ${d.moneda || 'COP'}</span><div class="grid2">
        ${field('Saldo', `<input name="d_saldo_${d.id}" inputmode="decimal" value="${d.saldo}">`)}
        ${field('Tasa E.A. %', `<input name="d_tasa_${d.id}" inputmode="decimal" value="${d.tasaEA ?? ''}">`)}
        ${d.tipo === 'cuota' ? field('Cuota', `<input name="d_cuota_${d.id}" inputmode="numeric" value="${num(d.cuota, 0)}">`) : ''}
      </div><label class="check"><input type="checkbox" name="d_del_${d.id}"> Eliminar esta deuda</label></div>`).join('') || '<p class="muted small">Sin deudas registradas.</p>'}
      <details class="mt"><summary>Agregar deuda</summary>
        ${field('Nombre', `<input name="nd_n" placeholder="Ej.: Tarjeta Visa">`)}
        ${group('Tipo', chips('nd_tipo', [['rotativo', 'Tarjeta (rotativo)'], ['cuota', 'Crédito por cuotas']], 'rotativo'))}
        ${group('Moneda', chips('nd_moneda', [['COP', 'COP'], ['USD', 'USD']], 'COP'))}
        <div class="grid2">${field('Saldo', `<input name="nd_saldo" inputmode="decimal">`)}${field('Tasa E.A. %', `<input name="nd_tasa" inputmode="decimal">`)}</div>
        ${field('Cuota mensual (créditos)', `<input name="nd_cuota" inputmode="numeric">`)}
      </details>
      <label class="check mt"><input type="checkbox" name="mudado" ${c.mudado ? 'checked' : ''}> Ya me mudé (marca el paso 4 como cumplido)</label>`,
  });
  if (!fd) return false;
  const pm = (k) => parseMoney(fd.get(k));
  c.disponible = pm('disponible');
  c.param.trm = pm('trm'); c.param.eur = pm('eur');
  for (const f of c.fondos) {
    f.saldo = pm(`f_saldo_${f.id}`);
    if (fd.has(`f_meta_${f.id}`)) f.meta = pm(`f_meta_${f.id}`);
    if (fd.has(`f_metaEUR_${f.id}`)) f.metaEUR = pm(`f_metaEUR_${f.id}`);
    if (fd.has(`f_minimo_${f.id}`)) f.minimo = pm(`f_minimo_${f.id}`);
  }
  c.deudas = c.deudas.filter((d) => !fd.get(`d_del_${d.id}`));
  for (const d of c.deudas) {
    d.saldo = d.moneda === 'USD' ? parseNum(fd.get(`d_saldo_${d.id}`)) || 0 : pm(`d_saldo_${d.id}`);
    d.tasaEA = parseNum(fd.get(`d_tasa_${d.id}`));
    if (d.tipo === 'cuota') d.cuota = pm(`d_cuota_${d.id}`);
    d.actualizado = today();
  }
  const nn = (fd.get('nd_n') || '').trim();
  if (nn) {
    const mon = fd.get('nd_moneda');
    c.deudas.push({ id: 'd' + uid(), n: nn, tipo: fd.get('nd_tipo'), moneda: mon, saldo: mon === 'USD' ? parseNum(fd.get('nd_saldo')) || 0 : pm('nd_saldo'), tasaEA: parseNum(fd.get('nd_tasa')), cuota: pm('nd_cuota'), actualizado: today() });
  }
  c.mudado = !!fd.get('mudado');
  const tarj = c.deudas.filter((d) => d.tipo === 'rotativo').reduce((a, d) => a + Math.max(0, +d.saldo || 0) * fx(c, d), 0);
  c.base.tarjeta = Math.max(+c.base.tarjeta || 0, tarj);
  await saveConfig(c);
  toast('Saldos actualizados');
  return true;
}

// Importa una copia JSON exportada desde el Kassenbuch
export async function importKassenbuch(obj) {
  if (!obj || obj.app !== 'kassenbuch' || !obj.cfg) throw new Error('No es una copia del Kassenbuch');
  const cfg = normalize(obj.cfg);
  let n = 0;
  for (const mes of Object.values(obj.meses || {})) {
    for (const m of mes.movs || []) {
      await put(STORE, { ...m, id: m.id || uid(), origen: 'kassenbuch' });
      n++;
    }
  }
  // Los saldos de la copia ya incluyen el efecto de esos movimientos
  await saveConfig(cfg);
  return n;
}

let sel = monthKey(today());

export async function render(root, app) {
  const c = await getConfig();
  const movsAll = await all(STORE);
  const movs = movsAll.filter((m) => monthKey(m.fecha) === sel);
  const s = statsOf(movs);
  const b = balance(c);
  const L = ladder(c);

  root.innerHTML = `
    <div class="monthnav"><button class="btn-icon" data-m="-1" aria-label="Mes anterior">‹</button><b>${monthLabel(sel)}</b><button class="btn-icon" data-m="1" aria-label="Mes siguiente">›</button></div>

    <section class="hero" style="--c:var(--c-ingresos)">
      <p class="eyebrow">Paso actual${L.cur ? ` · ${L.cur.k} de 5` : ''}</p>
      <p class="hero-n"><b>${L.cur ? esc(L.cur.n) : 'Todos los pasos cumplidos'}</b>${L.cur && L.cur.falta ? ` · faltan ${money(L.cur.falta)}` : ''}</p>
      <ol class="ladder">${L.steps.map((st) => `<li class="${st.done ? 'done' : ''} ${L.cur === st ? 'cur' : ''}"><span>${st.k}</span><i style="--p:${st.p}"></i><small>${esc(st.n)}</small></li>`).join('')}</ol>
      <div class="row mt"><button class="btn pri" data-act="add">Registrar movimiento</button><button class="btn" data-act="saldos">Saldos</button></div>
    </section>

    <section class="sec">
      <h2>El mes</h2>
      <div class="kpis">
        <div class="kpi"><span>Ingresos</span><b class="pos">${money(s.ing)}</b></div>
        <div class="kpi"><span>Gastos</span><b>${money(s.gas)}</b></div>
        <div class="kpi"><span>Excedente</span><b class="${s.excedente < 0 ? 'neg' : 'pos'}">${money(s.excedente)}</b></div>
        <div class="kpi"><span>Horas freelance</span><b>${num(s.horas)}</b></div>
      </div>
    </section>

    <section class="sec">
      <h2>Patrimonio</h2>
      <div class="kpis">
        <div class="kpi"><span>Disponible</span><b>${money(b.disp)}</b></div>
        <div class="kpi"><span>En fondos</span><b>${money(b.fondos)}</b></div>
        <div class="kpi"><span>Deudas</span><b class="neg">${money(b.deudas)}</b></div>
        <div class="kpi"><span>Neto</span><b class="${b.pat < 0 ? 'neg' : ''}">${money(b.pat)}</b></div>
      </div>
      ${c.fondos.map((f) => { const meta = f.metaEUR ? f.metaEUR * (+c.param.eur || 0) : +f.meta || 0; return `<div class="fund"><div class="f-row"><span>${esc(f.n)}</span><span>${money(f.saldo)}${meta ? ` <span class="muted">/ ${money(meta)}</span>` : ''}</span></div>${bar(meta ? Math.min(1, (+f.saldo || 0) / meta) : 0)}</div>`; }).join('')}
      ${c.deudas.length ? `<ul class="list mt">${c.deudas.map((d) => `<li><div class="item static"><span class="item-t">${esc(d.n)} <span class="muted">· ${d.moneda === 'USD' ? 'USD ' + num(d.saldo, 2) : money(d.saldo)}</span></span><span class="item-s">${d.tipo === 'cuota' ? `Cuota ${money(d.cuota)} · ` : ''}${d.tasaEA ? `${num(d.tasaEA, 2)} % E.A.` : 'Tasa sin registrar'}</span></div></li>`).join('')}</ul>` : ''}
    </section>

    <section class="sec">
      <h2>Movimientos</h2>
      ${movs.length ? `<ul class="list">${movs.map((m) => `
        <li><div class="item static mov">
          <span class="item-t">${esc(m.desc || catName(m.cat) || m.tipo)}</span>
          <span class="item-s">${fmtDate(m.fecha)} · ${esc(TIPOS.find((t) => t[0] === m.tipo)?.[1] || m.tipo)}${m.cat ? ' · ' + esc(catName(m.cat)) : ''}${m.medio === 'tarjeta' ? ' · tarjeta' : ''}</span>
          <b class="amt ${m.tipo === 'ingreso' || m.tipo === 'retiro' ? 'pos' : ''}">${m.tipo === 'ingreso' || m.tipo === 'retiro' || m.tipo === 'ajuste' ? '+' : '−'}${money(m.monto)}</b>
          <button class="btn-icon" data-del="${m.id}" aria-label="Eliminar movimiento">×</button>
        </div></li>`).join('')}</ul>` : `<p class="empty">Sin movimientos en ${monthLabel(sel)}.${movsAll.length ? '' : ' Si ya usabas el Kassenbuch, importa su copia desde Datos.'}</p>`}
    </section>`;

  root.onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    let changed = false;
    if (t.dataset.m) { sel = addMonths(sel, +t.dataset.m); app.refresh(); return; }
    if (t.dataset.act === 'add') changed = await movForm(c);
    else if (t.dataset.act === 'saldos') changed = await editSaldos(c);
    else if (t.dataset.del) changed = await delMov(c, movs.find((m) => m.id === t.dataset.del));
    if (changed) app.refresh();
  };
}
