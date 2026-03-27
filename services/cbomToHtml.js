function cbomToHtml(cbom) {

  return `
  <html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
        padding: 40px;
        line-height: 1.6;
      }

      h1 {
        text-align: center;
        margin-bottom: 30px;
        color: #333;
      }

      h2 {
        margin-top: 40px;
        border-bottom: 2px solid #ddd;
        padding-bottom: 5px;
        color: #444;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }

      th, td {
        border: 1px solid #ccc;
        padding: 8px;
        font-size: 11px;
        text-align: left;
      }

      th {
        background-color: #f8f9fa;
        font-weight: bold;
      }

      tr:nth-child(even) {
        background-color: #fdfdfd;
      }

      .meta {
        margin-bottom: 20px;
      }
    </style>
  </head>

  <body>

    <h1>Cryptographic Bill of Materials (CBOM)</h1>

    <div class="meta">
      <p><b>Generated At:</b> ${new Date(cbom.generatedAt).toLocaleString()}</p>
      <p><b>Scan Mode:</b> ${cbom.mode === 'per_asset' ? 'Per-Asset' : 'Aggregate'}</p>
    </div>

    <h2>Algorithms</h2>
    <table>
      <thead>
        <tr>
          ${cbom.mode === 'per_asset' ? '<th>Asset</th>' : ''}
          <th>Name</th>
          <th>Asset Type</th>
          <th>Primitive</th>
          <th>Mode</th>
          <th>Security Level</th>
          <th>OID</th>
        </tr>
      </thead>
      <tbody>
        ${cbom.algorithms.map(a => `
          <tr>
            ${cbom.mode === 'per_asset' ? `<td>${a.asset || ""}</td>` : ""}
            <td>${a.name || ""}</td>
            <td>${a.assetType || ""}</td>
            <td>${a.primitive || ""}</td>
            <td>${a.mode || ""}</td>
            <td>${a.classicalSecurityLevel || ""}</td>
            <td>${a.oid || ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>


    <h2>Keys</h2>
    <table>
      <thead>
        <tr>
          ${cbom.mode === 'per_asset' ? '<th>Asset</th>' : ''}
          <th>Name</th>
          <th>Asset Type</th>
          <th>ID</th>
          <th>State</th>
          <th>Size</th>
          <th>Creation Date</th>
          <th>Activation Date</th>
        </tr>
      </thead>
      <tbody>
        ${cbom.keys.map(k => `
          <tr>
            ${cbom.mode === 'per_asset' ? `<td>${k.asset || ""}</td>` : ""}
            <td>${k.name || ""}</td>
            <td>${k.assetType || ""}</td>
            <td>${k.id || ""}</td>
            <td>${k.state || ""}</td>
            <td>${k.size || ""}</td>
            <td>${k.creationDate || ""}</td>
            <td>${k.activationDate || ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>


    <h2>Protocols</h2>
    <table>
      <thead>
        <tr>
          ${cbom.mode === 'per_asset' ? '<th>Asset</th>' : ''}
          <th>Name</th>
          <th>Version</th>
          <th>Cipher Suites</th>
          <th>ALPN</th>
          <th>OID</th>
        </tr>
      </thead>
      <tbody>
        ${cbom.protocols.map(p => `
          <tr>
            ${cbom.mode === 'per_asset' ? `<td>${p.asset || ""}</td>` : ""}
            <td>${p.name || ""}</td>
            <td>${p.version || ""}</td>
            <td>${(p.cipherSuites || []).join(", ")}</td>
            <td>${p.alpn || ""}</td>
            <td>${p.oid || ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>


    <h2>Certificates</h2>
    <table>
      <thead>
        <tr>
          <th>Asset</th>
          <th>Subject</th>
          <th>Issuer</th>
          <th>Validity</th>
          <th>Signature Algorithm</th>
          <th>Public Key Ref</th>
          <th>Format</th>
          <th>Fingerprint (SHA256)</th>
        </tr>
      </thead>
      <tbody>
        ${cbom.certificates.map(c => `
          <tr>
            <td>${c.asset || ""}</td>
            <td>${c.leafCertificate?.subjectName || ""}</td>
            <td>${c.leafCertificate?.issuerName || ""}</td>
            <td>
              ${c.leafCertificate?.validityPeriod?.notBefore || ""} to 
              ${c.leafCertificate?.validityPeriod?.notAfter || ""}
            </td>
            <td>${c.leafCertificate?.signatureAlgorithmReference || ""}</td>
            <td>${c.leafCertificate?.subjectPublicKeyReference || ""}</td>
            <td>${c.leafCertificate?.certificateFormat || ""}</td>
            <td>${c.leafCertificate?.fingerprintSha256 || ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>

  </body>
  </html>
  `;
}

module.exports = cbomToHtml;