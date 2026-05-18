let state = {
  products: [],
  sales: [],
  customers: [],
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
      <tr><th>Produit</th><th>Catégorie</th><th>Stock</th><th>Prix</th><th>Statut</th></tr>
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
      .map((customer) => `<option value="${customer.email}">${customer.name}</option>`)
      .join('')}
  `;
}

function renderCustomers() {
  const salesByEmail = new Map();
  state.sales.forEach((sale) => {
    const summary = salesByEmail.get(sale.email) || { purchases: 0, total: 0 };
    summary.purchases += 1;
    summary.total += sale.total;
    salesByEmail.set(sale.email, summary);
  });
  document.getElementById('customer-grid').innerHTML = state.customers
    .map(
      (customer) => `
        <article>
          <h3>${customer.name}</h3>
          <p>${customer.email}</p>
          <p>${customer.phone || 'Téléphone non renseigné'}</p>
          <strong>${salesByEmail.get(customer.email)?.purchases || 0} achat(s)</strong>
          <span>${formatPrice(salesByEmail.get(customer.email)?.total || 0)}</span>
        </article>
      `,
    )
    .join('');
}

function renderReceipts() {
  const sale = currentReceipt();
  document.getElementById('dashboard-receipt').innerHTML = receiptMarkup(sale);
  document.getElementById('receipt-preview').innerHTML = receiptMarkup(sale);
}

function renderAll() {
  renderStats();
  renderInventory('inventory-table');
  renderInventory('inventory-table-full');
  renderSales('sales-table');
  renderSales('receipt-sales-table');
  renderProductsSelect();
  renderCustomerSelect();
  renderCustomers();
  renderReceipts();
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
    'BT /F2 11 Tf 50 668 Td (Email :) Tj ET',
    `BT /F1 11 Tf 110 668 Td (${escapePdfText(sale.email)}) Tj ET`,
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
  saleForm.elements.email.value = customer.email;
}

document.addEventListener('click', (event) => {
  const tabButton = event.target.closest('[data-tab]');
  const saleButton = event.target.closest('[data-sale-id]');
  const downloadButton = event.target.closest('[data-download]');
  const printButton = event.target.closest('[data-print]');
  if (tabButton) switchTab(tabButton.dataset.tab);
  if (saleButton) {
    state.selectedReceiptId = saleButton.dataset.saleId;
    renderReceipts();
  }
  if (downloadButton) downloadPdf(state.sales.find((sale) => sale.id === downloadButton.dataset.download));
  if (printButton) window.print();
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
  const form = new FormData(event.currentTarget);
  await api('/api/products', {
    method: 'POST',
    body: JSON.stringify({
      name: form.get('name'),
      category: form.get('category'),
      stock: Number(form.get('stock')),
      price: Number(form.get('price')),
    }),
  });
  event.currentTarget.reset();
  await bootstrap();
});

document.getElementById('customer-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const customer = {
    name: form.get('name'),
    email: form.get('email'),
    phone: form.get('phone'),
  };
  await api('/api/customers', { method: 'POST', body: JSON.stringify(customer) });
  syncCustomerIntoSaleForm(customer);
  event.currentTarget.reset();
  await bootstrap();
});

document.getElementById('customer-select').addEventListener('change', (event) => {
  const customer = state.customers.find((item) => item.email === event.target.value);
  if (customer) syncCustomerIntoSaleForm(customer);
});

document.getElementById('sale-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api('/api/sales', {
    method: 'POST',
    body: JSON.stringify({
      customer: form.get('customer'),
      email: form.get('email'),
      productId: Number(form.get('productId')),
      qty: Number(form.get('qty')),
    }),
  });
  event.currentTarget.reset();
  await bootstrap();
});

bootstrap().catch(() => {
  document.getElementById('login-screen').classList.remove('hidden');
});