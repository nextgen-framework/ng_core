/**
 * NextGen Framework - Split characters into data + metadata columns
 * data = personalized info (firstname, lastname, dob, gender, height, appearance)
 * metadata = in-game state (position, health, armor)
 */
module.exports = {
    async up(db) {
        // Check if firstname column still exists (needs migration)
        const columns = await db.query("SHOW COLUMNS FROM characters LIKE 'firstname'");
        if (columns.length === 0) return; // Fresh install, nothing to migrate

        // Add data column if not exists
        const dataCol = await db.query("SHOW COLUMNS FROM characters LIKE 'data'");
        if (dataCol.length === 0) {
            await db.execute("ALTER TABLE characters ADD COLUMN data JSON DEFAULT NULL AFTER identifier");
        }

        // Build data JSON from columns + height from metadata
        await db.execute(`
            UPDATE characters
            SET data = JSON_OBJECT(
                'firstname', firstname,
                'lastname', lastname,
                'dob', COALESCE(dob, '1990-01-01'),
                'gender', gender,
                'height', COALESCE(JSON_EXTRACT(metadata, '$.height'), 180)
            )
        `);

        // Remove height from metadata (keep position, health, armor)
        await db.execute(`
            UPDATE characters
            SET metadata = JSON_REMOVE(metadata, '$.height')
            WHERE metadata IS NOT NULL AND JSON_CONTAINS_PATH(metadata, 'one', '$.height')
        `);

        // Drop identity columns
        await db.execute('ALTER TABLE characters DROP COLUMN firstname');
        await db.execute('ALTER TABLE characters DROP COLUMN lastname');
        await db.execute('ALTER TABLE characters DROP COLUMN dob');
        await db.execute('ALTER TABLE characters DROP COLUMN gender');
    }
};
