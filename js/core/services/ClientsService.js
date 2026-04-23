export class ClientsService {
    constructor(base) {
        this.base = base;
    }

    get client() { return this.base.client; }

    async createClient(clientData) {
        return this.base.executeRequest(async () => {
            console.log('📝 Creating client in Supabase:', clientData.name);

            const { data, error } = await this.client
                .from('clients')
                .insert([{
                    name: clientData.name,
                    phone: clientData.phone || '',
                    email: clientData.email || '',
                    address: clientData.address || '',
                    preferred_source: clientData.preferredSource || '',
                    notes: clientData.notes || ''
                }])
                .select()
                .single();

            if (error) throw error;

            const transformed = this.transformClientFromDB(data);
            console.log('✅ Client created successfully');
            return transformed;
        });
    }

    async getClients() {
        return this.base.executeRequest(async () => {
            console.log('📂 Loading clients from Supabase');

            const { data, error } = await this.client
                .from('clients')
                .select('*')
                .order('name');

            if (error) throw error;

            const transformed = data.map(c => this.transformClientFromDB(c));
            console.log(`✅ Loaded ${transformed.length} clients`);
            return transformed;
        });
    }

    async updateClient(clientId, clientData) {
        return this.base.executeRequest(async () => {
            console.log('✏️ Updating client in Supabase:', clientId);

            const dbId = this.extractDbId(clientId);

            const { data, error } = await this.client
                .from('clients')
                .update({
                    name: clientData.name,
                    phone: clientData.phone || '',
                    email: clientData.email || '',
                    address: clientData.address || '',
                    preferred_source: clientData.preferredSource || '',
                    notes: clientData.notes || ''
                })
                .eq('id', dbId)
                .select()
                .single();

            if (error) throw error;

            const transformed = this.transformClientFromDB(data);
            console.log('✅ Client updated successfully');
            return transformed;
        });
    }

    async deleteClient(clientId) {
        return this.base.executeRequest(async () => {
            const dbId = this.extractDbId(clientId);

            const { error } = await this.client
                .from('clients')
                .delete()
                .eq('id', dbId);

            if (error) throw error;
            console.log('✅ Client deleted successfully');
            return true;
        });
    }

    transformClientFromDB(dbClient) {
        return {
            id: 'client_' + dbClient.id,
            name: dbClient.name,
            phone: dbClient.phone || '',
            email: dbClient.email || '',
            address: dbClient.address || '',
            preferredSource: dbClient.preferred_source || '',
            notes: dbClient.notes || '',
            createdDate: dbClient.created_at
        };
    }

    extractDbId(clientId) {
        if (typeof clientId === 'string' && clientId.startsWith('client_')) {
            return parseInt(clientId.replace('client_', ''));
        }
        return parseInt(clientId);
    }
}
