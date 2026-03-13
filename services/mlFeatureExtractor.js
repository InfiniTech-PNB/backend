/**
 * @function deriveMLFeatures
 * @description Extracts a normalized numerical feature set from a raw scan result.
 * This feature set is sent to the ML scoring service to calculate the PQC Readiness Score.
 * @param {Object} scan - The raw scan result (ScanResult model).
 * @returns {Object} - A flat object of features for ML consumption.
 */
function deriveMLFeatures(scan) {

  const features = {};

  // TLS VERSION
  const tlsMap = {
    "TLSv1.3": 3,
    "TLSv1.2": 2,
    "TLSv1.1": 1,
    "TLSv1.0": 0
  };

  features.tls_version = tlsMap[scan.tlsVersion] || 0;

  // CIPHER TYPE
  const cipher = scan.cipher || "";

  features.cipher = cipher;

  // KEY EXCHANGE
  features.key_exchange = scan.keyExchange || "UNKNOWN";

  // SIGNATURE
  features.signature = scan.signatureAlgorithm || "UNKNOWN";

  // PQC FEATURES
  features.pqc_key_exchange = scan.pqcKeyExchange ? 1 : 0;
  features.pqc_signature = scan.pqcSignature ? 1 : 0;
  features.hybrid_pqc = scan.hybridPqc ? 1 : 0;

  // NUMBER OF CIPHER SUITES
  features.supported_cipher_suites =
    scan.cipherSuites ? scan.cipherSuites.length : 0;

  // WEAK CIPHER COUNT
  features.weak_ciphers =
    scan.weakCiphers ? scan.weakCiphers.length : 0;

  // KEY SIZE
  features.key_size = scan.keySize || 0;

  // PFS
  features.pfs_supported = scan.pfsSupported ? 1 : 0;

  // RSA USED
  features.rsa_used =
    scan.signatureAlgorithm &&
    scan.signatureAlgorithm.toUpperCase().includes("RSA")
      ? 1
      : 0;

  return features;
}

module.exports = deriveMLFeatures;