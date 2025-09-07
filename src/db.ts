import { Pool } from 'pg';

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Add SSL configuration for production environments like Render
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export const initializeDatabase = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Create Users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Users" (
                "id" TEXT PRIMARY KEY,
                "name" TEXT NOT NULL,
                "playMoney" DOUBLE PRECISION NOT NULL DEFAULT 10000,
                "realMoney" DOUBLE PRECISION NOT NULL DEFAULT 0
            );
        `);

        // Create AssetConfig table with a single-row constraint
        await client.query(`
            CREATE TABLE IF NOT EXISTS "AssetConfig" (
                "id" INTEGER PRIMARY KEY DEFAULT 1,
                "cardBackUrl" TEXT NOT NULL,
                "cardFaceUrlPattern" TEXT NOT NULL,
                "tableBackgroundUrl" TEXT NOT NULL,
                CONSTRAINT single_row_check CHECK (id = 1)
            );
        `);
        
        // Seed AssetConfig with default values if the table is empty
        await client.query(`
            INSERT INTO "AssetConfig" (id, "cardBackUrl", "cardFaceUrlPattern", "tableBackgroundUrl")
            VALUES (
                1,
                'https://www.svgrepo.com/show/472548/card-back.svg',
                'https://cdn.jsdelivr.net/gh/hayeah/playing-cards-assets@master/svg-cards/{rank}_of_{suit}.svg',
                'https://wallpapercave.com/wp/wp1852445.jpg'
            )
            ON CONFLICT (id) DO NOTHING;
        `);
        
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