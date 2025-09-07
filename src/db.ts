import { Pool } from 'pg';
import { Suit, Rank } from './types';

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Add SSL configuration for production environments like Render
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// --- Default Asset Data ---
const defaultAssets = {
    cardBackUrl: 'https://www.svgrepo.com/show/472548/card-back.svg',
    tableBackgroundUrl: 'https://wallpapercave.com/wp/wp1852445.jpg',
};

const defaultSlotSymbols = [
    { name: 'SEVEN', imageUrl: 'https://www.svgrepo.com/show/19161/seven.svg', payout: 100, weight: 1 },
    { name: 'BAR', imageUrl: 'https://www.svgrepo.com/show/210397/maps-and-flags-casino.svg', payout: 50, weight: 2 },
    { name: 'BELL', imageUrl: 'https://www.svgrepo.com/show/19163/bell.svg', payout: 20, weight: 3 },
    { name: 'CHERRY', imageUrl: 'https://www.svgrepo.com/show/198816/slot-machine-casino.svg', payout: 10, weight: 4 },
];

const generateDefaultCardFaces = () => {
  const faces: { suit: Suit, rank: Rank, imageUrl: string }[] = [];
  const pattern = 'https://cdn.jsdelivr.net/gh/hayeah/playing-cards-assets@master/svg-cards/{rank}_of_{suit}.svg';
  
  const suitNameMap: Record<Suit, string> = {
    [Suit.HEARTS]: 'hearts', [Suit.DIAMONDS]: 'diamonds', [Suit.CLUBS]: 'clubs', [Suit.SPADES]: 'spades',
  };
  const rankNameMap: Record<Rank, string> = {
    [Rank.ACE]: 'ace', [Rank.KING]: 'king', [Rank.QUEEN]: 'queen', [Rank.JACK]: 'jack',
    [Rank.TEN]: '10', [Rank.NINE]: '9', [Rank.EIGHT]: '8', [Rank.SEVEN]: '7',
    [Rank.SIX]: '6', [Rank.FIVE]: '5', [Rank.FOUR]: '4', [Rank.THREE]: '3', [Rank.TWO]: '2',
  };

  for (const suit of Object.values(Suit)) {
    for (const rank of Object.values(Rank)) {
      faces.push({
        suit,
        rank,
        imageUrl: pattern.replace('{rank}', rankNameMap[rank]).replace('{suit}', suitNameMap[suit])
      });
    }
  }
  return faces;
};


export const initializeDatabase = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Users Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Users" (
                "id" TEXT PRIMARY KEY,
                "name" TEXT NOT NULL,
                "playMoney" DOUBLE PRECISION NOT NULL DEFAULT 10000,
                "realMoney" DOUBLE PRECISION NOT NULL DEFAULT 0,
                "role" TEXT NOT NULL DEFAULT 'PLAYER'
            );
        `);
        const ADMIN_USER_ID = '7327258482';
        await client.query(`UPDATE "Users" SET "role" = 'ADMIN' WHERE "id" = $1;`, [ADMIN_USER_ID]);

        // 2. General AssetConfig Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS "AssetConfig" (
                "id" INTEGER PRIMARY KEY DEFAULT 1,
                "cardBackUrl" TEXT NOT NULL,
                "tableBackgroundUrl" TEXT NOT NULL,
                CONSTRAINT single_row_check CHECK (id = 1)
            );
        `);
        // Remove old column if it exists from a previous version
        await client.query(`ALTER TABLE "AssetConfig" DROP COLUMN IF EXISTS "cardFaceUrlPattern";`);
        
        // Seed AssetConfig with default values
        await client.query(`
            INSERT INTO "AssetConfig" (id, "cardBackUrl", "tableBackgroundUrl")
            VALUES (1, $1, $2)
            ON CONFLICT (id) DO NOTHING;
        `, [defaultAssets.cardBackUrl, defaultAssets.tableBackgroundUrl]);
        
        // 3. CardAssets Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS "CardAssets" (
                "suit" TEXT NOT NULL,
                "rank" TEXT NOT NULL,
                "imageUrl" TEXT NOT NULL,
                PRIMARY KEY ("suit", "rank")
            );
        `);
        
        // Seed CardAssets if empty
        const cardCount = await client.query('SELECT COUNT(*) FROM "CardAssets"');
        if (parseInt(cardCount.rows[0].count, 10) === 0) {
            const defaultCards = generateDefaultCardFaces();
            for (const card of defaultCards) {
                await client.query(
                    'INSERT INTO "CardAssets" (suit, rank, "imageUrl") VALUES ($1, $2, $3)',
                    [card.suit, card.rank, card.imageUrl]
                );
            }
        }

        // 4. SlotSymbols Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS "SlotSymbols" (
                "id" SERIAL PRIMARY KEY,
                "name" TEXT NOT NULL,
                "imageUrl" TEXT NOT NULL,
                "payout" INTEGER NOT NULL,
                "weight" INTEGER NOT NULL DEFAULT 1
            );
        `);
        
        // Seed SlotSymbols if empty
        const symbolCount = await client.query('SELECT COUNT(*) FROM "SlotSymbols"');
        if (parseInt(symbolCount.rows[0].count, 10) === 0) {
            for (const symbol of defaultSlotSymbols) {
                 await client.query(
                    'INSERT INTO "SlotSymbols" (name, "imageUrl", payout, weight) VALUES ($1, $2, $3, $4)',
                    [symbol.name, symbol.imageUrl, symbol.payout, symbol.weight]
                );
            }
        }
        
        await client.query('COMMIT');
        console.log('Database schema is ready.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error initializing database schema:', error);
        throw error;
    } finally {
        client.release();
    }
};