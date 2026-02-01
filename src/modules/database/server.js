/**
 * NextGen Framework - Database Module
 * Flexible database abstraction supporting multiple backends
 *
 * Supported backends:
 * - HTTP API (using mysql2) - Recommended for modern setups
 * - oxmysql (legacy) - Still supported but deprecated
 * - Memory fallback - For development/testing
 *
 * Provides a MongoDB-like Collection API over MySQL for flexible data models
 */

// Note: Collection class is already loaded via fxmanifest.lua server_scripts
// No need to require it again, it's available globally

class Database {
  constructor(framework) {
    this.framework = framework;
    this.collections = new Map();
    this.connected = false;
    this.connectionString = null;
    this.backend = null;
    this.backendType = 'none';
  }

  /**
   * Detect and initialize the best available database backend
   * Returns promise to allow waiting for oxmysql to load
   */
  async detectBackend() {
    // Priority 1: HTTP API (modern, uses mysql2)
    const apiEndpoint = GetConvar('ngcore_db_api', '');
    if (apiEndpoint) {
      this.backend = {
        endpoint: apiEndpoint,
        token: GetConvar('ngcore_db_token', '')
      };
      this.backendType = 'http-api';
      return;
    }

    // Priority 2: oxmysql (legacy but still works)
    // Check if oxmysql is available via exports
    try {
      // FiveM uses exports['resource-name'] syntax to access another resource's exports
      const oxmysqlExport = global.exports['oxmysql'];

      if (oxmysqlExport && typeof oxmysqlExport === 'object') {
        this.backend = oxmysqlExport;
        this.backendType = 'oxmysql';
        this.framework.log.debug('oxmysql detected via global.exports["oxmysql"]');
        return;
      }
    } catch (error) {
      this.framework.log.warn(`Error checking for oxmysql: ${error.message}`);
    }

    // Fallback: Memory storage
    this.framework.log.warn('oxmysql not detected, using memory storage');
    this.backendType = 'memory';
    this.backend = { storage: new Map() };
  }

  /**
   * Initialize the database module
   */
  async init() {
    // Detect backend at init time (not constructor) so exports are available
    await this.detectBackend();

    this.framework.log.info(`Database backend: ${this.backendType}`);

    switch (this.backendType) {
      case 'http-api':
        await this.initHTTPBackend();
        break;

      case 'oxmysql':
        await this.initOxMySQLBackend();
        break;

      case 'memory':
        this.framework.log.warn('Database using in-memory storage (no persistence)');
        this.connected = false;
        return;

      default:
        this.framework.log.warn('No database backend available');
        this.connected = false;
        return;
    }

    // Run migrations if enabled and connected
    if (this.connected && this.framework.config?.database?.autoMigrate !== false) {
      await this.runMigrations();
    }
  }

  /**
   * Initialize HTTP API backend (uses mysql2 externally)
   */
  async initHTTPBackend() {
    try {
      const response = await this.httpRequest('GET', '/ping');
      if (response.ok) {
        this.connected = true;
        this.framework.log.info(`Database connected via HTTP API (backend: ${response.data.backend})`);
      } else {
        throw new Error('API health check failed');
      }
    } catch (error) {
      this.framework.log.warn(`HTTP API connection failed: ${error.message} - Using fallback mode`);
      this.connected = false;
    }
  }

  /**
   * Initialize oxmysql backend (legacy)
   */
  async initOxMySQLBackend() {
    try {
      await this.backend.query('SELECT 1');
      this.connected = true;
      this.framework.log.info('Database connected via oxmysql (legacy, consider switching to HTTP API)');
    } catch (error) {
      this.framework.log.warn(`oxmysql connection failed: ${error.message} - Using fallback mode`);
      this.connected = false;
    }
  }

