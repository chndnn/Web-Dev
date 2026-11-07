'use strict';
/* =====================================================
   SpendWise – Personal Expense Tracker (single file)
   Pages are sections switched with the URL hash (#add, #history ...).
   Data is kept in localStorage.
   ===================================================== */

/* ---------- Storage ---------- */
const KEY_TX = 'spendwise.transactions';
const KEY_SET = 'spendwise.settings';
const DEFAULTS = { name: '', currency: '₹', theme: 'light', budget: 0, threshold: 80 };
const CATEGORIES = {
  expense: ['Food & Dining', 'Transport', 'Shopping', 'Bills & Utilities', 'Rent', 'Health', 'Education', 'Entertainment', 'Travel', 'Other'],
  income: ['Salary', 'Freelance', 'Business', 'Gift', 'Interest', 'Other']
};
const Store = {
  getTx() { try { return JSON.parse(localStorage.getItem(KEY_TX)) || []; } catch (e) { return []; } },
  setTx(list) { try { localStorage.setItem(KEY_TX, JSON.stringify(list)); } catch (e) {} },
  getSettings() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY_SET)) || {}); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  },
  setSettings(s) { try { localStorage.setItem(KEY_SET, JSON.stringify(s)); } catch (e) {} }
};
document.documentElement.dataset.theme = Store.getSettings().theme;

