/**
 * NextGen Framework - Container Manager Module
 * Universal inventory system for players, vehicles, storage, etc.
 */

class ContainerManager {
  constructor(framework) {
    this.framework = framework;
    this.db = null;
    this.logger = null;
    this.itemRegistry = null;

    // Container cache
    this.containers = new Map(); // containerId => Container object
    this.playerContainers = new Map(); // source => containerId (main inventory)

    // Configuration
    this.config = {
      defaultPlayerSlots: 30,
      defaultPlayerWeight: 50000, // 50kg in grams
      defaultVehicleSlots: 50,
      defaultVehicleWeight: 200000, // 200kg
      defaultStorageSlots: 100,
      defaultStorageWeight: 500000, // 500kg
      enableWeight: true,
      enableStacks: true,
      maxStackSize: 100,
      autoSave: true,
      autoSaveInterval: 300000 // 5 minutes
    };

    // Auto-save timer
    this.autoSaveTimer = null;
  }

  /**
   * Initialize container manager module
   */
  async init() {
    this.logger = this.framework.getModule('logger');
    this.db = this.framework.getModule('database');
    this.itemRegistry = this.framework.getModule('item-registry');

    // Start auto-save
    if (this.config.autoSave) {
      this.startAutoSave();
    }

    this.log('Container manager module initialized', 'info');
  }

