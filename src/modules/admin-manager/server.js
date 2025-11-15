/**
 * NextGen Framework - Admin Manager Module
 * Admin tools and commands
 */

class AdminManager {
  constructor(framework) {
    this.framework = framework;
    this.db = framework.database;
    this.logger = null;

    // Admin permissions
    this.admins = new Map(); // identifier => permission level
    this.permissionLevels = {
      moderator: 1,
      admin: 2,
      superadmin: 3
    };
  }

  async init() {
    this.logger = this.framework.getModule('logger');
    await this.loadAdmins();

    // Register admin commands via chat-commands
    this.registerCommands();

    this.log('Admin manager initialized', 'info');
  }

  async loadAdmins() {
    try {
      const admins = await this.db.query('SELECT identifier, permission_level FROM admins WHERE active = 1');
      for (const admin of admins) {
        this.admins.set(admin.identifier, admin.permission_level);
      }
      this.log(`Loaded ${admins.length} admins`, 'debug');
    } catch (error) {
      this.log(`Failed to load admins: ${error.message}`, 'error');
    }
  }

  async addAdmin(identifier, level, addedBy = 'system') {
    try {
      await this.db.execute(
        'INSERT INTO admins (identifier, permission_level, added_by, added_at) VALUES (?, ?, ?, NOW())',
        [identifier, level, addedBy]
      );
      this.admins.set(identifier, level);
      this.log(`Added admin: ${identifier} (level ${level})`, 'info');
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
    const player = this.framework.getModule('player-manager')?.getPlayer(source);
    if (!player) return false;

    const identifier = player.getIdentifier('license');
    return this.admins.has(identifier);
  }

  getPermissionLevel(source) {
    const player = this.framework.getModule('player-manager')?.getPlayer(source);
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

        const ped = GetPlayerPed(source);
        SetEntityCoords(ped, x, y, z, false, false, false, false);
      }
    });

    // Give money command
    chatCommands.register('givemoney', (source, args) => {
      if (!this.hasPermission(source, this.permissionLevels.admin)) return;

      const targetSource = parseInt(args[0]);
      const amount = parseInt(args[1]);
      const type = args[2] || 'cash';

      const moneyManager = this.framework.getModule('money-manager');
      if (moneyManager) {
        moneyManager.addMoney(targetSource, type, amount, 'admin_give');
      }
    });

    // Noclip command
    chatCommands.register('noclip', (source, args) => {
      if (!this.isAdmin(source)) return;
      emitNet('ng-core:admin-noclip', source);
    });
  }

  log(message, level = 'info', metadata = {}) {
    if (this.logger) {
      this.logger.log(message, level, metadata);
    }
  }

  async destroy() {
    this.admins.clear();
  }
}

module.exports = AdminManager;
