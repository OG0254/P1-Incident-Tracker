/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  TrendingUp, 
  AlertCircle,
  HelpCircle,
  Building2,
  Bell
} from 'lucide-react';
import { P1Ticket, SupportGroup, UserRole } from '../types';

interface DashboardProps {
  tickets: P1Ticket[];
  onFilterStatus: (status: 'All' | 'Pending Resolution Details' | 'Completed') => void;
  activeStatusFilter: 'All' | 'Pending Resolution Details' | 'Completed';
  currentRole?: UserRole;
}

export const Dashboard: React.FC<DashboardProps> = ({
  tickets,
  onFilterStatus,
  activeStatusFilter,
  currentRole = 'Service Desk',
}) => {
  const totalTickets = tickets.length;
  const pendingTickets = tickets.filter(t => t.status === 'Pending Resolution Details').length;
  const completedTickets = tickets.filter(t => t.status === 'Completed').length;
  
  const completionPercentage = totalTickets > 0 
    ? Math.round((completedTickets / totalTickets) * 100) 
    : 0;

  // Group pending tickets count by Support Group
  const pendingByGroupMap: Record<string, number> = {};
  tickets.forEach(ticket => {
    if (ticket.status === 'Pending Resolution Details') {
      pendingByGroupMap[ticket.supportGroup] = (pendingByGroupMap[ticket.supportGroup] || 0) + 1;
    }
  });

  const pendingGroupEntries = Object.entries(pendingByGroupMap).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Top Welcome Panel */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {currentRole === 'Service Desk' ? 'System Statistics Dashboard' : 'My Team Metrics Dashboard'}
          </h2>
          <p className="text-sm text-slate-500">
            {currentRole === 'Service Desk' 
              ? 'Real-time operations status for Priority 1 (P1) incidents.' 
              : 'Your active group queue metrics and resolution progress.'}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-aku-green-light/80 text-aku-green text-xs font-semibold px-3 py-1.5 rounded-full border border-aku-green-light">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Active Reporting Period: June 2026</span>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Metric 1: Total */}
        <button
          id="stat-card-all"
          onClick={() => onFilterStatus('All')}
          className={`text-left p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
            activeStatusFilter === 'All'
              ? 'bg-aku-green text-white border-aku-green shadow-lg scale-[1.02]'
              : 'bg-white text-slate-900 border-slate-200 hover:border-aku-green/50 hover:shadow-md'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className={`p-2.5 rounded-xl ${
              activeStatusFilter === 'All' ? 'bg-aku-green-dark text-aku-green-light' : 'bg-aku-green-light text-aku-green'
            }`}>
              <FileText className="w-5 h-5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
              Total Recorded
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-mono font-bold tracking-tight">{totalTickets}</div>
            <div className="text-xs opacity-80 mt-1">P1 Incidents Registered</div>
          </div>
        </button>

        {/* Metric 2: Unresolved */}
        <button
          id="stat-card-pending"
          onClick={() => onFilterStatus('Pending Resolution Details')}
          className={`text-left p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
            activeStatusFilter === 'Pending Resolution Details'
              ? 'bg-aku-maroon text-white border-aku-maroon shadow-lg scale-[1.02]'
              : 'bg-white text-slate-900 border-slate-200 hover:border-aku-maroon hover:shadow-md'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className={`p-2.5 rounded-xl ${
              activeStatusFilter === 'Pending Resolution Details' ? 'bg-aku-maroon-dark text-white' : 'bg-aku-maroon-light text-aku-maroon'
            }`}>
              <Clock className="w-5 h-5 animate-pulse" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
              Awaiting Details
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-mono font-bold tracking-tight">{pendingTickets}</div>
            <div className="text-xs opacity-80 mt-1">Pending Support Groups</div>
          </div>
        </button>

        {/* Metric 3: Completed */}
        <button
          id="stat-card-completed"
          onClick={() => onFilterStatus('Completed')}
          className={`text-left p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
            activeStatusFilter === 'Completed'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg scale-[1.02]'
              : 'bg-white text-slate-900 border-slate-200 hover:border-emerald-200 hover:shadow-md'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className={`p-2.5 rounded-xl ${
              activeStatusFilter === 'Completed' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <CheckCircle2 className="w-5 h-5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
              Completed
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-mono font-bold tracking-tight">{completedTickets}</div>
            <div className="text-xs opacity-80 mt-1">Fully Documented</div>
          </div>
        </button>

        {/* Metric 4: Progress Gauge */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="p-2.5 rounded-xl bg-aku-green-light text-aku-green">
              <TrendingUp className="w-5 h-5" />
            </span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Reporting Readiness
            </span>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-mono font-bold text-slate-900">{completionPercentage}%</span>
              <span className="text-xs text-slate-505">Ready</span>
            </div>
            {/* Visual Progress Bar */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-aku-green transition-all duration-500 rounded-full"
                style={{ width: `${completionPercentage}%` }}
              ></div>
            </div>
          </div>
        </div>

      </div>

      {/* Split details layout: Group Backlog List & Info Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Support Group Response Breakdown */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                <Building2 className="w-4 h-4 text-slate-500" />
                {currentRole === 'Service Desk' ? 'Unresolved Incidents by Support Group' : 'My Team Backlog Status'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentRole === 'Service Desk' 
                  ? 'Support groups holding pending tickets. Click a group below to view or follow up.' 
                  : 'Pending details validation progress for your assigned incident queue.'}
              </p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-semibold font-mono">
              {currentRole === 'Service Desk' ? `${pendingGroupEntries.length} Groups` : `${pendingTickets} Unresolved`}
            </span>
          </div>

          {pendingGroupEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-100">
              <CheckCircle2 className="w-8 h-8 text-emerald-500-400 mb-2" />
              <div className="text-sm font-medium text-slate-700">Perfect Status!</div>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                There are absolutely no outstanding P1 incident updates required. All groups have completed their reports.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingGroupEntries.map(([groupName, count]) => {
                const totalGroupTickets = tickets.filter(t => t.supportGroup === groupName).length;
                const completedGroupTickets = tickets.filter(t => t.supportGroup === groupName && t.status === 'Completed').length;
                const progressWidth = totalGroupTickets > 0 ? (completedGroupTickets / totalGroupTickets) * 100 : 0;

                return (
                  <div key={groupName} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-800 truncate">{groupName}</span>
                        <span className="text-xs font-mono font-bold text-aku-maroon bg-aku-maroon-light px-2 py-0.5 rounded-full border border-aku-maroon-light">
                          {count} pending
                        </span>
                      </div>
                      
                      {/* Nested Progress Bar for group */}
                      <div className="w-full flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="bg-aku-maroon h-full rounded-full"
                            style={{ width: `${100 - progressWidth}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                          {completedGroupTickets} / {totalGroupTickets} done
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Operational Flow Tip Center */}
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-205 flex flex-col justify-between font-sans">
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
              <Bell className="w-4 h-4 text-aku-green" />
              {currentRole === 'Service Desk' ? 'Service Desk Notice Area' : 'Team Operational Guidelines'}
            </h3>
            
            <div className="text-xs text-slate-600 space-y-3 leading-relaxed">
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                <span className="font-semibold text-aku-green block mb-0.5">SLA Enforcement</span>
                {currentRole === 'Service Desk' 
                  ? 'Each support tier is required to provide the accurate Outage timelines and Resolution Description within 48 hours of ticket handover.'
                  : 'Please submit exact outage start, end, and resolution logs within 48 hours to fulfill SLA criteria and clear this incident.'}
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                <span className="font-semibold text-aku-green block mb-0.5">Instant Synchronization</span>
                {currentRole === 'Service Desk'
                  ? 'This portal acts as the single source of truth. Support groups can open tickets from their own dedicated tab and submit directly.'
                  : 'Your entries are directly pushed to the main database and compiled for the Monthly Audit automatically.'}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 text-center">
            <span className="text-[10px] font-mono text-slate-400">
              System Release v1.1.0 (Hospital Intranet Only)
            </span>
          </div>
        </div>

      </div>

    </div>
  );
};
