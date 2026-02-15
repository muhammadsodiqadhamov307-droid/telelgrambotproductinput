
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const testConnection = async () => {
    console.log("🔍 Checking Google Sheets configuration...");

    const sheetId = process.env.GOOGLE_SHEET_ID;
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!sheetId) {
        console.error("❌ GOOGLE_SHEET_ID is missing in .env");
        return;
    }
    if (!email) {
        console.error("❌ GOOGLE_SERVICE_ACCOUNT_EMAIL is missing in .env");
        return;
    }
    if (!privateKey) {
        console.error("❌ GOOGLE_PRIVATE_KEY is missing in .env");
        return;
    }

    console.log(`✅ Credentials found for: ${email}`);
    console.log(`Checking access to sheet: ${sheetId}`);

    const jwt = new JWT({
        email: email,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, jwt);

    try {
        await doc.loadInfo();
        console.log(`✅ Success! Connected to sheet: "${doc.title}"`);

        const sheet = doc.sheetsByIndex[0];
        await sheet.loadHeaderRow();
        console.log("📋 Found Headers:", sheet.headerValues);

        // Test appending a row with username
        const userName = "@TestUser";
        const headerValues = sheet.headerValues;

        const findHeader = (keyToCheck: string): string => {
            const found = headerValues.find((h: string) => h.trim().toLowerCase() === keyToCheck.trim().toLowerCase());
            return found || keyToCheck;
        }

        const userHeaderName = headerValues.find((h: string) =>
            ['foydalanuvchi', 'user name', 'username', 'user'].includes(h.trim().toLowerCase())
        ) || 'User Name';

        console.log(`👤 Using User Header: "${userHeaderName}"`);

        const rowData: Record<string, string | number> = {};
        rowData[findHeader('Maxsulot nomi')] = "Test Product";
        rowData[findHeader('Firma')] = "Test Firma";
        rowData[userHeaderName] = userName;
        rowData[findHeader('Sana')] = new Date().toISOString().split('T')[0];

        await sheet.addRows([rowData]);
        console.log("✅ Added test row with username.");

    } catch (error: any) {
        console.error("❌ Connection Failed!");
        if (error.response?.status === 403) {
            console.error("\n⚠️  ERROR: The Google Sheets API is not enabled OR the service account does not have access.");
            console.error("1. Make sure you enabled the API here:");
            console.error(`   https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${email.split('@')[1].split('.')[0]}`); // Attempt to parse project ID
            console.error("2. Make sure you Shared the sheet with the email:", email);
        } else {
            console.error(error.message);
        }
    }
};

testConnection();
