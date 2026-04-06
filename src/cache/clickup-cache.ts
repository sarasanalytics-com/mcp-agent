import { cache } from './index';
import { logger } from '../logger';

// Cache TTLs (in milliseconds)
const CACHE_TTL = {
  WORKSPACE_HIERARCHY: 30 * 60 * 1000, // 30 minutes
  WORKSPACE_MEMBERS: 60 * 60 * 1000,   // 1 hour
  LIST_DETAILS: 30 * 60 * 1000,        // 30 minutes
  CUSTOM_FIELDS: 60 * 60 * 1000,       // 1 hour
  FOLDER_DETAILS: 30 * 60 * 1000,      // 30 minutes
  SPACE_DETAILS: 30 * 60 * 1000,       // 30 minutes
};

export interface ClickUpList {
  id: string;
  name: string;
  space?: { id: string; name: string };
  folder?: { id: string; name: string };
}

export interface ClickUpMember {
  id: number;
  username: string;
  email: string;
  color?: string;
  profilePicture?: string;
}

export interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  type_config?: any;
  required?: boolean;
}

export class ClickUpCache {
  /**
   * Cache workspace hierarchy
   */
  setWorkspaceHierarchy(workspaceId: string, data: any): void {
    const key = `workspace:${workspaceId}:hierarchy`;
    cache.set(key, data, CACHE_TTL.WORKSPACE_HIERARCHY);
  }

  getWorkspaceHierarchy(workspaceId: string): any | null {
    const key = `workspace:${workspaceId}:hierarchy`;
    return cache.get(key);
  }

  /**
   * Cache workspace members
   */
  setWorkspaceMembers(workspaceId: string, members: ClickUpMember[]): void {
    const key = `workspace:${workspaceId}:members`;
    cache.set(key, members, CACHE_TTL.WORKSPACE_MEMBERS);
    
    // Also cache individual member lookups
    for (const member of members) {
      if (member.email) {
        const emailKey = `workspace:${workspaceId}:member:email:${member.email.toLowerCase()}`;
        cache.set(emailKey, member, CACHE_TTL.WORKSPACE_MEMBERS);
      }
      if (member.username) {
        const usernameKey = `workspace:${workspaceId}:member:username:${member.username.toLowerCase()}`;
        cache.set(usernameKey, member, CACHE_TTL.WORKSPACE_MEMBERS);
      }
    }
  }

  getWorkspaceMembers(workspaceId: string): ClickUpMember[] | null {
    const key = `workspace:${workspaceId}:members`;
    return cache.get(key);
  }

  getMemberByEmail(workspaceId: string, email: string): ClickUpMember | null {
    const key = `workspace:${workspaceId}:member:email:${email.toLowerCase()}`;
    return cache.get(key);
  }

  getMemberByUsername(workspaceId: string, username: string): ClickUpMember | null {
    const key = `workspace:${workspaceId}:member:username:${username.toLowerCase()}`;
    return cache.get(key);
  }

  /**
   * Cache list details
   */
  setListDetails(listId: string, data: ClickUpList): void {
    const key = `list:${listId}`;
    cache.set(key, data, CACHE_TTL.LIST_DETAILS);
  }

  getListDetails(listId: string): ClickUpList | null {
    const key = `list:${listId}`;
    return cache.get(key);
  }

  /**
   * Cache custom fields
   */
  setCustomFields(listId: string, fields: ClickUpCustomField[]): void {
    const key = `list:${listId}:custom_fields`;
    cache.set(key, fields, CACHE_TTL.CUSTOM_FIELDS);
  }

  getCustomFields(listId: string): ClickUpCustomField[] | null {
    const key = `list:${listId}:custom_fields`;
    return cache.get(key);
  }

  /**
   * Cache folder details
   */
  setFolderDetails(folderId: string, data: any): void {
    const key = `folder:${folderId}`;
    cache.set(key, data, CACHE_TTL.FOLDER_DETAILS);
  }

  getFolderDetails(folderId: string): any | null {
    const key = `folder:${folderId}`;
    return cache.get(key);
  }

  /**
   * Cache space details
   */
  setSpaceDetails(spaceId: string, data: any): void {
    const key = `space:${spaceId}`;
    cache.set(key, data, CACHE_TTL.SPACE_DETAILS);
  }

  getSpaceDetails(spaceId: string): any | null {
    const key = `space:${spaceId}`;
    return cache.get(key);
  }

  /**
   * Invalidate all ClickUp cache
   */
  invalidateAll(): void {
    cache.clear();
    logger.info('ClickUp cache invalidated');
  }

  /**
   * Invalidate workspace-specific cache
   */
  invalidateWorkspace(workspaceId: string): void {
    const stats = cache.getStats();
    const prefix = `workspace:${workspaceId}:`;
    
    for (const key of stats.keys) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    }
    
    logger.info('Workspace cache invalidated', { workspaceId });
  }
}

// Global ClickUp cache instance
export const clickupCache = new ClickUpCache();