  /**
   * Create a new container
   */
  async createContainer(type, owner, slots = null, maxWeight = null, metadata = {}) {
    // Determine default slots and weight based on type
    if (slots === null) {
      slots = this.getDefaultSlots(type);
    }
    if (maxWeight === null) {
      maxWeight = this.getDefaultWeight(type);
    }

    try {
      const result = await this.db.execute(
        'INSERT INTO containers (type, owner, slots, max_weight, metadata, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [type, owner, slots, maxWeight, JSON.stringify(metadata)]
      );

      const containerId = result.insertId;

      // Create container object
      const container = {
        id: containerId,
        type,
        owner,
        slots,
        maxWeight,
        currentWeight: 0,
        items: [], // Array of items
        metadata,
        loaded: true
      };

      this.containers.set(containerId, container);

      this.log(`Created container: ${containerId} (type: ${type}, owner: ${owner})`, 'debug');

      return { success: true, containerId };
    } catch (error) {
      this.log(`Failed to create container: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Load container from database
   */
  async loadContainer(containerId) {
    // Check if already loaded
    if (this.containers.has(containerId)) {
      return { success: true, container: this.containers.get(containerId) };
    }

    try {
      // Load container info
      const containerData = await this.db.query(
        'SELECT * FROM containers WHERE id = ?',
        [containerId]
      );

      if (containerData.length === 0) {
        return { success: false, reason: 'container_not_found' };
      }

      const data = containerData[0];

      // Load container items
      const items = await this.db.query(
        'SELECT * FROM container_items WHERE container_id = ? ORDER BY slot',
        [containerId]
      );

      const container = {
        id: data.id,
        type: data.type,
        owner: data.owner,
        slots: data.slots,
        maxWeight: data.max_weight,
        currentWeight: 0,
        items: [],
        metadata: typeof data.metadata === 'string' ? JSON.parse(data.metadata) : data.metadata,
        loaded: true
      };

      // Parse items
      for (const item of items) {
        const itemData = {
          slot: item.slot,
          itemId: item.item_id,
          quantity: item.quantity,
          metadata: typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata
        };

        // Get item definition for weight
        const itemDef = this.itemRegistry ? this.itemRegistry.getItem(item.item_id) : null;
        if (itemDef && this.config.enableWeight) {
          container.currentWeight += (itemDef.weight || 0) * item.quantity;
        }

        container.items.push(itemData);
      }

      this.containers.set(containerId, container);

      this.log(`Loaded container: ${containerId}`, 'debug');

      return { success: true, container };
    } catch (error) {
      this.log(`Failed to load container: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Save container to database
   */
  async saveContainer(containerId) {
    const container = this.containers.get(containerId);

    if (!container) {
      return { success: false, reason: 'container_not_found' };
    }

    try {
      // Update container info
      await this.db.execute(
        'UPDATE containers SET slots = ?, max_weight = ?, metadata = ? WHERE id = ?',
        [container.slots, container.maxWeight, JSON.stringify(container.metadata), containerId]
      );

      // Delete existing items
      await this.db.execute('DELETE FROM container_items WHERE container_id = ?', [containerId]);

      // Insert current items
      if (container.items.length > 0) {
        const values = [];
        const placeholders = [];

        for (const item of container.items) {
          placeholders.push('(?, ?, ?, ?, ?)');
          values.push(
            containerId,
            item.slot,
            item.itemId,
            item.quantity,
            JSON.stringify(item.metadata || {})
          );
        }

        await this.db.execute(
          `INSERT INTO container_items (container_id, slot, item_id, quantity, metadata) VALUES ${placeholders.join(', ')}`,
          values
        );
      }

      this.log(`Saved container: ${containerId}`, 'debug');

      return { success: true };
    } catch (error) {
      this.log(`Failed to save container: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete container
   */
  async deleteContainer(containerId) {
    try {
      await this.db.execute('DELETE FROM container_items WHERE container_id = ?', [containerId]);
      await this.db.execute('DELETE FROM containers WHERE id = ?', [containerId]);

      this.containers.delete(containerId);

      this.log(`Deleted container: ${containerId}`, 'info');

      return { success: true };
    } catch (error) {
      this.log(`Failed to delete container: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Add item to container
   */
  async addItem(containerId, itemId, quantity, slot = null, metadata = {}) {
    const container = this.containers.get(containerId);

    if (!container) {
      const loadResult = await this.loadContainer(containerId);
      if (!loadResult.success) {
        return loadResult;
      }
      return this.addItem(containerId, itemId, quantity, slot, metadata);
    }

    // Get item definition
    const itemDef = this.itemRegistry ? this.itemRegistry.getItem(itemId) : null;
    if (!itemDef && this.itemRegistry) {
      return { success: false, reason: 'invalid_item' };
    }

    // Check weight
    if (this.config.enableWeight && itemDef) {
      const itemWeight = (itemDef.weight || 0) * quantity;
      if (container.currentWeight + itemWeight > container.maxWeight) {
        return { success: false, reason: 'container_overweight' };
      }
    }

    // Check if item can stack
    const canStack = this.config.enableStacks && (!itemDef || itemDef.stackable !== false);

    if (canStack) {
      // Try to stack with existing items
      for (const item of container.items) {
        if (item.itemId === itemId && JSON.stringify(item.metadata) === JSON.stringify(metadata)) {
          const maxStack = itemDef ? (itemDef.maxStack || this.config.maxStackSize) : this.config.maxStackSize;
          const canAdd = Math.min(quantity, maxStack - item.quantity);

          if (canAdd > 0) {
            item.quantity += canAdd;
            quantity -= canAdd;

            if (itemDef && this.config.enableWeight) {
              container.currentWeight += (itemDef.weight || 0) * canAdd;
            }

            if (quantity === 0) {
              await this.saveContainer(containerId);
              return { success: true, slot: item.slot };
            }
          }
        }
      }
    }

    // Find empty slot or use provided slot
    if (slot === null) {
      slot = this.findEmptySlot(container);
    }

    if (slot === null) {
      return { success: false, reason: 'container_full' };
    }

    // Check if slot is occupied
    const existingItem = container.items.find(i => i.slot === slot);
    if (existingItem) {
      return { success: false, reason: 'slot_occupied' };
    }

    // Add item to slot
    const newItem = {
      slot,
      itemId,
      quantity,
      metadata
    };

    container.items.push(newItem);

    if (itemDef && this.config.enableWeight) {
      container.currentWeight += (itemDef.weight || 0) * quantity;
    }

    await this.saveContainer(containerId);

    this.log(`Added item to container ${containerId}: ${itemId} x${quantity}`, 'debug');

    return { success: true, slot };
  }

  /**
   * Remove item from container
   */
  async removeItem(containerId, slot, quantity = null) {
    const container = this.containers.get(containerId);

    if (!container) {
      const loadResult = await this.loadContainer(containerId);
      if (!loadResult.success) {
        return loadResult;
      }
      return this.removeItem(containerId, slot, quantity);
    }

    const itemIndex = container.items.findIndex(i => i.slot === slot);

    if (itemIndex === -1) {
      return { success: false, reason: 'item_not_found' };
    }

    const item = container.items[itemIndex];

    // If quantity not specified, remove all
    if (quantity === null) {
      quantity = item.quantity;
    }

    if (quantity > item.quantity) {
      return { success: false, reason: 'insufficient_quantity' };
    }

    // Get item definition for weight
    const itemDef = this.itemRegistry ? this.itemRegistry.getItem(item.itemId) : null;

    // Update weight
    if (itemDef && this.config.enableWeight) {
      container.currentWeight -= (itemDef.weight || 0) * quantity;
    }

    // Remove or update quantity
    if (quantity === item.quantity) {
      container.items.splice(itemIndex, 1);
    } else {
      item.quantity -= quantity;
    }

    await this.saveContainer(containerId);

    this.log(`Removed item from container ${containerId}: ${item.itemId} x${quantity}`, 'debug');

    return { success: true, itemId: item.itemId, quantity, metadata: item.metadata };
  }

  /**
   * Move item between slots (same container)
   */
  async moveItem(containerId, fromSlot, toSlot) {
    const container = this.containers.get(containerId);

    if (!container) {
      return { success: false, reason: 'container_not_found' };
    }

    const fromItem = container.items.find(i => i.slot === fromSlot);
    const toItem = container.items.find(i => i.slot === toSlot);

    if (!fromItem) {
      return { success: false, reason: 'item_not_found' };
    }

    // If target slot is empty, just move
    if (!toItem) {
      fromItem.slot = toSlot;
      await this.saveContainer(containerId);
      return { success: true };
    }

    // If target slot has same item, try to stack
    if (fromItem.itemId === toItem.itemId && JSON.stringify(fromItem.metadata) === JSON.stringify(toItem.metadata)) {
      const itemDef = this.itemRegistry ? this.itemRegistry.getItem(fromItem.itemId) : null;
      const maxStack = itemDef ? (itemDef.maxStack || this.config.maxStackSize) : this.config.maxStackSize;
      const canStack = Math.min(fromItem.quantity, maxStack - toItem.quantity);

      if (canStack > 0) {
        toItem.quantity += canStack;
        fromItem.quantity -= canStack;

        if (fromItem.quantity === 0) {
          const index = container.items.indexOf(fromItem);
          container.items.splice(index, 1);
        }

        await this.saveContainer(containerId);
        return { success: true, stacked: true };
      }
    }

    // Swap items
    const tempSlot = fromItem.slot;
    fromItem.slot = toItem.slot;
    toItem.slot = tempSlot;

    await this.saveContainer(containerId);

    return { success: true, swapped: true };
  }

  /**
   * Transfer item between containers
   */
  async transferItem(fromContainerId, toContainerId, slot, quantity = null) {
    // Remove from source
    const removeResult = await this.removeItem(fromContainerId, slot, quantity);

    if (!removeResult.success) {
      return removeResult;
    }

    // Add to destination
    const addResult = await this.addItem(
      toContainerId,
      removeResult.itemId,
      removeResult.quantity,
      null,
      removeResult.metadata
    );

    if (!addResult.success) {
      // Rollback - add back to source
      await this.addItem(
        fromContainerId,
        removeResult.itemId,
        removeResult.quantity,
        slot,
        removeResult.metadata
      );
      return addResult;
    }

    this.log(`Transferred item: ${removeResult.itemId} x${removeResult.quantity} from ${fromContainerId} to ${toContainerId}`, 'debug');

    return { success: true };
  }

  /**
   * Get container items
   */
  getContainerItems(containerId) {
    const container = this.containers.get(containerId);
    return container ? container.items : [];
  }

  /**
   * Get container info
   */
  getContainer(containerId) {
    return this.containers.get(containerId) || null;
  }

  /**
   * Check if container has item
   */
  hasItem(containerId, itemId, quantity = 1) {
    const container = this.containers.get(containerId);
    if (!container) return false;

    let totalQuantity = 0;
    for (const item of container.items) {
      if (item.itemId === itemId) {
        totalQuantity += item.quantity;
      }
    }

    return totalQuantity >= quantity;
  }

  /**
   * Get item count in container
   */
  getItemCount(containerId, itemId) {
    const container = this.containers.get(containerId);
    if (!container) return 0;

    let totalQuantity = 0;
    for (const item of container.items) {
      if (item.itemId === itemId) {
        totalQuantity += item.quantity;
      }
    }

    return totalQuantity;
  }

  /**
   * Clear container
   */
  async clearContainer(containerId) {
    const container = this.containers.get(containerId);
    if (!container) {
      return { success: false, reason: 'container_not_found' };
    }

    container.items = [];
    container.currentWeight = 0;

    await this.saveContainer(containerId);

    this.log(`Cleared container: ${containerId}`, 'info');

    return { success: true };
  }

  /**
   * Find empty slot in container
   */
  findEmptySlot(container) {
    const occupiedSlots = new Set(container.items.map(i => i.slot));

    for (let slot = 1; slot <= container.slots; slot++) {
      if (!occupiedSlots.has(slot)) {
        return slot;
      }
    }

    return null;
  }

  /**
   * Get default slots for container type
   */
  getDefaultSlots(type) {
    switch (type) {
      case 'player': return this.config.defaultPlayerSlots;
      case 'vehicle': return this.config.defaultVehicleSlots;
      case 'storage': return this.config.defaultStorageSlots;
      default: return this.config.defaultPlayerSlots;
    }
  }

  /**
   * Get default weight for container type
   */
  getDefaultWeight(type) {
    switch (type) {
      case 'player': return this.config.defaultPlayerWeight;
      case 'vehicle': return this.config.defaultVehicleWeight;
      case 'storage': return this.config.defaultStorageWeight;
      default: return this.config.defaultPlayerWeight;
    }
  }

  /**
   * Start auto-save
   */
  startAutoSave() {
    this.autoSaveTimer = setInterval(() => {
      this.saveAllContainers();
    }, this.config.autoSaveInterval);

    this.log('Auto-save started', 'debug');
  }

  /**
   * Stop auto-save
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      this.log('Auto-save stopped', 'debug');
    }
  }

  /**
   * Save all loaded containers
   */
  async saveAllContainers() {
    const containerIds = Array.from(this.containers.keys());

    for (const containerId of containerIds) {
      await this.saveContainer(containerId);
    }

    this.log(`Auto-saved ${containerIds.length} containers`, 'debug');
  }

  /**
   * Configure container manager
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    this.log('Container manager configuration updated', 'info');
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      loadedContainers: this.containers.size,
      totalItems: Array.from(this.containers.values()).reduce((sum, c) => sum + c.items.length, 0)
    };
  }

  /**
   * Log helper
   */
  log(message, level = 'info', metadata = {}) {
    if (this.logger) {
      this.logger.log(message, level, metadata);
    } else {
      this.framework.log[level](`[Container Manager] ${message}`);
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.stopAutoSave();
    await this.saveAllContainers();
    this.containers.clear();
    this.playerContainers.clear();
    this.log('Container manager module destroyed', 'info');
  }
}

module.exports = ContainerManager;

// Self-register
global.Framework.register('container-manager', new ContainerManager(global.Framework), 14);
