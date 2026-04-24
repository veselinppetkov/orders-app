export class ExpensesService {
    constructor(base) {
        this.base = base;
    }

    get client() { return this.base.client; }

    async createExpense(expenseData) {
        return this.base.executeRequest(async () => {
            console.log('💰 Creating expense in Supabase:', expenseData.category || expenseData.name);

            const amountEUR = parseFloat(expenseData.amount) || 0;

            const { data, error } = await this.client
                .from('expenses')
                .insert([{
                    month_key: expenseData.month,
                    name: expenseData.category || expenseData.name,
                    amount: 0,
                    amount_eur: amountEUR,
                    note: expenseData.description || expenseData.note || ''
                }])
                .select()
                .single();

            if (error) throw error;
            return this.transformExpenseFromDB(data);
        });
    }

    async getExpenses(month = null) {
        return this.base.executeRequest(async () => {
            console.log('💰 Loading expenses from Supabase', month ? `for ${month}` : '(all)');

            let query = this.client
                .from('expenses')
                .select('*')
                .order('created_at', { ascending: false });

            if (month) query = query.eq('month_key', month);

            const { data, error } = await query;
            if (error) throw error;

            return data.map(exp => this.transformExpenseFromDB(exp));
        });
    }

    async updateExpense(expenseId, expenseData) {
        return this.base.executeRequest(async () => {
            console.log('✏️ Updating expense:', expenseId);

            const amountEUR = parseFloat(expenseData.amount) || 0;

            const { data, error } = await this.client
                .from('expenses')
                .update({
                    name: expenseData.category || expenseData.name,
                    amount: 0,
                    amount_eur: amountEUR,
                    note: expenseData.description || expenseData.note || ''
                })
                .eq('id', expenseId)
                .select()
                .single();

            if (error) throw error;
            return this.transformExpenseFromDB(data);
        });
    }

    async deleteExpense(expenseId) {
        return this.base.executeRequest(async () => {
            console.log('🗑️ Deleting expense:', expenseId);

            const { error } = await this.client
                .from('expenses')
                .delete()
                .eq('id', expenseId);

            if (error) throw error;
            return true;
        });
    }

    transformExpenseFromDB(dbExpense) {
        const amountEUR = parseFloat(dbExpense.amount_eur) || 0;
        const name = dbExpense.name || 'Без име';
        const note = dbExpense.note || '';

        return {
            id: dbExpense.id,
            month: dbExpense.month_key,
            name,
            category: name,
            amount: amountEUR,
            amountEUR,
            description: note,
            note,
            isDefault: dbExpense.is_default || false,
            currency: 'EUR'
        };
    }
}
