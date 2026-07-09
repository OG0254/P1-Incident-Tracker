/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LogOut, HeartPulse } from 'lucide-react';
import { RosterUser } from '../types';

interface IdentityHeaderProps {
  activeUser: RosterUser | null;
  onLogOut?: () => void;
}

/**
 * IdentityHeader Component
 * Displays the logged staff's authenticated corporate identity from Keycloak OIDC.
 * No switching or simulation is allowed.
 */
export const IdentityHeader: React.FC<IdentityHeaderProps> = ({ activeUser, onLogOut }) => {
  if (!activeUser) return null;

  return (
    <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-950 text-white border-b border-emerald-950 py-3 px-4 sticky top-0 z-50 shadow-md select-none">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Active directory staff profile information */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center p-2 bg-white/10 text-white rounded-xl border border-white/5 shadow-inner">
            <HeartPulse className="w-5 h-5 text-emerald-300 animate-pulse" />
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-wider text-emerald-150 font-bold uppercase flex items-center gap-1.5">
              <span>Aga Khan University Hospital</span>
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
            </div>
            <div className="text-xs font-semibold flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
              <span className="text-emerald-100">Staff Active Session:</span>
              <span className="text-amber-300 font-extrabold flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-lg border border-white/5">
                {activeUser.cn}{' '}
                {!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  activeUser.samAccountName
                ) && `(${activeUser.samAccountName})`}
              </span>
              <span className="text-emerald-50 font-normal">
                authenticated as{' '}
                <span className="font-bold underline">
                  {activeUser.role === 'Service Desk'
                    ? 'Service Desk Admin'
                    : activeUser.supportGroup}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Right: SSO Log Out */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          {onLogOut && (
            <button
              id="corporate-logout-btn"
              onClick={onLogOut}
              className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 border border-rose-600 rounded-xl text-xs font-bold flex items-center gap-1.5 text-white cursor-pointer shadow-sm transition-all hover:scale-[1.02]"
            >
              <LogOut className="w-3.5 h-3.5 text-white" />
              <span>Log Out</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
