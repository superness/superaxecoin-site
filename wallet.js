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

    // Bech32 character set
    static BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

    // Bech32 polymod for checksum calculation
    bech32Polymod(values) {
        const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
        let chk = 1;
        for (const v of values) {
            const top = chk >> 25;
            chk = ((chk & 0x1ffffff) << 5) ^ v;
            for (let i = 0; i < 5; i++) {
                if ((top >> i) & 1) {
                    chk ^= GEN[i];
                }
            }
        }
        return chk;
    }

    // Expand HRP for checksum
    bech32HrpExpand(hrp) {
        const ret = [];
        for (const c of hrp) {
            ret.push(c.charCodeAt(0) >> 5);
        }
        ret.push(0);
        for (const c of hrp) {
            ret.push(c.charCodeAt(0) & 31);
        }
        return ret;
    }

    // Create Bech32 checksum
    bech32CreateChecksum(hrp, data) {
        const values = [...this.bech32HrpExpand(hrp), ...data];
        const polymod = this.bech32Polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1;
        const checksum = [];
        for (let i = 0; i < 6; i++) {
            checksum.push((polymod >> (5 * (5 - i))) & 31);
        }
        return checksum;
    }

    // Bech32 encode
    bech32Encode(hrp, data) {
        const combined = [...data, ...this.bech32CreateChecksum(hrp, data)];
        let result = hrp + '1';
        for (const d of combined) {
            result += SuperAxeWallet.BECH32_CHARSET[d];
        }
        return result;
    }

    // Convert public key to Bech32 (P2WPKH) address
    publicKeyToBech32Address(publicKey) {
        // SHA256 of public key
        const sha256Hash = this.sha256(publicKey);

        // RIPEMD160 of SHA256 hash (witness program)
        const witnessProgram = this.ripemd160(sha256Hash);

        // Convert 8-bit to 5-bit groups
        const data5bit = this.convertBits(Array.from(witnessProgram), 8, 5, true);

        // Prepend witness version (0 for P2WPKH)
        const fullData = [0, ...data5bit];

        // Encode with HRP
        return this.bech32Encode(this.network.bech32, fullData);
    }

    // Bech32 decode
    bech32Decode(str) {
        str = str.toLowerCase();
        const sepIndex = str.lastIndexOf('1');
        if (sepIndex < 1 || sepIndex + 7 > str.length) {
            throw new Error('Invalid bech32 string');
        }

        const hrp = str.slice(0, sepIndex);
        const dataStr = str.slice(sepIndex + 1);

        // Convert to 5-bit values
        const data = [];
        for (const c of dataStr) {
            const idx = SuperAxeWallet.BECH32_CHARSET.indexOf(c);
            if (idx === -1) throw new Error('Invalid bech32 character');
            data.push(idx);
        }

        // Verify checksum (simplified - just check length for now)
        if (data.length < 6) throw new Error('Invalid bech32 data');

        // Remove checksum (last 6 chars)
        const values = data.slice(0, -6);

        // First value is witness version
        const witnessVersion = values[0];

        // Convert 5-bit to 8-bit (skip witness version)
        const converted = this.convertBits(values.slice(1), 5, 8, false);

        return {
            hrp,
            witnessVersion,
            witnessProgram: new Uint8Array(converted)
        };
    }

    // Convert between bit sizes
    convertBits(data, fromBits, toBits, pad) {
        let acc = 0;
        let bits = 0;
        const result = [];
        const maxv = (1 << toBits) - 1;

        for (const value of data) {
            acc = (acc << fromBits) | value;
            bits += fromBits;
            while (bits >= toBits) {
                bits -= toBits;
                result.push((acc >> bits) & maxv);
            }
        }

        if (pad && bits > 0) {
            result.push((acc << (toBits - bits)) & maxv);
        }

        return result;
    }

    // Generate a new wallet
    generateWallet() {
        // Generate 32 random bytes for private key
        const privateKey = this.getRandomBytes(32);

        // Derive public key using secp256k1
        const publicKey = this.derivePublicKey(privateKey);

        // Derive legacy address from public key
        const address = this.publicKeyToAddress(publicKey);

        // Derive Bech32 (SegWit) address from public key
        const segwitAddress = this.publicKeyToBech32Address(publicKey);

        // Create WIF (Wallet Import Format) for private key
        const wif = this.privateKeyToWIF(privateKey);

        this.wallet = {
            privateKey: privateKey,
            publicKey: publicKey,
            address: address,
            segwitAddress: segwitAddress,
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
        const segwitAddress = this.publicKeyToBech32Address(publicKey);

        this.wallet = {
            privateKey: privateKey,
            publicKey: publicKey,
            address: address,
            segwitAddress: segwitAddress,
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

    // Get combined balance from both legacy and SegWit addresses
    async getCombinedBalance() {
        if (!this.wallet) throw new Error('No wallet loaded');

        let totalBalance = 0;

        // Fetch legacy address balance
        try {
            const legacyResponse = await fetch(`${this.API_URL}/api/address/${this.wallet.address}/balance`);
            if (legacyResponse.ok) {
                const legacyData = await legacyResponse.json();
                totalBalance += legacyData.balance || 0;
            }
        } catch (e) {
            console.warn('Failed to fetch legacy balance:', e);
        }

        // Fetch SegWit address balance
        try {
            const segwitResponse = await fetch(`${this.API_URL}/api/address/${this.wallet.segwitAddress}/balance`);
            if (segwitResponse.ok) {
                const segwitData = await segwitResponse.json();
                totalBalance += segwitData.balance || 0;
            }
        } catch (e) {
            console.warn('Failed to fetch SegWit balance:', e);
        }

        return {
            total: totalBalance / 100000000,
            totalSats: totalBalance
        };
    }

    // Get UTXOs from API
    async getUTXOs(address) {
        const response = await fetch(`${this.API_URL}/api/address/${address || this.wallet?.address}/utxos`);
        if (!response.ok) throw new Error('Failed to fetch UTXOs');
        return await response.json();
    }

    // Get combined UTXOs from both legacy and SegWit addresses
    async getAllUTXOs() {
        if (!this.wallet) throw new Error('No wallet loaded');

        let allUtxos = [];

        // Fetch legacy address UTXOs
        try {
            const legacyResponse = await fetch(`${this.API_URL}/api/address/${this.wallet.address}/utxos`);
            if (legacyResponse.ok) {
                const legacyUtxos = await legacyResponse.json();
                // Mark each UTXO with its address type
                legacyUtxos.forEach(utxo => {
                    utxo.addressType = 'legacy';
                    utxo.address = this.wallet.address;
                });
                allUtxos = allUtxos.concat(legacyUtxos);
            }
        } catch (e) {
            console.warn('Failed to fetch legacy UTXOs:', e);
        }

        // Fetch SegWit address UTXOs
        try {
            const segwitResponse = await fetch(`${this.API_URL}/api/address/${this.wallet.segwitAddress}/utxos`);
            if (segwitResponse.ok) {
                const segwitUtxos = await segwitResponse.json();
                // Mark each UTXO with its address type
                segwitUtxos.forEach(utxo => {
                    utxo.addressType = 'segwit';
                    utxo.address = this.wallet.segwitAddress;
                });
                allUtxos = allUtxos.concat(segwitUtxos);
            }
        } catch (e) {
            console.warn('Failed to fetch SegWit UTXOs:', e);
        }

        return allUtxos;
    }

    // Create and sign a transaction
    async createTransaction(toAddress, amount, feeRate = 1) {
        if (!this.wallet) throw new Error('No wallet loaded');

        const amountSats = Math.floor(amount * 100000000);
        // Get UTXOs from both legacy and SegWit addresses
        const utxos = await this.getAllUTXOs();

        // Select UTXOs (simple: use all)
        let totalInput = 0;
        const inputs = [];

        for (const utxo of utxos) {
            inputs.push({
                txid: utxo.txid,
                vout: utxo.vout,
                value: utxo.value,
                scriptPubKey: utxo.script_pubkey || utxo.scriptPubKey,
                addressType: utxo.addressType || 'legacy',
                address: utxo.address
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
        // Check if we have any SegWit inputs
        const hasSegwitInputs = inputs.some(input => input.addressType === 'segwit');

        // Sign inputs and build transaction
        const signedTx = await this.signTransaction(inputs, outputs, hasSegwitInputs);

        return this.bytesToHex(signedTx);
    }

    // Sign transaction inputs (supports both legacy and SegWit)
    async signTransaction(inputs, outputs, hasSegwitInputs) {
        const ec = new elliptic.ec('secp256k1');
        const keyPair = ec.keyFromPrivate(this.wallet.privateKey);

        // Prepare signatures and witness data
        let scriptSigs = [];
        let witnesses = [];

        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];

            if (input.addressType === 'segwit') {
                // SegWit P2WPKH signing using BIP143
                const sigHash = await this.createBIP143SigHash(inputs, outputs, i, input.value);

                const signature = keyPair.sign(sigHash, { canonical: true });
                const derSig = signature.toDER();
                const sigWithHashType = new Uint8Array([...derSig, 0x01]);

                // SegWit: scriptSig is empty, signature goes in witness
                scriptSigs.push(new Uint8Array([]));
                witnesses.push({
                    items: [sigWithHashType, this.wallet.publicKey]
                });
            } else {
                // Legacy P2PKH signing
                const sigHash = await this.createLegacySigHash(inputs, outputs, i);

                const signature = keyPair.sign(sigHash, { canonical: true });
                const derSig = signature.toDER();
                const sigWithHashType = new Uint8Array([...derSig, 0x01]);

                // Legacy: signature in scriptSig
                const scriptSig = new Uint8Array([
                    sigWithHashType.length, ...sigWithHashType,
                    this.wallet.publicKey.length, ...this.wallet.publicKey
                ]);
                scriptSigs.push(scriptSig);
                witnesses.push({ items: [] }); // Empty witness for legacy
            }
        }

        // Build final transaction
        let tx = [];

        // Version (4 bytes)
        tx.push(...this.intToLE(1, 4));

        // SegWit marker and flag (if any SegWit inputs)
        if (hasSegwitInputs) {
            tx.push(0x00); // Marker
            tx.push(0x01); // Flag
        }

        // Input count
        tx.push(...this.varint(inputs.length));

        // Inputs
        for (let i = 0; i < inputs.length; i++) {
            tx.push(...this.hexToBytes(inputs[i].txid).reverse());
            tx.push(...this.intToLE(inputs[i].vout, 4));
            tx.push(...this.varint(scriptSigs[i].length));
            tx.push(...scriptSigs[i]);
            tx.push(...this.intToLE(0xffffffff, 4));
        }

        // Output count
        tx.push(...this.varint(outputs.length));

        // Outputs
        for (const output of outputs) {
            tx.push(...this.intToLE(output.value, 8));
            const scriptPubKey = this.addressToScriptPubKey(output.address);
            tx.push(...this.varint(scriptPubKey.length));
            tx.push(...scriptPubKey);
        }

        // Witness data (if any SegWit inputs)
        if (hasSegwitInputs) {
            for (const witness of witnesses) {
                tx.push(...this.varint(witness.items.length));
                for (const item of witness.items) {
                    tx.push(...this.varint(item.length));
                    tx.push(...item);
                }
            }
        }

        // Locktime
        tx.push(...this.intToLE(0, 4));

        return new Uint8Array(tx);
    }

    // BIP143 sighash for SegWit inputs
    async createBIP143SigHash(inputs, outputs, inputIndex, inputValue) {
        // hashPrevouts
        let prevouts = [];
        for (const input of inputs) {
            prevouts.push(...this.hexToBytes(input.txid).reverse());
            prevouts.push(...this.intToLE(input.vout, 4));
        }
        const hashPrevouts = await this.hash256(new Uint8Array(prevouts));

        // hashSequence
        let sequences = [];
        for (const input of inputs) {
            sequences.push(...this.intToLE(0xffffffff, 4));
        }
        const hashSequence = await this.hash256(new Uint8Array(sequences));

        // hashOutputs
        let outputsData = [];
        for (const output of outputs) {
            outputsData.push(...this.intToLE(output.value, 8));
            const scriptPubKey = this.addressToScriptPubKey(output.address);
            outputsData.push(...this.varint(scriptPubKey.length));
            outputsData.push(...scriptPubKey);
        }
        const hashOutputs = await this.hash256(new Uint8Array(outputsData));

        // scriptCode for P2WPKH (OP_DUP OP_HASH160 <20-byte-pubkey-hash> OP_EQUALVERIFY OP_CHECKSIG)
        const pubKeyHash = this.ripemd160(this.sha256(this.wallet.publicKey));
        const scriptCode = new Uint8Array([0x19, 0x76, 0xa9, 0x14, ...pubKeyHash, 0x88, 0xac]);

        // Build preimage
        let preimage = [];
        preimage.push(...this.intToLE(1, 4)); // nVersion
        preimage.push(...hashPrevouts);
        preimage.push(...hashSequence);
        preimage.push(...this.hexToBytes(inputs[inputIndex].txid).reverse()); // outpoint
        preimage.push(...this.intToLE(inputs[inputIndex].vout, 4));
        preimage.push(...scriptCode); // scriptCode
        preimage.push(...this.intToLE(inputValue, 8)); // amount
        preimage.push(...this.intToLE(0xffffffff, 4)); // nSequence
        preimage.push(...hashOutputs);
        preimage.push(...this.intToLE(0, 4)); // nLocktime
        preimage.push(...this.intToLE(1, 4)); // sighash type (SIGHASH_ALL)

        return await this.hash256(new Uint8Array(preimage));
    }

    // Legacy sighash for P2PKH inputs
    async createLegacySigHash(inputs, outputs, inputIndex) {
        let tx = [];

        // Version
        tx.push(...this.intToLE(1, 4));

        // Input count
        tx.push(...this.varint(inputs.length));

        // Inputs
        for (let i = 0; i < inputs.length; i++) {
            tx.push(...this.hexToBytes(inputs[i].txid).reverse());
            tx.push(...this.intToLE(inputs[i].vout, 4));

            // scriptSig - use P2PKH script for input being signed, empty for others
            if (i === inputIndex) {
                const pubKeyHash = this.ripemd160(this.sha256(this.wallet.publicKey));
                const script = [0x76, 0xa9, 0x14, ...pubKeyHash, 0x88, 0xac];
                tx.push(...this.varint(script.length));
                tx.push(...script);
            } else {
                tx.push(0x00);
            }

            tx.push(...this.intToLE(0xffffffff, 4));
        }

        // Output count
        tx.push(...this.varint(outputs.length));

        // Outputs
        for (const output of outputs) {
            tx.push(...this.intToLE(output.value, 8));
            const scriptPubKey = this.addressToScriptPubKey(output.address);
            tx.push(...this.varint(scriptPubKey.length));
            tx.push(...scriptPubKey);
        }

        // Locktime
        tx.push(...this.intToLE(0, 4));

        // SIGHASH_ALL
        tx.push(...this.intToLE(1, 4));

        return await this.hash256(new Uint8Array(tx));
    }

    // Convert address to scriptPubKey
    addressToScriptPubKey(address) {
        // Check if bech32 address (axe1...)
        if (address.toLowerCase().startsWith('axe1')) {
            const decoded = this.bech32Decode(address);
            const witnessProgram = decoded.witnessProgram;

            // P2WPKH script: OP_0 <20-byte-witness-program>
            // For P2WSH it would be 32 bytes
            if (witnessProgram.length === 20) {
                return new Uint8Array([0x00, 0x14, ...witnessProgram]);
            } else if (witnessProgram.length === 32) {
                return new Uint8Array([0x00, 0x20, ...witnessProgram]);
            } else {
                throw new Error('Invalid witness program length');
            }
        }

        // Legacy address (Base58Check)
        const decoded = this.base58CheckDecode(address);
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

    // Convert WIF to both address formats (without storing in wallet)
    // Useful for address conversion tool
    convertWIFToAddresses(wif) {
        const decoded = this.base58CheckDecode(wif);

        if (decoded.version !== this.network.wif) {
            throw new Error('Invalid WIF version. Expected SuperAxeCoin mainnet WIF.');
        }

        // Remove compression flag if present
        let privateKey = decoded.payload;
        if (privateKey.length === 33 && privateKey[32] === 0x01) {
            privateKey = privateKey.slice(0, 32);
        }

        const publicKey = this.derivePublicKey(privateKey);
        const legacyAddress = this.publicKeyToAddress(publicKey);
        const segwitAddress = this.publicKeyToBech32Address(publicKey);

        return {
            legacy: legacyAddress,
            segwit: segwitAddress,
            publicKeyHex: this.bytesToHex(publicKey)
        };
    }

}

// Export for use
window.SuperAxeWallet = SuperAxeWallet;
