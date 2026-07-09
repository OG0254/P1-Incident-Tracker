/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { PlusCircle, Info, Calendar, Link2, CaseSensitive, Users2, ShieldAlert } from 'lucide-react';
import { SupportGroup, SUPPORT_GROUPS, P1Ticket } from '../types';

interface TicketFormProps {
  onAddTicket: (ticket: Omit<P1Ticket, 'id' | 'status'>) => void;
  supportGroups?: string[];
}

export const TicketForm: React.FC<TicketFormProps> = ({ onAddTicket, supportGroups }) => {
  const groupsList = supportGroups && supportGroups.length > 0 ? supportGroups : SUPPORT_GROUPS;

  const [jiraId, setJiraId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [supportGroup, setSupportGroup] = useState<SupportGroup>(groupsList[0]);

  React.useEffect(() => {
    const list = supportGroups && supportGroups.length > 0 ? supportGroups : SUPPORT_GROUPS;
    if (list.length > 0 && !list.includes(supportGroup)) {
      setSupportGroup(list[0]);
    }
  }, [supportGroups]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    // Validations
    if (!jiraId.trim()) {
      setErrorMessage('Please enter a valid Jira Ticket ID.');
      return;
    }
    if (!title.trim()) {
      setErrorMessage('Please enter an Incident Title.');
      return;
    }
    if (!date) {
      setErrorMessage('Please select the incident Date.');
      return;
    }

    // Standardize Jira ID format (e.g. remove hashes/whitespace, uppercase)
    const formattedJiraId = jiraId.trim().toUpperCase();

    onAddTicket({
      jiraId: formattedJiraId,
      title: title.trim(),
      date,
      supportGroup,
    });

    // Reset inputs
    setJiraId('');
    setTitle('');
    setSuccessMessage(`Ticket ${formattedJiraId} successfully added in "Pending Resolution Details" state!`);

    // Clear success message after 5 seconds
    setTimeout(() => {
      setSuccessMessage('');
    }, 5000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 animate-fadeIn">
      
      {/* Title & Info Banner */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-aku-green" />
          Create New P1 Incident Record
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Add the newly created Jira ticket details here to request outage reporting and resolution description from the assigned support group.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Error / Success Feedback */}
        {errorMessage && (
          <div className="bg-aku-maroon-light text-aku-maroon-dark p-3 rounded-xl border border-aku-maroon-light rounded-xl text-xs font-semibold flex items-center gap-2 animate-pulse">
            <Info className="w-4 h-4 flex-shrink-0 text-aku-maroon" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="bg-emerald-50 text-emerald-850 p-3 rounded-xl border border-emerald-100 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
            <Info className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Date Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Incident Date <span className="text-red-500">*</span>
            </label>
            <input
              id="ticket-form-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-aku-green/55 focus:border-aku-green transition-all font-sans"
              required
            />
          </div>

          {/* Jira Ticket ID */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
              <Link2 className="w-3.5 h-3.5 text-slate-400" />
              Jira Ticket ID <span className="text-red-500">*</span>
            </label>
            <input
              id="ticket-form-jira"
              type="text"
              placeholder="e.g. INC-40291"
              value={jiraId}
              onChange={(e) => setJiraId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-aku-green/55 focus:border-aku-green transition-all font-mono"
              required
            />
          </div>

        </div>

        {/* Incident Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
            <CaseSensitive className="w-3.5 h-3.5 text-slate-400" />
            Incident Title <span className="text-red-500">*</span>
          </label>
          <input
            id="ticket-form-title"
            type="text"
            placeholder="e.g. Core EHR Database Storage Volume Exhaustion"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-aku-green/55 focus:border-aku-green transition-all"
            required
          />
        </div>

        {/* Support Group Dropdown */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
            <Users2 className="w-3.5 h-3.5 text-slate-400" />
            Assigned Support Group <span className="text-red-500">*</span>
          </label>
          <select
            id="ticket-form-group"
            value={supportGroup}
            onChange={(e) => setSupportGroup(e.target.value as SupportGroup)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-aku-green/55 focus:border-aku-green transition-all hover:bg-slate-100 cursor-pointer"
          >
            {groupsList.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </div>

        {/* Submit button */}
        <div className="pt-2">
          <button
            id="ticket-form-submit"
            type="submit"
            className="w-full bg-aku-green text-white font-semibold text-sm py-2.5 px-4 rounded-xl hover:bg-aku-green-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-aku-green transition-all cursor-pointer flex items-center justify-center gap-2 shadow"
          >
            <PlusCircle className="w-4 h-4" />
            Add To Verification Queue
          </button>
        </div>

      </form>

    </div>
  );
};