/* ---------- Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const pad2 = n => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) {
  return Store.getSettings().currency + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
const monthKey = dateStr => dateStr.slice(0, 7);
function monthLabel(key, long) {
  return new Date(key + '-01T00:00:00').toLocaleString('en-US', { month: long ? 'long' : 'short', year: 'numeric' });
}
function prettyDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function lastMonths(endKey, n) {
  const [y, m] = endKey.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(d.getFullYear() + '-' + pad2(d.getMonth() + 1));
  }
  return out;
}
function totals(list) {
  let income = 0, expense = 0;
  list.forEach(t => { if (t.type === 'income') income += t.amount; else expense += t.amount; });
  return { income, expense, balance: income - expense };
}
function runningBalances(all) {
  const asc = [...all].sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);
  let bal = 0; const map = {};
  asc.forEach(t => { bal += t.type === 'income' ? t.amount : -t.amount; map[t.id] = bal; });
  return map;
}
const newestFirst = (a, b) => b.date.localeCompare(a.date) || b.created - a.created;

function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.setAttribute('role', 'status');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

/* ---------- CSV export ---------- */
function toCSV(list) {
  const rows = [['Date', 'Type', 'Category', 'Note', 'Amount']];
  list.forEach(t => rows.push([t.date, t.type, t.category, t.note || '', t.amount.toFixed(2)]));
  return rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
}
function downloadCSV(list, filename) {
  if (!list.length) { toast('Nothing to export yet.', 'warn'); return; }
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
  const blob = new Blob(['\ufeff' + toCSV(sorted)], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
  toast('CSV file downloaded.');
}

/* ---------- Budget ---------- */
function budgetStatus() {
  const s = Store.getSettings();
  const key = monthKey(todayStr());
  const spent = Store.getTx().filter(t => t.type === 'expense' && t.date.startsWith(key)).reduce((a, t) => a + t.amount, 0);
  const budget = Number(s.budget) || 0;
  const pct = budget ? (spent / budget) * 100 : 0;
  let level = 'none';
  if (budget) level = pct > 100 ? 'over' : pct >= s.threshold ? 'warn' : 'ok';
  return { spent, budget, pct, level, remaining: budget - spent, threshold: s.threshold };
}
function budgetMessage(b) {
  if (b.level === 'none') return 'No monthly budget set yet.';
  if (b.level === 'over') return 'Over budget by ' + money(-b.remaining) + ' this month.';
  if (b.level === 'warn') return 'Careful: ' + Math.round(b.pct) + '% of your budget is used. ' + money(b.remaining) + ' left.';
  return 'On track. ' + money(b.remaining) + ' left this month.';
}
function renderBudgetCard(sel) {
  const b = budgetStatus();
  const cls = b.level === 'none' ? '' : b.level;
  $(sel).innerHTML =
    '<h2>Budget for ' + monthLabel(monthKey(todayStr()), true) + '</h2>' +
    (b.level === 'none'
      ? '<p class="muted">Set a monthly spending limit to get warnings before you overspend.</p><div class="actions"><a class="btn" href="#budget">Set budget</a></div>'
      : '<div class="budget-meta"><span>Spent ' + money(b.spent) + '</span><span>Budget ' + money(b.budget) + '</span></div>' +
        '<div class="progress ' + cls + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.min(100, Math.round(b.pct)) + '"><span style="width:' + Math.min(100, b.pct) + '%"></span></div>' +
        '<p class="budget-msg ' + cls + '">' + esc(budgetMessage(b)) + '</p>');
}

/* ---------- Charts ---------- */
function niceMax(m) {
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const r = m / p;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * p;
}
function shortNum(n) {
  if (n >= 10000000) return +(n / 10000000).toFixed(1) + 'Cr';
  if (n >= 100000) return +(n / 100000).toFixed(1) + 'L';
  if (n >= 1000) return +(n / 1000).toFixed(1) + 'k';
  return String(n);
}
function drawBarChart(canvas, labels, series) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const textCol = cssVar('--muted'), gridCol = cssVar('--border');
  const pad = { l: 46, r: 8, t: 12, b: 28 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
  ctx.font = '12px Figtree, Segoe UI, sans-serif';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ph - (ph * i) / 4;
    ctx.strokeStyle = gridCol; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillStyle = textCol; ctx.textAlign = 'right';
    ctx.fillText(shortNum((max * i) / 4), pad.l - 6, y);
  }
  const group = pw / labels.length;
  const bw = Math.min(34, (group * 0.72) / series.length);
  labels.forEach((lab, i) => {
    const gx = pad.l + group * i + (group - bw * series.length) / 2;
    series.forEach((s, j) => {
      const bh = (s.values[i] / max) * ph;
      ctx.fillStyle = s.color;
      ctx.fillRect(gx + bw * j, pad.t + ph - bh, bw - 2, bh);
    });
    ctx.fillStyle = textCol; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(lab, pad.l + group * i + group / 2, h - pad.b + 8);
    ctx.textBaseline = 'middle';
  });
}
function monthlySeries(all, endKey, n) {
  const keys = lastMonths(endKey, n);
  const income = keys.map(() => 0), expense = keys.map(() => 0);
  all.forEach(t => {
    const i = keys.indexOf(monthKey(t.date));
    if (i > -1) { if (t.type === 'income') income[i] += t.amount; else expense[i] += t.amount; }
  });
  return {
    labels: keys.map(k => monthLabel(k)),
    series: [
      { name: 'Income', color: cssVar('--green'), values: income },
      { name: 'Expense', color: cssVar('--red'), values: expense }
    ]
  };
}
function renderCategoryBars(sel, list) {
  const box = $(sel);
  const sums = {};
  list.filter(t => t.type === 'expense').forEach(t => { sums[t.category] = (sums[t.category] || 0) + t.amount; });
  const entries = Object.entries(sums).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { box.innerHTML = '<p class="empty">No expenses recorded for this month.</p>'; return; }
  const total = entries.reduce((a, e) => a + e[1], 0);
  box.innerHTML = entries.map(([c, v]) =>
    '<div class="cbar"><span>' + esc(c) + '</span><div class="track"><span style="width:' + (v / total * 100).toFixed(1) + '%"></span></div><span class="amt">' + money(v) + '</span></div>'
  ).join('');
}

/* ---------- Page modules: each has show() and optional draw() ---------- */
const state = { editId: null };
const pages = {};

