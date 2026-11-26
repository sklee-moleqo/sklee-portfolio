# 레이어 구조 · 아토믹 디자인

관리자 화면이 수십 개로 늘어나도 API 호출과 UI가 섞이지 않도록 정한 구조입니다.
시험 목록 화면 하나를 예로 전체 층을 보여줍니다.

## 레이어

```
UI → Domain Hook → React Query (useQuery / useMutation) + HTTP
```

| 층 | 위치 | 하는 일 | 하지 않는 일 |
|---|---|---|---|
| Route | [app/exams/page.tsx](app/exams/page.tsx) | URL과 화면 연결 | API 호출, 비즈니스 로직 |
| Domain UI | [sections/exam/](sections/exam/exam-list-view.tsx) | 화면 조립, 상태·이벤트, 도메인 표현(상태별 색·문구) | HTTP 직접 호출 |
| Data | [hooks/api/](hooks/api/use-exam-list.ts) | 엔드포인트, 응답 타입, 캐시 키, 화면용 모델 변환 | UI 렌더링 |

서버 응답 형태가 바뀌어도 Data 층의 `select` 변환만 고치면 되고, 화면 코드는 그대로입니다.

## 아토믹 디자인

| 단계 | 예제 | 기준 |
|---|---|---|
| atoms | [Button](components/atoms/button.tsx), [StatusBadge](components/atoms/status-badge.tsx) | 더 쪼갤 수 없음. 디자인 토큰만 앎 |
| molecules | [SearchField](components/molecules/search-field.tsx) | atom 몇 개로 하나의 동작을 만듦. 무엇을 검색하는지는 모름 |
| organisms | [DataTable](components/organisms/data-table.tsx) | 화면의 한 덩어리. 제네릭으로 도메인을 모름. 로딩·빈 결과·오류 표시를 통일 |
| sections | [ExamListView](sections/exam/exam-list-view.tsx) | 도메인 지식이 처음 들어오는 곳 |

공유 컴포넌트(atoms~organisms)는 도메인을 모르므로 관리자·응시자 앱이 함께 씁니다.

## 접근성

- 상태 배지는 색만으로 구분하지 않고 글자를 함께 표시
- 검색은 `role="search"`, 입력란은 `label`과 연결
- 표는 `caption`·`scope`, 로딩 중 `aria-busy`, 오류는 `role="alert"`
