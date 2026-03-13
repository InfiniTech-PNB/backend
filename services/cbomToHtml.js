/**
 * @function cbomToHtml
 * @description Transforms a CBOM (Cryptographic Bill of Materials) object into an HTML string.
 * This HTML is primarily used for generating PDF reports.
 * @param {Object} cbom - The CBOM document from the database.
 * @returns {string} - Complete HTML document as a string.
 */
function cbomToHtml(cbom) {

  return `
  <html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
        padding: 40px;
      }

      h1 {
        text-align: center;
        margin-bottom: 30px;
      }

      h2 {
        margin-top: 40px;
        border-bottom: 2px solid #ddd;
        padding-bottom: 5px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }

      th, td {
        border: 1px solid #ccc;
        padding: 8px;
        font-size: 12px;
      }

      th {
        background-color: #f2f2f2;
      }
    </style>
  </head>

  <body>

    <h1>Cryptographic Bill of Materials (CBOM)</h1>

    <p><b>Generated At:</b> ${cbom.generatedAt}</p>

    <h2>Algorithms</h2>
    <table>
      <tr>
        <th>Name</th>
        <th>Asset Type</th>
        <th>Primitive</th>
        <th>Mode</th>
        <th>Security Level</th>
        <th>OID</th>
      </tr>
      ${cbom.algorithms.map(a => `
        <tr>
          <td>${a.name || ""}</td>
          <td>${a.asset_type || ""}</td>
          <td>${a.primitive || ""}</td>
          <td>${a.mode || ""}</td>
          <td>${a.classical_security_level || ""}</td>
          <td>${a.oid || ""}</td>
        </tr>
      `).join("")}
    </table>


    <h2>Keys</h2>
    <table>
      <tr>
        <th>Name</th>
        <th>Asset Type</th>
        <th>ID</th>
        <th>State</th>
        <th>Size</th>
        <th>Creation Date</th>
        <th>Activation Date</th>
      </tr>
      ${cbom.keys.map(k => `
        <tr>
          <td>${k.name || ""}</td>
          <td>${k.asset_type || ""}</td>
          <td>${k.id || ""}</td>
          <td>${k.state || ""}</td>
          <td>${k.size || ""}</td>
          <td>${k.creation_date || ""}</td>
          <td>${k.activation_date || ""}</td>
        </tr>
      `).join("")}
    </table>


    <h2>Protocols</h2>
    <table>
      <tr>
        <th>Name</th>
        <th>Versions</th>
        <th>Cipher Suites</th>
        <th>OID</th>
      </tr>
      ${cbom.protocols.map(p => `
        <tr>
          <td>${p.name || ""}</td>
          <td>${(p.version || []).join(", ")}</td>
          <td>${(p.cipher_suites || []).join(", ")}</td>
          <td>${p.oid || ""}</td>
        </tr>
      `).join("")}
    </table>


    <h2>Certificates</h2>
    <table>
      <tr>
        <th>Name</th>
        <th>Subject</th>
        <th>Issuer</th>
        <th>Validity</th>
        <th>Signature Algorithm</th>
        <th>Public Key Ref</th>
        <th>Format</th>
        <th>Extension</th>
      </tr>
      ${cbom.certificates.map(c => `
        <tr>
          <td>${c.name || ""}</td>
          <td>${c.subject_name || ""}</td>
          <td>${c.issuer_name || ""}</td>
          <td>${c.validity_period || ""}</td>
          <td>${c.signature_algorithm_reference || ""}</td>
          <td>${c.subject_public_key_reference || ""}</td>
          <td>${c.certificate_format || ""}</td>
          <td>${c.certificate_extension || ""}</td>
        </tr>
      `).join("")}
    </table>

  </body>
  </html>
  `;
}

module.exports = cbomToHtml;