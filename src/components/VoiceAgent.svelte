<script lang="ts">
  import { onMount } from 'svelte';
  import ChatThread from './ChatThread.svelte';
  import Footer from './Footer.svelte';
  import RecordingStatus from './RecordingStatus.svelte';
  import Sparkle from './Sparkle.svelte';
  import { createChatThreadStore } from '../lib/chat-thread-store.svelte';

  type Status = 'loading' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';

  const chatThread = createChatThreadStore();
  let status = $state<Status>('loading');
  let statusMessage = $state('Connecting to Sunny...');
  let systemPrompt = '';
  let conversationActive = $state(false);
  let recordingElapsedMs = $state(0);
  let intensity = $state(0.18);
  let reviewMessageId = $state<number | undefined>();
  let mediaRecorder: MediaRecorder | undefined;
  let mediaStream: MediaStream | undefined;
  let recordingChunks: Blob[] = [];
  let recordingTimer: ReturnType<typeof setInterval> | undefined;
  let recordingStartedAt = 0;
  let segmentTimer: ReturnType<typeof setTimeout> | undefined;
  let audio: HTMLAudioElement | undefined;
  let audioUrl: string | undefined;
  let speechQueue = Promise.resolve();
  let speechPrefetch = new Map<string, Promise<Blob>>();
  let responseInProgress = false;
  let microphoneContext: AudioContext | undefined;
  let microphoneAnalyser: AnalyserNode | undefined;
  let microphoneData: Uint8Array<ArrayBuffer> | undefined;
  let microphoneAnimationFrame: number | undefined;

  function endpoint(name: string) {
    return `/.netlify/functions/${name}`;
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

  function fetchSpeech(text: string) {
    const existing = speechPrefetch.get(text);
    if (existing) return existing;
    const request = fetch(endpoint('tts'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(async (response) => {
      if (!response.ok) {
        let message = `TTS request failed: ${response.status}`;
        try {
          const result = (await response.json()) as { error?: string };
          if (result.error) message = result.error;
        } catch {
          // Keep the HTTP status when the function does not return JSON.
        }
        throw new Error(message);
      }
      return response.blob();
    });
    speechPrefetch.set(text, request);
    return request;
  }

  async function playSentence(text: string, blobPromise: Promise<Blob>) {
    const blob = await blobPromise;
    speechPrefetch.delete(text);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(blob);
    audio ??= new Audio();
    audio.src = audioUrl;
    status = 'speaking';
    intensity = 0.85;
    await audio.play();
    await new Promise<void>((resolve) => {
      audio!.onended = () => resolve();
      audio!.onerror = () => resolve();
    });
    intensity = conversationActive ? 0.35 : 0.18;
  }

  function queueSentence(text: string) {
    const sentence = text.trim();
    if (!sentence) return;
    const blobPromise = fetchSpeech(sentence);
    speechQueue = speechQueue
      .then(() => playSentence(sentence, blobPromise))
      .catch((error: unknown) => {
        console.error('[Sunny] TTS playback failed:', error);
        status = 'error';
        statusMessage = error instanceof Error ? error.message : 'Speech playback failed.';
        chatThread.add('status', statusMessage);
      });
  }

  async function speak(text: string) {
    const { sentences, remaining } = splitSentences(text);
    sentences.forEach(queueSentence);
    if (remaining.trim()) queueSentence(remaining);
    await speechQueue;
  }

  function updateMicrophoneIntensity() {
    if (!microphoneAnalyser || !microphoneData || !conversationActive) return;
    microphoneAnalyser.getByteTimeDomainData(microphoneData);
    let sum = 0;
    for (const sample of microphoneData) {
      const amplitude = (sample - 128) / 128;
      sum += amplitude * amplitude;
    }
    const level = Math.sqrt(sum / microphoneData.length);
    intensity = Math.min(0.9, Math.max(0.3, level * 4));
    microphoneAnimationFrame = requestAnimationFrame(updateMicrophoneIntensity);
  }

  function startMicrophoneVisualizer() {
    if (!mediaStream || microphoneAnimationFrame !== undefined) return;
    microphoneContext = new AudioContext();
    microphoneAnalyser = microphoneContext.createAnalyser();
    microphoneAnalyser.fftSize = 256;
    microphoneData = new Uint8Array(microphoneAnalyser.fftSize);
    microphoneContext.createMediaStreamSource(mediaStream).connect(microphoneAnalyser);
    microphoneAnimationFrame = requestAnimationFrame(updateMicrophoneIntensity);
  }

  function stopMicrophoneVisualizer() {
    if (microphoneAnimationFrame !== undefined) cancelAnimationFrame(microphoneAnimationFrame);
    microphoneAnimationFrame = undefined;
    microphoneAnalyser = undefined;
    microphoneData = undefined;
    void microphoneContext?.close();
    microphoneContext = undefined;
  }

  async function transcribe(blob: Blob) {
    const response = await fetch(endpoint('transcribe'), {
      method: 'POST',
      headers: { 'content-type': blob.type || 'audio/webm' },
      body: blob,
    });
    if (!response.ok) throw new Error(`Transcription request failed: ${response.status}`);
    const result = (await response.json()) as { text?: string; error?: string };
    if (result.error) throw new Error(result.error);
    return result.text?.trim() ?? '';
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
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
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
  }

  async function processRecording(blob: Blob) {
    if (responseInProgress) return;
    responseInProgress = true;
    status = 'thinking';
    try {
      const text = await transcribe(blob);
      if (!text) {
        chatThread.add('status', 'I could not hear that. Please try again.');
        return;
      }
      const conversationHistory = history();
      chatThread.add('user', text);
      await streamResponse(text, conversationHistory);
    } catch (error) {
      console.error('[Sunny] Remote voice pipeline failed:', error);
      status = 'error';
      statusMessage = error instanceof Error ? error.message : 'Voice request failed.';
      chatThread.add('status', statusMessage);
    } finally {
      responseInProgress = false;
      if (conversationActive) {
        status = 'listening';
        startRecording();
      }
    }
  }

  function stopRecording() {
    if (segmentTimer) clearTimeout(segmentTimer);
    segmentTimer = undefined;
    stopMicrophoneVisualizer();
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
  }

  function startRecording() {
    if (!conversationActive || responseInProgress || !mediaStream) return;
    recordingChunks = [];
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size) recordingChunks.push(event.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordingChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
      console.log('[Sunny] Recorded microphone segment:', {
        bytes: blob.size,
        type: blob.type,
      });
      if (blob.size) void processRecording(blob);
    };
    mediaRecorder.start(250);
    status = 'listening';
    startMicrophoneVisualizer();
    segmentTimer = setTimeout(stopRecording, 10_000);
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
    conversationActive = true;
    status = 'listening';
    intensity = 0.45;
    startMicrophoneVisualizer();
    recordingStartedAt = Date.now();
    recordingTimer = setInterval(() => (recordingElapsedMs = Date.now() - recordingStartedAt), 250);
    startRecording();
  }

  function stopConversation() {
    conversationActive = false;
    stopRecording();
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = undefined;
    stopMicrophoneVisualizer();
    if (recordingTimer) clearInterval(recordingTimer);
    recordingTimer = undefined;
    recordingElapsedMs = 0;
    audio?.pause();
    status = 'paused';
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

  async function toggleConversation() {
    if (status === 'speaking' && audio) {
      audio.pause();
      status = 'paused';
      return;
    }
    if (conversationActive) stopConversation();
    else await startConversation();
  }

  async function loadPrompt() {
    const response = await fetch('/api/prompt/', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Prompt request failed: ${response.status}`);
    const payload = (await response.json()) as { prompts?: unknown };
    const prompts = Array.isArray(payload.prompts)
      ? payload.prompts.filter((prompt): prompt is string => typeof prompt === 'string')
      : [];
    if (!prompts.length) throw new Error('No conversation prompt is configured.');
    systemPrompt = prompts[0];
    await speak(extractOpening(systemPrompt));
  }

  onMount(() => {
    chatThread.restore();
    const clearChatHistory = () => {
      chatThread.clear();
      reviewMessageId = undefined;
    };
    window.addEventListener('sunny-chat-cleared', clearChatHistory);
    void loadPrompt()
      .then(() => {
        status = 'paused';
        statusMessage = 'Ready — press play to talk';
      })
      .catch((error: unknown) => {
        status = 'error';
        statusMessage = error instanceof Error ? error.message : 'Unable to start Sunny.';
        chatThread.add('status', statusMessage);
      });
    return () => {
      window.removeEventListener('sunny-chat-cleared', clearChatHistory);
      stopConversation();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  });
</script>

<main class="session-main">
  <div class="session-stage">
    <Sparkle {intensity} />
    {#if conversationActive}
      <RecordingStatus elapsedMs={recordingElapsedMs} />
    {/if}
    <ChatThread
      messages={chatThread.messages}
      status={status === 'thinking' ? 'thinking' : status}
      {reviewMessageId}
      onUserMessageClick={selectUserMessage}
      onDeleteReview={deleteReviewedMessage}
      onContinueReview={acceptReviewedMessage}
    />
  </div>
  <Footer
    modelsReady={status !== 'loading'}
    activeModelDownload={false}
    downloadingModel="remote voice services"
    downloadProgress={100}
    downloadRemainingMs={0}
    downloadStatus={statusMessage}
    isPlaying={conversationActive || status === 'speaking'}
    onToggle={toggleConversation}
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
