/**
 * NextGen Framework - Drop unused tables (ui_blips, text3d_points, spawn_points)
 * These modules now work in-memory only, no DB persistence needed.
 */
module.exports = {
    async up(db) {
        const tables = ['ui_blips', 'text3d_points', 'spawn_points'];

        for (const table of tables) {
            const exists = await db.query(`SHOW TABLES LIKE '${table}'`);
            if (exists.length > 0) {
                await db.execute(`DROP TABLE ${table}`);
            }
        }
    }
};
