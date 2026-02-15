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

            const sheet = this.doc.sheetsByIndex[0]; // Restored definition
            await sheet.loadHeaderRow(); // Ensure headers are loaded
            const headerValues = sheet.headerValues;

            // Helper to find the actual header key case-insensitively
            const findHeader = (keyToCheck: string): string => {
                const found = headerValues.find((h: string) => h.trim().toLowerCase() === keyToCheck.trim().toLowerCase());
                return found || keyToCheck; // Fallback to provided key if strict match fails (google-spreadsheet might handle it)
            }

            // Map product drafts to rows using correct headers
            const rows = products.map(p => {
                const rowData: Record<string, string | number> = {};

                rowData[findHeader('Maxsulot nomi')] = p.name || 'Nomsiz';
                rowData[findHeader('Firma')] = p.firma || '';
                rowData[findHeader('Kodi')] = p.code || '';
                rowData[findHeader('Mashina turi')] = p.category || '';
                rowData[findHeader('Soni')] = p.quantity || '';
                rowData[findHeader('Kelish narxi')] = p.cost_price || '';
                rowData[findHeader('Sotish narxi')] = p.sale_price || '';
                rowData[findHeader('Valyuta')] = p.currency || 'USD';
                rowData[findHeader('Sana')] = new Date().toISOString().split('T')[0];

                return rowData;
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
