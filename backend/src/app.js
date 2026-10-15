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
const webhookRoutes = require('./routes/webhooks.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: env.CORS_ORIGIN, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }
});
app.set('io', io);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: env.CORS_ORIGIN, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Service-Token'] }));
app.use(express.json({ limit: '1mb' }));

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
app.use('/api/webhooks', webhookRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = { app, httpServer, io };
