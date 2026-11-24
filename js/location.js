// 1. 위치 확인: 실시간 GPS 추적, 50m 거리 계산(Haversine), 도보 구간 전용 필터, 중복 알림 방지, 실내 시뮬레이션

import { nowTime, setPill } from './logger.js';

const WALK_MAX_SPEED_MPS = 2.5; // 9.0 km/h (도보 최대 속도 기준)

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function initLocation({ addLog, onEnterRange, onPermissionChanged }) {
  const gpsStatusPill = document.getElementById('gps-status-pill');
  const btnStartGps = document.getElementById('btn-start-gps');
  const btnStopGps = document.getElementById('btn-stop-gps');
  const btnSingleGps = document.getElementById('btn-single-gps');
  const valLat = document.getElementById('val-lat');
  const valLng = document.getElementById('val-lng');
  const valAccuracy = document.getElementById('val-accuracy');
  const valSpeed = document.getElementById('val-speed');
  const valUpdated = document.getElementById('val-updated');
  const accuracyWarning = document.getElementById('accuracy-warning');

  const btnTargetHere = document.getElementById('btn-target-here');
  const btnTarget70m = document.getElementById('btn-target-70m');
  const btnTarget30m = document.getElementById('btn-target-30m');
  const inputTargetLat = document.getElementById('input-target-lat');
  const inputTargetLng = document.getElementById('input-target-lng');
  const inputRadius = document.getElementById('input-radius');
  const distancePanel = document.getElementById('distance-panel');
  const proximityPill = document.getElementById('proximity-pill');
  const valDistance = document.getElementById('val-distance');
  const distanceBar = document.getElementById('distance-bar');
  const chkDedupe = document.getElementById('chk-dedupe');
  const chkWalkOnly = document.getElementById('chk-walk-only');
  const chkSpeedWalk = document.getElementById('chk-speed-walk');
  const modeWalk = document.getElementById('mode-walk');
  const modeTransit = document.getElementById('mode-transit');
  const walkStatePill = document.getElementById('walk-state-pill');
  const restAlertBanner = document.getElementById('rest-alert-banner');
  const restAlertTitle = document.getElementById('rest-alert-title');
  const restAlertDesc = document.getElementById('rest-alert-desc');
  const btnDismissAlert = document.getElementById('btn-dismiss-alert');
  const btnResetAlert = document.getElementById('btn-reset-alert');
  const btnSimApproach = document.getElementById('btn-sim-approach');

  let watchId = null;
  let updateCount = 0;
  let currentPos = null;
  let lastEvalPos = null;
  let alertTriggered = false;
  let blockedLogged = false;
  let simTimer = null;

  function getTargetCoords() {
    const lat = parseFloat(inputTargetLat.value);
    const lng = parseFloat(inputTargetLng.value);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  function getRadiusMeters() {
    const r = parseFloat(inputRadius.value);
    return Number.isFinite(r) && r > 0 ? r : 50;
  }

  function getSelectedMode() {
    return modeTransit && modeTransit.checked ? 'transit' : 'walk';
  }

  function evaluateWalkCondition(speedMps) {
    if (getSelectedMode() === 'transit') {
      return {
        isWalking: false,
        shortLabel: '비도보(수동)',
        reason: '비도보 구간 선택됨 (버스·차량)',
      };
    }

    if (chkSpeedWalk.checked && Number.isFinite(speedMps) && speedMps > WALK_MAX_SPEED_MPS) {
      const kmh = (speedMps * 3.6).toFixed(1);
      return {
        isWalking: false,
        shortLabel: '비도보(속도초과)',
        reason: `이동 속도 초과 (${kmh} km/h > 9.0 km/h)`,
      };
    }

    return {
      isWalking: true,
      shortLabel: '도보',
      reason: '도보 구간',
    };
  }

  function syncWalkStatusUI(speedMps = null) {
    const walkStatus = evaluateWalkCondition(speedMps);

    if (!chkWalkOnly.checked) {
      setPill(walkStatePill, '구간 제한 해제', 'idle');
    } else if (walkStatus.isWalking) {
      setPill(walkStatePill, '도보 · 알림 허용', 'ok');
    } else {
      setPill(walkStatePill, `${walkStatus.shortLabel} · 차단`, 'warn');
    }

    if (valSpeed) {
      const speedStr = Number.isFinite(speedMps) ? `${(speedMps * 3.6).toFixed(1)} km/h` : '-';
      valSpeed.textContent = `${speedStr} (${walkStatus.shortLabel})`;
    }

    return walkStatus;
  }

  function showRestAlertBanner(distMeters, radius, sourceLabel, walkOnlyActive) {
    restAlertTitle.textContent = `휴식처 ${radius}m 이내 진입! (${distMeters.toFixed(1)}m)`;
    restAlertDesc.textContent = `${nowTime()} · ${sourceLabel} · ${walkOnlyActive ? '도보 구간 확인됨' : '구간 제한 해제'}`;
    restAlertBanner.classList.remove('hidden');
  }

  function hideRestAlertBanner() {
    restAlertBanner.classList.add('hidden');
  }

  function evaluateProximity(lat, lng, sourceLabel = 'GPS', speedMps = null, isSimulated = false) {
    lastEvalPos = { lat, lng, speedMps, sourceLabel, isSimulated };
    const walkStatus = syncWalkStatusUI(speedMps);
    const target = getTargetCoords();
    const radius = getRadiusMeters();

    if (!target) {
      valDistance.textContent = '- m';
      distanceBar.style.width = '0%';
      distancePanel.classList.remove('in-range', 'blocked-range');
      setPill(proximityPill, '목표 미설정', 'idle');
      return;
    }

    const dist = haversineMeters(lat, lng, target.lat, target.lng);
    const rounded = Math.round(dist * 10) / 10;
    valDistance.textContent = `${rounded.toFixed(1)} m`;

    const maxScale = radius * 3;
    const ratio = Math.max(0, Math.min(100, ((maxScale - dist) / maxScale) * 100));
    distanceBar.style.width = `${ratio}%`;

    const isInside = dist <= radius;
    const dedupe = chkDedupe.checked;
    const walkOnly = chkWalkOnly.checked;
    const rearmDistance = radius + 15;

    if (isInside) {
      if (walkOnly && !walkStatus.isWalking) {
        distancePanel.classList.remove('in-range');
        distancePanel.classList.add('blocked-range');
        setPill(proximityPill, `${radius}m 이내 · 비도보 차단`, 'warn');

        if (!blockedLogged) {
          blockedLogged = true;
          addLog(`[알림 차단/${sourceLabel}] 거리 ${rounded.toFixed(1)}m (${walkStatus.reason})`, 'warn');
        }
        return;
      }

      blockedLogged = false;
      distancePanel.classList.remove('blocked-range');
      distancePanel.classList.add('in-range');
      setPill(proximityPill, `${radius}m 이내 진입!`, 'ok');

      if (!dedupe || !alertTriggered) {
        alertTriggered = true;
        showRestAlertBanner(rounded, radius, sourceLabel, walkOnly);
        addLog(
          `[50m 알림 발동/${sourceLabel}] 거리 ${rounded.toFixed(1)}m (기준 ${radius}m, ${walkOnly ? '도보 확인' : '구간 제한 해제'})`,
          'ok'
        );
        if (onEnterRange) onEnterRange(radius);
      }
    } else {
      blockedLogged = false;
      distancePanel.classList.remove('in-range', 'blocked-range');
      setPill(proximityPill, `${radius}m 밖 (${Math.round(dist - radius)}m 남음)`, 'active');

      if (dedupe && alertTriggered && dist >= rearmDistance) {
        alertTriggered = false;
        addLog(`반경+15m(${rearmDistance}m) 이탈 → 알림 자동 재무장`, 'info');
      }
    }
  }

  function handlePositionSuccess(pos) {
    const { latitude, longitude, accuracy, speed } = pos.coords;
    const validSpeed = typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed : null;
    currentPos = { lat: latitude, lng: longitude, accuracy, speedMps: validSpeed };
    updateCount += 1;

    valLat.textContent = latitude.toFixed(6);
    valLng.textContent = longitude.toFixed(6);
    valAccuracy.textContent = `±${Math.round(accuracy)} m`;
    valUpdated.textContent = `${nowTime()} (${updateCount}회)`;

    accuracyWarning.classList.toggle('hidden', accuracy <= getRadiusMeters());
    evaluateProximity(latitude, longitude, 'GPS', validSpeed);
  }

  function handlePositionError(err) {
    const map = {
      1: '위치 권한이 거부되었습니다. 브라우저/휴대폰 설정에서 허용해 주세요.',
      2: '현재 위치를 가져올 수 없습니다. GPS 수신 상태(실외 이동)를 확인해 주세요.',
      3: '위치 응답 시간이 초과되었습니다.',
    };
    setPill(gpsStatusPill, '오류', 'alert');
    addLog(`GPS 오류(code=${err.code}): ${map[err.code] || err.message}`, 'err');
    if (onPermissionChanged) onPermissionChanged();
  }

  function stopGpsWatch(silent = false) {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      if (!silent) addLog('위치 추적 중지', 'info');
    }
    btnStartGps.disabled = false;
    btnStopGps.disabled = true;
    setPill(gpsStatusPill, '대기 중', 'idle');
  }

  function startGpsWatch() {
    if (!('geolocation' in navigator)) {
      addLog('Geolocation API 미지원 브라우저', 'err');
      return;
    }
    stopGpsWatch(true);

    setPill(gpsStatusPill, '수신 중', 'active');
    btnStartGps.disabled = true;
    btnStopGps.disabled = false;

    watchId = navigator.geolocation.watchPosition(handlePositionSuccess, handlePositionError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    });
    addLog('위치 실시간 추적(watchPosition) 시작', 'info');
  }

  function requestSinglePosition() {
    if (!('geolocation' in navigator)) {
      addLog('Geolocation API 미지원', 'err');
      return;
    }
    setPill(gpsStatusPill, '측정 중', 'active');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPill(gpsStatusPill, watchId !== null ? '수신 중' : '측정 완료', 'ok');
        handlePositionSuccess(pos);
        addLog(`1회 측정 완료 (±${Math.round(pos.coords.accuracy)}m)`, 'ok');
        if (onPermissionChanged) onPermissionChanged();
      },
      handlePositionError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  }

  function setTargetWithOffsetMeters(northMeters) {
    if (!currentPos) {
      alert('먼저 [추적 시작] 또는 [1회 측정]으로 현재 위치를 받아주세요.');
      return;
    }
    const targetLat = currentPos.lat + northMeters / 111320;
    inputTargetLat.value = targetLat.toFixed(6);
    inputTargetLng.value = currentPos.lng.toFixed(6);
    alertTriggered = false;
    blockedLogged = false;
    hideRestAlertBanner();

    addLog(`목표 설정: 현재 위치 +${northMeters}m`, 'info');
    evaluateProximity(currentPos.lat, currentPos.lng, '목표변경', currentPos.speedMps);
  }

  function runIndoorSimulation() {
    if (simTimer) {
      clearInterval(simTimer);
      simTimer = null;
    }

    const baseLat = currentPos ? currentPos.lat : 37.5665;
    const baseLng = currentPos ? currentPos.lng : 126.978;

    inputTargetLat.value = baseLat.toFixed(6);
    inputTargetLng.value = baseLng.toFixed(6);
    alertTriggered = false;
    blockedLogged = false;
    hideRestAlertBanner();

    const stepsMeters = [75, 60, 52, 42, 30];
    let idx = 0;

    setPill(gpsStatusPill, '가상 테스트', 'active');
    addLog(
      `실내 가상 접근 시뮬레이션 시작 (75m → 30m, 구간=${getSelectedMode() === 'walk' ? '도보' : '비도보'}, 도보전용=${chkWalkOnly.checked ? 'ON' : 'OFF'})`,
      'info'
    );

    const tick = () => {
      const distMeters = stepsMeters[idx];
      const simLat = baseLat - distMeters / 111320;
      const simSpeedMps = getSelectedMode() === 'walk' ? 1.2 : 8.3; // 도보 4.3 km/h / 비도보 29.9 km/h

      valLat.textContent = `${simLat.toFixed(6)} (가상)`;
      valLng.textContent = `${baseLng.toFixed(6)} (가상)`;
      valAccuracy.textContent = '±5 m (가상)';
      valUpdated.textContent = `${nowTime()} (가상)`;
      accuracyWarning.classList.add('hidden');

      evaluateProximity(simLat, baseLng, '시뮬레이션', simSpeedMps, true);
      idx += 1;

      if (idx >= stepsMeters.length) {
        clearInterval(simTimer);
        simTimer = null;
        setPill(gpsStatusPill, watchId !== null ? '수신 중' : '대기 중', watchId !== null ? 'active' : 'idle');
        addLog('실내 가상 시뮬레이션 완료', 'info');
      }
    };

    tick();
    simTimer = setInterval(tick, 1300);
  }

  function handleConditionChange(logMessage) {
    blockedLogged = false;
    if (logMessage) addLog(logMessage, 'info');

    const isSimulated = Boolean(lastEvalPos && lastEvalPos.isSimulated);
    const speed = isSimulated
      ? getSelectedMode() === 'walk'
        ? 1.2
        : 8.3
      : lastEvalPos
        ? lastEvalPos.speedMps
        : null;
    syncWalkStatusUI(speed);

    if (lastEvalPos) {
      evaluateProximity(lastEvalPos.lat, lastEvalPos.lng, '조건변경', speed, isSimulated);
    }
  }

  function getWalkSettings() {
    return {
      walkOnly: chkWalkOnly.checked,
      mode: getSelectedMode(),
      speedAutoDetect: chkSpeedWalk.checked,
      dedupe: chkDedupe.checked,
    };
  }

  // 이벤트 연결
  btnStartGps.addEventListener('click', startGpsWatch);
  btnStopGps.addEventListener('click', () => stopGpsWatch(false));
  btnSingleGps.addEventListener('click', requestSinglePosition);
  btnTargetHere.addEventListener('click', () => setTargetWithOffsetMeters(0));
  btnTarget70m.addEventListener('click', () => setTargetWithOffsetMeters(70));
  btnTarget30m.addEventListener('click', () => setTargetWithOffsetMeters(30));
  btnSimApproach.addEventListener('click', runIndoorSimulation);
  btnDismissAlert.addEventListener('click', hideRestAlertBanner);

  chkWalkOnly.addEventListener('change', () => {
    handleConditionChange(`도보 구간 전용 알림: ${chkWalkOnly.checked ? '켜짐 (도보에서만 작동)' : '꺼짐 (모든 구간 작동)'}`);
  });

  chkSpeedWalk.addEventListener('change', () => {
    handleConditionChange(`GPS 속도 자동 판별: ${chkSpeedWalk.checked ? '켜짐 (9 km/h 초과 차단)' : '꺼짐'}`);
  });

  [modeWalk, modeTransit].forEach((radio) => {
    radio.addEventListener('change', () => {
      const label = getSelectedMode() === 'walk' ? '도보 구간' : '비도보 구간 (버스·차량)';
      handleConditionChange(`현재 이동 구간 전환: ${label}`);
    });
  });

  [inputTargetLat, inputTargetLng, inputRadius].forEach((input) => {
    input.addEventListener('change', () => {
      if (lastEvalPos) {
        evaluateProximity(lastEvalPos.lat, lastEvalPos.lng, '설정변경', lastEvalPos.speedMps, lastEvalPos.isSimulated);
      }
    });
  });

  btnResetAlert.addEventListener('click', () => {
    alertTriggered = false;
    blockedLogged = false;
    hideRestAlertBanner();
    addLog('50m 알림 재무장 완료', 'info');
    if (lastEvalPos) {
      evaluateProximity(lastEvalPos.lat, lastEvalPos.lng, '재무장', lastEvalPos.speedMps, lastEvalPos.isSimulated);
    }
  });

  syncWalkStatusUI(null);

  return {
    stopGpsWatch,
    getWalkSettings,
  };
}
