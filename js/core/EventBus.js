// js/core/EventBus.js - REWRITTEN FOR ROBUST EVENT MANAGEMENT

export class EventBus {
    constructor() {
        this.events = new Map();
        this.eventLog = [];
        this.maxLogEntries = 100;
        this.isDestroyed = false;
        this.eventStats = new Map();

        // Track listener lifecycle for memory leak detection
        this.listenerMetadata = new WeakMap();
        this.nextListenerId = 1;

        console.log('📡 EventBus initialized');
    }

    // REGISTER event listener with validation and metadata
    on(event, handler, options = {}) {
        if (this.isDestroyed) {
            console.warn('⚠️ Attempting to register on destroyed EventBus');
            return () => {};
        }

        if (!this.validateEventName(event)) {
            console.error(`❌ Invalid event name: "${event}"`);
            return () => {};
        }

        if (typeof handler !== 'function') {
            console.error(`❌ Event handler must be a function for event: "${event}"`);
            return () => {};
        }

        // Initialize event handlers array if needed
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }

        // Create wrapper with metadata
        const wrappedHandler = this.createHandlerWrapper(handler, event, options);

        // Store metadata for debugging and cleanup
        this.listenerMetadata.set(wrappedHandler, {
            id: this.nextListenerId++,
            event,
            originalHandler: handler,
            registeredAt: new Date(),
            options,
            callCount: 0,
            lastCalled: null,
            errors: []
        });

        // Add to handlers list
        this.events.get(event).push(wrappedHandler);

        // Update statistics
        this.updateEventStats(event, 'listener_added');

        const handlerCount = this.events.get(event).length;
        console.log(`👂 Registered listener for "${event}" (${handlerCount} total)`);

