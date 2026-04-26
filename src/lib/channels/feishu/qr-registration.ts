/**
 * Feishu / Lark personal-bot QR registration flow.
 *
 * Drives the same `/oauth/v1/app/registration` device-code flow used by
 * the standalone `feishu-bot-qr` CLI. Returns ready-to-use App ID and
 * App Secret after the user scans + confirms in the Feishu app.
 *
 * Sessions are kept in `globalThis` so they survive Next.js HMR.
 */
import QRCode from 'qrcode';

type FeishuEnv = 'prod' | 'boe' | 'pre';
type FeishuBrand = 'feishu' | 'lark';

const ENV_URLS: Record<FeishuBrand, Record<FeishuEnv, string>> = {
  feishu: {
    prod: 'accounts.feishu.cn',
    boe: 'accounts.feishu-boe.cn',
    pre: 'accounts.feishu-pre.cn',
  },
  lark: {
    prod: 'accounts.larksuite.com',
    boe: 'accounts.larksuite-boe.com',
    pre: 'accounts.larksuite-pre.com',
  },
};

const REG_PATH = '/oauth/v1/app/registration';
const SESSION_TTL_MS = 30 * 60_000;

export type FeishuRegistrationStatus =
  | 'waiting'
  | 'scanned'
  | 'confirmed'
  | 'expired'
  | 'failed';

export interface FeishuRegistrationResult {
  appId: string;
  appSecret: string;
  domain: FeishuBrand;
  openId?: string;
}

interface FeishuRegistrationSession {
  sessionId: string;
  env: FeishuEnv;
  host: string;
  domainBrand: FeishuBrand;
  domainSwitched: boolean;
  deviceCode: string;
  verificationUri: string;
  qrImage: string;
  startedAt: number;
  expireAt: number;
  interval: number;
  status: FeishuRegistrationStatus;
  result?: FeishuRegistrationResult;
  error?: string;
  lastPollAt: number;
}

const GLOBAL_KEY = '__feishu_qr_registration_sessions__';

function getSessions(): Map<string, FeishuRegistrationSession> {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, FeishuRegistrationSession>();
  }
  return g[GLOBAL_KEY] as Map<string, FeishuRegistrationSession>;
}

interface RegistrationResponse {
  device_code?: string;
  verification_uri_complete?: string;
  expire_in?: number;
  interval?: number;
  client_id?: string;
  client_secret?: string;
  user_info?: {
    open_id?: string;
    tenant_brand?: string;
  };
  supported_auth_methods?: string[];
  error?: string;
  error_description?: string;
}

async function postForm(
  host: string,
  path: string,
  form: Record<string, string>,
): Promise<{ status: number; data: RegistrationResponse }> {
  const body = new URLSearchParams(form).toString();
  const res = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  let data: RegistrationResponse = {};
  try {
    data = (await res.json()) as RegistrationResponse;
  } catch {
    data = {};
  }
  return { status: res.status, data };
}

/**
 * Start a new registration session.
 * Calls init + begin and returns the QR data URL for the client to render.
 */
