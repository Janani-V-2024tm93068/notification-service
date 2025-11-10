const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8084;
app.use(bodyParser.json());

// ------------------------------
// PostgreSQL connection
// ------------------------------
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// ------------------------------
// Shared API key for inter-service communication
// ------------------------------
const SERVICE_API_KEY = process.env.SERVICE_API_KEY || 'banking-shared-key';

const verifyServiceAuth = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key !== SERVICE_API_KEY) {
    return res.status(403).json({ error: '❌ Unauthorized service request' });
  }
  next();
};

// ------------------------------
// Health endpoints
// ------------------------------
app.get('/', (req, res) => res.send('✅ Notification Service is running'));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()'); // simple DB check
    res.status(200).json({ status: 'UP', service: 'notification-service', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'DOWN', service: 'notification-service', db: 'disconnected', error: err.message });
  }
});

// ------------------------------
// DB connectivity check (manual)
// ------------------------------
app.get('/db-check', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.send(`✅ DB Connected! Current Time: ${result.rows[0].now}`);
  } catch (err) {
    res.status(500).send('❌ DB connection failed: ' + err.message);
  }
});

// ------------------------------
// Inter-service notification endpoint
// ------------------------------
app.post('/notify', verifyServiceAuth, async (req, res) => {
  const { account_id, message, channel = 'email', status = 'pending' } = req.body;
  if (!account_id || !message) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const result = await pool.query(
      'INSERT INTO notifications (account_id, message, channel, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [account_id, message, channel, status]
    );
    res.status(201).json({ message: '✅ Notification created (inter-service)', notification: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------
// CRUD endpoints
// ------------------------------
app.post('/notifications', async (req, res) => {
  const { account_id, message, channel = 'email', status = 'pending' } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO notifications (account_id, message, channel, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [account_id, message, channel, status]
    );
    res.status(201).json({ message: '✅ Notification created', notification: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/notifications', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM notifications ORDER BY notification_id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/notifications/:id', async (req, res) => {
  const { status } = req.body;
  try {
    const result = await pool.query(
      'UPDATE notifications SET status=$1 WHERE notification_id=$2 RETURNING *',
      [status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: '✅ Notification updated', notification: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/notifications/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM notifications WHERE notification_id=$1 RETURNING *', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: '🗑️ Notification deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------
// Start server
// ------------------------------
app.listen(port, () => console.log(`🚀 Notification Service running on port ${port}`));