        // Return unsubscribe function
        return () => this.off(event, wrappedHandler);
    }

    // UNREGISTER event listener
    off(event, handler) {
        if (this.isDestroyed) {
            console.warn('⚠️ Attempting to unregister on destroyed EventBus');
            return;
        }

        const handlers = this.events.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);

                // Clean up metadata
                if (this.listenerMetadata.has(handler)) {
                    this.listenerMetadata.delete(handler);
                }

                // Update statistics
                this.updateEventStats(event, 'listener_removed');

                const remainingCount = handlers.length;
                console.log(`🔇 Unregistered listener for "${event}" (${remainingCount} remaining)`);

                // Clean up empty event arrays
                if (remainingCount === 0) {
                    this.events.delete(event);
                }
            }
        }
    }

    // EMIT event with error handling and logging
    emit(event, data = null) {
        if (this.isDestroyed) {
            console.warn('⚠️ Attempting to emit on destroyed EventBus');
            return false;
        }

        if (!this.validateEventName(event)) {
            console.error(`❌ Invalid event name: "${event}"`);
            return false;
        }

        const startTime = performance.now();
        const handlers = this.events.get(event);

        if (!handlers || handlers.length === 0) {
            this.logEvent(event, data, 0, 0, 'no_listeners');
            return true; // Not an error to emit events with no listeners
        }

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        console.log(`📡 Emitting "${event}" to ${handlers.length} listener(s)`);

        // Execute all handlers
        handlers.forEach((handler, index) => {
            try {
                const metadata = this.listenerMetadata.get(handler);

                // Call the handler
                handler(data);

                // Update metadata
                if (metadata) {
                    metadata.callCount++;
                    metadata.lastCalled = new Date();
                }

                successCount++;

            } catch (error) {
                errorCount++;
                errors.push({ index, error });

                // Update error metadata
                const metadata = this.listenerMetadata.get(handler);
                if (metadata) {
                    metadata.errors.push({
                        error: error.message,
                        timestamp: new Date(),
                        data: this.summarizeData(data)
                    });
                }

                console.error(`❌ Error in event handler ${index} for "${event}":`, error);
            }
        });

        const duration = performance.now() - startTime;
        const status = errorCount > 0 ? 'partial_success' : 'success';

        // Log the event execution
        this.logEvent(event, data, successCount, errorCount, status, duration);

        // Update statistics
        this.updateEventStats(event, 'emitted', { successCount, errorCount, duration });

        // Warn about slow events
        if (duration > 50) {
            console.warn(`⚠️ Slow event "${event}" took ${duration.toFixed(2)}ms`);
        }

        // Report errors but don't fail the entire emit
        if (errorCount > 0) {
            console.warn(`⚠️ Event "${event}" had ${errorCount}/${handlers.length} handler errors`);
        }

        return errorCount === 0;
    }

    // REGISTER one-time event listener
    once(event, handler, options = {}) {
        const onceWrapper = (data) => {
            handler(data);
            this.off(event, onceWrapper);
        };

        return this.on(event, onceWrapper, { ...options, once: true });
    }

    // EMIT with delay
    emitAsync(event, data = null, delay = 0) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const result = this.emit(event, data);
                resolve(result);
            }, delay);
        });
    }

    // GET all listeners for an event
    getListeners(event) {
        const handlers = this.events.get(event);
        return handlers ? [...handlers] : [];
    }

    // GET all event names
    getEventNames() {
        return Array.from(this.events.keys());
    }

    // GET listener count for an event
    getListenerCount(event) {
        const handlers = this.events.get(event);
        return handlers ? handlers.length : 0;
    }

    // CREATE handler wrapper with error handling
    createHandlerWrapper(handler, event, options) {
        return (data) => {
            try {
                // Apply options
                if (options.filter && typeof options.filter === 'function') {
                    if (!options.filter(data)) {
                        return; // Skip if filter doesn't pass
                    }
                }

                // Add context if requested
                if (options.context) {
                    const contextualData = {
                        ...data,
                        _context: {
                            event,
                            timestamp: Date.now(),
                            ...options.context
                        }
                    };
                    handler(contextualData);
                } else {
                    handler(data);
                }

            } catch (error) {
                // Re-throw to be caught by emit() for proper error handling
                throw error;
            }
        };
    }

    // VALIDATE event name format
    validateEventName(event) {
        if (typeof event !== 'string') {
            return false;
        }

        if (event.length === 0 || event.length > 100) {
            return false;
        }

        // Allow alphanumeric, colons, hyphens, underscores
        const validPattern = /^[a-zA-Z0-9:_-]+$/;
        return validPattern.test(event);
    }

    // LOG event execution
    logEvent(event, data, successCount, errorCount, status, duration = 0) {
        const logEntry = {
            timestamp: Date.now(),
            event,
            data: this.summarizeData(data),
            successCount,
            errorCount,
            status,
            duration: Math.round(duration * 100) / 100 // Round to 2 decimal places
        };

        this.eventLog.push(logEntry);

        // Trim log if too long
        if (this.eventLog.length > this.maxLogEntries) {
            this.eventLog.shift();
        }

        // Log important events in development
        if (this.isDevelopment() && this.isImportantEvent(event)) {
            console.log(`📋 Event logged: ${event}`, {
                listeners: successCount,
                errors: errorCount,
                duration: `${logEntry.duration}ms`
            });
        }
    }

    // UPDATE event statistics
    updateEventStats(event, action, details = {}) {
        if (!this.eventStats.has(event)) {
            this.eventStats.set(event, {
                emitCount: 0,
                listenerCount: 0,
                errorCount: 0,
                totalDuration: 0,
                avgDuration: 0,
                lastEmitted: null,
                created: Date.now()
            });
        }

        const stats = this.eventStats.get(event);

        switch (action) {
            case 'listener_added':
                stats.listenerCount++;
                break;

            case 'listener_removed':
                stats.listenerCount = Math.max(0, stats.listenerCount - 1);
                break;

            case 'emitted':
                stats.emitCount++;
                stats.errorCount += details.errorCount || 0;
                stats.totalDuration += details.duration || 0;
                stats.avgDuration = stats.totalDuration / stats.emitCount;
                stats.lastEmitted = Date.now();
                break;
        }
    }

    // SUMMARIZE data for logging
    summarizeData(data) {
        if (data === null || data === undefined) {
            return data;
        }

        if (typeof data === 'string' && data.length > 100) {
            return `"${data.substring(0, 97)}..."`;
        }

        if (Array.isArray(data)) {
            return `Array(${data.length})`;
        }

        if (typeof data === 'object') {
            const keys = Object.keys(data);
            if (keys.length === 0) return '{}';
            if (keys.length <= 5) return `{${keys.join(', ')}}`;
            return `{${keys.slice(0, 5).join(', ')}... +${keys.length - 5}}`;
        }

        return data;
    }

    // CHECK if event is important for logging
    isImportantEvent(event) {
        const important = [
            'order:created', 'order:updated', 'order:deleted',
            'client:created', 'client:updated', 'client:deleted',
            'route:change', 'modal:open', 'modal:close',
            'settings:updated', 'data:corrupted'
        ];

        return important.includes(event) || event.startsWith('error:');
    }

    // CHECK if in development environment
    isDevelopment() {
        return window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.endsWith('.local');
    }

    // DEBUGGING methods
    getEventLog(filter = null) {
        if (!filter) {
            return [...this.eventLog];
        }

        return this.eventLog.filter(entry => {
            if (typeof filter === 'string') {
                return entry.event.includes(filter);
            }
            if (typeof filter === 'function') {
                return filter(entry);
            }
            return true;
        });
    }

    getEventStats(event = null) {
        if (event) {
            return this.eventStats.get(event) || null;
        }

        const stats = {};
        this.eventStats.forEach((value, key) => {
            stats[key] = { ...value };
        });
        return stats;
    }

    getListenerMetadata() {
        const metadata = [];

        this.events.forEach((handlers, event) => {
            handlers.forEach(handler => {
                const meta = this.listenerMetadata.get(handler);
                if (meta) {
                    metadata.push({
                        event,
                        id: meta.id,
                        registeredAt: meta.registeredAt,
                        callCount: meta.callCount,
                        lastCalled: meta.lastCalled,
                        errorCount: meta.errors.length
                    });
                }
            });
        });

        return metadata;
    }

    debugEventBus() {
        console.group('🔍 EVENTBUS DEBUG');
        console.log('Total events:', this.events.size);
        console.log('Total listeners:', this.getTotalListenerCount());
        console.log('Event log entries:', this.eventLog.length);

        console.log('Events with listeners:');
        this.events.forEach((handlers, event) => {
            console.log(`  ${event}: ${handlers.length} listeners`);
        });

        console.log('Most active events:');
        const sortedStats = Array.from(this.eventStats.entries())
            .sort((a, b) => b[1].emitCount - a[1].emitCount)
            .slice(0, 5);

        sortedStats.forEach(([event, stats]) => {
            console.log(`  ${event}: ${stats.emitCount} emits, ${stats.avgDuration.toFixed(2)}ms avg`);
        });

        console.groupEnd();
    }

    getTotalListenerCount() {
        let total = 0;
        this.events.forEach(handlers => {
            total += handlers.length;
        });
        return total;
    }

    // MEMORY cleanup methods
    removeAllListeners(event = null) {
        if (event) {
            const handlers = this.events.get(event);
            if (handlers) {
                // Clean up metadata
                handlers.forEach(handler => {
                    if (this.listenerMetadata.has(handler)) {
                        this.listenerMetadata.delete(handler);
                    }
                });

                this.events.delete(event);
                this.eventStats.delete(event);
                console.log(`🧹 Removed all listeners for "${event}"`);
            }
        } else {
            // Remove all listeners for all events
            this.events.clear();
            this.eventStats.clear();
            // WeakMap will be garbage collected automatically
            console.log('🧹 Removed all event listeners');
        }
    }

    // DESTROY the EventBus
    destroy() {
        console.log('🗑️ Destroying EventBus...');

        this.removeAllListeners();
        this.eventLog = [];
        this.isDestroyed = true;

        console.log('✅ EventBus destroyed');
    }

    // HEALTH check
    getHealth() {
        const totalListeners = this.getTotalListenerCount();
        const memoryEvents = this.events.size;
        const logEntries = this.eventLog.length;

        return {
            status: this.isDestroyed ? 'destroyed' : 'healthy',
            totalListeners,
            totalEvents: memoryEvents,
            logEntries,
            warnings: this.getHealthWarnings(totalListeners, memoryEvents)
        };
    }

    getHealthWarnings(totalListeners, totalEvents) {
        const warnings = [];

        if (totalListeners > 100) {
            warnings.push(`High listener count: ${totalListeners}`);
        }

        if (totalEvents > 50) {
            warnings.push(`Many event types: ${totalEvents}`);
        }

        // Check for events with many listeners (potential memory leaks)
        this.events.forEach((handlers, event) => {
            if (handlers.length > 10) {
                warnings.push(`Event "${event}" has ${handlers.length} listeners`);
            }
        });

        return warnings;
    }
}