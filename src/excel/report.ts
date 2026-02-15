import ExcelJS from 'exceljs';
import { Product } from '../db/productRepository';
import path from 'path';
import fs from 'fs';

export const generateProductReport = async (products: Product[]): Promise<string> => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    worksheet.columns = [
        { header: '#', key: 'index', width: 5 },
        { header: 'Maxsulot nomi', key: 'name', width: 30 },
        { header: 'Firma', key: 'firma', width: 20 },
        { header: 'Kodi', key: 'code', width: 10 },
        { header: 'mashina turi', key: 'category', width: 15 },
        { header: 'soni', key: 'quantity', width: 8 },
        { header: 'kelish narxi', key: 'cost_price', width: 12 },
        { header: 'sotish narxi', key: 'sale_price', width: 12 },
        { header: 'valyuta', key: 'currency', width: 8 },
        // Calculated columns (optional, kept for utility but user didn't ask for them explicitly in image, but likely wants totals)
        { header: 'Jami Kelish', key: 'total_cost', width: 15 },
        { header: 'Jami Sotish', key: 'total_sale', width: 15 },
        { header: 'Foyda', key: 'profit', width: 15 },
    ];

    // Style Header
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    let totalCostUZS = 0;
    let totalSaleUZS = 0;
    let totalProfitUZS = 0;

    let totalCostUSD = 0;
    let totalSaleUSD = 0;
    let totalProfitUSD = 0;

    products.forEach((p, index) => {
        const currency = p.currency || 'UZS';
        // Treat 0 quantity as null/empty for calculation if needed, 
        // but for display we want blank.
        // If p.quantity is 0 (from DB default) but we want it blank if it was "unknown", 
        // we might have a data ambiguity. Assuming 0 means 0 or unknown. 
        // User said "if I don't tell ... it should stay blank". 

        const qty = p.quantity || 0;
        const cost = p.cost_price || 0;
        const sale = p.sale_price || 0;

        const totalCost = qty * cost;
        const totalSale = qty * sale;
        const profit = totalSale - totalCost;

        if (currency === 'USD') {
            totalCostUSD += totalCost;
            totalSaleUSD += totalSale;
            totalProfitUSD += profit;
        } else {
            totalCostUZS += totalCost;
            totalSaleUZS += totalSale;
            totalProfitUZS += profit;
        }

        worksheet.addRow({
            index: index + 1,
            name: p.name,
            firma: p.firma || null,
            code: p.code,
            category: p.category,
            quantity: p.quantity === 0 ? null : p.quantity, // Display blank if 0
            cost_price: p.cost_price, // ExcelJS handles null as blank
            sale_price: p.sale_price,
            currency: currency,
            total_cost: totalCost === 0 ? null : totalCost,
            total_sale: totalSale === 0 ? null : totalSale,
            profit: profit === 0 ? null : profit
        });
    });

    // Add Totals Rows
    worksheet.addRow({}); // Empty row

    const uzsRow = worksheet.addRow({
        name: 'TOTALS (UZS)',
        total_cost: totalCostUZS,
        total_sale: totalSaleUZS,
        profit: totalProfitUZS
    });
    uzsRow.font = { bold: true };

    if (totalCostUSD > 0 || totalSaleUSD > 0) {
        const usdRow = worksheet.addRow({
            name: 'TOTALS (USD)',
            total_cost: totalCostUSD,
            total_sale: totalSaleUSD,
            profit: totalProfitUSD
        });
        usdRow.font = { bold: true };
    }

    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const fileName = `product_report_${new Date().toISOString().split('T')[0]}.xlsx`;
    const filePath = path.join(tempDir, fileName);

    await workbook.xlsx.writeFile(filePath);
    return filePath;
};
