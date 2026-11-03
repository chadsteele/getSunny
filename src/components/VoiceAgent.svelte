<script lang="ts">
  import { onMount } from 'svelte';
  import { recordAudio } from 'vad-web';
  import { streamText, synthesizeSpeech, transcribe } from '@localmode/core';
  import { isModelCached as isTransformersModelCached, preloadModel as preloadTransformersModel, transformers } from '@localmode/transformers';
  import { isModelCached as isWebLLMModelCached, preloadModel as preloadWebLLMModel, webllm } from '@localmode/webllm';
  import AudioControls from './AudioControls.svelte';
  import Sparkle from './Sparkle.svelte';

  type Status = 'listening' | 'thinking' | 'speaking' | 'paused' | 'ended' | 'error';

  const SYSTEM_PROMPT = 'You are Sunny, a helpful voice assistant. Keep responses brief and conversational.';
  const TRANSCRIPTION_MODEL = 'onnx-community/moonshine-tiny-ONNX';
  const LLM_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
  const SPEECH_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
  const SILENCE_THRESHOLD = 0.08;

  let status = $state<Status>('listening');
  let intensity = $state(0.18);
  let conversationActive = $state(true);
  let lastUtterance = $state('');
  let errorMessage = $state('');
  let downloadStatus = $state('Preparing voice models...');
  let downloadProgress = $state(0);
  let isDownloading = $state(true);
  let inputVolume = $state(0);
  let disposeVad: (() => void) | undefined;
  let inputStream: MediaStream | undefined;
  let inputContext: AudioContext | undefined;
  let inputAnalyser: AnalyserNode | undefined;
  let inputData: Float32Array<ArrayBuffer> | undefined;
  let outputContext: AudioContext | undefined;
  let outputAnalyser: AnalyserNode | undefined;
  let outputData: Float32Array<ArrayBuffer> | undefined;
  let outputAudio: HTMLAudioElement | undefined;
  let animationFrame = 0;
  let processing = false;
  let speechStartedAt = 0;
  let silenceStartedAt = 0;
  let forcingSpeechEnd = false;
  let speechEndTimer: ReturnType<typeof setTimeout> | undefined;
  let latestSpeechAudio: Float32Array | undefined;
  let latestSpeechSampleRate = 16_000;
  let llm = webllm.languageModel(LLM_MODEL);
  let transcriber = transformers.speechToText(TRANSCRIPTION_MODEL);
  let speaker = transformers.textToSpeech(SPEECH_MODEL);
  let modelPreparation: Promise<void> | undefined;
  const loggedProgress = new Map<string, number>();

  const statusLabel = $derived(
    status === 'listening'
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

  function getRms(data: Float32Array<ArrayBuffer>) {
    let total = 0;
    for (const sample of data) total += sample * sample;
    return Math.sqrt(total / data.length);
  }

  function animateAudio() {
    const analyser = status === 'speaking' ? outputAnalyser : inputAnalyser;
    const data = status === 'speaking' ? outputData : inputData;
    if (analyser && data) {
      analyser.getFloatTimeDomainData(data);
      const volume = Math.min(1, getRms(data) * 7);
      if (analyser === inputAnalyser) inputVolume = volume;
      const target = 0.18 + volume * 0.82;
      intensity += (target - intensity) * (volume > intensity ? 0.45 : 0.12);
      if (status === 'listening' && speechStartedAt && !processing) {
        if (volume < SILENCE_THRESHOLD) {
          silenceStartedAt ||= performance.now();
          if (performance.now() - silenceStartedAt > 1000) {
            void forceSpeechEnd();
          }
        } else {
          silenceStartedAt = 0;
        }
      }
    } else if (status === 'thinking') {
      intensity += (0.32 - intensity) * 0.08;
    }
    if (status !== 'ended' && status !== 'paused' && status !== 'error') {
      animationFrame = requestAnimationFrame(animateAudio);
    }
  }

  async function forceSpeechEnd() {
    if (forcingSpeechEnd || !disposeVad) return;
    forcingSpeechEnd = true;
    console.warn('[Sunny] RMS fallback ending speech after sustained silence');
    const pendingAudio = latestSpeechAudio;
    const pendingSampleRate = latestSpeechSampleRate;
    console.debug('[Sunny] Cached speech segment:', {
      samples: pendingAudio?.length ?? 0,
      sampleRate: pendingSampleRate,
    });
    const dispose = disposeVad;
    disposeVad = undefined;
    speechStartedAt = 0;
    silenceStartedAt = 0;
    await dispose();
    forcingSpeechEnd = false;
    if (pendingAudio && conversationActive && status !== 'ended') {
      console.log('[Sunny] Transcribing cached VAD audio after silence fallback');
      await handleSpeech(pendingAudio, pendingSampleRate);
      return;
    }
    if (conversationActive && !processing && status !== 'ended') {
      void startConversation().catch((error: unknown) => {
        console.error('[Sunny] Failed to restart VAD:', error);
        status = 'error';
        conversationActive = false;
      });
    }
  }

  async function setupInputAnalyser() {
    const activeTracks = inputStream?.getAudioTracks().some((track) => track.readyState === 'live');
    if (inputAnalyser && inputContext && inputContext.state !== 'closed' && activeTracks) {
      await inputContext.resume();
      return;
    }
    if (inputContext && inputContext.state !== 'closed') await inputContext.close();
    inputAnalyser = undefined;
    inputData = undefined;
    inputStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    inputContext = new AudioContext();
    inputAnalyser = inputContext.createAnalyser();
    inputAnalyser.fftSize = 512;
    inputData = new Float32Array(inputAnalyser.fftSize);
    inputContext.createMediaStreamSource(inputStream).connect(inputAnalyser);
    animateAudio();
  }

  async function prepareModels() {
    if (modelPreparation) return modelPreparation;
    modelPreparation = (async () => {
      isDownloading = true;
      try {
        await prepareTransformersModel('Speech', SPEECH_MODEL);
        await prepareTransformersModel('Transcription', TRANSCRIPTION_MODEL);
        await prepareWebLLMModel(LLM_MODEL);
        downloadStatus = 'Models ready — you can talk';
        downloadProgress = 100;
        isDownloading = false;
        console.log('[Sunny] Model preparation complete');
      } catch (error) {
        console.error('[Sunny] Model preparation failed:', error);
        downloadStatus = 'Model download failed — check the console';
        isDownloading = false;
      }
    })();
    return modelPreparation;
  }

  async function prepareTransformersModel(label: string, modelId: string) {
    if (await isTransformersModelCached(modelId)) {
      console.log(`[Sunny] ${label} model already cached:`, modelId);
      downloadStatus = `${label} model ready (cached)`;
      downloadProgress = 100;
      return;
    }
    console.log(`[Sunny] Starting ${label} model download:`, modelId);
    downloadStatus = `Downloading ${label} model: 0%`;
    downloadProgress = 0;
    await preloadTransformersModel(modelId, {
      onProgress: (progress) => {
        updateDownloadProgress(label, progress.progress ?? 0);
      },
    });
    updateDownloadProgress(label, 100);
    console.log(`[Sunny] ${label} model download complete:`, modelId);
  }

  async function prepareWebLLMModel(modelId: string) {
    if (await isWebLLMModelCached(modelId)) {
      console.log('[Sunny] WebLLM model already cached:', modelId);
      downloadProgress = 100;
      downloadStatus = 'LLM model ready (cached)';
      return;
    }
    console.log('[Sunny] Starting WebLLM model download:', modelId);
    downloadStatus = 'Downloading LLM model: 0%';
    downloadProgress = 0;
    await preloadWebLLMModel(modelId, {
      onProgress: (progress) => {
        updateDownloadProgress('LLM', progress.progress ?? 0);
      },
    });
    updateDownloadProgress('LLM', 100);
    console.log('[Sunny] WebLLM model download complete:', modelId);
  }

  function updateDownloadProgress(label: string, progress: number) {
    const percent = Math.max(0, Math.min(100, Math.floor(progress)));
    const previous = loggedProgress.get(label) ?? -1;
    if (percent <= previous) return;
    loggedProgress.set(label, percent);
    downloadProgress = percent;
    downloadStatus = `Downloading ${label} model: ${percent}%`;
    console.log(`[Sunny] ${label} download: ${percent}%`);
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

  async function handleSpeech(audioData: Float32Array, sampleRate: number) {
    if (processing || !conversationActive || status === 'ended') return;
    console.log('[Sunny] VAD audio segment received:', {
      samples: audioData.length,
      sampleRate,
      durationSeconds: audioData.length / sampleRate,
    });
    console.log('[Sunny] Kokoro TTS model ready');
    processing = true;
    status = 'thinking';
    cancelAnimationFrame(animationFrame);
    try {
      console.log('[Sunny] Loading/using Moonshine STT model:', TRANSCRIPTION_MODEL);
      console.debug('[Sunny] Starting transcription:', {
        sampleRate,
        samples: audioData.length,
        durationSeconds: audioData.length / sampleRate,
      });
      const transcription = await transcribe({
        model: transcriber,
        audio: makeWav(audioData, sampleRate),
      });
      console.log('[Sunny] Moonshine STT model ready');
      const text = transcription.text.trim();
      lastUtterance = text;
      console.log('[Sunny] Transcription:', {
        text,
        sampleRate,
        durationSeconds: audioData.length / sampleRate,
      });
      if (text.toLowerCase() === 'good night sunny') {
        console.log('Goodbye from Sunny.');
        status = 'ended';
        conversationActive = false;
        disposeVad?.();
        disposeVad = undefined;
        return;
      }

      const prompt = `${SYSTEM_PROMPT}\n\nUser: ${text}`;
      console.log('[Sunny] LLM request:', { prompt });
      console.log('[Sunny] Loading/using WebLLM model:', LLM_MODEL);
      const response = await streamText({
        model: llm,
        prompt,
        maxTokens: 120,
      });
      let reply = '';
      for await (const chunk of response.stream) reply += chunk.text;
      console.log('[Sunny] WebLLM model ready');
      console.log('[Sunny] LLM response:', { text: reply });
      await speak(reply);
    } catch (error) {
      console.error('Voice conversation failed:', error);
      console.error('[Sunny] Pipeline state at failure:', {
        status,
        hasSpeechAudio: Boolean(latestSpeechAudio),
        conversationActive,
      });
      errorMessage = error instanceof Error ? error.message : 'Unable to continue the conversation.';
      status = 'error';
    } finally {
      processing = false;
      if (conversationActive && status !== 'ended' && !disposeVad) {
        void startConversation().catch((error: unknown) => {
          console.error('[Sunny] Failed to restart VAD:', error);
          status = 'error';
          conversationActive = false;
        });
      }
    }
  }

  async function speak(text: string) {
    console.log('[Sunny] TTS request:', { text });
    console.log('[Sunny] Loading/using Kokoro TTS model:', SPEECH_MODEL);
    const { audio, sampleRate } = await synthesizeSpeech({
      model: speaker,
      text,
      voice: 'af_heart',
      speed: 1,
    });
    const wav = audio instanceof Blob ? audio : makeWav(audio, sampleRate);
    const url = URL.createObjectURL(wav);
    outputAudio = new Audio(url);
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
      status = conversationActive ? 'listening' : 'paused';
      if (conversationActive) animateAudio();
    };
    status = 'speaking';
    animateAudio();
    await outputAudio.play();
  }

  async function startConversation() {
    console.log('[Sunny] Starting conversation and VAD; vad-web will initialize Silero in its worker');
    errorMessage = '';
    conversationActive = true;
    status = 'listening';
    await setupInputAnalyser();
    disposeVad = await recordAudio({
      onSpeechStart: () => {
        console.log('[Sunny] VAD speech started');
        if (speechEndTimer) clearTimeout(speechEndTimer);
        latestSpeechAudio = undefined;
        speechStartedAt = performance.now();
        silenceStartedAt = 0;
        if (conversationActive && !processing) status = 'listening';
      },
      onSpeechEnd: () => {
        console.log('[Sunny] VAD speech ended; waiting for audio segment');
        speechStartedAt = 0;
        silenceStartedAt = 0;
        if (conversationActive && !processing) status = 'thinking';
        speechEndTimer = setTimeout(() => {
          if (conversationActive && !processing && disposeVad) {
            console.warn('[Sunny] VAD did not deliver audio after speech ended; flushing recorder');
            void forceSpeechEnd();
          }
        }, 1200);
      },
      onSpeechOngoing: ({ audioData, sampleRate }) => {
        latestSpeechAudio = audioData.slice();
        latestSpeechSampleRate = sampleRate;
        console.log('[Sunny] VAD speech ongoing:', {
          durationSeconds: audioData.length / sampleRate,
        });
      },
      onSpeechAvailable: ({ audioData, sampleRate }) => {
        if (speechEndTimer) clearTimeout(speechEndTimer);
        if (forcingSpeechEnd) {
          console.log('[Sunny] Ignoring duplicate VAD audio while flushing cached audio');
          return;
        }
        console.log('[Sunny] VAD delivered audio segment');
        void handleSpeech(audioData, sampleRate);
      },
    });
    console.log('[Sunny] VAD recorder is ready; Silero worker initialization has started');
    animateAudio();
  }

  function stopConversation(nextStatus: Status = 'paused') {
    conversationActive = false;
    status = nextStatus;
    disposeVad?.();
    disposeVad = undefined;
    outputAudio?.pause();
    if (outputAudio) outputAudio.onended = null;
    void inputContext?.suspend();
    cancelAnimationFrame(animationFrame);
    intensity = 0.18;
  }

  async function toggleConversation() {
    if (conversationActive) {
      stopConversation();
      return;
    }
    await startConversation();
  }

  onMount(() => {
    void prepareModels().then(() => startConversation()).catch((error: unknown) => {
      console.error('Unable to start voice conversation:', error);
      errorMessage = error instanceof Error ? error.message : 'Microphone access is required.';
      status = 'error';
      conversationActive = false;
    });
    return () => {
      stopConversation('ended');
      inputStream?.getTracks().forEach((track) => track.stop());
      void inputContext?.close();
      void outputContext?.close();
    };
  });
</script>

<main class="session-main">
  <p class="eyebrow">{statusLabel}</p>
  {#if isDownloading && downloadProgress < 100}
    <div class="download-status" aria-live="polite">
      <span class="download-label">{downloadStatus}</span>
      <div class="download-track" role="progressbar" aria-label={downloadStatus} aria-valuemin="0" aria-valuemax="100" aria-valuenow={downloadProgress}>
        <span style={`width: ${downloadProgress}%`}></span>
      </div>
    </div>
  {/if}
  <Sparkle intensity={status === 'ended' ? 0 : intensity} isPlaying={status !== 'ended' && status !== 'paused'} />
  <p class="volume-status">
    Mic volume {Math.round(inputVolume * 100)}% · silence threshold {Math.round(SILENCE_THRESHOLD * 100)}%
  </p>
</main>

<footer class="session-footer">
  <div class="prompt">
    <span class="prompt-kicker">{lastUtterance || 'Take a breath...'}</span>
    <span class="prompt-title">{errorMessage || 'Let’s do this!'}</span>
  </div>
  <AudioControls bind:isPlaying={conversationActive} onToggle={toggleConversation} />
</footer>
