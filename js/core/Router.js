export class Router {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.currentView = 'orders';
        this.routes = {
            orders: 'orders',
            clients: 'clients',
            inventory: 'inventory',
            expenses: 'expenses',
            reports: 'reports',
            settings: 'settings'
        };
    }

    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    }

    navigate(view) {
        if (this.routes[view]) {
            window.location.hash = view;
            this.currentView = view;
            this.eventBus.emit('route:change', view);
        }
    }

    handleRoute() {
        const hash = window.location.hash.slice(1) || 'orders';
        if (this.routes[hash]) {
            this.currentView = hash;
            this.eventBus.emit('route:change', hash);
        }
    }

    getCurrentView() {
        return this.currentView;
    }
}