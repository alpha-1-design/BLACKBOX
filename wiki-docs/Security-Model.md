# Security Model

BLACKBOX is built to ensure that user data is never exposed.

* **Vault Encryption:** AES-256-GCM is used for all stored secrets. 
* **Key Derivation:** We use PBKDF2-SHA256 with 150,000 iterations to turn your PIN into a cryptographically secure key.
* **Tamper Proofing:** GCM (Galois/Counter Mode) provides authentication; if your encrypted `localStorage` data is modified, the vault will fail to decrypt it.
