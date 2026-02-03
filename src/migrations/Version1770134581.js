/**
 * NextGen Framework - Move character state to metadata
 * Migrates height, position, health, armor columns into metadata JSON
 */
module.exports = {
    async up(db) {
        // Check if height column exists (indicator that old schema is active)
        const columns = await db.query("SHOW COLUMNS FROM characters LIKE 'height'");
        if (columns.length === 0) return; // Fresh install, nothing to migrate

        // Merge height, health, armor into metadata
        await db.execute(`
            UPDATE characters
            SET metadata = JSON_SET(
                COALESCE(metadata, '{}'),
                '$.height', COALESCE(height, 180),
                '$.health', COALESCE(health, 200),
                '$.armor', COALESCE(armor, 0)
            )
        `);

        // Merge position into metadata (only where position exists)
        await db.execute(`
            UPDATE characters
            SET metadata = JSON_SET(
                COALESCE(metadata, '{}'),
                '$.position', position
            )
            WHERE position IS NOT NULL
        `);

        // Drop columns
        await db.execute('ALTER TABLE characters DROP COLUMN height');
        await db.execute('ALTER TABLE characters DROP COLUMN position');
        await db.execute('ALTER TABLE characters DROP COLUMN health');
        await db.execute('ALTER TABLE characters DROP COLUMN armor');
    }
};
