import { getDB } from './db';

export interface Product {
    id?: number;
    user_id: number;
    name: string;
    category?: string;
    firma?: string;
    code?: string;
    quantity: number;
    cost_price?: number;
    sale_price?: number;
    currency?: string;
    created_at?: string;
}

export class ProductRepository {
    static async create(product: Product): Promise<number> {
        const db = await getDB();
        const result = await db.run(
            `INSERT INTO products (user_id, name, category, firma, code, quantity, cost_price, sale_price, currency)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                product.user_id,
                product.name,
                product.category,
                product.firma,
                product.code,
                product.quantity,
                product.cost_price,
                product.sale_price,
                product.currency || 'UZS'
            ]
        );
        return result.lastID!;
    }

    static async getByUserId(userId: number): Promise<Product[]> {
        const db = await getDB();
        return await db.all<Product[]>('SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    }

    static async getById(id: number): Promise<Product | undefined> {
        const db = await getDB();
        return await db.get<Product>('SELECT * FROM products WHERE id = ?', [id]);
    }

    static async delete(id: number): Promise<void> {
        const db = await getDB();
        await db.run('DELETE FROM products WHERE id = ?', [id]);
    }

    static async getLastProduct(userId: number): Promise<Product | undefined> {
        const db = await getDB();
        return await db.get<Product>('SELECT * FROM products WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
    }

    static async search(userId: number, query: string): Promise<Product[]> {
        const db = await getDB();
        const likeQuery = `%${query}%`;
        return await db.all<Product[]>(
            `SELECT * FROM products 
             WHERE user_id = ? AND (name LIKE ? OR code LIKE ? OR category LIKE ?) 
             ORDER BY created_at DESC`,
            [userId, likeQuery, likeQuery, likeQuery]
        );
    }

    static async getCategories(userId: number): Promise<string[]> {
        const db = await getDB();
        const rows = await db.all<{ category: string }[]>('SELECT DISTINCT category FROM products WHERE user_id = ? AND category IS NOT NULL', [userId]);
        return rows.map(r => r.category);
    }
}
