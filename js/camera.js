// 3. 카메라 · 사진 업로드: 전/후면 전환, 스냅샷 캡처, 기본 카메라/앨범 선택, 모의·실제 서버 업로드 테스트

import { nowTime, setPill } from './logger.js';

const MAX_UPLOAD_DIMENSION = 1600;
const MAX_HISTORY_ITEMS = 5;

function buildPermissionGuideHtml(os) {
  if (os === 'Android') {
    return `
      <strong>카메라 권한이 차단되어 있습니다.</strong>
      <ol>
        <li>주소창 왼쪽 <b>설정 아이콘 → 권한 → 카메라 허용</b></li>
        <li>그래도 팝업이 안 뜨면 휴대폰 <b>설정 → 애플리케이션 → Chrome(또는 브라우저) → 권한 → 카메라 → '앱 사용 중에만 허용'</b></li>
        <li>상단 빠른 설정창의 <b>카메라 액세스</b>가 켜져 있는지 확인</li>
      </ol>
      <div style="margin-top:6px;">임시 확인은 위의 <b>[기본 카메라 앱 촬영]</b> 또는 <b>[앨범 / 파일 선택]</b>을 이용해 보세요.</div>
    `;
  }
  if (os === 'iOS') {
    return `
      <strong>카메라 권한이 차단되어 있습니다.</strong>
      <ol>
        <li>주소창 왼쪽 <b>가/AA(또는 설정 아이콘) → 웹 사이트 설정 → 카메라 '허용'</b></li>
        <li>아이폰 <b>설정 → Safari → 카메라 → '묻기' 또는 '허용'</b></li>
      </ol>
      <div style="margin-top:6px;">임시 확인은 위의 <b>[기본 카메라 앱 촬영]</b> 또는 <b>[앨범 / 파일 선택]</b>을 이용해 보세요.</div>
    `;
  }
  return `
    <strong>카메라 권한이 거부되었습니다.</strong>
    <ol>
      <li>브라우저 주소창 왼쪽 아이콘에서 <b>카메라 권한을 '허용'</b>으로 변경 후 새로고침하세요.</li>
      <li>OS 개인정보 설정에서 브라우저의 카메라 접근이 허용되어 있는지 확인하세요.</li>
    </ol>
  `;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function canvasToBlobAsync(canvas, mimeType = 'image/jpeg', quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('이미지 Blob 생성 실패'));
        },
        mimeType,
        quality
      );
      return;
    }

    try {
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const [header, base64] = dataUrl.split(',');
      const binary = atob(base64);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) arr[i] = binary.charCodeAt(i);
      const matched = header.match(/data:(.*?);/);
      resolve(new Blob([arr], { type: (matched && matched[1]) || mimeType }));
    } catch (err) {
      reject(err);
    }
  });
}

