// ShopEase System Controller

let currentRole = 'cashier';
let activeTab = 'dashboard';
let cart = [];
let selectedPaymentMethod = 'Cash';
let products = [];
let customers = [];
let dashboardChart = null;
let currentCustomerIdForProfile = null;



// App Startup Initializer
document.addEventListener('DOMContentLoaded', () => {
    // 1. Navigation setup
    setupTabNavigation();
    
    // 2. Start live clock in header
    updateClock();
    setInterval(updateClock, 1000);
    
    // 3. Initial load of low stock notification count
    fetchLowStockAlertCount();
    
    // 4. Session authentication check
    checkSession();
});

// Live Clock
function updateClock() {
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
        clockEl.textContent = new Date().toLocaleString('en-US', options);
    }
}

// Tab navigation controller
function setupTabNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = item.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update active class on nav links
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update view panels
    document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${tabName}`).classList.add('active');
    
    // Update header title
    const titles = {
        'dashboard': 'Dashboard & Analytics',
        'pos': 'Point of Sale (POS) Checkout',
        'inventory': 'Inventory Stock Management',
        'credit': 'Informal Credit Ledger ("Kuuzia kwa Deni")'
    };
    document.getElementById('current-tab-title').textContent = titles[tabName] || 'ShopEase';
    
    activeTab = tabName;
    
    // Trigger tab-specific data load
    if (tabName === 'dashboard') {
        loadDashboardData();
    } else if (tabName === 'pos') {
        loadPOSData();
    } else if (tabName === 'inventory') {
        loadInventoryData();
    } else if (tabName === 'credit') {
        loadCreditData();
    }
}

// Session authentication checks
function checkSession() {
    const session = JSON.parse(sessionStorage.getItem('shopease_session'));
    const loginOverlay = document.getElementById('login-overlay');
    if (session) {
        if (loginOverlay) loginOverlay.style.display = 'none';
        applyUserRoleSession(session);
    } else {
        if (loginOverlay) loginOverlay.style.display = 'flex';
    }
}

// Apply role based UI views
function applyUserRoleSession(session) {
    currentRole = session.role;
    
    const headerDisplay = document.getElementById('header-user-display');
    if (headerDisplay) {
        headerDisplay.textContent = `${session.role.toUpperCase()} (${session.username})`;
    }
    
    const navDashboard = document.getElementById('nav-dashboard');
    const navPOS = document.getElementById('nav-pos');
    const navInventory = document.getElementById('nav-inventory');
    const navCredit = document.getElementById('nav-credit');
    
    if (session.role === 'cashier') {
        // Cashiers only see POS Checkout
        if (navDashboard) navDashboard.style.display = 'none';
        if (navInventory) navInventory.style.display = 'none';
        if (navCredit) navCredit.style.display = 'none';
        
        document.body.classList.add('role-cashier');
        document.body.classList.remove('role-admin');
        
        document.querySelectorAll('.admin-only').forEach(el => {
            if (el.tagName === 'TH' || el.tagName === 'TD' || el.classList.contains('btn') || el.classList.contains('role-restricted-btn')) {
                el.style.display = 'none';
            } else {
                el.classList.add('obfuscated');
            }
        });
        
        switchTab('pos');
    } else {
        // Admins see all views
        if (navDashboard) navDashboard.style.display = '';
        if (navInventory) navInventory.style.display = '';
        if (navCredit) navCredit.style.display = '';
        
        document.body.classList.add('role-admin');
        document.body.classList.remove('role-cashier');
        
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = '';
            el.classList.remove('obfuscated');
        });
        
        switchTab('dashboard');
    }
}

function submitLogin() {
    const usernameEl = document.getElementById('login-username');
    const passwordEl = document.getElementById('login-password');
    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    
    if (!username || !password) {
        showToast("Username and password are required.", "warning");
        return;
    }
    
    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, "error");
            return;
        }
        
        const session = { username: data.username, role: data.role };
        sessionStorage.setItem('shopease_session', JSON.stringify(session));
        
        const loginOverlay = document.getElementById('login-overlay');
        if (loginOverlay) loginOverlay.style.display = 'none';
        
        applyUserRoleSession(session);
        showToast(`Signed in successfully as ${data.role.toUpperCase()}`, "success");
        
        usernameEl.value = '';
        passwordEl.value = '';
    })
    .catch(err => {
        console.error(err);
        showToast("Error connecting to login server.", "error");
    });
}

function logout() {
    sessionStorage.removeItem('shopease_session');
    const loginOverlay = document.getElementById('login-overlay');
    if (loginOverlay) loginOverlay.style.display = 'flex';
    
    showToast("Signed out successfully.", "info");
}

// Global Toast Notifications
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : type === 'warning' ? 'warning' : ''}`;
    
    let iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-xmark';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';
    if (type === 'info') iconClass = 'fa-circle-info';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass} toast-icon"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}



