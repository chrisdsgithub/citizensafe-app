import { auth } from '../../firebaseConfig';
import { Platform } from 'react-native';

// Base candidates for local development
// NOTE: updated automatically by dev helper to match current LAN IP (so physical devices can reach the backend)
const LAN_HOST = 'http://192.168.29.169:8080'; // Set this to your Mac's LAN IP
const ANDROID_EMULATOR_HOST = 'http://10.0.2.2:8080';
const IOS_SIM_HOST = 'http://127.0.0.1:8080';

// Optional remote endpoint for production
const CLOUD_RUN_BASE = 'http://10.67.140.162:8080'; // TODO: replace with HTTPS in prod

let resolvedApiBase: string | null = null;

// small fetch timeout helper
function fetchWithTimeout(resource: RequestInfo, options: any = {}) {
  const { timeout = 15000 } = options;  // Increased from 8000 to 15000ms

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  return fetch(resource, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

async function isHealthy(base: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${base}/healthz`, { timeout: 1200 });
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveApiBase(): Promise<string> {
  if (resolvedApiBase) return resolvedApiBase;

  const candidates: string[] = [];
  if (__DEV__) {
    if (Platform.OS === 'android') {
      // For Android emulator, prefer emulator gateway (10.0.2.2) first because
      // many devs run the Flask server locally and Android emulator maps localhost to 10.0.2.2.
      candidates.push(ANDROID_EMULATOR_HOST); // 10.0.2.2:8080 - emulator gateway
      candidates.push(LAN_HOST); // fallback: machine LAN IP
    } else if (Platform.OS === 'ios') {
      // iOS simulator can reach localhost directly
      candidates.push(IOS_SIM_HOST);
      candidates.push(LAN_HOST);
    } else {
      // Physical devices or unknown platform - try LAN first
      candidates.push(LAN_HOST);
    }
  }
  // Always include cloud as last resort (if reachable)
  candidates.push(CLOUD_RUN_BASE);

  for (const base of candidates) {
    try {
      console.log(`🔍 Prediction API - Trying: ${base}`);
      const ok = await isHealthy(base);
      if (ok) {
        resolvedApiBase = base;
        console.log('✅ Prediction API - Resolved Base:', base);
        return base;
      }
    } catch (e) {
      console.log(`❌ Prediction API - Failed: ${base}`, e);
      // ignore and try next
    }
  }
  // If none healthy, default to platform best guess (LAN IP for Android)
  resolvedApiBase = Platform.OS === 'android' ? LAN_HOST : IOS_SIM_HOST;
  console.log('⚠️  Prediction API - Using fallback:', resolvedApiBase);
  return resolvedApiBase;
}

export async function predictRisk(payload: { text: string; city?: string; time_of_occurrence?: string }) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not signed in');
  const idToken = await user.getIdToken();

  const base = await resolveApiBase();
  const url = `${base}/predict`;

  console.log('🔍 Prediction API - Platform:', Platform.OS);
  console.log('🔍 Prediction API - Using URL:', url);
  console.log('🔍 Prediction API - Payload:', payload);

  let res;
  try {
    const startTime = Date.now();
    console.log('🔍 Prediction API - Request starting...');
    
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
      timeout: 20000,  // Increased timeout to 20 seconds for slower connections
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Prediction API - Response received in ${duration}ms, status: ${res.status}`);
  } catch (e) {
    // Convert network/abort errors to a clearer message
    const msg = (e && (e as Error).message) || String(e);
    console.error('❌ Prediction API - Network error:', msg);
    
    // More helpful error message for Android emulator
    if (msg.includes('Aborted')) {
      console.error('⚠️  Request timed out or was aborted. Make sure:');
      console.error('   1. Flask server is running on http://127.0.0.1:8080');
      console.error('   2. Mac firewall allows port 8080 (System Preferences > Security & Privacy > Firewall)');
      console.error('   3. Android emulator can ping your Mac IP (check adb shell ping 10.0.2.2)');
    }
    
    throw new Error(`Network request failed to prediction service: ${msg}`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('❌ Prediction API - HTTP error:', res.status, body);
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const result = await res.json();
  console.log('✅ Prediction API - Success:', result);
  return result;
}

export async function detectFakeReport(payload: {
  report_text: string;
  officer_id: string;
  officer_credibility_score: number;
  location: string;
  time_of_occurrence: string;
}) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not signed in');
  const idToken = await user.getIdToken();

  const base = await resolveApiBase();
  const url = `${base}/detect-fake-report`;

  console.log('🔍 Fake Report Detection API - Using URL:', url);
  console.log('🔍 Fake Report Detection API - Payload:', payload);

  let res;
  try {
    const startTime = Date.now();
    console.log('🔍 Fake Report Detection API - Request starting...');
    
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
      timeout: 20000,
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Fake Report Detection API - Response received in ${duration}ms, status: ${res.status}`);
  } catch (e) {
    const msg = (e && (e as Error).message) || String(e);
    console.error('❌ Fake Report Detection API - Network error:', msg);
    throw new Error(`Network request failed to fake report detection service: ${msg}`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('❌ Fake Report Detection API - HTTP error:', res.status, body);
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const result = await res.json();
  console.log('✅ Fake Report Detection API - Success:', result);
  return result;
}

export async function predictCrimeType(payload: {
  // Accept either 'description' (preferred) or legacy 'text'
  description?: string;
  text?: string;
  location: string;
  sub_location: string;
  part_of_day: string;
  day_of_week: number;
  month: number;
}) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not signed in');
  const idToken = await user.getIdToken();

  const base = await resolveApiBase();
  const url = `${base}/predict-crime-type`;

  console.log('🔍 Crime Type Prediction API - Using URL:', url);
  console.log('🔍 Crime Type Prediction API - Payload:', payload);

  let res;
  try {
    const startTime = Date.now();
    console.log('🔍 Crime Type Prediction API - Request starting...');
    
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
      timeout: 20000,
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Crime Type Prediction API - Response received in ${duration}ms, status: ${res.status}`);
  } catch (e) {
    const msg = (e && (e as Error).message) || String(e);
    console.error('❌ Crime Type Prediction API - Network error:', msg);
    throw new Error(`Network request failed to crime type prediction service: ${msg}`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('❌ Crime Type Prediction API - HTTP error:', res.status, body);
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const result = await res.json();
  console.log('✅ Crime Type Prediction API - Success:', result);
  return result;
}
