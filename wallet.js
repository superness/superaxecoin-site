/**
 * SuperAxeCoin Web Wallet
 * Client-side wallet with real key generation and transaction signing
 */

class SuperAxeWallet {
    constructor() {
        // SuperAxeCoin network parameters (from chainparams.cpp)
        this.network = {
            pubKeyHash: 76,      // 'X' addresses
            scriptHash: 16,      // '7' addresses
            wif: 204,            // Private key prefix
            bech32: 'axe'
        };

        this.wallet = null;
        this.API_URL = 'https://api.superaxecoin.com';
    }

    // Generate cryptographically secure random bytes
    getRandomBytes(length) {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return array;
    }

    // SHA256 hash
    async sha256(data) {
        const buffer = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : data;
        const hash = await crypto.subtle.digest('SHA-256', buffer);
        return new Uint8Array(hash);
    }

    // Double SHA256
    async hash256(data) {
        const first = await this.sha256(data);
        return await this.sha256(first);
    }

    // RIPEMD160 (simplified implementation)
    ripemd160(data) {
        // Using a minimal RIPEMD160 implementation
        return this._ripemd160(data);
    }

    // Base58 alphabet
    static BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

    // Base58 encode
    base58Encode(buffer) {
        const digits = [0];
        for (let i = 0; i < buffer.length; i++) {
            let carry = buffer[i];
            for (let j = 0; j < digits.length; j++) {
                carry += digits[j] << 8;
                digits[j] = carry % 58;
                carry = (carry / 58) | 0;
            }
            while (carry > 0) {
                digits.push(carry % 58);
                carry = (carry / 58) | 0;
            }
        }

        let result = '';
        // Leading zeros
        for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
            result += SuperAxeWallet.BASE58_ALPHABET[0];
        }
        // Convert digits to string
        for (let i = digits.length - 1; i >= 0; i--) {
            result += SuperAxeWallet.BASE58_ALPHABET[digits[i]];
        }
        return result;
    }

    // Base58 decode
    base58Decode(str) {
        const bytes = [0];
        for (let i = 0; i < str.length; i++) {
            const c = str[i];
            const charIndex = SuperAxeWallet.BASE58_ALPHABET.indexOf(c);
            if (charIndex === -1) throw new Error('Invalid base58 character');

            let carry = charIndex;
            for (let j = 0; j < bytes.length; j++) {
                carry += bytes[j] * 58;
                bytes[j] = carry & 0xff;
                carry >>= 8;
            }
            while (carry > 0) {
                bytes.push(carry & 0xff);
                carry >>= 8;
            }
        }

        // Leading zeros
        for (let i = 0; i < str.length && str[i] === SuperAxeWallet.BASE58_ALPHABET[0]; i++) {
            bytes.push(0);
        }

        return new Uint8Array(bytes.reverse());
    }

    // Base58Check encode
    async base58CheckEncode(version, payload) {
        const data = new Uint8Array([version, ...payload]);
        const checksum = await this.hash256(data);
        const full = new Uint8Array([...data, ...checksum.slice(0, 4)]);
        return this.base58Encode(full);
    }

    // Base58Check decode
    async base58CheckDecode(str) {
        const data = this.base58Decode(str);
        const payload = data.slice(0, -4);
        const checksum = data.slice(-4);
        const hash = await this.hash256(payload);

        for (let i = 0; i < 4; i++) {
            if (checksum[i] !== hash[i]) {
                throw new Error('Invalid checksum');
            }
        }

        return {
            version: payload[0],
            payload: payload.slice(1)
        };
    }

    // Generate a new wallet
    async generateWallet() {
        // Generate 32 random bytes for private key
        const privateKey = this.getRandomBytes(32);

        // Derive public key using secp256k1
        const publicKey = await this.derivePublicKey(privateKey);

        // Derive address from public key
        const address = await this.publicKeyToAddress(publicKey);

        // Create WIF (Wallet Import Format) for private key
        const wif = await this.privateKeyToWIF(privateKey);

        this.wallet = {
            privateKey: privateKey,
            publicKey: publicKey,
            address: address,
            wif: wif
        };

        return this.wallet;
    }

    // Derive public key from private key using secp256k1
    async derivePublicKey(privateKey) {
        // Use the elliptic curve library (loaded via CDN)
        if (typeof elliptic === 'undefined') {
            throw new Error('Elliptic library not loaded');
        }

        const ec = new elliptic.ec('secp256k1');
        const keyPair = ec.keyFromPrivate(privateKey);
        const pubPoint = keyPair.getPublic();

        // Compressed public key (33 bytes)
        const prefix = pubPoint.getY().isEven() ? 0x02 : 0x03;
        const x = pubPoint.getX().toArray('be', 32);

        return new Uint8Array([prefix, ...x]);
    }

    // Convert public key to address
    async publicKeyToAddress(publicKey) {
        // SHA256 of public key
        const sha256Hash = await this.sha256(publicKey);

        // RIPEMD160 of SHA256 hash
        const pubKeyHash = this.ripemd160(sha256Hash);

        // Base58Check encode with version byte
        return await this.base58CheckEncode(this.network.pubKeyHash, pubKeyHash);
    }

    // Convert private key to WIF format
    async privateKeyToWIF(privateKey) {
        // Add compression flag
        const extended = new Uint8Array([...privateKey, 0x01]);
        return await this.base58CheckEncode(this.network.wif, extended);
    }

    // Import wallet from WIF
    async importFromWIF(wif) {
        const decoded = await this.base58CheckDecode(wif);

        if (decoded.version !== this.network.wif) {
            throw new Error('Invalid WIF version');
        }

        // Remove compression flag if present
        let privateKey = decoded.payload;
        if (privateKey.length === 33 && privateKey[32] === 0x01) {
            privateKey = privateKey.slice(0, 32);
        }

        const publicKey = await this.derivePublicKey(privateKey);
        const address = await this.publicKeyToAddress(publicKey);

        this.wallet = {
            privateKey: privateKey,
            publicKey: publicKey,
            address: address,
            wif: wif
        };

        return this.wallet;
    }

    // Get balance from API
    async getBalance(address) {
        const response = await fetch(`${this.API_URL}/api/address/${address || this.wallet?.address}/balance`);
        if (!response.ok) throw new Error('Failed to fetch balance');
        const data = await response.json();
        return data.balance / 100000000; // Convert satoshis to AXE
    }

    // Get UTXOs from API
    async getUTXOs(address) {
        const response = await fetch(`${this.API_URL}/api/address/${address || this.wallet?.address}/utxos`);
        if (!response.ok) throw new Error('Failed to fetch UTXOs');
        return await response.json();
    }

    // Create and sign a transaction
    async createTransaction(toAddress, amount, feeRate = 1) {
        if (!this.wallet) throw new Error('No wallet loaded');

        const amountSats = Math.floor(amount * 100000000);
        const utxos = await this.getUTXOs();

        // Select UTXOs (simple: use all)
        let totalInput = 0;
        const inputs = [];

        for (const utxo of utxos) {
            inputs.push({
                txid: utxo.txid,
                vout: utxo.vout,
                value: utxo.value,
                scriptPubKey: utxo.scriptPubKey
            });
            totalInput += utxo.value;

            // Stop if we have enough (with estimated fee)
            if (totalInput >= amountSats + 1000) break;
        }

        if (totalInput < amountSats) {
            throw new Error('Insufficient funds');
        }

        // Estimate fee (simple: 1 sat/byte, ~250 bytes for typical tx)
        const estimatedSize = 10 + (inputs.length * 148) + (2 * 34);
        const fee = estimatedSize * feeRate;

        if (totalInput < amountSats + fee) {
            throw new Error('Insufficient funds for fee');
        }

        const change = totalInput - amountSats - fee;

        // Build transaction
        const tx = await this.buildTransaction(inputs, [
            { address: toAddress, value: amountSats },
            ...(change > 546 ? [{ address: this.wallet.address, value: change }] : [])
        ]);

        return tx;
    }

    // Build and serialize transaction
    async buildTransaction(inputs, outputs) {
        // Transaction structure
        let tx = [];

        // Version (4 bytes, little endian)
        tx.push(...this.intToLE(1, 4));

        // Input count (varint)
        tx.push(...this.varint(inputs.length));

        // Inputs
        for (const input of inputs) {
            // Previous txid (32 bytes, reversed)
            tx.push(...this.hexToBytes(input.txid).reverse());
            // Previous vout (4 bytes, LE)
            tx.push(...this.intToLE(input.vout, 4));
            // ScriptSig placeholder (will be replaced when signing)
            tx.push(0x00); // Empty for now
            // Sequence (4 bytes)
            tx.push(...this.intToLE(0xffffffff, 4));
        }

        // Output count
        tx.push(...this.varint(outputs.length));

        // Outputs
        for (const output of outputs) {
            // Value (8 bytes, LE)
            tx.push(...this.intToLE(output.value, 8));
            // ScriptPubKey
            const scriptPubKey = await this.addressToScriptPubKey(output.address);
            tx.push(...this.varint(scriptPubKey.length));
            tx.push(...scriptPubKey);
        }

        // Locktime (4 bytes)
        tx.push(...this.intToLE(0, 4));

        // Now sign each input
        const signedTx = await this.signTransaction(new Uint8Array(tx), inputs, outputs);

        return this.bytesToHex(signedTx);
    }

    // Sign transaction inputs
    async signTransaction(txTemplate, inputs, outputs) {
        const ec = new elliptic.ec('secp256k1');
        const keyPair = ec.keyFromPrivate(this.wallet.privateKey);

        let signedInputs = [];

        for (let i = 0; i < inputs.length; i++) {
            // Create signing hash for this input
            const sigHash = await this.createSigHash(txTemplate, i, inputs[i], outputs);

            // Sign with private key
            const signature = keyPair.sign(sigHash, { canonical: true });
            const derSig = signature.toDER();

            // Add SIGHASH_ALL byte
            const sigWithHashType = new Uint8Array([...derSig, 0x01]);

            // Create scriptSig: <sig> <pubkey>
            const scriptSig = new Uint8Array([
                sigWithHashType.length, ...sigWithHashType,
                this.wallet.publicKey.length, ...this.wallet.publicKey
            ]);

            signedInputs.push(scriptSig);
        }

        // Rebuild transaction with signatures
        let tx = [];

        // Version
        tx.push(...this.intToLE(1, 4));

        // Input count
        tx.push(...this.varint(inputs.length));

        // Inputs with signatures
        for (let i = 0; i < inputs.length; i++) {
            tx.push(...this.hexToBytes(inputs[i].txid).reverse());
            tx.push(...this.intToLE(inputs[i].vout, 4));
            tx.push(...this.varint(signedInputs[i].length));
            tx.push(...signedInputs[i]);
            tx.push(...this.intToLE(0xffffffff, 4));
        }

        // Output count
        tx.push(...this.varint(outputs.length));

        // Outputs
        for (const output of outputs) {
            tx.push(...this.intToLE(output.value, 8));
            const scriptPubKey = await this.addressToScriptPubKey(output.address);
            tx.push(...this.varint(scriptPubKey.length));
            tx.push(...scriptPubKey);
        }

        // Locktime
        tx.push(...this.intToLE(0, 4));

        return new Uint8Array(tx);
    }

    // Create signature hash for input
    async createSigHash(txTemplate, inputIndex, input, outputs) {
        // Simplified SIGHASH_ALL implementation
        let tx = [];

        // Version
        tx.push(...this.intToLE(1, 4));

        // Parse original inputs from template
        let pos = 4;
        const inputCount = txTemplate[pos];
        pos++;

        tx.push(...this.varint(inputCount));

        for (let i = 0; i < inputCount; i++) {
            // txid (32 bytes)
            tx.push(...txTemplate.slice(pos, pos + 32));
            pos += 32;
            // vout (4 bytes)
            tx.push(...txTemplate.slice(pos, pos + 4));
            pos += 4;

            // scriptSig - use scriptPubKey for input being signed, empty for others
            if (i === inputIndex) {
                const pubKeyHash = (await this.base58CheckDecode(this.wallet.address)).payload;
                const script = [0x76, 0xa9, 0x14, ...pubKeyHash, 0x88, 0xac];
                tx.push(...this.varint(script.length));
                tx.push(...script);
            } else {
                tx.push(0x00);
            }

            // Skip original scriptSig
            const scriptLen = txTemplate[pos];
            pos += 1 + scriptLen;

            // sequence (4 bytes)
            tx.push(...txTemplate.slice(pos, pos + 4));
            pos += 4;
        }

        // Output count
        tx.push(...this.varint(outputs.length));

        // Outputs
        for (const output of outputs) {
            tx.push(...this.intToLE(output.value, 8));
            const scriptPubKey = await this.addressToScriptPubKey(output.address);
            tx.push(...this.varint(scriptPubKey.length));
            tx.push(...scriptPubKey);
        }

        // Locktime
        tx.push(...this.intToLE(0, 4));

        // SIGHASH_ALL
        tx.push(...this.intToLE(1, 4));

        // Double SHA256
        return await this.hash256(new Uint8Array(tx));
    }

    // Convert address to scriptPubKey
    async addressToScriptPubKey(address) {
        const decoded = await this.base58CheckDecode(address);
        const pubKeyHash = decoded.payload;

        // P2PKH script: OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
        return new Uint8Array([0x76, 0xa9, 0x14, ...pubKeyHash, 0x88, 0xac]);
    }

    // Broadcast transaction
    async broadcastTransaction(txHex) {
        const response = await fetch(`${this.API_URL}/api/broadcast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hex: txHex })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data.txid;
    }

    // Helper: Integer to little-endian bytes
    intToLE(num, bytes) {
        const result = [];
        for (let i = 0; i < bytes; i++) {
            result.push(num & 0xff);
            num = Math.floor(num / 256);
        }
        return result;
    }

    // Helper: Variable-length integer
    varint(num) {
        if (num < 0xfd) return [num];
        if (num <= 0xffff) return [0xfd, num & 0xff, (num >> 8) & 0xff];
        if (num <= 0xffffffff) return [0xfe, ...this.intToLE(num, 4)];
        return [0xff, ...this.intToLE(num, 8)];
    }

    // Helper: Hex string to bytes
    hexToBytes(hex) {
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.substr(i, 2), 16));
        }
        return new Uint8Array(bytes);
    }

    // Helper: Bytes to hex string
    bytesToHex(bytes) {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Save wallet to localStorage (encrypted)
    async saveWallet(password) {
        if (!this.wallet) throw new Error('No wallet to save');

        const data = JSON.stringify({
            wif: this.wallet.wif,
            address: this.wallet.address
        });

        // Simple encryption using password
        const encrypted = await this.encrypt(data, password);
        localStorage.setItem('superaxe_wallet', encrypted);
    }

    // Load wallet from localStorage
    async loadWallet(password) {
        const encrypted = localStorage.getItem('superaxe_wallet');
        if (!encrypted) return null;

        try {
            const data = await this.decrypt(encrypted, password);
            const { wif } = JSON.parse(data);
            return await this.importFromWIF(wif);
        } catch (e) {
            throw new Error('Invalid password or corrupted wallet');
        }
    }

    // Check if wallet exists
    hasStoredWallet() {
        return localStorage.getItem('superaxe_wallet') !== null;
    }

    // Delete stored wallet
    deleteWallet() {
        localStorage.removeItem('superaxe_wallet');
        this.wallet = null;
    }

    // Simple encryption
    async encrypt(text, password) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: enc.encode('superaxe'), iterations: 100000, hash: 'SHA-256' },
            keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, key, enc.encode(text)
        );
        return this.bytesToHex(iv) + ':' + this.bytesToHex(new Uint8Array(encrypted));
    }

    // Simple decryption
    async decrypt(encrypted, password) {
        const [ivHex, dataHex] = encrypted.split(':');
        const iv = this.hexToBytes(ivHex);
        const data = this.hexToBytes(dataHex);

        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: enc.encode('superaxe'), iterations: 100000, hash: 'SHA-256' },
            keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
        );
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv }, key, data
        );
        return new TextDecoder().decode(decrypted);
    }

    // RIPEMD160 implementation
    _ripemd160(message) {
        const K1 = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
        const K2 = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

        const R1 = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12,1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13];
        const R2 = [5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12,6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13,8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11];
        const S1 = [11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8,7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5,11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6];
        const S2 = [8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6,9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5,15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11];

        const f = (j, x, y, z) => {
            if (j < 16) return x ^ y ^ z;
            if (j < 32) return (x & y) | (~x & z);
            if (j < 48) return (x | ~y) ^ z;
            if (j < 64) return (x & z) | (y & ~z);
            return x ^ (y | ~z);
        };

        const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

        // Padding
        const msg = new Uint8Array(message);
        const bitLen = msg.length * 8;
        const padLen = (msg.length % 64 < 56) ? 56 - msg.length % 64 : 120 - msg.length % 64;
        const padded = new Uint8Array(msg.length + padLen + 8);
        padded.set(msg);
        padded[msg.length] = 0x80;

        // Length in bits, little-endian
        for (let i = 0; i < 8; i++) {
            padded[padded.length - 8 + i] = (bitLen >>> (i * 8)) & 0xff;
        }

        // Initial hash values
        let h0 = 0x67452301;
        let h1 = 0xefcdab89;
        let h2 = 0x98badcfe;
        let h3 = 0x10325476;
        let h4 = 0xc3d2e1f0;

        // Process blocks
        for (let i = 0; i < padded.length; i += 64) {
            const X = [];
            for (let j = 0; j < 16; j++) {
                X[j] = padded[i + j*4] | (padded[i + j*4 + 1] << 8) |
                       (padded[i + j*4 + 2] << 16) | (padded[i + j*4 + 3] << 24);
            }

            let al = h0, bl = h1, cl = h2, dl = h3, el = h4;
            let ar = h0, br = h1, cr = h2, dr = h3, er = h4;

            for (let j = 0; j < 80; j++) {
                const jj = Math.floor(j / 16);
                let t = (al + f(j, bl, cl, dl) + X[R1[j]] + K1[jj]) >>> 0;
                t = (rotl(t, S1[j]) + el) >>> 0;
                al = el; el = dl; dl = rotl(cl, 10); cl = bl; bl = t;

                t = (ar + f(79 - j, br, cr, dr) + X[R2[j]] + K2[jj]) >>> 0;
                t = (rotl(t, S2[j]) + er) >>> 0;
                ar = er; er = dr; dr = rotl(cr, 10); cr = br; br = t;
            }

            const t = (h1 + cl + dr) >>> 0;
            h1 = (h2 + dl + er) >>> 0;
            h2 = (h3 + el + ar) >>> 0;
            h3 = (h4 + al + br) >>> 0;
            h4 = (h0 + bl + cr) >>> 0;
            h0 = t;
        }

        // Output
        const result = new Uint8Array(20);
        [h0, h1, h2, h3, h4].forEach((h, i) => {
            result[i*4] = h & 0xff;
            result[i*4 + 1] = (h >>> 8) & 0xff;
            result[i*4 + 2] = (h >>> 16) & 0xff;
            result[i*4 + 3] = (h >>> 24) & 0xff;
        });

        return result;
    }
}

// Export for use
window.SuperAxeWallet = SuperAxeWallet;
