/**
 * NextGen Framework - Organization Manager Module
 * Manages organizations/jobs (police, hospital, gangs, businesses)
 */

class OrganizationManager {
  constructor(framework) {
    this.framework = framework;
    this.db = null;
    this.moneyManager = null;
    this.accessManager = null;

    // Organization cache
    this.organizations = new Map(); // orgId => Organization
    this.playerOrganizations = new Map(); // source => Set(orgIds)

    // Default organizations
    this.defaultOrganizations = [
      { id: 'police', name: 'Police', type: 'government', maxEmployees: 50 },
      { id: 'ambulance', name: 'EMS', type: 'government', maxEmployees: 30 },
      { id: 'mechanic', name: 'Mechanic', type: 'business', maxEmployees: 20 }
    ];
  }

  async init() {
    this.db = this.framework.getModule('database');
    this.moneyManager = this.framework.getModule('money-manager');
    this.accessManager = this.framework.getModule('access-manager');

    await this.loadOrganizations();
    this.framework.log.info('Organization manager initialized');
  }

  async loadOrganizations() {
    try {
      const orgs = await this.db.query('SELECT * FROM organizations');
      for (const org of orgs) {
        this.organizations.set(org.id, {
          ...org,
          metadata: typeof org.metadata === 'string' ? JSON.parse(org.metadata) : org.metadata
        });
      }
      this.framework.log.debug(`Loaded ${orgs.length} organizations`);
    } catch (error) {
      this.framework.log.error(`Failed to load organizations: ${error.message}`);
    }
  }

  async createOrganization(id, name, type, metadata = {}) {
    try {
      await this.db.execute(
        'INSERT INTO organizations (id, name, type, metadata) VALUES (?, ?, ?, ?)',
        [id, name, type, JSON.stringify(metadata)]
      );

      const org = { id, name, type, metadata };
      this.organizations.set(id, org);

      this.framework.log.info(`Created organization: ${name}`);
      return { success: true, organization: org };
    } catch (error) {
      this.framework.log.error(`Failed to create organization: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  getOrganization(orgId) {
    return this.organizations.get(orgId) || null;
  }

  async addEmployee(orgId, characterId, grade = 0) {
    try {
      await this.db.execute(
        'INSERT INTO organization_employees (org_id, character_id, grade) VALUES (?, ?, ?)',
        [orgId, characterId, grade]
      );

      this.framework.log.debug(`Added employee to ${orgId}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async removeEmployee(orgId, characterId) {
    try {
      await this.db.execute(
        'DELETE FROM organization_employees WHERE org_id = ? AND character_id = ?',
        [orgId, characterId]
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }


  async destroy() {
    this.organizations.clear();
    this.playerOrganizations.clear();
  }
}

module.exports = OrganizationManager;

// Self-register
global.Framework.register('organization-manager', new OrganizationManager(global.Framework), 16);
