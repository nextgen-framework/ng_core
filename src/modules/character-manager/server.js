/**
 * NextGen Framework - Character Manager Module
 * Manages player characters (creation, deletion, selection)
 *
 * Table schema: characters(id, identifier, data JSON, metadata JSON, created_at, last_played)
 *   data     = personalized info (firstname, lastname, dob, gender, height, appearance)
 *   metadata = in-game state (position, health, armor)
 */

class CharacterManager {
  constructor(framework) {
    this.framework = framework;
    this.db = null;
    this.playerManager = null;

    // Active characters cache
    this.activeCharacters = new Map(); // source => character object

    // Configuration
    this.config = {
      maxCharactersPerPlayer: 5,
      enableMultiCharacter: true,
      minFirstNameLength: 2,
      maxFirstNameLength: 20,
      minLastNameLength: 2,
      maxLastNameLength: 20,
      minAge: 18,
      maxAge: 100
    };
  }

  /**
   * Initialize character manager module
   */
  async init() {
    this.db = this.framework.getModule('database');
    this.playerManager = this.framework.getModule('player-manager');

    // RPC handlers
    const rpc = this.framework.getModule('rpc');
    if (rpc) {
      rpc.register('character:getCharacters', this.getPlayerCharacters.bind(this));
      rpc.register('character:createCharacter', this.createCharacter.bind(this));
      rpc.register('character:selectCharacter', this.selectCharacter.bind(this));
      rpc.register('character:deleteCharacter', this.deleteCharacter.bind(this));
    }

    // Handle player drop — emit FiveM event before clearing cache so other resources can save state
    this.framework.fivem.on('playerDropped', () => {
      const character = this.activeCharacters.get(source);
      if (character) {
        this.framework.fivem.emit('ng_core|character/drop:before', source, character);
      }
      this.activeCharacters.delete(source);
    });

    this.framework.log.info('Character manager module initialized');
  }

  // ================================
  // Internal helpers
  // ================================

  /**
   * Parse JSON field from DB (handles string or object)
   * @param {*} value - DB JSON field
   * @returns {Object}
   */
  _parseJson(value) {
    if (!value) return {};
    return typeof value === 'string' ? JSON.parse(value) : value;
  }

  /**
   * Build character object from DB row
   * @param {Object} row - DB row
   * @returns {Object} Character object
   */
  _buildCharacter(row) {
    const data = this._parseJson(row.data);
    const metadata = this._parseJson(row.metadata);

    return {
      id: row.id,
      identifier: row.identifier,
      data,
      metadata,
      fullname: `${data.firstname || ''} ${data.lastname || ''}`.trim(),
      created_at: row.created_at,
      last_played: row.last_played
    };
  }

  // ================================
  // Character Management
  // ================================

  /**
   * Get all characters for a player
   * @param {number} source - Player source
   * @returns {Promise<Array>}
   */
  async getPlayerCharacters(source) {
    try {
      const player = this.playerManager ? this.playerManager.get(source) : null;
      if (!player) return [];

      const identifier = player.getIdentifier('license');
      if (!identifier) return [];

      const rows = await this.db.query(
        'SELECT id, identifier, data, metadata, created_at, last_played FROM characters WHERE identifier = ? ORDER BY last_played DESC',
        [identifier]
      );

      return rows.map(row => this._buildCharacter(row));
    } catch (error) {
      this.framework.log.error(`Failed to get player characters: ${error.message}`);
      return [];
    }
  }

