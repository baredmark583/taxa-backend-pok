import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { setupWebSocket } from './wsHandler';
import { apiRouter } from './api';
import { initializeDatabase } from './db';

// Initialize the database schema on startup
initializeDatabase().catch(err => {
    console.error("Failed to initialize database:", err);
    // FIX: Cast process to any to avoid TypeScript error on exit.
    (process as any).exit(1);
});

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}));
app.use(express.json());

// REST API routes
// FIX: Wrapping the router in a RequestHandler function to resolve TypeScript overload issues.
app.use('/api', (req, res, next) => apiRouter(req, res, next));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

setupWebSocket(wss);

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
