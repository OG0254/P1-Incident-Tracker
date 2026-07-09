import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import Keycloak from 'keycloak-js';

// Helper function to format errors in a highly detailed way, preventing empty '{}'
function formatErrorDetails(err: any): string {
  if (!err) return 'No error details provided';
  if (typeof err === 'string') return err;

  const parts: string[] = [];

  if (err.name) {
    parts.push(`[Exception: ${err.name}]`);
  }
  if (err.message) {
    parts.push(`Message: ${err.message}`);
  }

  if (err.error) {
    parts.push(`Keycloak Error: ${err.error}`);
  }
  if (err.error_description) {
    parts.push(`Description: ${err.error_description}`);
  }

  if (err.status) {
    parts.push(`HTTP Status Code: ${err.status}`);
  }
  if (err.statusText) {
    parts.push(`HTTP Status Text: ${err.statusText}`);
  }
  if (err.response) {
    parts.push(
      `HTTP Response: ${typeof err.response === 'object' ? JSON.stringify(err.response) : String(err.response)}`
    );
  }

  try {
    const ownProps = Object.getOwnPropertyNames(err);
    const customProps = ownProps.filter((p) => !['name', 'message', 'stack'].includes(p));
    if (customProps.length > 0) {
      const propDetails = customProps.map((p) => {
        try {
          const val = err[p];
          return `"${p}": ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`;
        } catch (_) {
          return `"${p}": [Unreadable]`;
        }
      });
      parts.push(`Properties: { ${propDetails.join(', ')} }`);
    }
  } catch (_) {}

  if (err.stack) {
    parts.push(`Stack Trace: ${err.stack}`);
  }

  return parts.join(' | ') || JSON.stringify(err) || String(err);
}

