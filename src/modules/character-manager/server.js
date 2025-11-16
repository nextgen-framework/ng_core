/**
 * NextGen Framework - Character Manager Module
 * Manages player characters (creation, deletion, selection)
 */

class CharacterManager {
  constructor(framework) {
    this.framework = framework;
    this.db = framework.database;
    this.logger = null;
    this.playerManager = null;

    // Active characters cache
    this.activeCharacters = new Map(); // source => character data

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
    this.logger = this.framework.getModule('logger');
    this.playerManager = this.framework.getModule('player-manager');

    // RPC handlers
    if (this.framework.rpc) {
      this.framework.rpc.register('character:getCharacters', this.getPlayerCharacters.bind(this));
      this.framework.rpc.register('character:createCharacter', this.createCharacter.bind(this));
      this.framework.rpc.register('character:selectCharacter', this.selectCharacter.bind(this));
      this.framework.rpc.register('character:deleteCharacter', this.deleteCharacter.bind(this));
    }

    // Handle player drop
    on('playerDropped', () => {
      this.activeCharacters.delete(source);
    });

    this.log('Character manager module initialized', 'info');
  }

  // ================================
  // Character Management
  // ================================

  /**
   * Get all characters for a player
   */
  async getPlayerCharacters(source) {
    try {
      const player = this.playerManager ? this.playerManager.get(source) : null;
      if (!player) return [];

      const identifier = player.getIdentifier('license');
      if (!identifier) return [];

      const characters = await this.db.query(
        'SELECT id, firstname, lastname, dob, gender, height, metadata, created_at, last_played FROM characters WHERE identifier = ? ORDER BY last_played DESC',
        [identifier]
      );

      return characters.map(char => ({
        id: char.id,
        firstname: char.firstname,
        lastname: char.lastname,
        fullname: `${char.firstname} ${char.lastname}`,
        dob: char.dob,
        gender: char.gender,
        height: char.height,
        age: this.calculateAge(char.dob),
        metadata: typeof char.metadata === 'string' ? JSON.parse(char.metadata) : char.metadata,
        created_at: char.created_at,
        last_played: char.last_played
      }));
    } catch (error) {
      this.log(`Failed to get player characters: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Create new character
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

      // Create character
      const result = await this.db.execute(
        'INSERT INTO characters (identifier, firstname, lastname, dob, gender, height, metadata, created_at, last_played) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [
          identifier,
          characterData.firstname,
          characterData.lastname,
          characterData.dob,
          characterData.gender || 'm',
          characterData.height || 180,
          JSON.stringify(characterData.metadata || {})
        ]
      );

      const characterId = result.insertId;

      this.log(`Created character: ${characterData.firstname} ${characterData.lastname} (ID: ${characterId})`, 'info', {
        source,
        identifier
      });

      // Trigger hook for other modules (e.g., money-manager to create account)
      await this.framework.triggerHook('character:created', source, characterId, characterData);

      return {
        success: true,
        characterId,
        character: {
          id: characterId,
          firstname: characterData.firstname,
          lastname: characterData.lastname,
          fullname: `${characterData.firstname} ${characterData.lastname}`,
          dob: characterData.dob,
          gender: characterData.gender || 'm',
          height: characterData.height || 180,
          age,
          metadata: characterData.metadata || {}
        }
      };
    } catch (error) {
      this.log(`Failed to create character: ${error.message}`, 'error');
      return { success: false, reason: 'database_error', error: error.message };
    }
  }

  /**
   * Select character
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
      const characters = await this.db.query(
        'SELECT * FROM characters WHERE id = ? AND identifier = ?',
        [characterId, identifier]
      );

      if (characters.length === 0) {
        return { success: false, reason: 'character_not_found' };
      }

      const char = characters[0];

      // Update last played
      await this.db.execute(
        'UPDATE characters SET last_played = NOW() WHERE id = ?',
        [characterId]
      );

      // Build character object
      const character = {
        id: char.id,
        firstname: char.firstname,
        lastname: char.lastname,
        fullname: `${char.firstname} ${char.lastname}`,
        dob: char.dob,
        gender: char.gender,
        height: char.height,
        age: this.calculateAge(char.dob),
        metadata: typeof char.metadata === 'string' ? JSON.parse(char.metadata) : char.metadata
      };

      // Cache active character
      this.activeCharacters.set(source, character);

      this.log(`Player ${source} selected character ${characterId}`, 'info');

      // Trigger hook for other modules to load character data
      await this.framework.triggerHook('character:selected', source, character);

      return { success: true, character };
    } catch (error) {
      this.log(`Failed to select character: ${error.message}`, 'error');
      return { success: false, reason: 'database_error', error: error.message };
    }
  }

  /**
   * Delete character
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
      const characters = await this.db.query(
        'SELECT id FROM characters WHERE id = ? AND identifier = ?',
        [characterId, identifier]
      );

      if (characters.length === 0) {
        return { success: false, reason: 'character_not_found' };
      }

      // Trigger hook before deletion (other modules can clean up their data)
      await this.framework.triggerHook('character:beforeDelete', source, characterId);

      // Delete character
      await this.db.execute('DELETE FROM characters WHERE id = ?', [characterId]);

      this.log(`Deleted character ${characterId}`, 'info', { source, identifier });

      // Trigger hook after deletion
      await this.framework.triggerHook('character:deleted', source, characterId);

      return { success: true };
    } catch (error) {
      this.log(`Failed to delete character: ${error.message}`, 'error');
      return { success: false, reason: 'database_error', error: error.message };
    }
  }

  /**
   * Update character data
   */
  async updateCharacter(characterId, data) {
    try {
      const updates = [];
      const values = [];

      if (data.firstname !== undefined) {
        updates.push('firstname = ?');
        values.push(data.firstname);
      }
      if (data.lastname !== undefined) {
        updates.push('lastname = ?');
        values.push(data.lastname);
      }
      if (data.dob !== undefined) {
        updates.push('dob = ?');
        values.push(data.dob);
      }
      if (data.gender !== undefined) {
        updates.push('gender = ?');
        values.push(data.gender);
      }
      if (data.height !== undefined) {
        updates.push('height = ?');
        values.push(data.height);
      }
      if (data.metadata !== undefined) {
        updates.push('metadata = ?');
        values.push(JSON.stringify(data.metadata));
      }

      if (updates.length === 0) {
        return { success: false, reason: 'no_updates' };
      }

      values.push(characterId);

      await this.db.execute(
        `UPDATE characters SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      this.log(`Updated character ${characterId}`, 'debug');

      return { success: true };
    } catch (error) {
      this.log(`Failed to update character: ${error.message}`, 'error');
      return { success: false, reason: 'database_error', error: error.message };
    }
  }

  /**
   * Get character by ID
   */
  async getCharacterById(characterId) {
    try {
      const characters = await this.db.query(
        'SELECT * FROM characters WHERE id = ?',
        [characterId]
      );

      if (characters.length === 0) return null;

      const char = characters[0];

      return {
        id: char.id,
        identifier: char.identifier,
        firstname: char.firstname,
        lastname: char.lastname,
        fullname: `${char.firstname} ${char.lastname}`,
        dob: char.dob,
        gender: char.gender,
        height: char.height,
        age: this.calculateAge(char.dob),
        metadata: typeof char.metadata === 'string' ? JSON.parse(char.metadata) : char.metadata,
        created_at: char.created_at,
        last_played: char.last_played
      };
    } catch (error) {
      this.log(`Failed to get character: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * Get active character for player
   */
  getActiveCharacter(source) {
    return this.activeCharacters.get(source) || null;
  }

  /**
   * Set character metadata
   */
  async setCharacterMetadata(characterId, key, value) {
    try {
      const char = await this.getCharacterById(characterId);
      if (!char) return { success: false, reason: 'character_not_found' };

      const metadata = char.metadata || {};
      metadata[key] = value;

      await this.updateCharacter(characterId, { metadata });

      return { success: true };
    } catch (error) {
      this.log(`Failed to set character metadata: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  // ================================
  // Validation & Utility
  // ================================

  /**
   * Validate character data
   */
  validateCharacterData(data) {
    const errors = [];

    // Firstname
    if (!data.firstname || typeof data.firstname !== 'string') {
      errors.push('firstname_required');
    } else if (data.firstname.length < this.config.minFirstNameLength || data.firstname.length > this.config.maxFirstNameLength) {
      errors.push('firstname_invalid_length');
    }

    // Lastname
    if (!data.lastname || typeof data.lastname !== 'string') {
      errors.push('lastname_required');
    } else if (data.lastname.length < this.config.minLastNameLength || data.lastname.length > this.config.maxLastNameLength) {
      errors.push('lastname_invalid_length');
    }

    // Date of birth
    if (!data.dob || !this.isValidDate(data.dob)) {
      errors.push('dob_invalid');
    }

    // Gender
    if (data.gender && !['m', 'f'].includes(data.gender)) {
      errors.push('gender_invalid');
    }

    return {
      valid: errors.length === 0,
      errors
    };
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
    this.log('Character manager configuration updated', 'info');
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
      this.log(`Failed to get stats: ${error.message}`, 'error');
      return {};
    }
  }

  /**
   * Log helper
   */
  log(message, level = 'info', metadata = {}) {
    if (this.logger) {
      this.logger.log(message, level, metadata);
    } else {
      this.framework.utils.Log(`[Character Manager] ${message}`, level);
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.activeCharacters.clear();
    this.log('Character manager module destroyed', 'info');
  }
}

module.exports = CharacterManager;
