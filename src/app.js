let state = {
  products: [],
  sales: [],
  customers: [],
  orders: [],
  users: [],
  selectedReceiptId: null,
  user: null,
};

const logoSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
    <rect width="220" height="220" fill="#0b0b0b"/>
    <g fill="none" stroke="#c9a75a" stroke-width="4">
      <path d="M110 15 169 67 203 110 169 153 110 205 51 153 17 110 51 67Z"/>
      <path d="M53 67h114v86H53z"/>
      <path d="M74 53 110 20 146 53"/>
      <path d="M74 167 110 200 146 167"/>
    </g>
    <text x="110" y="128" fill="#d6bf83" font-size="72" text-anchor="middle" font-family="Georgia, serif">BE</text>
    <text x="110" y="150" fill="#d6bf83" font-size="12" text-anchor="middle" font-family="Georgia, serif">BIJOUTERIE ÉCLAT</text>
    <text x="110" y="163" fill="#d6bf83" font-size="7" text-anchor="middle" font-family="Georgia, serif">Original</text>
  </svg>
`;

const formatPrice = (price) => `${new Intl.NumberFormat('fr-FR').format(price)} FCFA`;
const currentReceipt = () => state.sales.find((sale) => sale.id === state.selectedReceiptId) || state.sales[0];

document.getElementById('logo').innerHTML = logoSvg;
document.getElementById('login-logo').innerHTML = logoSvg;

if (location.protocol === 'file:') {
  document.getElementById('launch-help').textContent =
    "Ouvrez l'application avec OUVRIR_BIJOUTERIE.bat, pas en ouvrant index.html directement.";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Erreur serveur');
  }
  return response.json();
}

// ─── Notifications toast ────────────────────────────────────────────────────

function showToast(message, type = 'error') {
  // Crée le container s'il n'existe pas
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'error' ? '✕' : type === 'success' ? '✓' : 'ℹ'}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // Animation d'entrée
  requestAnimationFrame(() => toast.classList.add('show'));

  // Disparaît après 4 secondes
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

async function bootstrap() {
  const data = await api('/api/bootstrap');
  state = {
    ...state,
    ...data,
    selectedReceiptId: data.sales[0]?.id || null,
  };
  document.getElementById('current-user').textContent = `${state.user.full_name} · ${state.user.role}`;
  document.getElementById('login-screen').classList.add('hidden');
  document.querySelector('.app-shell').classList.add('ready');
  renderAll();
}

function renderInventory(targetId) {
  document.getElementById(targetId).innerHTML = `
    <thead>
      <tr><th>Produit</th><th>Catégorie</th><th>Stock</th><th>Prix</th><th>Statut</th><th></th></tr>
    </thead>
    <tbody>
      ${state.products
        .map(
          (product) => `
            <tr>
              <td>${product.name}</td>
              <td>${product.category}</td>
              <td>${product.stock}</td>
              <td>${formatPrice(product.price)}</td>
              <td><span class="badge ${product.stock < 15 ? 'low' : 'ok'}">${product.stock < 15 ? 'Stock limité' : 'Disponible'}</span></td>
              <td><button class="table-button delete-btn" data-delete-product="${product.id}">Supprimer</button></td>
            </tr>
          `,
        )
        .join('')}
    </tbody>
  `;
}

function renderSales(targetId) {
  document.getElementById(targetId).innerHTML = `
    <thead>
      <tr><th>Référence</th><th>Client</th><th>Date</th><th>Total</th><th></th></tr>
    </thead>
    <tbody>
      ${state.sales
        .map(
          (sale) => `
            <tr>
              <td>${sale.id}</td>
              <td>${sale.customer}</td>
              <td>${sale.date}</td>
              <td>${formatPrice(sale.total)}</td>
              <td><button class="table-button" data-sale-id="${sale.id}">Voir reçu</button></td>
            </tr>
          `,
        )
        .join('')}
    </tbody>
  `;
}

function receiptMarkup(sale) {
  if (!sale) return '<p>Aucun reçu disponible.</p>';
  return `
    <div class="receipt-card">
      <div class="receipt-logo">${logoSvg}</div>
      <div class="receipt-meta"><span>${sale.id}</span><span>${sale.date}</span></div>
      ${sale.items
        .map(
          (item) => `
            <div class="receipt-line">
              <div><strong>${item.name}</strong><small>Qté : ${item.qty}</small></div>
              <span>${formatPrice(item.price * item.qty)}</span>
            </div>
          `,
        )
        .join('')}
      <div class="receipt-total"><span>Total</span><strong>${formatPrice(sale.total)}</strong></div>
      <div class="receipt-actions">
        <button data-download="${sale.id}">PDF</button>
        <button class="secondary" data-print="${sale.id}">Imprimer</button>
      </div>
    </div>
  `;
}

function renderStats() {
  const stockCount = state.products.reduce((sum, item) => sum + item.stock, 0);
  const turnover = state.sales.reduce((sum, sale) => sum + sale.total, 0);
  const lowStock = state.products.filter((item) => item.stock < 15).length;
  document.getElementById('stock-count').textContent = stockCount;
  document.getElementById('sales-count').textContent = state.sales.length;
  document.getElementById('turnover').textContent = formatPrice(turnover);
  document.getElementById('low-stock').textContent = lowStock;
}

function renderProductsSelect() {
  document.getElementById('product-select').innerHTML = state.products
    .map((product) => `<option value="${product.id}">${product.name}</option>`)
    .join('');
}

function renderCustomerSelect() {
  document.getElementById('customer-select').innerHTML = `
    <option value="">Choisir un client existant</option>
    ${state.customers
      .map((customer) => `<option value="${customer.phone || customer.id}">${customer.name}</option>`)
      .join('')}
  `;
}

function renderCustomers() {
  const salesByPhone = new Map();
  state.sales.forEach((sale) => {
    const key = sale.phone || sale.customer;
    const summary = salesByPhone.get(key) || { purchases: 0, total: 0 };
    summary.purchases += 1;
    summary.total += sale.total;
    salesByPhone.set(key, summary);
  });
  document.getElementById('customer-grid').innerHTML = state.customers
    .map(
      (customer) => {
        const key = customer.phone || customer.name;
        return `
        <article>
          <h3>${customer.name}</h3>
          <p>${customer.phone || 'Téléphone non renseigné'}</p>
          <strong>${salesByPhone.get(key)?.purchases || 0} achat(s)</strong>
          <span>${formatPrice(salesByPhone.get(key)?.total || 0)}</span>
          <button class="table-button delete-btn" style="margin-top:10px" data-delete-customer="${customer.id}">Supprimer</button>
        </article>
      `;
      },
    )
    .join('');
}

function renderReceipts() {
  const sale = currentReceipt();
  document.getElementById('dashboard-receipt').innerHTML = receiptMarkup(sale);
  document.getElementById('receipt-preview').innerHTML = receiptMarkup(sale);
}

// ─── Commandes ──────────────────────────────────────────────────────────────

function renderOrders() {
  const pending = state.orders.filter((o) => o.status === 'en_attente');
  const delivered = state.orders.filter((o) => o.status === 'livre');

  const orderRow = (order, showActions) => `
    <tr>
      <td>${order.order_id}</td>
      <td>${order.customer}</td>
      <td>${order.item_name}</td>
      <td>${formatPrice(order.price)}</td>
      <td>${formatPrice(order.advance)}</td>
      <td>${formatPrice(order.price - order.advance)}</td>
      <td>${order.date_created}</td>
      <td>
        <span class="badge ${order.status === 'en_attente' ? 'low' : 'ok'}">
          ${order.status === 'en_attente' ? 'En attente' : 'Livré'}
        </span>
      </td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="table-button" data-order-pdf="${order.id}">Bon</button>
        ${showActions ? `
          <button class="table-button" style="background:#7be2a4;color:#090909" data-deliver-order="${order.id}">Livrer</button>
          <button class="table-button delete-btn" data-delete-order="${order.id}">✕</button>
        ` : `
          <button class="table-button" data-order-receipt="${order.id}">Reçu</button>
        `}
      </td>
    </tr>
  `;

  const pendingEl = document.getElementById('orders-pending-table');
  if (pendingEl) {
    pendingEl.innerHTML = `
      <thead>
        <tr><th>Réf</th><th>Client</th><th>Bijou</th><th>Prix</th><th>Avance</th><th>Reste</th><th>Date</th><th>Statut</th><th></th></tr>
      </thead>
      <tbody>
        ${pending.map((o) => orderRow(o, true)).join('')}
        ${pending.length === 0 ? '<tr><td colspan="9">Aucune commande en attente</td></tr>' : ''}
      </tbody>
    `;
  }

  const deliveredEl = document.getElementById('orders-delivered-table');
  if (deliveredEl) {
    deliveredEl.innerHTML = `
      <thead>
        <tr><th>Réf</th><th>Client</th><th>Bijou</th><th>Prix</th><th>Avance</th><th>Reste</th><th>Date</th><th>Statut</th><th></th></tr>
      </thead>
      <tbody>
        ${delivered.map((o) => orderRow(o, false)).join('')}
        ${delivered.length === 0 ? '<tr><td colspan="9">Aucune commande livrée</td></tr>' : ''}
      </tbody>
    `;
  }
}

function renderOrderCustomerSelect() {
  const el = document.getElementById('order-customer-select');
  if (!el) return;
  el.innerHTML = `
    <option value="">Choisir un client existant</option>
    ${state.customers
      .map((c) => `<option value="${c.phone || c.id}">${c.name}</option>`)
      .join('')}
  `;
}

function buildOrderPdf(order, type) {
  const isReceipt = type === 'receipt';
  const title = isReceipt ? 'RECU DE LIVRAISON' : 'BON DE COMMANDE';
  const remaining = order.price - order.advance;

  const lines = [
    '0.788 0.655 0.353 RG', '2 w',
    '75 790 m 95 770 l 105 750 l 95 730 l 75 720 l 55 730 l 45 750 l 55 770 l h S',
    '55 770 95 770 95 730 55 730 re S',
    'BT /F1 16 Tf 65 746 Td (BE) Tj ET',
    'BT /F2 20 Tf 120 770 Td (Bijouterie Eclat) Tj ET',
    '0.4 0.4 0.4 rg',
    `BT /F1 9 Tf 120 755 Td (${title}) Tj ET`,
    '0 0 0 rg',
    `BT /F2 11 Tf 440 770 Td (${escapePdfText(order.order_id)}) Tj ET`,

    '0.8 0.8 0.8 RG', '0.5 w', '50 710 m 545 710 l S', '0 0 0 RG',

    'BT /F2 11 Tf 50 685 Td (Client :) Tj ET',
    `BT /F1 11 Tf 130 685 Td (${escapePdfText(order.customer)}) Tj ET`,
    'BT /F2 11 Tf 50 668 Td (Tel :) Tj ET',
    `BT /F1 11 Tf 130 668 Td (${escapePdfText(order.phone || 'Non renseigne')}) Tj ET`,
    'BT /F2 11 Tf 50 651 Td (Date commande :) Tj ET',
    `BT /F1 11 Tf 160 651 Td (${escapePdfText(order.date_created)}) Tj ET`,
  ];

  if (isReceipt && order.date_delivered) {
    lines.push('BT /F2 11 Tf 300 651 Td (Date livraison :) Tj ET');
    lines.push(`BT /F1 11 Tf 410 651 Td (${escapePdfText(order.date_delivered)}) Tj ET`);
  }

  lines.push('0.8 0.8 0.8 RG', '0.5 w', '50 635 m 545 635 l S', '0 0 0 RG');

  // Détails bijou
  lines.push('BT /F2 13 Tf 50 610 Td (Bijou commande) Tj ET');
  lines.push(`BT /F1 11 Tf 50 590 Td (${escapePdfText(order.item_name)}) Tj ET`);
  if (order.item_description) {
    lines.push(`0.4 0.4 0.4 rg`);
    lines.push(`BT /F1 10 Tf 50 573 Td (${escapePdfText(order.item_description)}) Tj ET`);
    lines.push('0 0 0 rg');
  }

  lines.push('0.8 0.8 0.8 RG', '0.5 w', '50 555 m 545 555 l S', '0 0 0 RG');

  // Montants
  lines.push('BT /F2 11 Tf 50 530 Td (Prix total :) Tj ET');
  lines.push(`BT /F1 11 Tf 400 530 Td (${formatPricePdf(order.price)}) Tj ET`);
  lines.push('BT /F2 11 Tf 50 510 Td (Avance versee :) Tj ET');
  lines.push(`BT /F1 11 Tf 400 510 Td (${formatPricePdf(order.advance)}) Tj ET`);

  lines.push('0.8 0.8 0.8 RG', '0.5 w', '50 498 m 545 498 l S', '0 0 0 RG');

  if (isReceipt) {
    lines.push(`BT /F2 13 Tf 50 475 Td (SOLDE PAYE) Tj ET`);
    lines.push(`BT /F2 13 Tf 400 475 Td (${formatPricePdf(remaining)}) Tj ET`);
    lines.push('0.8 0.8 0.8 RG', '0.5 w', '50 462 m 545 462 l S', '0 0 0 RG');
    lines.push('BT /F2 14 Tf 50 440 Td (TOTAL PAYE) Tj ET');
    lines.push(`BT /F2 14 Tf 400 440 Td (${formatPricePdf(order.price)}) Tj ET`);
  } else {
    lines.push('0.788 0.655 0.353 rg');
    lines.push(`BT /F2 13 Tf 50 475 Td (RESTE A PAYER) Tj ET`);
    lines.push(`BT /F2 13 Tf 400 475 Td (${formatPricePdf(remaining)}) Tj ET`);
    lines.push('0 0 0 rg');
  }

  // Footer
  lines.push('0.6 0.6 0.6 rg');
  const footerText = isReceipt
    ? 'Bijouterie Eclat - Recu de livraison'
    : 'Bijouterie Eclat - Bon de commande - Conservez ce document';
  lines.push(`BT /F1 8 Tf 150 50 Td (${footerText}) Tj ET`);
  lines.push('0 0 0 rg');

  const stream = lines.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
    `6 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj) => { offsets.push(pdf.length); pdf += `${obj}\n`; });
  const xrefStart = pdf.length;
  pdf += `xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size 7 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

function downloadOrderPdf(order, type) {
  const blob = buildOrderPdf(order, type);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const prefix = type === 'receipt' ? 'recu' : 'bon';
  link.download = `${prefix}-${order.order_id.replace('#', '')}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Analytics ──────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

