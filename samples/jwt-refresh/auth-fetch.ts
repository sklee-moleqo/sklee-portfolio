// ----------------------------------------------------------------------
// JWT 자동 재발급 fetch 래퍼
//
// 화면 여러 곳에서 동시에 API를 부르다 access token이 만료되면 401이 한꺼번에 돌아온다.
// 요청마다 재발급을 부르면 refresh token이 회전(rotation)되는 서버에서는 두 번째 요청부터
// "이미 사용된 refresh token"으로 실패해 사용자가 로그아웃된다.
//
// 이 모듈이 지키는 규칙
// 1. 재발급은 동시에 한 번만 (single-flight). 나머지 401 요청은 그 결과를 기다렸다 재시도한다.
// 2. 원 요청은 한 번만 재시도한다. 새 토큰으로도 401이면 그대로 실패시킨다(무한 루프 방지).
// 3. 서버가 "세션 종료"를 확정한 응답은 재발급을 시도하지 않고 종료 처리를 한 번만 호출한다.
// 4. 재발급이 끝나기 전에 로그아웃·재로그인이 일어났다면(세대가 바뀜) 늦게 온 토큰을 버린다.
//    다른 탭·다른 계정의 세션을 이전 토큰으로 덮어쓰지 않기 위해서다.
// ----------------------------------------------------------------------

export type SessionEndReason = 'refresh-failed' | 'session-expired'

export interface AuthFetchOptions {
  /** 매 요청 직전에 현재 access token을 읽는다 (쿠키 등 단일 원본에서) */
  getAccessToken: () => string | null
  /** refresh token으로 새 access token을 받는다. 실패하면 null 또는 throw */
  refresh: () => Promise<string | null>
  /** 세션이 끝났을 때 한 번만 호출된다 (로그인 화면 이동 등은 앱이 정한다) */
  onSessionEnd: (reason: SessionEndReason) => void
  /** 로그인·회원가입처럼 토큰 없이 부르는 API. 401이어도 재발급하지 않는다 */
  isPublicUrl?: (url: string) => boolean
  /** 재발급 API 주소. 이 API의 401은 재발급 대상이 아니다 */
  refreshUrl?: string
  /** 서버가 세션 종료를 확정할 때 응답 본문 code에 담는 값 */
  sessionEndCodes?: readonly string[]
  /** 테스트에서 가짜 fetch를 주입한다 */
  fetchImpl?: typeof fetch
}

export interface AuthFetch {
  (url: string, init?: RequestInit): Promise<Response>
  /** 로그인 성공 시 호출: 이전 세션의 종료 상태와 진행 중인 재발급 결과를 무효화한다 */
  startSession: () => void
}

export function createAuthFetch(options: AuthFetchOptions): AuthFetch {
  const {
    getAccessToken,
    refresh,
    onSessionEnd,
    isPublicUrl = () => false,
    refreshUrl = '/auth/refresh',
    sessionEndCodes = [],
    fetchImpl = (...args) => fetch(...args)
  } = options

  /** 로그인·로그아웃마다 올라가는 세션 세대 */
  let generation = 0
  let sessionEnded = false
  let refreshing: Promise<string | null> | null = null

  const endSession = (reason: SessionEndReason) => {
    if (sessionEnded) return
    sessionEnded = true
    generation += 1
    refreshing = null
    onSessionEnd(reason)
  }

  const send = (url: string, init: RequestInit | undefined, token: string | null) => {
    const headers = new Headers(init?.headers)
    if (token && !headers.has('Authorization') && !isPublicUrl(url)) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    return fetchImpl(url, { ...init, headers })
  }

  /** 진행 중인 재발급이 있으면 그 결과를 함께 기다린다 */
  const refreshOnce = (): Promise<string | null> => {
    if (!refreshing) {
      refreshing = refresh()
        .catch(() => null)
        .finally(() => {
          refreshing = null
        })
    }
    return refreshing
  }

  const authFetch = (async (url, init) => {
    const response = await send(url, init, getAccessToken())
    if (response.status !== 401) return response
    if (isPublicUrl(url) || url.startsWith(refreshUrl)) return response

    const code = await readErrorCode(response)
    if (code && sessionEndCodes.includes(code)) {
      endSession('session-expired')
      return response
    }
    if (sessionEnded) return response

    const startedAt = generation
    const token = await refreshOnce()

    // 기다리는 동안 세션이 끝났거나 새 세션이 시작됐다: 이 토큰은 지금 세션의 것이 아니다
    if (generation !== startedAt) return response
    if (!token) {
      endSession('refresh-failed')
      return response
    }

    // 재시도는 한 번만. 새 토큰을 명시해 보내므로 다시 401이 와도 이 분기로 돌아오지 않는다
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetchImpl(url, { ...init, headers })
  }) as AuthFetch

  authFetch.startSession = () => {
    sessionEnded = false
    generation += 1
    refreshing = null
  }

  return authFetch
}

/** 401 본문의 code를 읽는다. 원 응답은 호출부가 다시 읽을 수 있게 clone으로 읽는다 */
async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json()
    if (body && typeof body === 'object' && 'code' in body) {
      const { code } = body as { code: unknown }
      return typeof code === 'string' ? code : null
    }
  } catch {
    // 본문이 JSON이 아니면 일반 401로 본다
  }
  return null
}
