@echo off
chcp 65001 >nul
rem 레이서 키우기 AI 스튜디오. 엔진(ai-dev-orchestrator)은 .studio\engine 에 받아 두고 GitHub에는 올리지 않는다.
cd /d "%~dp0"
if not exist ".studio\engine\orchd.mjs" (
  echo 스튜디오 엔진을 받아옵니다...
  git clone -q https://github.com/failab-ist/ai-dev-orchestrator.git ".studio\engine" || goto :fail
) else (
  echo 스튜디오 엔진을 최신으로 맞춥니다...
  git -C ".studio\engine" pull -q --ff-only || echo 최신으로 맞추지 못했습니다. 기존 엔진으로 실행합니다.
)
call ".studio\engine\start_studio.cmd" "%~dp0." %*
exit /b

:fail
echo 엔진을 받지 못했습니다. GitHub 로그인(GitHub Desktop)이 되어 있는지 확인하세요.
pause
