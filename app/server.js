const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const client = require('prom-client');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

// ========== LOGGING SETUP ==========
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, 'app.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// ========== DATABASE ==========
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'database.sqlite'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    unit TEXT,
    current_stock INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    sold_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ========== METRICS ==========
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total de requisições HTTP',
  labelNames: ['method', 'route', 'status']
});
register.registerMetric(httpRequestsTotal);

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
register.registerMetric(httpRequestDuration);

const inventorySalesTotal = new client.Counter({
  name: 'inventory_sales_total',
  help: 'Total de vendas realizadas'
});
register.registerMetric(inventorySalesTotal);

const inventoryPurchasesTotal = new client.Counter({
  name: 'inventory_purchases_total',
  help: 'Total de compras realizadas'
});
register.registerMetric(inventoryPurchasesTotal);

const inventoryLowStockProducts = new client.Gauge({
  name: 'inventory_low_stock_products',
  help: 'Produtos com estoque baixo'
});
register.registerMetric(inventoryLowStockProducts);

// ========== MIDDLEWARES ==========

// Logger JSON (stdout + file)
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = uuidv4();
  req.requestId = requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO',
      message: `${req.method} ${req.path}`,
      method: req.method,
      endpoint: req.path,
      status_code: res.statusCode,
      duration_ms: duration,
      request_id: requestId,
      user_id: req.user?.username || 'anonymous'
    };
    const logLine = JSON.stringify(log) + '\n';
    process.stdout.write(logLine);
    logStream.write(logLine);
  });
  next();
});

// Metrics
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path || req.path;
    httpRequestsTotal.inc({
      method: req.method,
      route: route,
      status: res.statusCode
    });
    end({ method: req.method, route: route });
  });
  next();
});

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, 'public')));

// Rota raiz serve o SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== ROUTES ==========

// POST /register
app.post('/register', (req, res) => {
  const { username, password, email } = req.body;
  const hash = bcrypt.hashSync(password, 10);

  try {
    const stmt = db.prepare('INSERT INTO users (username, password, email) VALUES (?, ?, ?)');
    const result = stmt.run(username, hash, email);
    res.status(201).json({ id: result.lastInsertRowid, username, email });
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

// POST /login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token });
});

// GET /users
app.get('/users', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, email, created_at FROM users').all();
  res.json(users);
});

// PUT /users/:id
app.put('/users/:id', authMiddleware, (req, res) => {
  const { email } = req.body;
  const stmt = db.prepare('UPDATE users SET email = ? WHERE id = ?');
  stmt.run(email, req.params.id);
  const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(req.params.id);
  res.json(user);
});

