// SuperAxeCoin Website JavaScript
class SuperAxeWeb {
    constructor() {
        // API Configuration
        this.API_URL = 'https://api.superaxecoin.com';

        this.walletConnected = false;
        this.currentTab = 'blocks';
        this.apiAvailable = false;
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
        await this.checkApiStatus();
        await this.loadExplorerData();
        await this.loadPoolStats();
        this.startDataRefresh();
        this.animateElements();
        this.setupParallax();
        this.setupHeroAnimations();
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
        document.getElementById('connectWallet')?.addEventListener('click', this.connectWallet.bind(this));
        document.getElementById('webWalletConnect')?.addEventListener('click', this.createWebWallet.bind(this));

        // Wallet actions
        document.getElementById('sendBtn')?.addEventListener('click', () => this.showSendForm());
        document.getElementById('receiveBtn')?.addEventListener('click', () => this.showReceiveAddress());
        document.getElementById('historyBtn')?.addEventListener('click', () => this.showTransactionHistory());
        document.getElementById('confirmSend')?.addEventListener('click', () => this.sendTransaction());

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
            const response = await fetch('https://superaxepool.com/api/pool/axe');
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

        try {
            const block = await this.apiCall(`/api/block/${heightOrHash}`);
            const details = `
Block #${block.height}
Hash: ${block.hash}
Time: ${new Date(block.timestamp * 1000).toLocaleString()}
Transactions: ${block.tx_count || block.transactions?.length || 0}
Size: ${(block.size / 1024).toFixed(2)} KB
Difficulty: ${block.difficulty?.toLocaleString() || 'N/A'}
            `.trim();
            this.showNotification(details, 'info');
        } catch (error) {
            this.showNotification('Failed to load block details', 'error');
        }
    }

    async showTransactionDetails(txid) {
        if (!this.apiAvailable) {
            this.showNotification('Transaction details require API connection', 'warning');
            return;
        }

        try {
            const tx = await this.apiCall(`/api/tx/${txid}`);
            const details = `
Transaction: ${tx.txid.substring(0, 20)}...
Block: ${tx.block_height || 'Pending'}
Size: ${tx.size || tx.vsize || 0} bytes
Fee: ${tx.fee ? (tx.fee / 100000000).toFixed(8) : '0'} AXE
            `.trim();
            this.showNotification(details, 'info');
        } catch (error) {
            this.showNotification('Failed to load transaction details', 'error');
        }
    }

    async showAddressDetails(address) {
        if (!this.apiAvailable) {
            this.showNotification('Address lookup requires API connection', 'warning');
            return;
        }

        try {
            const info = await this.apiCall(`/api/address/${address}`);
            const balance = (info.balance / 100000000).toFixed(8);
            const details = `
Address: ${address.substring(0, 20)}...
Balance: ${balance} AXE
Transactions: ${info.txCount || 0}
Received: ${(info.received / 100000000).toFixed(8)} AXE
Sent: ${(info.sent / 100000000).toFixed(8)} AXE
            `.trim();
            this.showNotification(details, 'info');
        } catch (error) {
            this.showNotification('Failed to load address details', 'error');
        }
    }

    async connectWallet() {
        const btn = document.getElementById('connectWallet');
        const originalText = btn.textContent;

        btn.textContent = 'Connecting...';
        btn.disabled = true;

        try {
            await this.sleep(1000);
            this.showWalletOptions();
        } catch (error) {
            this.showNotification('Failed to connect wallet', 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    async createWebWallet() {
        const btn = document.getElementById('webWalletConnect');
        const originalText = btn.textContent;

        btn.textContent = 'Creating...';
        btn.disabled = true;

        try {
            await this.sleep(1500);

            // Generate a demo wallet address (in production, use proper crypto)
            const walletAddress = 'X' + this.generateHash().substring(0, 33);

            this.walletConnected = true;
            this.currentWalletAddress = walletAddress;
            this.showWalletInterface(walletAddress, '0.00000000');
            this.showNotification('Web wallet created! This is a demo wallet.', 'success');

            // If API available, check for balance
            if (this.apiAvailable) {
                this.refreshWalletBalance();
            }

        } catch (error) {
            this.showNotification('Failed to create wallet', 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    async refreshWalletBalance() {
        if (!this.currentWalletAddress || !this.apiAvailable) return;

        try {
            const info = await this.apiCall(`/api/address/${this.currentWalletAddress}/balance`);
            const balance = (info.balance / 100000000).toFixed(8);

            const balanceElement = document.getElementById('walletBalance');
            if (balanceElement) {
                balanceElement.textContent = balance;
            }
        } catch (error) {
            // Address doesn't exist yet, balance is 0
        }
    }

    showWalletInterface(address, balance) {
        const walletInterface = document.getElementById('walletInterface');
        const addressElement = document.getElementById('walletAddress');
        const balanceElement = document.getElementById('walletBalance');

        if (walletInterface) walletInterface.style.display = 'block';
        if (addressElement) addressElement.textContent = address.substring(0, 20) + '...';
        if (balanceElement) balanceElement.textContent = balance;
    }

    showSendForm() {
        const sendForm = document.getElementById('sendForm');
        if (sendForm) {
            sendForm.style.display = sendForm.style.display === 'none' ? 'block' : 'none';
        }
    }

    showReceiveAddress() {
        if (this.currentWalletAddress) {
            this.showNotification(`Your receive address:\n${this.currentWalletAddress}`, 'info');
        }
    }

    showTransactionHistory() {
        if (!this.apiAvailable) {
            this.showNotification('Transaction history requires API connection', 'warning');
            return;
        }
        this.showNotification('Transaction history feature coming soon!', 'info');
    }

    async sendTransaction() {
        const recipient = document.getElementById('recipientAddress')?.value;
        const amount = document.getElementById('sendAmount')?.value;

        if (!recipient || !amount) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }

        // Validate address format
        if (!/^[X7][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(recipient)) {
            this.showNotification('Invalid SuperAxeCoin address format', 'error');
            return;
        }

        this.showNotification('Demo mode: Transactions cannot be sent. Use the desktop wallet for real transactions.', 'warning');
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

    showWalletOptions() {
        this.showNotification('Download SuperAxeCoin Wallet for the best experience, or create a demo web wallet below.', 'info');
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
