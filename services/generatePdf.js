/**
 * @function generatePdf
 * @description Converts an HTML string into a PDF Buffer using a headless browser (Puppeteer).
 * @async
 * @param {string} html - The HTML content to render in the PDF.
 * @returns {Promise<Buffer>} - The generated PDF as a Buffer.
 */

const puppeteer = require("puppeteer");

async function generatePdf(html) {
  // Add these specific flags for AWS EC2 / Linux Environments
  const browser = await puppeteer.launch({
    headless: "new", 
    args: [
      "--no-sandbox",                // Required for Linux/Root users
      "--disable-setuid-sandbox",    // Extra security bypass for Linux
      "--disable-dev-shm-usage",     // Uses /tmp instead of RAM (fixes "hanging" on low RAM)
      "--disable-gpu",               // Not needed on headless servers
      "--no-zygote",                 // Saves memory
      "--single-process"             // Reduces CPU usage on t3.micro
    ]
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0" // Ensures images and styles are loaded
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    });

    return pdf;
  } catch (error) {
    console.error("Puppeteer Error:", error);
    throw error;
  } finally {
    // Always close the browser to prevent "Zombie" processes from eating your RAM
    if (browser) await browser.close();
  }
}

module.exports = generatePdf;