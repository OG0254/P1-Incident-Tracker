/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  HeartPulse,
  User,
  Lock,
  Users,
  ArrowLeft,
  RefreshCw,
  Key,
  Eye,
  EyeOff,
} from 'lucide-react';
import { SUPPORT_GROUPS, SupportGroup, UserRole } from '../types';
import { apiClient } from '../utils/api';

interface LoginProps {
  keycloak?: any;
  onLoginSuccess: (token: string, refreshToken: string, user: any) => void;
}

export const Login: React.FC<LoginProps> = ({ keycloak, onLoginSuccess }) => {
  const [view, setView] = useState<'login' | 'request-access'>('login');

  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Request Access State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [reqUsername, setReqUsername] = useState('');
  const [proposedRole, setProposedRole] = useState<UserRole>('Support Group User');
  const [proposedGroup, setProposedGroup] = useState<SupportGroup>('');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Dynamic groups list from Keycloak
  const [supportGroupsList, setSupportGroupsList] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const fetchGroups = async () => {
      try {
        const groups = await apiClient.getGroups();
        if (active && groups && groups.length > 0) {
          setSupportGroupsList(groups);
          setProposedGroup(groups[0]);
        }
      } catch (e) {
        console.error('Failed to fetch dynamic groups in login', e);
      }
    };
    fetchGroups();
    return () => {
      active = false;
    };
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setLoginError('Please enter both username/email and password.');
      return;
    }

    setLoginError(null);
    setRequirePasswordChange(false);
    setIsLoggingIn(true);

    try {
      const response = await apiClient.login(username.trim(), password);
      onLoginSuccess(response.token, response.refreshToken, response.user);
    } catch (err: any) {
      setLoginError(
        err.message || 'Authentication failed. Please verify your AKU single sign-on credentials.'
      );
      if (err.requirePasswordChange) {
        setRequirePasswordChange(true);
        const isIframe = window.self !== window.top;
        if (!isIframe) {
          // Automatically redirect to Keycloak update password flow using the adapter after 1.5 seconds only if not in iframe
          setTimeout(() => {
            if (keycloak) {
              keycloak.login({ loginHint: username.trim() });
            }
          }, 1500);
        }
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRequestAccessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !reqUsername.trim()) {
      setRequestError('Please fill out all fields.');
      return;
    }

    if (!email.toLowerCase().endsWith('@aku.edu')) {
      setRequestError(
        'Access requests are restricted to the authorized corporate domain (@aku.edu).'
      );
      return;
    }

    setRequestError(null);
    setRequestSuccess(null);
    setIsSubmittingRequest(true);

    try {
      const response = await apiClient.fileSignup({
        fullName: fullName.trim(),
        email: email.trim(),
        username: reqUsername.trim(),
        proposedRole,
        proposedGroup,
      });
      setRequestSuccess(response.message || 'Access request logged successfully.');
      // Reset form
      setFullName('');
      setEmail('');
      setReqUsername('');
    } catch (err: any) {
      setRequestError(err.message || 'Failed to submit access request.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 md:p-8 select-none font-sans">
      <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl shadow-xl overflow-hidden transition-all duration-300">
        {/* Decorative Top Branding Bar */}
        <div className="h-2 bg-gradient-to-r from-aku-green-dark via-aku-green to-aku-gold" />

        <div className="p-8 sm:p-10 space-y-8">
          {/* Header Area */}
          <div className="text-center space-y-3">
            <div className="mx-auto w-14 h-14 bg-emerald-50 text-aku-green rounded-2xl flex items-center justify-center border border-emerald-100 shadow-sm">
              <HeartPulse className="w-7 h-7 text-aku-green animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                AKU P1 Incident Tracker
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Aga Khan University Hospital • Secure Single Sign-On
              </p>
            </div>
          </div>

          {view === 'login' ? (
            /* LOGIN VIEW */
            <form onSubmit={handleLoginSubmit} className="space-y-6">
              {loginError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-3.5 leading-relaxed font-medium">
                  {loginError}
                </div>
              )}

              <div className="space-y-4">
                {/* Username Input */}
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                    Staff Email / Username
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      id="login-username"
                      type="text"
                      required
                      disabled={isLoggingIn}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. owen.ryan@aku.edu"
                      className="w-full bg-slate-50 border border-slate-200/80 focus:border-aku-green focus:bg-white focus:outline-none rounded-xl pl-10 pr-4 py-3 text-xs text-slate-800 font-medium transition-all"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                    Directory Password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      disabled={isLoggingIn}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-slate-50 border border-slate-200/80 focus:border-aku-green focus:bg-white focus:outline-none rounded-xl pl-10 pr-10 py-3 text-xs text-slate-800 font-medium transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {requirePasswordChange && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 text-[11px] leading-relaxed font-semibold space-y-2.5 animate-fadeIn">
                  <p>
                    {window.self !== window.top
                      ? 'A secure password update is required on your Aga Khan single sign-on profile. Since you are in a preview iframe, please click the button below to complete this setup in a secure new tab:'
                      : 'A password update action is pending on your Aga Khan single sign-on profile. You can transition immediately to standard Keycloak settings page to set up a permanent password:'}
                  </p>
                  {window.self !== window.top ? (
                    <a
                      href={
                        keycloak ? keycloak.createLoginUrl({ loginHint: username.trim() }) : '#'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-amber-600 hover:bg-amber-500 text-white rounded-xl py-2 text-[10.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-amber-900/15 text-center block"
                    >
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Configure Secure Password in New Tab</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (keycloak) {
                          keycloak.login({ loginHint: username.trim() });
                        }
                      }}
                      className="w-full bg-amber-600 hover:bg-amber-500 text-white rounded-xl py-2 text-[10.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-amber-900/15"
                    >
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Go to Keycloak Password Update Now</span>
                    </button>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-aku-green hover:bg-aku-green-dark text-white rounded-xl py-3 text-xs font-bold transition-all shadow-md shadow-emerald-950/10 hover:shadow-lg hover:shadow-emerald-900/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {isLoggingIn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign In via AKU Identity</span>
                  </>
                )}
              </button>

              {/* Request Access Button */}
              <button
                type="button"
                onClick={() => {
                  setView('request-access');
                  setRequestError(null);
                  setRequestSuccess(null);
                }}
                className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-xl py-3 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Users className="w-4 h-4 text-slate-500" />
                <span>Request Access Credentials</span>
              </button>

              {/* Password Policy Info */}
              <div className="text-[10px] text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-200/50 text-center leading-normal">
                Credentials are validated in real-time through{' '}
                <strong>AKU Single Sign-On (Keycloak)</strong>. Passwords are never cached or stored
                locally.
              </div>
            </form>
          ) : (
            /* REQUEST ACCESS VIEW */
            <form onSubmit={handleRequestAccessSubmit} className="space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <button
                  type="button"
                  onClick={() => setView('login')}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">Access Request Form</h2>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Log details to the Service Desk notification queue
                  </p>
                </div>
              </div>

              {requestError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-3 font-medium">
                  {requestError}
                </div>
              )}

              {requestSuccess ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-850 text-xs rounded-xl p-4 leading-relaxed font-medium space-y-2">
                    <p className="font-bold flex items-center gap-1.5 text-emerald-900 text-xs">
                      🎉 Request Logged Successfully
                    </p>
                    <p className="text-[11px] text-emerald-800 leading-normal">{requestSuccess}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setView('login')}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer"
                  >
                    Return to Login
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Full Name */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      disabled={isSubmittingRequest}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Brian Ogada"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-aku-green focus:outline-none rounded-xl px-3.5 py-2 text-xs text-slate-800 font-medium transition-all"
                    />
                  </div>

                  {/* Email address */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Corporate Email (@aku.edu)
                    </label>
                    <input
                      type="email"
                      required
                      disabled={isSubmittingRequest}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. brian.ogada@aku.edu"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-aku-green focus:outline-none rounded-xl px-3.5 py-2 text-xs text-slate-800 font-medium transition-all"
                    />
                  </div>

                  {/* Proposed Username */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Requested Username
                    </label>
                    <input
                      type="text"
                      required
                      disabled={isSubmittingRequest}
                      value={reqUsername}
                      onChange={(e) => setReqUsername(e.target.value)}
                      placeholder="e.g. bogada"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-aku-green focus:outline-none rounded-xl px-3.5 py-2 text-xs text-slate-800 font-medium transition-all font-mono"
                    />
                  </div>

                  {/* Proposed Role */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Proposed Operational Role
                    </label>
                    <select
                      value={proposedRole}
                      disabled={isSubmittingRequest}
                      onChange={(e) => setProposedRole(e.target.value as UserRole)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-aku-green focus:outline-none rounded-xl px-3 py-2 text-xs text-slate-800 font-bold transition-all cursor-pointer"
                    >
                      <option value="Support Group User">Support Group Resolver User</option>
                      <option value="Service Desk">Service Desk Owner (Admin)</option>
                    </select>
                  </div>

                  {/* Proposed Group */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Assigned Resolver / Support Group
                    </label>
                    <select
                      value={proposedGroup}
                      disabled={isSubmittingRequest}
                      onChange={(e) => setProposedGroup(e.target.value as SupportGroup)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-aku-green focus:outline-none rounded-xl px-3 py-2 text-xs text-slate-800 font-bold transition-all cursor-pointer max-w-full truncate"
                    >
                      {(supportGroupsList.length > 0 ? supportGroupsList : SUPPORT_GROUPS).map(
                        (group) => (
                          <option key={group} value={group}>
                            {group}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmittingRequest}
                    className="w-full bg-aku-green hover:bg-aku-green-dark text-white rounded-xl py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
                  >
                    {isSubmittingRequest ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Logging Request...</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-4 h-4" />
                        <span>Submit Access Request</span>
                      </>
                    )}
                  </button>

                  <p className="text-[9.5px] text-slate-400 text-center leading-normal">
                    This request only notifies the Service Desk. Brian Ogada must manually review
                    and create your account directly inside Keycloak before you can log in.
                  </p>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Corporate Disclaimer Footer */}
        <div className="bg-slate-50 border-t border-slate-100 p-6 text-center text-[10px] text-slate-400 font-semibold leading-normal">
          © 2026 Aga Khan University Hospital. ICT Core Enterprise Group. Authorized Access Only.
        </div>
      </div>
    </div>
  );
};
