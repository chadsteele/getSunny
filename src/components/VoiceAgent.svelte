<script lang="ts">
  import { onMount, tick } from 'svelte';
  import AudioControls from './AudioControls.svelte';
  import LanguageModel from './LanguageModel.svelte';
  import Sparkle from './Sparkle.svelte';
  import SpeechModel from './SpeechModel.svelte';
  import TranscriptionModel from './TranscriptionModel.svelte';
  import type {
    AppConfig,
    LanguageModelController,
    SpeechModelController,
    TranscriptionModelController,
  } from '../lib/model-config';

  type Status = 'downloading' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'ended' | 'error';
  type ChatRole = 'user' | 'assistant' | 'status';
  type ChatMessage = { id: number; role: ChatRole; content: string };


  const MAX_RESPONSE_WORDS = 40;
  const SILENCE_THRESHOLD = 0.08;

  let systemPrompt = '';
  let status = $state<Status>('downloading');
  let intensity = $state(0.18);
  let conversationActive = $state(false);
  let modelsReady = $state(false);
  let welcomePlayed = $state(false);
  let lastUtterance = $state('');
  let chatMessages = $state<ChatMessage[]>([]);
  let chatThread: HTMLDivElement | undefined;
  let nextMessageId = 0;
  let errorMessage = $state('');
  let downloadStatus = $state('Preparing voice models...');
  let downloadProgress = $state(0);
  let isDownloading = $state(true);
  let downloadingModel = $state('voice models');
  let inputVolume = $state(0);
  let inputStream: MediaStream | undefined;
  let inputContext: AudioContext | undefined;
  let inputAnalyser: AnalyserNode | undefined;
  let inputData: Float32Array<ArrayBuffer> | undefined;
  let outputContext: AudioContext | undefined;
  let outputAnalyser: AnalyserNode | undefined;
  let outputData: Float32Array<ArrayBuffer> | undefined;
  let outputAudio: HTMLAudioElement | undefined;
  let finishPlayback: (() => void) | undefined;
  let animationFrame = 0;
  let processing = false;
  let startingConversation = false;
  let animationFrameCount = 0;
  let lastMicDebugAt = 0;
  let manualSpeechStartedAt = 0;
  let manualSilenceStartedAt = 0;
  let manualSpeechSamples: number[] = [];
  let lastManualCaptureAt = 0;
  let config = $state<AppConfig | undefined>();
  let transcriptionModel = $state<TranscriptionModelController | undefined>();
  let languageModel = $state<LanguageModelController | undefined>();
  let speechModel = $state<SpeechModelController | undefined>();
  let modelPreparation: Promise<void> | undefined;
  let hasAnnouncedReady = false;
  let downloadingOccurred = false;
  let activeModelDownload = false;
  let lastStatusAnnouncement = '';
  const loggedProgress = new Map<string, number>();

  function addChatMessage(role: ChatRole, content: string) {
    const message = content.trim();
    if (!message) return;
    chatMessages.push({ id: nextMessageId++, role, content: message });
  }

  function conversationContext() {
    return chatMessages
      .filter(({ role }) => role !== 'status')
      .map(({ role, content }) => `${role === 'user' ? 'User' : 'Sunny'}: ${content}`)
      .join('\n\n');
  }

  $effect(() => {
    const messageCount = chatMessages.length;
    void messageCount;
    void tick().then(() => chatThread?.scrollTo({ top: chatThread.scrollHeight, behavior: 'smooth' }));
  });

  const statusLabel = $derived(
    status === 'downloading'
      ? 'Downloading...'
      : status === 'listening'
      ? 'Listening...'
      : status === 'thinking'
        ? 'Thinking...'
        : status === 'speaking'
          ? 'Speaking...'
          : status === 'paused'
            ? 'Paused'
            : status === 'ended'
              ? 'Ended'
              : 'Something went wrong',
  );

  function speakDiagnostic(message: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('[Sunny] Browser speech diagnostics unavailable:', message);
      return;
    }
    console.log('[Sunny] Speaking diagnostic:', message);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1;
    utterance.volume = 0.8;
    window.speechSynthesis.speak(utterance);
  }

  $effect(() => {
    const currentStatus = status;
    if (currentStatus === 'listening') {
      if (!hasAnnouncedReady) {
        hasAnnouncedReady = true;
        if (downloadingOccurred) {
          lastStatusAnnouncement = 'ready';
          speakDiagnostic('Ready');
        } else {
          lastStatusAnnouncement = 'session-opening';
          void speakSessionOpening().catch((error: unknown) => {
            console.error('[Sunny] Session opening failed:', error);
            errorMessage = error instanceof Error ? error.message : 'Unable to speak the session opening.';
            status = 'error';
          });
        }
      }
      return;
    }
    if (currentStatus === 'speaking' || currentStatus === 'thinking') return;
    if (currentStatus === 'downloading' && !activeModelDownload) return;
    const announcementKey = `${currentStatus}:${currentStatus === 'downloading' ? downloadingModel : ''}`;
    if (announcementKey === lastStatusAnnouncement) return;
    lastStatusAnnouncement = announcementKey;
    speakDiagnostic(
      currentStatus === 'downloading'
        ? `Downloading ${downloadingModel}`
        : statusLabel,
    );
  });

  $effect(() => {
    const message = errorMessage;
    if (message) speakDiagnostic(`Error. ${message}`);
  });

  function getRms(data: Float32Array<ArrayBuffer>) {
    let total = 0;
    for (const sample of data) total += sample * sample;
    return Math.sqrt(total / data.length);
  }

  function animateAudio() {
    animationFrameCount += 1;
    if (animationFrameCount <= 3) {
      console.log('[Sunny] Audio animation loop tick:', {
        frame: animationFrameCount,
        status,
        hasInputAnalyser: Boolean(inputAnalyser),
        hasInputData: Boolean(inputData),
      });
    }
    const analyser = status === 'speaking' ? outputAnalyser : inputAnalyser;
    const data = status === 'speaking' ? outputData : inputData;
    if (analyser && data) {
      analyser.getFloatTimeDomainData(data);
      const volume = Math.min(1, getRms(data) * 7);
      if (analyser === inputAnalyser) inputVolume = volume;
      const now = performance.now();
      if (analyser === inputAnalyser && now - lastMicDebugAt > 1000) {
        console.log('[Sunny] Mic analyser sample:', {
          volumePercent: Math.round(volume * 100),
          thresholdPercent: Math.round(SILENCE_THRESHOLD * 100),
          contextState: inputContext?.state,
          trackState: inputStream?.getAudioTracks().map((track) => track.readyState),
        });
        lastMicDebugAt = now;
      }
      if (analyser === inputAnalyser && status === 'listening' && !processing) {
        const sampleRate = inputContext?.sampleRate ?? 16_000;
        const captureInterval = (data.length / sampleRate) * 1000;
        if (volume >= SILENCE_THRESHOLD) {
          if (!manualSpeechStartedAt) {
            manualSpeechStartedAt = now;
            manualSpeechSamples = [];
            console.log('[Sunny] Mic fallback speech started:', {
              volumePercent: Math.round(volume * 100),
              thresholdPercent: Math.round(SILENCE_THRESHOLD * 100),
            });
          }
          manualSilenceStartedAt = 0;
        } else if (manualSpeechStartedAt) {
          if (!manualSilenceStartedAt) {
            manualSilenceStartedAt = now;
            console.debug('[Sunny] Mic fallback silence timer armed');
          }
        }
        if (manualSpeechStartedAt && now - lastManualCaptureAt >= captureInterval) {
          manualSpeechSamples.push(...data);
          lastManualCaptureAt = now;
        }
        if (manualSpeechStartedAt && manualSilenceStartedAt && now - manualSilenceStartedAt > 1800) {
          const audio = new Float32Array(manualSpeechSamples);
          manualSpeechStartedAt = 0;
          manualSilenceStartedAt = 0;
          manualSpeechSamples = [];
          lastManualCaptureAt = 0;
          if (audio.length > data.length) {
            console.log('[Sunny] Mic fallback speech ended; starting transcription:', {
              samples: audio.length,
              sampleRate,
              durationSeconds: audio.length / sampleRate,
            });
            void handleSpeech(audio, sampleRate);
          } else {
            console.warn('[Sunny] Mic fallback discarded a segment that was too short:', audio.length);
          }
        }
      }
      const target = 0.18 + volume * 0.82;
      intensity += (target - intensity) * (volume > intensity ? 0.45 : 0.12);
    } else if (status === 'thinking') {
      intensity += (0.32 - intensity) * 0.08;
    }
    if (typeof window !== 'undefined' && (status === 'listening' || status === 'speaking')) {
      animationFrame = requestAnimationFrame(animateAudio);
    }
  }

  async function stopInputAnalyser() {
    if (typeof window !== 'undefined') cancelAnimationFrame(animationFrame);
    inputVolume = 0;
    inputAnalyser = undefined;
    inputData = undefined;
    inputStream?.getTracks().forEach((track) => track.stop());
    inputStream = undefined;
    if (inputContext && inputContext.state !== 'closed') await inputContext.close();
    inputContext = undefined;
  }

  async function setupInputAnalyser() {
    const activeTracks = inputStream?.getAudioTracks().some((track) => track.readyState === 'live');
    if (inputAnalyser && inputContext && inputContext.state !== 'closed' && activeTracks) {
      console.debug('[Sunny] Reusing microphone analyser:', {
        contextState: inputContext.state,
        trackState: inputStream?.getAudioTracks().map((track) => track.readyState),
      });
      await inputContext.resume();
      console.debug('[Sunny] Microphone analyser resumed:', inputContext.state);
      inputVolume = 0;
      intensity = 0.18;
      animateAudio();
      return;
    }
    await stopInputAnalyser();
    console.log('[Sunny] Requesting microphone access for sparkle analyser');
    inputStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('[Sunny] Sparkle microphone stream acquired:', {
      tracks: inputStream.getAudioTracks().map((track) => ({
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: track.getSettings(),
      })),
    });
    inputContext = new AudioContext({ sampleRate: 16_000 });
    console.log('[Sunny] Sparkle microphone AudioContext created:', inputContext.state);
    await inputContext.resume();
    inputAnalyser = inputContext.createAnalyser();
    inputAnalyser.fftSize = 512;
    inputData = new Float32Array(inputAnalyser.fftSize);
    inputContext.createMediaStreamSource(inputStream).connect(inputAnalyser);
    console.log('[Sunny] Sparkle microphone analyser connected:', {
      contextState: inputContext.state,
      fftSize: inputAnalyser.fftSize,
    });
    animateAudio();
  }

  async function prepareModels() {
    if (modelPreparation) return modelPreparation;
    modelPreparation = (async () => {
      isDownloading = true;
      status = 'downloading';
      try {
        await loadSystemPrompt();
        if (!speechModel || !transcriptionModel || !languageModel) {
          throw new Error('Voice model components were not initialized.');
        }
        await languageModel.prepare();
        await speechModel.prepare();
        await transcriptionModel.prepare();
        downloadStatus = 'Models ready — you can talk';
        downloadProgress = 100;
        isDownloading = false;
        modelsReady = true;
        console.log('[Sunny] Model preparation complete');
      } catch (error) {
        console.error('[Sunny] Model preparation failed:', error);
        downloadStatus = 'Model download failed — check the console';
        isDownloading = false;
        status = 'error';
        throw error;
      }
    })();
    return modelPreparation;
  }

  async function loadConfig() {
    console.log('[Sunny] Loading model config from /api/config/');
    const response = await fetch('/api/config/', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Model config request failed: ${response.status} ${response.statusText}`);
    }
    const loadedConfig = (await response.json()) as AppConfig;
    if (!loadedConfig.models?.transcription || !loadedConfig.models.language || !loadedConfig.models.speech) {
      throw new Error('Model config endpoint returned an incomplete configuration.');
    }
    return loadedConfig;
  }

  async function loadSystemPrompt() {
    console.log('[Sunny] Loading system prompt from /api/prompt/');
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const response = await fetch('/api/prompt/', {
      cache: isLocalhost ? 'no-store' : 'default',
    });
    if (!response.ok) {
      throw new Error(`System prompt request failed: ${response.status} ${response.statusText}`);
    }
    const prompt = (await response.text()).trim();
    if (!prompt) throw new Error('System prompt endpoint returned an empty response.');
    systemPrompt = prompt;
    console.log('[Sunny] System prompt loaded:', { characterCount: prompt.length });
  }

  async function speakSessionOpening() {
    const openingMarker = 'Session Opening Script';
    const closingMarker = 'Session Closing (After Story Consolidation)';
    const openingStart = systemPrompt.indexOf(openingMarker);
    const closingStart = systemPrompt.indexOf(closingMarker);
    hasAnnouncedReady = true;
    if (openingStart < 0 || closingStart <= openingStart) {
      console.warn('[Sunny] System prompt has no session opening script; continuing without an opening announcement');
      return;
    }
    const opening = systemPrompt
      .slice(openingStart + openingMarker.length, closingStart)
      .trim()
      .replace(/^"|"$/g, '');
    console.log('[Sunny] Speaking session opening script');
    await speak(opening);
    addChatMessage('assistant', opening);
  }

  function updateDownloadProgress(label: string, progress: number) {
    const percent = Math.max(0, Math.min(100, Math.floor(progress)));
    const previous = loggedProgress.get(label) ?? -1;
    if (percent <= previous) return;
    loggedProgress.set(label, percent);
    downloadProgress = percent;
    downloadStatus = `Downloading ${label} model: ${percent}%`;
    if (percent < 100) addChatMessage('status', downloadStatus);
    console.log(`[Sunny] ${label} download: ${percent}%`);
  }

  function modelProgress(label: string, progress: number) {
    downloadingModel = `${label} model`;
    if (progress < 100) activeModelDownload = true;
    updateDownloadProgress(label, progress);
  }

  function modelDownloadState(state: string) {
    downloadStatus = state;
  }

  function markModelDownloaded() {
    downloadingOccurred = true;
  }

  function makeWav(audioData: Float32Array, sampleRate: number) {
    const buffer = new ArrayBuffer(44 + audioData.length * 2);
    const view = new DataView(buffer);
    const write = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
    };
    write(0, 'RIFF');
    view.setUint32(4, 36 + audioData.length * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, audioData.length * 2, true);
    for (let index = 0; index < audioData.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, audioData[index]));
      view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  function limitResponseWords(text: string) {
    return text.trim().split(/\s+/).slice(0, MAX_RESPONSE_WORDS).join(' ');
  }

  async function handleSpeech(audioData: Float32Array, sampleRate: number) {
    if (processing || !conversationActive || status === 'ended') {
      console.debug('[Sunny] Audio segment ignored:', {
        processing,
        conversationActive,
        status,
        samples: audioData.length,
      });
      return;
    }
    console.log('[Sunny] Microphone speech segment received:', {
      samples: audioData.length,
      sampleRate,
      durationSeconds: audioData.length / sampleRate,
    });
    console.log('[Sunny] Listening paused while processing the response');
    processing = true;
    status = 'thinking';
    await stopInputAnalyser();
    try {
      if (!transcriptionModel || !languageModel) {
        throw new Error('Voice model components were not initialized.');
      }
      console.log('[Sunny] Loading/using transcription model:', config?.models.transcription.name);
      console.debug('[Sunny] Starting transcription:', {
        sampleRate,
        samples: audioData.length,
        durationSeconds: audioData.length / sampleRate,
      });
      console.time('[Sunny] Transcription');
      const transcription = await transcriptionModel.transcribeAudio(makeWav(audioData, sampleRate));
      console.timeEnd('[Sunny] Transcription');
      console.log('[Sunny] Transcription result:', transcription);
      const text = transcription.text.trim();
      lastUtterance = text;
      console.log('[Sunny] Transcribed text:', JSON.stringify(text));
      console.log('[Sunny] Transcription details:', {
        characterCount: text.length,
        sampleRate,
        durationSeconds: audioData.length / sampleRate,
      });
      if (!text) {
        console.log('[Sunny] Empty transcription; skipping LLM and TTS');
        addChatMessage('status', 'I could not make out that message. Please try again.');
        return;
      }
      addChatMessage('user', text);
      if (text.toLowerCase() === 'good night sunny') {
        console.log('Goodbye from Sunny.');
        status = 'ended';
        conversationActive = false;
        return;
      }

      const prompt = `${systemPrompt}\n\nKeep every response to no more than ${MAX_RESPONSE_WORDS} words.\n\nConversation:\n${conversationContext()}`;
      console.log('[Sunny] LLM request:', { prompt });
      console.log('[Sunny] Loading/using language model:', config?.models.language.name);
      const reply = limitResponseWords(await languageModel.generate(prompt, 64));
      console.log('[Sunny] WebLLM model ready');
      console.log('[Sunny] LLM response:', { text: reply });
      addChatMessage('assistant', reply);
      await speak(reply);
      // await speak(reply, false);
      // if (conversationActive) await speak("Okay. I'm listening");
    } catch (error) {
      console.error('Voice conversation failed:', error);
      console.error('[Sunny] Pipeline state at failure:', {
        status,
        conversationActive,
      });
      errorMessage = error instanceof Error ? error.message : 'Unable to continue the conversation.';
      addChatMessage('status', errorMessage);
      status = 'error';
    } finally {
      processing = false;
      if (conversationActive && status !== 'ended') {
        void startConversation().catch((error: unknown) => {
          console.error('[Sunny] Failed to restart microphone detection:', error);
          status = 'error';
          conversationActive = false;
        });
      }
    }
  }

  async function speak(text: string, resumeListening = true) {
    console.log('[Sunny] TTS request:', { text });
    console.log('[Sunny] Loading/using speech model:', config?.models.speech.name);
    status = 'speaking';
    console.log('[Sunny] Input listening disabled during TTS synthesis');
    await stopInputAnalyser();
    if (!speechModel) throw new Error('Speech model component was not initialized.');
    console.time('[Sunny] Piper synthesis');
    const audio = await speechModel.synthesize(text);
    console.timeEnd('[Sunny] Piper synthesis');
    console.log('[Sunny] Piper synthesis complete:', {
      characterCount: text.length,
      audioBytes: audio.size,
    });
    const url = URL.createObjectURL(audio);
    outputAudio = new Audio(url);
    outputAudio.playbackRate = 0.9;
    outputContext = new AudioContext();
    outputAnalyser = outputContext.createAnalyser();
    outputAnalyser.fftSize = 512;
    outputData = new Float32Array(outputAnalyser.fftSize);
    const source = outputContext.createMediaElementSource(outputAudio);
    source.connect(outputAnalyser);
    outputAnalyser.connect(outputContext.destination);
    outputAudio.onended = () => {
      URL.revokeObjectURL(url);
      outputContext?.close();
      outputContext = undefined;
      outputAnalyser = undefined;
      outputData = undefined;
      status = resumeListening && conversationActive ? 'listening' : conversationActive ? 'speaking' : 'paused';
      const resolvePlayback = finishPlayback;
      finishPlayback = undefined;
      resolvePlayback?.();
      if (conversationActive && resumeListening) animateAudio();
    };
    animateAudio();
    const playbackComplete = new Promise<void>((resolve) => {
      finishPlayback = resolve;
    });
    console.log('[Sunny] Starting TTS playback');
    await outputAudio.play();
    console.log('[Sunny] TTS playback started');
    await playbackComplete;
    console.log('[Sunny] TTS playback finished; response processing complete');
  }

  async function startConversation() {
    if (startingConversation) {
      console.warn('[Sunny] Conversation start skipped: startup already in progress');
      return;
    }
    startingConversation = true;
    console.log('[Sunny] Starting conversation and microphone detection');
    errorMessage = '';
    conversationActive = true;
    status = 'listening';
    try {
      await setupInputAnalyser();
      console.log('[Sunny] Sparkle analyser ready; microphone detection is active');
      animateAudio();
    } catch (error) {
      console.error('[Sunny] Conversation startup failed:', error);
      throw error;
    } finally {
      startingConversation = false;
    }
  }

  function stopConversation(nextStatus: Status = 'paused') {
    conversationActive = false;
    status = nextStatus;
    manualSpeechStartedAt = 0;
    manualSilenceStartedAt = 0;
    manualSpeechSamples = [];
    lastManualCaptureAt = 0;
    const resolvePlayback = finishPlayback;
    finishPlayback = undefined;
    resolvePlayback?.();
    outputAudio?.pause();
    if (outputAudio) outputAudio.onended = null;
    void stopInputAnalyser();
    intensity = 0.18;
  }

  async function toggleConversation() {
    if (!modelsReady || startingConversation) {
      console.debug('[Sunny] Conversation start ignored until models are ready:', {
        modelsReady,
        startingConversation,
      });
      return;
    }
    if (!welcomePlayed) {
      startingConversation = true;
      errorMessage = '';
      try {
        await speakSessionOpening();
        welcomePlayed = true;
        startingConversation = false;
        await startConversation();
      } catch (error) {
        console.error('[Sunny] Welcome playback failed:', error);
        errorMessage = error instanceof Error ? error.message : 'Unable to play the introductory welcome.';
        addChatMessage('status', errorMessage);
        status = 'error';
      } finally {
        startingConversation = false;
      }
      return;
    }
    if (conversationActive) {
      stopConversation();
      return;
    }
    await startConversation();
  }

  onMount(() => {
    void (async () => {
      config = await loadConfig();
      await tick();
      await prepareModels();
    })().catch((error: unknown) => {
        console.error('Unable to start voice conversation:', error);
        errorMessage = error instanceof Error ? error.message : 'Microphone access is required.';
        addChatMessage('status', errorMessage);
        status = 'error';
        conversationActive = false;
      });
    return () => {
      stopConversation('ended');
      void stopInputAnalyser();
      void outputContext?.close();
    };
  });
</script>

{#if config}
  <TranscriptionModel
    bind:this={transcriptionModel}
    config={config.models.transcription}
    onProgress={(progress) => modelProgress('Transcription', progress)}
    onDownloadStateChange={modelDownloadState}
  />
  <LanguageModel
    bind:this={languageModel}
    config={config.models.language}
    onProgress={(progress) => modelProgress('LLM', progress)}
    onDownloadStateChange={modelDownloadState}
  />
  <SpeechModel
    bind:this={speechModel}
    config={config.models.speech}
    wasmPaths={config.assets}
    onProgress={(progress) => modelProgress('Speech', progress)}
    onDownloadStateChange={modelDownloadState}
    onDownloaded={markModelDownloaded}
  />
{/if}

<main class="session-main">
  <div class="chat-thread" bind:this={chatThread} aria-live="polite" aria-label="Conversation">
    {#if chatMessages.length === 0}
      <p class="chat-empty">Your conversation with Sunny will appear here.</p>
    {/if}
    {#each chatMessages as message (message.id)}
      <div class:chat-user={message.role === 'user'} class:chat-status={message.role === 'status'} class="chat-row">
        <p class="chat-bubble">{message.content}</p>
      </div>
    {/each}
    {#if status === 'thinking'}
      <div class="chat-row"><p class="chat-bubble chat-typing">Sunny is thinking...</p></div>
    {/if}
  </div>
  <div class="sparkle-overlay">
    <Sparkle intensity={status === 'ended' ? 0 : intensity} isPlaying={status !== 'ended' && status !== 'paused'} />
  </div>
  <!-- <p class="volume-status">
    Mic volume {Math.round(inputVolume * 100)}% · silence threshold {Math.round(SILENCE_THRESHOLD * 100)}%
  </p> -->
</main>

<footer class="session-footer">
  <AudioControls bind:isPlaying={conversationActive} onToggle={toggleConversation} />
</footer>
