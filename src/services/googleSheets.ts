import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { ProductDraft } from '../bot/context';

export class GoogleSheetsService {
    private doc: GoogleSpreadsheet | null = null;
    private initialized = false;

    constructor() {
        const sheetId = process.env.GOOGLE_SHEET_ID;
        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

        if (sheetId && email && privateKey) {
            const jwt = new JWT({
                email: email,
                key: privateKey,
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                ],
            });
            this.doc = new GoogleSpreadsheet(sheetId, jwt);
        } else {
            console.warn("Google Sheets credentials missing in .env. Sheets integration disabled.");
        }
    }

    async appendProducts(products: ProductDraft[]): Promise<boolean> {
        if (!this.doc) return false;

        try {
            if (!this.initialized) {
                await this.doc.loadInfo();
                this.initialized = true;
            }

            const sheet = this.doc.sheetsByIndex[0]; // Assume first sheet

            // Map product drafts to rows matches the header structure
            // Headers: Name, Firma, Code, Category, Quantity, Cost, Sale, Currency, Date
            const rows = products.map(p => {
                return {
                    'Maxsulot nomi': p.name,
                    'Firma': p.firma || '',
                    'Kodi': p.code || '',
                    'Mashina turi': p.category || '',
                    'Soni': p.quantity || '',
                    'Kelish narxi': p.cost_price || '',
                    'Sotish narxi': p.sale_price || '',
                    'Valyuta': p.currency || 'USD',
                    'Sana': new Date().toISOString().split('T')[0]
                };
            });

            await sheet.addRows(rows);
            return true;
        } catch (error) {
            console.error("Failed to append to Google Sheets:", error);
            return false;
        }
    }
}

export const googleSheetsService = new GoogleSheetsService();
