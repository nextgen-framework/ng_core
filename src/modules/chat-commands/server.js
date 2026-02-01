/**
 * NextGen Framework - Chat Commands Module (Server-Side)
 * Production-ready command system with permissions and auto-completion
 */

class ChatCommandsModule {
  constructor(framework) {
    this.framework = framework;
    this.commands = new Map();
  }

  /**
   * Initialize the chat commands module
   */
  async init() {
    this.framework.log.info('Chat Commands Module initialized');

    // Register default commands
    this.registerDefaultCommands();

    this.framework.log.info('Chat Commands Module ready');
  }

  /**
   * Register a command
   * @param {string} name - Command name (without /)
   * @param {Function} handler - Handler function (source, args) => void
   * @param {Object} options - Options { description, usage, permission, restricted, aliases, params, plugin }
   */
  register(name, handler, options = {}) {
    // Auto-detect plugin/module if not provided
    let pluginName = options.plugin;
    if (!pluginName) {
      // Get the resource name that's calling this function
      const callerResource = GetInvokingResource();

      if (callerResource && callerResource !== GetCurrentResourceName()) {
        // External plugin/resource
        pluginName = callerResource;
      } else {
        // Internal module - try to detect from stack
        const stack = new Error().stack;
        const moduleMatch = stack.match(/ng_core[\\/]src[\\/]modules[\\/]([^[\\/]+)[\\/]/);
        if (moduleMatch) {
          pluginName = `ng_core:${moduleMatch[1]}`;
        } else {
          pluginName = 'ng_core';
        }
      }
    }

    // Ensure pluginName is never empty
    if (!pluginName || pluginName.trim() === '') {
      pluginName = 'unknown';
    }

    const command = {
      name: name.toLowerCase(),
      handler: handler,
      description: options.description || 'No description',
      permission: options.permission || null,
      restricted: options.restricted !== undefined ? options.restricted : (options.permission ? true : false),
      aliases: options.aliases || [],
      params: options.params || [],
      plugin: pluginName
    };

    this.commands.set(command.name, command);

    // Register with FiveM's native command system
    RegisterCommand(command.name, (source, args, rawCommand) => {
      // Check permission
      if (command.permission && !this.hasPermission(source, command.permission)) {
        this.sendMessage(source, `^1Error: ^7You don't have permission to use this command`);
        return;
      }

      // Execute command
      try {
        command.handler(source, args, rawCommand);
      } catch (error) {
        this.sendMessage(source, `^1Error: ^7${error.message}`);
        this.framework.log.error(`Command error (/${command.name}): ${error.message}`);
      }
    }, command.restricted);

    // Register aliases
    command.aliases.forEach(alias => {
      RegisterCommand(alias, (source, args, rawCommand) => {
        // Check permission
        if (command.permission && !this.hasPermission(source, command.permission)) {
          this.sendMessage(source, `^1Error: ^7You don't have permission to use this command`);
          return;
        }

        // Execute command
        try {
          command.handler(source, args, rawCommand);
        } catch (error) {
          this.sendMessage(source, `^1Error: ^7${error.message}`);
          this.framework.log.error(`Command error (/${alias}): ${error.message}`);
        }
      }, command.restricted);
    });

    // Add suggestion for autocompletion
    const params = command.params.map(param => {
      return {
        name: param.name || '',
        help: param.help || ''
      };
    });

    // Only send suggestions if we have a valid description (prevent null argument errors)
    if (command.description) {
      TriggerClientEvent('chat:addSuggestion', -1, `/${command.name}`, command.description, params);

      // Add suggestions for aliases
      command.aliases.forEach(alias => {
        TriggerClientEvent('chat:addSuggestion', -1, `/${alias}`, `${command.description} (alias)`, params);
      });
    }

    // Log with plugin info
    const pluginInfo = command.plugin !== 'unknown' ? ` [${command.plugin}]` : '';
    this.framework.log.info(`Command registered: /${command.name}${pluginInfo}`);
  }

  /**
   * Check if player has permission
   */
  hasPermission(source, permission) {
    // Use FiveM's ACE permission system
    return IsPlayerAceAllowed(source, permission);
  }

  /**
   * Send message to player
   */
  sendMessage(source, message) {
    // Validate source before sending
    if (!source || source < 0) {
      this.framework.log.warn(`Invalid source in sendMessage: ${source}`);
      return;
    }

    TriggerClientEvent('chat:addMessage', source, {
      color: [255, 255, 255],
      multiline: true,
      args: ['System', message]
    });
  }

  /**
   * Broadcast message to all players
   */
  broadcast(message) {
    TriggerClientEvent('chat:addMessage', -1, {
      color: [255, 255, 255],
      multiline: true,
      args: ['System', message]
    });
  }

  /**
   * Register default commands
   */
  registerDefaultCommands() {
    // Help command - only default command in chat-commands module
    this.register('help', (source, args) => {
      if (args.length > 0) {
        // Show help for specific command
        const cmdName = args[0].toLowerCase();
        const command = this.commands.get(cmdName);

        if (command) {
          this.sendMessage(source, `^5Command: ^7/${command.name}`);
          this.sendMessage(source, `^5Description: ^7${command.description}`);
          if (command.aliases.length > 0) {
            this.sendMessage(source, `^5Aliases: ^7/${command.aliases.join(', /')}`);
          }
          if (command.params.length > 0) {
            const paramsList = command.params.map(p => `${p.name}${p.help ? ' - ' + p.help : ''}`).join(', ');
            this.sendMessage(source, `^5Parameters: ^7${paramsList}`);
          }
        } else {
          this.sendMessage(source, `^1Error: ^7Unknown command "/${cmdName}"`);
        }
      } else {
        // List all commands
        const commandList = Array.from(this.commands.values())
          .map(cmd => `^5/${cmd.name}^7 - ${cmd.description}`)
          .join('\n');

        this.sendMessage(source, `^3Available commands:\n${commandList}`);
        this.sendMessage(source, `^7Use ^5/help <command>^7 for more info`);
      }
    }, {
      description: 'Show help for commands',
      aliases: ['h', '?'],
      restricted: false,
      params: [
        { name: 'command', help: 'Command name (optional)' }
      ],
      plugin: 'chat-commands'
    });
  }

  /**
   * Get all registered commands
   */
  getCommands() {
    return this.commands;
  }

  /**
   * Unregister a command
   */
  unregister(name) {
    const command = this.commands.get(name.toLowerCase());
    if (command) {
      this.commands.delete(name.toLowerCase());
      this.framework.log.info(`Command unregistered: /${name}`);

      // Note: FiveM doesn't provide UnregisterCommand, so the command will still exist
      // but won't be in our tracking map
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.framework.log.info('Chat Commands Module destroyed');
    this.commands.clear();
  }
}

module.exports = ChatCommandsModule;

// Self-register
global.Framework.register('chat-commands', new ChatCommandsModule(global.Framework), 15);
