<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import ChatThread from './ChatThread.svelte';
  import LogViewer from './LogViewer.svelte';
  import Microphone from './Microphone.svelte';
  import Speaker from './Speaker.svelte';
  import ProgressIndicator from './ProgressIndicator.svelte';
  import Sparkle from './Sparkle.svelte';
  import { splitSentences } from '../lib/speech-text';
  import { parseSessionReport, reportSystemPrompt, reportTimestamps } from '../lib/session-report';
  import type { BabyStep } from '../lib/sessions/types';
  import { createSessionChat, sessionPrompts } from '../lib/session-manager';
  import { logger as console } from '../lib/logger';

  let { showingLogs, session }: { showingLogs: boolean; session: BabyStep } = $props();
  type Status = 'loading' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';
  const sessionChat = createSessionChat(untrack(() => session.path));
  const chatThread = sessionChat.chat;
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
  let reviewMessageId = $state<number | undefined>();
  let speaker: Speaker;
  let microphone: Microphone;
  let sparkle: Sparkle;
  let chatThreadView = $state<ChatThread | undefined>();
  let conversationVersion = 0;
  let transcriptionAbort: AbortController | undefined;
  let sunnySpeaking = $state(false);
  let responseInProgress = $state(false);
  let reportInProgress = false;
  let microphoneMuted = $state(true);
  let speakerMuted = $state(false);

  function reportStatus(message: string, nextStatus?: Status) {
    statusMessage = message;
    console.log('[Sunny]', message);
    if (nextStatus) status = nextStatus;
  }

  function endpoint(name: string) {
    return `/.netlify/functions/${name}`;
  }

  function conversationMessages() {
    return chatThread.messages.filter(({ role, content }) => role !== 'status' && content.trim());
  }

  function history(messages = conversationMessages()) {
    return messages.map(({ role, content }) => ({
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
      const messages = conversationMessages();
      const timestamps = reportTimestamps(messages);
      const response = await fetch(endpoint('chat-stream'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: reportSystemPrompt,
          history: history(messages),
          prompt: 'Produce the session report as JSON.',
        }),
      });
      if (!response.ok) {
        throw new Error(`Report request failed (${response.status}): ${await response.text()}`);
      }
      const report = { ...parseSessionReport(await response.text()), ...timestamps };
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
      split.sentences.forEach((sentence) => void speaker.speak(sentence, prepareFirstSpeech));
      sentenceBuffer = split.remaining;
    }
    const finalText = fullText.trim();
    chatThread.update(assistantId, finalText);
    await speaker.speak(sentenceBuffer, prepareFirstSpeech);
    console.log('[Sunny] LLM SaaS response complete');
  }

  async function processRecording(audio: Blob) {
    if (responseInProgress) return;
    const version = conversationVersion;
    responseInProgress = true;
    stopListening();
    liveTranscript = '';
    status = 'thinking';
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
      if (conversationActive) {
        status = 'listening';
        void startListening();
      }
    }
  }

  function stopListening() {
    microphone?.stop();
  }

  function canListen() {
    return !microphoneMuted && conversationActive && !responseInProgress && !sunnySpeaking;
  }

  function startListening() {
    return microphone.start();
  }

  function handleMicrophoneStream(stream: MediaStream | undefined) {
    if (stream) sparkle.startMicrophone(stream);
    else sparkle?.stopMicrophone();
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
    sparkle.prepareMicrophone();
    await startListening();
  }

  function stopConversation() {
    conversationVersion += 1;
    transcriptionAbort?.abort();
    transcriptionAbort = undefined;
    conversationActive = false;
    stopListening();
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
      speaker.stop();
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
    speaker.stop();
    void speaker.speak(message);
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

  async function loadPrompt(playIntro: boolean) {
    const { opening, prompt } = sessionPrompts(session);
    systemPrompt = `${prompt}\n\n${voiceCapabilityInstruction}`;
    if (opening && playIntro) {
      await speaker.speak(opening, async () => {
        chatThread.add('assistant', opening);
        await chatThreadView?.scrollToBottomBeforeSpeech();
        return true;
      });
    }
  }

  onMount(() => {
    const clearChatHistory = () => {
      try {
        chatThread.clear();
        reviewMessageId = undefined;
      } catch (error) {
        console.error('[Sunny] Unable to delete chat history:', error);
        reportStatus('Unable to delete chat history from browser storage.', 'error');
      }
    };
    const restoreChatHistory = () => {
      chatThread.restore();
      reviewMessageId = undefined;
    };
    window.addEventListener('sunny-chat-cleared', clearChatHistory);
    window.addEventListener('sunny-chat-restore', restoreChatHistory);
    void (async () => {
      await loadPrompt(sessionChat.initialize());
    })()
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
    <Sparkle
      bind:this={sparkle}
      hidden={showingLogs}
      onMicrophoneLevel={(level) => microphone?.observe(level)}
    />
    {#if showingLogs}
      <LogViewer />
    {:else}
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
  <ProgressIndicator
    title="Sunny is thinking..."
    status={statusMessage}
    showProgress={status === 'thinking'}
  >
    {#snippet speakerControl()}
      <Speaker
        bind:this={speaker}
        muted={speakerMuted}
        onToggle={toggleSpeaker}
        onSpeakingSentence={handleSpeakingSentence}
        onSpeakingEnd={handleSpeakingEnd}
        onVisualizerStart={(audio) => sparkle.startSpeaker(audio)}
        onVisualizerStop={() => sparkle?.stopSpeaker()}
        onError={handleSpeakingError}
      />
    {/snippet}
    {#snippet microphoneControl()}
      <Microphone
        bind:this={microphone}
        muted={microphoneMuted}
        active={canListen() && status === 'listening'}
        {canListen}
        silenceTimeoutMs={speechSilenceTimeoutMs}
        onToggle={toggleMicrophone}
        onStreamChange={handleMicrophoneStream}
        onRecording={handleRecording}
        onError={handleSpeechError}
      />
    {/snippet}
  </ProgressIndicator>
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
</style>
