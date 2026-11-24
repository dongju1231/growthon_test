// 접속 환경 진단: OS, 브라우저, HTTPS 여부, API 지원 및 권한 상태

import { setPill, copyText } from './logger.js';

export function permLabel(permState) {
  if (permState === 'granted') return '허용됨';
  if (permState === 'prompt') return '묻기';
  if (permState === 'denied') return '차단됨';
  return '확인 불가';
}

function permBadgeClass(permState) {
  if (permState === 'granted') return 'cap-ok';
  if (permState === 'denied') return 'cap-no';
  return 'cap-warn';
}

function parseUserAgent() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const os = isIOS ? 'iOS' : isAndroid ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : '기타 OS';

  let browser = '기타 브라우저';
  if (/KAKAOTALK/i.test(ua)) browser = '카카오톡 인앱';
  else if (/NAVER\(/i.test(ua)) browser = '네이버 인앱';
  else if (/Instagram|FBAN|FBAV/i.test(ua)) browser = 'SNS 인앱';
  else if (/SamsungBrowser/i.test(ua)) browser = '삼성 인터넷';
  else if (/CriOS/i.test(ua)) browser = 'Chrome (iOS)';
  else if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';

  return {
    os,
    browser,
    protocol: window.location.protocol,
    secureContext: Boolean(window.isSecureContext),
    inApp: /KAKAOTALK|NAVER\(|Instagram|FBAN|FBAV|Line\//i.test(ua),
    screen: `${window.screen.width}x${window.screen.height}`,
    userAgent: ua,
  };
}

export function initEnv({ addLog, onCameraDenied }) {
  const httpsWarning = document.getElementById('https-warning');
  const inappWarning = document.getElementById('inapp-warning');
  const envSummaryPill = document.getElementById('env-summary-pill');
  const envGrid = document.getElementById('env-grid');
  const capabilityBadges = document.getElementById('capability-badges');
  const btnRefreshPerm = document.getElementById('btn-refresh-perm');
  const btnCopyEnv = document.getElementById('btn-copy-env');

  const envSummary = parseUserAgent();
  const permissions = {
    geolocation: 'unknown',
    camera: 'unknown',
  };

  function render() {
    const items = [
      ['OS / 기기', envSummary.os],
      ['브라우저', envSummary.browser],
      ['보안 접속 (HTTPS)', envSummary.secureContext ? '안전 (지원됨)' : '비보안 (HTTP)'],
      ['화면 해상도', `${window.screen.width} × ${window.screen.height}`],
    ];

    envGrid.innerHTML = items
      .map(([k, v]) => `<div class="env-item"><span>${k}</span><strong>${v}</strong></div>`)
      .join('');

    const hasGeo = 'geolocation' in navigator;
    const hasTts = 'speechSynthesis' in window;
    const hasCam = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasVib = typeof navigator.vibrate === 'function';

    const badges = [
      ['위치 권한', permLabel(permissions.geolocation), permBadgeClass(permissions.geolocation)],
      ['카메라 권한', permLabel(permissions.camera), permBadgeClass(permissions.camera)],
      ['Geolocation', hasGeo ? '지원' : '미지원', hasGeo ? 'cap-ok' : 'cap-no'],
      ['TTS', hasTts ? '지원' : '미지원', hasTts ? 'cap-ok' : 'cap-no'],
      ['Camera API', hasCam ? '지원' : '미지원', hasCam ? 'cap-ok' : 'cap-no'],
      ['진동', hasVib ? '지원' : '미지원', hasVib ? 'cap-ok' : 'cap-no'],
    ];

    capabilityBadges.innerHTML = badges
      .map(([name, text, cls]) => `<span class="cap-badge ${cls}">${name}: ${text}</span>`)
      .join('');
  }

  async function refreshPermissions() {
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      for (const name of ['geolocation', 'camera']) {
        try {
          const res = await navigator.permissions.query({ name });
          permissions[name] = res.state;
        } catch (_) {
          permissions[name] = 'unknown';
        }
      }
    }

    if (permissions.camera === 'denied' && onCameraDenied) {
      onCameraDenied();
    }
    render();
  }

  // 초기 상태 표시
  if (!envSummary.secureContext) {
    httpsWarning.classList.remove('hidden');
    setPill(envSummaryPill, 'HTTPS 아님', 'alert');
  } else {
    setPill(envSummaryPill, `${envSummary.os} · ${envSummary.browser}`, 'ok');
  }

  if (envSummary.inApp) {
    inappWarning.classList.remove('hidden');
  }

  btnRefreshPerm.addEventListener('click', () => {
    refreshPermissions().then(() => addLog('권한 상태 새로고침 완료', 'info'));
  });

  btnCopyEnv.addEventListener('click', () => {
    copyText(JSON.stringify({ ...envSummary, permissions }, null, 2), '환경 정보', addLog);
  });

  render();
  refreshPermissions();
  addLog(`접속 환경: ${envSummary.os} / ${envSummary.browser} / Secure=${envSummary.secureContext}`, envSummary.secureContext ? 'ok' : 'warn');

  return {
    envSummary,
    permissions,
    refreshPermissions,
  };
}