// DELETE /users/:id
app.delete('/users/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// GET /metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ========== INVENTORY API ==========

function logStructured(data) {
  const log = {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    ...data
  };
  const logLine = JSON.stringify(log) + '\n';
  process.stdout.write(logLine);
  logStream.write(logLine);
}

function updateLowStockMetric() {
  const count = db.prepare('SELECT COUNT(*) as count FROM products WHERE current_stock <= min_stock').get().count;
  inventoryLowStockProducts.set(count);
}

// GET /api/products
app.get('/api/products', authMiddleware, (req, res) => {
  const products = db.prepare('SELECT * FROM products').all();
  res.json(products);
});

// POST /api/products
app.post('/api/products', authMiddleware, (req, res) => {
  const { name, category, unit, current_stock, min_stock } = req.body;

  const stmt = db.prepare(`
    INSERT INTO products (name, category, unit, current_stock, min_stock)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(name, category, unit, current_stock || 0, min_stock || 0);
  const productId = result.lastInsertRowid;

  logStructured({
    operation: 'PRODUCT_CREATED',
    product_id: productId,
    name,
    current_stock,
    message: 'Produto criado com sucesso'
  });

  updateLowStockMetric();

  res.status(201).json({ id: productId, name, category, unit, current_stock, min_stock });
});

// GET /api/products/:id
app.get('/api/products/:id', authMiddleware, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// PUT /api/products/:id
app.put('/api/products/:id', authMiddleware, (req, res) => {
  const { name, category, unit, min_stock } = req.body;

  const stmt = db.prepare(`
    UPDATE products
    SET name = ?, category = ?, unit = ?, min_stock = ?
    WHERE id = ?
  `);

  const result = stmt.run(name, category, unit, min_stock, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });

  logStructured({
    operation: 'PRODUCT_UPDATED',
    product_id: req.params.id,
    message: 'Produto atualizado com sucesso'
  });

  updateLowStockMetric();

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(product);
});

// DELETE /api/products/:id
app.delete('/api/products/:id', authMiddleware, (req, res) => {
  const purchaseCount = db.prepare('SELECT COUNT(*) as count FROM purchases WHERE product_id = ?').get(req.params.id).count;
  const saleCount = db.prepare('SELECT COUNT(*) as count FROM sales WHERE product_id = ?').get(req.params.id).count;

  if (purchaseCount > 0 || saleCount > 0) {
    return res.status(400).json({ error: 'Não é possível excluir produto com movimentações vinculadas' });
  }

  const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });

  logStructured({
    operation: 'PRODUCT_DELETED',
    product_id: req.params.id,
    message: 'Produto excluído com sucesso'
  });

  updateLowStockMetric();

  res.status(204).send();
});

// GET /api/products/:id/history
app.get('/api/products/:id/history', authMiddleware, (req, res) => {
  const purchases = db.prepare(`
    SELECT 'purchase' as type, quantity, purchased_at as date
    FROM purchases WHERE product_id = ?
  `).all(req.params.id);

  const sales = db.prepare(`
    SELECT 'sale' as type, quantity, sold_at as date
    FROM sales WHERE product_id = ?
  `).all(req.params.id);

  const history = [...purchases, ...sales].sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(history);
});

// GET /api/purchases
app.get('/api/purchases', authMiddleware, (req, res) => {
  const { product_id } = req.query;
  let purchases;
  if (product_id) {
    purchases = db.prepare('SELECT p.*, prod.name as product_name FROM purchases p JOIN products prod ON p.product_id = prod.id WHERE p.product_id = ? ORDER BY p.purchased_at DESC').all(product_id);
  } else {
    purchases = db.prepare('SELECT p.*, prod.name as product_name FROM purchases p JOIN products prod ON p.product_id = prod.id ORDER BY p.purchased_at DESC').all();
  }
  res.json(purchases);
});

// POST /api/purchases
app.post('/api/purchases', authMiddleware, (req, res) => {
  const { product_id, quantity } = req.body;

  if (!product_id || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'product_id and quantity are required and quantity must be > 0' });
  }

  const transaction = db.transaction(() => {
    db.prepare('INSERT INTO purchases (product_id, quantity) VALUES (?, ?)').run(product_id, quantity);
    db.prepare('UPDATE products SET current_stock = current_stock + ? WHERE id = ?').run(quantity, product_id);
    return db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product_id).current_stock;
  });

  try {
    const newStock = transaction();
    inventoryPurchasesTotal.inc();
    updateLowStockMetric();

    logStructured({
      operation: 'PURCHASE_CREATED',
      product_id,
      quantity,
      new_stock: newStock,
      message: 'Compra registrada e estoque atualizado'
    });

    res.status(201).json({ product_id, quantity, new_stock: newStock });
  } catch (err) {
    res.status(404).json({ error: 'Produto não encontrado' });
  }
});

// GET /api/sales
app.get('/api/sales', authMiddleware, (req, res) => {
  const { product_id } = req.query;
  let sales;
  if (product_id) {
    sales = db.prepare('SELECT s.*, prod.name as product_name FROM sales s JOIN products prod ON s.product_id = prod.id WHERE s.product_id = ? ORDER BY s.sold_at DESC').all(product_id);
  } else {
    sales = db.prepare('SELECT s.*, prod.name as product_name FROM sales s JOIN products prod ON s.product_id = prod.id ORDER BY s.sold_at DESC').all();
  }
  res.json(sales);
});

// POST /api/sales
app.post('/api/sales', authMiddleware, (req, res) => {
  const { product_id, quantity } = req.body;

  if (!product_id || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'product_id and quantity are required and quantity must be > 0' });
  }

  const product = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

  if (product.current_stock < quantity) {
    logStructured({
      level: 'WARN',
      operation: 'SALE_REJECTED',
      reason: 'INSUFFICIENT_STOCK',
      product_id,
      available: product.current_stock,
      requested: quantity
    });
    return res.status(422).json({ error: 'Estoque insuficiente', available: product.current_stock, requested: quantity });
  }

  const transaction = db.transaction(() => {
    const update = db.prepare('UPDATE products SET current_stock = current_stock - ? WHERE id = ? AND current_stock >= ?').run(quantity, product_id, quantity);
    if (update.changes === 0) throw new Error('INSUFFICIENT_STOCK');
    db.prepare('INSERT INTO sales (product_id, quantity) VALUES (?, ?)').run(product_id, quantity);
    return db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product_id).current_stock;
  });

  try {
    const newStock = transaction();
    inventorySalesTotal.inc();
    updateLowStockMetric();

    logStructured({
      operation: 'SALE_CREATED',
      product_id,
      quantity,
      new_stock: newStock,
      message: 'Venda registrada e estoque atualizado'
    });

    res.status(201).json({ product_id, quantity, new_stock: newStock });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_STOCK') {
      return res.status(422).json({ error: 'Estoque insuficiente', available: product.current_stock, requested: quantity });
    }
    res.status(500).json({ error: 'Erro interno ao processar venda' });
  }
});

// GET /api/inventory/summary
app.get('/api/inventory/summary', authMiddleware, (req, res) => {
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const lowStockProducts = db.prepare('SELECT COUNT(*) as count FROM products WHERE current_stock <= min_stock').get().count;

  const purchasesToday = db.prepare("SELECT SUM(quantity) as total FROM purchases WHERE date(purchased_at) = date('now')").get().total || 0;
  const purchasesMonth = db.prepare("SELECT SUM(quantity) as total FROM purchases WHERE strftime('%Y-%m', purchased_at) = strftime('%Y-%m', 'now')").get().total || 0;

  const salesToday = db.prepare("SELECT SUM(quantity) as total FROM sales WHERE date(sold_at) = date('now')").get().total || 0;
  const salesMonth = db.prepare("SELECT SUM(quantity) as total FROM sales WHERE strftime('%Y-%m', sold_at) = strftime('%Y-%m', 'now')").get().total || 0;

  res.json({
    total_products: totalProducts,
    low_stock_products: lowStockProducts,
    purchases: { today: purchasesToday, month: purchasesMonth },
    sales: { today: salesToday, month: salesMonth }
  });
});

// ========== INCIDENT SIMULATION ROUTES ==========

// Incidente 1: Alta taxa de erro (500 em 50% das chamadas)
app.get('/simulate-error', (req, res) => {
  if (Math.random() > 0.5) {
    return res.status(500).json({ error: 'Simulated server error' });
  }
  res.json({ status: 'ok', note: '50% chance of error' });
});

// Incidente 2: Sobrecarga de CPU (loop pesado)
app.get('/simulate-cpu', (req, res) => {
  const start = Date.now();
  // Loop pesado por ~2 segundos
  while (Date.now() - start < 2000) {
    Math.random() * Math.random();
  }
  res.json({ status: 'cpu spike simulated', duration_ms: Date.now() - start });
});

// Incidente 3: Delay/timeout
app.get('/simulate-delay', async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 5000));
  res.json({ status: 'delayed response', delay_ms: 5000 });
});

// ========== START ==========
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  const startLog = {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    message: `Server running on port ${PORT}`
  };
  const logLine = JSON.stringify(startLog) + '\n';
  process.stdout.write(logLine);
  logStream.write(logLine);
});
