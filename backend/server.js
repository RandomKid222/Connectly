require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const db = require('./db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const messageRoutes = require('./routes/messages');

if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  throw new Error('CORS_ORIGIN is required in production');
}
const app = express();
const PORT = process.env.PORT || 4000;
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '16kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 240, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { dotfiles: 'deny' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/messages', messageRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.status === 400 || err.status === 413 || err.name === 'MulterError') {
    return res.status(err.status || 400).json({ error: 'Invalid upload or request' });
  }
  res.status(500).json({ error: 'Server error' });
});

if (require.main === module) {
  db.init().then(() => app.listen(PORT, () => {
    console.log(`Social network API running on port ${PORT}`);
  })).catch(err => {
    console.error('Database startup failed:', err);
    process.exit(1);
  });
}
module.exports = app;