// Fetch low stock count for header notification badge
function fetchLowStockAlertCount() {
    fetch('/api/dashboard?role=cashier')
        .then(res => res.json())
        .then(data => {
            const badge = document.getElementById('low-stock-badge');
            badge.textContent = data.low_stock_count;
            if (data.low_stock_count > 0) {
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        });
}

function toggleNotificationDropdown() {
    fetch('/api/dashboard?role=cashier')
        .then(res => res.json())
        .then(data => {
            if (data.low_stock_count === 0) {
                showToast("All stock levels are healthy. No notifications.", "info");
                return;
            }
            const list = data.low_stock_list.map(p => `${p.name} (${p.stock_quantity} left)`).join(', ');
            showToast(`Low Stock Alert: ${list}`, 'warning');
        });
}


// ==========================================
// 1. DASHBOARD CONTROLLER
// ==========================================
function loadDashboardData() {
    fetch(`/api/dashboard?role=${currentRole}`)
        .then(res => res.json())
        .then(data => {
            // Update stats
            document.getElementById('stat-revenue').textContent = `KSh ${data.revenue.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('stat-debt').textContent = `KSh ${data.outstanding_debt.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            
            if (currentRole === 'admin') {
                document.getElementById('stat-cost').textContent = `KSh ${data.cost.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
                document.getElementById('stat-profit').textContent = `KSh ${data.profit.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
                document.getElementById('stat-cost').parentElement.classList.remove('obfuscated');
                document.getElementById('stat-profit').parentElement.classList.remove('obfuscated');
            } else {
                document.getElementById('stat-cost').textContent = `KSh *****`;
                document.getElementById('stat-profit').textContent = `KSh *****`;
                document.getElementById('stat-cost').parentElement.classList.add('obfuscated');
                document.getElementById('stat-profit').parentElement.classList.add('obfuscated');
            }
            
            // Update Low Stock Warning Box
            document.getElementById('low-stock-count-label').textContent = `${data.low_stock_count} Items`;
            const lowStockBody = document.getElementById('low-stock-table-body');
            lowStockBody.innerHTML = '';
            
            if (data.low_stock_list.length === 0) {
                lowStockBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-dim);">No stock alerts!</td></tr>`;
            } else {
                data.low_stock_list.forEach(p => {
                    lowStockBody.innerHTML += `
                        <tr>
                            <td><strong>${p.name}</strong></td>
                            <td class="stock-warning-label">${p.stock_quantity}</td>
                            <td>${p.threshold}</td>
                        </tr>
                    `;
                });
            }
            
            // Update Recent Sales
            const salesBody = document.getElementById('recent-sales-table-body');
            salesBody.innerHTML = '';
            
            if (data.recent_sales.length === 0) {
                salesBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-dim);">No transactions recorded.</td></tr>`;
            } else {
                data.recent_sales.forEach(s => {
                    salesBody.innerHTML += `
                        <tr>
                            <td>#${s.sale_id}</td>
                            <td>${s.timestamp}</td>
                            <td>${s.cashier_name}</td>
                            <td>${s.item_count} items</td>
                            <td><span class="badge info">${s.payment_method}</span></td>
                            <td><strong>KSh ${s.total_amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
                        </tr>
                    `;
                });
            }
            
            // Build / Update Chart
            buildDashboardChart(data.chart);
            
            // Re-sync alert count badge in header
            const badge = document.getElementById('low-stock-badge');
            badge.textContent = data.low_stock_count;
            badge.style.display = data.low_stock_count > 0 ? 'flex' : 'none';
        })
        .catch(err => {
            console.error(err);
            showToast("Failed to load dashboard statistics.", "error");
        });
}

function buildDashboardChart(chartData) {
    const ctx = document.getElementById('dashboardChart').getContext('2d');
    
    if (dashboardChart) {
        dashboardChart.destroy();
    }
    
    const datasets = [
        {
            label: 'Sales Revenue (KSh)',
            data: chartData.sales,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 3,
            tension: 0.3,
            fill: true
        }
    ];
    
    // Admin role adds net profit line
    if (currentRole === 'admin' && chartData.profit) {
        datasets.push({
            label: 'Net Margin Profit (KSh)',
            data: chartData.profit,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.05)',
            borderWidth: 3,
            tension: 0.3,
            fill: true
        });
    }
    
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';
    
    dashboardChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 15,
                        font: { size: 11, weight: '600' }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { font: { size: 10 } }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}


