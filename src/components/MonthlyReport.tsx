/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Calendar, 
  Download, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  FileText,
  BadgeAlert
} from 'lucide-react';
import { P1Ticket } from '../types';

interface MonthlyReportProps {
  tickets: P1Ticket[];
}

export const MonthlyReport: React.FC<MonthlyReportProps> = ({ tickets }) => {
  // Extract all available months from ticket data dynamically, e.g. "2026-06"
  const getAvailableMonths = () => {
    const list = new Set<string>();
    tickets.forEach(t => {
      if (t.date && t.date.length >= 7) {
        list.add(t.date.substring(0, 7)); // Takes YYYY-MM
      }
    });
    
    // Always include current month and previous month as defaults if not present
    list.add('2026-06');
    list.add('2026-05');
    
    return Array.from(list).sort().reverse(); // Newest first
  };

  const months = getAvailableMonths();
  const [selectedMonth, setSelectedMonth] = useState<string>(months[0] || '2026-06');

  // Filter tickets belonging to the selected YYYY-MM
  const monthTickets = tickets.filter(t => t.date && t.date.startsWith(selectedMonth));

  // Stats inside this reporting window
  const totalInMonth = monthTickets.length;
  const completedInMonth = monthTickets.filter(t => t.status === 'Completed').length;
  const pendingInMonth = totalInMonth - completedInMonth;

  // Nice human readable month label formatter, e.g., "2026-06" -> "June 2026"
  const formatMonthLabel = (yearMonth: string) => {
    const parts = yearMonth.split('-');
    if (parts.length !== 2) return yearMonth;
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${monthNames[monthIndex] || parts[1]} ${year}`;
  };

  // CSV Generator for Excel compatibility
  const handleExportToCSV = () => {
    if (monthTickets.length === 0) return;

    const headers = [
      'Incident Date',
      'Jira Ticket ID',
      'Incident Title',
      'Support Group',
      'Status',
      'Resolution Description',
      'Outage Start Date/Time',
      'Outage End Date/Time',
      'Outage Duration (Minutes)',
      'Additional Comments'
    ];

    const cleanCell = (val?: string) => {
      if (!val) return '""';
      // Double the double quotes for CSV escape conformity and wrap in double quotes
      const escaped = val.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    // Calculate duration in minutes for spreadsheet calculations
    const calculateMinutes = (start?: string, end?: string): string => {
      if (!start || !end) return '';
      const s = new Date(start);
      const e = new Date(end);
      const diffMs = e.getTime() - s.getTime();
      if (isNaN(diffMs) || diffMs < 0) return '';
      return Math.floor(diffMs / 60000).toString();
    };

    const csvRows = [
      headers.join(','), // Header row
      ...monthTickets.map(t => {
        return [
          cleanCell(t.date),
          cleanCell(t.jiraId),
          cleanCell(t.title),
          cleanCell(t.supportGroup),
          cleanCell(t.status),
          cleanCell(t.resolutionDescription),
          cleanCell(t.outageStart ? new Date(t.outageStart).toLocaleString() : ''),
          cleanCell(t.outageEnd ? new Date(t.outageEnd).toLocaleString() : ''),
          cleanCell(calculateMinutes(t.outageStart, t.outageEnd)),
          cleanCell(t.comments)
        ].join(',');
      })
    ];

    const csvContent = '\uFEFF' + csvRows.join('\n'); // Adding UTF-8 BOM for Excel matching compatibility
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.id = 'report-download-anchor';
    link.setAttribute('href', url);
    link.setAttribute('download', `P1_Monthly_Incident_Report_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Selector & Actions */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 font-sans">
        
        <div className="flex items-center gap-3">
          <div className="p-3 bg-aku-green-light rounded-xl text-aku-green border border-aku-green-light">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Generate Monthly Report</h3>
            <p className="text-xs text-slate-500">
              Select any billing/maintenance month to compile the standard P1 verify list.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-stretch md:self-auto">
          {/* Month selector dropdown */}
          <select
            id="report-month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-50 border border-slate-205 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-aku-green/55 cursor-pointer min-w-[160px]"
          >
            {months.map(m => (
              <option key={m} value={m}>{formatMonthLabel(m)}</option>
            ))}
          </select>

          {/* Export button */}
          <button
            id="report-export-excel-btn"
            onClick={handleExportToCSV}
            disabled={monthTickets.length === 0}
            className="bg-aku-green hover:bg-aku-green-dark text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>Export to Excel (CSV)</span>
          </button>
        </div>

      </div>

      {/* Warning if there is any pending record inside the report month */}
      {pendingInMonth > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h5 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
              {pendingInMonth} Ticket{pendingInMonth > 1 ? 's are' : ' is'} still awaiting support group details
            </h5>
            <p className="text-xs text-amber-805 leading-relaxed">
              Exporting now is fully supported, but the report will contain blank resolution and outage duration fields for the pending tickets. We recommend reaching out to those groups first inside the dashboard.
            </p>
          </div>
        </div>
      )}

      {/* Report Table Display */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
            Report Records: {formatMonthLabel(selectedMonth)} ({totalInMonth} Total)
          </span>
          <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
            {completedInMonth} Complete
          </span>
        </div>

        {monthTickets.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center">
            <FileText className="w-10 h-10 text-slate-300 mb-2" />
            <h4 className="text-xs font-semibold text-slate-500">No P1 Incidents recorded in {formatMonthLabel(selectedMonth)}</h4>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              
              {/* Table Head */}
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 font-mono">Ticket ID</th>
                  <th className="py-3 px-4">Incident Title</th>
                  <th className="py-3 px-4">Support Group</th>
                  <th className="py-3 px-4">Resolution Description</th>
                  <th className="py-3 px-4">Outage Start</th>
                  <th className="py-3 px-4">Outage End</th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {monthTickets.map(t => {
                  const isPending = t.status === 'Pending Resolution Details';

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-medium whitespace-nowrap">{t.date}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">{t.jiraId}</td>
                      <td className="py-3.5 px-4 font-semibold max-w-[200px] truncate" title={t.title}>
                        {t.title}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 font-medium whitespace-nowrap">{t.supportGroup}</td>
                      
                      {/* Resolution description column */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {isPending ? (
                          <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-medium border border-amber-100 text-[10px] uppercase">
                            Pending Response
                          </span>
                        ) : (
                          <p className="line-clamp-2 italic" title={t.resolutionDescription}>
                            {t.resolutionDescription}
                          </p>
                        )}
                      </td>

                      {/* Start Timestamp */}
                      <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                        {isPending || !t.outageStart ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          new Date(t.outageStart).toLocaleString()
                        )}
                      </td>

                      {/* End Timestamp */}
                      <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                        {isPending || !t.outageEnd ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          new Date(t.outageEnd).toLocaleString()
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}

      </div>

    </div>
  );
};
