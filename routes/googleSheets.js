const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const { lists } = require('../schema'); // Import the Keystone context
const { getContext } = require('@keystone-6/core/context');

const sheetId = '1osZiO8ONAslWBhV1mKMRw3ve8Dk8CLVzyGQ1gMWdPbQ'; // Spreadsheet ID
const keyfile = path.join(__dirname, 'level-totality-443704-s4-507e9e882d9b.json'); // Path to service account key file

async function fetchAndProcessSheets(auth,context) {
  const sheets = google.sheets({ version: 'v4', auth });

  // Fetch sheet metadata to get all sheet names
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const sheetNames = metadata.data.sheets.map((sheet) => sheet.properties.title);

  console.log('Sheets in spreadsheet:', sheetNames);

  for (const sheetName of sheetNames) {
    console.log(`Fetching data from sheet: ${sheetName}`);
    console.log(":contexty", lists);

    const range = `${sheetName}!A:L`; // Example range
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });

    // Process the data as needed
    // console.log(`Data from ${sheetName}:`, response.data.values);

    // Insert or update data in Keystone DB using the context
    for (const row of response.data.values) {
      const [name, potency, environment, price, inventory, weight, strain, description] = row;

      console.log('Processing product:', name, potency, environment, price, inventory, weight, strain, description);

      // Check if the product already exists
      const existingProduct = await context.query.Product.findOne({
        where: { name },
        query: 'id name potency environment price inventory weight strain description',
      });

      console.log('Existing product:', existingProduct);

      if (existingProduct) {
        // Update the existing product
        await lists.query.Product.updateOne({
          where: { id: existingProduct.id },
          data: {
            potency,
            environment,
            price: parseInt(price, 10),
            inventory: parseInt(inventory, 10),
            weight,
            strain,
            description,
            inStock: parseInt(inStock, 10),
          },
        });
      } else {
        // Create a new product
        await lists.query.Product.createOne({
          data: {
            name,
            potency,
            environment,
            price: parseInt(price, 10),
            inventory: parseInt(inventory, 10),
            weight,
            strain,
            description,
            inStock: parseInt(inStock, 10),
          },
        });
      }
    }
  }
}

async function fetchGoogleSheetsAPI() {
  const keys = JSON.parse(fs.readFileSync(keyfile));

  // Create a JWT client
  const client = new google.auth.JWT(
    keys.client_email,
    null,
    keys.private_key,
    ['https://www.googleapis.com/auth/spreadsheets.readonly']
  );

  await client.authorize();
  const context = getContext();
  await fetchAndProcessSheets(client,context);
}

router.get('/fetch-products', async (req, res) => {
  try {
    await fetchGoogleSheetsAPI();
    res.send('Products fetched and updated');
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).send('Error fetching products');
  }
});

module.exports = router;