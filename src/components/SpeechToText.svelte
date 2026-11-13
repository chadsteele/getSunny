<script lang="ts">
  import { logger as console } from '../lib/logger';

  interface Props {
    active: boolean;
    silenceTimeoutMs: number;
    onTranscript: (transcript: string) => void;
    onInterimTranscript: (transcript: string) => void;
    onRetry: (attempt: number, maxAttempts: number) => void;
    onReady: () => void;
    onDiagnostic: (message: string) => void;
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
    onaudiostart: (() => void) | null;
    onaudioend: (() => void) | null;
    onsoundstart: (() => void) | null;
    onspeechstart: (() => void) | null;
    onspeechend: (() => void) | null;
    onnomatch: (() => void) | null;
    onend: (() => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
  };
  type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

  let {
    active,
    silenceTimeoutMs,
    onTranscript,
    onInterimTranscript,
    onRetry,
    onReady,
    onDiagnostic,
    onError,
  }: Props = $props();
  let recognition: SpeechRecognitionLike | undefined;
  let restartBlocked = true;
  let pendingFinal = '';
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let diagnosticTimer: ReturnType<typeof setTimeout> | undefined;
  let resultTimer: ReturnType<typeof setTimeout> | undefined;
  let retryAttempts = 0;
  const maxRetryAttempts = 3;
  const retryDelayMs = 1000;
  const diagnosticDelayMs = 15000;
  const resultTimeoutMs = 12000;

  function clearRecognitionTimers() {
    if (diagnosticTimer !== undefined) clearTimeout(diagnosticTimer);
    if (resultTimer !== undefined) clearTimeout(resultTimer);
    diagnosticTimer = undefined;
    resultTimer = undefined;
  }

  function clearSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = undefined;
  }

  function stopRecognition() {
    restartBlocked = true;
    clearSilenceTimer();
    clearRecognitionTimers();
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    retryAttempts = 0;
    recognition?.stop();
    recognition = undefined;
  }

  function retryRecognition(reason: string) {
    if (!active || restartBlocked || retryTimer !== undefined) return;
    clearSilenceTimer();
    clearRecognitionTimers();
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
    let audioStarted = false;
    let speechDetected = false;
    currentRecognition.onstart = () => {
      if (recognition !== currentRecognition || restartBlocked) return;
      console.log('[Sunny] Speech recognition service started:', currentRecognition.lang);
      onReady();
      if (pendingFinal.trim()) scheduleTranscript();
      diagnosticTimer = setTimeout(() => {
        diagnosticTimer = undefined;
        if (recognition !== currentRecognition || restartBlocked || speechDetected) return;
        const message = audioStarted
          ? 'Recognition audio started, but Chrome has not detected speech. Check your speech service and microphone.'
          : 'Chrome started recognition, but has not reported audio capture. Check microphone and speech service permissions.';
        console.warn('[Sunny]', message);
        onDiagnostic(message);
      }, diagnosticDelayMs);
    };
    currentRecognition.onaudiostart = () => {
      if (recognition !== currentRecognition || restartBlocked) return;
      audioStarted = true;
      console.log('[Sunny] Speech recognition audio capture started');
    };
    currentRecognition.onaudioend = () => {
      if (recognition !== currentRecognition || restartBlocked) return;
      console.log('[Sunny] Speech recognition audio capture ended');
    };
    currentRecognition.onsoundstart = () => {
      if (recognition !== currentRecognition || restartBlocked) return;
      console.log('[Sunny] Speech recognition detected sound');
    };
    currentRecognition.onspeechstart = () => {
      if (recognition !== currentRecognition || restartBlocked) return;
      speechDetected = true;
      if (diagnosticTimer !== undefined) clearTimeout(diagnosticTimer);
      diagnosticTimer = undefined;
      console.log('[Sunny] Speech recognition detected speech');
      if (resultTimer !== undefined) clearTimeout(resultTimer);
      resultTimer = setTimeout(() => {
        resultTimer = undefined;
        if (recognition !== currentRecognition || restartBlocked || !active) return;
        console.warn('[Sunny] Speech detected, but recognition returned no result');
        retryRecognition('no recognition result after speech was detected');
        try {
          currentRecognition.abort();
        } catch (error) {
          console.warn('[Sunny] Could not stop stalled speech recognition:', error);
        }
      }, resultTimeoutMs);
    };
    currentRecognition.onspeechend = () => {
      if (recognition !== currentRecognition || restartBlocked) return;
      console.log('[Sunny] Speech recognition speech ended');
    };
    currentRecognition.onnomatch = () => {
      if (recognition !== currentRecognition || restartBlocked) return;
      if (resultTimer !== undefined) clearTimeout(resultTimer);
      resultTimer = undefined;
      console.warn('[Sunny] Speech recognition could not match the detected speech');
      onDiagnostic('Chrome detected speech but could not transcribe it. Please try again.');
    };
    currentRecognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (recognition !== currentRecognition || restartBlocked) return;
      if (resultTimer !== undefined) clearTimeout(resultTimer);
      if (diagnosticTimer !== undefined) clearTimeout(diagnosticTimer);
      resultTimer = undefined;
      diagnosticTimer = undefined;
      retryAttempts = 0;
      let interim = '';
      let finalized = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalized += result[0].transcript;
        else interim += result[0].transcript;
      }

      console.log('[Sunny] Speech recognition result received:', {
        final: Boolean(finalized.trim()),
        interim: Boolean(interim.trim()),
      });
      if (finalized.trim() || interim.trim()) onReady();
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
      clearRecognitionTimers();
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
