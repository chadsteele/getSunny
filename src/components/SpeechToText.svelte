<script lang="ts">
  import { logger as console } from '../lib/logger';

  interface Props {
    active: boolean;
    silenceTimeoutMs: number;
    onTranscript: (transcript: string) => void;
    onInterimTranscript: (transcript: string) => void;
    onError: (error: unknown) => void;
  }

  type SpeechRecognitionResultLike = { transcript: string };
  type SpeechRecognitionEventLike = Event & {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: SpeechRecognitionResultLike }>;
  };
  type SpeechRecognitionErrorEventLike = Event & { error: string };
  type SpeechRecognitionLike = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onend: (() => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    start: () => void;
    stop: () => void;
  };
  type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

  let { active, silenceTimeoutMs, onTranscript, onInterimTranscript, onError }: Props = $props();
  let recognition: SpeechRecognitionLike | undefined;
  let restartBlocked = true;
  let pendingFinal = '';
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;

  function clearSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = undefined;
  }

  function stopRecognition() {
    restartBlocked = true;
    clearSilenceTimer();
    recognition?.stop();
    recognition = undefined;
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
    currentRecognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (recognition !== currentRecognition || restartBlocked) return;
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
      console.warn('[Sunny] Speech recognition error:', event.error);
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      restartBlocked = true;
      onError(new Error(`Speech recognition failed: ${event.error}`));
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
      recognition = undefined;
      restartBlocked = true;
      onError(error);
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
