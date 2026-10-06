# qa-kit 설치·설정 가이드

qa-kit을 처음 쓰는 사람이 자기 PC에서 검수 회차를 돌릴 수 있을 때까지의 준비 과정을 정리한다.
명령 사용법과 시나리오 작성법은 [README](../README.md)를 본다.

## 1. 무엇이 필요한가

검수할 앱 종류에 따라 필요한 도구가 다르다. 웹만 검수하면 A만 준비한다.

| 구분 | 도구 | 확인한 버전 | 용도 |
|---|---|---|---|
| A. 공통 | bash, git, curl, Python 3 | Python 3.12 | `bin/qa` 명령, 설정 읽기, 판정 기록 |
| A. 공통 | Node.js, npm | Node 24, npm 11 | 시나리오 실행, 보고서 생성, 각 웹 저장소 개발 서버 |
| A. 공통 | Playwright + Chromium | 1.63 | 웹 화면 촬영·문구 대조·영상 |
| B. 관리자(CMS·CRM) | 회사 VPN | — | 관리자 dev 서버 접속 |
| C. 안드로이드 | Android SDK(build-tools, platform-tools) | — | APK 빌드 |
| C. 안드로이드 | JDK 17 | 17.0.20-tem | Gradle 빌드 |
| C. 안드로이드 | fvm + 각 앱의 `.fvmrc` Flutter 버전 | — | 저장소별 Flutter 버전 고정 |
| C. 안드로이드 | Android 에뮬레이터 또는 실기기 + adb | — | 앱 실행·녹화·UI 덤프 |

### 운영체제

| 환경 | 가능 여부 | 비고 |
|---|---|---|
| Windows + WSL2(Ubuntu) | 가능(작성자 환경) | qa-kit·Node·Playwright는 WSL 안에 설치한다. 에뮬레이터는 Windows 쪽을 쓴다 |
| Linux | 가능 | 경로 설정만 맞춘다 |
| macOS | 대부분 가능 | `ss`·`sed -i` 등 일부 명령이 달라 `qa status`·`qa build`가 실패할 수 있다 |
| Windows 단독(PowerShell·cmd·Git Bash) | 불가 | `bin/qa`와 안드로이드 엔진이 bash·python3·`pkill`·`ss`·`nohup`을 쓴다 |

