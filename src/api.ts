import { Router } from 'express';
import { pool } from './db';
import { Rank, Suit } from './types';
import { defaultIcons } from './db';

// FIX: Use named import for Router to resolve a type inference error in server.ts.
export const apiRouter = Router();

// Get all users
// FIX: Removed /api prefix. It is now handled in server.ts
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
// FIX: Removed /api prefix. It is now handled in server.ts
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
// FIX: Removed /api prefix. It is now handled in server.ts
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
// FIX: Removed /api prefix. It is now handled in server.ts
apiRouter.get('/assets', async (req, res) => {
    try {
        const configRes = await pool.query('SELECT * FROM "AssetConfig" WHERE id = 1');
        if (configRes.rows.length === 0) {
             return res.status(404).json({ error: 'Asset configuration not found.' });
        }
        
        const cardsRes = await pool.query('SELECT suit, rank, "imageUrl" FROM "CardAssets"');
        const cardFaces = cardsRes.rows.reduce((acc, row) => {
            const { suit, rank, imageUrl } = row;
            if (!acc[suit]) acc[suit] = {};
            acc[suit][rank] = imageUrl;
            return acc;
        }, {});

        const symbolsRes = await pool.query('SELECT id, name, "imageUrl", payout, weight FROM "SlotSymbols" ORDER BY id');

        res.json({
            ...configRes.rows[0],
            cardFaces,
            slotSymbols: symbolsRes.rows,
        });

    } catch (error) {
        console.error('Error fetching assets:', error);
        res.status(500).json({ error: 'Failed to fetch assets from database' });
    }
});

