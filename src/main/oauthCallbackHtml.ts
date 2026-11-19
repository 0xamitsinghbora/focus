export interface OAuthCallbackPageOptions {
  status: 'success' | 'error'
  title: string
  message: string
  hint?: string
}

export function renderOAuthCallbackHtml(options: OAuthCallbackPageOptions): string {
  const isSuccess = options.status === 'success'
  const escapedTitle = escapeHtml(options.title)
  const escapedMessage = escapeHtml(options.message)
  const escapedHint = options.hint ? escapeHtml(options.hint) : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle} — Focus</title>
  <style>
    :root {
      --bg: #0a0b0e;
      --card-bg: rgba(18, 20, 28, 0.85);
      --card-border: rgba(255, 255, 255, 0.1);
      --text-main: #f8fafc;
      --text-sub: #94a3b8;
      --text-muted: #64748b;
      --accent-success: #10b981;
      --accent-success-glow: rgba(16, 185, 129, 0.25);
      --accent-error: #ef4444;
      --accent-error-glow: rgba(239, 68, 68, 0.25);
      --chip-bg: rgba(255, 255, 255, 0.05);
      --chip-border: rgba(255, 255, 255, 0.08);
      --btn-bg: #f8fafc;
      --btn-text: #0f172a;
      --btn-hover: #ffffff;
      --progress-bg: rgba(255, 255, 255, 0.08);
    }

    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f3f4f6;
        --card-bg: rgba(255, 255, 255, 0.92);
        --card-border: rgba(0, 0, 0, 0.08);
        --text-main: #0f172a;
        --text-sub: #475569;
        --text-muted: #94a3b8;
        --accent-success: #059669;
        --accent-success-glow: rgba(5, 150, 105, 0.2);
        --accent-error: #dc2626;
        --accent-error-glow: rgba(220, 38, 38, 0.2);
        --chip-bg: rgba(0, 0, 0, 0.03);
        --chip-border: rgba(0, 0, 0, 0.06);
        --btn-bg: #0f172a;
        --btn-text: #ffffff;
        --btn-hover: #1e293b;
        --progress-bg: rgba(0, 0, 0, 0.06);
      }
    }

    * {
      box-reset: border-box;
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overflow-x: hidden;
      position: relative;
    }

    /* Ambient background lighting */
    body::before {
      content: "";
      position: fixed;
      top: -20%;
      left: 50%;
      transform: translateX(-50%);
      width: 700px;
      height: 500px;
      background: radial-gradient(circle, ${isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.12)'} 0%, rgba(0,0,0,0) 70%);
      pointer-events: none;
      z-index: 0;
    }

    .container {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 460px;
    }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid var(--card-border);
      border-radius: 28px;
      padding: 40px 32px 32px;
      box-shadow: 0 20px 48px -12px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.08);
      text-align: center;
      animation: cardAppear 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes cardAppear {
      0% {
        opacity: 0;
        transform: translateY(18px) scale(0.98);
      }
      100% {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    /* Brand Header with Interlinked Logos */
    .brand-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      margin-bottom: 28px;
    }

    .logo-badge {
      width: 64px;
      height: 64px;
      border-radius: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--chip-bg);
      border: 1px solid var(--chip-border);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      transition: transform 0.2s ease;
    }

    .link-connector {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: ${isSuccess ? 'var(--accent-success-glow)' : 'var(--accent-error-glow)'};
      color: ${isSuccess ? 'var(--accent-success)' : 'var(--accent-error)'};
      animation: pulseLink 2.5s infinite ease-in-out;
    }

    @keyframes pulseLink {
      0%, 100% { transform: scale(1); opacity: 0.9; }
      50% { transform: scale(1.08); opacity: 1; }
    }

    /* Status Indicator */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 5px 12px;
      border-radius: 100px;
      background: ${isSuccess ? 'var(--accent-success-glow)' : 'var(--accent-error-glow)'};
      color: ${isSuccess ? 'var(--accent-success)' : 'var(--accent-error)'};
      margin-bottom: 16px;
    }

    .status-badge svg {
      width: 14px;
      height: 14px;
    }

    h1 {
      font-size: 23px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-main);
      margin-bottom: 10px;
      line-height: 1.25;
    }

    p.description {
      font-size: 14px;
      line-height: 1.55;
      color: var(--text-sub);
      margin-bottom: 24px;
    }

    /* Feature Highlights in Success Mode */
    .features-list {
      background: var(--chip-bg);
      border: 1px solid var(--chip-border);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 28px;
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: var(--text-sub);
    }

    .feature-icon {
      color: var(--accent-success);
      display: flex;
      align-items: center;
      justify-content: center;
      shrink-0;
    }

    /* Hint/Alert in Error Mode */
    .hint-box {
      background: var(--chip-bg);
      border: 1px solid var(--chip-border);
      border-left: 3px solid var(--accent-error);
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 24px;
      text-align: left;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--text-sub);
    }

    /* Action Button */
    .action-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 44px;
      padding: 0 20px;
      font-size: 14px;
      font-weight: 600;
      color: var(--btn-text);
      background: var(--btn-bg);
      border: none;
      border-radius: 12px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }

    .action-button:hover {
      background: var(--btn-hover);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
    }

    .action-button:active {
      transform: translateY(0);
    }

    /* Auto Close Progress */
    .auto-close {
      margin-top: 16px;
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .progress-bar-track {
      width: 140px;
      height: 3px;
      background: var(--progress-bg);
      border-radius: 99px;
      overflow: hidden;
    }

    kbd {
      display: inline-block;
      padding: 2px 6px;
      font-size: 11px;
      font-family: inherit;
      font-weight: 600;
      line-height: 1.2;
      color: var(--text-main);
      background-color: var(--chip-bg);
      border: 1px solid var(--chip-border);
      border-radius: 5px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    }

    .progress-bar-fill {
      height: 100%;
      width: 100%;
      background: ${isSuccess ? 'var(--accent-success)' : 'var(--accent-error)'};
      border-radius: 99px;
      animation: countdown 5s linear forwards;
      transform-origin: left;
    }

    @keyframes countdown {
      0% { transform: scaleX(1); }
      100% { transform: scaleX(0); }
    }

    .footer-brand {
      margin-top: 24px;
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <!-- Brand Logos & Bridge -->
      <div class="brand-row">
        <!-- Focus Logo -->
        <div class="logo-badge" title="Focus App">
          <svg viewBox="0 0 512 512" width="40" height="40" fill="none">
            <rect width="512" height="512" rx="105" fill="#12141c"/>
            <rect width="508" height="508" x="2" y="2" rx="103" stroke="rgba(255,255,255,0.12)" stroke-width="4"/>
            <circle cx="256" cy="256" r="213" stroke="#FFFFFF" stroke-width="26" fill="none"/>
            <circle cx="256" cy="256" r="142" stroke="#FFFFFF" stroke-width="4" stroke-opacity="0.4" fill="none"/>
            <circle cx="256" cy="256" r="71" fill="#FFFFFF"/>
          </svg>
        </div>

        <!-- Connector Icon -->
        <div class="link-connector">
          ${
            isSuccess
              ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>`
              : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>`
          }
        </div>

        <!-- Google Drive Logo -->
        <div class="logo-badge" title="Google Drive">
          <svg width="34" height="34" viewBox="0 0 87.3 78">
            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.1c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
            <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
            <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.1z" fill="#ea4335"/>
            <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
            <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
            <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.5c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
          </svg>
        </div>
      </div>

      <!-- Status Pill -->
      <div class="status-badge">
        ${
          isSuccess
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg> Connected`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg> Connection Failed`
        }
      </div>

      <!-- Main Heading & Text -->
      <h1>${escapedTitle}</h1>
      <p class="description">${escapedMessage}</p>

      ${
        isSuccess
          ? `<div class="features-list">
              <div class="feature-item">
                <span class="feature-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
                <span>Focus logs & daily reviews safely backed up</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
                <span>Isolated in your private app data folder</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
                <span>Synced seamlessly across your computers</span>
              </div>
            </div>`
          : escapedHint
            ? `<div class="hint-box"><strong>Note:</strong> ${escapedHint}</div>`
            : ''
      }

      <!-- Primary Action -->
      <button id="closeBtn" class="action-button" onclick="handleClose()">
        ${isSuccess ? 'Return to Focus' : 'Close Tab'}
      </button>

      <!-- Auto Close Notification -->
      <div class="auto-close">
        <span id="countdownText">${
          isSuccess
            ? 'Closing tab in <strong id="seconds">3</strong>s...'
            : 'You can safely close this browser window.'
        }</span>
        ${isSuccess ? '<div class="progress-bar-track"><div class="progress-bar-fill"></div></div>' : ''}
      </div>
    </div>

    <div class="footer-brand">Focus Desktop • HealthOS</div>
  </div>

  <script>
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 || navigator.userAgent.includes('Mac');
    const shortcutHtml = isMac ? '<kbd>⌘</kbd> + <kbd>W</kbd>' : '<kbd>Ctrl</kbd> + <kbd>W</kbd>';

    function attemptClose() {
      try {
        window.open('', '_self', '');
        window.close();
      } catch (e) {}
      try {
        window.close();
      } catch (e) {}
    }

    function handleClose() {
      attemptClose();
      setTimeout(function() {
        var btn = document.getElementById('closeBtn');
        var countdown = document.getElementById('countdownText');
        var track = document.querySelector('.progress-bar-track');
        if (track) track.style.display = 'none';

        if (btn) {
          btn.innerHTML = 'Switch back to Focus App';
          btn.onclick = function() {
            attemptClose();
          };
        }
        if (countdown) {
          countdown.innerHTML = 'Tab close blocked by browser. Press ' + shortcutHtml + ' to close.';
        }
      }, 150);
    }

    ${
      isSuccess
        ? `
      let remaining = 3;
      const countEl = document.getElementById('seconds');
      const timer = setInterval(() => {
        remaining -= 1;
        if (countEl) countEl.textContent = remaining;
        if (remaining <= 0) {
          clearInterval(timer);
          handleClose();
        }
      }, 1000);
    `
        : ''
    }
  </script>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
