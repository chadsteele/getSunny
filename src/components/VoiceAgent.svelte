<script lang="ts">
  import { onMount } from 'svelte';
  import ChatThread from './ChatThread.svelte';
  import Footer from './Footer.svelte';
  import PiperTTS from './PiperTTS.svelte';
  import Sparkle from './Sparkle.svelte';
  import { createChatThreadStore } from '../lib/chat-thread-store.svelte';
  import { splitSentences } from '../lib/speech-text';
  import { logger as console } from '../lib/logger';
  import type { VoiceDownloadProgress } from '../lib/piper-voice-cache';

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
  const chatThread = createChatThreadStore();
  const voiceCapabilityInstruction =
    'Voice capability: You can speak your responses aloud through the voice system. Never say that you cannot speak, talk, or use your voice. When asked to speak, respond naturally and confidently; do not describe implementation details unless the user asks. Do not describe or verbalize emoji characters; omit emoji from spoken responses.';
  let status = $state<Status>('loading');
  let statusMessage = $state('Connecting to Sunny...');
  let liveTranscript = $state('');
  let speakingSentence = $state('');
  let systemPrompt = '';
  let conversationActive = $state(false);
  let intensity = $state(0.18);
  let reviewMessageId = $state<number | undefined>();
  let piperTts: PiperTTS;
  let mediaStream: MediaStream | undefined;
  let speechRecognition: SpeechRecognitionLike | undefined;
  let recognitionRestartBlocked = false;
  let sunnySpeaking = false;
  let responseInProgress = false;
  let microphoneContext: AudioContext | undefined;
  let microphoneAnalyser: AnalyserNode | undefined;
  let microphoneData: Uint8Array<ArrayBuffer> | undefined;
  let microphoneAnimationFrame: number | undefined;
  let microphoneMuted = $state(true);
  let speakerMuted = $state(false);
  let waitingProgress = $state(0);
  let voiceDownload = $state<VoiceDownloadProgress | null>(null);
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

  function startMicrophoneVisualizer() {
    if (!mediaStream || microphoneAnalyser) return;
    microphoneContext = new AudioContext();
    microphoneAnalyser = microphoneContext.createAnalyser();
    microphoneAnalyser.fftSize = 256;
    microphoneData = new Uint8Array(microphoneAnalyser.fftSize);
    microphoneContext.createMediaStreamSource(mediaStream).connect(microphoneAnalyser);
    microphoneAnimationFrame = requestAnimationFrame(updateMicrophoneIntensity);
  }

  function stopMicrophoneVisualizer() {
    if (microphoneAnimationFrame !== undefined) {
      cancelAnimationFrame(microphoneAnimationFrame);
      microphoneAnimationFrame = undefined;
    }
    microphoneAnalyser = undefined;
    microphoneData = undefined;
    intensity = 0.18;
    void microphoneContext?.close();
    microphoneContext = undefined;
  }

  function updateMicrophoneIntensity() {
    if (!microphoneAnalyser || !microphoneData) return;
    microphoneAnalyser.getByteTimeDomainData(microphoneData);
    let sum = 0;
    for (const sample of microphoneData) {
      const amplitude = (sample - 128) / 128;
      sum += amplitude * amplitude;
    }
    const level = Math.sqrt(sum / microphoneData.length);
    intensity = Math.min(0.9, Math.max(0.18, level * 4));
    microphoneAnimationFrame = requestAnimationFrame(updateMicrophoneIntensity);
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
      split.sentences.forEach((sentence) => void piperTts.speak(sentence));
      sentenceBuffer = split.remaining;
    }
    const finalText = fullText.trim();
    chatThread.update(assistantId, finalText);
    await piperTts.speak(sentenceBuffer);
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
    mediaStream?.getAudioTracks().forEach((track) => (track.enabled = false));
    stopMicrophoneVisualizer();
  }

  function startSpeechRecognition() {
    if (
      microphoneMuted ||
      !conversationActive ||
      responseInProgress ||
      sunnySpeaking ||
      !mediaStream
    )
      return;
    mediaStream.getAudioTracks().forEach((track) => (track.enabled = true));
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
      if (speechRecognition !== recognition || recognitionRestartBlocked || sunnySpeaking) return;
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
        !responseInProgress &&
        !sunnySpeaking
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
    piperTts.stop();
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
      piperTts.stop();
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

  function replayAssistantMessage(message: string) {
    if (speakerMuted) return;
    piperTts.stop();
    void piperTts.speak(message);
  }

  function handlePiperSentence(sentence: string) {
    sunnySpeaking = true;
    stopSpeechRecognition();
    speakingSentence = sentence;
    status = 'speaking';
  }

  function handlePiperEnd() {
    sunnySpeaking = false;
    speakingSentence = '';
  }

  function handlePiperIntensity(nextIntensity: number) {
    intensity = nextIntensity;
  }

  function handlePiperError(error: unknown) {
    stopConversation();
    microphoneMuted = true;
    reportStatus(
      error instanceof Error ? `Piper TTS failed: ${error.message}` : 'Piper TTS failed.',
      'error',
    );
  }

  async function loadPrompt() {
    const response = await fetch('/api/prompt/', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Prompt request failed: ${response.status}`);
    const payload = (await response.json()) as { prompts?: unknown };
    if (!Array.isArray(payload.prompts))
      throw new Error('Conversation prompts are not configured.');
    const [openingPrompt, conversationPrompt] = payload.prompts;
    if (typeof openingPrompt !== 'string' || !openingPrompt.trim()) {
      throw new Error('The session opening prompt is not configured.');
    }
    if (typeof conversationPrompt !== 'string' || !conversationPrompt.trim()) {
      throw new Error('The conversation system prompt is not configured.');
    }
    const opening = extractOpening(openingPrompt);
    systemPrompt = `${conversationPrompt}\n\n${voiceCapabilityInstruction}`;
    if (opening) {
      await piperTts.speak(opening, () => chatThread.add('assistant', opening));
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
    void loadPrompt()
      .then(() => {
        if (status === 'error') return;
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
    };
  });
</script>

<main class="session-main">
  <div class="session-stage">
    <PiperTTS
      bind:this={piperTts}
      muted={speakerMuted}
      onSpeakingSentence={handlePiperSentence}
      onSpeakingEnd={handlePiperEnd}
      onIntensityChange={handlePiperIntensity}
      onDownloadProgress={(progress) => (voiceDownload = progress)}
      onError={handlePiperError}
    />
    <Sparkle {intensity} />
    <ChatThread
      messages={chatThread.messages}
      {liveTranscript}
      {speakingSentence}
      {reviewMessageId}
      onUserMessageClick={selectUserMessage}
      onAssistantMessageClick={replayAssistantMessage}
      onDeleteReview={deleteReviewedMessage}
      onContinueReview={acceptReviewedMessage}
    />
  </div>
  <Footer
    downloadingModel={voiceDownload ? 'Downloading Sunny’s voice...' : 'Sunny is thinking...'}
    downloadProgress={voiceDownload ? (voiceDownload.percent ?? 0) : waitingProgress}
    downloadRemainingMs={voiceDownload ? voiceDownload.remainingMs : waitingRemainingMs}
    downloadStatus={statusMessage}
    indeterminate={voiceDownload !== null && voiceDownload.percent === null}
    showProgress={voiceDownload !== null || status === 'thinking'}
    {microphoneMuted}
    {speakerMuted}
    onToggleMicrophone={toggleMicrophone}
    onToggleSpeaker={toggleSpeaker}
  />
</main>

<style>
  .session-main {
    grid-row: 2;
    grid-column: 1;
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