// ==========================================
// 2. WEB POS CONTROLLER
// ==========================================
function loadPOSData() {
    // 1. Fetch products
    fetch('/api/products')
        .then(res => res.json())
        .then(data => {
            products = data;
            renderPOSCatalog();
        });
        
    // 2. Fetch customers to populate POS Credit dropdown
    fetch('/api/customers')
        .then(res => res.json())
        .then(data => {
            customers = data;
            const dropdown = document.getElementById('pos-customer-select');
            dropdown.innerHTML = `<option value="">-- Choose Credit Customer --</option>`;
            data.forEach(c => {
                dropdown.innerHTML += `<option value="${c.customer_id}">${c.name} (Debt: KSh ${c.current_debt.toFixed(0)} / Max: ${c.max_limit.toFixed(0)})</option>`;
            });
        });
}

function renderPOSCatalog() {
    const grid = document.getElementById('pos-catalog-grid');
    grid.innerHTML = '';
    
    if (products.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text-dim);">No products registered.</div>`;
        return;
    }
    
    products.forEach(p => {
        // Stock warning
        const isLow = p.stock_quantity <= p.threshold;
        const stockLabel = isLow 
            ? `<span class="stock-warning-label"><i class="fa-solid fa-triangle-exclamation"></i> Low: ${p.stock_quantity}</span>`
            : `<span>Stock: ${p.stock_quantity}</span>`;
            
        grid.innerHTML += `
            <div class="product-card" onclick="addToCart(${p.product_id})" data-name="${p.name.toLowerCase()}" data-desc="${p.description.toLowerCase()}">
                <span class="product-card-name">${p.name}</span>
                <span class="product-card-price">KSh ${p.retail_price.toFixed(2)}</span>
                <div class="product-card-stock">
                    ${stockLabel}
                    <span style="font-size:0.7rem; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:10px;">ID: ${p.product_id}</span>
                </div>
            </div>
        `;
    });
}