  /**
   * Create new character
   * @param {number} source - Player source
   * @param {Object} characterData - { firstname, lastname, dob, gender, height }
   * @returns {Promise<Object>}
   */
  async createCharacter(source, characterData) {
    try {
      const player = this.playerManager ? this.playerManager.get(source) : null;
      if (!player) {
        return { success: false, reason: 'player_not_found' };
      }

      const identifier = player.getIdentifier('license');
      if (!identifier) {
        return { success: false, reason: 'no_identifier' };
      }

      // Check max characters limit
      const existingChars = await this.getPlayerCharacters(source);
      if (existingChars.length >= this.config.maxCharactersPerPlayer) {
        return { success: false, reason: 'max_characters_reached' };
      }

      // Validate character data
      const validation = this.validateCharacterData(characterData);
      if (!validation.valid) {
        return { success: false, reason: 'invalid_data', errors: validation.errors };
      }

      // Calculate age
      const age = this.calculateAge(characterData.dob);
      if (age < this.config.minAge || age > this.config.maxAge) {
        return { success: false, reason: 'invalid_age' };
      }

      // Build data (personalized info)
      const data = {
        firstname: characterData.firstname,
        lastname: characterData.lastname,
        dob: characterData.dob,
        gender: characterData.gender || 'm',
        height: characterData.height || 180
      };

      // Build metadata (in-game state defaults)
      const metadata = { health: 200, armor: 0 };

      // Create character
      const result = await this.db.execute(
        'INSERT INTO characters (identifier, data, metadata, created_at, last_played) VALUES (?, ?, ?, NOW(), NOW())',
        [identifier, JSON.stringify(data), JSON.stringify(metadata)]
      );

      const characterId = result.insertId;

      this.framework.log.info(`Created character: ${data.firstname} ${data.lastname} (ID: ${characterId})`);

      // Trigger hook for other modules
      await this.framework.events.pipe('character:created', { source, characterId, characterData });

      // Emit FiveM event for cross-resource listeners
      this.framework.fivem.emit('ng_core|character/created', source, characterId, data);

      const character = {
        id: characterId,
        identifier,
        data,
        metadata,
        fullname: `${data.firstname} ${data.lastname}`
      };

      return { success: true, characterId, character };
    } catch (error) {
      this.framework.log.error(`Failed to create character: ${error.message}`);
      return { success: false, reason: 'database_error', error: error.message };
    }
  }

  /**
   * Select character
   * @param {number} source - Player source
   * @param {number} characterId - Character ID
   * @returns {Promise<Object>}
   */
  async selectCharacter(source, characterId) {
    try {
      const player = this.playerManager ? this.playerManager.get(source) : null;
      if (!player) {
        return { success: false, reason: 'player_not_found' };
      }

      const identifier = player.getIdentifier('license');
      if (!identifier) {
        return { success: false, reason: 'no_identifier' };
      }

      // Get character
      const rows = await this.db.query(
        'SELECT * FROM characters WHERE id = ? AND identifier = ?',
        [characterId, identifier]
      );

      if (rows.length === 0) {
        return { success: false, reason: 'character_not_found' };
      }

      // Update last played
      await this.db.execute(
        'UPDATE characters SET last_played = NOW() WHERE id = ?',
        [characterId]
      );

      const character = this._buildCharacter(rows[0]);

      // Cache active character
      this.activeCharacters.set(source, character);

      this.framework.log.info(`Player ${source} selected character ${characterId}`);

      // Trigger hook for other modules to load character data
      await this.framework.events.pipe('character:selected', { source, character });

      // Emit FiveM event for cross-resource listeners (ng_rp_core, etc.)
      this.framework.fivem.emit('ng_core|character/selected', source, character);

      return { success: true, character };
    } catch (error) {
      this.framework.log.error(`Failed to select character: ${error.message}`);
      return { success: false, reason: 'database_error', error: error.message };
    }
  }

  /**
   * Delete character
   * @param {number} source - Player source
   * @param {number} characterId - Character ID
   * @returns {Promise<Object>}
   */
  async deleteCharacter(source, characterId) {
    try {
      const player = this.playerManager ? this.playerManager.get(source) : null;
      if (!player) {
        return { success: false, reason: 'player_not_found' };
      }

      const identifier = player.getIdentifier('license');
      if (!identifier) {
        return { success: false, reason: 'no_identifier' };
      }

      // Verify ownership
      const rows = await this.db.query(
        'SELECT id FROM characters WHERE id = ? AND identifier = ?',
        [characterId, identifier]
      );

      if (rows.length === 0) {
        return { success: false, reason: 'character_not_found' };
      }

      // Trigger hook before deletion (other modules can clean up their data)
      await this.framework.events.pipe('character:beforeDelete', { source, characterId });

      // Emit FiveM event for cross-resource listeners
      this.framework.fivem.emit('ng_core|character/deleted:before', source, characterId);

      // Delete character
      await this.db.execute('DELETE FROM characters WHERE id = ?', [characterId]);

      this.framework.log.info(`Deleted character ${characterId}`);

      // Trigger hook after deletion
      await this.framework.events.pipe('character:deleted', { source, characterId });

      return { success: true };
    } catch (error) {
      this.framework.log.error(`Failed to delete character: ${error.message}`);
      return { success: false, reason: 'database_error', error: error.message };
    }
  }

