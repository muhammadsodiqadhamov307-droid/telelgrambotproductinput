import ExcelJS from 'exceljs';
import { Product } from '../db/productRepository';
import path from 'path';
import fs from 'fs';

export const generateProductReport = async (products: Product[]): Promise<string> => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    worksheet.columns = [
        { header: '#', key: 'index', width: 5 },
        { header: 'Date', key: 'created_at', width: 15 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Category', key: 'category', width: 15 },
        { header: 'Code', key: 'code', width: 10 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Currency', key: 'currency', width: 8 },
        { header: 'Cost Price', key: 'cost_price', width: 12 },
        { header: 'Sale Price', key: 'sale_price', width: 12 },
        { header: 'Total Cost', key: 'total_cost', width: 15 },
        { header: 'Total Sale', key: 'total_sale', width: 15 },
        { header: 'Profit', key: 'profit', width: 15 },
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
        const totalCost = (p.quantity || 0) * (p.cost_price || 0);
        const totalSale = (p.quantity || 0) * (p.sale_price || 0);
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
            created_at: p.created_at ? new Date(p.created_at).toLocaleDateString() : '',
            name: p.name,
            category: p.category,
            code: p.code,
            quantity: p.quantity,
            currency: currency,
            cost_price: p.cost_price,
            sale_price: p.sale_price,
            total_cost: totalCost,
            total_sale: totalSale,
            profit: profit
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
