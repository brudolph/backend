import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { Router, Request, Response, json } from 'express';

// --- Configuration ---
const SHEET_ID = '1WmXJV1Ns_86FJ2xT7z221xERNpb0tzUGX5kqTwuhEwA';
const KEYFILE = path.join(__dirname, '..', 'level-totality-443704-s4-507e9e882d9b.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Column mapping (0-indexed). Adjust if the sheet layout changes.
const COL = {
  NAME: 0,        // A - STRAIN
  POTENCY: 1,     // B - POTENCY (Total THC %)
  ENVIRONMENT: 2, // C - ENVIRONMENT
  PRICE: 3,       // D - PRICE (range like "$750-$800")
  WEIGHT: 4,      // E - WEIGHT (inventory in lbs)
  // F - POUNDS (ignored)
  STRAIN: 6,      // G - I / S / H
  USE_BY_DATE: 7, // H - USE BY DATE
  IMAGE_URL: 8,   // I - Photo1
  // J - Photo2 (ignored)
  // K - Photo3 (ignored)
  NOTES: 11,      // L - NOTES
};

// The column letter for inventory (WEIGHT) in the sheet, used for write-back
const INVENTORY_COL_LETTER = 'E';

// --- Auth helpers ---
function getAuthClient() {
  const keys = JSON.parse(fs.readFileSync(KEYFILE, 'utf-8'));
  return new google.auth.JWT(
    keys.client_email,
    undefined,
    keys.private_key,
    SCOPES,
  );
}

async function getSheetsApi() {
  const auth = getAuthClient();
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

// --- Price parsing ---
function parsePrice(raw: string): { min: number; max: number } {
  if (!raw) return { min: 0, max: 0 };
  // Remove $ signs and whitespace
  const cleaned = raw.replace(/[$\s]/g, '');
  // Handle ranges like "750-800" or single values like "750"
  const parts = cleaned.split('-').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
  if (parts.length === 0) return { min: 0, max: 0 };
  if (parts.length === 1) return { min: parts[0], max: parts[0] };
  return { min: parts[0], max: parts[1] };
}

// --- Sync: Sheet -> DB ---
export async function syncProductsFromSheet(context: any) {
  const sheets = await getSheetsApi();
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetTabs = metadata.data.sheets?.map(s => s.properties?.title).filter(Boolean) as string[];

  for (const tabName of sheetTabs) {
    // Skip the Orders tab
    if (tabName.toLowerCase() === 'orders') continue;

    const category = tabName; // Tab name = product category (Flower, Popcorn, etc.)
    const range = `${tabName}!A:L`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
    });

    const rows = response.data.values || [];

    // Skip header row (index 0)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row[COL.NAME]?.trim();
      if (!name) continue;

      const potencyVal = row[COL.POTENCY]?.trim();
      const priceVal = row[COL.PRICE]?.trim();
      const strainVal = row[COL.STRAIN]?.trim();

      // Validate: Potency must contain a % (e.g., "22%"), Price must contain a $ amount,
      // and I/S/H must be one of Indica, Sativa, or Hybrid — otherwise it's a header/section row
      const hasPotency = potencyVal && /%/.test(potencyVal);
      const hasPrice = priceVal && /\$\d/.test(priceVal);
      const hasStrain = strainVal && /^(indica|sativa|hybrid)$/i.test(strainVal);
      if (!hasPotency || !hasPrice || !hasStrain) continue;

      const price = parsePrice(priceVal);
      const inventoryRaw = parseFloat(row[COL.WEIGHT] || '0');
      const inventory = isNaN(inventoryRaw) ? 0 : inventoryRaw;

      const data = {
        potency: row[COL.POTENCY]?.trim() || '',
        environment: row[COL.ENVIRONMENT]?.trim() || '',
        priceMin: price.min,
        priceMax: price.max,
        inventory,
        strain: row[COL.STRAIN]?.trim() || '',
        category,
        useByDate: row[COL.USE_BY_DATE]?.trim() || '',
        imageUrl: row[COL.IMAGE_URL]?.trim() || '',
        description: row[COL.NOTES]?.trim() || '',
        inStock: inventory > 0 ? 1 : 0,
      };

      // Find existing product by name + category (same strain name could exist in multiple tabs)
      const existing = await context.query.Product.findMany({
        where: { name: { equals: name }, category: { equals: category } },
        query: 'id',
      });

      if (existing.length > 0) {
        await context.query.Product.updateOne({
          where: { id: existing[0].id },
          data,
        });
      } else {
        await context.query.Product.createOne({
          data: { name, ...data },
        });
      }
    }
  }
}

