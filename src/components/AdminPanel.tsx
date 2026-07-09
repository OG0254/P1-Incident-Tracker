/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Settings, 
  Terminal, 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle, 
  Info,
  Users,
  Check,
  XCircle
} from 'lucide-react';
import { apiClient } from '../utils/api';
import { AccessRequest } from '../types';

interface AdminPanelProps {
  onTriggerToast: (message: string, type?: 'success' | 'info' | 'warn') => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onTriggerToast }) => {
  const [activeSubTab, setActiveSubTab] = useState<'sso-config' | 'smtp-queue' | 'sys-logs' | 'access-requests'>('sso-config');
  
  // SMTP Alert simulator states
  const [mailLogs, setMailLogs] = useState<string[]>([]);
  const [isSmtpLoading, setIsSmtpLoading] = useState(false);

  // Live system logs states
  const [logType, setLogType] = useState<'app' | 'security' | 'errors'>('app');
  const [logContent, setLogContent] = useState<string>('Loading system audit records...');
  const [isLogLoading, setIsLogLoading] = useState(false);

  // Access Requests Queue states
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [isRequestsLoading, setIsRequestsLoading] = useState(false);

  const fetchAccessRequests = async () => {
    setIsRequestsLoading(true);
    try {
      const reqs = await apiClient.getPendingRequests();
      setAccessRequests(reqs || []);
    } catch (err: any) {
      console.error(err);
      onTriggerToast(err.message || 'Failed to load access requests', 'warn');
    } finally {
      setIsRequestsLoading(false);
    }
  };

  const handleApproveRequest = async (id: string) => {
    try {
      await apiClient.approveRequest(id);
      onTriggerToast('Access request marked as Approved/Processed.', 'success');
      fetchAccessRequests();
    } catch (err: any) {
      onTriggerToast(err.message || 'Failed to approve request', 'warn');
    }
  };

  const handleRejectRequest = async (id: string) => {
    try {
      await apiClient.rejectRequest(id);
      onTriggerToast('Access request marked as Rejected.', 'info');
      fetchAccessRequests();
    } catch (err: any) {
      onTriggerToast(err.message || 'Failed to reject request', 'warn');
    }
  };

  // Keycloak active configs
  const currentHost = window.location.hostname;
  const keycloakUrl = `http://${currentHost}:8080`;
  const realmName = 'aku-realm';
  const clientId = 'aku-portal';
  const adminGroupClaim = 'Service Desk';

  // Fetch SMTP alerts
  const fetchSmtpLogs = async () => {
    setIsSmtpLoading(true);
    try {
      const logs = await apiClient.getSmtpLogs();
      setMailLogs(logs || []);
    } catch (err: any) {
      console.error(err);
      // Fallback local localStorage cache
      const saved = localStorage.getItem('smtp_sim_logs');
      if (saved) {
        try { setMailLogs(JSON.parse(saved)); } catch (e) {}
      }
    } finally {
      setIsSmtpLoading(false);
    }
  };

  // Clear SMTP alert queues
  const handleClearSmtpLogs = async () => {
    localStorage.setItem('smtp_sim_logs', JSON.stringify([]));
    setMailLogs([]);
    onTriggerToast('SMTP simulated logs cleared', 'info');
  };

  // Fetch real-time log tailing
  const fetchSystemLogs = async (typeSelected: 'app' | 'security' | 'errors') => {
    setIsLogLoading(true);
    setLogContent('Retrieving active log trails from cluster server nodes...');
    try {
      const fileQuery = typeSelected === 'app' ? 'application' : typeSelected === 'security' ? 'security' : 'errors';
      const response = await apiClient.getLogs(fileQuery);
      if (response) {
        setLogContent(response);
      } else {
        setLogContent('No audit entries recorded in this file yet.');
      }
    } catch (err: any) {
      setLogContent(`[COMMUNICATION ERROR] Unable to contact administrative API log stream.\nRoot Cause: ${err.message || 'Server returned 403 Forbidden.'}\n\nEnsure you are authenticated with 'Service Desk' admin roles in your Keycloak token to view system logs.`);
    } finally {
      setIsLogLoading(false);
    }
  };

  // Load appropriate data on tab change
  useEffect(() => {
    if (activeSubTab === 'smtp-queue') {
      fetchSmtpLogs();
    } else if (activeSubTab === 'sys-logs') {
      fetchSystemLogs(logType);
    } else if (activeSubTab === 'access-requests') {
      fetchAccessRequests();
    }
  }, [activeSubTab, logType]);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden min-h-[500px] flex flex-col md:flex-row">
      {/* Side Navigation panel */}
      <div className="w-full md:w-56 bg-slate-50 border-r border-slate-200/60 p-4 space-y-4 flex-shrink-0">
        <div>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2">
            Control Console
          </h3>
          <p className="text-[11px] text-slate-500 px-3 leading-relaxed">
            Enterprise administration and integration diagnostics
          </p>
        </div>

        <div className="space-y-1">
          <button
            onClick={() => setActiveSubTab('sso-config')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all cursor-pointer ${
              activeSubTab === 'sso-config'
                ? 'bg-emerald-50 text-aku-green shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            <span>Keycloak SSO</span>
          </button>

          <button
            onClick={() => setActiveSubTab('smtp-queue')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all cursor-pointer ${
              activeSubTab === 'smtp-queue'
                ? 'bg-emerald-50 text-aku-green shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Mail className="w-4 h-4 flex-shrink-0" />
            <span>SMTP Alerts</span>
          </button>

          <button
            onClick={() => setActiveSubTab('sys-logs')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all cursor-pointer ${
              activeSubTab === 'sys-logs'
                ? 'bg-emerald-50 text-aku-green shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-4 h-4 flex-shrink-0" />
            <span>Server Audit Logs</span>
          </button>

          <button
            onClick={() => setActiveSubTab('access-requests')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all cursor-pointer ${
              activeSubTab === 'access-requests'
                ? 'bg-emerald-50 text-aku-green shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 flex-shrink-0" />
            <span>Access Requests Queue</span>
          </button>
        </div>

        <div className="pt-6 border-t border-slate-200/80 px-3">
          <div className="flex items-center gap-2 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Keycloak Connected</span>
          </div>
          <p className="text-[9px] text-slate-400 mt-1">
            Running strictly on OIDC Federated Identity
          </p>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 p-6 min-w-0">
        {/* TAB 1: Keycloak SSO Status Details */}
        {activeSubTab === 'sso-config' && (
          <div className="space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-aku-green" />
                Keycloak OIDC Single Sign-On Integration
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Active directory federated identities are authenticated strictly through Keycloak OpenID Connect.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/40 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Server Connection URL</span>
                <code className="text-xs text-emerald-700 bg-emerald-50/50 px-2 py-1 rounded font-mono font-bold select-all break-all block">
                  {keycloakUrl}
                </code>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/40 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">OIDC Integration Realm</span>
                <code className="text-xs text-emerald-700 bg-emerald-50/50 px-2 py-1 rounded font-mono font-bold select-all break-all block">
                  {realmName}
                </code>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/40 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Registered Client ID</span>
                <code className="text-xs text-emerald-700 bg-emerald-50/50 px-2 py-1 rounded font-mono font-bold select-all break-all block">
                  {clientId}
                </code>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/40 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Admin Role / Claim Group</span>
                <code className="text-xs text-emerald-700 bg-emerald-50/50 px-2 py-1 rounded font-mono font-bold select-all break-all block">
                  {adminGroupClaim}
                </code>
              </div>
            </div>

            <div className="bg-blue-50/60 border border-blue-150 rounded-2xl p-4 flex gap-3 text-blue-800">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold">Keycloak Claim Mappings</h4>
                <p className="text-[11.5px] text-blue-700 leading-relaxed">
                  The application is fully integrated with Keycloak's roles. When users log in, their token is decoded. 
                  Users who are assigned the realm role <code className="bg-blue-100 px-1 py-0.5 rounded font-mono font-bold text-blue-900">Service Desk</code> 
                  will automatically inherit administrative rights to manage and delete incident tickets. Other users will be routed to their respective Level 3 Support Groups based on their directory attributes.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-3">
              <span className="text-xs font-bold text-slate-800 block">Federated Redirection Configuration</span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                By default, this application requires a valid OIDC authentication handshake. If an unauthenticated user visits, they are securely redirected to the Keycloak login screen at <code className="text-slate-800 font-semibold">{keycloakUrl}</code>, and returned back seamlessly with secure JWT assertions on success.
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: SMTP Notification queues */}
        {activeSubTab === 'smtp-queue' && (
          <div className="space-y-5">
            <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <Mail className="w-5 h-5 text-aku-green" />
                  SMTP Alert Notifications Queue
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Outgoing server email alerts routed when creating or resolving critical P1 tickets.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={fetchSmtpLogs}
                  className="px-3 py-1.5 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSmtpLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleClearSmtpLogs}
                  className="px-3 py-1.5 text-xs font-bold text-rose-600 border border-rose-200 hover:bg-rose-50/50 rounded-xl transition-all cursor-pointer"
                >
                  Clear Logs
                </button>
              </div>
            </div>

            {mailLogs.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-400">
                <Mail className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-xs font-semibold">SMTP Notification Logs are Empty</p>
                <p className="text-[11px] text-slate-400 mt-1">Creating or updating ticket details will record alert notifications here.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                {mailLogs.map((log, idx) => (
                  <div key={idx} className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono text-[11px] border border-slate-800 leading-relaxed shadow-xs flex gap-2">
                    <span className="text-emerald-500 font-extrabold flex-shrink-0">⚙️</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: System logs audit viewer */}
        {activeSubTab === 'sys-logs' && (
          <div className="space-y-5">
            <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-aku-green" />
                  Live Express Server Audit Logs
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Active logs tailing from the Node.js enterprise backend server.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => fetchSystemLogs(logType)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLogLoading ? 'animate-spin' : ''}`} />
                  Tail Logs
                </button>
              </div>
            </div>

            {/* Log Type Filters */}
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              {(['app', 'security', 'errors'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setLogType(type)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                    logType === type
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  {type === 'app' ? 'General App' : type === 'security' ? 'Security Shield' : 'System Errors'}
                </button>
              ))}
            </div>

            {/* Terminal Window */}
            <div className="bg-slate-950 rounded-2xl p-4.5 border border-slate-800 shadow-xl flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-900 mb-3 text-slate-500 text-[10px] font-mono uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="ml-1 font-bold">server-node@cluster-01:~/{logType}.log</span>
                </div>
                <span>Tailed just now</span>
              </div>

              <pre className="font-mono text-[10.5px] text-emerald-400 leading-relaxed overflow-x-auto overflow-y-auto max-h-[350px] whitespace-pre-wrap select-all">
                {logContent}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 4: Access Requests Queue */}
        {activeSubTab === 'access-requests' && (
          <div className="space-y-5">
            <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <Users className="w-5 h-5 text-aku-green" />
                  Access Requests Queue (Notification Queue)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Queue of requested user credentials. Review and manually create the accounts inside Keycloak.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={fetchAccessRequests}
                  className="px-3 py-1.5 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRequestsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-950">
              <Info className="w-5 h-5 text-amber-750 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold">Keycloak Provisioning Mandate</h4>
                <p className="text-[11px] leading-relaxed">
                  No automatic user approval or account creation occurs inside the P1 Tracker. This queue is purely for notifications.
                  Once you review a request, <strong>Brian Ogada</strong> must manually create the username and password in Keycloak. After creating it, mark the request below as approved/processed to clear the queue.
                </p>
              </div>
            </div>

            {accessRequests.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-400">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-xs font-semibold">No Access Requests Pending</p>
                <p className="text-[11px] text-slate-400 mt-1">New staff requesting credentials through the portal login page will appear here.</p>
              </div>
            ) : (
              <div className="border border-slate-200/60 rounded-2xl overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200/60 font-bold">
                      <th className="p-3">Staff Member</th>
                      <th className="p-3">Username & Email</th>
                      <th className="p-3">Proposed Role / Support Group</th>
                      <th className="p-3">Request Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {accessRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-900">{req.fullName}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-600">
                          <div>{req.username}</div>
                          <div className="text-[10px] text-slate-400">{req.email}</div>
                        </td>
                        <td className="p-3">
                          <span className="font-bold block text-[11px]">{req.proposedRole}</span>
                          <span className="text-[10px] text-slate-500 block truncate max-w-[200px]">{req.proposedGroup}</span>
                        </td>
                        <td className="p-3 text-slate-400 text-[10.5px]">
                          {new Date(req.requestDate).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            req.status === 'Approved' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : req.status === 'Rejected'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {req.status === 'Approved' ? 'Processed' : req.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {req.status === 'Pending' && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleApproveRequest(req.id)}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded border border-emerald-100 transition-all cursor-pointer"
                                title="Mark as Processed / Approved in Keycloak"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectRequest(req.id)}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded border border-rose-100 transition-all cursor-pointer"
                                title="Reject / Dismiss Request"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
