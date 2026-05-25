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
  )
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
