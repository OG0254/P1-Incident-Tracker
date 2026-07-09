/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SupportGroup = string;

export const SUPPORT_GROUPS: string[] = [];

export function normalizeSupportGroup(groupName: string): string {
  if (!groupName) return '';
  let clean = groupName.startsWith('/') ? groupName.slice(1) : groupName;
  if (clean.includes('ICT Support Groups/')) {
    clean = clean.split('ICT Support Groups/')[1];
  }

  // Convert any legacy "AKU" names to "NBI" for backward compatibility
  let mapped = clean.replace(/\bAKU\b/g, 'NBI');

  // Match "Level 3/NBI MIS" or similar to "Level 3/NBI AKU MIS"
  if (mapped === 'Level 3/NBI MIS' || mapped === 'Level 3/AKU MIS') {
    mapped = 'Level 3/NBI AKU MIS';
  }

  return mapped;
}

export type TicketStatus = 'Pending Resolution Details' | 'Completed';

export interface P1Ticket {
  id: string; // Internal UUID
  jiraId: string; // User-facing, e.g., "INC-40294"
  title: string;
  date: string; // YYYY-MM-DD
  supportGroup: SupportGroup;
  status: TicketStatus;

  // Filled by Support Group
  resolutionDescription?: string;
  outageStart?: string; // YYYY-MM-DDTHH:mm
  outageEnd?: string; // YYYY-MM-DDTHH:mm
  comments?: string;
  updatedAt?: string; // ISO string
  updatedBy?: string; // Support group name or username
  createdBy?: string; // Username of creator
  createdByName?: string; // Full name of creator
  resolvedBy?: string; // Full name of resolver
  resolvedAt?: string; // ISO string of when it was resolved
  isReminderSent?: boolean; // Scheduled 24h reminder
  lastFollowupAt?: string; // Manual follow-up request from Service Desk
}

export type UserRole = 'Service Desk' | 'Support Group User';

export interface RosterUser {
  samAccountName: string;
  cn: string;
  mail: string;
  adGroup?: string;
  simulatedRights: string;
  role: UserRole;
  supportGroup: SupportGroup;
  isActive: boolean;
  needsPasswordChange?: boolean;
}

export interface AccessRequest {
  id: string;
  fullName: string;
  email: string;
  username: string;
  proposedRole: UserRole;
  proposedGroup: SupportGroup;
  requestDate: string; // ISO String
  status: 'Pending' | 'Approved' | 'Rejected';
  password?: string;
}
