/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  CheckCircle,
  Calendar,
  FileText,
  PenSquare,
  MessageSquare,
  Activity,
  AlertTriangle,
  Send,
  BellRing,
  MailWarning,
} from 'lucide-react';
import { P1Ticket, UserRole, SupportGroup } from '../types';

interface TicketModalProps {
  ticket: P1Ticket;
  currentRole: UserRole;
  userSupportGroup: SupportGroup;
  onClose: () => void;
  onUpdateTicket: (
    ticketId: string,
    updates: {
      resolutionDescription: string;
      outageStart: string;
      outageEnd: string;
      comments?: string;
    }
  ) => void;
  onManualReminder: (ticketId: string) => void;
  onSimulate24hTrigger?: (ticketId: string) => void;
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

export const TicketModal: React.FC<TicketModalProps> = ({
  ticket,
  currentRole,
  userSupportGroup,
  onClose,
  onUpdateTicket,
  onManualReminder,
  onSimulate24hTrigger,
}) => {
  const [resolutionDescription, setResolutionDescription] = useState(
    ticket.resolutionDescription || ''
  );
  const [outageStart, setOutageStart] = useState(ticket.outageStart || '');
  const [outageEnd, setOutageEnd] = useState(ticket.outageEnd || '');
  const [comments, setComments] = useState(ticket.comments || '');
  const [errorLocal, setErrorLocal] = useState('');

  // Sync state if active ticket switches
  useEffect(() => {
    setResolutionDescription(ticket.resolutionDescription || '');
    setOutageStart(ticket.outageStart || '');
    setOutageEnd(ticket.outageEnd || '');
    setComments(ticket.comments || '');
    setErrorLocal('');
  }, [ticket]);

  // Duration Calculator Utility
  const calculateDuration = (startStr: string, endStr: string): string => {
    if (!startStr || !endStr) return 'Not fully calculated';
    const s = new Date(startStr);
    const e = new Date(endStr);
    const diffMs = e.getTime() - s.getTime();

    if (isNaN(diffMs)) return 'Invalid date inputs';
    if (diffMs < 0) return 'Error: End Time is earlier than Start Time';

    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;

    if (hours === 0) {
      return `${mins} min${mins !== 1 ? 's' : ''}`;
    }
    return `${hours} hr${hours !== 1 ? 's' : ''} ${mins} min${mins !== 1 ? 's' : ''}`;
  };

  // Safe deadline auto-calculator based on 24-hour countdown trigger
  const getAutoReminderTime = (): string => {
    if (!ticket.updatedAt) return 'Pending...';
    const originalDate = new Date(ticket.updatedAt);
    const reminderDate = new Date(originalDate.getTime() + 24 * 60 * 60 * 1000);
    return reminderDate.toLocaleString();
  };

  // Form Submission Handler
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLocal('');

    if (!resolutionDescription.trim()) {
      setErrorLocal('Please provide a precise technical resolution description.');
      return;
    }
    if (!outageStart) {
      setErrorLocal('Outage Start Date & Time is a mandatory metric.');
      return;
    }
    if (!outageEnd) {
      setErrorLocal('Outage End Date & Time is a mandatory metric.');
      return;
    }

    const s = new Date(outageStart);
    const eTime = new Date(outageEnd);
    if (eTime.getTime() < s.getTime()) {
      setErrorLocal('Technical inconsistency: Outage End Time cannot precede Outage Start Time.');
      return;
    }

    onUpdateTicket(ticket.id, {
      resolutionDescription: resolutionDescription.trim(),
      outageStart,
      outageEnd,
      comments: comments.trim() || undefined,
    });
  };

  // Role Checks
  const isServiceDesk = currentRole === 'Service Desk';
  const isAssignedResolver = userSupportGroup === ticket.supportGroup;

