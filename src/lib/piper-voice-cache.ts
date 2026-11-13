import { logger as console } from './logger';

interface CachedVoice {
  config: unknown;
  model: Blob;
  configEtag: string | null;
  modelEtag: string | null;
}

export interface VoiceDownloadProgress {
  percent: number | null;
  remainingMs: number;
}

type ProgressCallback = (progress: VoiceDownloadProgress | null) => void;

const databaseName = 'sunny-piper-voices';
const storeName = 'voices';
const baseUrl = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Piper voice cache database is blocked.'));
  });
}

async function readVoice(voice: string): Promise<CachedVoice | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(storeName).objectStore(storeName).get(voice);
      request.onsuccess = () => resolve(request.result as CachedVoice | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function writeVoice(voice: string, value: CachedVoice): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(value, voice);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

function voiceUrls(voice: string): [string, string] {
  const parts = voice.split('-');
  const path = `${baseUrl}${parts[0].split('_')[0]}/${parts.join('/')}/${parts.join('-')}`;
  return [`${path}.onnx.json`, `${path}.onnx`];
}

async function checkedFetch(url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<Response> {
  const response = await fetch(url, { method, cache: 'no-cache' });
  if (!response.ok) throw new Error(`Piper voice request failed (${response.status}): ${url}`);
  return response;
}

function sameEtag(first: string | null, second: string | null): boolean {
  return (
    first !== null && second !== null && first.replace(/^W\//, '') === second.replace(/^W\//, '')
  );
}

async function downloadVoice(
  urls: [string, string],
  onProgress: ProgressCallback,
): Promise<CachedVoice> {
  onProgress({ percent: null, remainingMs: 0 });
  try {
    const [configResponse, modelResponse] = await Promise.all(urls.map((url) => checkedFetch(url)));
    const total = Number(modelResponse.headers.get('content-length'));
    const reader = modelResponse.body?.getReader();
    const chunks: BlobPart[] = [];
    const started = performance.now();
    let received = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        const elapsed = performance.now() - started;
        const percent = total > 0 ? Math.min(100, (received / total) * 100) : null;
        onProgress({
          percent,
          remainingMs:
            percent !== null && received > 0
              ? Math.max(0, (elapsed * (total - received)) / received)
              : 0,
        });
      }
    } else {
      chunks.push(await modelResponse.blob());
    }
    const [config, model] = await Promise.all([
      configResponse.json(),
      Promise.resolve(new Blob(chunks, { type: 'application/octet-stream' })),
    ]);
    if (!model.size) throw new Error('Piper voice model is empty.');
    return {
      config,
      model,
      configEtag: configResponse.headers.get('etag'),
      modelEtag: modelResponse.headers.get('etag'),
    };
  } finally {
    onProgress(null);
  }
}

async function refreshVoice(
  voice: string,
  cached: CachedVoice,
  urls: [string, string],
  onProgress: ProgressCallback,
) {
  const [configResponse, modelResponse] = await Promise.all(
    urls.map((url) => checkedFetch(url, 'HEAD')),
  );
  const configEtag = configResponse.headers.get('etag');
  const modelEtag = modelResponse.headers.get('etag');
  if (!configEtag || !modelEtag || !cached.configEtag || !cached.modelEtag) {
    throw new Error('Piper voice update check requires ETag headers.');
  }
  if (sameEtag(configEtag, cached.configEtag) && sameEtag(modelEtag, cached.modelEtag)) return;
  const updated = await downloadVoice(urls, onProgress);
  if (!sameEtag(updated.configEtag, configEtag) || !sameEtag(updated.modelEtag, modelEtag)) {
    throw new Error('Piper voice changed during the update; the cached voice was kept.');
  }
  await writeVoice(voice, updated);
  console.log('[Sunny] Piper voice cache updated for the next session');
}

export class CachedPiperVoiceProvider {
  private voices = new Map<string, Promise<[unknown, string]>>();
  private objectUrls = new Set<string>();
  private destroyed = false;
  private onProgress: ProgressCallback;

  constructor(onProgress: ProgressCallback) {
    this.onProgress = onProgress;
  }

  fetch(voice: string): Promise<[unknown, string]> {
    let result = this.voices.get(voice);
    if (!result) {
      result = this.load(voice).catch((error: unknown) => {
        this.voices.delete(voice);
        throw error;
      });
      this.voices.set(voice, result);
    }
    return result;
  }

  private async load(voice: string): Promise<[unknown, string]> {
    const urls = voiceUrls(voice);
    let cached: CachedVoice | undefined;
    try {
      cached = await readVoice(voice);
    } catch (error) {
      console.warn('[Sunny] Piper voice cache read failed:', error);
    }
    if (cached) {
      void refreshVoice(voice, cached, urls, this.reportProgress).catch((error: unknown) => {
        console.warn('[Sunny] Piper voice cache update failed:', error);
      });
    } else {
      cached = await downloadVoice(urls, this.reportProgress);
      try {
        await writeVoice(voice, cached);
      } catch (error) {
        console.warn('[Sunny] Piper voice cache write failed:', error);
      }
    }
    if (this.destroyed) throw new Error('Piper voice provider was destroyed.');
    const url = URL.createObjectURL(cached.model);
    this.objectUrls.add(url);
    return [cached.config, url];
  }

  private reportProgress = (progress: VoiceDownloadProgress | null) => {
    if (!this.destroyed) this.onProgress(progress);
  };

  destroy() {
    this.destroyed = true;
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.voices.clear();
  }
}
