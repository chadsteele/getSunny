<script lang="ts">
  import { logger as console } from '../lib/logger';

  interface Props {
    active: boolean;
    silenceTimeoutMs: number;
    onTranscript: (transcript: string) => void;
    onInterimTranscript: (transcript: string) => void;
    onRetry: (attempt: number, maxAttempts: number) => void;
    onReady: () => void;
    onError: (error: unknown) => void;
  }

  type SpeechRecognitionResultLike = { transcript: string };
  type SpeechRecognitionEventLike = Event & {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: SpeechRecognitionResultLike }>;
  };
  type SpeechRecognitionErrorEventLike = Event & { error: string; message?: string };
  type SpeechRecognitionLike = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    start: () => void;
    stop: () => void;
  };
  type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

  let {
    active,
    silenceTimeoutMs,
    onTranscript,
    onInterimTranscript,
    onRetry,
    onReady,
    onError,
  }: Props = $props();
  let recognition: SpeechRecognitionLike | undefined;
  let restartBlocked = true;
  let pendingFinal = '';
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryAttempts = 0;
  const maxRetryAttempts = 3;
  const retryDelayMs = 1000;

  function clearSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = undefined;
  }

  function stopRecognition() {
    restartBlocked = true;
    clearSilenceTimer();
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    retryAttempts = 0;
    recognition?.stop();
    recognition = undefined;
  }

  function retryRecognition(reason: string) {
    if (!active || restartBlocked || retryTimer !== undefined) return;
    clearSilenceTimer();
    recognition = undefined;
    if (retryAttempts >= maxRetryAttempts) {
      restartBlocked = true;
      onError(
        new Error(
          `Speech recognition failed after ${maxRetryAttempts} retries (${reason}). Check microphone permission and try again.`,
        ),
      );
      return;
    }
    retryAttempts += 1;
    console.warn(
      `[Sunny] Resetting speech recognition after ${reason}; retry ${retryAttempts}/${maxRetryAttempts} in ${retryDelayMs}ms.`,
    );
    onRetry(retryAttempts, maxRetryAttempts);
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (active && !restartBlocked) startRecognition();
    }, retryDelayMs);
  }

  function scheduleTranscript() {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      silenceTimer = undefined;
      const transcript = pendingFinal.trim();
      if (!active || !transcript) return;
      pendingFinal = '';
      restartBlocked = true;
      recognition?.stop();
      onInterimTranscript('');
      onTranscript(transcript);
    }, silenceTimeoutMs);
  }

  function startRecognition() {
    if (!active || recognition) return;

    const browserWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      restartBlocked = true;
      onError(new Error('Browser speech recognition is not supported. Try Chrome or Edge.'));
      return;
    }

    restartBlocked = false;
    const currentRecognition = new Recognition();
    recognition = currentRecognition;
    currentRecognition.continuous = true;
    currentRecognition.interimResults = true;
    currentRecognition.lang = navigator.language || 'en-US';
    currentRecognition.onstart = () => {
      if (recognition !== currentRecognition || restartBlocked) return;
      console.log('[Sunny] Speech recognition listening:', currentRecognition.lang);
      onReady();
      if (pendingFinal.trim()) scheduleTranscript();
    };
    currentRecognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (recognition !== currentRecognition || restartBlocked) return;
      retryAttempts = 0;
      let interim = '';
      let finalized = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalized += result[0].transcript;
        else interim += result[0].transcript;
      }

      if (finalized.trim()) pendingFinal = `${pendingFinal} ${finalized}`.trim();
      const transcript = `${pendingFinal} ${interim}`.trim();
      if (transcript) onInterimTranscript(transcript);
      if (finalized.trim() || interim.trim()) scheduleTranscript();
    };
    currentRecognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (recognition !== currentRecognition || restartBlocked || !active) return;
      console.warn('[Sunny] Speech recognition error:', {
        error: event.error,
        message: event.message || '(browser did not provide details)',
        language: currentRecognition.lang,
        retryAttempts,
        hasPendingTranscript: Boolean(pendingFinal.trim()),
      });
      if (event.error === 'no-speech') return;
      if (event.error === 'aborted') {
        retryRecognition(event.error);
        return;
      }
      restartBlocked = true;
      onError(
        new Error(
          `Speech recognition failed: ${event.error}${event.message ? ` (${event.message})` : ''}`,
        ),
      );
    };
    currentRecognition.onend = () => {
      if (recognition !== currentRecognition) return;
      recognition = undefined;
      if (active && !restartBlocked) {
        console.log('[Sunny] Speech recognition ended; restarting');
        startRecognition();
      }
    };

    try {
      currentRecognition.start();
      console.log('[Sunny] Speech recognition started');
    } catch (error) {
      console.error('[Sunny] Speech recognition could not start:', error);
      retryRecognition(error instanceof Error ? error.message : 'startup error');
    }
  }

  $effect(() => {
    if (!active) {
      stopRecognition();
      pendingFinal = '';
      onInterimTranscript('');
      return;
    }

    startRecognition();
    return stopRecognition;
  });
</script>
