import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

let db: Database | null = null;

export const initDB = async (): Promise<Database> => {
    if (db) return db;

    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    db = await open({
        filename: path.join(dataDir, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            category TEXT,
            code TEXT,
            quantity INTEGER NOT NULL DEFAULT 0,
            cost_price REAL,
            sale_price REAL,
            currency TEXT DEFAULT 'UZS',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Migration for existing databases
    try {
        await db.exec(`ALTER TABLE products ADD COLUMN currency TEXT DEFAULT 'UZS';`);
    } catch (e) {
        // Ignore error if column already exists
    }

    // Index for faster search
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);`);

    console.log('Database initialized');
    return db;
};

export const getDB = async (): Promise<Database> => {
    if (!db) {
        return await initDB();
    }
    return db;
};
