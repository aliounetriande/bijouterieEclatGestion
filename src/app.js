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
              <td><button class="table-button" data-download="${sale.id}">Reçu</button></td>
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

// ─── Logo et en-tête PDF commune ────────────────────────────────────────────

const LOGO_BASE64 = 'data:image/png;base64,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';

function addPdfHeader(doc, title, refId) {
  // Logo
  doc.addImage(LOGO_BASE64, 'PNG', 15, 8, 22, 22);

  // Nom de la bijouterie
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('BIJOUTERIE ECLAT', 42, 17);

  // Adresse
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Sis en face de la porte 14 du Stade Municipal', 42, 22);
  doc.text("a 50m de l'immeuble Photo Rapide", 42, 26);
  doc.text('Tel.: 71 83 21 26 / 78 49 18 11 / 55 45 70 71', 42, 30);

  // Type de document
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(title, 195, 17, { align: 'right' });

  // Référence
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(refId, 195, 23, { align: 'right' });

  // Ligne séparatrice
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(15, 35, 195, 35);

  doc.setTextColor(0, 0, 0);
  return 40; // Y position après le header
}

function buildOrderPdf(order, type) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const isReceipt = type === 'receipt';
  const title = isReceipt ? 'Recu de Livraison' : 'Bon de Commande';
  const remaining = order.price - order.advance;

  let y = addPdfHeader(doc, title, order.order_id);

  // Infos client
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Nom :', 15, y);
  doc.setFont('helvetica', 'normal');
  doc.text(order.customer, 40, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Tel :', 15, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(order.phone || 'Non renseigne', 40, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Date commande :', 110, y);
  doc.setFont('helvetica', 'normal');
  doc.text(order.date_created, 155, y);

  if (isReceipt && order.date_delivered) {
    doc.setFont('helvetica', 'bold');
    doc.text('Date livraison :', 110, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(order.date_delivered, 155, y + 6);
  }

  y += 14;
  doc.setDrawColor(200, 200, 200);
  doc.line(15, y, 195, y);
  y += 8;

  // Détails bijou
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Bijou commande', 15, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(order.item_name, 15, y);
  y += 6;

  if (order.item_description) {
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(order.item_description, 15, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
  }

  y += 4;
  doc.line(15, y, 195, y);
  y += 10;

  // Montants
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Prix total :', 15, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatPricePdf(order.price), 195, y, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Avance versee :', 15, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatPricePdf(order.advance), 195, y, { align: 'right' });
  y += 6;

  doc.line(15, y, 195, y);
  y += 10;

  if (isReceipt) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('SOLDE PAYE', 15, y);
    doc.text(formatPricePdf(remaining), 195, y, { align: 'right' });
    y += 6;
    doc.line(15, y, 195, y);
    y += 10;
    doc.setFontSize(14);
    doc.text('TOTAL PAYE', 15, y);
    doc.text(formatPricePdf(order.price), 195, y, { align: 'right' });
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(200, 162, 74);
    doc.text('RESTE A PAYER', 15, y);
    doc.text(formatPricePdf(remaining), 195, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  const footerText = isReceipt
    ? 'Bijouterie Eclat - Recu de livraison'
    : 'Bijouterie Eclat - Bon de commande - Conservez ce document';
  doc.text(footerText, 105, 285, { align: 'center' });

  return doc.output('blob');
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
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  let y = addPdfHeader(doc, 'Recu', sale.id);

  // Infos client
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Nom :', 15, y);
  doc.setFont('helvetica', 'normal');
  doc.text(sale.customer, 40, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Tel :', 15, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(sale.phone || 'Non renseigne', 40, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Date :', 130, y);
  doc.setFont('helvetica', 'normal');
  doc.text(sale.date, 150, y);

  y += 14;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(15, y, 195, y);
  y += 8;

  // En-tête tableau
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Produit', 15, y);
  doc.text('Qte', 120, y);
  doc.text('Prix', 195, y, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  y += 6;

  // Items
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  sale.items.forEach((item) => {
    doc.text(item.name, 15, y);
    doc.text(String(item.qty), 125, y);
    doc.text(formatPricePdf(item.price * item.qty), 195, y, { align: 'right' });
    y += 7;
  });

  y += 2;
  doc.line(15, y, 195, y);
  y += 8;

  // Total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('TOTAL', 15, y);
  doc.text(formatPricePdf(sale.total), 195, y, { align: 'right' });

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text('Bijouterie Eclat - Recu genere electroniquement', 105, 285, { align: 'center' });

  return doc.output('blob');
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