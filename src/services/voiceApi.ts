import { auth } from '../../firebaseConfig';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

// Base candidates for local development
const LAN_HOST = 'http://192.168.29.169:8080';
const ANDROID_EMULATOR_HOST = 'http://10.0.2.2:8080';
const IOS_SIM_HOST = 'http://127.0.0.1:8080';

// Optional remote endpoint for production
const CLOUD_RUN_BASE = 'http://10.67.140.162:8080';

let resolvedApiBase: string | null = null;

function fetchWithTimeout(resource: RequestInfo, options: any = {}) {
  const { timeout = 30000 } = options;  // Increased to 30s for audio processing

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  return fetch(resource, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

async function resolveApiBase(): Promise<string> {
  if (resolvedApiBase) return resolvedApiBase;

  const candidates: string[] = [];
  if (__DEV__) {
    if (Platform.OS === 'android') {
      // Try LAN IP first, then fallback to emulator gateway
      candidates.push(LAN_HOST);
      candidates.push(ANDROID_EMULATOR_HOST);
    } else {
      candidates.push(IOS_SIM_HOST);
      candidates.push(LAN_HOST);
    }
  }
  candidates.push(CLOUD_RUN_BASE);

  for (const base of candidates) {
    try {
      console.log(`🎤 Voice API - Trying: ${base}`);
      const res = await fetchWithTimeout(`${base}/healthz`, { timeout: 2000 });
      if (res.ok) {
        resolvedApiBase = base;
        console.log('✅ Voice API - Resolved Base:', base);
        return base;
      }
    } catch (e) {
      console.log(`❌ Voice API - Failed: ${base}`);
    }
  }

  // If nothing works, use LAN for Android with warning
  resolvedApiBase = Platform.OS === 'android' ? LAN_HOST : IOS_SIM_HOST;
  console.log('⚠️  Voice API - Using fallback:', resolvedApiBase);
  return resolvedApiBase;
}

export async function analyzeVoiceSentiment(audioUri: string) {
  let user = auth.currentUser;
  let idToken = '';
  
  if (user) {
    console.log('🎤 Voice API - Getting auth token...');
    try {
      idToken = await user.getIdToken();
    } catch (tokenErr) {
      console.warn('🎤 Voice API - Could not get token, will try without auth:', tokenErr);
      idToken = '';
    }
  } else {
    console.warn('🎤 Voice API - No user signed in, will try without auth');
  }

  let base = await resolveApiBase();
  let url = `${base}/analyze-voice`;

  console.log('🎤 Voice API - Platform:', Platform.OS);
  console.log('🎤 Voice API - Using URL:', url);
  console.log('🎤 Voice API - Audio URI:', audioUri);

  try {
    console.log('🎤 Voice API - Reading file from URI...');
    
    // Read file
    let response;
    try {
      response = await fetch(audioUri);
      console.log('🎤 Voice API - Fetch succeeded. Response status:', response.status);
    } catch (err) {
      console.error('🎤 Voice API - Fetch failed:', err);
      throw new Error(`File read failed: ${err}`);
    }
    
    if (!response.ok) {
      throw new Error(`File read failed with status ${response.status}`);
    }

    let blob: Blob;
    try {
      blob = await response.blob();
      console.log('🎤 Voice API - Blob created. Size:', blob.size, 'Type:', blob.type);
    } catch (err) {
      console.error('🎤 Voice API - Blob creation failed:', err);
      throw new Error(`Blob creation failed: ${err}`);
    }
    
    if (blob.size === 0) {
      throw new Error('Audio file is empty');
    }

    console.log('🎤 Voice API - Preparing fetch request to:', url);
    console.log('🎤 Voice API - Token length:', idToken.length);

    // Try with FormData first
    console.log('🎤 Voice API - Attempting with FormData...');
    const formData = new FormData();
    const filename = audioUri.split('/').pop() || 'audio.ogg';
    formData.append('audio', blob, filename);
    
    const startTime = Date.now();
    let res: Response;
    
    try {
      console.log('🎤 Voice API - Sending FormData POST...');
      res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: idToken ? {
          'Authorization': `Bearer ${idToken}`,
        } : {},
        body: formData,
        timeout: 30000,
      });
      console.log('🎤 Voice API - FormData request succeeded in', Date.now() - startTime, 'ms');
    } catch (formDataErr) {
      console.log('🎤 Voice API - FormData failed, trying with raw blob...');
      // Silently log FormData error without showing it
      
      // Fallback: send raw blob
      try {
        console.log('🎤 Voice API - Sending raw blob POST...');
        res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
            'Content-Type': 'audio/ogg',
            'X-Filename': filename,
          },
          body: blob,
          timeout: 30000,
        });
        console.log('🎤 Voice API - Raw blob request succeeded in', Date.now() - startTime, 'ms');
      } catch (blobErr) {
        console.log('🎤 Voice API - Raw blob request also failed');
        throw new Error(`Request failed: ${formDataErr}`);
      }
    }

    console.log('✅ Voice API - Response status:', res.status);

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const errorData = await res.json();
        errorMsg = errorData.error || errorMsg;
        console.error('❌ Voice API - Server error:', errorData);
      } catch (e) {
        try {
          const text = await res.text();
          console.error('❌ Voice API - Server response text:', text.substring(0, 200));
          if (text) errorMsg = text.substring(0, 200);
        } catch (e2) {
          console.error('❌ Voice API - Could not read response');
        }
      }
      throw new Error(errorMsg);
    }

    console.log('🎤 Voice API - Parsing JSON response...');
    let result;
    try {
      result = await res.json();
      console.log('✅ Voice API - JSON parsed successfully');
    } catch (parseErr) {
      console.error('❌ Voice API - JSON parse error:', parseErr);
      try {
        const text = await res.text();
        console.log('🎤 Voice API - Raw response:', text.substring(0, 500));
      } catch (e) {
        console.error('❌ Voice API - Could not read response body');
      }
      throw new Error(`Failed to parse response: ${parseErr}`);
    }
    
    console.log('✅ Voice API - Success:', result);
    return result;
  } catch (e) {
    const msg = (e && (e as Error).message) || String(e);
    console.error('❌ Voice API - Final error:', msg);
    throw new Error(`Voice analysis failed: ${msg}`);
  }
}

/**
 * Pick an audio file using expo-document-picker
 * Supports WAV, MP3, OGG, M4A
 */
export async function pickAudioFile() {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/*', 'audio/wav', 'audio/mp3', 'audio/ogg', 'audio/m4a'],
    });

    if (result.canceled) {
      return null;
    }

    const asset = result.assets[0];
    console.log('🎤 Audio file selected:', asset.name, asset.size, 'bytes');
    
    return {
      uri: asset.uri,
      name: asset.name,
      size: asset.size,
      mimeType: asset.mimeType,
    };
  } catch (e) {
    console.error('❌ Error picking audio file:', e);
    throw e;
  }
}
