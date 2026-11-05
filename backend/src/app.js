const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const env = require('./config/env');
const authRoutes = require('./routes/auth.routes');
const staffRoutes = require('./routes/staff.routes');
const patientRoutes = require('./routes/patient.routes');
const queueRoutes = require('./routes/queue.routes');
const historyRoutes = require('./routes/history.routes');
const shiftRoutes = require('./routes/shift.routes');
const healthRoutes = require('./routes/health.routes');
const intelligenceRoutes = require('./routes/intelligence.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: env.CORS_ORIGIN, methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});
app.set('io', io);

app.disable('x-powered-by');
// Trust forwarded headers only when the deployment explicitly declares a
// trusted reverse-proxy hop count. Never trust a proxy by default.
if (env.TRUST_PROXY_HOPS !== false && env.TRUST_PROXY_HOPS !== 0) {
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
} else {
  app.set('trust proxy', false);
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cache-Control', 'no-store');
  // HSTS is applied once at the HTTPS edge (Caddy), not by this private HTTP service.
  next();
});

app.use(cors({ origin: env.CORS_ORIGIN, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '1mb', strict: true }));

io.on('connection', socket => {
  socket.emit('server_ready', { at: new Date().toISOString() });
});

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/intelligence', intelligenceRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = { app, httpServer, io };
