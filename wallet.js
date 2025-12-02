/**
 * SuperAxeCoin Web Wallet
 * Client-side wallet with real key generation and transaction signing
 */

class SuperAxeWallet {
    constructor() {
        // SuperAxeCoin network parameters (from chainparams.cpp)
        this.network = {
            pubKeyHash: 63,      // 'S' addresses (mainnet)
            scriptHash: 75,      // 'X' addresses (P2SH)
            wif: 191,            // Private key prefix
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

    // Convert Uint8Array to CryptoJS WordArray
    uint8ArrayToWordArray(u8arr) {
        const words = [];
        for (let i = 0; i < u8arr.length; i++) {
            words[i >>> 2] |= u8arr[i] << (24 - (i % 4) * 8);
        }
        return CryptoJS.lib.WordArray.create(words, u8arr.length);
    }

    // Convert CryptoJS WordArray to Uint8Array
    wordArrayToUint8Array(wordArray) {
        const words = wordArray.words;
        const sigBytes = wordArray.sigBytes;
        const u8 = new Uint8Array(sigBytes);
        for (let i = 0; i < sigBytes; i++) {
            u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        }
        return u8;
    }

    // SHA256 hash using CryptoJS
    sha256(data) {
        let wordArray;
        if (data instanceof Uint8Array) {
            wordArray = this.uint8ArrayToWordArray(data);
        } else if (typeof data === 'string') {
            wordArray = CryptoJS.enc.Utf8.parse(data);
        } else {
            wordArray = this.uint8ArrayToWordArray(new Uint8Array(data));
        }
        const hash = CryptoJS.SHA256(wordArray);
        return this.wordArrayToUint8Array(hash);
    }

    // Double SHA256
    hash256(data) {
        const first = this.sha256(data);
        return this.sha256(first);
    }

    // RIPEMD160 using CryptoJS
    ripemd160(data) {
        let wordArray;
        if (data instanceof Uint8Array) {
            wordArray = this.uint8ArrayToWordArray(data);
        } else {
            wordArray = this.uint8ArrayToWordArray(new Uint8Array(data));
        }
        const hash = CryptoJS.RIPEMD160(wordArray);
        return this.wordArrayToUint8Array(hash);
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
    base58CheckEncode(version, payload) {
        const data = new Uint8Array([version, ...payload]);
        const checksum = this.hash256(data);
        const full = new Uint8Array([...data, ...checksum.slice(0, 4)]);
        return this.base58Encode(full);
    }

    // Base58Check decode
    base58CheckDecode(str) {
        const data = this.base58Decode(str);
        const payload = data.slice(0, -4);
        const checksum = data.slice(-4);
        const hash = this.hash256(payload);

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
    generateWallet() {
        // Generate 32 random bytes for private key
        const privateKey = this.getRandomBytes(32);

        // Derive public key using secp256k1
        const publicKey = this.derivePublicKey(privateKey);

        // Derive address from public key
        const address = this.publicKeyToAddress(publicKey);

        // Create WIF (Wallet Import Format) for private key
        const wif = this.privateKeyToWIF(privateKey);

        this.wallet = {
            privateKey: privateKey,
            publicKey: publicKey,
            address: address,
            wif: wif
        };

        return this.wallet;
    }

    // Derive public key from private key using secp256k1
    derivePublicKey(privateKey) {
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
    publicKeyToAddress(publicKey) {
        // SHA256 of public key
        const sha256Hash = this.sha256(publicKey);

        // RIPEMD160 of SHA256 hash
        const pubKeyHash = this.ripemd160(sha256Hash);

        // Base58Check encode with version byte
        return this.base58CheckEncode(this.network.pubKeyHash, pubKeyHash);
    }

    // Convert private key to WIF format
    privateKeyToWIF(privateKey) {
        // Add compression flag
        const extended = new Uint8Array([...privateKey, 0x01]);
        return this.base58CheckEncode(this.network.wif, extended);
    }

    // Import wallet from WIF
    importFromWIF(wif) {
        const decoded = this.base58CheckDecode(wif);

        if (decoded.version !== this.network.wif) {
            throw new Error('Invalid WIF version');
        }

        // Remove compression flag if present
        let privateKey = decoded.payload;
        if (privateKey.length === 33 && privateKey[32] === 0x01) {
            privateKey = privateKey.slice(0, 32);
        }

        const publicKey = this.derivePublicKey(privateKey);
        const address = this.publicKeyToAddress(publicKey);

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

}

// Export for use
window.SuperAxeWallet = SuperAxeWallet;