export async function startRegistrationSession(
  env: FeishuEnv = 'prod',
): Promise<{
  sessionId: string;
  qrImage: string;
  verificationUri: string;
  expireIn: number;
  interval: number;
}> {
  const host = ENV_URLS.feishu[env];
  if (!host) {
    throw new Error(`Unknown Feishu env: ${env}`);
  }

  const init = await postForm(host, REG_PATH, { action: 'init' });
  if (!init.data.supported_auth_methods?.includes('client_secret')) {
    throw new Error('Feishu does not support client_secret registration in this environment.');
  }

  const begin = await postForm(host, REG_PATH, {
    action: 'begin',
    archetype: 'PersonalAgent',
    auth_method: 'client_secret',
    request_user_info: 'open_id',
  });

  if (!begin.data.device_code || !begin.data.verification_uri_complete) {
    const detail = begin.data.error_description || begin.data.error || 'unknown';
    throw new Error(`Failed to begin registration: ${detail}`);
  }

  const qrUrl = new URL(begin.data.verification_uri_complete);
  qrUrl.searchParams.set('from', 'onboard');
  const verificationUri = qrUrl.toString();
  const qrImage = await QRCode.toDataURL(verificationUri, { width: 256, margin: 2 });

  const sessionId = `feishu_qr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const expireIn = Number(begin.data.expire_in) || 600;
  const interval = Number(begin.data.interval) || 5;

  const session: FeishuRegistrationSession = {
    sessionId,
    env,
    host,
    domainBrand: 'feishu',
    domainSwitched: false,
    deviceCode: begin.data.device_code,
    verificationUri,
    qrImage,
    startedAt: Date.now(),
    expireAt: Date.now() + expireIn * 1000,
    interval,
    status: 'waiting',
    lastPollAt: 0,
  };

  getSessions().set(sessionId, session);
  setTimeout(() => getSessions().delete(sessionId), SESSION_TTL_MS);

  return { sessionId, qrImage, verificationUri, expireIn, interval };
}

/**
 * Poll the upstream registration endpoint and update session state.
 * Safe to call repeatedly; respects the session's interval.
 */
export async function pollRegistrationSession(
  sessionId: string,
): Promise<FeishuRegistrationSession> {
  const session = getSessions().get(sessionId);
  if (!session) {
    return {
      sessionId,
      env: 'prod',
      host: '',
      domainBrand: 'feishu',
      domainSwitched: false,
      deviceCode: '',
      verificationUri: '',
      qrImage: '',
      startedAt: 0,
      expireAt: 0,
      interval: 5,
      status: 'failed',
      error: 'session_not_found',
      lastPollAt: 0,
    };
  }

  if (session.status === 'confirmed' || session.status === 'failed' || session.status === 'expired') {
    return session;
  }

  if (Date.now() > session.expireAt) {
    session.status = 'expired';
    session.error = 'expired_token';
    return session;
  }

  // Throttle so the UI can poll faster than the upstream allows without
  // burning quota; we still relay status from the cached session in between.
  const now = Date.now();
  if (session.lastPollAt > 0 && now - session.lastPollAt < session.interval * 1000) {
    return session;
  }
  session.lastPollAt = now;

  try {
    const { data } = await postForm(session.host, REG_PATH, {
      action: 'poll',
      device_code: session.deviceCode,
    });

    // Brand switch: once we know the user is on Lark, all subsequent calls
    // must hit the Lark host. We only switch once.
    if (
      !session.domainSwitched &&
      data.user_info?.tenant_brand === 'lark'
    ) {
      session.host = ENV_URLS.lark[session.env];
      session.domainBrand = 'lark';
      session.domainSwitched = true;
      if (session.status === 'waiting') {
        session.status = 'scanned';
      }
      return session;
    }

    if (data.client_id && data.client_secret) {
      session.status = 'confirmed';
      session.result = {
        appId: data.client_id,
        appSecret: data.client_secret,
        domain: session.domainBrand,
        openId: data.user_info?.open_id,
      };
      return session;
    }

    if (data.error) {
      switch (data.error) {
        case 'authorization_pending':
          if (data.user_info && session.status === 'waiting') {
            session.status = 'scanned';
          }
          break;
        case 'slow_down':
          session.interval += 5;
          break;
        case 'access_denied':
          session.status = 'failed';
          session.error = 'access_denied';
          break;
        case 'expired_token':
          session.status = 'expired';
          session.error = 'expired_token';
          break;
        default:
          session.status = 'failed';
          session.error = data.error_description || data.error;
      }
    } else if (data.user_info && session.status === 'waiting') {
      session.status = 'scanned';
    }
  } catch (err) {
    // Network blips are non-fatal; let the next poll retry.
    console.warn(
      '[feishu-qr-registration] poll error:',
      err instanceof Error ? err.message : err,
    );
  }

  return session;
}

export function cancelRegistrationSession(sessionId: string): void {
  getSessions().delete(sessionId);
}