function getSalesByMonth() {
  const months = {};
  state.sales.forEach((sale) => {
    // Le format de date est "DD/MM/YYYY"
    const parts = sale.date.split('/');
    if (parts.length < 3) return;
    const key = `${parts[2]}-${parts[1]}`; // "2026-05"
    const label = `${MONTH_NAMES[parseInt(parts[1], 10) - 1]} ${parts[2]}`;
    if (!months[key]) months[key] = { key, label, count: 0, total: 0 };
    months[key].count += 1;
    months[key].total += sale.total;
  });
  // Trier par date
  return Object.values(months).sort((a, b) => a.key.localeCompare(b.key));
}

function getTopProducts() {
  const products = {};
  state.sales.forEach((sale) => {
    sale.items.forEach((item) => {
      const name = item.name;
      if (!products[name]) products[name] = { name, qty: 0, total: 0 };
      products[name].qty += item.qty;
      products[name].total += item.price * item.qty;
    });
  });
  return Object.values(products).sort((a, b) => b.total - a.total);
}

function drawChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || data.length === 0) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  // Dimensions réelles du canvas
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  const padding = { top: 30, right: 30, bottom: 60, left: 80 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;

  // Clear
  ctx.clearRect(0, 0, W, H);

  const maxVal = Math.max(...data.map((d) => d.total));
  const barWidth = Math.min(50, (chartW / data.length) * 0.6);
  const gap = chartW / data.length;

  // ── Grille horizontale ──
  const gridLines = 5;
  ctx.strokeStyle = 'rgba(248, 245, 239, 0.08)';
  ctx.lineWidth = 1;
  ctx.font = '11px Inter, Arial, sans-serif';
  ctx.fillStyle = '#c7c1b6';
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + chartH - (chartH * i) / gridLines;
    const val = (maxVal * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();
    ctx.fillText(formatPricePdf(Math.round(val)), padding.left - 8, y + 4);
  }

  // ── Barres ──
  data.forEach((d, i) => {
    const x = padding.left + i * gap + (gap - barWidth) / 2;
    const barH = maxVal > 0 ? (d.total / maxVal) * chartH : 0;
    const y = padding.top + chartH - barH;

    // Dégradé doré
    const grad = ctx.createLinearGradient(x, y, x, padding.top + chartH);
    grad.addColorStop(0, '#c8a24a');
    grad.addColorStop(1, 'rgba(200, 162, 74, 0.3)');
    ctx.fillStyle = grad;

    // Barres arrondies en haut
    const radius = Math.min(4, barWidth / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + barWidth - radius, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
    ctx.lineTo(x + barWidth, padding.top + chartH);
    ctx.lineTo(x, padding.top + chartH);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();

    // Valeur au-dessus de la barre
    ctx.fillStyle = '#c8a24a';
    ctx.font = '10px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.count + ' vente' + (d.count > 1 ? 's' : ''), x + barWidth / 2, y - 8);

    // Label mois en bas
    ctx.fillStyle = '#c7c1b6';
    ctx.font = '11px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';

    // Rotation du texte pour éviter le chevauchement
    ctx.save();
    ctx.translate(x + barWidth / 2, padding.top + chartH + 15);
    ctx.rotate(-0.4);
    ctx.fillText(d.label, 0, 0);
    ctx.restore();
  });
}

function renderAnalytics() {
  const data = getSalesByMonth();
  const topProducts = getTopProducts();

  // ── Graphiques ──
  drawChart('dashboard-chart', data);
  drawChart('analytics-chart', data);

  // ── Stats du mois en cours ──
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonth = data.find((d) => d.key === currentKey);

  const el = (id) => document.getElementById(id);
  if (el('analytics-month-sales')) {
    el('analytics-month-sales').textContent = currentMonth ? currentMonth.count : 0;
  }
  if (el('analytics-month-revenue')) {
    el('analytics-month-revenue').textContent = formatPrice(currentMonth ? currentMonth.total : 0);
  }
  if (el('analytics-best-month') && data.length > 0) {
    const best = data.reduce((a, b) => (a.total > b.total ? a : b));
    el('analytics-best-month').textContent = best.label;
  }
  if (el('analytics-avg-revenue') && data.length > 0) {
    const avg = data.reduce((sum, d) => sum + d.total, 0) / data.length;
    el('analytics-avg-revenue').textContent = formatPrice(Math.round(avg));
  }

  // ── Tableau détail par mois ──
  if (el('analytics-table')) {
    el('analytics-table').innerHTML = `
      <thead>
        <tr><th>Mois</th><th>Nb ventes</th><th>Chiffre d'affaires</th></tr>
      </thead>
      <tbody>
        ${data.map((d) => `
          <tr>
            <td>${d.label}</td>
            <td>${d.count}</td>
            <td>${formatPrice(d.total)}</td>
          </tr>
        `).join('')}
        ${data.length === 0 ? '<tr><td colspan="3">Aucune vente enregistrée</td></tr>' : ''}
      </tbody>
    `;
  }

  // ── Tableau top produits ──
  if (el('analytics-products-table')) {
    el('analytics-products-table').innerHTML = `
      <thead>
        <tr><th>Produit</th><th>Qté vendue</th><th>CA total</th></tr>
      </thead>
      <tbody>
        ${topProducts.map((p) => `
          <tr>
            <td>${p.name}</td>
            <td>${p.qty}</td>
            <td>${formatPrice(p.total)}</td>
          </tr>
        `).join('')}
        ${topProducts.length === 0 ? '<tr><td colspan="3">Aucune vente enregistrée</td></tr>' : ''}
      </tbody>
    `;
  }
}

function renderAdmin() {
  const panel = document.getElementById('admin-panel');
  const adminTab = document.querySelector('[data-tab="admin"]');
  if (!panel) return;

  if (!state.user || state.user.role !== 'admin') {
    panel.innerHTML = '';
    if (adminTab) adminTab.style.display = 'none';
    return;
  }

  if (adminTab) adminTab.style.display = '';

  panel.innerHTML = `
    <section class="panel">
      <h2>Gestion des utilisateurs</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Utilisateur</th><th>Rôle</th><th>Nom complet</th><th>Nouveau mot de passe</th><th></th></tr>
          </thead>
          <tbody>
            ${state.users.map(u => `
              <tr>
                <td>${u.username}</td>
                <td>${u.role}</td>
                <td>${u.full_name}</td>
                <td><input type="password" placeholder="Nouveau mdp" id="pwd-${u.id}" class="reset-pwd-input" minlength="6" /></td>
                <td><button class="table-button" data-reset-pwd="${u.id}">Réinitialiser</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAll() {
  renderStats();
  renderInventory('inventory-table');
  renderInventory('inventory-table-full');
  renderSales('sales-table');
  renderSales('receipt-sales-table');
  if (document.getElementById('dashboard-sales-table')) {
    renderSales('dashboard-sales-table');
  }
  renderProductsSelect();
  renderCustomerSelect();
  renderOrderCustomerSelect();
  renderCustomers();
  renderReceipts();
  renderOrders();
  renderAdmin();
  renderAnalytics();
}

function switchTab(tabId) {
  document.querySelectorAll('.tabs button').forEach((button) => button.classList.toggle('active', button.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
}

function escapePdfText(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    // Remplace les espaces insécables et autres caractères spéciaux par un espace normal
    .replace(/[\u00A0\u202F\u2009]/g, ' ');
}

// Formatage prix spécial pour PDF (espaces normaux, pas d'espaces insécables)
function formatPricePdf(price) {
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
}

function buildPdf(sale) {
  const lines = [
    // ── Logo diamant (déplacé à gauche, au-dessus du texte) ──
    '0.788 0.655 0.353 RG',
    '2 w',
    // Diamant centré sur x=75, entre y=780 et y=730
    '75 790 m 95 770 l 105 750 l 95 730 l 75 720 l 55 730 l 45 750 l 55 770 l h S',
    // Rectangle intérieur
    '55 770 95 770 95 730 55 730 re S',
    // "BE" dans le diamant
    'BT /F1 16 Tf 65 746 Td (BE) Tj ET',

    // ── Texte header (à droite du logo) ──
    'BT /F2 20 Tf 120 770 Td (Bijouterie Eclat) Tj ET',
    '0.4 0.4 0.4 rg',
    'BT /F1 9 Tf 120 755 Td (Recu electronique officiel) Tj ET',
    '0 0 0 rg',

    // ── Référence (alignée à droite) ──
    `BT /F2 11 Tf 460 770 Td (${escapePdfText(sale.id)}) Tj ET`,

    // ── Ligne séparatrice ──
    '0.8 0.8 0.8 RG',
    '0.5 w',
    '50 710 m 545 710 l S',
    '0 0 0 RG',

    // ── Infos client ──
    'BT /F2 11 Tf 50 685 Td (Client :) Tj ET',
    `BT /F1 11 Tf 110 685 Td (${escapePdfText(sale.customer)}) Tj ET`,
    'BT /F2 11 Tf 50 668 Td (Tel :) Tj ET',
    `BT /F1 11 Tf 110 668 Td (${escapePdfText(sale.phone || 'Non renseigne')}) Tj ET`,
    'BT /F2 11 Tf 50 651 Td (Date :) Tj ET',
    `BT /F1 11 Tf 110 651 Td (${escapePdfText(sale.date)}) Tj ET`,

    // ── Ligne séparatrice ──
    '0.8 0.8 0.8 RG',
    '0.5 w',
    '50 635 m 545 635 l S',
    '0 0 0 RG',

    // ── En-tête tableau ──
    '0.4 0.4 0.4 rg',
    'BT /F2 10 Tf 50 618 Td (Produit) Tj ET',
    'BT /F2 10 Tf 300 618 Td (Qte) Tj ET',
    'BT /F2 10 Tf 420 618 Td (Prix) Tj ET',
    '0 0 0 rg',
  ];

  let y = 595;
  sale.items.forEach((item) => {
    lines.push(`BT /F1 11 Tf 50 ${y} Td (${escapePdfText(item.name)}) Tj ET`);
    lines.push(`BT /F1 11 Tf 310 ${y} Td (${item.qty}) Tj ET`);
    lines.push(`BT /F1 11 Tf 420 ${y} Td (${formatPricePdf(item.price * item.qty)}) Tj ET`);
    y -= 22;
  });

  // ── Ligne séparatrice avant total ──
  lines.push('0.8 0.8 0.8 RG');
  lines.push('0.5 w');
  lines.push(`50 ${y + 5} m 545 ${y + 5} l S`);
  lines.push('0 0 0 RG');

  // ── Total ──
  lines.push(`BT /F2 13 Tf 300 ${y - 15} Td (TOTAL) Tj ET`);
  lines.push(`BT /F2 13 Tf 420 ${y - 15} Td (${formatPricePdf(sale.total)}) Tj ET`);

  // ── Footer ──
  lines.push('0.6 0.6 0.6 rg');
  lines.push('BT /F1 8 Tf 180 50 Td (Bijouterie Eclat - Recu genere electroniquement) Tj ET');
  lines.push('0 0 0 rg');

  const stream = lines.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
    `6 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref
0 7
0000000000 65535 f 
${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}
trailer << /Size 7 /Root 1 0 R >>
startxref
${xrefStart}
%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

function downloadPdf(sale) {
  const url = URL.createObjectURL(buildPdf(sale));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sale.id.replace('#', '')}-bijouterie-eclat.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

function syncCustomerIntoSaleForm(customer) {
  const saleForm = document.getElementById('sale-form');
  saleForm.elements.customer.value = customer.name;
  saleForm.elements.phone.value = customer.phone || '';
}

document.addEventListener('click', async (event) => {
  const tabButton = event.target.closest('[data-tab]');
  const saleButton = event.target.closest('[data-sale-id]');
  const downloadButton = event.target.closest('[data-download]');
  const printButton = event.target.closest('[data-print]');
  const deleteProductBtn = event.target.closest('[data-delete-product]');
  const deleteCustomerBtn = event.target.closest('[data-delete-customer]');
  const resetPwdBtn = event.target.closest('[data-reset-pwd]');
  const orderPdfBtn = event.target.closest('[data-order-pdf]');
  const orderReceiptBtn = event.target.closest('[data-order-receipt]');
  const deliverOrderBtn = event.target.closest('[data-deliver-order]');
  const deleteOrderBtn = event.target.closest('[data-delete-order]');

  if (tabButton) switchTab(tabButton.dataset.tab);
  if (saleButton) {
    state.selectedReceiptId = saleButton.dataset.saleId;
    renderReceipts();
  }
  if (downloadButton) downloadPdf(state.sales.find((sale) => sale.id === downloadButton.dataset.download));
  if (printButton) window.print();

  if (deleteProductBtn) {
    const id = deleteProductBtn.dataset.deleteProduct;
    if (!confirm('Supprimer ce produit ?')) return;
    try {
      await api(`/api/products/${id}`, { method: 'DELETE' });
      showToast('Produit supprimé', 'success');
      await bootstrap();
    } catch (e) {
      showToast(e.message);
    }
  }

  if (deleteCustomerBtn) {
    const id = deleteCustomerBtn.dataset.deleteCustomer;
    if (!confirm('Supprimer ce client ?')) return;
    try {
      await api(`/api/customers/${id}`, { method: 'DELETE' });
      showToast('Client supprimé', 'success');
      await bootstrap();
    } catch (e) {
      showToast(e.message);
    }
  }

  if (orderPdfBtn) {
    const order = state.orders.find((o) => o.id === Number(orderPdfBtn.dataset.orderPdf));
    if (order) downloadOrderPdf(order, 'bon');
  }

  if (orderReceiptBtn) {
    const order = state.orders.find((o) => o.id === Number(orderReceiptBtn.dataset.orderReceipt));
    if (order) downloadOrderPdf(order, 'receipt');
  }

  if (deliverOrderBtn) {
    const id = deliverOrderBtn.dataset.deliverOrder;
    if (!confirm('Confirmer la livraison de cette commande ?')) return;
    try {
      await api(`/api/orders/${id}/deliver`, { method: 'POST', body: '{}' });
      showToast('Commande livrée avec succès', 'success');
      await bootstrap();
    } catch (e) {
      showToast(e.message);
    }
  }

  if (deleteOrderBtn) {
    const id = deleteOrderBtn.dataset.deleteOrder;
    if (!confirm('Supprimer cette commande ?')) return;
    try {
      await api(`/api/orders/${id}`, { method: 'DELETE' });
      showToast('Commande supprimée', 'success');
      await bootstrap();
    } catch (e) {
      showToast(e.message);
    }
  }

  if (resetPwdBtn) {
    const userId = resetPwdBtn.dataset.resetPwd;
    const input = document.getElementById(`pwd-${userId}`);
    const newPwd = input?.value?.trim();
    if (!newPwd || newPwd.length < 6) {
      showToast('Le mot de passe doit faire au moins 6 caractères');
      return;
    }
    if (!confirm('Réinitialiser le mot de passe de cet utilisateur ?')) return;
    try {
      await api(`/api/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPwd }),
      });
      input.value = '';
      showToast('Mot de passe réinitialisé avec succès', 'success');
    } catch (e) {
      showToast(e.message);
    }
  }
});

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
    });
    await bootstrap();
  } catch (error) {
    document.getElementById('login-error').textContent =
      location.protocol === 'file:'
        ? "Connexion indisponible ici : lancez l'application avec OUVRIR_BIJOUTERIE.bat."
        : error.message;
  }
});