// --- Write: Append order to "Orders" tab ---
export async function appendOrderToSheet(orderData: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  items: Array<{ productName: string; quantity: number; priceMin: number; priceMax: number }>;
  createdAt: string;
}) {
  const sheets = await getSheetsApi();
  const itemsSummary = orderData.items
    .map(i => `${i.productName} x${i.quantity}lbs ($${i.priceMin}-$${i.priceMax})`)
    .join('; ');

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Orders!A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        orderData.orderId,
        orderData.customerName,
        orderData.customerEmail,
        itemsSummary,
        orderData.createdAt,
      ]],
    },
  });
}

// --- Write: Update inventory column for a product ---
export async function updateInventoryInSheet(productName: string, category: string, newInventory: number) {
  const sheets = await getSheetsApi();

  // Read column A from the product's category tab to find the row
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${category}!A:A`,
  });

  const names = response.data.values || [];
  const rowIndex = names.findIndex(r => r[0]?.trim() === productName);
  if (rowIndex === -1) return; // Product not found in sheet

  // Update the inventory cell (WEIGHT column)
  const cellRange = `${category}!${INVENTORY_COL_LETTER}${rowIndex + 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: cellRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[newInventory]],
    },
  });
}

// --- Lightweight sync: Only update inventory for existing products ---
export async function syncInventoryFromSheet(context: any) {
  const sheets = await getSheetsApi();
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetTabs = metadata.data.sheets?.map(s => s.properties?.title).filter(Boolean) as string[];

  let updated = 0;
  for (const tabName of sheetTabs) {
    if (tabName.toLowerCase() === 'orders') continue;

    const category = tabName;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A:E`, // Only need name (A) and inventory (E)
    });

    const rows = response.data.values || [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row[COL.NAME]?.trim();
      if (!name) continue;

      const inventoryRaw = parseFloat(row[COL.WEIGHT] || '0');
      const inventory = isNaN(inventoryRaw) ? 0 : inventoryRaw;

      // Only update products that already exist in the DB
      const existing = await context.query.Product.findMany({
        where: { name: { equals: name }, category: { equals: category } },
        query: 'id inventory',
      });

      if (existing.length > 0 && existing[0].inventory !== inventory) {
        await context.query.Product.updateOne({
          where: { id: existing[0].id },
          data: { inventory, inStock: inventory > 0 ? 1 : 0 },
        });
        updated++;
      }
    }
  }
  return updated;
}

// Webhook secret for Google Apps Script calls
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'gmc-inventory-webhook-secret';

// --- Express router factory ---
export function createGoogleSheetsRouter(commonContext: any) {
  const router = Router();

  router.get('/fetch-products', async (_req: Request, res: Response) => {
    try {
      await syncProductsFromSheet(commonContext.sudo());
      res.json({ message: 'Products synced from Google Sheets' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Error fetching products:', error);
      res.status(500).json({ error: 'Error fetching products', details: msg });
    }
  });

  // --- Webhook: Instant inventory update from Google Apps Script ---
  router.post('/inventory-webhook', json(), async (req: Request, res: Response) => {
    try {
      const { secret, productName, category, inventory, syncAll } = req.body;

      // Simple shared-secret auth
      if (secret !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const sudo = commonContext.sudo();

      // If syncAll flag, do a full inventory sync
      if (syncAll) {
        const count = await syncInventoryFromSheet(sudo);
        console.log(`[Webhook] Full inventory sync — ${count} product(s) updated`);
        return res.json({ message: `Synced ${count} products` });
      }

      // Otherwise update a specific product
      if (!productName || !category) {
        return res.status(400).json({ error: 'productName and category are required' });
      }

      const inv = parseFloat(inventory);
      if (isNaN(inv)) {
        return res.status(400).json({ error: 'Invalid inventory value' });
      }

      const existing = await sudo.query.Product.findMany({
        where: { name: { equals: productName }, category: { equals: category } },
        query: 'id inventory',
      });

      if (existing.length > 0) {
        await sudo.query.Product.updateOne({
          where: { id: existing[0].id },
          data: { inventory: inv, inStock: inv > 0 ? 1 : 0 },
        });
        console.log(`[Webhook] Updated "${productName}" (${category}) inventory → ${inv}`);
        return res.json({ message: `Updated ${productName} inventory to ${inv}` });
      }

      return res.json({ message: `Product not found: ${productName} in ${category}` });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[Webhook] Error:', error);
      return res.status(500).json({ error: 'Webhook failed', details: msg });
    }
  });

  return router;
}
