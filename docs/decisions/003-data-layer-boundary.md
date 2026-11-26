# 003. UI와 HTTP 사이에 Data 층 두기

- 상태: 채택

## 배경

여러 명이 동시에 관리자 화면을 만들면서, 컴포넌트 안에서 HTTP를 직접 부르는 코드와 훅을 거치는
코드가 섞였습니다. 같은 목록을 다른 캐시 키로 불러 화면끼리 데이터가 어긋났고, 오류 안내 방식도
화면마다 달랐습니다.

## 결정

```
UI → Domain Hook → React Query (useQuery / useMutation) + HTTP
```

- `useQuery` / `useMutation`과 HTTP 클라이언트는 `hooks/api/`에서만 씁니다.
- 서버 응답 → 화면 모델 변환은 Data 층의 `select`에서 끝냅니다.
- Route(`app/`)는 URL과 화면을 잇기만 하고, 도메인 표현은 `sections/`에만 둡니다.
- 공유 컴포넌트는 아토믹 디자인 단계(atoms → molecules → organisms)로 나누고 도메인을 모르게 합니다.

## 결과

새 화면을 만들 때 "어디에 무엇을 둘지"를 고민하지 않게 되었고, 코드 리뷰에서 층 위반을 바로 짚을 수
있게 되었습니다. 캐시 키가 한 곳에서 관리되어 등록·수정 후 목록 갱신도 일관됩니다.
→ [samples/layered-architecture](../../samples/layered-architecture)