document.getElementById('logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST', body: '{}' });
  location.reload();
});

document.getElementById('download-current').addEventListener('click', () => downloadPdf(currentReceipt()));
document.getElementById('print-current').addEventListener('click', () => window.print());

document.getElementById('product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  const form = new FormData(formEl);
  try {
    await api('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name: form.get('name'),
        category: form.get('category'),
        stock: Number(form.get('stock')),
        price: Number(form.get('price')),
      }),
    });
    formEl.reset();
    showToast('Produit ajouté avec succès', 'success');
    await bootstrap();
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('customer-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  const form = new FormData(formEl);
  const customer = {
    name: form.get('name'),
    phone: form.get('phone'),
  };
  try {
    await api('/api/customers', { method: 'POST', body: JSON.stringify(customer) });
    syncCustomerIntoSaleForm(customer);
    formEl.reset();
    showToast('Client enregistré avec succès', 'success');
    await bootstrap();
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('customer-select').addEventListener('change', (event) => {
  const val = event.target.value;
  const customer = state.customers.find((item) => (item.phone || String(item.id)) === val);
  if (customer) syncCustomerIntoSaleForm(customer);
});

document.getElementById('sale-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  const form = new FormData(formEl);
  try {
    await api('/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        customer: form.get('customer'),
        phone: form.get('phone'),
        productId: Number(form.get('productId')),
        qty: Number(form.get('qty')),
      }),
    });
    formEl.reset();
    showToast('Vente enregistrée avec succès', 'success');
    await bootstrap();
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('order-customer-select').addEventListener('change', (event) => {
  const val = event.target.value;
  const customer = state.customers.find((item) => (item.phone || String(item.id)) === val);
  if (customer) {
    const orderForm = document.getElementById('order-form');
    orderForm.elements.customer.value = customer.name;
    orderForm.elements.phone.value = customer.phone || '';
  }
});

document.getElementById('order-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  const form = new FormData(formEl);
  try {
    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer: form.get('customer'),
        phone: form.get('phone'),
        itemName: form.get('itemName'),
        itemDescription: form.get('itemDescription'),
        price: Number(form.get('price')),
        advance: Number(form.get('advance') || 0),
      }),
    });
    formEl.reset();
    showToast('Commande créée avec succès', 'success');
    await bootstrap();
  } catch (error) {
    showToast(error.message);
  }
});

bootstrap().catch(() => {
  document.getElementById('login-screen').classList.remove('hidden');
});