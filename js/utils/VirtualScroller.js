/**
 * VirtualScroller — lightweight virtual scroll for a <table> inside a fixed-height container.
 *
 * Only rows within the visible viewport (+ a buffer) are in the DOM.
 * Spacer <tr> elements at top and bottom maintain the total scroll height.
 *
 * Usage:
 *   const vs = new VirtualScroller({ container, tbody, items, renderRow });
 *   vs.mount();    // first render + attach scroll listener
 *   vs.destroy();  // remove scroll listener
 *
 * @param {HTMLElement} container  - scrollable wrapper element
 * @param {HTMLElement} tbody      - <tbody> to render into
 * @param {any[]}       items      - data items (one per row)
 * @param {Function}    renderRow  - (item) => HTML string for one row
 * @param {number}      [rowHeight=80]   - estimated row height in px
 * @param {number}      [bufferSize=8]   - extra rows above/below the viewport
 */
export class VirtualScroller {
    constructor({ container, tbody, items, renderRow, rowHeight = 80, bufferSize = 8 }) {
        this.container = container;
        this.tbody = tbody;
        this.items = items;
        this.renderRow = renderRow;
        this.rowHeight = rowHeight;
        this.bufferSize = bufferSize;
        this._onScroll = this._render.bind(this);
    }

    mount() {
        this.container.addEventListener('scroll', this._onScroll, { passive: true });
        this._render();
    }

    destroy() {
        this.container.removeEventListener('scroll', this._onScroll);
    }

    /** Re-render visible slice (e.g. after state changes like checkbox selection). */
    invalidate() {
        this._render();
    }

    _render() {
        const { scrollTop, clientHeight } = this.container;
        const total = this.items.length;
        const rh = this.rowHeight;

        const firstVisible = Math.max(0, Math.floor(scrollTop / rh) - this.bufferSize);
        const lastVisible  = Math.min(total - 1, Math.ceil((scrollTop + clientHeight) / rh) + this.bufferSize);

        const topPx    = firstVisible * rh;
        const bottomPx = (total - 1 - lastVisible) * rh;

        const rowsHtml = this.items
            .slice(firstVisible, lastVisible + 1)
            .map(item => this.renderRow(item))
            .join('');

        this.tbody.innerHTML =
            `<tr class="vs-spacer" style="height:${topPx}px" aria-hidden="true"><td colspan="99"></td></tr>` +
            rowsHtml +
            `<tr class="vs-spacer" style="height:${bottomPx}px" aria-hidden="true"><td colspan="99"></td></tr>`;
    }
}