  /**
   * Make HTTP request to external API
   */
  async httpRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const url = `${this.backend.endpoint}${path}`;
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.backend.token}`
        }
      };

      if (data) {
        options.body = JSON.stringify(data);
      }

      PerformHttpRequest(url, (statusCode, body) => {
        if (statusCode >= 200 && statusCode < 300) {
          try {
            const parsed = JSON.parse(body || '{}');
            resolve({ ok: true, data: parsed });
          } catch (e) {
            resolve({ ok: true, data: {} });
          }
        } else {
          reject(new Error(`HTTP ${statusCode}: ${body}`));
        }
      }, options.method, options.body || '', options.headers);
    });
  }

  /**
   * Execute a raw SQL query
   * @param {string} sql - SQL query with ? placeholders
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  async query(sql, params = []) {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    try {
      if (this.backendType === 'http-api') {
        const response = await this.httpRequest('POST', '/query', { sql, params });
        return response.data.data || [];
      } else if (this.backendType === 'oxmysql') {
        const result = await this.backend.query(sql, params);
        // Ensure we always return an array
        return Array.isArray(result) ? result : [];
      }
      throw new Error('Unsupported backend');
    } catch (error) {
      this.framework.log.error(`Database query error: ${error.message}\nSQL: ${sql}`);
      throw error;
    }
  }

  /**
   * Execute a SQL statement without returning results
   * @param {string} sql - SQL statement with ? placeholders
   * @param {Array} params - Statement parameters
   * @returns {Promise<Object>} Execution result (affectedRows, insertId)
   */
  async execute(sql, params = []) {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    try {
      if (this.backendType === 'http-api') {
        const response = await this.httpRequest('POST', '/execute', { sql, params });
        return response.data;
      } else if (this.backendType === 'oxmysql') {
        const result = await this.backend.execute(sql, params);
        // oxmysql may return a number (affectedRows) directly or an object
        if (typeof result === 'number') {
          return { affectedRows: result, insertId: result };
        }
        // Ensure we always return an object with the expected properties
        return {
          affectedRows: result?.affectedRows ?? result?.changedRows ?? 0,
          insertId: result?.insertId ?? result?.lastInsertId ?? 0
        };
      }
      throw new Error('Unsupported backend');
    } catch (error) {
      this.framework.log.error(`Database execute error: ${error.message}\nSQL: ${sql}`);
      throw error;
    }
  }

  /**
   * Execute a single SQL query (alias for query with single result)
   * @param {string} sql - SQL query with ? placeholders
   * @param {Array} params - Query parameters
   * @returns {Promise<Object|null>} Single row result or null
   */
  async scalar(sql, params = []) {
    const results = await this.query(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute a database transaction
   * @param {Function} callback - async function(connection) that performs queries
   * @returns {Promise<*>} Result of the callback
   */
  async transaction(callback) {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    try {
      return await this.mysql.transaction(callback);
    } catch (error) {
      this.framework.log.error(`Database transaction error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Prepare a SQL statement
   * @param {string} sql - SQL statement with ? placeholders
   * @returns {Promise<Object>} Prepared statement
   */
  async prepare(sql) {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    try {
      return await this.mysql.prepare(sql);
    } catch (error) {
      this.framework.log.error(`Database prepare error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get or create a Collection abstraction
   * Collections provide a MongoDB-like API over MySQL tables
   *
   * Each collection maps to a MySQL table with:
   * - id (PRIMARY KEY AUTO_INCREMENT)
   * - data (JSON column for document storage)
   * - created_at (TIMESTAMP)
   * - updated_at (TIMESTAMP)
   *
   * @param {string} name - Collection name (will create table if not exists)
   * @returns {Collection} Collection instance
   */
  collection(name) {
    if (this.collections.has(name)) {
      return this.collections.get(name);
    }

    const collection = new Collection(name, this, this.framework);
    this.collections.set(name, collection);
    return collection;
  }

  /**
   * Drop a collection (DELETE TABLE)
   * @param {string} name - Collection name
   * @returns {Promise<void>}
   */
  async dropCollection(name) {
    await this.execute(`DROP TABLE IF EXISTS \`${name}\``);
    this.collections.delete(name);
    this.framework.log.info(`Collection '${name}' dropped`);
  }

  /**
   * List all collections (tables)
   * @returns {Promise<Array<string>>} Collection names
   */
  async listCollections() {
    const results = await this.query('SHOW TABLES');
    return results.map(row => Object.values(row)[0]);
  }

  /**
   * Run database migrations
   * @returns {Promise<void>}
   */
  async runMigrations() {
    // Create migrations table if not exists
    await this.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get executed migrations
    const executed = await this.query('SELECT version FROM migrations');
    const executedVersions = new Set((executed || []).map(m => m.version));

    // Load migration files
    const fs = require('fs');
    const path = require('path');
    const resourcePath = GetResourcePath(GetCurrentResourceName());
    const migrationsDir = path.join(resourcePath, 'src', 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      this.framework.log.debug('No migrations directory found');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
      .sort();

    let migrationsRun = 0;

    for (const file of files) {
      const version = file.replace(/\.(sql|js)$/, '');

      if (executedVersions.has(version)) {
        continue; // Already executed
      }

      const filePath = path.join(migrationsDir, file);

      try {
        if (file.endsWith('.sql')) {
          // Execute SQL migration
          const sql = fs.readFileSync(filePath, 'utf8');

          // Remove SQL comments (-- style comments)
          const sqlWithoutComments = sql
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n');

          // Split SQL into individual statements (separated by semicolons)
          const statements = sqlWithoutComments
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);

          // Execute each statement individually
          for (const statement of statements) {
            if (statement) {
              await this.execute(statement);
            }
          }
        } else if (file.endsWith('.js')) {
          // Execute JS migration
          const migration = require(filePath);
          await migration.up(this);
        }

        // Record migration (use INSERT IGNORE to avoid duplicate key errors)
        await this.execute(
          'INSERT IGNORE INTO migrations (version, name) VALUES (?, ?)',
          [version, file]
        );

        this.framework.log.info(`Migration '${file}' executed`);
        migrationsRun++;
      } catch (error) {
        this.framework.log.error(`Migration '${file}' failed: ${error.message}`);
        // Don't throw error to allow server to continue starting even if migrations fail
        this.framework.log.warn('Continuing server startup despite migration error...');
      }
    }

    if (migrationsRun > 0) {
      this.framework.log.success(`Executed ${migrationsRun} database migrations`);
    }
  }

  /**
   * Check if database is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get connection info (for debugging)
   * @returns {Object}
   */
  getConnectionInfo() {
    return {
      connected: this.connected,
      collections: Array.from(this.collections.keys())
    };
  }
}

module.exports = Database;

// Self-register
global.Framework.register('database', new Database(global.Framework), 0);
