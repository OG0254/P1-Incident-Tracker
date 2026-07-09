/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  ListCheck,
  PlusSquare,
  RefreshCw,
  HeartPulse,
  Settings,
  ShieldCheck,
} from 'lucide-react';

import {
  P1Ticket,
  UserRole,
  SupportGroup,
  RosterUser,
  SUPPORT_GROUPS,
  normalizeSupportGroup,
} from './types';
import { IdentityHeader } from './components/IdentityHeader';
import { Dashboard } from './components/Dashboard';
import { TicketForm } from './components/TicketForm';
import { P1TicketList } from './components/P1TicketList';
import { TicketModal } from './components/TicketModal';
import { MonthlyReport } from './components/MonthlyReport';
import { AdminPanel } from './components/AdminPanel';
import { Login } from './components/Login';
import { apiClient } from './utils/api';

type TabID = 'dashboard' | 'create-ticket' | 'all-tickets' | 'monthly-report' | 'admin-settings';

export function App(props: { keycloak?: any }) {
  // --- Persistent Core State ---
  const [tickets, setTickets] = useState<P1Ticket[]>([]);
  const [supportGroups, setSupportGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [meUser, setMeUser] = useState<RosterUser | null>(null);

  // Derive logged-in staff identity dynamically from the active Keycloak OIDC Token assertions
  const keycloak = props.keycloak;

  // --- Toast Toaster notifications ---
  const [sysToast, setSysToast] = useState<{
    message: string;
    type: 'success' | 'info' | 'warn';
  } | null>(null);

  const triggerToast = (message: string, type: 'success' | 'info' | 'warn' = 'success') => {
    setSysToast({ message, type });
  };

  // Toast timer auto-dismissal
  useEffect(() => {
    if (sysToast) {
      const timer = setTimeout(() => {
        setSysToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [sysToast]);

  // Render login screen if Keycloak is not authenticated
  if (!keycloak?.authenticated) {
    return (
      <>
        <Login
          keycloak={keycloak}
          onLoginSuccess={(token, refreshToken, user) => {
            localStorage.setItem('p1_auth_token', token);
            localStorage.setItem('p1_refresh_token', refreshToken);
            // Reload page to re-initialize Keycloak with the new tokens
            window.location.reload();
          }}
        />
        {sysToast && (
          <div className="fixed bottom-6 right-6 z-[9999] animate-bounce">
            <div
              className={`px-4 py-3 rounded-xl border shadow-lg text-xs font-bold ${
                sysToast.type === 'success'
                  ? 'bg-emerald-500 text-white border-emerald-600'
                  : sysToast.type === 'warn'
                    ? 'bg-rose-500 text-white border-rose-600'
                    : 'bg-blue-500 text-white border-blue-600'
              }`}
            >
              {sysToast.message}
            </div>
          </div>
        )}
      </>
    );
  }

  const tokenParsed = {
    ...(keycloak?.tokenParsed || {}),
    ...(keycloak?.idTokenParsed || {}),
  };

  const tokenGroupsArr = Array.isArray(tokenParsed?.groups)
    ? tokenParsed.groups
    : typeof tokenParsed?.groups === 'string'
      ? [tokenParsed.groups]
      : [];

  const isServiceDesk =
    tokenParsed?.realm_access?.roles?.includes('Service Desk') ||
    tokenParsed?.resource_access?.['aku-portal']?.roles?.includes('Service Desk') ||
    tokenParsed?.roles?.includes('Service Desk') ||
    tokenGroupsArr.some(
      (g: string) =>
        g &&
        typeof g === 'string' &&
        (g.toLowerCase().includes('service desk') || g.toLowerCase().includes('service-desk'))
    ) ||
    // Fallback check for Brian / Admin
    tokenParsed?.preferred_username?.toLowerCase().includes('brian') ||
    tokenParsed?.preferred_username?.toLowerCase().includes('bogada') ||
    tokenParsed?.preferred_username?.toLowerCase().includes('admin') ||
    tokenParsed?.name?.toLowerCase().includes('brian') ||
    tokenParsed?.email?.toLowerCase().includes('brian') ||
    tokenParsed?.email?.toLowerCase().includes('ogada');

  // Dynamically extract support group mapping from Keycloak custom claim
  let matchedGroup: SupportGroup = '';
  if (isServiceDesk) {
    matchedGroup = 'Service Desk';
  } else {
    const rawOidcGroups = tokenParsed?.groups || tokenParsed?.group || [];
    const oidcGroups: string[] = Array.isArray(rawOidcGroups)
      ? rawOidcGroups
      : typeof rawOidcGroups === 'string'
        ? [rawOidcGroups]
        : [];

    for (let group of oidcGroups) {
      if (typeof group !== 'string') continue;
      const cleanGroup = group.startsWith('/') ? group.slice(1) : group;
      if (cleanGroup === 'ICT Support Groups') {
        continue;
      }
      const norm = normalizeSupportGroup(group);
      if (norm) {
        matchedGroup = norm;
        break;
      }
    }
  }

  const cleanVal = (val: any): string | null => {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (!trimmed) return null;
    return trimmed;
  };

  // 1. Extract a clean username (samAccountName)
  let parsedUsername = '';

  const cleanUsername = cleanVal(tokenParsed?.preferred_username || tokenParsed?.username);
  if (cleanUsername) {
    parsedUsername = cleanUsername;
  }

  if (!parsedUsername && tokenParsed?.email) {
    const emailPrefix = tokenParsed.email.split('@')[0];
    const cleaned = cleanVal(emailPrefix);
    if (cleaned) parsedUsername = cleaned;
  }

  if (!parsedUsername && tokenParsed?.given_name && tokenParsed?.family_name) {
    parsedUsername = `${tokenParsed.given_name}.${tokenParsed.family_name}`.toLowerCase();
  }

  if (!parsedUsername && tokenParsed?.name) {
    parsedUsername = tokenParsed.name.toLowerCase().replace(/\s+/g, '.');
  }

  if (!parsedUsername) {
    parsedUsername = tokenParsed?.sub || '';
  }

  // 2. Extract a clean display name (cn)
  let parsedCn = '';

  if (tokenParsed?.given_name || tokenParsed?.family_name) {
    const gn = tokenParsed.given_name || '';
    const fn = tokenParsed.family_name || '';
    const fullName = `${gn} ${fn}`.trim();
    const cleaned = cleanVal(fullName);
    if (cleaned) parsedCn = cleaned;
  }

  if (!parsedCn && tokenParsed?.name) {
    const cleaned = cleanVal(tokenParsed.name);
    if (cleaned) parsedCn = cleaned;
  }

  if (!parsedCn && parsedUsername) {
    parsedCn = parsedUsername
      .split('.')
      .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  // Strict verification: we MUST log an error detailing exactly which claims were missing if identity cannot be found
  if (!parsedCn || !parsedUsername) {
    console.error(
      '[IDENTITY ERROR] Frontend unable to resolve valid identity claims from Keycloak token parsed structure. OIDC claims:',
      tokenParsed
    );
  }

  const activeUser: RosterUser = {
    samAccountName: meUser?.samAccountName || parsedUsername,
    cn: meUser?.cn || parsedCn,
    mail: meUser?.mail || tokenParsed?.email || `${parsedUsername}@aku.edu`,
    adGroup:
      meUser?.adGroup ||
      (isServiceDesk
        ? 'CN=AKU-ICT-ServiceDesk,OU=Groups,DC=aku,DC=local'
        : `CN=AKU-ICT-${matchedGroup.split('/').pop()?.replace(/\s+/g, '')},OU=Groups,DC=aku,DC=local`),
    simulatedRights:
      meUser?.simulatedRights ||
      (isServiceDesk
        ? 'Service Desk Owner (Full System Permissions)'
        : 'Support Group User Rights'),
    role: meUser?.role || (isServiceDesk ? 'Service Desk' : 'Support Group User'),
    supportGroup: meUser?.supportGroup || matchedGroup,
    isActive: meUser?.isActive !== undefined ? meUser.isActive : true,
  };

  const currentRole: UserRole = activeUser.role;

  // --- Active Tab ---
  const [activeTab, setActiveTab] = useState<TabID>('dashboard');

  // --- Active Selected ticket for modal details ---
  const [selectedTicket, setSelectedTicket] = useState<P1Ticket | null>(null);

  // --- Preset limit clicked from dashboard ---
  const [statusFilterLimit, setStatusFilterLimit] = useState<
    'All' | 'Pending Resolution Details' | 'Completed'
  >('All');

  // Load baseline states from secure backend API
  const syncWithBackend = async () => {
    setIsLoading(true);
    try {
      const me = await apiClient.getMe();
      if (me) {
        setMeUser(me);
      }
    } catch (err: any) {
      console.warn('Failed to fetch user profile from /api/auth/me:', err.message);
    }

    try {
      const serverTickets = await apiClient.getTickets();
      if (serverTickets) {
        setTickets(serverTickets);
      }
    } catch (err: any) {
      console.warn('Backend tickets offline or unauthorized. Simulating locally:', err.message);
    }

    try {
      const serverGroups = await apiClient.getGroups();
      if (serverGroups && serverGroups.length > 0) {
        setSupportGroups(serverGroups);
      } else {
        setSupportGroups(SUPPORT_GROUPS);
      }
    } catch (err: any) {
      console.warn('Backend groups offline or unauthorized. Falling back to default:', err.message);
      setSupportGroups(SUPPORT_GROUPS);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    syncWithBackend();
  }, []);

  // --- Incident Operations ---

  // Create a P1 Incident ticket
  const handleAddTicket = async (newFields: Omit<P1Ticket, 'id' | 'status'>) => {
    try {
      const newTicket = await apiClient.createTicket(newFields);
      setTickets((prev) => [newTicket, ...prev]);
      setActiveTab('all-tickets');
      setStatusFilterLimit('All');
      triggerToast(`Added P1 Incident Ticket ${newTicket.jiraId} successfully!`, 'success');

      // Dispatch simulated SMTP log routing
      const alertLog = `[${new Date().toLocaleTimeString()}] ⚙️ SYSTEM LOG: P1 Incident ${newTicket.jiraId} created. Standard initial email notification deferred for 24 hours to prevent duplicate Jira notification spam.`;
      await apiClient.pushSmtpLog(alertLog);
    } catch (err: any) {
      triggerToast(err.message || 'Failed to file P1 incident', 'warn');
    }
  };

  // Update a ticket's resolution
  const handleUpdateTicketDetails = async (
    ticketId: string,
    updates: {
      resolutionDescription: string;
      outageStart: string;
      outageEnd: string;
      comments?: string;
    }
  ) => {
    const targetTicket = tickets.find((t) => t.id === ticketId);
    if (!targetTicket) return;

    const updatedTicket: P1Ticket = {
      ...targetTicket,
      ...updates,
      status: 'Completed',
    };

    try {
      const savedTicket = await apiClient.updateTicket(ticketId, updatedTicket);
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? savedTicket : t)));
      setSelectedTicket(null);
      triggerToast(
        `Successfully recorded resolution details for ${savedTicket.jiraId}. Incident is closed.`,
        'success'
      );

      // Dispatch simulated SMTP log routing
      const alertLog = `[${new Date().toLocaleTimeString()}] 📧 EMAIL ALERT: Outgoing notification dispatched to members of "${savedTicket.supportGroup}" confirming SLA incident closure for ${savedTicket.jiraId}.`;
      await apiClient.pushSmtpLog(alertLog);
    } catch (err: any) {
      triggerToast(err.message || 'Failed to submit resolution details', 'warn');
    }
  };

  // Dispatch manual resolution request alert (SLA escalation)
  const handleManualReminder = async (ticket: P1Ticket) => {
    const alertMsg = `[${new Date().toLocaleTimeString()}] 🚨 URGENT REMINDER: Manual SLA escalation dispatched to assigned team resolver group: "${ticket.supportGroup}" regarding active P1 Incident: ${ticket.jiraId}.`;
    try {
      await apiClient.pushSmtpLog(alertMsg);
      triggerToast(
        `SLA escalation alert successfully dispatched to ${ticket.supportGroup}!`,
        'success'
      );
    } catch (err) {
      triggerToast('Failed to dispatch alert', 'warn');
    }
  };

  // Logout Single Sign-On session
  const handleLogOutSession = () => {
    localStorage.removeItem('p1_auth_token');
    if (keycloak) {
      keycloak.logout();
    } else {
      window.location.reload();
    }
  };

  // Handle direct navigation clicks from the dashboard cards
  const handleDashboardCardAction = (
    statusFilter: 'All' | 'Pending Resolution Details' | 'Completed'
  ) => {
    setStatusFilterLimit(statusFilter);
    setActiveTab('all-tickets');
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans select-none animate-fadeIn">
      {/* 1. Global Corporate Identity Header */}
      <IdentityHeader activeUser={activeUser} onLogOut={handleLogOutSession} />

      {/* 2. Brand & Hospital Banner Layout */}
      <header className="bg-white border-b border-emerald-100 py-4.5 px-6 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-aku-green text-white rounded-2xl shadow-sm transition-all hover:rotate-2">
              <HeartPulse className="w-6 h-6 animate-pulse text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 tracking-tight">
                  AKU P1 Incident Governance
                </h1>
                <span className="text-[10px] bg-emerald-50 text-aku-green font-extrabold px-2 py-0.5 rounded-full border border-emerald-200">
                  SECURE PORTAL
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Aga Khan University Hospital • Incident Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200/50 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-aku-green" />
              SSO Authenticated
            </span>
            <button
              onClick={syncWithBackend}
              className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-600 hover:text-slate-900 border border-slate-200/40 cursor-pointer"
              title="Synchronize Database"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* 3. Primary Sidebar Layout */}
      <div className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 flex flex-col gap-6">
        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200/60 shadow-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Overview Dashboard</span>
          </button>

          <button
            onClick={() => {
              setStatusFilterLimit('All');
              setActiveTab('all-tickets');
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'all-tickets'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <ListCheck className="w-4 h-4" />
            <span>
              Active Incident Log (
              {
                tickets.filter((t) =>
                  currentRole === 'Service Desk'
                    ? true
                    : t.supportGroup === activeUser.supportGroup ||
                      t.createdBy === activeUser.samAccountName
                ).length
              }
              )
            </span>
          </button>

          {currentRole === 'Service Desk' && (
            <button
              onClick={() => setActiveTab('create-ticket')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'create-ticket'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <PlusSquare className="w-4 h-4" />
              <span>Log P1 Incident</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('monthly-report')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'monthly-report'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Monthly SLA Report</span>
          </button>

          {currentRole === 'Service Desk' && (
            <button
              onClick={() => setActiveTab('admin-settings')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'admin-settings'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Admin Console</span>
            </button>
          )}
        </div>

        {/* 4. Active Main Workspace View */}
        <main className="flex-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white border border-slate-200/60 rounded-2xl shadow-xs">
              <RefreshCw className="w-8 h-8 text-aku-green animate-spin" />
              <p className="text-xs text-slate-500 font-bold">
                Retrieving incident telemetry from campus database...
              </p>
            </div>
          ) : (
            <div className="animate-fadeIn">
              {activeTab === 'dashboard' && (
                <Dashboard
                  tickets={
                    currentRole === 'Service Desk'
                      ? tickets
                      : tickets.filter(
                          (t) =>
                            t.supportGroup === activeUser.supportGroup ||
                            t.createdBy === activeUser.samAccountName
                        )
                  }
                  onFilterStatus={handleDashboardCardAction}
                  activeStatusFilter={statusFilterLimit}
                  currentRole={currentRole}
                />
              )}

              {activeTab === 'create-ticket' && currentRole === 'Service Desk' && (
                <div className="max-w-xl mx-auto">
                  <TicketForm onAddTicket={handleAddTicket} supportGroups={supportGroups} />
                </div>
              )}

              {activeTab === 'all-tickets' && (
                <P1TicketList
                  tickets={tickets}
                  currentRole={currentRole}
                  userSupportGroup={activeUser.supportGroup}
                  currentUserUsername={activeUser.samAccountName}
                  onSelectTicket={(ticket) => setSelectedTicket(ticket)}
                  statusFilterLimit={statusFilterLimit}
                  onClearStatusFilterLimit={() => setStatusFilterLimit('All')}
                  supportGroups={supportGroups}
                />
              )}

              {activeTab === 'monthly-report' && (
                <MonthlyReport
                  tickets={
                    currentRole === 'Service Desk'
                      ? tickets
                      : tickets.filter(
                          (t) =>
                            t.supportGroup === activeUser.supportGroup ||
                            t.createdBy === activeUser.samAccountName
                        )
                  }
                />
              )}

              {activeTab === 'admin-settings' && currentRole === 'Service Desk' && (
                <AdminPanel onTriggerToast={triggerToast} />
              )}
            </div>
          )}
        </main>
      </div>

      {/* 5. Custom Modal Inspector */}
      {selectedTicket && (
        <TicketModal
          ticket={selectedTicket}
          currentRole={currentRole}
          userSupportGroup={activeUser.supportGroup}
          onClose={() => setSelectedTicket(null)}
          onUpdateTicket={handleUpdateTicketDetails}
          onManualReminder={handleManualReminder}
        />
      )}

      {/* 6. Footer Layout */}
      <footer className="mt-auto py-6 bg-white border-t border-slate-200/60 text-center">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] font-semibold text-slate-400">
          <p>
            © 2026 Aga Khan University Hospital. ICT Core Enterprise Group. All Rights Reserved.
          </p>
          <div className="flex items-center gap-1.5 text-[9px] bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>
              OIDC Identity Active: {activeUser.cn}{' '}
              {!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                activeUser.samAccountName
              ) && `(${activeUser.samAccountName})`}
            </span>
          </div>
        </div>
      </footer>

      {/* System Toast Alerts */}
      {sysToast && (
        <div className="fixed right-6 bottom-6 flex items-center gap-2.5 p-4 bg-slate-900 text-slate-100 rounded-2xl shadow-2xl border border-slate-800 text-xs font-semibold z-50 animate-slideUp">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
          <span>{sysToast.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;
