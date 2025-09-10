import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { setupWebSocket } from './wsHandler';
import { apiRouter } from './api';
import { initializeDatabase } from './db';

// Wrap startup in an async function to ensure sequential initialization
async function startServer() {
    try {
        // Initialize the database schema and wait for it to complete
        await initializeDatabase();

        const app = express();
        const port = process.env.PORT || 3000;
        const host = '0.0.0.0';

        // Middleware
        app.use(cors());
        // FIX: Moved express.json() to be applied globally before the router and separated app.use calls to resolve a type conflict with middleware signatures.
        app.use(express.json());
        app.use('/api', apiRouter);

        // Add a root route for health checks
        app.get('/', (req, res) => {
          res.status(200).send('Server is healthy');
        });

        const server = http.createServer(app);
        const wss = new WebSocketServer({ server });

        setupWebSocket(wss);

        server.listen(Number(port), host, () => {
            console.log(`Server is running on http://${host}:${port}`);
        });
    } catch (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
}

// Start the server
startServer();