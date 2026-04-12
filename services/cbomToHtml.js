function cbomToHtml(cbom) {

    const renderGrouped = (title, items, renderHeader, renderRow) => {
      let output = `<h2>${title}</h2>`;
      if (!items || items.length === 0) return output + "<p>None</p>";

      if (cbom.mode === 'per_asset') {
        const grouped = items.reduce((acc, item) => {
          const key = item.asset || "Unknown Asset";
          if (!acc[key]) acc[key] = [];
          acc[key].push(item);
          return acc;
        }, {});

        for (const [assetName, assetItems] of Object.entries(grouped)) {
          output += `
            <div style="margin-bottom: 25px;">
              <h3 style="margin-top: 15px; margin-bottom: 5px; color: #d97706; font-size: 14px;">Asset: ${assetName}</h3>
              <table>
                <thead><tr>${renderHeader()}</tr></thead>
                <tbody>${assetItems.map(item => `<tr>${renderRow(item)}</tr>`).join("")}</tbody>
              </table>
            </div>
          `;
        }
      } else {
        output += `
          <table>
            <thead><tr>${renderHeader()}</tr></thead>
            <tbody>${items.map(item => `<tr>${renderRow(item)}</tr>`).join("")}</tbody>
          </table>
        `;
      }
      return output;
    };

    const algos = renderGrouped("Algorithms", cbom.algorithms, 
      () => `
        <th>Name</th>
        <th>Asset Type</th>
        <th>Primitive</th>
        <th>Mode</th>
        <th>Security Level</th>
        <th>OID</th>
      `,
      (a) => `
        <td>${a.name || ""}</td>
        <td>${a.assetType || ""}</td>
        <td>${a.primitive || ""}</td>
        <td>${a.mode || ""}</td>
        <td>${a.classicalSecurityLevel || ""}</td>
        <td>${a.oid || ""}</td>
      `
    );

    const keys = renderGrouped("Keys", cbom.keys, 
      () => `
        <th>Name</th>
        <th>Asset Type</th>
        <th>ID</th>
        <th>State</th>
        <th>Size</th>
        <th>Creation Date</th>
        <th>Activation Date</th>
      `,
      (k) => `
        <td>${k.name || ""}</td>
        <td>${k.assetType || ""}</td>
        <td>${k.id || ""}</td>
        <td>${k.state || ""}</td>
        <td>${k.size || ""}</td>
        <td>${k.creationDate || ""}</td>
        <td>${k.activationDate || ""}</td>
      `
    );

    const protocols = renderGrouped("Protocols", cbom.protocols, 
      () => `
        <th>Name</th>
        <th>Version</th>
        <th>Cipher Suites</th>
        <th>ALPN</th>
        <th>OID</th>
      `,
      (p) => `
        <td>${p.name || ""}</td>
        <td>${p.version || ""}</td>
        <td>${(p.cipherSuites || []).join(", ")}</td>
        <td>${p.alpn || ""}</td>
        <td>${p.oid || ""}</td>
      `
    );

    const certificates = renderGrouped("Certificates", cbom.certificates, 
      () => `
        <th>Subject</th>
        <th>Issuer</th>
        <th>Validity</th>
        <th>Signature Algorithm</th>
        <th>Public Key Ref</th>
        <th>Format</th>
        <th>Fingerprint (SHA256)</th>
      `,
      (c) => `
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
      `
    );

    return `
  <html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
      h1 { text-align: center; margin-bottom: 30px; color: #333; }
      h2 { margin-top: 40px; border-bottom: 2px solid #ddd; padding-bottom: 5px; color: #444; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #ccc; padding: 8px; font-size: 11px; text-align: left; }
      th { background-color: #f8f9fa; font-weight: bold; }
      tr:nth-child(even) { background-color: #fdfdfd; }
      .meta { margin-bottom: 20px; }
    </style>
  </head>
  <body>
    <h1>Cryptographic Bill of Materials (CBOM)</h1>
    <div class="meta">
      <p><b>Generated At:</b> ${new Date(cbom.generatedAt).toLocaleString()}</p>
      <p><b>Scan Mode:</b> ${cbom.mode === 'per_asset' ? 'Per-Asset' : 'Aggregate'}</p>
    </div>
    ${algos}
    ${keys}
    ${protocols}
    ${certificates}
  </body>
  </html>
  `;
}

module.exports = cbomToHtml;