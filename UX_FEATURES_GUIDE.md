# UX Features Implementation Guide

## Overview

This document describes three major UX improvements implemented to eliminate dead ends, reduce cognitive friction, and make the interface feel "alive":

- **Feature D**: Smart Empty States
- **Feature E**: Skeleton Loading (Shimmer Effects)
- **Feature F**: Toast Notification Stacking

---

## Feature D: Smart Empty States

### Concept
Never present users with blank screens or generic "No data found" messages. Every empty state is contextual, explanatory, and actionable.

### API

```javascript
// Access via UIManager
window.app.ui.renderEmptyState(context, customOptions)
```

### Contexts

#### 1. **Search** - When filters/search yield no results
```javascript
const emptyState = window.app.ui.renderEmptyState('search', {
    searchTerm: 'Daniel'
});
// Shows: "Не намерихме резултати за "Daniel""
// Actions: "Изчисти филтрите" | "Опитай отново"
```

#### 2. **Fresh** - First-time/empty database
```javascript
const emptyState = window.app.ui.renderEmptyState('fresh', {
    icon: '👥',
    title: 'Няма клиенти',
    message: 'Създайте първия клиент, за да проследявате историята',
    actionText: 'Създай клиент',
    action: 'create'
});
// Shows custom fresh state with primary CTA
```

#### 3. **Filter** - Active filters with no matches
```javascript
const emptyState = window.app.ui.renderEmptyState('filter');
// Shows: "Няма съвпадения"
// Action: "Изчисти филтрите"
```

#### 4. **Error** - System failure
```javascript
const emptyState = window.app.ui.renderEmptyState('error', {
    message: 'Грешка при зареждане от базата данни'
});
// Shows: "Възникна грешка"
// Actions: "Опитай отново" | "Свържи се с поддръжката"
```

### Usage in Views

```javascript
// In OrdersView.js
renderTable(orders) {
    if (orders.length === 0) {
        return window.app.ui.renderEmptyState('fresh', {
            icon: '📋',
            title: 'Няма поръчки',
            message: 'Създайте първата поръчка, за да започнете',
            actionText: 'Нова поръчка',
            action: 'create'
        });
    }

    return `<table>...</table>`;
}

// Attach action handlers
attachListeners() {
    document.querySelector('[data-empty-action="create"]')?.addEventListener('click', () => {
        this.eventBus.emit('modal:open', { type: 'order', mode: 'create' });
    });
}
```

### Visual Design

- **Icon**: Large animated floating emoji (64px)
- **Title**: Bold, clear statement (24px)
- **Message**: Secondary explanation (16px, max-width 480px)
- **Actions**: Primary + optional secondary buttons

---

## Feature E: Skeleton Loading (Shimmer Effects)

### Concept
Replace blocking spinners with skeleton placeholders that mirror the final UI layout, reducing perceived wait time and preventing layout shifts (CLS).

### CSS Classes

#### Base Skeleton
```html
<div class="skeleton"></div>
```
- Shimmer gradient animation (1.5s loop)
- Wave overlay effect
- Neutral gray background

#### Variants

**Text skeletons:**
```html
<div class="skeleton skeleton-text"></div>           <!-- Full width -->
<div class="skeleton skeleton-text short"></div>     <!-- 60% width -->
<div class="skeleton skeleton-text medium"></div>    <!-- 80% width -->
<div class="skeleton skeleton-title"></div>          <!-- Larger, 40% width -->
```

**Component skeletons:**
```html
<div class="skeleton skeleton-avatar"></div>         <!-- 48x48 circle -->
<div class="skeleton skeleton-button"></div>         <!-- Button-sized -->
```

**Layout skeletons:**
```html
<div class="skeleton-card">
    <div class="skeleton skeleton-text medium"></div>
    <div class="skeleton skeleton-text"></div>
</div>

<div class="skeleton-table-row">
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-text short"></div>
</div>
```

### Automatic Loading States

The UIManager automatically shows skeletons when switching views:

```javascript
// UIManager.js - renderSkeletonForView()
const skeletonTemplates = {
    orders: `...5 skeleton table rows...`,
    clients: `...6 skeleton cards...`,
    inventory: `...5 skeleton table rows...`
};
```

### Custom Skeleton in Views

```javascript
// ClientsView.js
async render() {
    // Return skeleton immediately
    if (!this.dataLoaded) {
        return `
            <div class="skeleton-container">
                ${Array(6).fill(0).map(() => `
                    <div class="skeleton-card">
                        <div class="skeleton skeleton-title"></div>
                        <div class="skeleton skeleton-text"></div>
                        <div class="skeleton skeleton-text short"></div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Then load data and re-render
    const clients = await this.clientsModule.getClients();
    this.dataLoaded = true;
    return this.renderClients(clients);
}
```

### Animation Details

- **Shimmer**: Background gradient slides left-to-right (1.5s)
- **Wave**: Overlay effect sweeps across (1.5s)
- **Non-interactive**: Skeletons are visual only, no click handlers

---

## Feature F: Toast Notification Stacking

### Concept
Modern, glass-morphism toast notifications that stack vertically in the bottom-right corner with auto-dismiss and optional undo actions.

### API

```javascript
// Basic usage (backward compatible)
this.eventBus.emit('notification:show', {
    message: '✅ Поръчката е създадена успешно!',
    type: 'success'
});

// Advanced usage with options
window.app.ui.showNotification(
    'Поръчката е изтрита',
    'success',
    {
        duration: 5000,  // Auto-dismiss after 5s (default: 4000)
        undoAction: () => {
            // Restore deleted order
            this.restoreOrder(orderId);
        }
    }
);
```

### Notification Types

| Type | Icon | Border Color | Use Case |
|------|------|-------------|----------|
| `success` | ✅ | Green (#9bbf9a) | Successful operations |
| `error` | ❌ | Red (#c98b8b) | Failed operations |
| `warning` | ⚠️ | Orange (#d2b48c) | Warnings, confirmations |
| `info` | ℹ️ | Blue (#8b9dc3) | General information |

### Features

#### 1. **Stacking**
- Bottom-right corner positioning
- Vertical stack (newest at bottom)
- Maximum 5 toasts visible
- Older toasts auto-removed when limit exceeded

#### 2. **Auto-Dismiss**
- Default: 4 seconds
- Customizable via `duration` option
- Set `duration: 0` for persistent toast

#### 3. **Undo Action**
```javascript
// Delete order with undo
window.app.ui.showNotification(
    'Поръчката е изтрита',
    'success',
    {
        undoAction: () => {
            this.ordersModule.restore(orderId);
            this.refresh();
        }
    }
);
```
- Undo button appears when `undoAction` provided
- Clicking undo triggers callback and dismisses toast
- Perfect for destructive operations

#### 4. **Manual Dismiss**
- Close button (×) on all toasts
- Click to immediately dismiss
- Smooth slide-out animation

### Animations

**Entrance:**
```css
transform: translateX(100%) scale(0.9) → translateX(0) scale(1)
opacity: 0 → 1
duration: 300ms cubic-bezier(0.4, 0, 0.2, 1)
```

**Exit:**
```css
transform: translateX(0) scale(1) → translateX(100%) scale(0.9)
opacity: 1 → 0
duration: 300ms
```

### Accessibility

- `role="alert"` for screen readers
- `aria-live="polite"` for non-disruptive announcements
- Keyboard-accessible close button
- Sufficient color contrast (WCAG AA)

### Responsive Behavior

**Desktop:**
- Fixed bottom-right (20px from edge)
- Min-width: 320px
- Max-width: 420px

**Mobile:**
- Bottom-right (10px from edge)
- Full-width minus 20px padding
- Single column stack

---

## Implementation Examples

### Example 1: Orders View with Empty States

```javascript
// OrdersView.js
async render() {
    const orders = await this.ordersModule.filterOrders(this.filters);

    // Smart empty states based on context
    if (orders.length === 0) {
        if (this.filters.search) {
            // Search context
            return window.app.ui.renderEmptyState('search', {
                searchTerm: this.filters.search
            });
        } else if (this.filters.status !== 'all') {
            // Filter context
            return window.app.ui.renderEmptyState('filter');
        } else {
            // Fresh/empty database
            return window.app.ui.renderEmptyState('fresh', {
                icon: '📋',
                title: 'Няма поръчки',
                message: 'Създайте първата поръчка',
                actionText: 'Нова поръчка',
                action: 'create'
            });
        }
    }

    return this.renderTable(orders);
}
```

### Example 2: Delete with Undo

```javascript
// OrdersView.js
async deleteOrder(orderId) {
    const order = await this.ordersModule.findOrderById(orderId);

    // Delete
    await this.ordersModule.delete(orderId);
    await this.refresh();

    // Show toast with undo
    window.app.ui.showNotification(
        `Поръчката от ${order.client} е изтрита`,
        'success',
        {
            duration: 6000,
            undoAction: async () => {
                // Restore order
                await this.ordersModule.create(order);
                await this.refresh();
                window.app.ui.showNotification(
                    'Поръчката е възстановена',
                    'success'
                );
            }
        }
    );
}
```

### Example 3: Skeleton + Empty State Flow

```javascript
// ClientsView.js
constructor() {
    this.loading = true;
}

async render() {
    // 1. Show skeleton while loading
    if (this.loading) {
        return window.app.ui.renderSkeletonForView('clients');
    }

    // 2. Load data
    const clients = await this.clientsModule.getClients();
    this.loading = false;

    // 3. Show empty state if no data
    if (clients.length === 0) {
        return window.app.ui.renderEmptyState('fresh', {
            icon: '👥',
            title: 'Няма клиенти',
            message: 'Създайте първия клиент',
            actionText: 'Създай клиент',
            action: 'create'
        });
    }

    // 4. Render data
    return this.renderClients(clients);
}
```

---

## Best Practices

### Empty States
1. **Always provide context** - Explain why it's empty
2. **Always provide action** - Give users a next step
3. **Use appropriate icon** - Match the entity type (📋 orders, 👥 clients, etc.)
4. **Keep message concise** - 1-2 sentences max

### Skeletons
1. **Match final layout** - Skeletons should mirror real content structure
2. **Use appropriate variants** - Text vs buttons vs cards
3. **Show immediately** - Don't delay skeleton rendering
4. **Transition smoothly** - Let skeletons fade into real content

### Toasts
1. **Use sparingly** - Only for important feedback
2. **Match action type** - Success, error, warning, info
3. **Keep messages short** - One line if possible
4. **Provide undo for destructive actions** - Deletions, bulk updates
5. **Don't stack too many** - Max 5 visible at once

---

## Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support (requires `-webkit-backdrop-filter` for toast blur)
- **Mobile**: Responsive design, touch-friendly

---

## Performance Considerations

- **Skeletons**: CSS-only animations, no JavaScript overhead
- **Toasts**: Efficient DOM manipulation, automatic cleanup
- **Empty states**: Static HTML, minimal re-renders

---

## Accessibility (WCAG AA)

✅ **Color contrast**: All text meets 4.5:1 minimum
✅ **Keyboard navigation**: All interactive elements focusable
✅ **Screen readers**: Proper ARIA labels and live regions
✅ **Motion**: Respects `prefers-reduced-motion`
✅ **Focus indicators**: Clear visual focus states

---

## Migration Guide

### Old notification system:
```javascript
this.showNotification('Order created', 'success');
```

### New system (backward compatible):
```javascript
// Still works!
this.eventBus.emit('notification:show', {
    message: 'Order created',
    type: 'success'
});

// Or use new features:
window.app.ui.showNotification('Order created', 'success', {
    duration: 5000,
    undoAction: () => { /* ... */ }
});
```

No breaking changes - all existing code continues to work!
