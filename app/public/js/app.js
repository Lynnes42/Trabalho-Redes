const API = '';

/* ========== UTILS ========== */
const $ = id => document.getElementById(id);

function showMsg(id, msg, isError = false) {
  const el = $(id);
  el.textContent = msg;
  el.style.color = isError ? '#ef4444' : '#22c55e';
  setTimeout(() => { el.textContent = ''; }, 4000);
}

/* ========== AUTH MODULE ========== */
const auth = {
  token: localStorage.getItem('token') || '',
  user: localStorage.getItem('user') || '',

  init() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
    if (this.token) dashboard.show();
  },

  switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    $('login-form').classList.toggle('hidden', tabName !== 'login');
    $('register-form').classList.toggle('hidden', tabName !== 'register');
  },

  async register() {
    const body = {
      username: $('reg-user').value,
      password: $('reg-pass').value,
      email: $('reg-email').value
    };
    const r = await fetch(API + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    showMsg('auth-msg', data.error || 'Cadastrado! Faça login.', !!data.error);
  },

  async login() {
    const body = {
      username: $('login-user').value,
      password: $('login-pass').value
    };
    const r = await fetch(API + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (data.error) return showMsg('auth-msg', data.error, true);

    this.token = data.token;
    this.user = body.username;
    localStorage.setItem('token', this.token);
    localStorage.setItem('user', this.user);
    dashboard.show();
  },

  logout() {
    this.token = '';
    this.user = '';
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.reload();
  },

  headers() {
    return { 'Authorization': 'Bearer ' + this.token };
  }
};

/* ========== USERS MODULE ========== */
const users = {
  async load() {
    const r = await fetch(API + '/users', { headers: auth.headers() });
    if (!r.ok) return showMsg('auth-msg', 'Sessão expirada. Faça login novamente.', true);
    const data = await r.json();
    const tbody = $('users-table');
    tbody.innerHTML = data.map(u => `
      <tr>
        <td>${u.id}</td>
        <td>${u.username}</td>
        <td>${u.email || '-'}</td>
        <td>${new Date(u.created_at).toLocaleString('pt-BR')}</td>
        <td class="actions">
          <button class="btn secondary" onclick="users.edit(${u.id})">✏️</button>
          <button class="btn danger" onclick="users.remove(${u.id})">🗑️</button>
        </td>
      </tr>
    `).join('');
  },

  async add() {
    const username = $('new-user').value.trim();
    const email = $('new-email').value.trim();
    if (!username) return alert('Digite um usuário');
    const r = await fetch(API + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: '123456', email })
    });
    const data = await r.json();
    if (data.error) return alert(data.error);
    $('new-user').value = '';
    $('new-email').value = '';
    this.load();
  },

  async remove(id) {
    if (!confirm('Deletar usuário #' + id + '?')) return;
    await fetch(API + '/users/' + id, {
      method: 'DELETE',
      headers: auth.headers()
    });
    this.load();
  },

  async edit(id) {
    const email = prompt('Novo e-mail:');
    if (!email) return;
    await fetch(API + '/users/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth.headers() },
      body: JSON.stringify({ email })
    });
    this.load();
  }
};

/* ========== SIMULATION MODULE ========== */
const simulation = {
  async run(type) {
    const log = $('sim-log');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const start = Date.now();
    entry.innerHTML = `<span class="log-info">→ GET /simulate-${type} ...</span>`;
    log.prepend(entry);

    try {
      const r = await fetch(API + '/simulate-' + type);
      const duration = Date.now() - start;
      const cls = r.ok ? 'log-info' : 'log-error';
      entry.innerHTML = `<span class="${cls}">✓ /simulate-${type} [HTTP ${r.status}] ${duration}ms</span>`;
    } catch (e) {
      entry.innerHTML = `<span class="log-error">✗ /simulate-${type} erro: ${e.message}</span>`;
    }
  }
};

/* ========== LOGS MODULE ========== */
const logs = {
  async refresh() {
    try {
      const r = await fetch(API + '/health');
      const ok = r.ok;
      $('app-log').innerHTML = ok
        ? '<span class="log-info">● Servidor online</span><br><span class="log-warn">Use no terminal: docker compose logs -f app-node</span>'
        : '<span class="log-error">● Servidor respondeu com erro</span>';
    } catch {
      $('app-log').innerHTML = '<span class="log-error">● Servidor offline</span>';
    }
  }
};

/* ========== DASHBOARD ========== */
const dashboard = {
  show() {
    $('auth-section').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
    $('user-display').classList.remove('hidden');
    $('logout-btn').classList.remove('hidden');
    $('username').textContent = auth.user;
    users.load();
  }
};

/* ========== HEALTH CHECK ========== */
async function checkHealth() {
  try {
    const r = await fetch(API + '/health');
    const data = await r.json();
    const dot = $('status-dot');
    const txt = $('status-text');
    if (data.status === 'ok') {
      dot.className = 'dot';
      txt.textContent = 'Online';
    }
  } catch {
    $('status-dot').className = 'dot error';
    $('status-text').textContent = 'Offline';
  }
}

/* ========== INIT ========== */
checkHealth();
auth.init();