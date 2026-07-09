import { P1Ticket, RosterUser, AccessRequest, SupportGroup, UserRole } from '../types';

const API_BASE = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('p1_auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errMsg = 'Network request failed';
    try {
      const errBody = await res.json();
      errMsg = errBody.error || errMsg;
      if (errBody.requirePasswordChange) {
        const customErr = new Error(errMsg) as any;
        customErr.requirePasswordChange = true;
        throw customErr;
      }
    } catch (e: any) {
      if (e.requirePasswordChange) throw e;
    }
    throw new Error(errMsg);
  }
  const data = await res.json();
  return data;
}

export const apiClient = {
  // Authentication
  async login(username: string, password: string): Promise<{ token: string; refreshToken: string; user: RosterUser }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await handleResponse<any>(res);
    if (data.token) {
      localStorage.setItem('p1_auth_token', data.token);
    }
    if (data.refreshToken) {
      localStorage.setItem('p1_refresh_token', data.refreshToken);
    }
    return data;
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: getHeaders() });
    } catch (_) {}
    localStorage.removeItem('p1_auth_token');
    localStorage.removeItem('p1_refresh_token');
  },

  async getMe(): Promise<RosterUser> {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: getHeaders() });
    const data = await handleResponse<{ user: RosterUser }>(res);
    return data.user;
  },

  async fileSignup(formData: {
    fullName: string;
    email: string;
    username: string;
    proposedRole: UserRole;
    proposedGroup: SupportGroup;
    password?: string;
  }): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    return handleResponse<{ message: string }>(res);
  },

  // Incident Tickets CRUD
  async getTickets(): Promise<P1Ticket[]> {
    const res = await fetch(`${API_BASE}/tickets`, { headers: getHeaders() });
    const data = await handleResponse<{ tickets: P1Ticket[] }>(res);
    return data.tickets;
  },

  async createTicket(ticket: Omit<P1Ticket, 'id' | 'status'> & { id?: string }): Promise<P1Ticket> {
    const res = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(ticket),
    });
    const data = await handleResponse<{ ticket: P1Ticket }>(res);
    return data.ticket;
  },

  async updateTicket(id: string, ticket: P1Ticket): Promise<P1Ticket> {
    const res = await fetch(`${API_BASE}/tickets/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(ticket),
    });
    const data = await handleResponse<{ ticket: P1Ticket }>(res);
    return data.ticket;
  },

  async deleteTicket(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/tickets/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse<{ message: string }>(res);
  },

  // Directory governance queries
  async getPendingRequests(): Promise<AccessRequest[]> {
    const res = await fetch(`${API_BASE}/admin/requests`, { headers: getHeaders() });
    const data = await handleResponse<{ requests: AccessRequest[] }>(res);
    return data.requests;
  },

  async approveRequest(id: string, role?: UserRole, group?: SupportGroup): Promise<RosterUser> {
    const res = await fetch(`${API_BASE}/admin/requests/${id}/approve`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ role, group }),
    });
    const data = await handleResponse<{ user: RosterUser }>(res);
    return data.user;
  },

  async rejectRequest(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/admin/requests/${id}/reject`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse<{ message: string }>(res);
  },

  async getRoster(): Promise<RosterUser[]> {
    const res = await fetch(`${API_BASE}/admin/roster`, { headers: getHeaders() });
    const data = await handleResponse<{ roster: RosterUser[] }>(res);
    return data.roster;
  },

  async createRosterUser(userObj: any): Promise<RosterUser> {
    const res = await fetch(`${API_BASE}/admin/roster`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(userObj),
    });
    const data = await handleResponse<{ user: RosterUser }>(res);
    return data.user;
  },

  async updateRosterUser(username: string, updates: any): Promise<RosterUser> {
    const res = await fetch(`${API_BASE}/admin/roster/${username}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(updates),
    });
    const data = await handleResponse<{ user: RosterUser }>(res);
    return data.user;
  },

  async resetUserPassword(username: string, password: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/roster/${username}/password`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ password }),
    });
    await handleResponse<{ message: string }>(res);
  },

  async changePassword(password: string): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ password }),
    });
    await handleResponse<any>(res);
  },

  async pruneRosterUser(username: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/roster/${username}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    await handleResponse<any>(res);
  },

  // SMTP Simulation Logs Sync
  async getSmtpLogs(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/admin/sync/smtp-logs`, { headers: getHeaders() });
    const data = await handleResponse<{ logs: string[] }>(res);
    return data.logs;
  },

  async pushSmtpLog(content: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/admin/sync/smtp-logs`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ content }),
      });
    } catch (_) {}
  },

  // Dynamic Keycloak Groups
  async getGroups(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/groups`, { headers: getHeaders() });
    const data = await handleResponse<{ groups: string[] }>(res);
    return data.groups;
  },

  // Diagnostics check
  async getHealth(): Promise<any> {
    const res = await fetch(`${API_BASE}/monitoring/health`);
    return handleResponse<any>(res);
  },

  async getLogs(fileType: 'application' | 'errors' | 'security'): Promise<string> {
    const url = `${API_BASE}/admin/logs?file=${fileType}`;
    const res = await fetch(url, { headers: getHeaders() });
    const data = await handleResponse<{ logs: string }>(res);
    return data.logs;
  }
};
