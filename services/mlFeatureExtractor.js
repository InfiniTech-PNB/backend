/**
 * @function deriveMLFeatures
 * @description Extracts the feature set used by the PQC ML model.
 * @param {Object} scan - ScanResult object
 * @returns {Object}
 */
function deriveMLFeatures(scan) {

  const features = {};

  // TLS VERSION (keep as string)
  features.tls_version = scan.negotiated?.tlsVersion || "nan";

  // CIPHER (string)
  features.cipher = scan.negotiated?.cipher || "nan";

  // KEY EXCHANGE
  features.key_exchange = scan.negotiated?.keyExchange || "nan";

  // SIGNATURE ALGORITHM
  features.signature_algorithm = scan.certificate?.signatureAlgorithm || "nan";

  // PQC FEATURES
  // Assuming pqc.negotiated contains the PQC algorithms used
  features.pqc_key_exchange = (scan.pqc?.negotiated && scan.pqc.negotiated.length > 0)
    ? scan.pqc.negotiated[0]
    : "nan";
  features.pqc_signature = (scan.pqc?.negotiated && scan.pqc.negotiated.length > 1)
    ? scan.pqc.negotiated[1]
    : "nan";

  // HYBRID PQC (boolean)
  features.hybrid_pqc = Boolean(scan.pqc?.negotiated && scan.pqc.negotiated.length > 0);

  // NUMBER OF SUPPORTED TLS VERSIONS
  features.supported_tls_versions_count =
    scan.supported?.tlsVersions ? scan.supported.tlsVersions.length : 0;

  // NUMBER OF CIPHER SUITES
  features.cipher_suites_count =
    scan.supported?.cipherSuites ? scan.supported.cipherSuites.length : 0;

  // NUMBER OF WEAK CIPHERS
  features.weak_cipher_count =
    scan.weakCiphers ? scan.weakCiphers.length : 0;

  // KEY SIZE (Using certificate public key size)
  features.key_size = scan.certificate?.publicKey?.size || 0;

  // PFS SUPPORT
  features.pfs_supported = Boolean(scan.pfsSupported);

  // RSA USED
  features.rsa_used =
    scan.certificate?.signatureAlgorithm &&
    scan.certificate.signatureAlgorithm.toUpperCase().includes("RSA");

  return features;
}

module.exports = deriveMLFeatures;