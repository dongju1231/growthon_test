// 메인 진입점: 각 기능 모듈 초기화, 접이식 전체 제어, 리포트 복사

import { createLogger, copyText } from './logger.js';
import { initEnv, permLabel } from './env.js';
import { initVoice } from './voice.js';
import { initLocation } from './location.js';
import { initCamera } from './camera.js';

// 1) 로그 모듈
const logger = createLogger();

// 2) 음성 모듈
const voice = initVoice({
  addLog: logger.addLog,
});

// 3) 접속 환경 & 카메라 상호 참조용 변수
let cameraApi = null;
const env = initEnv({
  addLog: logger.addLog,
  onCameraDenied: () => {
    if (cameraApi) cameraApi.markPermissionDeniedIfIdle();
  },
});

// 4) 위치 모듈 (50m 진입 시 음성 모듈 호출)
const locationApi = initLocation({
  addLog: logger.addLog,
  onEnterRange: (radius) => voice.notifyProximity(radius),
  onPermissionChanged: () => env.refreshPermissions(),
});

// 5) 카메라 모듈
cameraApi = initCamera({
  addLog: logger.addLog,
  getOS: () => env.envSummary.os,
  onPermissionChanged: () => env.refreshPermissions(),
});

// 초기 카메라 권한이 이미 차단 상태라면 배지 반영
if (env.permissions.camera === 'denied') {
  cameraApi.markPermissionDeniedIfIdle();
}

// 접이식 카드 전체 펼치기 / 접기
const btnToggleAll = document.getElementById('btn-toggle-all');
const accordionCards = Array.from(document.querySelectorAll('details.accordion-card'));

function syncToggleAllButton() {
  const allOpen = accordionCards.every((card) => card.open);
  btnToggleAll.textContent = allOpen ? '모두 접기' : '모두 펼치기';
}

btnToggleAll.addEventListener('click', () => {
  const shouldOpen = !accordionCards.every((card) => card.open);
  accordionCards.forEach((card) => {
    card.open = shouldOpen;
  });
  syncToggleAllButton();
});

accordionCards.forEach((card) => card.addEventListener('toggle', syncToggleAllButton));
syncToggleAllButton();

// 전체 테스트 리포트 복사
document.getElementById('btn-copy-log').addEventListener('click', () => {
  const walkCfg = locationApi.getWalkSettings();
  const report = [
    '=== 웹 위치·음성·카메라·업로드 테스트 리포트 ===',
    `OS: ${env.envSummary.os}`,
    `브라우저: ${env.envSummary.browser}`,
    `HTTPS: ${env.envSummary.secureContext}`,
    `권한: 위치=${permLabel(env.permissions.geolocation)}, 카메라=${permLabel(env.permissions.camera)}`,
    `알림 설정: 도보전용=${walkCfg.walkOnly ? 'ON' : 'OFF'}, 구간=${walkCfg.mode === 'walk' ? '도보' : '비도보'}, 속도판별=${walkCfg.speedAutoDetect ? 'ON' : 'OFF'}, 중복방지=${walkCfg.dedupe ? 'ON' : 'OFF'}`,
    `화면: ${env.envSummary.screen}`,
    `UA: ${env.envSummary.userAgent}`,
    '--- 로그 (최신순) ---',
    ...logger.getLogs(),
  ].join('\n');
  copyText(report, '테스트 리포트', logger.addLog);
});

// 페이지 이탈 시 카메라·GPS 리소스 정리
window.addEventListener('pagehide', () => {
  cameraApi.stopCamera(true);
  locationApi.stopGpsWatch(true);
});
