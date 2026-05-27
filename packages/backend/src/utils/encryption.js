// Salva-Digital-Tech/packages/backend/src/utils/encryption.js
const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
// OWASP recommendation for PBKDF2 iterations (600,000 for 2023+)
const PBKDF2_ITERATIONS = 600000;
const KEY_LENGTH = 32; // 256 bits for AES-256

/**
 * Derives a cryptographically strong key from a PIN using PBKDF2
 * @param {string} pin - The 4-digit PIN
 * @param {Buffer} salt - Random salt for key derivation
 * @returns {Buffer} - Derived 32-byte key
 */
function deriveKeyFromPin(pin, salt) {
  return crypto.pbkdf2Sync(String(pin), salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypts the private key using the user's PIN with PBKDF2 key derivation
 * @param {string} privateKey - The private key to encrypt
 * @param {string} pin - The 4-digit PIN
 * @returns {string} - Encrypted private key in format: salt:iv:encryptedData
 */
function encryptPrivateKey(privateKey, pin) {
  // Generate random salt for key derivation (prevents rainbow table attacks)
  const salt = crypto.randomBytes(SALT_LENGTH);

  // Derive strong key from PIN using PBKDF2
  const key = deriveKeyFromPin(pin, salt);

  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher and encrypt
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return salt:IV:encrypted data (we need both salt and IV to decrypt)
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypts the private key using the user's PIN
 * @param {string} encryptedPrivateKey - The encrypted private key (salt:iv:encryptedData format)
 * @param {string} pin - The 4-digit PIN
 * @returns {string} - Decrypted private key
 */
function decryptPrivateKey(encryptedPrivateKey, pin) {
  try {
    // Split salt, IV and encrypted data
    const parts = encryptedPrivateKey.split(':');

    // Check if it's the new format (salt:iv:data) or old format (iv:data)
    let salt, iv, encryptedData;

    if (parts.length === 3) {
      // New PBKDF2 format
      salt = Buffer.from(parts[0], 'hex');
      iv = Buffer.from(parts[1], 'hex');
      encryptedData = parts[2];

      // Derive key using PBKDF2
      const key = deriveKeyFromPin(pin, salt);

      // Create decipher and decrypt
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } else if (parts.length === 2) {
      // Old SHA-256 format (for migration compatibility)
      // THIS IS INSECURE - Only here for migrating existing users
      iv = Buffer.from(parts[0], 'hex');
      encryptedData = parts[1];

      // Old insecure key derivation (SHA-256 only)
      const key = crypto.createHash('sha256').update(String(pin)).digest();

      // Create decipher and decrypt
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } else {
      throw new Error('Invalid encrypted key format');
    }
  } catch (error) {
    throw new Error('Invalid PIN or corrupted data');
  }
}

/**
 * Hashes a PIN for secure storage (for verification) using PBKDF2
 * @param {string} pin - The 4-digit PIN
 * @returns {string} - Hashed PIN in format: salt:hash
 */
function hashPin(pin) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(String(pin), salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

  return salt.toString('hex') + ':' + hash.toString('hex');
}

/**
 * Verifies a PIN against its hash using constant-time comparison
 * @param {string} pin - The PIN to verify
 * @param {string} hashedPin - The stored hash (salt:hash format)
 * @returns {boolean} - True if PIN matches
 */
function verifyPin(pin, hashedPin) {
  try {
    // Split salt and hash
    const parts = hashedPin.split(':');

    // Check if it's new PBKDF2 format or old SHA-256 format
    if (parts.length === 2) {
      // New PBKDF2 format
      const salt = Buffer.from(parts[0], 'hex');
      const storedHash = Buffer.from(parts[1], 'hex');

      // Derive hash from input PIN
      const inputHash = crypto.pbkdf2Sync(
        String(pin),
        salt,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        'sha256'
      );

      // Constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(storedHash, inputHash);
    } else if (parts.length === 1) {
      // Old SHA-256 format (for migration compatibility)
      // THIS IS INSECURE - Only here for migrating existing users
      const inputHash = crypto.createHash('sha256').update(String(pin)).digest('hex');

      // Still use timing-safe comparison even for old format
      return crypto.timingSafeEqual(Buffer.from(hashedPin, 'hex'), Buffer.from(inputHash, 'hex'));
    } else {
      return false;
    }
  } catch (error) {
    console.error('PIN verification error:', error.message);
    return false;
  }
}

/**
 * Checks if a private key is using the old insecure encryption
 * @param {string} encryptedPrivateKey - The encrypted private key
 * @returns {boolean} - True if using old format
 */
function isOldEncryptionFormat(encryptedPrivateKey) {
  const parts = encryptedPrivateKey.split(':');
  return parts.length === 2; // Old format has only iv:data
}

/**
 * Checks if a PIN hash is using the old insecure format
 * @param {string} hashedPin - The hashed PIN
 * @returns {boolean} - True if using old format
 */
function isOldPinHashFormat(hashedPin) {
  const parts = hashedPin.split(':');
  return parts.length === 1; // Old format has no salt separator
}

module.exports = {
  encryptPrivateKey,
  decryptPrivateKey,
  hashPin,
  verifyPin,
  isOldEncryptionFormat,
  isOldPinHashFormat,
};
