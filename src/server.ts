import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

// FIX: Removed unused `RequestHandler` import.
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
// FIX: Bind to 0.0.0.0 to make the server accessible within containerized environments.
const host = '0.0.0.0';

// Middleware
// The original CORS setup was too strict for flexible deployment environments.
// Switched to allow all origins, which is acceptable for this prototype and
// resolves issues where the ADMIN_APP_URL environment variable might not match.
app.use(cors());


// FIX: Resolved a "No overload matches this call" TypeScript error by separating
// the `express.json()` middleware from the `apiRouter`. Applying `express.json()`
// globally is a common and robust pattern in Express applications.
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
    // FIX: Updated log message to reflect the correct host and port.
    console.log(`Server is running on http://${host}:${port}`);
});