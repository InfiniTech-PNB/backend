/**
 * @function generatePdf
 * @description Converts an HTML string into a PDF Buffer using a headless browser (Puppeteer).
 * @async
 * @param {string} html - The HTML content to render in the PDF.
 * @returns {Promise<Buffer>} - The generated PDF as a Buffer.
 */

const puppeteer = require("puppeteer");

async function generatePdf(html) {

  const browser = await puppeteer.launch();

  const page = await browser.newPage();

  await page.setContent(html, {
    waitUntil: "networkidle0"
  });

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true
  });

  await browser.close();

  return pdf;
}

module.exports = generatePdf;