function createThumbnailDataUrl(imgEl) {
  try {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return '';
    const size = 88;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const minSide = Math.min(imgEl.naturalWidth, imgEl.naturalHeight);
    const sx = (imgEl.naturalWidth - minSide) / 2;
    const sy = (imgEl.naturalHeight - minSide) / 2;
    ctx.drawImage(imgEl, sx, sy, minSide, minSide, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch (_) {
    return '';
  }
}

export function initCamera({ addLog, getOS, onPermissionChanged }) {
  const cameraStatusPill = document.getElementById('camera-status-pill');
  const btnCamBack = document.getElementById('btn-cam-back');
  const btnCamFront = document.getElementById('btn-cam-front');
  const btnCamCapture = document.getElementById('btn-cam-capture');
  const btnCamStop = document.getElementById('btn-cam-stop');
  const cameraErrorBox = document.getElementById('camera-error-box');
  const cameraMeta = document.getElementById('camera-meta');
  const cameraVideo = document.getElementById('camera-video');
  const videoPlaceholder = document.getElementById('video-placeholder');
  const captureCanvas = document.getElementById('capture-canvas');
  const captureResult = document.getElementById('capture-result');
  const captureSourceLabel = document.getElementById('capture-source-label');
  const capturedImage = document.getElementById('captured-image');
  const captureMeta = document.getElementById('capture-meta');
  const btnDownloadPhoto = document.getElementById('btn-download-photo');
  const btnClearPhoto = document.getElementById('btn-clear-photo');
  const inputNativeCamera = document.getElementById('input-native-camera');
  const inputFileUpload = document.getElementById('input-file-upload');

  // 업로드 UI 요소
  const uploadStatusPill = document.getElementById('upload-status-pill');
  const uploadModeMock = document.getElementById('upload-mode-mock');
  const uploadModeReal = document.getElementById('upload-mode-real');
  const uploadServerFields = document.getElementById('upload-server-fields');
  const inputUploadUrl = document.getElementById('input-upload-url');
  const inputUploadField = document.getElementById('input-upload-field');
  const inputUploadTimeout = document.getElementById('input-upload-timeout');
  const chkUploadResize = document.getElementById('chk-upload-resize');
  const btnUploadPhoto = document.getElementById('btn-upload-photo');
  const uploadProgressWrap = document.getElementById('upload-progress-wrap');
  const uploadProgressBar = document.getElementById('upload-progress-bar');
  const uploadProgressText = document.getElementById('upload-progress-text');
  const uploadResultBox = document.getElementById('upload-result-box');
  const uploadHistoryWrap = document.getElementById('upload-history-wrap');
  const uploadHistoryList = document.getElementById('upload-history-list');
  const btnClearHistory = document.getElementById('btn-clear-history');

  let mediaStream = null;
  let preparedPhoto = null;
  let isUploading = false;
  const uploadHistory = [];

  function clearError() {
    cameraErrorBox.classList.add('hidden');
    cameraErrorBox.innerHTML = '';
  }

  function showError(err) {
    const name = (err && err.name) || 'Error';

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      cameraErrorBox.innerHTML = buildPermissionGuideHtml(getOS());
      setPill(cameraStatusPill, '권한 차단됨', 'alert');
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      cameraErrorBox.innerHTML = '<strong>사용 가능한 카메라 장치를 찾을 수 없습니다.</strong>';
      setPill(cameraStatusPill, '장치 없음', 'alert');
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      cameraErrorBox.innerHTML = '<strong>다른 앱이 카메라를 사용 중입니다.</strong> 다른 앱을 닫고 다시 시도하세요.';
      setPill(cameraStatusPill, '사용 중 오류', 'alert');
    } else {
      cameraErrorBox.innerHTML = `<strong>카메라를 열 수 없습니다.</strong> (${name}: ${(err && err.message) || '오류'})`;
      setPill(cameraStatusPill, '오류', 'alert');
    }

    cameraErrorBox.classList.remove('hidden');
  }

  function stopCamera(silent = false) {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    cameraVideo.srcObject = null;
    videoPlaceholder.classList.remove('hidden');
    btnCamCapture.disabled = true;
    btnCamStop.disabled = true;
    cameraMeta.textContent = '스트림 정보: 미실행';
    clearError();
    setPill(cameraStatusPill, '꺼짐', 'idle');

    if (!silent) addLog('카메라 스트림 종료 완료', 'info');
  }

  async function startCamera(facingMode) {
    clearError();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError({ name: 'UnsupportedError', message: 'getUserMedia 미지원 (HTTPS 접속 확인)' });
      addLog('getUserMedia API 미지원', 'err');
      return;
    }

    stopCamera(true);
    setPill(cameraStatusPill, '연결 중', 'active');

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (innerErr) {
        if (innerErr.name === 'NotAllowedError' || innerErr.name === 'PermissionDeniedError') {
          throw innerErr;
        }
        addLog(`지정 카메라(${facingMode}) 실패(${innerErr.name}) → 기본 카메라 재시도`, 'warn');
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }

      mediaStream = stream;
      cameraVideo.srcObject = stream;
      await cameraVideo.play();

      videoPlaceholder.classList.add('hidden');
      btnCamCapture.disabled = false;
      btnCamStop.disabled = false;
      setPill(cameraStatusPill, facingMode === 'environment' ? '후면 실행 중' : '전면 실행 중', 'ok');

      const track = stream.getVideoTracks()[0];
      const settings = track && track.getSettings ? track.getSettings() : {};
      const label = (track && track.label) || '카메라';
      const res = `${settings.width || cameraVideo.videoWidth}×${settings.height || cameraVideo.videoHeight}`;
      cameraMeta.textContent = `스트림 정보: ${label} | ${res} | ${settings.facingMode || facingMode}`;
      addLog(`카메라 실행 성공 (${facingMode}, ${res})`, 'ok');
      if (onPermissionChanged) onPermissionChanged();
    } catch (err) {
      showError(err);
      addLog(`카메라 실행 실패(${err.name}): ${err.message}`, 'err');
      if (onPermissionChanged) onPermissionChanged();
    }
  }

  function updateCaptureMetaText() {
    if (!preparedPhoto) return;
    const dim = preparedPhoto.width && preparedPhoto.height
      ? `${preparedPhoto.width}×${preparedPhoto.height}px`
      : '해상도 확인 중';
    captureMeta.textContent = `${preparedPhoto.fileName} | ${dim} | ${formatBytes(preparedPhoto.blob.size)} | ${preparedPhoto.mimeType || 'image/*'}`;
  }

  function setUploadProgress(percent, visible = true) {
    uploadProgressWrap.classList.toggle('hidden', !visible);
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    uploadProgressBar.style.width = `${clamped}%`;
    uploadProgressText.textContent = `${clamped}%`;
  }

  function showUploadResult(kind, title, details, responseText = '') {
    uploadResultBox.className = `alert alert-${kind}`;
    uploadResultBox.innerHTML = '';

    const strong = document.createElement('strong');
    strong.textContent = title;
    uploadResultBox.appendChild(strong);

    if (details) {
      const div = document.createElement('div');
      div.style.marginTop = '4px';
      div.textContent = details;
      uploadResultBox.appendChild(div);
    }

    if (responseText) {
      const pre = document.createElement('pre');
      pre.className = 'upload-response-pre';
      pre.textContent = responseText.length > 500 ? `${responseText.slice(0, 500)}\n...(생략)` : responseText;
      uploadResultBox.appendChild(pre);
    }
  }

  function resetUploadResult() {
    uploadResultBox.className = 'alert hidden';
    uploadResultBox.innerHTML = '';
    setUploadProgress(0, false);
  }

  function setPreparedPhoto({ blob, fileName, mimeType, width = 0, height = 0, source }) {
    if (preparedPhoto && preparedPhoto.previewUrl) {
      URL.revokeObjectURL(preparedPhoto.previewUrl);
    }

    const previewUrl = URL.createObjectURL(blob);
    preparedPhoto = {
      blob,
      fileName,
      mimeType: mimeType || blob.type || 'image/jpeg',
      width,
      height,
      source,
      previewUrl,
    };

    captureSourceLabel.textContent = `준비된 사진 (${source})`;
    capturedImage.onload = () => {
      if (preparedPhoto && (!preparedPhoto.width || !preparedPhoto.height)) {
        preparedPhoto.width = capturedImage.naturalWidth || 0;
        preparedPhoto.height = capturedImage.naturalHeight || 0;
        updateCaptureMetaText();
      }
    };
    capturedImage.onerror = () => {
      if (preparedPhoto) {
        captureMeta.textContent = `${preparedPhoto.fileName} | 미리보기 미지원 포맷(원본 업로드 가능) | ${formatBytes(preparedPhoto.blob.size)} | ${preparedPhoto.mimeType || 'image/*'}`;
      }
    };
    capturedImage.src = previewUrl;
    btnDownloadPhoto.href = previewUrl;
    btnDownloadPhoto.download = fileName;
    updateCaptureMetaText();

    captureResult.classList.remove('hidden');
    resetUploadResult();
    setPill(uploadStatusPill, '업로드 준비됨', 'active');
    btnUploadPhoto.disabled = false;
  }

  function clearPreparedPhoto() {
    if (preparedPhoto && preparedPhoto.previewUrl) {
      URL.revokeObjectURL(preparedPhoto.previewUrl);
    }
    preparedPhoto = null;
    capturedImage.removeAttribute('src');
    captureResult.classList.add('hidden');
    resetUploadResult();
    setPill(uploadStatusPill, '대기 중', 'idle');
    addLog('선택된 사진 초기화', 'info');
  }

  async function capturePhoto() {
    if (!mediaStream) return;
    const w = cameraVideo.videoWidth;
    const h = cameraVideo.videoHeight;

    if (!w || !h) {
      addLog('비디오 프레임 준비 전', 'warn');
      return;
    }

    captureCanvas.width = w;
    captureCanvas.height = h;
    captureCanvas.getContext('2d').drawImage(cameraVideo, 0, 0, w, h);

    try {
      const blob = await canvasToBlobAsync(captureCanvas, 'image/jpeg', 0.88);
      const fileName = `camera-capture-${Date.now()}.jpg`;
      setPreparedPhoto({
        blob,
        fileName,
        mimeType: 'image/jpeg',
        width: w,
        height: h,
        source: '웹 카메라 캡처',
      });
      addLog(`사진 캡처 완료 (${w}×${h}, ${formatBytes(blob.size)})`, 'ok');
    } catch (err) {
      addLog(`사진 캡처 실패: ${err.message}`, 'err');
    }
  }

  function handleFileInput(event, sourceLabel) {
    const file = event.target.files && event.target.files[0];
    // 동일 파일 재선택이 가능하도록 입력값 초기화
    event.target.value = '';
    if (!file) return;

    if (file.type && !file.type.startsWith('image/')) {
      addLog(`이미지 파일이 아닙니다: ${file.name} (${file.type})`, 'warn');
      alert('이미지 파일만 선택할 수 있습니다.');
      return;
    }

    const fileName = file.name || `photo-${Date.now()}.jpg`;
    setPreparedPhoto({
      blob: file,
      fileName,
      mimeType: file.type || 'image/jpeg',
      width: 0,
      height: 0,
      source: sourceLabel,
    });
    addLog(`${sourceLabel} 사진 준비: ${fileName} (${formatBytes(file.size)})`, 'ok');
  }

  async function prepareUploadPayload(photo, shouldResize) {
    const origW = photo.width || capturedImage.naturalWidth || 0;
    const origH = photo.height || capturedImage.naturalHeight || 0;

    if (!shouldResize || !origW || !origH) {
      return {
        blob: photo.blob,
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        width: origW,
        height: origH,
        resized: false,
      };
    }

    const maxSide = Math.max(origW, origH);
    const scale = maxSide > MAX_UPLOAD_DIMENSION ? MAX_UPLOAD_DIMENSION / maxSide : 1;
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(capturedImage, 0, 0, targetW, targetH);

    const compressedBlob = await canvasToBlobAsync(canvas, 'image/jpeg', 0.85);
    // 리사이즈가 없었고 압축 후 오히려 용량이 커졌다면 원본 유지
    if (scale === 1 && compressedBlob.size >= photo.blob.size) {
      return {
        blob: photo.blob,
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        width: origW,
        height: origH,
        resized: false,
      };
    }

    const baseName = photo.fileName.replace(/\.[^.]+$/, '');
    return {
      blob: compressedBlob,
      fileName: `${baseName}.jpg`,
      mimeType: 'image/jpeg',
      width: targetW,
      height: targetH,
      resized: true,
    };
  }

  function renderUploadHistory() {
    if (!uploadHistory.length) {
      uploadHistoryWrap.classList.add('hidden');
      uploadHistoryList.innerHTML = '';
      return;
    }

    uploadHistoryWrap.classList.remove('hidden');
    uploadHistoryList.innerHTML = '';

    uploadHistory.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'upload-history-item';

      if (item.thumb) {
        const img = document.createElement('img');
        img.className = 'upload-history-thumb';
        img.src = item.thumb;
        img.alt = item.fileName;
        row.appendChild(img);
      }

      const info = document.createElement('div');
      info.className = 'upload-history-info';

      const title = document.createElement('div');
      title.className = 'upload-history-title';
      title.textContent = item.fileName;

      const sub = document.createElement('div');
      sub.className = 'upload-history-sub';
      sub.textContent = `${item.time} · ${item.modeLabel} · ${item.sizeText} · ${item.elapsedMs}ms`;

      info.appendChild(title);
      info.appendChild(sub);
      row.appendChild(info);

      const pill = document.createElement('span');
      pill.className = `status-pill status-${item.ok ? 'ok' : 'alert'}`;
      pill.textContent = item.statusLabel;
      row.appendChild(pill);

      uploadHistoryList.appendChild(row);
    });
  }

  function recordUploadHistory(entry) {
    uploadHistory.unshift(entry);
    if (uploadHistory.length > MAX_HISTORY_ITEMS) uploadHistory.pop();
    renderUploadHistory();
  }

  function runMockUpload(formData, fieldName) {
    return new Promise((resolve, reject) => {
      const fileEntry = formData.get(fieldName);
      if (!fileEntry || typeof fileEntry.size !== 'number' || fileEntry.size <= 0) {
        reject(new Error('FormData에 유효한 이미지 파일이 없습니다.'));
        return;
      }

      const steps = [18, 46, 78, 100];
      let idx = 0;
      const step = () => {
        setUploadProgress(steps[idx], true);
        idx += 1;
        if (idx < steps.length) {
          setTimeout(step, 160);
        } else {
          resolve({
            status: 200,
            responseText: JSON.stringify(
              {
                mock: true,
                field: fieldName,
                filename: fileEntry.name || 'upload.jpg',
                mimeType: fileEntry.type || 'image/jpeg',
                bytes: fileEntry.size,
              },
              null,
              2
            ),
          });
        }
      };
      setTimeout(step, 120);
    });
  }

  function runRealUpload(url, formData, timeoutSec) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.timeout = timeoutSec * 1000;

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          setUploadProgress((evt.loaded / evt.total) * 100, true);
        }
      };

      xhr.onload = () => {
        setUploadProgress(100, true);
        resolve({
          status: xhr.status,
          statusText: xhr.statusText,
          responseText: xhr.responseText || '',
        });
      };

      xhr.onerror = () => {
        reject(new Error('네트워크 또는 CORS 오류로 업로드가 차단되었습니다. (서버 CORS 허용 여부 및 HTTPS 확인)'));
      };

      xhr.ontimeout = () => {
        reject(new Error(`업로드 시간 초과 (${timeoutSec}초)`));
      };

      xhr.send(formData);
    });
  }

  async function executeUpload() {
    if (!preparedPhoto || isUploading) return;

    const isReal = uploadModeReal.checked;
    const fieldName = (inputUploadField.value || '').trim() || 'file';
    const uploadUrl = (inputUploadUrl.value || '').trim();
    const timeoutSec = Math.max(3, Math.min(120, parseInt(inputUploadTimeout.value, 10) || 20));

    if (isReal && !/^https?:\/\/.+/i.test(uploadUrl)) {
      showUploadResult('danger', '업로드 URL이 올바르지 않습니다.', 'http:// 또는 https:// 로 시작하는 엔드포인트 주소를 입력해 주세요.');
      addLog('실제 업로드 실패: 엔드포인트 URL 미입력 또는 형식 오류', 'err');
      return;
    }

    isUploading = true;
    btnUploadPhoto.disabled = true;
    btnUploadPhoto.textContent = '업로드 중...';
    setPill(uploadStatusPill, '업로드 중', 'active');
    resetUploadResult();
    setUploadProgress(5, true);

    const startedAt = performance.now();
    const thumb = createThumbnailDataUrl(capturedImage);
    const originalSize = preparedPhoto.blob.size;

    try {
      const payload = await prepareUploadPayload(preparedPhoto, chkUploadResize.checked);
      const formData = new FormData();
      formData.append(fieldName, payload.blob, payload.fileName);
      formData.append('source', preparedPhoto.source);
      formData.append('clientTimestamp', new Date().toISOString());

      const sizeInfo = payload.resized
        ? `${formatBytes(originalSize)} → ${formatBytes(payload.blob.size)} (리사이즈 ${payload.width}×${payload.height})`
        : `${formatBytes(payload.blob.size)} (원본)`;

      const res = isReal
        ? await runRealUpload(uploadUrl, formData, timeoutSec)
        : await runMockUpload(formData, fieldName);

      const elapsedMs = Math.round(performance.now() - startedAt);
      const isOk = res.status >= 200 && res.status < 300;
      const modeLabel = isReal ? '실제 POST' : '모의 업로드';

      if (isOk) {
        setPill(uploadStatusPill, isReal ? `성공 (${res.status})` : '모의 완료', 'ok');
        showUploadResult(
          'success',
          `${modeLabel} 성공 (HTTP ${res.status}, ${elapsedMs}ms)`,
          `필드명: ${fieldName} | 파일: ${payload.fileName} | 크기: ${sizeInfo}`,
          res.responseText
        );
        addLog(`[사진 업로드 성공/${modeLabel}] ${payload.fileName} (${sizeInfo}, HTTP ${res.status}, ${elapsedMs}ms)`, 'ok');
      } else {
        setPill(uploadStatusPill, `실패 (${res.status})`, 'alert');
        showUploadResult(
          'danger',
          `${modeLabel} 실패 (HTTP ${res.status} ${res.statusText || ''})`,
          `소요시간: ${elapsedMs}ms | 크기: ${sizeInfo}`,
          res.responseText
        );
        addLog(`[사진 업로드 실패/${modeLabel}] HTTP ${res.status} (${elapsedMs}ms)`, 'err');
      }

      recordUploadHistory({
        time: nowTime(),
        fileName: payload.fileName,
        modeLabel,
        sizeText: formatBytes(payload.blob.size),
        elapsedMs,
        ok: isOk,
        statusLabel: isOk ? (isReal ? `${res.status} OK` : '모의 OK') : `HTTP ${res.status}`,
        thumb,
      });
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      const modeLabel = isReal ? '실제 POST' : '모의 업로드';
      setPill(uploadStatusPill, '업로드 오류', 'alert');
      showUploadResult('danger', `${modeLabel} 오류 (${elapsedMs}ms)`, err.message || '알 수 없는 오류');
      addLog(`[사진 업로드 오류/${modeLabel}] ${err.message}`, 'err');

      recordUploadHistory({
        time: nowTime(),
        fileName: preparedPhoto.fileName,
        modeLabel,
        sizeText: formatBytes(originalSize),
        elapsedMs,
        ok: false,
        statusLabel: '오류',
        thumb,
      });
    } finally {
      isUploading = false;
      btnUploadPhoto.disabled = false;
      btnUploadPhoto.textContent = '사진 업로드 실행';
    }
  }

  function syncUploadModeUI() {
    uploadServerFields.classList.toggle('hidden', !uploadModeReal.checked);
  }

  function markPermissionDeniedIfIdle() {
    if (!mediaStream) {
      setPill(cameraStatusPill, '권한 차단됨', 'alert');
    }
  }

  // 이벤트 연결
  btnCamBack.addEventListener('click', () => startCamera('environment'));
  btnCamFront.addEventListener('click', () => startCamera('user'));
  btnCamCapture.addEventListener('click', capturePhoto);
  btnCamStop.addEventListener('click', () => stopCamera(false));
  btnClearPhoto.addEventListener('click', clearPreparedPhoto);
  inputNativeCamera.addEventListener('change', (e) => handleFileInput(e, '기본 카메라 앱'));
  inputFileUpload.addEventListener('change', (e) => handleFileInput(e, '앨범/파일 선택'));
  uploadModeMock.addEventListener('change', syncUploadModeUI);
  uploadModeReal.addEventListener('change', syncUploadModeUI);
  btnUploadPhoto.addEventListener('click', executeUpload);
  btnClearHistory.addEventListener('click', () => {
    uploadHistory.length = 0;
    renderUploadHistory();
    addLog('업로드 기록 비움', 'info');
  });

  syncUploadModeUI();

  return {
    stopCamera,
    markPermissionDeniedIfIdle,
  };
}
