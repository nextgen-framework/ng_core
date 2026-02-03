/**
 * NextGen Framework - Drop legacy access tables (vehicle_keys, door_states, container_access, property_keys)
 * All access now goes through the single generic_access table.
 */
module.exports = {
    async up(db) {
        const tables = ['vehicle_keys', 'door_states', 'container_access', 'property_keys'];

        for (const table of tables) {
            const exists = await db.query(`SHOW TABLES LIKE '${table}'`);
            if (exists.length > 0) {
                await db.execute(`DROP TABLE ${table}`);
            }
        }
    }
};
