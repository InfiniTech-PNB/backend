/**
 * @function deriveMLFeatures
 * @description Extracts the feature set used by the PQC ML model.
 * @param {Object} scan - ScanResult object
 * @returns {Object}
 */
function deriveMLFeatures(scan) {

  const features = {};

  // TLS VERSION (keep as string)
  features.tls_version = scan.tls_version || "nan";

  // CIPHER (string)
  features.cipher = scan.cipher || "nan";

  // KEY EXCHANGE
  features.key_exchange = scan.key_exchange || "nan";

  // SIGNATURE ALGORITHM
  features.signature_algorithm = scan.signature_algorithm || "nan";

  // PQC FEATURES
  features.pqc_key_exchange = scan.pqc_key_exchange || "nan";
  features.pqc_signature = scan.pqc_signature || "nan";

  // HYBRID PQC (boolean)
  features.hybrid_pqc = Boolean(scan.hybrid_pqc);

  // NUMBER OF SUPPORTED TLS VERSIONS
  features.supported_tls_versions_count =
    scan.supported_tls_versions ? scan.supported_tls_versions.length : 0;

  // NUMBER OF CIPHER SUITES
  features.cipher_suites_count =
    scan.cipher_suites ? scan.cipher_suites.length : 0;

  // NUMBER OF WEAK CIPHERS
  features.weak_cipher_count =
    scan.weak_ciphers ? scan.weak_ciphers.length : 0;

  // KEY SIZE
  features.key_size = scan.key_size || 0;

  // PFS SUPPORT
  features.pfs_supported = Boolean(scan.pfs_supported);

  // RSA USED
  features.rsa_used =
    scan.signature_algorithm &&
    scan.signature_algorithm.toUpperCase().includes("RSA");

  return features;
}

module.exports = deriveMLFeatures;