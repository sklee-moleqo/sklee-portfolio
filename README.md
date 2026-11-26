# 이성규 · Frontend Engineer 포트폴리오 코드

> 실무에서 직접 설계하고 운영한 프론트엔드 구조를 **회사 코드 없이 처음부터 다시 작성**한 예제 모음입니다.
> 회사 소스는 비공개이므로 같은 문제를 같은 방식으로 푼 독립 구현만 담았습니다.

- 이력서: https://sklee-resume.vercel.app
- 바탕이 된 프로젝트: **NeoTEST Plus**, 멀티테넌트 온라인 평가(CBT) 플랫폼의 관리자·응시자 웹
  (2025.12 – 운영 중, 프론트엔드 개발 PL, 팀 내 최다 커밋 1,268건)

## 한눈에 보기

| 예제 | 어떤 문제를 풀었나 | 핵심 기술 |
|---|---|---|
| [JWT 자동 재발급](samples/jwt-refresh) | 토큰이 만료되는 순간 동시에 터지는 401 때문에 사용자가 로그아웃되던 문제 | single-flight 재발급, 1회 재시도, 세션 세대 검증 |
| [멀티테넌트 판정](samples/tenant-resolver) | 접속 도메인으로 고객사를 가르면서, 백엔드 장애를 "없는 고객사"로 잘못 보여주지 않기 | Next.js Middleware, 상태별 TTL 캐시, 중복 조회 병합 |
| [AI 채점 추천](samples/ai-assist) | 응답이 수십 초 걸리는 AI 채점의 중복 요청·무한 로딩·늦게 온 결과 덮어쓰기 | 작업 폴링, 지수 백오프, 타임아웃, AbortSignal |
| [레이어 구조 · 아토믹 디자인](samples/layered-architecture) | 화면이 수십 개로 늘어도 API 호출과 UI가 뒤섞이지 않게 하기 | Route → Domain UI → Data Hook, atoms / molecules / organisms, React Query |

모든 예제는 TypeScript strict 모드로 작성했고, 로직 예제 3개에는 동작을 증명하는 테스트(16개)가 있습니다.

```bash
npm install
npm test        # 타입 검사 + 테스트 16개
```

## 담당 역할 (NeoTEST Plus)

- **기획 · UI 설계**: 관리자·응시자 화면 흐름과 공통 UI 규칙 설계
- **초기 프레임워크 구축**: Next.js App Router 모노레포(pnpm workspaces), 공유 패키지(UI·레이아웃·인증·다국어) 구성
- **멀티테넌트 구조**: 도메인 기반 테넌트 판정, 테넌트별 언어·시간대, 빌드 결과물이 도메인을 모르는 런타임 설정
- **인증**: JWT access/refresh 토큰 재발급, 세션 유휴 만료, 관리자·응시자 스코프 분리
- **AI 연동**: 서술형 AI 채점 추천, 루브릭 근거 표시, 자동 채점 지연·실패 복구
- **CI/CD · 운영**: Docker 빌드, STG·운영 배포, 정식 오픈 후 고도화

자세한 설계 배경은 [docs/architecture.md](docs/architecture.md)와 [설계 결정 기록](docs/decisions)에 있습니다.

## 이 저장소에 없는 것

회사 소스, 실제 API 주소·응답 코드·쿠키 이름, 고객사 정보는 넣지 않았습니다.
예제의 이름과 데이터 형태는 설명을 위해 새로 정한 것입니다.
