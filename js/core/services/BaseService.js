import { Config } from '../../config.js';

export class BaseService {
    constructor() {
        this.config = {
            url: Config.SUPABASE_URL,
            anonKey: Config.SUPABASE_ANON_KEY,
            bucket: 'order-images'
        };

        this.client = null;
        this.isAuthenticated = false;
        this.isConnected = false;
        this.connectionTested = false;
        this.lastConnectionTest = 0;
        this.connectionTestInterval = 5 * 60 * 1000;

        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            backoffFactor: 2
        };

        this.requestQueue = [];
        this.activeRequests = 0;
        this.maxConcurrentRequests = 5;

        this.stats = {
            requestCount: 0,
            successCount: 0,
            errorCount: 0,
            totalResponseTime: 0,
            avgResponseTime: 0
        };

        this.initialize();
    }

    async initialize() {
        try {
            if (typeof supabase === 'undefined') {
                console.warn('⚠️ Supabase client not loaded - cloud features disabled');
                return;
            }

            this.client = supabase.createClient(this.config.url, this.config.anonKey);
            console.log('🚀 BaseService initialized');

            await this.checkAuth();

            this.client.auth.onAuthStateChange((event) => {
                console.log('🔐 Auth state changed:', event);
                if (event === 'SIGNED_OUT') {
                    window.location.href = 'login.html';
                }
                if (event === 'SIGNED_IN') {
                    this.isAuthenticated = true;
                    console.log('✅ User authenticated');
                }
            });

            this.testConnectionAsync();
        } catch (error) {
            console.error('❌ BaseService initialization failed:', error);
        }
    }

    async checkAuth() {
        const { data: { session } } = await this.client.auth.getSession();
        if (!session) {
            console.warn('⚠️ No active session - redirecting to login');
            window.location.href = 'login.html';
            return false;
        }
        this.isAuthenticated = true;
        console.log('✅ User is authenticated:', session.user.email);
        return true;
    }

    async signOut() {
        await this.client.auth.signOut();
        window.location.href = 'login.html';
    }

    getCurrentUser() {
        return this.client.auth.getUser();
    }

    async testConnection() {
        const now = Date.now();
        if (this.connectionTested && (now - this.lastConnectionTest) < this.connectionTestInterval) {
            return this.isConnected;
        }

        try {
            if (!this.client) throw new Error('Supabase client not initialized');

            const startTime = performance.now();
            const { error } = await this.client.from('settings').select('id').limit(1);
            const responseTime = performance.now() - startTime;

            if (error && error.code !== 'PGRST116') throw error;

            this.isConnected = true;
            this.connectionTested = true;
            this.lastConnectionTest = now;
            console.log(`✅ Supabase connection test passed (${responseTime.toFixed(0)}ms)`);
            return true;
        } catch (error) {
            this.isConnected = false;
            this.connectionTested = true;
            this.lastConnectionTest = now;
            console.warn('⚠️ Supabase connection test failed:', error.message);
            return false;
        }
    }

    testConnectionAsync() {
        setTimeout(() => this.testConnection(), 1000);
    }

    async executeRequest(operation, maxRetries = this.retryConfig.maxRetries) {
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await this.waitForSlot();
                const startTime = performance.now();
                this.activeRequests++;

                const result = await operation();

                const responseTime = performance.now() - startTime;
                this.updateStats(true, responseTime);
                return result;
            } catch (error) {
                lastError = error;
                this.updateStats(false, 0);

                if (this.isNonRetryableError(error)) throw error;

                if (attempt < maxRetries) {
                    const delay = Math.min(
                        this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt),
                        this.retryConfig.maxDelay
                    );
                    console.warn(`⚠️ Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, error.message);
                    await this.sleep(delay);
                }
            } finally {
                this.activeRequests--;
                this.processQueue();
            }
        }

        throw lastError;
    }

    waitForSlot() {
        if (this.activeRequests < this.maxConcurrentRequests) return Promise.resolve();
        return new Promise(resolve => this.requestQueue.push(resolve));
    }

    processQueue() {
        if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
            const next = this.requestQueue.shift();
            next();
        }
    }

    isNonRetryableError(error) {
        const nonRetryableCodes = ['PGRST301', 'PGRST204', '42P01', '23505'];
        return nonRetryableCodes.includes(error.code) ||
            error.message.includes('permission') ||
            error.message.includes('authentication');
    }

    updateStats(success, responseTime) {
        this.stats.requestCount++;
        if (success) {
            this.stats.successCount++;
            this.stats.totalResponseTime += responseTime;
            this.stats.avgResponseTime = this.stats.totalResponseTime / this.stats.successCount;
        } else {
            this.stats.errorCount++;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            lastTest: this.lastConnectionTest,
            testAge: Date.now() - this.lastConnectionTest,
            nextTest: this.lastConnectionTest + this.connectionTestInterval
        };
    }

    getStatistics() {
        return {
            ...this.stats,
            successRate: this.stats.requestCount > 0
                ? (this.stats.successCount / this.stats.requestCount * 100).toFixed(1) + '%'
                : '0%',
            activeRequests: this.activeRequests,
            queueLength: this.requestQueue.length
        };
    }

    async healthCheck() {
        try {
            const connected = await this.testConnection();
            const stats = this.getStatistics();

            let status = 'healthy';
            const issues = [];

            if (!connected) { status = 'disconnected'; issues.push('No connection to Supabase'); }
            if (stats.successRate < 80 && this.stats.requestCount > 10) {
                status = 'degraded';
                issues.push(`Low success rate: ${stats.successRate}`);
            }
            if (this.activeRequests >= this.maxConcurrentRequests) {
                status = 'overloaded';
                issues.push('Request queue full');
            }

            return { status, connected, issues, stats, timestamp: Date.now() };
        } catch (error) {
            return { status: 'error', connected: false, issues: [error.message], timestamp: Date.now() };
        }
    }

    destroy() {
        console.log('🗑️ Destroying BaseService...');
        this.requestQueue = [];
        this.isConnected = false;
        this.connectionTested = false;
    }
}
