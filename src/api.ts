import { Router } from 'express';
import { pool } from './db';

export const apiRouter = Router();

// Get all users
apiRouter.get('/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM "Users" ORDER BY "name"');
        // Convert money fields from string (if they are) to number
        const users = result.rows.map(user => ({
            ...user,
            playMoney: parseFloat(user.playMoney),
            realMoney: parseFloat(user.realMoney),
        }));
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users from database' });
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
        const result = await pool.query(
            'UPDATE "Users" SET "playMoney" = "playMoney" + $1 WHERE id = $2 RETURNING *',
            [amount, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = result.rows[0];
        res.json({
            ...user,
            playMoney: parseFloat(user.playMoney),
            realMoney: parseFloat(user.realMoney),
        });
    } catch (error) {
        console.error(`Error rewarding user ${id}:`, error);
        res.status(500).json({ error: 'Failed to update user in database' });
    }
});

// Update a user's role
apiRouter.post('/users/:id/role', async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    const ADMIN_USER_ID = '7327258482';

    if (id === ADMIN_USER_ID) {
        return res.status(403).json({ error: "Cannot change the admin's role." });
    }

    if (role !== 'PLAYER' && role !== 'MODERATOR') {
        return res.status(400).json({ error: 'Invalid role. Can only set to PLAYER or MODERATOR.' });
    }

    try {
        const result = await pool.query(
            'UPDATE "Users" SET "role" = $1 WHERE id = $2 RETURNING *',
            [role, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = result.rows[0];
        res.json({
            ...user,
            playMoney: parseFloat(user.playMoney),
            realMoney: parseFloat(user.realMoney),
        });
    } catch (error) {
        console.error(`Error updating role for user ${id}:`, error);
        res.status(500).json({ error: 'Failed to update user role in database' });
    }
});


// Get asset configuration
apiRouter.get('/assets', async (req, res) => {
    try {
        const result = await pool.query('SELECT "cardBackUrl", "cardFaceUrlPattern", "tableBackgroundUrl" FROM "AssetConfig" WHERE id = 1');
        if (result.rows.length === 0) {
             return res.status(404).json({ error: 'Asset configuration not found.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching assets:', error);
        res.status(500).json({ error: 'Failed to fetch assets from database' });
    }
});

// Update asset configuration
apiRouter.post('/assets', async (req, res) => {
    const { cardBackUrl, cardFaceUrlPattern, tableBackgroundUrl } = req.body;
    
    try {
        const result = await pool.query(
            `INSERT INTO "AssetConfig" (id, "cardBackUrl", "cardFaceUrlPattern", "tableBackgroundUrl")
             VALUES (1, $1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET
                "cardBackUrl" = EXCLUDED."cardBackUrl",
                "cardFaceUrlPattern" = EXCLUDED."cardFaceUrlPattern",
                "tableBackgroundUrl" = EXCLUDED."tableBackgroundUrl"
             RETURNING "cardBackUrl", "cardFaceUrlPattern", "tableBackgroundUrl"`,
            [cardBackUrl, cardFaceUrlPattern, tableBackgroundUrl]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating assets:', error);
        res.status(500).json({ error: 'Failed to update assets in database' });
    }
});

// Reset assets to default
apiRouter.post('/assets/reset', async (req, res) => {
    const defaultAssets = {
        cardBackUrl: 'https://www.svgrepo.com/show/472548/card-back.svg',
        cardFaceUrlPattern: 'https://cdn.jsdelivr.net/gh/hayeah/playing-cards-assets@master/svg-cards/{rank}_of_{suit}.svg',
        tableBackgroundUrl: 'https://wallpapercave.com/wp/wp1852445.jpg',
    };

    try {
        const result = await pool.query(
            `UPDATE "AssetConfig" SET "cardBackUrl" = $1, "cardFaceUrlPattern" = $2, "tableBackgroundUrl" = $3 WHERE id = 1
             RETURNING "cardBackUrl", "cardFaceUrlPattern", "tableBackgroundUrl"`,
            [defaultAssets.cardBackUrl, defaultAssets.cardFaceUrlPattern, defaultAssets.tableBackgroundUrl]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error resetting assets:', error);
        res.status(500).json({ error: 'Failed to reset assets in database' });
    }
});