  /**
   * Get character by ID
   * @param {number} characterId - Character ID
   * @returns {Promise<Object|null>}
   */
  async getCharacterById(characterId) {
    try {
      const rows = await this.db.query(
        'SELECT * FROM characters WHERE id = ?',
        [characterId]
      );

      if (rows.length === 0) return null;
      return this._buildCharacter(rows[0]);
    } catch (error) {
      this.framework.log.error(`Failed to get character: ${error.message}`);
      return null;
    }
  }

  /**
   * Get active character for player
   * @param {number} source - Player source
   * @returns {Object|null}
   */
  getActiveCharacter(source) {
    return this.activeCharacters.get(source) || null;
  }

  // ================================
  // Data & Metadata Updates
  // ================================

  /**
   * Merge keys into character data (personalized info)
   * @param {number} characterId - Character ID
   * @param {Object} partial - Key-value pairs to merge
   * @returns {Promise<Object>}
   */
  async mergeCharacterData(characterId, partial) {
    try {
      const char = await this.getCharacterById(characterId);
      if (!char) return { success: false, reason: 'character_not_found' };

      const data = { ...char.data, ...partial };

      await this.db.execute(
        'UPDATE characters SET data = ? WHERE id = ?',
        [JSON.stringify(data), characterId]
      );

      // Update cache
      for (const [src, cached] of this.activeCharacters) {
        if (cached.id === characterId) {
          cached.data = data;
          cached.fullname = `${data.firstname || ''} ${data.lastname || ''}`.trim();
          break;
        }
      }

      return { success: true };
    } catch (error) {
      this.framework.log.error(`Failed to merge character data: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Merge keys into character metadata (in-game state)
   * @param {number} characterId - Character ID
   * @param {Object} partial - Key-value pairs to merge
   * @returns {Promise<Object>}
   */
  async mergeCharacterMetadata(characterId, partial) {
    try {
      const char = await this.getCharacterById(characterId);
      if (!char) return { success: false, reason: 'character_not_found' };

      const metadata = { ...char.metadata, ...partial };

      await this.db.execute(
        'UPDATE characters SET metadata = ? WHERE id = ?',
        [JSON.stringify(metadata), characterId]
      );

      // Update cache
      for (const [src, cached] of this.activeCharacters) {
        if (cached.id === characterId) {
          cached.metadata = metadata;
          break;
        }
      }

      return { success: true };
    } catch (error) {
      this.framework.log.error(`Failed to merge character metadata: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ================================
  // Validation & Utility
  // ================================

  /**
   * Validate character data
   * @param {Object} data - Character creation data
   * @returns {Object} { valid, errors }
   */
  validateCharacterData(data) {
    const errors = [];

    if (!data.firstname || typeof data.firstname !== 'string') {
      errors.push('firstname_required');
    } else if (data.firstname.length < this.config.minFirstNameLength || data.firstname.length > this.config.maxFirstNameLength) {
      errors.push('firstname_invalid_length');
    }

    if (!data.lastname || typeof data.lastname !== 'string') {
      errors.push('lastname_required');
    } else if (data.lastname.length < this.config.minLastNameLength || data.lastname.length > this.config.maxLastNameLength) {
      errors.push('lastname_invalid_length');
    }

    if (!data.dob || !this.isValidDate(data.dob)) {
      errors.push('dob_invalid');
    }

    if (data.gender && !['m', 'f'].includes(data.gender)) {
      errors.push('gender_invalid');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check if date string is valid
   */
  isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }

  /**
   * Calculate age from date of birth
   */
  calculateAge(dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * Configure character manager
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    this.framework.log.info('Character manager configuration updated');
  }

  /**
   * Get statistics
   */
  async getStats() {
    try {
      const stats = await this.db.query(
        'SELECT COUNT(*) as total_characters, COUNT(DISTINCT identifier) as unique_players FROM characters'
      );
      return stats[0] || {};
    } catch (error) {
      this.framework.log.error(`Failed to get stats: ${error.message}`);
      return {};
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.activeCharacters.clear();
    this.framework.log.info('Character manager module destroyed');
  }
}

module.exports = CharacterManager;

// Self-register
global.Framework.register('character-manager', new CharacterManager(global.Framework), 14);