function filterPOSCatalog() {
    const query = document.getElementById('pos-search-input').value.toLowerCase();
    const cards = document.querySelectorAll('.product-card');
    
    cards.forEach(card => {
        const name = card.getAttribute('data-name');
        const desc = card.getAttribute('data-desc');
        
        if (name.includes(query) || desc.includes(query)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}

function addToCart(prodId) {
    const prod = products.find(p => p.product_id === prodId);
    if (!prod) return;
    
    // Check if stock is 0
    if (prod.stock_quantity <= 0) {
        showToast(`Cannot sell '${prod.name}'. Out of stock!`, 'error');
        return;
    }
    
    const existing = cart.find(item => item.product_id === prodId);
    if (existing) {
        if (existing.quantity >= prod.stock_quantity) {
            showToast(`Cannot add more. Limit of ${prod.stock_quantity} reached.`, 'warning');
            return;
        }
        existing.quantity += 1;
    } else {
        cart.push({
            product_id: prod.product_id,
            name: prod.name,
            retail_price: prod.retail_price,
            quantity: 1
        });
    }
    
    renderCart();
    showToast(`Added ${prod.name} to cart.`, 'success');
}

function updateCartQty(prodId, delta) {
    const item = cart.find(c => c.product_id === prodId);
    if (!item) return;
    
    const prod = products.find(p => p.product_id === prodId);
    
    if (delta > 0) {
        if (item.quantity >= prod.stock_quantity) {
            showToast(`Cannot exceed physical stock of ${prod.stock_quantity}.`, 'warning');
            return;
        }
        item.quantity += 1;
    } else {
        item.quantity -= 1;
        if (item.quantity <= 0) {
            cart = cart.filter(c => c.product_id !== prodId);
        }
    }
    renderCart();
}

function removeFromCart(prodId) {
    cart = cart.filter(c => c.product_id !== prodId);
    renderCart();
    showToast("Product removed from cart.", "info");
}

function clearCart() {
    if (cart.length === 0) return;
    cart = [];
    renderCart();
    showToast("Cart cleared.", "info");
}

function renderCart() {
    const list = document.getElementById('cart-items-list');
    const checkBtn = document.getElementById('checkout-submit-btn');
    
    if (cart.length === 0) {
        list.innerHTML = `
            <div class="empty-cart-message">
                <i class="fa-solid fa-basket-shopping"></i>
                <span>Your cart is empty. Click catalog items to add.</span>
            </div>
        `;
        document.getElementById('cart-summary-qty').textContent = "0 items";
        document.getElementById('cart-summary-total').textContent = "KSh 0.00";
        checkBtn.disabled = true;
        return;
    }
    
    list.innerHTML = '';
    let totalQty = 0;
    let totalAmount = 0.0;
    
    cart.forEach(item => {
        totalQty += item.quantity;
        totalAmount += item.retail_price * item.quantity;
        
        list.innerHTML += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <span class="cart-item-name">${item.name}</span>
                    <span class="cart-item-price-sum">KSh ${(item.retail_price * item.quantity).toFixed(2)}</span>
                </div>
                <div class="cart-qty-controls">
                    <button class="cart-qty-btn" onclick="updateCartQty(${item.product_id}, -1)"><i class="fa-solid fa-minus"></i></button>
                    <span class="cart-qty-val">${item.quantity}</span>
                    <button class="cart-qty-btn" onclick="updateCartQty(${item.product_id}, 1)"><i class="fa-solid fa-plus"></i></button>
                </div>
                <button class="cart-remove-btn" onclick="removeFromCart(${item.product_id})"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
    });
    
    document.getElementById('cart-summary-qty').textContent = `${totalQty} items`;
    document.getElementById('cart-summary-total').textContent = `KSh ${totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    checkBtn.disabled = false;
}

function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    
    // Toggle active state
    document.querySelectorAll('.pay-method-card').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-method="${method}"]`).classList.add('active');
    
    // Show/Hide Customer dropdown
    const customerGroup = document.getElementById('pos-customer-group');
    if (method === 'Credit') {
        customerGroup.style.display = 'flex';
    } else {
        customerGroup.style.display = 'none';
    }
}

function submitCheckout() {
    if (cart.length === 0) return;
    
    const customerSelect = document.getElementById('pos-customer-select');
    const customerId = customerSelect.value;
    
    if (selectedPaymentMethod === 'Credit' && !customerId) {
        showToast("Please link a customer for credit sales.", "warning");
        return;
    }
    
    const checkoutData = {
        payment_method: selectedPaymentMethod,
        customer_id: selectedPaymentMethod === 'Credit' ? customerId : null,
        items: cart.map(c => ({ product_id: c.product_id, quantity: c.quantity })),
        role: currentRole
    };
    
    // Disable checkout button to prevent double-clicks
    const checkBtn = document.getElementById('checkout-submit-btn');
    checkBtn.disabled = true;
    checkBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;
    
    fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutData)
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
            checkBtn.disabled = false;
            checkBtn.innerHTML = `<i class="fa-solid fa-file-invoice-dollar"></i> Complete POS Checkout`;
            return;
        }
        
        // POS Checkout success!
        showToast(data.message, 'success');
        
        // Print Receipt in modal
        renderReceipt(data.sale_id, data.timestamp, data.total);
        
        // Reset Cart and Form states
        cart = [];
        renderCart();
        loadPOSData(); // Reload inventory counts
        
        checkBtn.disabled = true;
        checkBtn.innerHTML = `<i class="fa-solid fa-file-invoice-dollar"></i> Complete POS Checkout`;
    })
    .catch(err => {
        console.error(err);
        showToast("Server connection error during checkout.", "error");
        checkBtn.disabled = false;
        checkBtn.innerHTML = `<i class="fa-solid fa-file-invoice-dollar"></i> Complete POS Checkout`;
    });
}

