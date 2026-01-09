// SuperAxeCoin Website JavaScript
class SuperAxeWeb {
    constructor() {
        // API Configuration
        this.API_URL = 'https://api.superaxecoin.com';

        this.walletConnected = false;
        this.currentTab = 'blocks';
        this.apiAvailable = false;
        this.axeWallet = new SuperAxeWallet();
        this.cachedData = {
            blocks: [],
            transactions: [],
            info: null
        };
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupNavigation();
        this.setupDetailModal();
        await this.checkApiStatus();
        await this.loadExplorerData();
        await this.loadPoolStats();
        this.startDataRefresh();
        this.animateElements();
        this.setupParallax();
        this.setupHeroAnimations();
        this.handleDeepLink();
    }

    setupDetailModal() {
        const overlay = document.getElementById('detailModalOverlay');
        const closeBtn = document.getElementById('detailModalClose');

        // Close on X button
        closeBtn?.addEventListener('click', () => this.closeDetailModal());

        // Close on overlay click (outside modal)
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeDetailModal();
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeDetailModal();
        });
    }

    openDetailModal(content) {
        const overlay = document.getElementById('detailModalOverlay');
        const contentEl = document.getElementById('detailModalContent');
        if (overlay && contentEl) {
            contentEl.innerHTML = content;
            overlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    closeDetailModal() {
        const overlay = document.getElementById('detailModalOverlay');
        if (overlay) {
            overlay.style.display = 'none';
            document.body.style.overflow = '';
            // Clear URL params when closing
            if (window.history.replaceState) {
                window.history.replaceState({}, '', window.location.pathname);
            }
        }
    }

    handleDeepLink() {
        const params = new URLSearchParams(window.location.search);
        const block = params.get('block');
        const tx = params.get('tx');
        const address = params.get('address');

        if (block || tx || address) {
            // Scroll to explorer section
            setTimeout(() => {
                document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth' });
            }, 500);

            // Load the appropriate detail view
            setTimeout(async () => {
                if (block) await this.showBlockDetails(block);
                else if (tx) await this.showTransactionDetails(tx);
                else if (address) await this.showAddressDetails(address);
            }, 800);
        }
    }

    updateUrlParam(type, value) {
        if (window.history.replaceState) {
            const url = new URL(window.location);
            url.searchParams.set(type, value);
            window.history.replaceState({}, '', url);
        }
    }

    async checkApiStatus() {
        try {
            const response = await fetch(`${this.API_URL}/health`, {
                method: 'GET',
                timeout: 5000
            });
            if (response.ok) {
                this.apiAvailable = true;
                console.log('API connected successfully');
            }
        } catch (error) {
            console.warn('API not available, using demo data:', error.message);
            this.apiAvailable = false;
        }
    }

    async apiCall(endpoint) {
        if (!this.apiAvailable) {
            throw new Error('API not available');
        }

        const response = await fetch(`${this.API_URL}${endpoint}`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return response.json();
    }

    setupEventListeners() {
        // Mobile menu toggle
        const mobileToggle = document.getElementById('mobileToggle');
        mobileToggle?.addEventListener('click', this.toggleMobileMenu.bind(this));

        // Wallet connection
        // Connect Wallet button removed - MetaMask doesn't work with Bitcoin-based chains
        document.getElementById('webWalletConnect')?.addEventListener('click', this.createWebWallet.bind(this));
        document.getElementById('createWebWalletBtn')?.addEventListener('click', this.createWebWallet.bind(this));
        document.getElementById('importWalletBtn')?.addEventListener('click', () => this.importWalletFromFile());
        document.getElementById('walletFileInput')?.addEventListener('change', (e) => this.handleWalletFileImport(e));

        // Wallet actions
        document.getElementById('sendBtn')?.addEventListener('click', () => this.showSendForm());
        document.getElementById('receiveBtn')?.addEventListener('click', () => this.showReceiveAddress());
        document.getElementById('historyBtn')?.addEventListener('click', () => this.showTransactionHistory());
        document.getElementById('confirmSend')?.addEventListener('click', () => this.sendTransaction());

        // Address converter
        document.getElementById('openConverterBtn')?.addEventListener('click', () => this.openConverter());
        document.getElementById('closeConverterBtn')?.addEventListener('click', () => this.closeConverter());
        document.getElementById('convertAddressBtn')?.addEventListener('click', () => this.convertAddress());
        document.getElementById('toggleWifVisibility')?.addEventListener('click', () => this.toggleWifVisibility());

        // Copy buttons for converter results
        document.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.copy;
                const targetEl = document.getElementById(targetId);
                if (targetEl) {
                    navigator.clipboard.writeText(targetEl.textContent);
                    this.showNotification('Address copied!', 'success');
                }
            });
        });

        // Explorer search
        document.getElementById('searchBtn')?.addEventListener('click', this.performSearch.bind(this));
        document.getElementById('explorerSearch')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        // Explorer tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Smooth scroll for navigation
        document.querySelectorAll('a[href^="#"]').forEach(link => {
            link.addEventListener('click', this.smoothScroll.bind(this));
        });

        // Window scroll for navbar
        window.addEventListener('scroll', this.handleScroll.bind(this));
    }

    setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        const sections = document.querySelectorAll('section[id]');

        // Intersection Observer for active nav states
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    navLinks.forEach(link => link.classList.remove('active'));
                    const activeLink = document.querySelector(`[href="#${entry.target.id}"]`);
                    activeLink?.classList.add('active');
                }
            });
        }, { threshold: 0.3 });

        sections.forEach(section => observer.observe(section));
    }

    async loadExplorerData() {
        await Promise.all([
            this.loadBlockchainInfo(),
            this.loadBlocks(),
            this.loadTransactions()
        ]);
        this.displayNetworkStats();
    }

    async loadPoolStats() {
        try {
            // Use API proxy to bypass CORS
            const response = await fetch(`${this.API_URL}/api/pool/stats`);
            if (!response.ok) throw new Error('Pool API error');
            const data = await response.json();

            // Update pool hashrate
            const poolHashrateEl = document.getElementById('poolHashrate');
            if (poolHashrateEl && data.hashrate !== undefined) {
                poolHashrateEl.textContent = this.formatHashRate(data.hashrate);
            }

            // Update blocks found (confirmed blocks)
            const poolBlocksEl = document.getElementById('poolBlocks');
            if (poolBlocksEl && data.blocks) {
                poolBlocksEl.textContent = data.blocks.confirmed || 0;
            }

            // Update miners count if element exists
            const poolMinersEl = document.getElementById('poolMiners');
            if (poolMinersEl && data.miners !== undefined) {
                poolMinersEl.textContent = data.miners;
            }

            console.log('Pool stats loaded:', data);
        } catch (error) {
            console.warn('Failed to load pool stats:', error.message);
            // Set fallback text
            const poolHashrateEl = document.getElementById('poolHashrate');
            const poolBlocksEl = document.getElementById('poolBlocks');
            if (poolHashrateEl) poolHashrateEl.textContent = 'Offline';
            if (poolBlocksEl) poolBlocksEl.textContent = '--';
        }
    }

    async loadBlockchainInfo() {
        try {
            const info = await this.apiCall('/api/info');
            this.cachedData.info = info;
            this.updateStatsFromApi(info);
        } catch (error) {
            // Fall back to demo data
            this.updateStatsDemo();
        }
    }

    async loadBlocks() {
        try {
            const blocks = await this.apiCall('/api/blocks?limit=10');
            this.cachedData.blocks = blocks;
            this.displayBlocks(blocks);
        } catch (error) {
            // Fall back to demo data
            const demoBlocks = this.generateMockBlocks();
            this.displayBlocks(demoBlocks);
        }
    }

    async loadTransactions() {
        try {
            const transactions = await this.apiCall('/api/transactions?limit=20');
            this.cachedData.transactions = transactions;
            this.displayTransactions(transactions);
        } catch (error) {
            // Fall back to demo data
            const demoTxs = this.generateMockTransactions();
            this.displayTransactions(demoTxs);
        }
    }

    updateStatsFromApi(info) {
        // Update hero stats with real data
        const blockHeightEl = document.getElementById('blockHeight');
        const hashRateEl = document.getElementById('hashRate');
        const currentRewardEl = document.getElementById('currentReward');

        if (blockHeightEl) {
            blockHeightEl.textContent = info.blocks?.toLocaleString() || '0';
        }
        if (hashRateEl) {
            const hashPs = info.networkHashPs || 0;
            const formatted = this.formatHashRate(hashPs);
            hashRateEl.textContent = formatted;
        }
        if (currentRewardEl) {
            // Calculate block reward based on height (halving every 210000 blocks)
            const halvings = Math.floor((info.blocks || 0) / 210000);
            const reward = 500 / Math.pow(2, halvings);
            currentRewardEl.textContent = reward.toFixed(2) + ' AXE';
        }
    }

    updateStatsDemo() {
        // Demo stats for when API is not available
        const blockHeight = 50000 + Math.floor(Math.random() * 1000);
        const hashRate = (Math.random() * 1000 + 500).toFixed(2);

        const blockHeightEl = document.getElementById('blockHeight');
        const hashRateEl = document.getElementById('hashRate');
        const currentRewardEl = document.getElementById('currentReward');

        if (blockHeightEl) blockHeightEl.textContent = blockHeight.toLocaleString();
        if (hashRateEl) hashRateEl.textContent = hashRate + ' TH/s';
        if (currentRewardEl) {
            const reward = 500 / Math.pow(2, Math.floor(blockHeight / 210000));
            currentRewardEl.textContent = reward.toFixed(2) + ' AXE';
        }
    }

    formatHashRate(hashPs) {
        if (hashPs >= 1e18) return (hashPs / 1e18).toFixed(2) + ' EH/s';
        if (hashPs >= 1e15) return (hashPs / 1e15).toFixed(2) + ' PH/s';
        if (hashPs >= 1e12) return (hashPs / 1e12).toFixed(2) + ' TH/s';
        if (hashPs >= 1e9) return (hashPs / 1e9).toFixed(2) + ' GH/s';
        if (hashPs >= 1e6) return (hashPs / 1e6).toFixed(2) + ' MH/s';
        if (hashPs >= 1e3) return (hashPs / 1e3).toFixed(2) + ' KH/s';
        return hashPs.toFixed(2) + ' H/s';
    }

    generateMockBlocks() {
        const now = Date.now();
        const blocks = [];
        for (let i = 0; i < 10; i++) {
            const height = 50000 - i;
            blocks.push({
                height,
                hash: this.generateHash(),
                timestamp: Math.floor((now - (i * 120000)) / 1000),
                tx_count: Math.floor(Math.random() * 50) + 1,
                size: Math.floor(Math.random() * 500000 + 100000),
                difficulty: Math.random() * 1000000 + 500000
            });
        }
        return blocks;
    }

    generateMockTransactions() {
        const now = Date.now();
        const transactions = [];
        for (let i = 0; i < 20; i++) {
            transactions.push({
                txid: this.generateHash(),
                timestamp: Math.floor((now - (Math.random() * 600000)) / 1000),
                size: Math.floor(Math.random() * 1000 + 200),
                fee: Math.floor(Math.random() * 10000),
                block_height: 50000 - Math.floor(Math.random() * 10)
            });
        }
        return transactions;
    }

    generateHash() {
        const chars = '0123456789abcdef';
        let hash = '';
        for (let i = 0; i < 64; i++) {
            hash += chars[Math.floor(Math.random() * chars.length)];
        }
        return hash;
    }

    displayBlocks(blocks) {
        const container = document.getElementById('blocksContainer');
        const template = document.getElementById('blockTemplate');

        if (!container || !template) return;

        container.innerHTML = '';

        blocks.forEach(block => {
            const blockElement = template.cloneNode(true);
            blockElement.style.display = 'block';
            blockElement.id = '';

            const height = block.height;
            const hash = block.hash;
            const timestamp = block.timestamp ? new Date(block.timestamp * 1000) : new Date();
            const txCount = block.tx_count || block.nTx || 0;
            const size = block.size ? (block.size / 1024).toFixed(0) + ' KB' : '0 KB';
            const halvings = Math.floor(height / 210000);
            const reward = (500 / Math.pow(2, halvings)).toFixed(8);

            blockElement.querySelector('.height-value').textContent = height.toLocaleString();
            blockElement.querySelector('.hash-value').textContent = hash.substring(0, 16) + '...';
            blockElement.querySelector('.block-time').textContent = this.formatTime(timestamp);
            blockElement.querySelector('.block-txs').textContent = txCount;
            blockElement.querySelector('.block-size').textContent = size;
            blockElement.querySelector('.reward-value').textContent = reward;

            // Add click handler for block details
            blockElement.style.cursor = 'pointer';
            blockElement.addEventListener('click', () => this.showBlockDetails(height));

            container.appendChild(blockElement);
        });
    }

    displayTransactions(transactions) {
        const container = document.getElementById('transactionsContainer');
        const template = document.getElementById('txTemplate');

        if (!container || !template) return;

        container.innerHTML = '';

        transactions.forEach(tx => {
            const txElement = template.cloneNode(true);
            txElement.style.display = 'block';
            txElement.id = '';

            const txid = tx.txid;
            const timestamp = tx.timestamp ? new Date(tx.timestamp * 1000) : new Date();
            const size = tx.size || tx.vsize || 0;
            const fee = tx.fee ? (tx.fee / 100000000).toFixed(8) : '0.00000000';

            txElement.querySelector('.tx-hash-value').textContent = txid.substring(0, 16) + '...';
            txElement.querySelector('.tx-time').textContent = this.formatTime(timestamp);
            txElement.querySelector('.tx-amount').textContent = size + ' bytes';
            txElement.querySelector('.tx-fee').textContent = fee;

            // Add click handler for tx details
            txElement.style.cursor = 'pointer';
            txElement.addEventListener('click', () => this.showTransactionDetails(txid));

            container.appendChild(txElement);
        });
    }

    displayNetworkStats() {
        const info = this.cachedData.info;

        if (info) {
            const hashRateEl = document.getElementById('networkHashRate');
            const difficultyEl = document.getElementById('networkDifficulty');
            const indexedEl = document.getElementById('totalSupply');
            const nextHalvingEl = document.getElementById('nextHalving');

            if (hashRateEl) {
                hashRateEl.textContent = this.formatHashRate(info.networkHashPs || 0);
            }
            if (difficultyEl) {
                difficultyEl.textContent = (info.difficulty || 0).toLocaleString(undefined, {maximumFractionDigits: 2});
            }
            if (indexedEl) {
                indexedEl.textContent = (info.indexed?.blocks || 0).toLocaleString() + ' blocks indexed';
            }
            if (nextHalvingEl) {
                const currentHeight = info.blocks || 0;
                const nextHalving = Math.ceil(currentHeight / 210000) * 210000;
                const blocksRemaining = nextHalving - currentHeight;
                nextHalvingEl.textContent = blocksRemaining.toLocaleString() + ' blocks';
            }
        } else {
            // Demo stats
            const hashRate = (Math.random() * 1000 + 500).toFixed(2);
            const difficulty = (Math.random() * 1000000 + 500000).toFixed(0);
            const totalBlocks = Math.floor(Math.random() * 50000 + 10000);
            const nextHalving = (210000 - (50000 % 210000)).toLocaleString();

            const hashRateEl = document.getElementById('networkHashRate');
            const difficultyEl = document.getElementById('networkDifficulty');
            const indexedEl = document.getElementById('totalSupply');
            const nextHalvingEl = document.getElementById('nextHalving');

            if (hashRateEl) hashRateEl.textContent = hashRate + ' TH/s';
            if (difficultyEl) difficultyEl.textContent = Number(difficulty).toLocaleString();
            if (indexedEl) indexedEl.textContent = totalBlocks.toLocaleString() + ' blocks indexed';
            if (nextHalvingEl) nextHalvingEl.textContent = nextHalving + ' blocks';
        }
    }

    startDataRefresh() {
        // Refresh data every 30 seconds
        setInterval(async () => {
            await this.loadExplorerData();
            await this.loadPoolStats();
        }, 30000);
    }

    switchTab(tabName) {
        // Switch explorer tabs
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
        document.getElementById(tabName)?.classList.add('active');

        this.currentTab = tabName;
    }

    async performSearch() {
        const query = document.getElementById('explorerSearch').value.trim();
        if (!query) return;

        this.showNotification(`Searching for: ${query}`, 'info');

        if (!this.apiAvailable) {
            this.showNotification('Search requires API connection. Demo mode active.', 'warning');
            return;
        }

        try {
            const result = await this.apiCall(`/api/search/${encodeURIComponent(query)}`);

            if (result.type === 'block') {
                this.showBlockDetails(result.result.height || result.result.hash);
            } else if (result.type === 'transaction') {
                this.showTransactionDetails(result.result.txid);
            } else if (result.type === 'address') {
                this.showAddressDetails(result.result.address);
            }
        } catch (error) {
            this.showNotification('No results found', 'warning');
        }
    }

    async showBlockDetails(heightOrHash) {
        if (!this.apiAvailable) {
            this.showNotification('Block details require API connection', 'warning');
            return;
        }

        // Show loading state
        this.openDetailModal('<div class="detail-loading">Loading block details...</div>');

        try {
            const block = await this.apiCall(`/api/block/${heightOrHash}`);
            this.updateUrlParam('block', block.height);

            const blockTime = new Date(block.timestamp * 1000);
            const halvings = Math.floor(block.height / 210000);
            const reward = (500 / Math.pow(2, halvings)).toFixed(8);

            // Build transactions HTML
            let txListHtml = '';
            if (block.transactions && block.transactions.length > 0) {
                txListHtml = block.transactions.map((tx, idx) => {
                    const isCoinbase = tx.is_coinbase === 1;
                    const fee = tx.fee ? (tx.fee / 100000000).toFixed(8) : '0.00000000';
                    return `
                        <div class="detail-tx-item" onclick="window.superAxeWeb.showTransactionDetails('${tx.txid}')">
                            <div class="detail-tx-header">
                                <span class="detail-tx-index">${isCoinbase ? 'Coinbase' : `#${idx}`}</span>
                                <span class="detail-tx-hash">${tx.txid}</span>
                            </div>
                            <div class="detail-tx-meta">
                                <span>Size: ${tx.size || tx.vsize || 0} bytes</span>
                                <span>Fee: ${fee} AXE</span>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                txListHtml = '<div class="detail-empty">No transaction details available</div>';
            }

            const content = `
                <div class="detail-header">
                    <h2>Block #${block.height.toLocaleString()}</h2>
                    <div class="detail-nav">
                        ${block.height > 0 ? `<button class="detail-nav-btn" onclick="window.superAxeWeb.showBlockDetails(${block.height - 1})">← Previous</button>` : ''}
                        <button class="detail-nav-btn" onclick="window.superAxeWeb.showBlockDetails(${block.height + 1})">Next →</button>
                    </div>
                </div>

                <div class="detail-section">
                    <h3>Block Information</h3>
                    <div class="detail-grid">
                        <div class="detail-row">
                            <span class="detail-label">Hash</span>
                            <span class="detail-value hash-value">${block.hash}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Previous Hash</span>
                            <span class="detail-value hash-value clickable" onclick="window.superAxeWeb.showBlockDetails('${block.prev_hash}')">${block.prev_hash}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Timestamp</span>
                            <span class="detail-value">${blockTime.toLocaleString()} (${this.formatTime(blockTime)})</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Transactions</span>
                            <span class="detail-value">${block.tx_count || block.transactions?.length || 0}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Block Reward</span>
                            <span class="detail-value highlight">${reward} AXE</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Difficulty</span>
                            <span class="detail-value">${block.difficulty?.toLocaleString(undefined, {maximumFractionDigits: 2}) || 'N/A'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Size</span>
                            <span class="detail-value">${(block.size / 1024).toFixed(2)} KB (${block.weight?.toLocaleString() || 0} weight units)</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Nonce</span>
                            <span class="detail-value">${block.nonce?.toLocaleString() || 'N/A'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Merkle Root</span>
                            <span class="detail-value hash-value">${block.merkle_root || 'N/A'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Version</span>
                            <span class="detail-value">${block.version ? '0x' + block.version.toString(16) : 'N/A'}</span>
                        </div>
                    </div>
                </div>

                <div class="detail-section">
                    <h3>Transactions (${block.transactions?.length || 0})</h3>
                    <div class="detail-tx-list">
                        ${txListHtml}
                    </div>
                </div>

                <div class="detail-share">
                    <span>Share: </span>
                    <input type="text" readonly value="${window.location.origin}?block=${block.height}" onclick="this.select(); document.execCommand('copy'); window.superAxeWeb.showNotification('Link copied!', 'success');">
                </div>
            `;

            this.openDetailModal(content);
        } catch (error) {
            console.error('Block detail error:', error);
            this.openDetailModal('<div class="detail-error">Failed to load block details. Block may not exist.</div>');
        }
    }

    async showTransactionDetails(txid) {
        if (!this.apiAvailable) {
            this.showNotification('Transaction details require API connection', 'warning');
            return;
        }

        // Show loading state
        this.openDetailModal('<div class="detail-loading">Loading transaction details...</div>');

        try {
            const tx = await this.apiCall(`/api/tx/${txid}`);
            this.updateUrlParam('tx', txid);

            const isCoinbase = tx.is_coinbase === 1;
            const fee = tx.fee ? (tx.fee / 100000000).toFixed(8) : '0.00000000';
            const blockTime = tx.timestamp ? new Date(tx.timestamp * 1000) : null;

            // Build inputs HTML
            let inputsHtml = '';
            if (isCoinbase) {
                inputsHtml = `
                    <div class="detail-io-item coinbase">
                        <div class="detail-io-label">Coinbase (New coins)</div>
                        <div class="detail-io-value">Block reward for mining block #${tx.block_height}</div>
                    </div>
                `;
            } else if (tx.inputs && tx.inputs.length > 0) {
                inputsHtml = tx.inputs.map(input => `
                    <div class="detail-io-item">
                        <div class="detail-io-address clickable" onclick="window.superAxeWeb.showAddressDetails('${input.address}')">${input.address || 'Unknown'}</div>
                        <div class="detail-io-amount">${input.value ? (input.value / 100000000).toFixed(8) : '?'} AXE</div>
                    </div>
                `).join('');
            } else if (tx.vin) {
                // RPC format
                inputsHtml = tx.vin.map(input => {
                    if (input.coinbase) {
                        return `
                            <div class="detail-io-item coinbase">
                                <div class="detail-io-label">Coinbase</div>
                                <div class="detail-io-value">Block reward</div>
                            </div>
                        `;
                    }
                    return `
                        <div class="detail-io-item">
                            <div class="detail-io-txid">${input.txid?.substring(0, 16)}...:${input.vout}</div>
                        </div>
                    `;
                }).join('');
            } else {
                inputsHtml = '<div class="detail-empty">No input data available</div>';
            }

            // Build outputs HTML
            let outputsHtml = '';
            let totalOutput = 0;
            const outputs = tx.outputs || tx.vout || [];

            if (outputs.length > 0) {
                outputsHtml = outputs.map((output, idx) => {
                    let address = output.address;
                    let value = output.value;

                    // Handle RPC format
                    if (!address && output.scriptPubKey?.address) {
                        address = output.scriptPubKey.address;
                    }
                    if (value === undefined && output.value !== undefined) {
                        value = output.value * 100000000; // Convert from BTC to satoshis
                    }

                    const valueAXE = value ? (value / 100000000).toFixed(8) : '0.00000000';
                    totalOutput += value || 0;

                    // Check if OP_RETURN (null data)
                    const isOpReturn = !address && output.script_pubkey?.startsWith('6a');

                    if (isOpReturn) {
                        return `
                            <div class="detail-io-item op-return">
                                <div class="detail-io-label">OP_RETURN</div>
                                <div class="detail-io-amount">0 AXE</div>
                            </div>
                        `;
                    }

                    return `
                        <div class="detail-io-item">
                            <div class="detail-io-index">#${idx}</div>
                            <div class="detail-io-address ${address ? 'clickable' : ''}" ${address ? `onclick="window.superAxeWeb.showAddressDetails('${address}')"` : ''}>${address || 'Unable to decode'}</div>
                            <div class="detail-io-amount">${valueAXE} AXE</div>
                            ${output.spent_txid ? '<span class="spent-badge">Spent</span>' : '<span class="unspent-badge">Unspent</span>'}
                        </div>
                    `;
                }).join('');
            } else {
                outputsHtml = '<div class="detail-empty">No output data available</div>';
            }

            const content = `
                <div class="detail-header">
                    <h2>Transaction Details</h2>
                </div>

                <div class="detail-section">
                    <h3>Overview</h3>
                    <div class="detail-grid">
                        <div class="detail-row">
                            <span class="detail-label">Transaction ID</span>
                            <span class="detail-value hash-value">${tx.txid}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Status</span>
                            <span class="detail-value">${tx.block_height ? `<span class="confirmed-badge">Confirmed</span> in block #${tx.block_height}` : '<span class="pending-badge">Pending</span>'}</span>
                        </div>
                        ${tx.block_height ? `
                        <div class="detail-row">
                            <span class="detail-label">Block</span>
                            <span class="detail-value clickable" onclick="window.superAxeWeb.showBlockDetails(${tx.block_height})">#${tx.block_height} (${tx.block_hash?.substring(0, 16)}...)</span>
                        </div>
                        ` : ''}
                        ${blockTime ? `
                        <div class="detail-row">
                            <span class="detail-label">Time</span>
                            <span class="detail-value">${blockTime.toLocaleString()}</span>
                        </div>
                        ` : ''}
                        <div class="detail-row">
                            <span class="detail-label">Size</span>
                            <span class="detail-value">${tx.size || 0} bytes (${tx.vsize || tx.size || 0} vbytes)</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Fee</span>
                            <span class="detail-value">${fee} AXE ${tx.vsize ? `(${((tx.fee || 0) / (tx.vsize || 1)).toFixed(2)} sat/vB)` : ''}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Type</span>
                            <span class="detail-value">${isCoinbase ? '<span class="coinbase-badge">Coinbase</span>' : 'Regular Transaction'}</span>
                        </div>
                    </div>
                </div>

                <div class="detail-section">
                    <h3>Inputs</h3>
                    <div class="detail-io-list inputs">
                        ${inputsHtml}
                    </div>
                </div>

                <div class="detail-section">
                    <h3>Outputs (${outputs.length})</h3>
                    <div class="detail-io-list outputs">
                        ${outputsHtml}
                    </div>
                    <div class="detail-io-total">
                        Total Output: ${(totalOutput / 100000000).toFixed(8)} AXE
                    </div>
                </div>

                <div class="detail-share">
                    <span>Share: </span>
                    <input type="text" readonly value="${window.location.origin}?tx=${txid}" onclick="this.select(); document.execCommand('copy'); window.superAxeWeb.showNotification('Link copied!', 'success');">
                </div>
            `;

            this.openDetailModal(content);
        } catch (error) {
            console.error('Transaction detail error:', error);
            this.openDetailModal('<div class="detail-error">Failed to load transaction details. Transaction may not exist.</div>');
        }
    }

    async showAddressDetails(address) {
        if (!this.apiAvailable) {
            this.showNotification('Address lookup requires API connection', 'warning');
            return;
        }

        // Show loading state
        this.openDetailModal('<div class="detail-loading">Loading address details...</div>');

        try {
            const info = await this.apiCall(`/api/address/${address}`);
            this.updateUrlParam('address', address);

            const balance = (info.balance / 100000000).toFixed(8);
            const received = (info.received / 100000000).toFixed(8);
            const sent = (info.sent / 100000000).toFixed(8);

            // Build transaction history HTML
            let txHistoryHtml = '';
            if (info.transactions && info.transactions.length > 0) {
                txHistoryHtml = info.transactions.map(tx => {
                    const valueAXE = (tx.value / 100000000).toFixed(8);
                    const isInput = tx.is_input;
                    const blockTime = tx.block_time ? new Date(tx.block_time * 1000).toLocaleString() : 'Pending';
                    return `
                        <div class="detail-tx-item" onclick="window.superAxeWeb.showTransactionDetails('${tx.txid}')">
                            <div class="detail-tx-header">
                                <span class="tx-direction ${isInput ? 'sent' : 'received'}">${isInput ? '↑ Sent' : '↓ Received'}</span>
                                <span class="detail-tx-hash">${tx.txid}</span>
                            </div>
                            <div class="detail-tx-meta">
                                <span>Block: ${tx.block_height || 'Pending'}</span>
                                <span>${blockTime}</span>
                                <span class="tx-amount ${isInput ? 'negative' : 'positive'}">${isInput ? '-' : '+'}${valueAXE} AXE</span>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                txHistoryHtml = '<div class="detail-empty">No transactions found for this address</div>';
            }

            // Build UTXOs HTML
            let utxosHtml = '';
            if (info.utxos && info.utxos.length > 0) {
                utxosHtml = info.utxos.map(utxo => {
                    const valueAXE = (utxo.value / 100000000).toFixed(8);
                    return `
                        <div class="detail-utxo-item" onclick="window.superAxeWeb.showTransactionDetails('${utxo.txid}')">
                            <span class="utxo-txid">${utxo.txid.substring(0, 20)}...:${utxo.vout}</span>
                            <span class="utxo-value">${valueAXE} AXE</span>
                        </div>
                    `;
                }).join('');
            } else {
                utxosHtml = '<div class="detail-empty">No unspent outputs</div>';
            }

            const content = `
                <div class="detail-header">
                    <h2>Address Details</h2>
                </div>

                <div class="detail-section">
                    <h3>Summary</h3>
                    <div class="detail-grid">
                        <div class="detail-row">
                            <span class="detail-label">Address</span>
                            <span class="detail-value hash-value">${address}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Balance</span>
                            <span class="detail-value highlight">${balance} AXE</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Total Received</span>
                            <span class="detail-value positive">${received} AXE</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Total Sent</span>
                            <span class="detail-value negative">${sent} AXE</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Transactions</span>
                            <span class="detail-value">${info.txCount || info.transactions?.length || 0}</span>
                        </div>
                    </div>
                </div>

                <div class="detail-section">
                    <h3>Unspent Outputs (${info.utxos?.length || 0})</h3>
                    <div class="detail-utxo-list">
                        ${utxosHtml}
                    </div>
                </div>

                <div class="detail-section">
                    <h3>Transaction History</h3>
                    <div class="detail-tx-list">
                        ${txHistoryHtml}
                    </div>
                </div>

                <div class="detail-share">
                    <span>Share: </span>
                    <input type="text" readonly value="${window.location.origin}?address=${address}" onclick="this.select(); document.execCommand('copy'); window.superAxeWeb.showNotification('Link copied!', 'success');">
                </div>
            `;

            this.openDetailModal(content);
        } catch (error) {
            console.error('Address detail error:', error);
            this.openDetailModal('<div class="detail-error">Failed to load address details.</div>');
        }
    }

    async createWebWallet() {
        const btn = document.getElementById('createWebWalletBtn') || document.getElementById('webWalletConnect');
        const originalText = btn ? btn.textContent : '';

        // Check if wallet already exists
        if (this.axeWallet.hasStoredWallet()) {
            const choice = confirm('You already have a saved wallet.\n\nClick OK to load existing wallet\nClick Cancel to create a NEW wallet (old wallet will be replaced)');

            if (choice) {
                // Load existing wallet
                const password = prompt('Enter your wallet password:');
                if (!password) return;

                if (btn) { btn.textContent = 'Loading...'; btn.disabled = true; }

                try {
                    await this.axeWallet.loadWallet(password);
                    this.walletConnected = true;
                    this.currentWalletAddress = this.axeWallet.wallet.address;
                    this.showWalletInterface(this.axeWallet.wallet.address, '0.00000000');
                    this.showNotification('Wallet loaded successfully!', 'success');
                    await this.refreshWalletBalance();
                } catch (error) {
                    this.showNotification('Invalid password or corrupted wallet', 'error');
                } finally {
                    if (btn) { btn.textContent = originalText; btn.disabled = false; }
                }
                return;
            }
            // User chose to create new wallet - continue below
        }

        // Create new wallet
        const password = prompt('Create a password for your wallet:\n(This encrypts your private key)');
        if (!password) return;

        const confirmPassword = prompt('Confirm your password:');
        if (password !== confirmPassword) {
            this.showNotification('Passwords do not match', 'error');
            return;
        }

        if (btn) { btn.textContent = 'Creating...'; btn.disabled = true; }

        try {
            // Generate real wallet
            const wallet = await this.axeWallet.generateWallet();

            // Save encrypted to localStorage
            await this.axeWallet.saveWallet(password);

            this.walletConnected = true;
            this.currentWalletAddress = wallet.address;

            // Show backup modal - user must acknowledge before continuing
            await this.showWalletBackupModal(wallet);

            this.showWalletInterface(wallet.address, '0.00000000');
            await this.refreshWalletBalance();

        } catch (error) {
            console.error('Wallet creation error:', error);
            this.showNotification('Failed to create wallet: ' + error.message, 'error');
        } finally {
            if (btn) { btn.textContent = originalText; btn.disabled = false; }
        }
    }

    importWalletFromFile() {
        // Trigger the hidden file input
        document.getElementById('walletFileInput')?.click();
    }

    async handleWalletFileImport(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        // Reset file input so same file can be selected again
        event.target.value = '';

        const btn = document.getElementById('importWalletBtn');
        const originalText = btn ? btn.textContent : '';

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Support both formats: privateKeyWIF (backup format) and wif (raw format)
            const wif = data.privateKeyWIF || data.wif;
            if (!wif) {
                throw new Error('No private key found in file. Expected "privateKeyWIF" or "wif" field.');
            }

            // Ask for password to encrypt and store the wallet
            const password = prompt('Create a password to encrypt this wallet:\n(This protects your imported wallet)');
            if (!password) return;

            const confirmPassword = prompt('Confirm your password:');
            if (password !== confirmPassword) {
                this.showNotification('Passwords do not match', 'error');
                return;
            }

            if (btn) { btn.textContent = 'Importing...'; btn.disabled = true; }

            // Import the wallet from WIF
            const wallet = await this.axeWallet.importFromWIF(wif);

            // Save encrypted to localStorage
            await this.axeWallet.saveWallet(password);

            this.walletConnected = true;
            this.currentWalletAddress = wallet.address;

            this.showWalletInterface(wallet.address, '0.00000000');
            this.showNotification(`Wallet imported successfully!\nAddress: ${wallet.address}`, 'success');
            await this.refreshWalletBalance();

        } catch (error) {
            console.error('Wallet import error:', error);
            if (error instanceof SyntaxError) {
                this.showNotification('Invalid file format. Please select a valid wallet backup JSON file.', 'error');
            } else {
                this.showNotification('Failed to import wallet: ' + error.message, 'error');
            }
        } finally {
            if (btn) { btn.textContent = originalText; btn.disabled = false; }
        }
    }

    async refreshWalletBalance() {
        if (!this.axeWallet.wallet || !this.apiAvailable) return;

        try {
            // Get combined balance from both legacy and SegWit addresses
            const balanceInfo = await this.axeWallet.getCombinedBalance();
            const balance = balanceInfo.total.toFixed(8);

            const balanceElement = document.getElementById('walletBalance');
            if (balanceElement) {
                balanceElement.textContent = balance;
            }
        } catch (error) {
            // Address doesn't exist yet, balance is 0
            console.warn('Failed to refresh balance:', error);
        }
    }

    showWalletBackupModal(wallet) {
        return new Promise((resolve) => {
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.className = 'wallet-backup-overlay';
            overlay.innerHTML = `
                <div class="wallet-backup-modal glass">
                    <h2>Wallet Created Successfully!</h2>
                    <p class="warning-text">IMPORTANT: Save your private key now. This is the ONLY way to recover your funds. If you lose it, your coins are gone forever.</p>

                    <div class="wallet-info-box">
                        <div class="info-row">
                            <label>Legacy Address (S...):</label>
                            <code class="address-display">${wallet.address}</code>
                        </div>
                        <div class="info-row">
                            <label>SegWit Address (axe1...):</label>
                            <code class="address-display segwit">${wallet.segwitAddress}</code>
                        </div>
                        <div class="info-row">
                            <label>Private Key (WIF):</label>
                            <code class="wif-display">${wallet.wif}</code>
                        </div>
                    </div>

                    <button class="download-btn glass-btn" id="downloadWalletBtn">
                        Download Wallet Backup
                    </button>

                    <div class="confirm-section">
                        <label class="confirm-label">
                            <input type="checkbox" id="backupConfirmCheckbox">
                            <span>I have saved my private key and understand that if I lose it, my funds cannot be recovered.</span>
                        </label>
                    </div>

                    <button class="continue-btn glass-btn" id="continueWalletBtn" disabled>
                        Continue to Wallet
                    </button>
                </div>
            `;

            document.body.appendChild(overlay);

            // Download wallet backup
            document.getElementById('downloadWalletBtn').addEventListener('click', () => {
                const backupData = {
                    address: wallet.address,
                    privateKeyWIF: wallet.wif,
                    createdAt: new Date().toISOString(),
                    network: 'SuperAxeCoin Mainnet',
                    warning: 'KEEP THIS FILE SECURE. Anyone with this private key can spend your coins.'
                };

                const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `superaxecoin-wallet-${wallet.address.substring(0, 8)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                this.showNotification('Wallet backup downloaded!', 'success');
            });

            // Enable continue button when checkbox is checked
            const checkbox = document.getElementById('backupConfirmCheckbox');
            const continueBtn = document.getElementById('continueWalletBtn');

            checkbox.addEventListener('change', () => {
                continueBtn.disabled = !checkbox.checked;
            });

            // Continue to wallet
            continueBtn.addEventListener('click', () => {
                overlay.remove();
                resolve();
            });
        });
    }

    showWalletInterface(address, balance) {
        const walletInterface = document.getElementById('walletInterface');
        const addressElement = document.getElementById('walletAddress');
        const segwitAddressElement = document.getElementById('walletSegwitAddress');
        const balanceElement = document.getElementById('walletBalance');

        if (walletInterface) walletInterface.style.display = 'block';
        if (addressElement) {
            addressElement.textContent = address;
            addressElement.title = address;
            addressElement.style.cursor = 'pointer';
            addressElement.onclick = () => {
                navigator.clipboard.writeText(address);
                this.showNotification('Legacy address copied!', 'success');
            };
        }
        if (segwitAddressElement && this.axeWallet.wallet?.segwitAddress) {
            const segwitAddr = this.axeWallet.wallet.segwitAddress;
            segwitAddressElement.textContent = segwitAddr;
            segwitAddressElement.title = segwitAddr;
            segwitAddressElement.style.cursor = 'pointer';
            segwitAddressElement.onclick = () => {
                navigator.clipboard.writeText(segwitAddr);
                this.showNotification('SegWit address copied!', 'success');
            };
        }
        if (balanceElement) balanceElement.textContent = balance;
    }

    showSendForm() {
        const sendForm = document.getElementById('sendForm');
        const historyPanel = document.getElementById('historyPanel');

        // Hide history panel if open
        if (historyPanel) historyPanel.style.display = 'none';

        if (sendForm) {
            sendForm.style.display = sendForm.style.display === 'none' ? 'block' : 'none';
        }
    }

    showReceiveAddress() {
        if (this.currentWalletAddress) {
            // Copy to clipboard
            navigator.clipboard.writeText(this.currentWalletAddress).then(() => {
                this.showNotification(`Address copied to clipboard!\n\n${this.currentWalletAddress}`, 'success');
            }).catch(() => {
                this.showNotification(`Your receive address:\n\n${this.currentWalletAddress}`, 'info');
            });
        } else {
            this.showNotification('Please create a wallet first', 'warning');
        }
    }

    async showTransactionHistory() {
        if (!this.apiAvailable) {
            this.showNotification('Transaction history requires API connection', 'warning');
            return;
        }

        if (!this.currentWalletAddress) {
            this.showNotification('Please create or load a wallet first', 'warning');
            return;
        }

        const historyPanel = document.getElementById('historyPanel');
        const historyList = document.getElementById('historyList');
        const sendForm = document.getElementById('sendForm');

        // Toggle visibility
        if (historyPanel.style.display === 'block') {
            historyPanel.style.display = 'none';
            return;
        }

        // Hide send form if open
        if (sendForm) sendForm.style.display = 'none';

        // Show history panel with loading state
        historyPanel.style.display = 'block';
        historyList.innerHTML = '<div class="history-loading">Loading transactions...</div>';

        try {
            const data = await this.apiCall(`/api/address/${this.currentWalletAddress}`);

            if (!data.transactions || data.transactions.length === 0) {
                historyList.innerHTML = '<div class="history-empty">No transactions yet</div>';
                return;
            }

            // Render transactions
            historyList.innerHTML = data.transactions.slice(0, 20).map(tx => {
                const isSent = tx.is_input;
                const amount = (tx.value / 100000000).toFixed(8);
                const date = tx.block_time ? new Date(tx.block_time * 1000).toLocaleDateString() : 'Pending';
                const txidShort = tx.txid.substring(0, 12) + '...';

                return `
                    <div class="history-item ${isSent ? 'sent' : 'received'}">
                        <div class="tx-icon">${isSent ? '↑' : '↓'}</div>
                        <div class="tx-details">
                            <div class="tx-type">${isSent ? 'Sent' : 'Received'}</div>
                            <div class="tx-id" title="${tx.txid}">${txidShort}</div>
                            <div class="tx-date">${date}</div>
                        </div>
                        <div class="tx-amount ${isSent ? 'negative' : 'positive'}">
                            ${isSent ? '-' : '+'}${amount} AXE
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Error fetching history:', error);
            historyList.innerHTML = '<div class="history-error">Failed to load transactions</div>';
        }
    }

    async sendTransaction() {
        if (!this.axeWallet.wallet) {
            this.showNotification('Please create or load a wallet first', 'error');
            return;
        }

        const recipient = document.getElementById('recipientAddress')?.value?.trim();
        const amount = parseFloat(document.getElementById('sendAmount')?.value);

        if (!recipient || !amount || amount <= 0) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }

        // Validate address format (S=P2PKH, X=P2SH, axe1=bech32)
        const isLegacy = /^[SX][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(recipient);
        const isBech32 = /^axe1[a-z0-9]{38,59}$/.test(recipient);
        if (!isLegacy && !isBech32) {
            this.showNotification('Invalid SuperAxeCoin address format', 'error');
            return;
        }

        // Confirm transaction
        const confirmed = confirm(
            `Send ${amount} AXE to:\n${recipient}\n\nThis action cannot be undone.`
        );
        if (!confirmed) return;

        const btn = document.getElementById('confirmSend');
        const originalText = btn?.textContent || 'Send';
        if (btn) {
            btn.textContent = 'Sending...';
            btn.disabled = true;
        }

        try {
            // Create and sign transaction
            const txHex = await this.axeWallet.createTransaction(recipient, amount);

            // Broadcast
            const txid = await this.axeWallet.broadcastTransaction(txHex);

            this.showNotification(`Transaction sent!\n\nTXID: ${txid}`, 'success');

            // Clear form
            document.getElementById('recipientAddress').value = '';
            document.getElementById('sendAmount').value = '';

            // Refresh balance
            await this.refreshWalletBalance();

        } catch (error) {
            console.error('Transaction error:', error);
            this.showNotification('Transaction failed: ' + error.message, 'error');
        } finally {
            if (btn) {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        }
    }

    // Address Converter Methods
    openConverter() {
        const converterInterface = document.getElementById('converterInterface');
        if (converterInterface) {
            converterInterface.style.display = 'block';
            // Scroll to converter
            converterInterface.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    closeConverter() {
        const converterInterface = document.getElementById('converterInterface');
        const wifInput = document.getElementById('wifInput');
        const results = document.getElementById('converterResults');

        if (converterInterface) converterInterface.style.display = 'none';
        if (wifInput) wifInput.value = '';
        if (results) results.style.display = 'none';
    }

    toggleWifVisibility() {
        const wifInput = document.getElementById('wifInput');
        const toggleBtn = document.getElementById('toggleWifVisibility');

        if (wifInput && toggleBtn) {
            if (wifInput.type === 'password') {
                wifInput.type = 'text';
                toggleBtn.textContent = 'Hide';
            } else {
                wifInput.type = 'password';
                toggleBtn.textContent = 'Show';
            }
        }
    }

    convertAddress() {
        const wifInput = document.getElementById('wifInput');
        const resultsDiv = document.getElementById('converterResults');
        const legacyResult = document.getElementById('resultLegacyAddress');
        const segwitResult = document.getElementById('resultSegwitAddress');

        if (!wifInput?.value?.trim()) {
            this.showNotification('Please enter a WIF private key', 'warning');
            return;
        }

        try {
            const addresses = this.axeWallet.convertWIFToAddresses(wifInput.value.trim());

            if (legacyResult) legacyResult.textContent = addresses.legacy;
            if (segwitResult) segwitResult.textContent = addresses.segwit;
            if (resultsDiv) resultsDiv.style.display = 'block';

            this.showNotification('Addresses derived successfully!', 'success');
        } catch (error) {
            console.error('Conversion error:', error);
            this.showNotification('Invalid WIF: ' + error.message, 'error');
        }
    }

    toggleMobileMenu() {
        const navMenu = document.querySelector('.nav-menu');
        navMenu?.classList.toggle('mobile-open');
    }

    smoothScroll(e) {
        e.preventDefault();
        const targetId = e.target.getAttribute('href')?.substring(1);
        const targetElement = targetId ? document.getElementById(targetId) : null;

        if (targetElement) {
            const offset = 80;
            const elementPosition = targetElement.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - offset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    }

    handleScroll() {
        const navbar = document.querySelector('.navbar');
        if (navbar) {
            if (window.scrollY > 50) {
                navbar.style.background = 'rgba(20, 20, 30, 0.95)';
            } else {
                navbar.style.background = 'var(--glass-bg)';
            }
        }
    }

    animateElements() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in-up');
                }
            });
        }, observerOptions);

        document.querySelectorAll('.feature-card, .wallet-card, .stat-card').forEach(el => {
            observer.observe(el);
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            padding: 16px 24px;
            background: ${this.getNotificationColor(type)};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            z-index: 10000;
            max-width: 400px;
            word-wrap: break-word;
            white-space: pre-line;
            animation: slideIn 0.3s ease;
            font-family: monospace;
            font-size: 13px;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 6000);
    }

    getNotificationColor(type) {
        switch(type) {
            case 'success': return '#4ade80';
            case 'error': return '#f87171';
            case 'warning': return '#facc15';
            default: return '#667eea';
        }
    }

    formatTime(timestamp) {
        const now = new Date();
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
        return `${Math.floor(minutes / 1440)}d ago`;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    setupParallax() {
        const layers = document.querySelectorAll('.parallax-layer');
        const hero = document.querySelector('.hero');

        if (!hero || layers.length === 0) return;

        // Mouse move parallax
        document.addEventListener('mousemove', (e) => {
            const x = (e.clientX - window.innerWidth / 2) / window.innerWidth;
            const y = (e.clientY - window.innerHeight / 2) / window.innerHeight;

            layers.forEach((layer, index) => {
                const speed = (index + 1) * 15;
                const xOffset = x * speed;
                const yOffset = y * speed;
                layer.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
            });

            // Move geometric shapes individually
            document.querySelectorAll('.geo-shape').forEach((shape, i) => {
                const shapeSpeed = (i + 1) * 8;
                shape.style.transform = `translate(${x * shapeSpeed}px, ${y * shapeSpeed}px) rotate(${x * 20}deg)`;
            });

            // Move glow orbs
            document.querySelectorAll('.glow-orb').forEach((orb, i) => {
                const orbSpeed = (i + 1) * 12;
                orb.style.transform = `translate(${x * orbSpeed}px, ${y * orbSpeed}px)`;
            });
        });

        // Scroll parallax
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            const heroHeight = hero.offsetHeight;

            if (scrollY < heroHeight) {
                layers.forEach((layer, index) => {
                    const speed = (index + 1) * 0.15;
                    layer.style.top = `${scrollY * speed}px`;
                });

                const heroContent = document.querySelector('.hero-content');
                if (heroContent) {
                    heroContent.style.transform = `translateY(${scrollY * 0.3}px)`;
                    heroContent.style.opacity = 1 - (scrollY / heroHeight);
                }

                const watermark = document.querySelector('.hero-watermark-logo');
                if (watermark) {
                    watermark.style.transform = `translate(-50%, -50%) scale(${1 + scrollY * 0.001}) rotate(${scrollY * 0.02}deg)`;
                }
            }
        });
    }

    setupHeroAnimations() {
        // Animate hero title characters on load
        const chars = document.querySelectorAll('.hero-title .char');
        chars.forEach((char, i) => {
            char.style.animationDelay = `${i * 0.08}s`;
        });

        // Animate logo rings
        const rings = document.querySelectorAll('.logo-ring');
        rings.forEach((ring, i) => {
            ring.style.animationDelay = `${i * 0.3}s`;
        });

        // Glitch effect for title
        setInterval(() => {
            const title = document.querySelector('.hero-title');
            if (title && Math.random() > 0.95) {
                title.classList.add('glitch');
                setTimeout(() => title.classList.remove('glitch'), 200);
            }
        }, 100);

        // Animate stat bars
        const statBars = document.querySelectorAll('.mega-stat-bar');
        statBars.forEach((bar, i) => {
            setTimeout(() => {
                bar.style.width = '100%';
            }, i * 200 + 1000);
        });
    }
}

// Global functions
function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        const offset = 80;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;

        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    }
}

// CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }

    .nav-menu.mobile-open {
        display: flex !important;
        position: fixed;
        top: 80px;
        left: 0;
        right: 0;
        flex-direction: column;
        background: rgba(20, 20, 30, 0.95);
        backdrop-filter: blur(20px);
        padding: 2rem;
        gap: 1rem;
    }

    @media (max-width: 768px) {
        .nav-menu {
            display: none;
        }
    }
`;
document.head.appendChild(style);

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.superAxeWeb = new SuperAxeWeb();
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SuperAxeWeb;
}