/* Dashboard */
pages.dashboard = {
  draw() {
    const m = monthlySeries(Store.getTx(), monthKey(todayStr()), 6);
    drawBarChart($('#miniChart'), m.labels, m.series);
  },
  show() {
    const s = Store.getSettings();
    const all = Store.getTx();
    const t = totals(all);
    $('#greeting').textContent = s.name ? 'Welcome back, ' + s.name : 'Welcome back';
    $('#totBalance').textContent = money(t.balance);
    $('#totIncome').textContent = money(t.income);
    $('#totExpense').textContent = money(t.expense);
    renderBudgetCard('#budgetCardDash');
    const b = budgetStatus();
    const box = $('#alertBox');
    if (b.level === 'warn' || b.level === 'over') {
      box.hidden = false; box.className = 'alert ' + b.level; box.textContent = budgetMessage(b);
    } else { box.hidden = true; }
    const bal = runningBalances(all);
    const recent = [...all].sort(newestFirst).slice(0, 5);
    $('#recentBody').innerHTML = recent.length ? recent.map(tx =>
      '<tr><td>' + prettyDate(tx.date) + '</td><td>' + esc(tx.category) + (tx.note ? '<span class="sub">' + esc(tx.note) + '</span>' : '') + '</td>' +
      '<td class="num ' + (tx.type === 'income' ? 'inc' : 'exp') + '">' + (tx.type === 'income' ? '+' : '−') + money(tx.amount) + '</td>' +
      '<td class="num">' + money(bal[tx.id]) + '</td></tr>').join('')
      : '<tr><td colspan="4" class="empty">No transactions yet. <a href="#add">Add your first transaction</a>.</td></tr>';
    this.draw();
  }
};

/* Add / Edit transaction */
pages.add = (function () {
  const form = $('#txForm'), typeSel = $('#type'), catSel = $('#category');
  let editing = null;
  function fillCats(sel) {
    catSel.innerHTML = CATEGORIES[typeSel.value].map(c => '<option>' + esc(c) + '</option>').join('');
    if (sel) catSel.value = sel;
  }
  typeSel.addEventListener('change', () => fillCats());
  form.addEventListener('submit', e => {
    e.preventDefault();
    const amount = parseFloat($('#amount').value);
    const date = $('#date').value;
    let ok = true;
    $('#errAmount').textContent = ''; $('#errDate').textContent = '';
    if (!(amount > 0) || amount > 1e9) { $('#errAmount').textContent = 'Enter an amount greater than 0.'; ok = false; }
    if (!date) { $('#errDate').textContent = 'Choose a date.'; ok = false; }
    if (!ok) return;
    const data = { type: typeSel.value, amount: Math.round(amount * 100) / 100, category: catSel.value, date, note: $('#note').value.trim() };
    const list = Store.getTx();
    if (editing) {
      const i = list.findIndex(t => t.id === editing.id);
      list[i] = Object.assign({}, list[i], data);
      Store.setTx(list);
      toast('Transaction updated.');
      editing = null;
      location.hash = 'history';
      return;
    }
    list.push(Object.assign({ id: uid(), created: Date.now() }, data));
    Store.setTx(list);
    toast('Transaction added.');
    if (data.type === 'expense') {
      const b = budgetStatus();
      if (b.level === 'over' || b.level === 'warn') toast(budgetMessage(b), 'warn');
    }
    pages.add.show();
  });
  return {
    show() {
      editing = state.editId ? (Store.getTx().find(t => t.id === state.editId) || null) : null;
      state.editId = null;
      form.reset();
      $('#errAmount').textContent = ''; $('#errDate').textContent = '';
      $('#date').value = todayStr();
      fillCats();
      $('#formTitle').textContent = 'Add transaction';
      $('#submitBtn').textContent = 'Save transaction';
      if (editing) {
        typeSel.value = editing.type; fillCats(editing.category);
        $('#amount').value = editing.amount; $('#date').value = editing.date; $('#note').value = editing.note || '';
        $('#formTitle').textContent = 'Edit transaction';
        $('#submitBtn').textContent = 'Update transaction';
      }
    }
  };
})();