function renderReceipt(saleId, timestamp, total) {
    const container = document.getElementById('receipt-box-content');
    
    let itemsRows = '';
    cart.forEach(item => {
        itemsRows += `
            <div class="receipt-item-row">
                <span>${item.name}</span>
                <span>${item.quantity}</span>
                <span>${(item.retail_price * item.quantity).toFixed(0)}</span>
            </div>
        `;
    });
    
    let customerSection = '';
    if (selectedPaymentMethod === 'Credit') {
        const customerSelect = document.getElementById('pos-customer-select');
        const customerName = customerSelect.options[customerSelect.selectedIndex].text.split(' (')[0];
        customerSection = `
            <div class="receipt-divider"></div>
            <div class="receipt-row">
                <span>CREDIT DEBTOR:</span>
                <span>${customerName}</span>
            </div>
        `;
    }
    
    container.innerHTML = `
        <h4 class="receipt-center" style="font-weight: 800; font-size: 1rem; color: #000;">SHOPEASE MSME STORE</h4>
        <p class="receipt-center">Roysambu, Nairobi, Kenya</p>
        <p class="receipt-center">Phone: +254 712 345678</p>
        <div class="receipt-divider"></div>
        <div class="receipt-row">
            <span>TX ID: #${saleId}</span>
            <span>DATE: ${timestamp.split(' ')[0]}</span>
        </div>
        <div class="receipt-row">
            <span>Cashier: ${currentRole.toUpperCase()}</span>
            <span>TIME: ${timestamp.split(' ')[1]}</span>
        </div>
        <div class="receipt-divider"></div>
        <div class="receipt-item-row" style="font-weight: 700; color: #000;">
            <span>Item Description</span>
            <span>Qty</span>
            <span>KSh</span>
        </div>
        <div class="receipt-divider"></div>
        ${itemsRows}
        <div class="receipt-divider"></div>
        <div class="receipt-row" style="font-weight: 700; font-size: 0.95rem; color: #000;">
            <span>TOTAL VALUE:</span>
            <span>KSh ${total.toLocaleString('en', {minimumFractionDigits: 2})}</span>
        </div>
        <div class="receipt-row">
            <span>PAY TYPE:</span>
            <span>${selectedPaymentMethod.toUpperCase()}</span>
        </div>
        ${customerSection}
        <div class="receipt-divider"></div>
        <p class="receipt-center" style="font-size: 0.75rem; margin-top: 0.5rem;">Thank you for shopping with us!</p>
        <p class="receipt-center" style="font-size: 0.65rem; color: #64748b;">Powered by ShopEase Cloud POS</p>
    `;
    
    openModal('receipt-modal');
}


// ==========================================
// 3. INVENTORY CONTROLLER
// ==========================================
function loadInventoryData() {
    fetch('/api/products')
        .then(res => res.json())
        .then(data => {
            products = data;
            const body = document.getElementById('inventory-table-body');
            body.innerHTML = '';
            
            data.forEach(p => {
                const isLow = p.stock_quantity <= p.threshold;
                const statusBadge = isLow
                    ? `<span class="badge danger"><i class="fa-solid fa-circle-down"></i> Low Stock</span>`
                    : `<span class="badge success"><i class="fa-solid fa-circle-check"></i> Good</span>`;
                
                // Obfuscate wholesale cost price
                const costDisplay = currentRole === 'admin'
                    ? `KSh ${p.cost_price.toFixed(2)}`
                    : `<span class="obfuscated">***</span>`;
                
                const actionButton = currentRole === 'admin'
                    ? `<button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="openEditProductModal(${p.product_id})"><i class="fa-solid fa-pen-to-square"></i> Edit</button>`
                    : ``;
                
                // Conditionally display cells depending on admin role
                const actionCell = currentRole === 'admin' ? `<td>${actionButton}</td>` : ``;
                const costCell = currentRole === 'admin' ? `<td>${costDisplay}</td>` : ``;
                
                body.innerHTML += `
                    <tr class="product-row" data-name="${p.name.toLowerCase()}" data-id="${p.product_id}">
                        <td><strong>#${p.product_id}</strong></td>
                        <td>${p.name}</td>
                        <td style="color:var(--text-muted);">${p.description || '-'}</td>
                        <td><strong>KSh ${p.retail_price.toFixed(2)}</strong></td>
                        ${currentRole === 'admin' ? `<td>${costDisplay}</td>` : ''}
                        <td class="${isLow ? 'stock-warning-label' : ''}"><strong>${p.stock_quantity} units</strong></td>
                        <td>${p.threshold} units</td>
                        <td>${statusBadge}</td>
                        ${currentRole === 'admin' ? `<td>${actionButton}</td>` : ''}
                    </tr>
                `;
            });
        })
        .catch(err => {
            console.error(err);
            showToast("Failed to fetch product inventory list.", "error");
        });
}

