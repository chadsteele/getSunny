<script lang="ts">
  import { onMount } from 'svelte';
  import ChatThread from './ChatThread.svelte';
  import Footer from './Footer.svelte';
  import Sparkle from './Sparkle.svelte';
  import { createChatThreadStore } from '../lib/chat-thread-store.svelte';

  type Status = 'loading' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';
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
  type PiperEngine = {
    generate: (text: string, voice: string, speaker?: number) => Promise<{ file: Blob }>;
    destroy: () => void;
  };

  const chatThread = createChatThreadStore();
  const voiceCapabilityInstruction =
    'Voice capability: You can speak your responses aloud through the voice system. Never say that you cannot speak, talk, or use your voice. When asked to speak, respond naturally and confidently; do not describe implementation details unless the user asks.';
  let status = $state<Status>('loading');
  let statusMessage = $state('Connecting to Sunny...');
  let liveTranscript = $state('');
  let speakingSentence = $state('');
  let systemPrompt = '';
  let conversationActive = $state(false);
  let intensity = $state(0.18);
  let reviewMessageId = $state<number | undefined>();
  let mediaStream: MediaStream | undefined;
  let speechRecognition: SpeechRecognitionLike | undefined;
  let recognitionRestartBlocked = false;
  let audio: HTMLAudioElement | undefined;
  let audioUrl: string | undefined;
  let speechQueue = Promise.resolve();
  let speechPrefetch = new Map<string, Promise<Blob>>();
  let piperEngine: PiperEngine | undefined;
  let piperEnginePromise: Promise<PiperEngine> | undefined;
  const piperVoice = 'en_US-libritts_r-medium';
  const maxCachedSpeech = 100;
  let responseInProgress = false;
  let microphoneContext: AudioContext | undefined;
  let microphoneAnalyser: AnalyserNode | undefined;
  let microphoneData: Uint8Array<ArrayBuffer> | undefined;
  let speechContext: AudioContext | undefined;
  let speechAnalyser: AnalyserNode | undefined;
  let speechData: Uint8Array<ArrayBuffer> | undefined;
  let audioAnimationFrame: number | undefined;
  let speechSource: MediaElementAudioSourceNode | undefined;
  let microphoneMuted = $state(true);
  let speakerMuted = $state(false);
  let waitingProgress = $state(0);
  let waitingRemainingMs = $state(60_000);
  let waitingTimer: ReturnType<typeof setInterval> | undefined;
  let waitingStartedAt = 0;
  const maxWaitingMs = 60_000;

  function reportStatus(message: string, nextStatus?: Status) {
    statusMessage = message;
    console.log('[Sunny]', message);
    if (nextStatus) status = nextStatus;
  }

  function endpoint(name: string) {
    return `/.netlify/functions/${name}`;
  }

  function startWaitingProgress() {
    if (waitingTimer) return;
    waitingStartedAt = Date.now();
    waitingProgress = 0;
    waitingRemainingMs = maxWaitingMs;
    waitingTimer = setInterval(() => {
      const elapsed = Math.min(maxWaitingMs, Date.now() - waitingStartedAt);
      waitingProgress = (elapsed / maxWaitingMs) * 100;
      waitingRemainingMs = maxWaitingMs - elapsed;
    }, 100);
  }

  function stopWaitingProgress() {
    if (waitingTimer) clearInterval(waitingTimer);
    waitingTimer = undefined;
    waitingProgress = 0;
    waitingRemainingMs = maxWaitingMs;
  }

  function extractOpening(prompt: string) {
    const startMarker = 'Session Opening Script';
    const endMarker = 'Session Closing (After Story Consolidation)';
    const start = prompt.indexOf(startMarker);
    const end = prompt.indexOf(endMarker);
    if (start < 0 || end <= start) return prompt;
    return prompt
      .slice(start + startMarker.length, end)
      .trim()
      .replace(/^"|"$/g, '');
  }

  function splitSentences(text: string) {
    const sentences: string[] = [];
    let remaining = text.trim();
    while (remaining.length >= 200 || /[.!?](?:\s|$)/.test(remaining)) {
      const match = remaining.match(/^([\s\S]{1,200}?[.!?])(?:\s|$)/);
      if (!match) {
        if (remaining.length < 200) break;
        sentences.push(remaining.slice(0, 200).trim());
        remaining = remaining.slice(200).trim();
      } else {
        sentences.push(match[1].trim());
        remaining = remaining.slice(match[0].length).trim();
      }
    }
    return { sentences, remaining };
  }

  function getPiperEngine() {
    piperEnginePromise ??= import('piper-tts-web')
      .then(({ PiperWebEngine }) => {
        const engine = new PiperWebEngine() as PiperEngine;
        piperEngine = engine;
        return engine;
      })
      .catch((error: unknown) => {
        piperEnginePromise = undefined;
        throw error;
      });
    return piperEnginePromise;
  }

  async function preloadPiper() {
    try {
      const engine = await getPiperEngine();
      await engine.generate('Ready.', piperVoice);
      console.log('[Sunny] Piper voice model ready');
    } catch (error) {
      console.error('[Sunny] Piper preload failed:', error);
      reportStatus(
        error instanceof Error ? `Piper TTS failed: ${error.message}` : 'Piper TTS failed.',
        'error',
      );
    }
  }

  function fetchSpeech(text: string) {
    const cacheKey = text.trim().replace(/\s+/g, ' ');
    const existing = speechPrefetch.get(cacheKey);
    if (existing) {
      console.log('[Sunny] Piper cache hit (browser)');
      return existing;
    }
    console.log('[Sunny] Piper cache miss; generating locally');
    const request = getPiperEngine()
      .then((engine) => engine.generate(cacheKey, piperVoice))
      .then(({ file }) => file)
      .catch((error: unknown) => {
        speechPrefetch.delete(cacheKey);
        throw error;
      });
    speechPrefetch.set(cacheKey, request);
    while (speechPrefetch.size > maxCachedSpeech) {
      const oldest = speechPrefetch.keys().next().value;
      if (oldest === undefined) break;
      speechPrefetch.delete(oldest);
    }
    return request;
  }

  async function playSentence(text: string, blobPromise: Promise<Blob>) {
    if (speakerMuted) return;
    const blob = await blobPromise;
    if (speakerMuted) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(blob);
    audio ??= new Audio();
    audio.src = audioUrl;
    audio.muted = speakerMuted;
    status = 'speaking';
    speakingSentence = text;
    startSpeechVisualizer();
    try {
      await audio.play();
      await new Promise<void>((resolve) => {
        audio!.onended = () => resolve();
        audio!.onerror = () => resolve();
        audio!.onpause = () => {
          if (speakerMuted) resolve();
        };
      });
    } finally {
      if (speakingSentence === text) speakingSentence = '';
      stopSpeechVisualizer();
      intensity = conversationActive ? 0.35 : 0.18;
    }
  }

  function queueSentence(text: string) {
    const sentence = text.trim();
    if (!sentence || speakerMuted) return;
    const blobPromise = fetchSpeech(sentence);
    speechQueue = speechQueue
      .then(() => playSentence(sentence, blobPromise))
      .catch((error: unknown) => {
        console.error('[Sunny] TTS playback failed:', error);
        reportStatus(error instanceof Error ? error.message : 'Speech playback failed.', 'error');
      });
  }

  async function speak(text: string) {
    const { sentences, remaining } = splitSentences(text);
    sentences.forEach(queueSentence);
    if (remaining.trim()) queueSentence(remaining);
    await speechQueue;
  }

  function getAudioLevel(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>) {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const sample of data) {
      const amplitude = (sample - 128) / 128;
      sum += amplitude * amplitude;
    }
    return Math.sqrt(sum / data.length);
  }

  function updateAudioIntensity() {
    const microphoneLevel =
      microphoneAnalyser && microphoneData
        ? getAudioLevel(microphoneAnalyser, microphoneData) * 4
        : 0;
    const speechLevel =
      speechAnalyser && speechData ? getAudioLevel(speechAnalyser, speechData) * 7 : 0;
    const level = Math.max(microphoneLevel, speechLevel);
    if (!microphoneAnalyser && !speechAnalyser) {
      audioAnimationFrame = undefined;
      intensity = 0.18;
      return;
    }
    intensity = Math.min(0.95, Math.max(0.18, level));
    audioAnimationFrame = requestAnimationFrame(updateAudioIntensity);
  }

  function startAudioDriver() {
    if (audioAnimationFrame === undefined) {
      audioAnimationFrame = requestAnimationFrame(updateAudioIntensity);
    }
  }

  function startMicrophoneVisualizer() {
    if (!mediaStream || microphoneAnalyser) return;
    microphoneContext = new AudioContext();
    microphoneAnalyser = microphoneContext.createAnalyser();
    microphoneAnalyser.fftSize = 256;
    microphoneData = new Uint8Array(microphoneAnalyser.fftSize);
    microphoneContext.createMediaStreamSource(mediaStream).connect(microphoneAnalyser);
    startAudioDriver();
  }

  function stopMicrophoneVisualizer() {
    microphoneAnalyser = undefined;
    microphoneData = undefined;
    if (!speechAnalyser && audioAnimationFrame !== undefined) {
      cancelAnimationFrame(audioAnimationFrame);
      audioAnimationFrame = undefined;
      intensity = 0.18;
    }
    void microphoneContext?.close();
    microphoneContext = undefined;
  }

  function startSpeechVisualizer() {
    if (!audio || speechAnalyser) return;
    speechContext ??= new AudioContext();
    speechAnalyser ??= speechContext.createAnalyser();
    speechAnalyser.fftSize = 256;
    speechData ??= new Uint8Array(speechAnalyser.fftSize);
    speechSource ??= speechContext.createMediaElementSource(audio);
    speechSource.connect(speechAnalyser);
    speechAnalyser.connect(speechContext.destination);
    void speechContext.resume();
    startAudioDriver();
  }

  function stopSpeechVisualizer() {
    if (!microphoneAnalyser && audioAnimationFrame !== undefined) {
      cancelAnimationFrame(audioAnimationFrame);
      audioAnimationFrame = undefined;
      intensity = 0.18;
    }
  }

  function closeSpeechVisualizer() {
    stopSpeechVisualizer();
    speechSource?.disconnect();
    speechAnalyser?.disconnect();
    void speechContext?.close();
    speechSource = undefined;
    speechAnalyser = undefined;
    speechData = undefined;
    speechContext = undefined;
  }

  function history() {
    return chatThread.messages
      .filter(({ role, content }) => role !== 'status' && content.trim())
      .map(({ role, content }) => ({
        role: role === 'user' ? 'user' : 'model',
        parts: [{ text: content }],
      }));
  }

  async function streamResponse(prompt: string, conversationHistory: ReturnType<typeof history>) {
    const assistantId = chatThread.add('assistant', '...');
    if (assistantId === undefined) throw new Error('Unable to create assistant message.');
    console.log('[Sunny] LLM SaaS request started');
    const response = await fetch(endpoint('chat-stream'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemPrompt, history: conversationHistory, prompt }),
    });
    if (!response.ok || !response.body) {
      let message = `Chat stream request failed: ${response.status}`;
      try {
        const result = (await response.json()) as { error?: string };
        if (result.error) message = result.error;
      } catch {
        // Keep the HTTP status when the function does not return JSON.
      }
      throw new Error(message);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let sentenceBuffer = '';
    let receivedFirstChunk = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (!receivedFirstChunk) {
        receivedFirstChunk = true;
        console.log('[Sunny] LLM SaaS stream started');
      }
      fullText += chunk;
      sentenceBuffer += chunk;
      chatThread.update(assistantId, fullText);
      const split = splitSentences(sentenceBuffer);
      split.sentences.forEach(queueSentence);
      sentenceBuffer = split.remaining;
    }
    const finalText = fullText.trim();
    chatThread.update(assistantId, finalText);
    if (sentenceBuffer.trim()) queueSentence(sentenceBuffer);
    await speechQueue;
    console.log('[Sunny] LLM SaaS response complete');
  }

  async function processTranscript(text: string) {
    if (responseInProgress) return;
    responseInProgress = true;
    liveTranscript = '';
    status = 'thinking';
    startWaitingProgress();
    try {
      const transcript = text.trim();
      if (!transcript) {
        reportStatus('I could not hear that. Please try again.');
        return;
      }
      const conversationHistory = history();
      chatThread.add('user', transcript);
      await streamResponse(transcript, conversationHistory);
    } catch (error) {
      console.error('[Sunny] Remote voice pipeline failed:', error);
      reportStatus(error instanceof Error ? error.message : 'Voice request failed.', 'error');
    } finally {
      responseInProgress = false;
      stopWaitingProgress();
      if (conversationActive) {
        status = 'listening';
        startSpeechRecognition();
      }
    }
  }

  function stopSpeechRecognition() {
    recognitionRestartBlocked = true;
    speechRecognition?.stop();
    speechRecognition = undefined;
    stopMicrophoneVisualizer();
  }

  function startSpeechRecognition() {
    if (microphoneMuted || !conversationActive || responseInProgress || !mediaStream) return;
    const browserWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      throw new Error('Browser speech recognition is not supported. Try Chrome or Edge.');
    }

    recognitionRestartBlocked = false;
    const recognition = new Recognition();
    speechRecognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = '';
      let final = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (interim.trim()) {
        liveTranscript = interim.trim();
        console.log('[Sunny] Transcription:', liveTranscript);
      }
      if (final.trim()) {
        liveTranscript = final.trim();
        console.log('[Sunny] Transcription:', liveTranscript);
        reportStatus('', 'thinking');
        recognition.stop();
        void processTranscript(final);
      }
    };
    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      reportStatus(`Speech recognition failed: ${event.error}`, 'error');
    };
    recognition.onend = () => {
      if (
        speechRecognition === recognition &&
        !recognitionRestartBlocked &&
        conversationActive &&
        !microphoneMuted &&
        !responseInProgress
      ) {
        startSpeechRecognition();
      }
    };
    recognition.start();
    status = 'listening';
    startMicrophoneVisualizer();
  }

  async function startConversation() {
    if (conversationActive) return;
    mediaStream ??= await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    mediaStream.getAudioTracks().forEach((track) => (track.enabled = !microphoneMuted));
    if (audio) audio.muted = speakerMuted;
    conversationActive = true;
    status = 'listening';
    intensity = 0.45;
    startMicrophoneVisualizer();
    startSpeechRecognition();
  }

  function stopConversation() {
    conversationActive = false;
    stopSpeechRecognition();
    stopWaitingProgress();
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = undefined;
    stopMicrophoneVisualizer();
    audio?.pause();
    closeSpeechVisualizer();
    status = 'paused';
  }

  async function toggleMicrophone() {
    microphoneMuted = !microphoneMuted;
    if (microphoneMuted) {
      stopConversation();
      return;
    }
    try {
      await startConversation();
    } catch (error) {
      microphoneMuted = true;
      reportStatus(error instanceof Error ? error.message : 'Microphone access failed.', 'error');
    }
  }

  function toggleSpeaker() {
    speakerMuted = !speakerMuted;
    if (speakerMuted) {
      audio?.pause();
      speakingSentence = '';
      stopSpeechVisualizer();
      intensity = conversationActive ? 0.35 : 0.18;
    } else if (audio && audio.src && status === 'speaking') {
      void audio.play();
    }
  }

  function selectUserMessage(messageId: number) {
    reviewMessageId = messageId;
  }

  function deleteReviewedMessage() {
    if (reviewMessageId === undefined) return;
    chatThread.removeMessagesBefore(reviewMessageId);
    reviewMessageId = undefined;
  }

  function acceptReviewedMessage() {
    reviewMessageId = undefined;
  }

  async function loadPrompt() {
    const response = await fetch('/api/prompt/', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Prompt request failed: ${response.status}`);
    const payload = (await response.json()) as { prompts?: unknown };
    const prompts = Array.isArray(payload.prompts)
      ? payload.prompts.filter((prompt): prompt is string => typeof prompt === 'string')
      : [];
    if (!prompts.length) throw new Error('No conversation prompt is configured.');
    const basePrompt = prompts[0];
    const opening = extractOpening(basePrompt);
    systemPrompt = `${basePrompt}\n\n${voiceCapabilityInstruction}`;
    if (opening) {
      chatThread.add('assistant', opening);
      await speak(opening);
    }
  }

  onMount(() => {
    const clearChatHistory = () => {
      chatThread.clear();
      reviewMessageId = undefined;
    };
    const restoreChatHistory = () => {
      chatThread.restore();
      reviewMessageId = undefined;
    };
    window.addEventListener('sunny-chat-cleared', clearChatHistory);
    window.addEventListener('sunny-chat-restore', restoreChatHistory);
    void preloadPiper();
    void loadPrompt()
      .then(() => {
        status = 'paused';
        reportStatus('Ready — press mic to talk', 'paused');
      })
      .catch((error: unknown) => {
        reportStatus(error instanceof Error ? error.message : 'Unable to start Sunny.', 'error');
      });
    return () => {
      window.removeEventListener('sunny-chat-cleared', clearChatHistory);
      window.removeEventListener('sunny-chat-restore', restoreChatHistory);
      stopConversation();
      closeSpeechVisualizer();
      piperEngine?.destroy();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  });
</script>

<main class="session-main">
  <div class="session-stage">
    <Sparkle {intensity} />
    <ChatThread
      messages={chatThread.messages}
      {liveTranscript}
      {speakingSentence}
      {reviewMessageId}
      onUserMessageClick={selectUserMessage}
      onDeleteReview={deleteReviewedMessage}
      onContinueReview={acceptReviewedMessage}
    />
  </div>
  <Footer
    downloadingModel={status === 'thinking' ? 'Sunny is thinking...' : ''}
    downloadProgress={waitingProgress}
    downloadRemainingMs={waitingRemainingMs}
    downloadStatus={statusMessage}
    indeterminate={false}
    showProgress={status === 'thinking'}
    {microphoneMuted}
    {speakerMuted}
    onToggleMicrophone={toggleMicrophone}
    onToggleSpeaker={toggleSpeaker}
  />
</main>

<style>
  .session-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    width: 100%;
  }
  .session-stage {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    position: relative;
  }
  .session-stage :global(.sparkle-stage) {
    position: absolute;
    inset: 18% 0 auto;
    z-index: 3;
    pointer-events: none;
  }
</style>
