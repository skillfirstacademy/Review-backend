import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import './config/passport.js';
import busineRoutes from './routes/businessRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import companyRoutes from './routes/companyRoutes.js';
import userRoutes from './routes/authRoutes.js';
import pool from './config/db.js';
import blogRoutes from './routes/blogRoutes.js';

// Debug environment variables
console.log('🔍 Debug - Environment variables:');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');

const app = express();
const httpServer = createServer(app);

/* ------------------ SOCKET.IO SETUP ------------------ */
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: false,
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

// Make io accessible in routes
app.set('io', io);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);

  socket.on('join-company', (companyId) => {
    socket.join(`company-${companyId}`);
    console.log(`👥 Socket ${socket.id} joined company room: company-${companyId}`);
  });

  socket.on('leave-company', (companyId) => {
    socket.leave(`company-${companyId}`);
    console.log(`👋 Socket ${socket.id} left company room: company-${companyId}`);
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

/* ------------------ MIDDLEWARE ------------------ */
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// app.use(cors({
//   origin: 'http://localhost:5173', // ✅ exact frontend origin
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// }));

app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Only secure in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Make pool available to routes
app.set('db', pool);

/* ------------------ ROUTES ------------------ */
app.get('/', (req, res) => {
  res.send('API is running...');
});

app.use('/api/companies', companyRoutes);
app.use('/auth', userRoutes);
app.use('/api/business', busineRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/blogs', blogRoutes);

/* ------------------ ERROR HANDLING ------------------ */
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

/* ------------------ GRACEFUL SHUTDOWN ------------------ */
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  io.close(() => {
    console.log('🔌 Socket.io closed');
  });
  await pool.end();
  process.exit(0);
});

/* ------------------ SERVER START ------------------ */
const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const isProd = process.env.NODE_ENV === 'production';
const frontendUrl = process.env.FRONTEND_URL || (isProd 
  ? 'https://corereviews.com'
  : 'http://localhost:5173');


httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 Socket.io ready for connections`);
  console.log(`📍 Google OAuth callback: ${BASE_URL}/auth/google/callback`);
  console.log(`📍 Frontend URL: ${frontendUrl || 'http://localhost:5173'}`);
});