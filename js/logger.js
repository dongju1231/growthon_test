// 공통 유틸: 시간 포맷, 상태 뱃지, 클립보드 복사, 실시간 로그 관리

export function nowTime() {
  return new Date().toTimeString().slice(0, 8);
}

export function setPill(node, text, kind) {
  if (!node) return;
  node.textContent = text;
  node.className = `status-pill status-${kind}`;
}

export async function copyText(text, label, addLog) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (addLog) addLog(`${label} 클립보드 복사 완료`, 'ok');
    alert(`${label}가 클립보드에 복사되었습니다.`);
  } catch (err) {
    if (addLog) addLog(`${label} 복사 실패: ${err.message}`, 'err');
  }
}

export function createLogger() {
  const logBox = document.getElementById('log-box');
  const logCountPill = document.getElementById('log-count-pill');
  const btnClearLog = document.getElementById('btn-clear-log');
  const logs = [];

  function updateCount() {
    logCountPill.textContent = `${logs.length}건`;
  }

  function addLog(message, level = 'info') {
    const line = `[${nowTime()}] ${message}`;
    logs.unshift(line);
    if (logs.length > 200) logs.pop();

    const div = document.createElement('div');
    div.className = `log-entry log-${level}`;
    div.textContent = line;
    logBox.prepend(div);
    updateCount();
  }

  function clear() {
    logs.length = 0;
    logBox.innerHTML = '';
    updateCount();
  }

  btnClearLog.addEventListener('click', clear);

  return {
    addLog,
    clear,
    getLogs: () => [...logs],
  };
}
