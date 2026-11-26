// ----------------------------------------------------------------------
// 접속 도메인 기반 테넌트 판정
//
// 멀티테넌트 SaaS에서는 접속 도메인이 곧 고객사다. 하나의 빌드가 어느 고객사 도메인으로
// 서빙될지 알 수 없다. 그래서 요청 시점에 Host로 테넌트 상태를 조회해 화면을 가른다.
//
//   ACTIVE      → 그대로 진행 (테넌트 정보는 쿠키로 내려 클라이언트가 재사용)
//   NOT_FOUND   → "등록되지 않은 도메인" 안내 (404)
//   UNAVAILABLE → "일시적인 장애" 안내 (503)
//
// 설계 포인트
// - 서버 장애를 '없는 테넌트'로 오인하지 않는다. 5xx·429·타임아웃·본문 파싱 실패는 모두
//   UNAVAILABLE이다. 이걸 NOT_FOUND로 보면 백엔드가 잠깐 흔들릴 때 모든 고객사에
//   "계약이 없는 도메인"이라는 화면이 뜬다.
// - ACTIVE·NOT_FOUND는 짧게 캐시하고 UNAVAILABLE은 캐시하지 않는다. 장애가 풀리면
//   다음 요청부터 바로 정상 화면이 나와야 하기 때문이다. TTL은 곧 "테넌트 중지가
//   화면에 반영되기까지의 최대 지연"이므로 짧게 둔다. 실제 차단은 백엔드가 한다.
// - 캐시가 빈 순간 동시에 들어온 요청(문서 + prefetch 등)은 조회 1건을 공유한다.
// - 캐시 키인 Host는 클라이언트가 임의로 보낼 수 있다. 항목 수에 상한을 둬 메모리를 보호한다.
// ----------------------------------------------------------------------

export type TenantStatus = 'ACTIVE' | 'NOT_FOUND' | 'UNAVAILABLE'

export interface TenantInfo {
  tenantId: string
  locale?: string
  timeZone?: string
}

export type TenantLookup =
  | { status: 'ACTIVE'; tenant: TenantInfo }
  | { status: 'NOT_FOUND' | 'UNAVAILABLE' }

/** 백엔드 tenant-info 응답의 최소 형태 */
interface TenantInfoBody {
  success?: boolean
  data?: { tenantId?: string; status?: string; locale?: string; timeZone?: string }
}

/** HTTP 상태와 본문으로 테넌트 상태를 가른다 (순수 함수) */
export function classifyTenantResponse(httpStatus: number, body: unknown): TenantLookup {
  if (httpStatus === 429 || httpStatus >= 500) return { status: 'UNAVAILABLE' }
  // JSON이 아니면 테넌트 부재를 확인할 수 없으므로 장애 쪽으로 분류한다
  if (!body || typeof body !== 'object') return { status: 'UNAVAILABLE' }

  const { success, data } = body as TenantInfoBody
  if (httpStatus === 200 && success && data?.status === 'ACTIVE' && data.tenantId) {
    const tenant: TenantInfo = { tenantId: data.tenantId }
    if (data.locale) tenant.locale = data.locale
    if (data.timeZone) tenant.timeZone = data.timeZone
    return { status: 'ACTIVE', tenant }
  }
  return { status: 'NOT_FOUND' }
}

/** Host 헤더를 캐시 키로 정규화한다: 소문자, 포트 제거 */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, '')
}

export interface TenantResolverOptions {
  /** Host로 백엔드를 조회한다. 네트워크 오류는 throw해도 된다 */
  fetchTenantInfo: (host: string) => Promise<{ status: number; body: unknown }>
  ttlMs?: Partial<Record<TenantStatus, number>>
  maxEntries?: number
  now?: () => number
}

export function createTenantResolver(options: TenantResolverOptions) {
  const { fetchTenantInfo, maxEntries = 500, now = Date.now } = options
  const ttl: Record<TenantStatus, number> = {
    ACTIVE: options.ttlMs?.ACTIVE ?? 30_000,
    NOT_FOUND: options.ttlMs?.NOT_FOUND ?? 30_000,
    UNAVAILABLE: 0 // 장애는 절대 캐시하지 않는다
  }

  const cache = new Map<string, { result: TenantLookup; expiresAt: number }>()
  const inFlight = new Map<string, Promise<TenantLookup>>()

  const store = (key: string, result: TenantLookup) => {
    const lifetime = ttl[result.status]
    if (lifetime <= 0) return
    const current = now()
    if (cache.size >= maxEntries) {
      for (const [k, entry] of cache) if (entry.expiresAt <= current) cache.delete(k)
      if (cache.size >= maxEntries) cache.clear()
    }
    cache.set(key, { result, expiresAt: current + lifetime })
  }

  const lookup = async (key: string): Promise<TenantLookup> => {
    try {
      const { status, body } = await fetchTenantInfo(key)
      return classifyTenantResponse(status, body)
    } catch {
      return { status: 'UNAVAILABLE' }
    }
  }

  return {
    async resolve(host: string): Promise<TenantLookup> {
      const key = normalizeHost(host)
      const cached = cache.get(key)
      if (cached && cached.expiresAt > now()) return cached.result

      const pending = inFlight.get(key)
      if (pending) return pending

      const request = lookup(key)
        .then((result) => {
          store(key, result)
          return result
        })
        .finally(() => inFlight.delete(key))
      inFlight.set(key, request)
      return request
    },
    /** 관리자 화면에서 테넌트 상태를 바꾼 직후 등 */
    invalidate(host?: string) {
      if (host) cache.delete(normalizeHost(host))
      else cache.clear()
    }
  }
}
