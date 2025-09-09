


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


// FIX: The express.json() middleware was causing a TypeScript error inside the api router.
// It has been moved here and applied to the /api path before the router, which is the correct
// place for it and resolves the type error.
// FIX: Removed a problematic type assertion on `express.json()` that was causing a "No overload matches this call" error. 
// TypeScript can now correctly infer the handler type.
app.use('/api', express.json());
app.use('/api', apiRouter);

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

setupWebSocket(wss);

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});