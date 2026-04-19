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

            return data.map(exp => {
                const amountEUR = parseFloat(exp.amount_eur) || 0;
                return {
                    id: exp.id,
                    month: exp.month_key,
                    name: exp.name || 'Без име',
                    category: exp.name || 'Без име',
                    amount: amountEUR,
                    amountEUR: amountEUR,
                    description: exp.note || '',
                    note: exp.note || '',
                    isDefault: false,
                    currency: 'EUR'
                };
            });
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
        return {
            id: dbExpense.id,
            month: dbExpense.month,
            category: dbExpense.category,
            amount: amountEUR,
            amountEUR,
            description: dbExpense.description || '',
            isDefault: dbExpense.is_default || false,
            currency: 'EUR'
        };
    }
}