  // Incident ticket is only editable if it is in "Pending Resolution Details" AND the active user is authorized (Service Desk or Assigned Support Group Resolver)
  const isEditable =
    ticket.status === 'Pending Resolution Details' && (isServiceDesk || isAssignedResolver);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn select-none">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all scale-100">
        {/* Banner header bar color based on status */}
        <div
          className={`h-2.5 ${ticket.status === 'Completed' ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}
        />

        {/* Header Title Area */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full uppercase ${
                  ticket.status === 'Completed'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                    : 'bg-rose-50 text-rose-700 border border-rose-200/50 animate-pulse'
                }`}
              >
                {ticket.status === 'Completed' ? 'Closed Incident' : 'Open SLA Pending'}
              </span>
              <span className="text-xs font-mono font-extrabold text-slate-400">
                Jira ID: {ticket.jiraId}
              </span>
            </div>
            <h2 className="text-sm font-black text-slate-900 leading-snug line-clamp-1">
              {ticket.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-all cursor-pointer border border-transparent hover:border-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Core Ticket Information */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Date Raised
              </span>
              <p className="text-xs font-semibold text-slate-850 mt-0.5">{ticket.date}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Assigned Group
              </span>
              <p className="text-xs font-semibold text-slate-850 mt-0.5">{ticket.supportGroup}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Created By
              </span>
              <p className="text-xs font-bold text-slate-850 mt-0.5">
                {formatKeycloakName(ticket.createdByName || ticket.createdBy || 'System')}
              </p>
            </div>
          </div>

          {/* SLA Alerts and Reminders Widget (Requested 24h & Follow-ups logic) */}
          {currentRole === 'Service Desk' && ticket.status === 'Pending Resolution Details' && (
            <div className="bg-rose-50/45 border border-rose-200/50 rounded-2xl p-4.5 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-aku-maroon bg-aku-maroon-light px-2.5 py-0.5 rounded-full tracking-wider uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-aku-maroon rounded-full animate-ping"></span>
                  SLA Notification &amp; 24-Hour Followup Plan
                </span>
                <span className="text-[10px] font-mono text-slate-400 font-semibold bg-white px-2 py-0.5 rounded border border-slate-200">
                  SLA Reminder Scheduler
                </span>
              </div>

              <div className="text-xs text-slate-650 leading-relaxed space-y-2">
                <p>
                  To prevent notification duplicate fatigue, the{' '}
                  <strong>P1 Tracker delays automatic alerts</strong> by exactly 24 hours. Because
                  Jira already sends out immediate tickets, the first warning reminder goes out only
                  if 24 hours pass without resolution.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] bg-white p-3 rounded-xl border border-rose-100">
                  <div className="space-y-0.5">
                    <span className="text-slate-400 block font-bold">
                      1. Immediate E-mail Alert
                    </span>
                    <span className="text-slate-600 font-semibold italic">
                      ✓ Intercepted (Deferred to Core Jira)
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400 block font-bold">
                      2. 24h Automatic Reminder
                    </span>
                    {ticket.isReminderSent ? (
                      <span className="text-rose-700 font-bold flex items-center gap-1.5">
                        <MailWarning className="w-3.5 h-3.5" />
                        🔔 Dispatched (24h breached without resolutions)
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded w-max">
                        ⏳ Scheduled for: {getAutoReminderTime()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons inside SLA Alert box */}
              <div className="flex gap-2 pt-1 border-t border-rose-100/40">
                <button
                  onClick={() => onManualReminder(ticket.id)}
                  className="px-3.5 py-2 bg-rose-700 hover:bg-rose-800 border border-rose-600 rounded-xl text-[10px] font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-xs transition-all hover:scale-[1.01]"
                >
                  <BellRing className="w-3.5 h-3.5 text-white" />
                  <span>Send Immediate Escalation Alert Now</span>
                </button>

                {onSimulate24hTrigger && !ticket.isReminderSent && (
                  <button
                    onClick={() => onSimulate24hTrigger(ticket.id)}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-900 rounded-xl text-[10px] font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer transition-all hover:scale-[1.01]"
                  >
                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                    <span>Simulate 24h Expiry (Force Alert)</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Form to submit technical resolutions */}
          <form onSubmit={handleFormSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-400" />
                Resolution Description <span className="text-red-500">*</span>
              </label>
              {isEditable ? (
                <textarea
                  id="modal-res-desc"
                  rows={3}
                  placeholder="Provide precise technical logs and actions taken to resolve this incident..."
                  value={resolutionDescription}
                  onChange={(e) => setResolutionDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-205 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-aku-maroon transition-all font-sans"
                  required
                />
              ) : (
                <p className="text-xs text-slate-850 bg-slate-50 p-3.5 rounded-xl border border-slate-100 italic min-h-[60px] whitespace-pre-wrap">
                  {ticket.resolutionDescription || 'No resolution description provided yet.'}
                </p>
              )}
            </div>

            {/* Resolution Metadata Signoff */}
            {ticket.resolvedBy && (
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 flex items-center gap-2.5 animate-fadeIn">
                <span className="text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono">
                  Resolved By
                </span>
                <span className="text-xs text-slate-700">
                  <strong className="font-bold text-slate-900">
                    {formatKeycloakName(ticket.resolvedBy)}
                  </strong>
                  {ticket.resolvedAt && ` on ${new Date(ticket.resolvedAt).toLocaleString()}`}
                </span>
              </div>
            )}

            {/* Outage Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  Outage Start Date &amp; Time <span className="text-red-500">*</span>
                </label>
                {isEditable ? (
                  <input
                    id="modal-outage-start"
                    type="datetime-local"
                    value={outageStart}
                    onChange={(e) => setOutageStart(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-205 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-aku-maroon transition-all cursor-pointer"
                    required
                  />
                ) : (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs font-mono font-medium text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {outageStart ? new Date(outageStart).toLocaleString() : 'N/A'}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  Outage End Date &amp; Time <span className="text-red-500">*</span>
                </label>
                {isEditable ? (
                  <input
                    id="modal-outage-end"
                    type="datetime-local"
                    value={outageEnd}
                    onChange={(e) => setOutageEnd(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-205 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-aku-maroon transition-all cursor-pointer"
                    required
                  />
                ) : (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs font-mono font-medium text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {outageEnd ? new Date(outageEnd).toLocaleString() : 'N/A'}
                  </div>
                )}
              </div>
            </div>

            {/* Calculated Outage Duration Badge */}
            {(outageStart || ticket.outageStart) && (outageEnd || ticket.outageEnd) && (
              <div className="bg-slate-50 border border-slate-200/50 p-3 rounded-xl flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">
                  Total SLA Outage Duration:
                </span>
                <span className="text-xs font-black font-mono text-aku-maroon bg-rose-50 border border-rose-100 px-3 py-1 rounded-lg">
                  {calculateDuration(
                    outageStart || ticket.outageStart || '',
                    outageEnd || ticket.outageEnd || ''
                  )}
                </span>
              </div>
            )}

            {/* Comments Area */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                Resolver Comments &amp; Outage Observations
              </label>
              {isEditable ? (
                <textarea
                  id="modal-comments"
                  rows={2}
                  placeholder="Include any critical handover notes or service observations..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-205 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-aku-maroon transition-all font-sans"
                />
              ) : (
                <p className="text-xs text-slate-800 bg-slate-50 p-3.5 rounded-xl border border-slate-100 italic min-h-[50px]">
                  {ticket.comments || 'No comments left.'}
                </p>
              )}
            </div>

            {errorLocal && (
              <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-150 p-3.5 rounded-xl flex items-center gap-1.5 animate-bounce">
                <AlertTriangle className="w-4 h-4" />
                <span>{errorLocal}</span>
              </div>
            )}

            {/* Action Buttons */}
            {isEditable && (
              <div className="flex justify-end gap-2.5 pt-3.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="modal-submit-btn"
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-black text-white flex items-center gap-1.5 cursor-pointer shadow-md transition-all hover:scale-[1.01]"
                >
                  <Send className="w-3.5 h-3.5 text-white" />
                  <span>Submit Technical Resolution &amp; Close SLA Card</span>
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
