// 2. 음성 확인: 오디오 잠금 해제, 한국어 TTS, 2톤 효과음, 진동

import { setPill } from './logger.js';

export function initVoice({ addLog }) {
  const audioUnlockPill = document.getElementById('audio-unlock-pill');
  const btnUnlockAudio = document.getElementById('btn-unlock-audio');
  const btnTestTts = document.getElementById('btn-test-tts');
  const btnTestBeep = document.getElementById('btn-test-beep');
  const btnTestVibrate = document.getElementById('btn-test-vibrate');
  const inputTtsText = document.getElementById('input-tts-text');
  const selectVoice = document.getElementById('select-voice');
  const inputRate = document.getElementById('input-rate');
  const valRate = document.getElementById('val-rate');
  const chkAutoTts = document.getElementById('chk-auto-tts');
  const chkAutoBeep = document.getElementById('chk-auto-beep');
  const chkAutoVibrate = document.getElementById('chk-auto-vibrate');

  let audioCtx = null;
  let voices = [];

  function ensureAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playBeepChime() {
    const ctx = ensureAudioContext();
    if (!ctx) {
      addLog('Web Audio API 미지원', 'warn');
      return;
    }

    try {
      const now = ctx.currentTime;
      [880, 1174.66].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.16);
        gain.gain.setValueAtTime(0.001, now + i * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.22, now + i * 0.16 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.16 + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.16);
        osc.stop(now + i * 0.16 + 0.3);
      });
      addLog('효과음 재생 요청 완료', 'ok');
    } catch (err) {
      addLog(`효과음 재생 오류: ${err.message}`, 'err');
    }
  }

  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const allVoices = window.speechSynthesis.getVoices() || [];
    const koVoices = allVoices.filter((v) => /ko/i.test(v.lang));
    voices = koVoices.length ? koVoices : allVoices;

    selectVoice.innerHTML = '<option value="">브라우저 기본 (ko-KR)</option>';
    voices.forEach((v, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = `${v.name} (${v.lang})`;
      selectVoice.appendChild(opt);
    });
  }

  function speakTts(text) {
    if (!('speechSynthesis' in window)) {
      addLog('Web Speech API(TTS) 미지원', 'err');
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ko-KR';
      utter.rate = parseFloat(inputRate.value) || 1.0;

      const selectedIdx = selectVoice.value;
      if (selectedIdx !== '' && voices[Number(selectedIdx)]) {
        utter.voice = voices[Number(selectedIdx)];
      }

      utter.onstart = () => addLog(`TTS 재생 시작: "${text}"`, 'ok');
      utter.onend = () => addLog('TTS 재생 완료', 'info');
      utter.onerror = (e) => addLog(`TTS 재생 오류: ${e.error || 'unknown'}`, 'err');

      window.speechSynthesis.speak(utter);
    } catch (err) {
      addLog(`TTS 호출 예외: ${err.message}`, 'err');
    }
  }

  function triggerVibration() {
    if (typeof navigator.vibrate !== 'function') {
      addLog('진동 API 미지원 (iOS Safari는 기본 미지원)', 'warn');
      return;
    }
    const ok = navigator.vibrate([200, 100, 200]);
    if (ok) {
      addLog('진동 요청 허용됨 (휴대폰이 무음/방해금지 모드면 울리지 않음)', 'info');
    } else {
      addLog('브라우저가 진동을 차단함 (사용자 터치 필요 또는 OS 제한)', 'warn');
    }
  }

  function unlockAudioAndTts() {
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    playBeepChime();

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance('음성 알림이 활성화되었습니다.');
        u.lang = 'ko-KR';
        u.rate = parseFloat(inputRate.value) || 1.0;
        window.speechSynthesis.speak(u);
      } catch (err) {
        addLog(`TTS 활성화 예외: ${err.message}`, 'warn');
      }
    }

    setPill(audioUnlockPill, '활성화됨', 'ok');
    addLog('오디오/음성 활성화 완료', 'ok');
  }

  // 50m 진입 시 위치 모듈에서 호출하는 통합 알림 함수
  function notifyProximity(radius) {
    if (chkAutoBeep.checked) playBeepChime();
    if (chkAutoVibrate.checked) triggerVibration();
    if (chkAutoTts.checked) {
      speakTts(inputTtsText.value.trim() || `목적지 반경 ${radius}미터 이내에 진입했습니다.`);
    }
  }

  // 이벤트 연결
  btnUnlockAudio.addEventListener('click', unlockAudioAndTts);
  btnTestTts.addEventListener('click', () => {
    speakTts(inputTtsText.value.trim() || '음성 알림 테스트입니다.');
  });
  btnTestBeep.addEventListener('click', playBeepChime);
  btnTestVibrate.addEventListener('click', triggerVibration);
  inputRate.addEventListener('input', () => {
    valRate.textContent = Number(inputRate.value).toFixed(1);
  });

  loadVoices();
  if ('speechSynthesis' in window && 'onvoiceschanged' in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  return {
    notifyProximity,
    playBeepChime,
    speakTts,
    triggerVibration,
  };
}
