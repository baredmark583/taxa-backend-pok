import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { setupWebSocket } from './wsHandler';
import { apiRouter } from './api';
import { prisma } from './db';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}));
app.use(express.json());

// REST API routes
app.use('/api', apiRouter);

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

setupWebSocket(wss);

async function main() {
    // Seed default asset config if it doesn't exist
    const assetConfig = await prisma.assetConfig.findUnique({ where: { id: 1 } });
    if (!assetConfig) {
        await prisma.assetConfig.create({
            data: {
                id: 1,
                cardBackUrl: 'https://www.svgrepo.com/show/472548/card-back.svg',
                cardFaceUrlPattern: 'https://cdn.jsdelivr.net/gh/hayeah/playing-cards-assets@master/svg-cards/{rank}_of_{suit}.svg',
                tableBackgroundUrl: 'https://wallpapercave.com/wp/wp1852445.jpg',
            }
        });
        console.log('Default asset configuration seeded.');
    }

    server.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}

main().catch(e => {
    console.error(e);
    // FIX: Cast process to any to bypass incorrect type definition for `process.exit`.
    // This is necessary when the Node.js types are not correctly configured.
    (process as any).exit(1);
});