/* History */
pages.history = (function () {
  const cats = Array.from(new Set(CATEGORIES.expense.concat(CATEGORIES.income))).sort();
  $('#fCat').innerHTML = '<option value="">All categories</option>' + cats.map(c => '<option>' + esc(c) + '</option>').join('');
  const ids = ['fSearch', 'fType', 'fCat', 'fFrom', 'fTo'];
  let all = [], current = [];

  function render() {
    const q = $('#fSearch').value.trim().toLowerCase();
    const type = $('#fType').value, cat = $('#fCat').value, from = $('#fFrom').value, to = $('#fTo').value;
    const bal = runningBalances(all);
    current = all.filter(t =>
      (!type || t.type === type) && (!cat || t.category === cat) &&
      (!from || t.date >= from) && (!to || t.date <= to) &&
      (!q || (t.note || '').toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
    ).sort(newestFirst);
    const tot = totals(current);
    $('#sumCount').textContent = current.length;
    $('#sumIncome').textContent = money(tot.income);
    $('#sumExpense').textContent = money(tot.expense);
    $('#histBody').innerHTML = current.length ? current.map(t =>
      '<tr><td>' + prettyDate(t.date) + '</td>' +
      '<td>' + esc(t.category) + (t.note ? '<span class="sub">' + esc(t.note) + '</span>' : '') + '</td>' +
      '<td><span class="tag">' + (t.type === 'income' ? 'Income' : 'Expense') + '</span></td>' +
      '<td class="num ' + (t.type === 'income' ? 'inc' : 'exp') + '">' + (t.type === 'income' ? '+' : '−') + money(t.amount) + '</td>' +
      '<td class="num">' + money(bal[t.id]) + '</td>' +
      '<td><div class="row-actions"><button class="btn ghost small" data-edit="' + t.id + '">Edit</button>' +
      '<button class="btn danger small" data-del="' + t.id + '">Delete</button></div></td></tr>').join('')
      : '<tr><td colspan="6" class="empty">' + (all.length ? 'No transactions match these filters.' : 'No transactions yet. <a href="#add">Add one</a>.') + '</td></tr>';
  }
  ids.forEach(id => {
    $('#' + id).addEventListener('input', render);
    $('#' + id).addEventListener('change', render);
  });
  $('#resetBtn').addEventListener('click', () => { ids.forEach(id => { $('#' + id).value = ''; }); render(); });
  $('#exportBtn').addEventListener('click', () => downloadCSV(current, 'spendwise-transactions.csv'));
  $('#histBody').addEventListener('click', e => {
    const editId = e.target.dataset.edit, delId = e.target.dataset.del;
    if (editId) { state.editId = editId; location.hash = 'add'; return; }
    if (delId && confirm('Delete this transaction? This cannot be undone.')) {
      Store.setTx(all.filter(t => t.id !== delId));
      all = Store.getTx();
      render();
      toast('Transaction deleted.');
    }
  });
  return { show() { all = Store.getTx(); render(); } };
})();

/* Budget */
pages.budget = (function () {
  function render() {
    renderBudgetCard('#budgetCard');
    const b = budgetStatus();
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate() + 1;
    $('#statDays').textContent = daysLeft;
    $('#statAvg').textContent = money(b.spent / now.getDate());
    $('#statDaily').textContent = b.budget ? money(Math.max(0, b.remaining) / daysLeft) : '—';
    const key = monthKey(todayStr());
    renderCategoryBars('#catBarsBudget', Store.getTx().filter(t => t.date.startsWith(key)));
  }
  $('#budgetForm').addEventListener('submit', e => {
    e.preventDefault();
    const val = parseFloat($('#budget').value);
    if (isNaN(val) || val < 0) { $('#errBudget').textContent = 'Enter 0 or a positive amount.'; return; }
    $('#errBudget').textContent = '';
    const st = Store.getSettings();
    st.budget = val; st.threshold = parseInt($('#threshold').value, 10);
    Store.setSettings(st);
    toast(val ? 'Budget saved.' : 'Budget removed.');
    render();
  });
  return {
    show() {
      const s = Store.getSettings();
      $('#budget').value = s.budget || '';
      $('#threshold').value = s.threshold;
      $('#errBudget').textContent = '';
      render();
    }
  };
})();

/* Reports */
pages.reports = (function () {
  const input = $('#repMonth');
  function draw() {
    const m = monthlySeries(Store.getTx(), input.value || monthKey(todayStr()), 6);
    drawBarChart($('#trendChart'), m.labels, m.series);
  }
  function render() {
    const key = input.value || monthKey(todayStr());
    const list = Store.getTx().filter(t => t.date.startsWith(key));
    const t = totals(list);
    $('#repIncome').textContent = money(t.income);
    $('#repExpense').textContent = money(t.expense);
    $('#repSavings').textContent = money(t.balance);
    $('#repRate').textContent = t.income ? Math.round((t.balance / t.income) * 100) + '%' : '—';
    $('#trendTitle').textContent = 'Income vs expense, 6 months to ' + monthLabel(key);
    $('#catTitle').textContent = 'Spending by category, ' + monthLabel(key, true);
    renderCategoryBars('#catBarsReport', list);
    draw();
  }
  input.addEventListener('change', render);
  return {
    draw,
    show() { if (!input.value) input.value = monthKey(todayStr()); render(); }
  };
})();

/* Saving tips */
const TIPS = [
  ['Track every expense for 30 days', 'You cannot cut what you cannot see. Log every purchase for a month, then check the History page to find the categories that surprise you.'],
  ['Follow the 50/30/20 rule', 'Aim for about 50% of income on needs, 30% on wants and 20% on savings. Use the calculator on this page to see your numbers.'],
  ['Pay yourself first', 'Move money to savings the day your salary arrives, before you spend. Whatever is left is your spending money.'],
  ['Wait 24 hours before big purchases', 'If you still want the item after a day, it is probably worth buying. Most impulse buys do not pass this test.'],
  ['Cook at home more often', 'Food delivery and eating out add up fast. Planning a weekly menu and shopping with a list can cut your food bill noticeably.'],
  ['Review subscriptions every quarter', 'Cancel apps, OTT plans and memberships you no longer use. Small monthly charges quietly drain your budget.'],
  ['Build an emergency fund', 'Save at least three to six months of essential expenses in an easy-access account so surprises do not become debt.'],
  ['Set a monthly budget and respect the warning', 'Use the Budget page to set a limit. When SpendWise warns you at your chosen percentage, pause non-essential spending.']
];
pages.tips = (function () {
  $('#tipsList').innerHTML = TIPS.map((t, i) =>
    '<div class="acc"><button aria-expanded="false" aria-controls="tip' + i + '">' + esc(t[0]) + '</button><div class="panel" id="tip' + i + '" hidden>' + esc(t[1]) + '</div></div>').join('');
  $('#tipsList').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', !open);
    $('#' + btn.getAttribute('aria-controls')).hidden = open;
  });
  function calc() {
    const v = parseFloat($('#incomeIn').value);
    $('#calcOut').innerHTML = v > 0
      ? '<div class="cbar"><span>Needs (50%)</span><div class="track"><span style="width:50%"></span></div><span class="amt">' + money(v * 0.5) + '</span></div>' +
        '<div class="cbar"><span>Wants (30%)</span><div class="track"><span style="width:30%"></span></div><span class="amt">' + money(v * 0.3) + '</span></div>' +
        '<div class="cbar"><span>Savings (20%)</span><div class="track"><span style="width:20%"></span></div><span class="amt">' + money(v * 0.2) + '</span></div>'
      : '';
  }
  $('#incomeIn').addEventListener('input', calc);
  return {
    show() {
      const key = monthKey(todayStr());
      const sums = {};
      Store.getTx().filter(t => t.type === 'expense' && t.date.startsWith(key)).forEach(t => { sums[t.category] = (sums[t.category] || 0) + t.amount; });
      const top = Object.entries(sums).sort((a, b) => b[1] - a[1])[0];
      $('#personalTip').textContent = top
        ? 'Your biggest expense this month is ' + top[0] + ' (' + money(top[1]) + '). Try setting a smaller target for it next month.'
        : 'Add some expenses and we will point out where you spend the most.';
      calc();
    }
  };
})();

