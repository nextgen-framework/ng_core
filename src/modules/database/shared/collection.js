/**
 * NextGen Framework - Collection Abstraction
 * Provides MongoDB-like API over MySQL tables
 *
 * Each collection is a MySQL table with:
 * - id (PRIMARY KEY AUTO_INCREMENT)
 * - data (JSON column for flexible document storage)
 * - created_at (TIMESTAMP)
 * - updated_at (TIMESTAMP)
 */

class Collection {
  constructor(name, database, framework) {
    this.name = name;
    this.database = database;
    this.framework = framework;
    this.initialized = false;
  }

  /**
   * Ensure the collection table exists
   * Creates table if it doesn't exist
   */
  async ensureTable() {
    if (this.initialized) return;

    await this.database.execute(`
      CREATE TABLE IF NOT EXISTS \`${this.name}\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_created_at (created_at),
        INDEX idx_updated_at (updated_at)
      )
    `);

    this.initialized = true;
  }

  /**
   * Insert a document into the collection
   * @param {Object} document - Document to insert
   * @returns {Promise<number>} Inserted document ID
   */
  async insert(document) {
    await this.ensureTable();

    const result = await this.database.execute(
      `INSERT INTO \`${this.name}\` (data) VALUES (?)`,
      [JSON.stringify(document)]
    );

    return result.insertId;
  }

  /**
   * Insert multiple documents into the collection
   * @param {Array<Object>} documents - Documents to insert
   * @returns {Promise<number>} First inserted document ID
   */
  async insertMany(documents) {
    await this.ensureTable();

    if (documents.length === 0) {
      return null;
    }

    const values = documents.map(() => '(?)').join(', ');
    const params = documents.map(doc => JSON.stringify(doc));

    const result = await this.database.execute(
      `INSERT INTO \`${this.name}\` (data) VALUES ${values}`,
      params
    );

    return result.insertId;
  }

  /**
   * Find documents matching query
   * @param {Object} query - Query object (MongoDB-like)
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of results
   * @param {number} options.offset - Number of results to skip
   * @param {Object} options.sort - Sort order {field: 1/-1}
   * @returns {Promise<Array<Object>>} Matching documents with _id field
   */
  async find(query = {}, options = {}) {
    await this.ensureTable();

    let sql = `SELECT id, data, created_at, updated_at FROM \`${this.name}\``;
    const params = [];

    // Build WHERE clause from query
    const whereClauses = this.buildWhereClause(query, params);
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // Add sorting
    if (options.sort) {
      const sortClauses = Object.entries(options.sort)
        .map(([field, order]) => {
          const direction = order === -1 ? 'DESC' : 'ASC';
          if (field === '_id') {
            return `id ${direction}`;
          } else if (field === 'created_at' || field === 'updated_at') {
            return `${field} ${direction}`;
          } else {
            return `JSON_EXTRACT(data, '$.${field}') ${direction}`;
          }
        });
      sql += ` ORDER BY ${sortClauses.join(', ')}`;
    }

    // Add pagination
    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    const results = await this.database.query(sql, params);

    return results.map(row => {
      const doc = JSON.parse(row.data);
      doc._id = row.id;
      doc._created_at = row.created_at;
      doc._updated_at = row.updated_at;
      return doc;
    });
  }