// Helper function to check if the Keycloak server itself is reachable on a given URL and Realm
async function checkKeycloakReachable(url: string, realm: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${url}/realms/${realm}/.well-known/openid-configuration`, {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok || response.status === 200;
  } catch (err) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      await fetch(`${url}/realms/${realm}/.well-known/openid-configuration`, {
        method: 'GET',
        mode: 'no-cors',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return true;
    } catch (e) {
      return false;
    }
  }
}

async function initApp() {
  const currentHost = window.location.hostname;

  // Default URL depends on host
  const defaultUrl = ['localhost', '127.0.0.1', '[::1]'].includes(currentHost)
    ? `http://${currentHost}:8080`
    : `http://localhost:8080`;

  // Read saved OIDC parameters from localStorage if custom configured
  const savedConfigStr = localStorage.getItem('p1_keycloak_config');
  let activeConfig = {
    url: defaultUrl,
    realm: 'aku-realm',
    clientId: 'aku-portal',
  };

  if (savedConfigStr) {
    try {
      activeConfig = { ...activeConfig, ...JSON.parse(savedConfigStr) };
    } catch (e) {}
  }

  // Instantly render a high-fidelity loading placeholder to avoid a blank screen during initial OIDC handshake
  const rootElement = document.getElementById('root');
  if (rootElement) {
    createRoot(rootElement).render(
      <StrictMode>
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 font-sans p-6 text-center select-none">
          <div className="space-y-6 max-w-md w-full">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-2 border-amber-500/10 border-t-2 border-t-amber-500 animate-spin"></div>
              <div className="absolute text-lg">🛡️</div>
            </div>
            <div className="space-y-2">
              <h3 className="text-amber-400 font-bold text-sm tracking-tight uppercase tracking-wider">
                OIDC Identity Handshake
              </h3>
              <p className="text-[11px] text-slate-400 leading-normal max-w-xs mx-auto">
                Establishing contact with the Aga Khan Identity Directory at{' '}
                <code className="text-slate-350 font-mono font-semibold">{activeConfig.url}</code>
                ...
              </p>
            </div>
          </div>
        </div>
      </StrictMode>
    );
  }

  console.log(
    `[IDENTITY SYSTEM] Initiating handshake with Keycloak at: ${activeConfig.url}, Realm: ${activeConfig.realm}`
  );

  const keycloakConfig = {
    url: activeConfig.url,
    realm: activeConfig.realm,
    clientId: activeConfig.clientId,
  };

  let keycloak = new Keycloak(keycloakConfig);
  const storedToken = localStorage.getItem('p1_auth_token');
  const storedRefreshToken = localStorage.getItem('p1_refresh_token');

  // Check if we are handling an OIDC redirect callback with auth parameters in the URL
  const hasOidcParams =
    window.location.search.includes('code=') ||
    window.location.search.includes('state=') ||
    window.location.hash.includes('code=') ||
    window.location.hash.includes('state=');

  const initOptions: any = {
    checkLoginIframe: false, // Avoid iframe third-party cookies issues in development browsers
    pkceMethod: 'S256',
  };

  // If returning from an OIDC redirect, do NOT pass stale stored tokens so Keycloak can parse code and state
  if (storedToken && !hasOidcParams) {
    initOptions.token = storedToken;
  }
  if (storedRefreshToken && !hasOidcParams) {
    initOptions.refreshToken = storedRefreshToken;
  }

  // Define success and failure handlers to make clean/stale token transitions robust
  function handleSuccess(auth: boolean, activeKeycloak: Keycloak) {
    if (auth && activeKeycloak.token) {
      // Save tokens for apiClient header injection and token renewal
      localStorage.setItem('p1_auth_token', activeKeycloak.token);
      localStorage.setItem('p1_refresh_token', activeKeycloak.refreshToken || '');

      // Save active Keycloak config parameters so backend can align
      localStorage.setItem('p1_active_keycloak_url', activeConfig.url);
      localStorage.setItem('p1_active_keycloak_realm', activeConfig.realm);
      localStorage.setItem('p1_active_keycloak_client', activeConfig.clientId);

      // Set up automatic token-refresh in the background
      setInterval(() => {
        activeKeycloak
          .updateToken(70)
          .then((refreshed) => {
            if (refreshed) {
              localStorage.setItem('p1_auth_token', activeKeycloak.token || '');
              localStorage.setItem('p1_refresh_token', activeKeycloak.refreshToken || '');
            }
          })
          .catch(() => {
            console.error(
              'Failed to refresh Keycloak OIDC token. Session might have expired or been revoked.'
            );
            // Immediately terminate local session if Keycloak session was revoked (e.g. password changed)
            localStorage.removeItem('p1_auth_token');
            localStorage.removeItem('p1_refresh_token');
            window.location.reload();
          });
      }, 60000); // Check expiry every minute
    } else if (storedToken || storedRefreshToken) {
      // Stored token is invalid or expired
      localStorage.removeItem('p1_auth_token');
      localStorage.removeItem('p1_refresh_token');
    }

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App keycloak={activeKeycloak} />
      </StrictMode>
    );
  }

  async function handleFailure(err: any) {
    console.error('Keycloak initialization failed permanently:', err);

    // Perform live connection check to determine if the server is offline or if it's a configuration mismatch
    const isReachable = await checkKeycloakReachable(activeConfig.url, activeConfig.realm);

    // Format the error trace with deep diagnostic details
    const formattedError = formatErrorDetails(err);

    // Render diagnostic and configuration console
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-100 font-sans p-6 text-center">
          <div className="space-y-6 max-w-2xl w-full text-left">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 text-xl flex-shrink-0 animate-pulse">
                ⚙️
              </div>
              <div>
                <h2 className="text-amber-400 font-extrabold text-lg tracking-tight">
                  Keycloak OIDC Integration Diagnostics
                </h2>
                <p className="text-xs text-slate-400 leading-normal">
                  Configure and verify your local Keycloak directory identity connection parameters.
                </p>
              </div>
            </div>

            {/* Diagnostics Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Keycloak Server Status
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${isReachable ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}
                  />
                  <span
                    className={`text-xs font-bold ${isReachable ? 'text-emerald-400' : 'text-rose-400'}`}
                  >
                    {isReachable ? 'Online & Reachable' : 'Offline / Unreachable'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-555 truncate">Target: {activeConfig.url}</p>
              </div>

              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Handshake Outcome
                </span>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-xs font-bold text-rose-400">Handshake Failed</span>
                </div>
                <div className="text-[10px] text-slate-300 font-mono break-all whitespace-pre-wrap select-text max-h-40 overflow-y-auto bg-slate-950 p-2.5 rounded border border-slate-800/80 mt-1">
                  {formattedError}
                </div>
              </div>
            </div>

            {/* Note about initialization delay */}
            {!isReachable && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs rounded-xl p-4 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-[11px]">
                  ⏳ First Boot Warning: Keycloak Initialization in Progress
                </p>
                <p className="text-slate-400 text-[10.5px] leading-relaxed">
                  Keycloak is a heavyweight Java system. After running{' '}
                  <code className="text-amber-200 font-mono">docker compose up</code>, Keycloak
                  requires around <strong>30 to 45 seconds</strong> to spin up its JVM, complete
                  database migrations on Postgres, and import the{' '}
                  <code className="text-amber-200 font-mono">aku-realm.json</code> configuration.
                  Please wait half a minute and try clicking{' '}
                  <strong>Save Config & Retry Handshake</strong>.
                </p>
              </div>
            )}

            {/* Connection Parameters Configuration Form */}
            <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 space-y-4">
              <span className="font-extrabold text-slate-200 block border-b border-slate-850 pb-2 uppercase tracking-wider text-[10px]">
                🔧 Configure Connection Parameters
              </span>

              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Keycloak Base URL
                  </label>
                  <input
                    id="diag-url"
                    type="text"
                    defaultValue={activeConfig.url}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-all"
                    placeholder="http://localhost:8080"
                  />
                  <span className="text-[9.5px] text-slate-500 mt-1 block">
                    The public endpoint of your local Keycloak directory server.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Realm Name
                    </label>
                    <input
                      id="diag-realm"
                      type="text"
                      defaultValue={activeConfig.realm}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-all"
                      placeholder="aku-realm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Client ID
                    </label>
                    <input
                      id="diag-client"
                      type="text"
                      defaultValue={activeConfig.clientId}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-all"
                      placeholder="aku-portal"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={() => {
                    const url = (
                      document.getElementById('diag-url') as HTMLInputElement
                    ).value.trim();
                    const realm = (
                      document.getElementById('diag-realm') as HTMLInputElement
                    ).value.trim();
                    const clientId = (
                      document.getElementById('diag-client') as HTMLInputElement
                    ).value.trim();

                    if (url && realm && clientId) {
                      localStorage.setItem(
                        'p1_keycloak_config',
                        JSON.stringify({ url, realm, clientId })
                      );
                      window.location.reload();
                    }
                  }}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer text-center shadow-md shadow-amber-950/20"
                >
                  💾 Save Config & Retry Handshake
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem('p1_keycloak_config');
                    window.location.reload();
                  }}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                >
                  🔄 Reset to Defaults
                </button>
              </div>
            </div>

            {/* Troubleshooting & Guide Checklist */}
            <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800 text-slate-400 text-xs space-y-3.5 leading-relaxed">
              <div>
                <span className="font-bold text-slate-200 block border-b border-slate-800 pb-1.5 uppercase tracking-wider text-[10px]">
                  💡 Quick Client Configuration Reference (Keycloak Admin Console)
                </span>
                <p className="text-[11px] mt-1.5">
                  Verify the following settings in your Keycloak Client{' '}
                  <strong className="text-slate-300">aku-portal</strong>:
                </p>
                <ul className="list-disc pl-4 mt-1.5 space-y-1.5 text-slate-350 text-[11px]">
                  <li>
                    <strong className="text-slate-250">Client ID:</strong> Must be exactly{' '}
                    <code className="text-emerald-400 font-mono">aku-portal</code>
                  </li>
                  <li>
                    <strong className="text-slate-250">Client Protocol:</strong>{' '}
                    <code className="text-emerald-400 font-mono">openid-connect</code>
                  </li>
                  <li>
                    <strong className="text-slate-250">Client Authentication:</strong> Toggle to{' '}
                    <span className="text-amber-400">OFF</span> (Public Client)
                  </li>
                  <li>
                    <strong className="text-slate-250">Standard Flow:</strong> Toggle to{' '}
                    <span className="text-emerald-400">ON</span>
                  </li>
                  <li>
                    <strong className="text-slate-250">Direct Access Grants Enabled:</strong> Toggle
                    to <span className="text-emerald-400">ON</span>
                  </li>
                  <li>
                    <strong className="text-slate-250">Valid Redirect URIs:</strong> Enter{' '}
                    <code className="text-emerald-400 font-mono">http://localhost:3000/*</code> and{' '}
                    <code className="text-emerald-400 font-mono">http://127.0.0.1:3000/*</code>{' '}
                    (Ensure absolutely NO spaces)
                  </li>
                  <li>
                    <strong className="text-slate-250">Web Origins:</strong> Enter{' '}
                    <code className="text-emerald-400 font-mono">*</code> or your specific domain
                    origin
                  </li>
                </ul>
              </div>

              <div>
                <span className="font-bold text-slate-200 block border-b border-slate-800 pb-1.5 uppercase tracking-wider text-[10px]">
                  🐳 Docker Compose Status Checks
                </span>
                <p className="text-[11px] mt-1.5">
                  If Keycloak status is <span className="text-rose-400 font-bold">Offline</span>,
                  verify your local docker containers are healthy:
                </p>
                <code className="block mt-1.5 bg-slate-950 px-2.5 py-1.5 rounded text-[10px] border border-slate-850 text-emerald-400 font-mono">
                  docker compose down
                  <br />
                  docker compose up -d --build
                </code>
              </div>
            </div>
          </div>
        </div>
      </StrictMode>
    );
  }

  // Attempt OIDC Handshake initialization
  try {
    const auth = await keycloak.init(initOptions);
    handleSuccess(auth, keycloak);
  } catch (err) {
    console.warn('[IDENTITY SYSTEM] Keycloak initialization failed on first attempt:', err);

    // If we had stored tokens, they might have expired, been revoked, or Keycloak was restarted.
    // Clear them from localStorage and attempt a clean initialization immediately.
    if (storedToken || storedRefreshToken) {
      console.log(
        '[IDENTITY SYSTEM] Stale session tokens detected. Clearing credentials from local cache and retrying handshake...'
      );
      localStorage.removeItem('p1_auth_token');
      localStorage.removeItem('p1_refresh_token');

      try {
        const retryKeycloak = new Keycloak(keycloakConfig);
        const retryAuth = await retryKeycloak.init({
          checkLoginIframe: false,
          pkceMethod: 'S256',
        });
        handleSuccess(retryAuth, retryKeycloak);
      } catch (retryErr) {
        // Both initialization attempts failed. Render diagnostic screen.
        await handleFailure(retryErr);
      }
    } else {
      // Handshake failed without any prior tokens. Render diagnostics directly.
      await handleFailure(err);
    }
  }
}

initApp();