/* Settings */
function sampleData() {
  const list = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mk = d.getFullYear() + '-' + pad2(d.getMonth() + 1);
    const add = (type, amount, category, day, note) =>
      list.push({ id: uid(), created: Date.now() + list.length, type, amount, category, date: mk + '-' + pad2(day), note });
    add('income', 45000, 'Salary', 1, 'Monthly salary');
    if (i % 2 === 0) add('income', 6000 + i * 500, 'Freelance', 12, 'Side project');
    add('expense', 12000, 'Rent', 3, 'House rent');
    add('expense', 2400 + i * 150, 'Food & Dining', 8, 'Groceries and eating out');
    add('expense', 1800, 'Bills & Utilities', 10, 'Electricity, internet, phone');
    add('expense', 1200 + (i % 3) * 400, 'Transport', 14, 'Fuel and metro');
    add('expense', 2500 + (i % 4) * 700, 'Shopping', 18, 'Clothes and household items');
    add('expense', 900 + (i % 2) * 600, 'Entertainment', 22, 'Movies and subscriptions');
    if (i % 3 === 0) add('expense', 1500, 'Health', 25, 'Doctor visit');
  }
  return list.filter(t => t.date <= todayStr());
}
pages.settings = (function () {
  $('#setForm').addEventListener('submit', e => {
    e.preventDefault();
    const st = Store.getSettings();
    st.name = $('#name').value.trim(); st.currency = $('#currency').value; st.theme = $('#theme').value;
    Store.setSettings(st);
    document.documentElement.dataset.theme = st.theme;
    toast('Settings saved.');
  });
  $('#sampleBtn').addEventListener('click', () => {
    if (Store.getTx().length && !confirm('This adds sample transactions to your existing data. Continue?')) return;
    Store.setTx(Store.getTx().concat(sampleData()));
    const st = Store.getSettings();
    if (!st.budget) { st.budget = 30000; Store.setSettings(st); }
    toast('Sample data loaded.');
  });
  $('#exportAllBtn').addEventListener('click', () => downloadCSV(Store.getTx(), 'spendwise-all-transactions.csv'));
  $('#clearBtn').addEventListener('click', () => {
    if (confirm('Delete ALL transactions and the budget? This cannot be undone.')) {
      Store.setTx([]);
      const st = Store.getSettings(); st.budget = 0; Store.setSettings(st);
      toast('All data cleared.', 'warn');
    }
  });
  return {
    show() {
      const s = Store.getSettings();
      $('#name').value = s.name; $('#currency').value = s.currency; $('#theme').value = s.theme;
    }
  };
})();

/* ---------- Router & layout ---------- */
const PAGE_NAMES = Object.keys(pages);
let currentPage = 'dashboard';

function route() {
  let name = location.hash.slice(1);
  if (!PAGE_NAMES.includes(name)) name = 'dashboard';
  currentPage = name;
  $$('.page').forEach(p => { p.hidden = p.id !== 'page-' + name; });
  $$('#mainNav a').forEach(a => {
    const on = a.dataset.page === name;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#mainNav').classList.remove('open');
  $('#menuBtn').setAttribute('aria-expanded', 'false');
  pages[name].show();
  window.scrollTo(0, 0);
}
function redrawCharts() { if (pages[currentPage].draw) pages[currentPage].draw(); }

$('#menuBtn').addEventListener('click', e => {
  const open = $('#mainNav').classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', open);
});
$('#themeBtn').addEventListener('click', () => {
  const s = Store.getSettings();
  s.theme = s.theme === 'dark' ? 'light' : 'dark';
  Store.setSettings(s);
  document.documentElement.dataset.theme = s.theme;
  redrawCharts();
});
window.addEventListener('resize', redrawCharts);
window.addEventListener('hashchange', route);
route();