function filterInventoryTable() {
    const query = document.getElementById('inventory-search-input').value.toLowerCase();
    const rows = document.querySelectorAll('.product-row');
    
    rows.forEach(row => {
        const name = row.getAttribute('data-name');
        const id = row.getAttribute('data-id');
        
        if (name.includes(query) || id.includes(query)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function openEditProductModal(id) {
    const p = products.find(prod => prod.product_id === id);
    if (!p) return;
    
    document.getElementById('edit-p-id').value = p.product_id;
    document.getElementById('edit-p-name').value = p.name;
    document.getElementById('edit-p-desc').value = p.description || '';
    document.getElementById('edit-p-retail').value = p.retail_price;
    document.getElementById('edit-p-cost').value = p.cost_price;
    document.getElementById('edit-p-stock').value = p.stock_quantity;
    document.getElementById('edit-p-threshold').value = p.threshold;
    
    openModal('edit-product-modal');
}

function submitAddProduct() {
    const newProduct = {
        name: document.getElementById('add-p-name').value,
        description: document.getElementById('add-p-desc').value,
        retail_price: parseFloat(document.getElementById('add-p-retail').value),
        cost_price: parseFloat(document.getElementById('add-p-cost').value),
        stock_quantity: parseInt(document.getElementById('add-p-stock').value),
        threshold: parseInt(document.getElementById('add-p-threshold').value)
    };
    
    fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
            return;
        }
        showToast(data.message, 'success');
        closeModal('add-product-modal');
        document.getElementById('add-product-form').reset();
        loadInventoryData();
        fetchLowStockAlertCount(); // update badge
    })
    .catch(err => {
        console.error(err);
        showToast("Error adding product.", "error");
    });
}

function submitEditProduct() {
    const prodId = document.getElementById('edit-p-id').value;
    const updatedProduct = {
        name: document.getElementById('edit-p-name').value,
        description: document.getElementById('edit-p-desc').value,
        retail_price: parseFloat(document.getElementById('edit-p-retail').value),
        cost_price: parseFloat(document.getElementById('edit-p-cost').value),
        stock_quantity: parseInt(document.getElementById('edit-p-stock').value),
        threshold: parseInt(document.getElementById('edit-p-threshold').value)
    };
    
    fetch(`/api/products/${prodId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProduct)
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
            return;
        }
        showToast(data.message, 'success');
        closeModal('edit-product-modal');
        loadInventoryData();
        fetchLowStockAlertCount(); // update badge
    })
    .catch(err => {
        console.error(err);
        showToast("Error saving product changes.", "error");
    });
}

function submitDeleteProduct() {
    const prodId = document.getElementById('edit-p-id').value;
    const pName = document.getElementById('edit-p-name').value;
    
    if (!confirm(`Are you sure you want to delete '${pName}'?`)) return;
    
    fetch(`/api/products/${prodId}`, {
        method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
            return;
        }
        showToast(data.message, 'success');
        closeModal('edit-product-modal');
        loadInventoryData();
        fetchLowStockAlertCount(); // update badge
    })
    .catch(err => {
        console.error(err);
        showToast("Error deleting product.", "error");
    });
}


// ==========================================
// 4. CREDIT LEDGER CONTROLLER
// ==========================================
function loadCreditData() {
    fetch('/api/customers')
        .then(res => res.json())
        .then(data => {
            customers = data;
            const body = document.getElementById('credit-table-body');
            body.innerHTML = '';
            
            data.forEach(c => {
                const limitUsage = (c.current_debt / c.max_limit) * 100;
                let riskBadge = `<span class="badge success">Safe</span>`;
                if (limitUsage > 85) {
                    riskBadge = `<span class="badge danger">Limit Warning</span>`;
                } else if (limitUsage > 50) {
                    riskBadge = `<span class="badge warning">Moderate Risk</span>`;
                }
                
                body.innerHTML += `
                    <tr>
                        <td><strong>#${c.customer_id}</strong></td>
                        <td><strong>${c.name}</strong></td>
                        <td>${c.phone}</td>
                        <td>KSh ${c.max_limit.toLocaleString('en')}</td>
                        <td class="${limitUsage > 85 ? 'stock-warning-label' : ''}"><strong>KSh ${c.current_debt.toLocaleString('en')}</strong></td>
                        <td>${riskBadge}</td>
                        <td>
                            <button class="btn btn-primary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="openCustomerProfileModal(${c.customer_id})">
                                <i class="fa-solid fa-address-card"></i> View Profile & Repay
                            </button>
                        </td>
                    </tr>
                `;
            });
        })
        .catch(err => {
            console.error(err);
            showToast("Failed to fetch customer credit records.", "error");
        });
}

function submitAddCustomer() {
    const newCust = {
        name: document.getElementById('add-c-name').value,
        phone: document.getElementById('add-c-phone').value,
        max_limit: parseFloat(document.getElementById('add-c-limit').value)
    };
    
    fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCust)
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
            return;
        }
        showToast(data.message, 'success');
        closeModal('add-customer-modal');
        document.getElementById('add-customer-form').reset();
        loadCreditData();
    })
    .catch(err => {
        console.error(err);
        showToast("Error registering customer.", "error");
    });
}

function openCustomerProfileModal(id) {
    currentCustomerIdForProfile = id;
    const c = customers.find(cust => cust.customer_id === id);
    if (!c) return;
    
    document.getElementById('cust-profile-name').textContent = `${c.name} Profile`;
    document.getElementById('cust-profile-debt').textContent = `KSh ${c.current_debt.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('cust-profile-limit').textContent = `KSh ${c.max_limit.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('repay-amount-input').value = '';
    
    // Build history rows
    const historyBody = document.getElementById('cust-profile-history-body');
    historyBody.innerHTML = '';
    
    if (!c.history || c.history.length === 0) {
        historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-dim);">No credit records logged.</td></tr>`;
    } else {
        c.history.forEach(log => {
            let typeBadge = '';
            let amountDisplay = '';
            
            if (log.status === 'repayment') {
                typeBadge = `<span class="badge success">Repayment</span>`;
                // Log amount is negative, show as positive value in ledger history
                amountDisplay = `<span style="color:var(--success);">- KSh ${Math.abs(log.amount_due).toFixed(2)}</span>`;
            } else {
                typeBadge = `<span class="badge danger">Credit Purchase</span>`;
                amountDisplay = `<span style="color:var(--danger);">+ KSh ${log.amount_due.toFixed(2)}</span>`;
            }
            
            historyBody.innerHTML += `
                <tr>
                    <td>${log.date}</td>
                    <td>${log.sale_id ? 'Sale #' + log.sale_id : 'Repayment'}</td>
                    <td>${typeBadge}</td>
                    <td><strong>${amountDisplay}</strong></td>
                    <td><span style="font-size:0.75rem; text-transform:uppercase; font-weight:700;">${log.status.replace('_', ' ')}</span></td>
                </tr>
            `;
        });
    }
    
    openModal('customer-profile-modal');
}

function submitRepayment() {
    const amount = parseFloat(document.getElementById('repay-amount-input').value);
    if (isNaN(amount) || amount <= 0) {
        showToast("Please enter a valid repayment amount.", "warning");
        return;
    }
    
    const payload = {
        customer_id: currentCustomerIdForProfile,
        amount: amount
    };
    
    fetch('/api/repayment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
            return;
        }
        showToast(data.message, 'success');
        
        // Refresh customer list state, then reload modal profile
        fetch('/api/customers')
            .then(res => res.json())
            .then(data => {
                customers = data;
                // Re-open/refresh profile modal content
                openCustomerProfileModal(currentCustomerIdForProfile);
                loadCreditData(); // Refresh main ledger view table
            });
    })
    .catch(err => {
        console.error(err);
        showToast("Repayment logging failed on server.", "error");
    });
}





// ==========================================
// GLOBAL UI HELPERS
// ==========================================
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}