// Update asset configuration
// FIX: Removed /api prefix. It is now handled in server.ts
apiRouter.post('/assets', async (req, res) => {
    const { 
        cardBackUrl, tableBackgroundUrl, godModePassword, cardFaces, slotSymbols,
        ...icons 
    } = req.body;
    
    const client = await pool.connect();
    
    // Prepare icon fields for the query
    const iconFields = Object.keys(defaultIcons);
    const iconUpdateSet = iconFields.map((field, i) => `"${field}" = $${i + 4}`).join(', ');
    const iconValues = iconFields.map(field => icons[field]);

    try {
        await client.query('BEGIN');

        // 1. Update general config including icons
        await client.query(
            `UPDATE "AssetConfig" SET "cardBackUrl" = $1, "tableBackgroundUrl" = $2, "godModePassword" = $3, ${iconUpdateSet} WHERE id = 1`,
            [cardBackUrl, tableBackgroundUrl, godModePassword, ...iconValues]
        );

        // 2. Update card faces (clear and re-insert)
        await client.query('TRUNCATE TABLE "CardAssets"');
        for (const suit of Object.values(Suit)) {
            for (const rank of Object.values(Rank)) {
                const imageUrl = cardFaces[suit]?.[rank];
                if (imageUrl) {
                     await client.query(
                        'INSERT INTO "CardAssets" (suit, rank, "imageUrl") VALUES ($1, $2, $3)',
                        [suit, rank, imageUrl]
                    );
                }
            }
        }

        // 3. Update slot symbols (clear and re-insert)
        await client.query('TRUNCATE TABLE "SlotSymbols" RESTART IDENTITY');
        for (const symbol of slotSymbols) {
             await client.query(
                'INSERT INTO "SlotSymbols" (name, "imageUrl", payout, weight) VALUES ($1, $2, $3, $4)',
                [symbol.name, symbol.imageUrl, symbol.payout, symbol.weight]
            );
        }

        await client.query('COMMIT');
        
        // Fetch the newly saved data to return to the client
        const newAssetsRes = await client.query('SELECT * FROM "AssetConfig" WHERE id=1');
        const newCardsRes = await client.query('SELECT * FROM "CardAssets"');
        const newSymbolsRes = await client.query('SELECT * FROM "SlotSymbols" ORDER BY id');

        const newCardFaces = newCardsRes.rows.reduce((acc, row) => {
            if (!acc[row.suit]) acc[row.suit] = {};
            acc[row.suit][row.rank] = row.imageUrl;
            return acc;
        }, {});

        res.json({
            ...newAssetsRes.rows[0],
            cardFaces: newCardFaces,
            slotSymbols: newSymbolsRes.rows,
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating assets:', error);
        res.status(500).json({ error: 'Failed to update assets in database' });
    } finally {
        client.release();
    }
});

// Reset assets to default
// FIX: Removed /api prefix. It is now handled in server.ts
apiRouter.post('/assets/reset', async (req, res) => {
    const defaultPattern = 'https://cdn.jsdelivr.net/gh/hayeah/playing-cards-assets@master/svg-cards/{rank}_of_{suit}.svg';
    const suitNameMap = { HEARTS: 'hearts', DIAMONDS: 'diamonds', CLUBS: 'clubs', SPADES: 'spades' };
    const rankNameMap = { 'A': 'ace', 'K': 'king', 'Q': 'queen', 'J': 'jack', 'T': '10', '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2' };
    const defaultSlotSymbols = [
        { name: 'SEVEN', imageUrl: 'https://www.svgrepo.com/show/19161/seven.svg', payout: 100, weight: 1 },
        { name: 'BAR', imageUrl: 'https://www.svgrepo.com/show/210397/maps-and-flags-casino.svg', payout: 50, weight: 2 },
        { name: 'BELL', imageUrl: 'https://www.svgrepo.com/show/19163/bell.svg', payout: 20, weight: 3 },
        { name: 'CHERRY', imageUrl: 'https://www.svgrepo.com/show/198816/slot-machine-casino.svg', payout: 10, weight: 4 },
    ];
    
    const client = await pool.connect();
    
    // Prepare icon fields for the query
    const iconFields = Object.keys(defaultIcons);
    const iconUpdateSet = iconFields.map((field, i) => `"${field}" = $${i + 4}`).join(', ');
    const iconValues = Object.values(defaultIcons);

    try {
        await client.query('BEGIN');

        await client.query(
            `UPDATE "AssetConfig" SET "cardBackUrl" = $1, "tableBackgroundUrl" = $2, "godModePassword" = $3, ${iconUpdateSet} WHERE id = 1`,
            ['https://www.svgrepo.com/show/472548/card-back.svg', 'https://wallpapercave.com/wp/wp1852445.jpg', 'reveal_cards_42', ...iconValues]
        );
        
        await client.query('TRUNCATE TABLE "CardAssets"');
        for (const suit of Object.values(Suit)) {
            for (const rank of Object.values(Rank)) {
                const imageUrl = defaultPattern
                    .replace('{rank}', rankNameMap[rank as keyof typeof rankNameMap])
                    .replace('{suit}', suitNameMap[suit as keyof typeof suitNameMap]);
                await client.query(
                    'INSERT INTO "CardAssets" (suit, rank, "imageUrl") VALUES ($1, $2, $3)',
                    [suit, rank, imageUrl]
                );
            }
        }
        
        await client.query('TRUNCATE TABLE "SlotSymbols" RESTART IDENTITY');
        for (const symbol of defaultSlotSymbols) {
             await client.query(
                'INSERT INTO "SlotSymbols" (name, "imageUrl", payout, weight) VALUES ($1, $2, $3, $4)',
                [symbol.name, symbol.imageUrl, symbol.payout, symbol.weight]
            );
        }

        await client.query('COMMIT');
        
        const configRes = await pool.query('SELECT * FROM "AssetConfig" WHERE id = 1');
        const cardsRes = await pool.query('SELECT suit, rank, "imageUrl" FROM "CardAssets"');
        const cardFaces = cardsRes.rows.reduce((acc, row) => {
            if (!acc[row.suit]) acc[row.suit] = {};
            acc[row.suit][row.rank] = row.imageUrl;
            return acc;
        }, {});
        const symbolsRes = await pool.query('SELECT id, name, "imageUrl", payout, weight FROM "SlotSymbols" ORDER BY id');

        res.json({
            ...configRes.rows[0],
            cardFaces,
            slotSymbols: symbolsRes.rows,
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error resetting assets:', error);
        res.status(500).json({ error: 'Failed to reset assets in database' });
    } finally {
        client.release();
    }
});

// Admin login
// FIX: Removed /api prefix. It is now handled in server.ts
apiRouter.post('/admin/login', (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        console.error('ADMIN_PASSWORD is not set on the server.');
        return res.status(500).json({ error: 'Admin login is not configured.' });
    }

    if (password === adminPassword) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid password.' });
    }
});

// Dynamically serve tonconnect-manifest.json
apiRouter.get('/tonconnect-manifest.json', async (req, res) => {
    try {
        const configRes = await pool.query('SELECT "iconManifest" FROM "AssetConfig" WHERE id = 1');
        if (configRes.rows.length === 0) {
             return res.status(404).json({ error: 'Configuration not found.' });
        }
        const manifest = {
            url: process.env.FRONTEND_URL || 'https://taxaai.onrender.com', // Fallback URL
            name: "Crypto Poker Club",
            iconUrl: configRes.rows[0].iconManifest || 'https://api.iconify.design/icon-park/poker.svg',
        };
        res.json(manifest);
    } catch (error) {
         console.error('Error generating manifest:', error);
        res.status(500).json({ error: 'Failed to generate manifest.' });
    }
});