import { Component, EntityId, World } from '../types';

export class WorldImpl implements World {
  private entities: Map<EntityId, Map<string, Component>> = new Map();
  private nextEntityId = 0;

  createEntity(): EntityId {
    const id = `entity_${this.nextEntityId++}`;
    this.entities.set(id, new Map());
    return id;
  }

  removeEntity(entityId: EntityId): void {
    this.entities.delete(entityId);
  }

  addComponent<T extends Component>(entityId: EntityId, component: T): void {
    const components = this.entities.get(entityId);
    if (components) {
      components.set(component.type, component);
    }
  }

  getComponent<T extends Component>(entityId: EntityId, type: string): T | undefined {
    const components = this.entities.get(entityId);
    return components?.get(type) as T | undefined;
  }

  hasComponent(entityId: EntityId, type: string): boolean {
    const components = this.entities.get(entityId);
    return components?.has(type) ?? false;
  }

  removeComponent(entityId: EntityId, type: string): void {
    const components = this.entities.get(entityId);
    components?.delete(type);
  }

  query(...componentTypes: string[]): EntityId[] {
    const result: EntityId[] = [];
    for (const [entityId, components] of this.entities) {
      if (componentTypes.every((type) => components.has(type))) {
        result.push(entityId);
      }
    }
    return result;
  }

  getAllEntities(): EntityId[] {
    return Array.from(this.entities.keys());
  }

  clear(): void {
    this.entities.clear();
  }

  // For snapshot support
  getEntityComponents(entityId: EntityId): Record<string, Component> {
    const components = this.entities.get(entityId);
    if (!components) return {};
    return Object.fromEntries(components);
  }

  // For loading snapshots
  loadEntity(entityId: EntityId, components: Record<string, Component>): void {
    const componentMap = new Map<string, Component>();
    for (const [type, component] of Object.entries(components)) {
      componentMap.set(type, component);
    }
    this.entities.set(entityId, componentMap);
    // Update nextEntityId if needed
    const match = entityId.match(/entity_(\d+)/);
    if (match) {
      const id = parseInt(match[1], 10);
      if (id >= this.nextEntityId) {
        this.nextEntityId = id + 1;
      }
    }
  }
}
