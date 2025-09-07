import { Router } from 'express';
import { prisma } from './db';

export const apiRouter = Router();

// Get all users
apiRouter.get('/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Grant a reward to a user
apiRouter.post('/users/:id/reward', async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;

    if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    try {
        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                playMoney: {
                    increment: amount,
                },
            },
        });
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: 'Failed to grant reward' });
    }
});

// Get asset configuration
apiRouter.get('/assets', async (req, res) => {
    try {
        const assets = await prisma.assetConfig.findFirst({ where: { id: 1 } });
        res.json(assets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch assets' });
    }
});

// Update asset configuration
apiRouter.post('/assets', async (req, res) => {
    const { cardBackUrl, cardFaceUrlPattern, tableBackgroundUrl } = req.body;
    try {
        const updatedAssets = await prisma.assetConfig.update({
            where: { id: 1 },
            data: { cardBackUrl, cardFaceUrlPattern, tableBackgroundUrl },
        });
        res.json(updatedAssets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update assets' });
    }
});

// Reset assets to default
apiRouter.post('/assets/reset', async (req, res) => {
     try {
        const defaultAssets = {
            cardBackUrl: 'https://www.svgrepo.com/show/472548/card-back.svg',
            cardFaceUrlPattern: 'https://cdn.jsdelivr.net/gh/hayeah/playing-cards-assets@master/svg-cards/{rank}_of_{suit}.svg',
            tableBackgroundUrl: 'https://wallpapercave.com/wp/wp1852445.jpg',
        };
        const updatedAssets = await prisma.assetConfig.update({
            where: { id: 1 },
            data: defaultAssets,
        });
        res.json(updatedAssets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset assets' });
    }
});
