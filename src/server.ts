
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
// The original CORS setup was too strict for flexible deployment environments.
// Switched to allow all origins, which is acceptable for this prototype and
// resolves issues where the ADMIN_APP_URL environment variable might not match.
app.use(cors());


// Middleware to parse JSON bodies for API routes.
// FIX: Applying express.json() globally to avoid potential type overload conflicts when
// multiple middleware are registered on the same path prefix.
app.use(express.json());

// Mount the API router.
// FIX: Using the router directly is the standard practice in Express and resolves the type overload issue.
app.use('/api', apiRouter);

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

setupWebSocket(wss);

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});