  /**
   * Find a single document matching query
   * @param {Object} query - Query object (MongoDB-like)
   * @returns {Promise<Object|null>} Matching document or null
   */
  async findOne(query = {}) {
    const results = await this.find(query, { limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Find document by ID
   * @param {number} id - Document ID
   * @returns {Promise<Object|null>} Document or null
   */
  async findById(id) {
    return await this.findOne({ _id: id });
  }

  /**
   * Update documents matching query
   * @param {Object} query - Query object
   * @param {Object} update - Update operations ($set, $inc, etc.) or document
   * @returns {Promise<number>} Number of updated documents
   */
  async update(query, update) {
    await this.ensureTable();

    // If update is plain object, treat as $set
    const updateOps = update.$set ? update : { $set: update };

    // For now, we'll do a simple approach: fetch, modify, write back
    // TODO: Optimize with JSON_SET for direct updates
    const docs = await this.find(query);

    if (docs.length === 0) {
      return 0;
    }

    let updatedCount = 0;

    for (const doc of docs) {
      const id = doc._id;
      delete doc._id;
      delete doc._created_at;
      delete doc._updated_at;

      // Apply $set operations
      if (updateOps.$set) {
        Object.assign(doc, updateOps.$set);
      }

      // Apply $inc operations
      if (updateOps.$inc) {
        for (const [key, value] of Object.entries(updateOps.$inc)) {
          doc[key] = (doc[key] || 0) + value;
        }
      }

      // Apply $unset operations
      if (updateOps.$unset) {
        for (const key of Object.keys(updateOps.$unset)) {
          delete doc[key];
        }
      }

      await this.database.execute(
        `UPDATE \`${this.name}\` SET data = ? WHERE id = ?`,
        [JSON.stringify(doc), id]
      );

      updatedCount++;
    }

    return updatedCount;
  }

  /**
   * Update a single document matching query
   * @param {Object} query - Query object
   * @param {Object} update - Update operations
   * @returns {Promise<boolean>} True if document was updated
   */
  async updateOne(query, update) {
    const doc = await this.findOne(query);
    if (!doc) return false;

    await this.update({ _id: doc._id }, update);
    return true;
  }

  /**
   * Update document by ID
   * @param {number} id - Document ID
   * @param {Object} update - Update operations
   * @returns {Promise<boolean>} True if document was updated
   */
  async updateById(id, update) {
    return await this.updateOne({ _id: id }, update);
  }

  /**
   * Delete documents matching query
   * @param {Object} query - Query object
   * @returns {Promise<number>} Number of deleted documents
   */
  async delete(query) {
    await this.ensureTable();

    if (Object.keys(query).length === 0) {
      throw new Error('Cannot delete all documents without query. Use deleteAll() instead.');
    }

    let sql = `DELETE FROM \`${this.name}\``;
    const params = [];

    const whereClauses = this.buildWhereClause(query, params);
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const result = await this.database.execute(sql, params);
    return result.affectedRows;
  }

  /**
   * Delete a single document matching query
   * @param {Object} query - Query object
   * @returns {Promise<boolean>} True if document was deleted
   */
  async deleteOne(query) {
    const doc = await this.findOne(query);
    if (!doc) return false;

    await this.delete({ _id: doc._id });
    return true;
  }

  /**
   * Delete document by ID
   * @param {number} id - Document ID
   * @returns {Promise<boolean>} True if document was deleted
   */
  async deleteById(id) {
    return await this.deleteOne({ _id: id });
  }

  /**
   * Delete all documents in collection
   * @returns {Promise<number>} Number of deleted documents
   */
  async deleteAll() {
    await this.ensureTable();

    const result = await this.database.execute(`DELETE FROM \`${this.name}\``);
    return result.affectedRows;
  }

  /**
   * Count documents matching query
   * @param {Object} query - Query object
   * @returns {Promise<number>} Number of matching documents
   */
  async count(query = {}) {
    await this.ensureTable();

    let sql = `SELECT COUNT(*) as count FROM \`${this.name}\``;
    const params = [];

    const whereClauses = this.buildWhereClause(query, params);
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const result = await this.database.scalar(sql, params);
    return result.count;
  }

  /**
   * Check if documents matching query exist
   * @param {Object} query - Query object
   * @returns {Promise<boolean>} True if at least one document exists
   */
  async exists(query) {
    const count = await this.count(query);
    return count > 0;
  }

  /**
   * Build WHERE clause from MongoDB-like query
   * @param {Object} query - Query object
   * @param {Array} params - Parameters array (will be modified)
   * @returns {Array<string>} WHERE clause parts
   */
  buildWhereClause(query, params) {
    const clauses = [];

    for (const [key, value] of Object.entries(query)) {
      if (key === '_id') {
        // Special case for ID
        clauses.push('id = ?');
        params.push(value);
      } else if (key === 'created_at' || key === 'updated_at') {
        // Special case for timestamp fields
        if (typeof value === 'object' && value !== null) {
          // Handle operators like {$gte: date}
          for (const [op, opValue] of Object.entries(value)) {
            const sqlOp = this.operatorToSQL(op);
            clauses.push(`${key} ${sqlOp} ?`);
            params.push(opValue);
          }
        } else {
          clauses.push(`${key} = ?`);
          params.push(value);
        }
      } else {
        // JSON field query
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Handle operators like {$gt: 5}
          for (const [op, opValue] of Object.entries(value)) {
            const sqlOp = this.operatorToSQL(op);
            clauses.push(`JSON_EXTRACT(data, '$.${key}') ${sqlOp} ?`);
            params.push(JSON.stringify(opValue));
          }
        } else {
          // Simple equality
          clauses.push(`JSON_EXTRACT(data, '$.${key}') = ?`);
          params.push(JSON.stringify(value));
        }
      }
    }

    return clauses;
  }

  /**
   * Convert MongoDB operator to SQL operator
   * @param {string} op - MongoDB operator ($gt, $gte, $lt, $lte, $ne)
   * @returns {string} SQL operator
   */
  operatorToSQL(op) {
    const operators = {
      $gt: '>',
      $gte: '>=',
      $lt: '<',
      $lte: '<=',
      $ne: '!=',
      $eq: '='
    };

    return operators[op] || '=';
  }

  /**
   * Create an index on a field
   * @param {string} field - Field name
   * @param {Object} options - Index options
   * @param {boolean} options.unique - Unique index
   * @returns {Promise<void>}
   */
  async createIndex(field, options = {}) {
    await this.ensureTable();

    const indexName = `idx_${field}`;
    const unique = options.unique ? 'UNIQUE' : '';

    if (field === '_id' || field === 'created_at' || field === 'updated_at') {
      // Already indexed
      return;
    }

    await this.database.execute(`
      CREATE ${unique} INDEX ${indexName} ON \`${this.name}\` (
        (JSON_EXTRACT(data, '$.${field}'))
      )
    `);
  }

  /**
   * Drop an index
   * @param {string} field - Field name
   * @returns {Promise<void>}
   */
  async dropIndex(field) {
    await this.ensureTable();

    const indexName = `idx_${field}`;
    await this.database.execute(`DROP INDEX ${indexName} ON \`${this.name}\``);
  }
}

// Note: No module.exports needed - loaded via fxmanifest.lua server_scripts
// The Collection class is available globally in FiveM's script environment
