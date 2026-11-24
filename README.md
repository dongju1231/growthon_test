# 웹 위치 · 50m 알림 · 음성 · 카메라 통합 테스트 도구

모바일/PC 웹 브라우저에서
기종별 위치(GPS), 50m 근접 알림, 음성 알림(TTS/효과음), 카메라(`getUserMedia` / `input capture`) 동작을 시험하고 리포트를 내는 시험용 웹
시험외의 기능은 없음

---

## 파일 구성

- `index.html`:테스트 페이지
- `styles.css`
- `js/main.js`: 앱 진입점 (모듈 연결, 전체 펼치기/접기, 리포트 복사)
- `js/logger.js`: 실시간 로그, 상태 뱃지, 클립보드 복사 유틸
- `js/env.js`: OS/브라우저/HTTPS/권한 상태 자동 진단
- `js/location.js`: 실시간 GPS 추적, Haversine 50m 거리 계산, 실내 시뮬레이션
- `js/voice.js`: 모바일 오디오 잠금 해제, 한국어 TTS, 효과음, 진동
- `js/camera.js`: 전/후면 카메라 제어, 스냅샷 캡처, 기종별 권한 오류 안내
- `TEST_GUIDE.md`: 기종별 상세 테스트 절차서 및 QA 결과 기록표
- `.gitignore`: `.env`, 개인 테스트 사진/로그 등 민감 파일 커밋 방지 설정

---

## 빠른 실행 및 배포

### 1) 로컬 실행 (PC 확인)
```bash
npx serve . -l 3000
```
브라우저에서 `http://localhost:3000` 접속

### 2) 
위치와 카메라는 HTTPS에서만 정상 동작합니다.
음성알림에서 진동은 핸드폰 소리랑 진동켜야 나옴
카메라도 chrome 에서 카메라권한 줘야함

---

