/**
 * NextGen Framework - Admin Manager Module
 * Admin tools and commands
 */

class AdminManager {
  constructor(framework) {
    this.framework = framework;
    this.db = null;

    // Admin permissions
    this.admins = new Map(); // identifier => permission level
    this.permissionLevels = {
      moderator: 1,
      admin: 2,
      superadmin: 3
    };
  }

  async init() {
    this.db = this.framework.getModule('database');

    if (this.db && this.db.isConnected()) {
      await this.loadAdmins();
    } else {
      this.framework.log.warn('Database not available, starting without admin persistence');
    }

    // Register admin commands via chat-commands
    this.registerCommands();

    this.framework.log.info('Admin manager initialized');
  }

  async loadAdmins() {
    try {
      this.admins.clear();
      const admins = await this.db.query('SELECT identifier, permission_level FROM admins WHERE active = 1');
      for (const admin of admins) {
        this.admins.set(admin.identifier, admin.permission_level);
      }
      this.framework.log.debug(`Loaded ${admins.length} admins`);
    } catch (error) {
      this.framework.log.error(`Failed to load admins: ${error.message}`);
    }
  }

  async addAdmin(identifier, level, addedBy = 'system') {
    try {
      await this.db.execute(
        'INSERT INTO admins (identifier, permission_level, added_by, added_at) VALUES (?, ?, ?, NOW())',
        [identifier, level, addedBy]
      );
      this.admins.set(identifier, level);
      this.framework.log.info(`Added admin: ${identifier} (level ${level})`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async removeAdmin(identifier) {
    try {
      await this.db.execute('UPDATE admins SET active = 0 WHERE identifier = ?', [identifier]);
      this.admins.delete(identifier);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  isAdmin(source) {
    const player = this.framework.getModule('player-manager')?.get(source);
    if (!player) return false;

    const identifier = player.getIdentifier('license');
    return this.admins.has(identifier);
  }

  getPermissionLevel(source) {
    const player = this.framework.getModule('player-manager')?.get(source);
    if (!player) return 0;

    const identifier = player.getIdentifier('license');
    return this.admins.get(identifier) || 0;
  }

  hasPermission(source, requiredLevel) {
    return this.getPermissionLevel(source) >= requiredLevel;
  }

  registerCommands() {
    const chatCommands = this.framework.getModule('chat-commands');
    if (!chatCommands) return;

    // Teleport command
    chatCommands.register('tp', (source, args) => {
      if (!this.isAdmin(source)) return;

      if (args.length >= 2) {
        const x = parseFloat(args[0]);
        const y = parseFloat(args[1]);
        const z = args.length >= 3 ? parseFloat(args[2]) : 0;

        if (isNaN(x) || isNaN(y) || isNaN(z)) return;

        const ped = GetPlayerPed(source);
        SetEntityCoords(ped, x, y, z, false, false, false, false);
      }
    });

    // Noclip command
    chatCommands.register('noclip', (source, args) => {
      if (!this.isAdmin(source)) return;
      this.framework.fivem.emitNet('ng_core:admin-noclip', source);
    });
  }

  async destroy() {
    this.admins.clear();
  }
}

module.exports = AdminManager;

// Self-register
global.Framework.register('admin-manager', new AdminManager(global.Framework), 11);
