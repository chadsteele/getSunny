<script lang="ts">
  import { onMount } from 'svelte';
  import ChatThread from './ChatThread.svelte';
  import Footer from './Footer.svelte';
  import LogViewer from './LogViewer.svelte';
  import RemoteTTS from './RemoteTTS.svelte';
  import SpeechToText from './SpeechToText.svelte';
  import Sparkle from './Sparkle.svelte';
  import { createChatThreadStore } from '../lib/chat-thread-store.svelte';
  import prompts from '../lib/prompts';
  import { splitSentences } from '../lib/speech-text';
  import { parseSessionReport, reportSystemPrompt } from '../lib/session-report';
  import { logger as console } from '../lib/logger';

  let { showingLogs }: { showingLogs: boolean } = $props();
  type Status = 'loading' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';
  const chatThread = createChatThreadStore();
  const voiceCapabilityInstruction =
    'Voice capability: You can speak your responses aloud through the voice system. Never say that you cannot speak, talk, or use your voice. When asked to speak, respond naturally and confidently. Do not describe or verbalize emoji characters; omit emoji from spoken responses.';
  let status = $state<Status>('loading');
  let statusMessage = $state('Connecting to Sunny...');
  let liveTranscript = $state('');
  let speakingSentence = $state('');
  let systemPrompt = '';
  // Increase this value to wait longer after Sunny last hears speech.
  const speechSilenceTimeoutMs = 1800;
  let conversationActive = $state(false);
  let intensity = $state(0.18);
  let reviewMessageId = $state<number | undefined>();
  let remoteTts: RemoteTTS;
  let chatThreadView = $state<ChatThread | undefined>();
  let speechToText: SpeechToText;
  let mediaStream = $state<MediaStream | undefined>();
  let microphoneVersion = 0;
  let conversationVersion = 0;
  let transcriptionAbort: AbortController | undefined;
  let sunnySpeaking = $state(false);
  let responseInProgress = $state(false);
  let reportInProgress = false;
  let microphoneContext: AudioContext | undefined;
  let microphoneAnalyser: AnalyserNode | undefined;
  let microphoneData: Uint8Array<ArrayBuffer> | undefined;
  let microphoneAnimationFrame: number | undefined;
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
    speechToText?.observe(level);
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

  export async function generateReport() {
    if (reportInProgress) {
      console.warn('[Sunny] A session report is already being generated.');
      return;
    }
    reportInProgress = true;
    console.log('[Sunny] Generating session report...');
    try {
      const response = await fetch(endpoint('chat-stream'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: reportSystemPrompt,
          history: history(),
          prompt: 'Produce the session report as JSON.',
        }),
      });
      if (!response.ok) {
        throw new Error(`Report request failed (${response.status}): ${await response.text()}`);
      }
      const report = parseSessionReport(await response.text());
      console.log('[Sunny] Session report:\n' + JSON.stringify(report, null, 2));
    } catch (error) {
      console.error('[Sunny] Session report failed:', error);
    } finally {
      reportInProgress = false;
    }
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
    let preparedFirstSpeech = false;
    const prepareFirstSpeech = async () => {
      if (preparedFirstSpeech) return;
      preparedFirstSpeech = true;
      await chatThreadView?.scrollToBottomBeforeSpeech();
      return true;
    };
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
      split.sentences.forEach((sentence) => void remoteTts.speak(sentence, prepareFirstSpeech));
      sentenceBuffer = split.remaining;
    }
    const finalText = fullText.trim();
    chatThread.update(assistantId, finalText);
    await remoteTts.speak(sentenceBuffer, prepareFirstSpeech);
    console.log('[Sunny] LLM SaaS response complete');
  }

  async function processRecording(audio: Blob) {
    if (responseInProgress) return;
    const version = conversationVersion;
    responseInProgress = true;
    stopListening();
    liveTranscript = '';
    status = 'thinking';
    startWaitingProgress();
    const controller = new AbortController();
    transcriptionAbort = controller;
    try {
      const response = await fetch(endpoint('transcribe'), {
        method: 'POST',
        headers: { 'content-type': audio.type || 'audio/webm' },
        body: audio,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Transcription failed (${response.status}): ${await response.text()}`);
      }
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== 'object' ||
        !('text' in result) ||
        typeof result.text !== 'string'
      ) {
        throw new Error('Invalid transcription response.');
      }
      const transcript = result.text.trim();
      if (version !== conversationVersion || !conversationActive || microphoneMuted) return;
      transcriptionAbort = undefined;
      if (!transcript) {
        reportStatus('I could not hear that. Please try again.');
        return;
      }
      const conversationHistory = history();
      chatThread.add('user', transcript);
      await streamResponse(transcript, conversationHistory);
    } catch (error) {
      if (version !== conversationVersion) return;
      console.error('[Sunny] Remote voice pipeline failed:', error);
      stopConversation();
      microphoneMuted = true;
      reportStatus(error instanceof Error ? error.message : 'Voice request failed.', 'error');
    } finally {
      if (transcriptionAbort === controller) transcriptionAbort = undefined;
      responseInProgress = false;
      stopWaitingProgress();
      if (conversationActive) {
        status = 'listening';
        void startListening();
      }
    }
  }

  function stopListening() {
    microphoneVersion += 1;
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = undefined;
    stopMicrophoneVisualizer();
  }

  async function startListening() {
    if (microphoneMuted || !conversationActive || responseInProgress || sunnySpeaking) return;
    if (mediaStream) return;
    const version = ++microphoneVersion;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (
        version !== microphoneVersion ||
        microphoneMuted ||
        !conversationActive ||
        responseInProgress ||
        sunnySpeaking
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStream = stream;
      startMicrophoneVisualizer();
    } catch (error) {
      if (version === microphoneVersion) handleSpeechError(error);
    }
  }

  function handleRecording(audio: Blob) {
    reportStatus('', 'thinking');
    void processRecording(audio);
  }

  function handleSpeechError(error: unknown) {
    stopConversation();
    microphoneMuted = true;
    reportStatus(error instanceof Error ? error.message : 'Speech recognition failed.', 'error');
  }

  async function startConversation() {
    if (conversationActive) return;
    conversationActive = true;
    status = 'listening';
    intensity = 0.45;
    await startListening();
  }

  function stopConversation() {
    conversationVersion += 1;
    transcriptionAbort?.abort();
    transcriptionAbort = undefined;
    conversationActive = false;
    stopListening();
    stopWaitingProgress();
    stopMicrophoneVisualizer();
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
      remoteTts.stop();
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
    remoteTts.stop();
    void remoteTts.speak(message);
  }

  function handleSpeakingSentence(sentence: string, keepBottom: boolean) {
    sunnySpeaking = true;
    stopListening();
    chatThreadView?.setNextHighlightScrollSuppressed(keepBottom);
    speakingSentence = sentence;
    status = 'speaking';
  }

  function handleSpeakingEnd() {
    sunnySpeaking = false;
    chatThreadView?.setNextHighlightScrollSuppressed(false);
    speakingSentence = '';
    if (conversationActive && !responseInProgress && !microphoneMuted) {
      status = 'listening';
      void startListening();
    }
  }

  function handleSpeakingIntensity(nextIntensity: number) {
    intensity = nextIntensity;
  }

  function handleSpeakingError(error: unknown) {
    stopConversation();
    microphoneMuted = true;
    reportStatus(
      error instanceof Error
        ? `Speech synthesis failed: ${error.message}`
        : 'Speech synthesis failed.',
      'error',
    );
  }

  async function loadPrompt() {
    const [openingPrompt, conversationPrompt] = prompts;
    if (typeof openingPrompt !== 'string' || !openingPrompt.trim()) {
      throw new Error('The session opening prompt is not configured.');
    }
    if (typeof conversationPrompt !== 'string' || !conversationPrompt.trim()) {
      throw new Error('The conversation system prompt is not configured.');
    }
    const opening = extractOpening(openingPrompt);
    systemPrompt = `${conversationPrompt}\n\n${voiceCapabilityInstruction}`;
    if (opening) {
      await remoteTts.speak(opening, async () => {
        chatThread.add('assistant', opening);
        await chatThreadView?.scrollToBottomBeforeSpeech();
        return true;
      });
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
        if (conversationActive && !microphoneMuted) {
          status = 'listening';
          reportStatus('Listening');
          void startListening();
          return;
        }
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
    <RemoteTTS
      bind:this={remoteTts}
      muted={speakerMuted}
      onSpeakingSentence={handleSpeakingSentence}
      onSpeakingEnd={handleSpeakingEnd}
      onIntensityChange={handleSpeakingIntensity}
      onError={handleSpeakingError}
    />
    <SpeechToText
      bind:this={speechToText}
      active={conversationActive &&
        !microphoneMuted &&
        !responseInProgress &&
        !sunnySpeaking &&
        status === 'listening'}
      silenceTimeoutMs={speechSilenceTimeoutMs}
      stream={mediaStream}
      onRecording={handleRecording}
      onError={handleSpeechError}
    />
    {#if showingLogs}
      <LogViewer />
    {:else}
      <Sparkle {intensity} />
      <ChatThread
        bind:this={chatThreadView}
        messages={chatThread.messages}
        {liveTranscript}
        {speakingSentence}
        {reviewMessageId}
        onUserMessageClick={selectUserMessage}
        onAssistantMessageClick={replayAssistantMessage}
        onDeleteReview={deleteReviewedMessage}
        onContinueReview={acceptReviewedMessage}
      />
    {/if}
  </div>
  <Footer
    downloadingModel="Sunny is thinking..."
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
