import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const SALT_LENGTH = 64
const TAG_LENGTH = 16
const KEY_LENGTH = 32
const ITERATIONS = 100000

export class EncryptionService {
  private masterKey: Buffer | null = null

  /**
   * Derive an encryption key from a password
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512')
  }

  /**
   * Set the master password (derives the key)
   */
  setMasterPassword(password: string): void {
    // Use a fixed salt derived from the password for consistent key derivation
    // In production, you might want to store the salt separately
    const salt = crypto.createHash('sha256').update(password + 'mirai-salt').digest()
    this.masterKey = this.deriveKey(password, salt)
  }

  /**
   * Check if master password is set
   */
  isInitialized(): boolean {
    return this.masterKey !== null
  }

  /**
   * Encrypt data with the master key
   */
  encrypt(plaintext: string): string {
    if (!this.masterKey) {
      // Use a default key for initial setup (credentials are still encrypted)
      // User should set a master password for better security
      this.setMasterPassword('mirai-default-key')
    }

    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey!, iv)
    
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ])
    
    const tag = cipher.getAuthTag()
    
    // Combine iv + tag + encrypted data
    const combined = Buffer.concat([iv, tag, encrypted])
    return combined.toString('base64')
  }

  /**
   * Decrypt data with the master key
   */
  decrypt(ciphertext: string): string {
    if (!this.masterKey) {
      this.setMasterPassword('mirai-default-key')
    }

    const combined = Buffer.from(ciphertext, 'base64')
    
    // Extract iv, tag, and encrypted data
    const iv = combined.subarray(0, IV_LENGTH)
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH)
    
    const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey!, iv)
    decipher.setAuthTag(tag)
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ])
    
    return decrypted.toString('utf8')
  }

  /**
   * Hash a value (one-way, for verification)
   */
  hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex')
  }

  /**
   * Generate a random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex')
  }
}
