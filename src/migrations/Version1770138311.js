/**
 * NextGen Framework - Drop legacy tables
 * - ui_blips, text3d_points, spawn_points (now in-memory only)
 * - vehicle_keys, door_states, container_access, property_keys (unified into generic_access)
 */
module.exports = {
    async up(db) {
        const tables = [
            'ui_blips', 'text3d_points', 'spawn_points',
            'vehicle_keys', 'door_states', 'container_access', 'property_keys'
        ];

        for (const table of tables) {
            const exists = await db.query(`SHOW TABLES LIKE '${table}'`);
            if (exists.length > 0) {
                await db.execute(`DROP TABLE ${table}`);
            }
        }
    }
};
