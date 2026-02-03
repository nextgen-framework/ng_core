/**
 * NextGen Framework - Migrate characters to data + metadata JSON columns
 * data = personalized info (firstname, lastname, dob, gender, height)
 * metadata = in-game state (position, health, armor)
 */
module.exports = {
    async up(db) {
        // Step 1: Merge height, health, armor, position into metadata
        const heightCol = await db.query("SHOW COLUMNS FROM characters LIKE 'height'");
        if (heightCol.length > 0) {
            await db.execute(`
                UPDATE characters
                SET metadata = JSON_SET(
                    COALESCE(metadata, '{}'),
                    '$.height', COALESCE(height, 180),
                    '$.health', COALESCE(health, 200),
                    '$.armor', COALESCE(armor, 0)
                )
            `);

            await db.execute(`
                UPDATE characters
                SET metadata = JSON_SET(
                    COALESCE(metadata, '{}'),
                    '$.position', position
                )
                WHERE position IS NOT NULL
            `);

            await db.execute('ALTER TABLE characters DROP COLUMN height');
            await db.execute('ALTER TABLE characters DROP COLUMN position');
            await db.execute('ALTER TABLE characters DROP COLUMN health');
            await db.execute('ALTER TABLE characters DROP COLUMN armor');
        }

        // Step 2: Split identity columns into data JSON, move height from metadata to data
        const nameCol = await db.query("SHOW COLUMNS FROM characters LIKE 'firstname'");
        if (nameCol.length === 0) return; // Fresh install or already migrated

        const dataCol = await db.query("SHOW COLUMNS FROM characters LIKE 'data'");
        if (dataCol.length === 0) {
            await db.execute("ALTER TABLE characters ADD COLUMN data JSON DEFAULT NULL AFTER identifier");
        }

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

        await db.execute(`
            UPDATE characters
            SET metadata = JSON_REMOVE(metadata, '$.height')
            WHERE metadata IS NOT NULL AND JSON_CONTAINS_PATH(metadata, 'one', '$.height')
        `);

        await db.execute('ALTER TABLE characters DROP COLUMN firstname');
        await db.execute('ALTER TABLE characters DROP COLUMN lastname');
        await db.execute('ALTER TABLE characters DROP COLUMN dob');
        await db.execute('ALTER TABLE characters DROP COLUMN gender');
    }
};
