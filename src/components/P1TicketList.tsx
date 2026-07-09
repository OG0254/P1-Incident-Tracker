/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Search,
  Filter,
  Calendar,
  CheckCircle,
  Clock,
  ArrowUpRight,
  X,
  AlertOctagon,
  PenSquare,
} from 'lucide-react';
import { P1Ticket, SupportGroup, SUPPORT_GROUPS, UserRole } from '../types';

interface P1TicketListProps {
  tickets: P1Ticket[];
  currentRole: UserRole;
  userSupportGroup: SupportGroup;
  currentUserUsername?: string;
  onSelectTicket: (ticket: P1Ticket) => void;
  statusFilterLimit?: 'All' | 'Pending Resolution Details' | 'Completed';
  onClearStatusFilterLimit?: () => void;
  supportGroups?: string[];
}

const formatKeycloakName = (val?: string): string => {
  if (!val) return 'System';
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(val)) {
    return val; // Pure UUID fallback
  }
  if (val.includes(':')) {
    const parts = val.split(':');
    const lastPart = parts[parts.length - 1];
    if (lastPart && !uuidRegex.test(lastPart) && lastPart !== 'f') {
      return lastPart
        .split('.')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
    }
  }
  return val
    .split('.')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
};

export const P1TicketList: React.FC<P1TicketListProps> = ({
  tickets,
  currentRole,
  userSupportGroup,
  currentUserUsername,
  onSelectTicket,
  statusFilterLimit = 'All',
  onClearStatusFilterLimit,
  supportGroups,
}) => {
  const groupsList = supportGroups && supportGroups.length > 0 ? supportGroups : SUPPORT_GROUPS;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGroup, setFilterGroup] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterDate, setFilterDate] = useState('');

  // Handle manual resets
  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterGroup('All');
    setFilterStatus('All');
    setFilterDate('');
    if (onClearStatusFilterLimit) {
      onClearStatusFilterLimit();
    }
  };

  // Determine active tickets list based on current user role
  const roleFilteredTickets = tickets.filter((ticket) => {
    if (currentRole === 'Support Group User') {
      return (
        ticket.supportGroup === userSupportGroup ||
        (currentUserUsername && ticket.createdBy === currentUserUsername)
      );
    }
    return true; // Service Desk sees everything
  });

  // Apply Search & Filter Conditions
  const processedTickets = roleFilteredTickets.filter((ticket) => {
    // 1. Status Filter Limit (from Dashboard Card Clicks)
    if (statusFilterLimit !== 'All' && ticket.status !== statusFilterLimit) {
      return false;
    }

    // 2. Local Status Dropdown Filter (only applicable if statusFilterLimit is 'All')
    if (statusFilterLimit === 'All' && filterStatus !== 'All' && ticket.status !== filterStatus) {
      return false;
    }

    // 3. Search Term (Ticket ID or Title)
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      const matchJira = ticket.jiraId.toLowerCase().includes(term);
      const matchTitle = ticket.title.toLowerCase().includes(term);
      if (!matchJira && !matchTitle) return false;
    }

    // 4. Support Group Filter
    if (filterGroup !== 'All' && ticket.supportGroup !== filterGroup) {
      return false;
    }

    // 5. Creation Date Filter
    if (filterDate && ticket.date !== filterDate) {
      return false;
    }

    return true;
  });

  return (
    <div className="space-y-4 select-none animate-fadeIn">
      {/* 1. Header with Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
              <Filter className="w-4.5 h-4.5 text-slate-400" />
              <span>SLA Incident Filter Panel</span>
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Refine or locate active incident logs currently recorded on the network
            </p>
          </div>

          {/* Active status limit badge */}
          {statusFilterLimit !== 'All' && (
            <div className="flex items-center gap-2 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100 px-3 py-1.5 rounded-xl">
              <span>
                Filtering Status: <strong>{statusFilterLimit}</strong>
              </span>
              <button
                onClick={onClearStatusFilterLimit}
                className="hover:bg-rose-100 p-0.5 rounded text-rose-800 transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Inputs Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search Term */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              id="search-input"
              type="text"
              placeholder="Search JIRA ID or Title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-205 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 transition-all font-sans"
            />
          </div>

          {/* Support Group */}
          <div>
            <select
              id="group-filter-select"
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="w-full bg-slate-50 border border-slate-205 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 transition-all cursor-pointer"
            >
              <option value="All">All Resolver Groups</option>
              {groupsList.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* Status (Hidden if active dashboard filter applied) */}
          <div>
            <select
              id="status-filter-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              disabled={statusFilterLimit !== 'All'}
              className="w-full bg-slate-50 border border-slate-205 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="All">All Statuses</option>
              <option value="Pending Resolution Details">Pending Resolution Details</option>
              <option value="Completed">Completed / Closed</option>
            </select>
          </div>

          {/* Date Created */}
          <div className="relative">
            <input
              id="date-filter-input"
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-205 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 transition-all cursor-pointer font-sans"
            />
          </div>
        </div>

        {/* Clear Filters Button */}
        {(searchTerm ||
          filterGroup !== 'All' ||
          filterStatus !== 'All' ||
          filterDate ||
          statusFilterLimit !== 'All') && (
          <div className="flex justify-end pt-1">
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Filter Conditions</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Log Cards Listing */}
      <div className="space-y-3">
        {processedTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white border border-slate-200/60 rounded-2xl shadow-xs text-center p-6">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-full text-slate-300">
              <AlertOctagon className="w-8 h-8" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">No Incidents Found</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                There are no documented P1 incidents matching the active filters or assigned to your
                resolver group.
              </p>
            </div>
          </div>
        ) : (
          processedTickets.map((ticket) => {
            const isAssignedResolver = userSupportGroup === ticket.supportGroup;
            const isSD = currentRole === 'Service Desk';
            const canEdit =
              ticket.status === 'Pending Resolution Details' && (isSD || isAssignedResolver);

            return (
              <div
                key={ticket.id}
                onClick={() => onSelectTicket(ticket)}
                className="bg-white hover:bg-slate-50/40 border border-slate-200/60 hover:border-slate-300 rounded-2xl p-5 shadow-inner-white flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:translate-y-[-1px] group animate-fadeIn"
              >
                {/* Left side info */}
                <div className="space-y-3 flex-1">
                  {/* Top line metadata */}
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    {/* Status Badge */}
                    <span
                      className={`text-[9px] font-black tracking-wider px-2.5 py-0.5 rounded-full uppercase flex items-center gap-1 w-max ${
                        ticket.status === 'Completed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-150/55'
                          : 'bg-rose-50 text-rose-700 border border-rose-150/55 animate-pulse'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${ticket.status === 'Completed' ? 'bg-emerald-500' : 'bg-rose-500 animate-ping'}`}
                      />
                      <span>
                        {ticket.status === 'Completed' ? 'Completed' : 'Pending Resolution'}
                      </span>
                    </span>

                    {/* JIRA ID */}
                    <span className="text-[10px] font-mono font-extrabold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-150/50">
                      Jira ID: {ticket.jiraId}
                    </span>

                    {/* Assigned Support Group */}
                    <span className="text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100 font-medium whitespace-nowrap">
                      {ticket.supportGroup}
                    </span>

                    {/* Created By */}
                    <span className="text-slate-500 bg-slate-50/50 px-2 py-0.5 rounded-md border border-slate-100/50 font-medium">
                      Created by:{' '}
                      <span className="text-slate-700 font-bold">
                        {formatKeycloakName(ticket.createdByName || ticket.createdBy || 'System')}
                      </span>
                    </span>

                    {/* Date */}
                    <span className="text-slate-400 font-mono flex items-center gap-1 ml-auto md:ml-0">
                      <Calendar className="w-3.5 h-3.5 text-slate-300" />
                      <span>{ticket.date}</span>
                    </span>
                  </div>

                  {/* Title & Observations */}
                  <div className="space-y-1">
                    <h3 className="text-xs font-extrabold text-slate-900 group-hover:text-aku-green transition-colors leading-relaxed line-clamp-1">
                      {ticket.title}
                    </h3>

                    {/* Short resolution description snippet if closed */}
                    {ticket.status === 'Completed' && ticket.resolutionDescription && (
                      <p className="text-[11px] text-emerald-700/80 bg-emerald-50/30 border border-emerald-100/40 p-2 rounded-xl italic font-medium line-clamp-1 max-w-xl">
                        Resolution technical log: {ticket.resolutionDescription}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right side controls */}
                <div className="flex items-center gap-2.5 self-end md:self-auto border-t border-slate-100/60 pt-3 md:pt-0 md:border-t-0">
                  {canEdit ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTicket(ticket);
                      }}
                      className="px-3.5 py-2 bg-rose-700 hover:bg-rose-800 border border-rose-600 hover:border-rose-700 text-white rounded-xl text-[10px] font-black tracking-wide uppercase flex items-center gap-1.5 cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
                    >
                      <PenSquare className="w-3.5 h-3.5 text-white" />
                      <span>Resolve SLA Incident</span>
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTicket(ticket);
                      }}
                      className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 rounded-xl text-[10px] font-black tracking-wide uppercase flex items-center gap-1 cursor-pointer border border-slate-200/50 transition-all hover:scale-[1.01]"
                    >
                      <span>Inspect Details</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