Windows에서는 [WSL2로 준비하기](#windows-wsl2로-준비하기)를 먼저 따른다.

### Windows: WSL2로 준비하기

1. PowerShell(관리자)에서 WSL2와 Ubuntu를 설치하고 재부팅한다.
   ```powershell
   wsl --install -d Ubuntu
   ```
2. Ubuntu 터미널을 열어 기본 도구와 Node를 설치한다. Node는 nvm 등으로 24 버전을 맞춘다.
   ```bash
   sudo apt update && sudo apt install -y git curl python3 unzip
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
   source ~/.bashrc && nvm install 24
   ```
3. 저장소는 WSL 파일 시스템(`~/projects`) 아래에 클론한다. `/mnt/c/...`(Windows 드라이브)에 두면 `npm ci`와 개발 서버가 매우 느리다.
4. 이후 [2. 저장소와 검수 대상 준비](#2-저장소와-검수-대상-준비)부터 그대로 진행한다. 브라우저 라이브러리 설치(`npx playwright install-deps chromium`)가 필요하다.

WSL에서 쓸 때 알아 둘 것:

- **보고서 열기**: `explorer.exe "$(wslpath -w "$QA_RUN/report/index.html")"`로 Windows 브라우저에서 연다. 탐색기 주소창에 `\\wsl$\Ubuntu\home\<사용자>\qa-runs`를 넣어도 된다.
- **개발 서버**: WSL에서 띄운 `127.0.0.1:5100~5104`는 Windows 브라우저에서도 열린다.
- **VPN**: Windows에서 켠 회사 VPN을 WSL도 함께 쓴다. CMS·CRM이 안 열리면 VPN을 켠 뒤 `wsl --shutdown`으로 WSL을 다시 시작한다.
- **안드로이드**: 에뮬레이터는 Windows Android Studio에서 띄우고 Windows의 `adb.exe`로 다룬다([5. 안드로이드 준비](#5-안드로이드-준비폰tv-앱을-검수할-때만)). APK 빌드만 WSL 안의 SDK·JDK로 한다.
- **메모리**: APK 빌드는 메모리를 많이 쓴다. WSL이 죽으면 Windows 사용자 폴더의 `.wslconfig`에 `[wsl2]` `memory=8GB` 이상을 주고 `wsl --shutdown` 후 다시 연다.

## 2. 저장소와 검수 대상 준비

```bash
git clone https://github.com/yu-he7/qa-kit.git ~/projects/qa-kit
cd ~/projects/qa-kit
npm install
npx playwright install chromium
# Linux에서 브라우저 실행 라이브러리가 없다고 나오면 한 번 실행(sudo 필요)
npx playwright install-deps chromium
```

검수 대상 저장소는 `project.json`의 `reposRoot`(기본 `~/projects`) 아래에 **원래 저장소 이름 그대로** 클론해 둔다.
`qa wt`가 이 저장소들에서 `origin/<base>` 기준의 분리 워크트리를 만들기 때문이다. 각 저장소에 `git fetch` 권한이 있어야 한다.

레인보우TV(`projects/cmb`)는 다음 저장소가 필요하다. 검수하지 않는 앱은 생략해도 된다.

| 앱 키 | 저장소 | 종류 |
|---|---|---|
| web | rainbow-vue-web | 웹 |
| webmobile | rainbow-vue-webmobile | 모바일웹 |
| ctv | rainbow-vue-app | TV 웹앱(webOS) |
| cms | rainbow-vue-cms | 관리자 |
| crm | rainbow-vue-crm | 관리자 |
| app | rainbow-flutter-app | 안드로이드 폰 |
| tvapp | rainbow-flutter-tvapp | 안드로이드 TV |

## 3. 계정 파일

계정은 저장소 밖 파일에만 둔다. 경로는 `project.json`의 `accountsEnv`이고, 필요한 키는 `accountKeys`다.

```bash
mkdir -p ~/.config/cmb-dev
touch ~/.config/cmb-dev/accounts.env
chmod 600 ~/.config/cmb-dev/accounts.env
```

`KEY=value` 형식으로 채운다. 값은 팀에서 dev 테스트 계정을 받아 넣는다.

```
CMB_DEV_USER_ID=
CMB_DEV_USER_PW=
CMB_DEV_ADMIN_ID=
CMB_DEV_ADMIN_PW=
CMB_DEV_ADMIN_OTP=
CMB_DEV_MEMBER_KEYWORD=   # CRM 회원 검색 시나리오에서 찾을 dev 테스트 회원 이름
```

- 계정 값은 이 저장소, 실행 폴더, 로그, 메신저에 쓰지 않는다.
- 시나리오에 실명·계정 값을 직접 쓰지 않는다. 필요한 값은 이 파일에 키를 추가하고 `env.<KEY>`로 읽는다.
- 관리자 로그인은 매번 인증 문자를 보낸다. 시나리오는 50분 동안 로그인 세션을 재사용한다(`maxAgeMin`).

## 4. 내 PC에 맞게 고칠 설정

`projects/cmb/project.json`에는 작성자 PC 경로가 들어 있다. 자기 환경에 맞게 고친다.
이 수정은 개인 환경 값이므로 커밋하지 않는다.

| 항목 | 현재 값 | 바꿀 내용 |
|---|---|---|
| `reposRoot` | `~/projects` | 검수 대상 저장소를 클론한 폴더 |
| `adb` | Windows SDK의 `adb.exe` 경로 | 자기 adb 경로. Linux 네이티브 에뮬레이터면 `adb` 또는 빈 값 |
| `android.home` | `~/Android/Sdk` | WSL/Linux 쪽 Android SDK 경로 |
| `android.javaHome` | `~/.sdkman/candidates/java/17.0.20-tem` | JDK 17 경로 |
| `fvmVersions` | `~/fvm/versions` | fvm이 Flutter를 설치하는 폴더 |
| `apps.*.serial` | `emulator-5554` | `adb devices`에 나오는 기기 이름 |

안드로이드 시나리오(`scenarios/**/*.sh`)도 파일 안에 `A_SERIAL=emulator-5554`를 직접 적고 있다. 기기 이름이 다르면 시나리오의 값도 바꾼다.

## 5. 안드로이드 준비(폰·TV 앱을 검수할 때만)

1. JDK 17을 설치한다(sdkman 예: `sdk install java 17.0.20-tem`).
2. Android SDK의 `platform-tools`·`build-tools`·`platforms`를 설치하고 라이선스에 동의한다(`sdkmanager --licenses`).
3. fvm을 설치하고, 검수할 저장소의 `.fvmrc`에 적힌 Flutter 버전을 설치한다.
   ```bash
   cat ~/projects/rainbow-flutter-app/.fvmrc     # {"flutter": "3.x.y"}
   fvm install 3.x.y
   ```
4. 에뮬레이터를 띄운다. 폰 앱은 폰 이미지, TV 앱은 Android TV 이미지를 쓴다.
5. `adb devices`로 기기가 보이는지 확인한다.

**WSL에서 Windows 에뮬레이터를 쓰는 경우**: 에뮬레이터는 Windows Android Studio에서 띄우고,
`project.json`의 `adb`에 Windows의 `adb.exe` 경로(`/mnt/c/Users/<사용자>/AppData/Local/Android/Sdk/platform-tools/adb.exe`)를 넣는다.
APK 빌드는 WSL 안의 SDK·JDK로 한다. 빌드가 메모리 부족으로 죽지 않도록 `qa build`가 워크트리의 Gradle 메모리 설정을 줄인다.

## 6. 네트워크

- 검수는 dev 서버에서만 한다. 웹 시나리오는 `blockHosts`에 맞는 운영 서버 요청을 막고, 보고서에 요청한 서버 목록을 남긴다.
- CMS·CRM은 회사 VPN이 필요하다. WSL은 Windows에서 켠 VPN을 함께 쓴다.
- 레CTV(`ctv`)는 기본값이 운영 API다. 반드시 `qa patch ctv`로 dev를 보게 한 뒤 검수하고, 끝나면 `qa unpatch ctv`로 원복한다.

## 7. 설치 확인

웹 앱 하나로 처음부터 끝까지 돌려 본다.

```bash
cd ~/projects/qa-kit
bin/qa new cmb setup-check "설치 확인"
export QA_RUN=~/qa-runs/cmb-setup-check
bin/qa wt webmobile
bin/qa serve webmobile
bin/qa run projects/cmb/scenarios/2026-6th/webmobile-16169.js
bin/qa report          # $QA_RUN/report/index.html 을 브라우저로 연다
bin/qa status
bin/qa stop; bin/qa clean
```

정상이면 `PASS`/`INFO` 줄이 찍히고, 보고서에 사진·영상과 요청 서버(`*-dev` 호스트)가 나온다.
6차 시나리오는 6차 화면 기준이라, 이후 화면이 바뀌면 `FAIL`이 나올 수 있다. 이 경우 설치 문제가 아니라 기대 문구가 바뀐 것이다.

안드로이드는 다음으로 확인한다.

```bash
bin/qa wt app && bin/qa build app        # logs/build-app.log, APK 경로 출력
"$ADB" install -r <출력된 apk 경로>      # project.json 의 adb 경로
bin/qa run projects/cmb/scenarios/2026-6th/app-16162.sh
```

## 8. 6차 시나리오 준비 사항

`projects/cmb/scenarios/2026-6th/`의 시나리오별로 먼저 해 둘 일이다. 각 파일 머리 주석에도 같은 내용이 있다.
환경 변수는 앞에 붙여 넘긴다(예: `CASE=none bin/qa run .../webmobile-16348.js`).

| 시나리오 | 앱 | 준비 | 비고 |
|---|---|---|---|
| `web-16168.js` | web | `qa serve web` | |
| `webmobile-16169.js` | webmobile | `qa serve webmobile` | 설치 확인용으로 쓰기 좋다 |
| `webmobile-16348.js` | webmobile | `qa patch webmobile`, `qa serve webmobile`, 처음이면 `LOGIN=1` | `CASE=app-popup·settop-safari·none·invalid`. 장바구니·결제·주문 요청은 가짜 응답으로 가로챈다 |
| `ctv-16164-16167.js` | ctv | `qa patch ctv`, `qa serve ctv` | |
| `ctv-16347.js` | ctv | `qa patch ctv`, `qa serve ctv` | `DEVICE=tizen`이면 워크트리의 `src/api/checkVersion.js` deviceType을 `'tizen'`으로 직접 바꾼다. 문자 전송 요청은 가로챈다 |
| `ctv-bf-events.js` | ctv | `qa patch ctv`, `qa serve ctv` | 찜·댓글·리뷰를 dev에 실제로 남긴다. 끝나면 정리한다 |
| `cms-16170.js` | cms | VPN, `qa serve cms` | |
| `cms-16281-16282.js` | cms·crm | VPN, `qa serve cms crm` | 일부만 돌리려면 `node <파일> content`(또는 `menu`·`auth`·`crm`)로 직접 실행한다(`qa run`은 인자를 넘기지 않는다). 다운로드 이력·로그가 dev에 쌓인다 |
| `cms-16281-perf*.js` | cms | VPN, `qa serve cms`, dev에 2026-08 합성 데이터 적재 | 성능 측정 전용 |
| `crm-16171-16152.js`, `crm-16428.js` | crm | VPN, `qa serve crm`, 계정 파일 `CMB_DEV_MEMBER_KEYWORD` | |
| `app-16162.sh`, `app-16165.sh`, `app-16345.sh` | app | 폰 에뮬레이터, APK 설치 | 16345는 에뮬레이터 Chrome 원격 디버깅으로 열린 주소를 읽는다 |
| `tvapp-16163.sh`, `tvapp-16166.sh`, `tvapp-16346.sh` | tvapp | TV 에뮬레이터, APK 설치 | |

## 9. 자주 막히는 곳

| 증상 | 원인·조치 |
|---|---|
| `QA_RUN 이 없거나 run.json 이 없습니다` | 새 터미널에서 `export QA_RUN=...`를 다시 한다 |
| `npm ci` 실패(CRM) | node-sass가 Node 24에서 빌드되지 않는다. `project.json`의 CRM `install`은 설치 스크립트를 건너뛴다. 그대로 둔다 |
| `서버 기동 실패` | 포트(5100~5104)를 다른 프로세스가 쓰고 있다. `logs/vite-<app>.log` 확인, `bin/qa stop` |
| 모바일웹이 웹 도메인으로 넘어감 | 데스크톱 UA로 열었다. `deviceName: 'iPhone 13'`으로 연다 |
| `패치 대상 문구가 없습니다` | 대상 코드가 바뀌었다. `devPatches`의 `from`을 현재 코드에 맞춘다 |
| 안드로이드 `앱(...) 화면이 아님` | 앱이 안 떴거나 팝업에 가렸다. `a_texts`로 현재 화면 문구를 보고 시나리오를 고친다 |
| 관리자 로그인 반복 시 인증 문자가 계속 옴 | 세션 재사용 시간(`maxAgeMin`) 안에 다시 돌린다. `state/`를 지우지 않는다 |

## 10. 지켜야 할 것

- 시나리오 머리 주석의 `준비:`·`주의:`를 먼저 읽는다. `ctv-bf-events.js`는 BF 사건 확인용으로 찜·댓글·리뷰를 dev에 실제로 남기고, `cms-16281-perf*.js`는 합성 데이터를 적재한 상태에서만 의미가 있다.
- 저장·삭제·정지처럼 데이터를 바꾸는 버튼은 누르지 않는다. 조회·입력·모달 열기까지만 한다.
- 실행 폴더의 `state/`에는 로그인 토큰이 있다. 공유·커밋하지 않는다.
- 스크린샷·영상에 테스트 계정 정보가 찍힐 수 있다. 실행 폴더를 공유하기 전에 확인한다.
- 워크트리의 QA 전용 패치와 Gradle 설정 변경은 커밋하지 않는다. `qa clean`은 변경이 남은 워크트리를 건너뛴다.
