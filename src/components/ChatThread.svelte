<script lang="ts">
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import { tick } from 'svelte';
  import type { ChatMessage } from '../lib/chat-thread-store.svelte';

  interface Props {
    messages: ChatMessage[];
    liveTranscript?: string;
    speakingSentence?: string;
    reviewMessageId?: number;
    onUserMessageClick?: (messageId: number) => void;
    onDeleteReview?: () => void;
    onContinueReview?: () => void;
  }

  let {
    messages,
    liveTranscript = '',
    speakingSentence = '',
    reviewMessageId,
    onUserMessageClick,
    onDeleteReview,
    onContinueReview,
  }: Props = $props();
  let chatThread: HTMLDivElement | undefined;

  function renderMarkdown(content: string) {
    return DOMPurify.sanitize(marked.parse(content, { async: false, breaks: true }));
  }

  function renderMessage(content: string, highlight = '') {
    const html = renderMarkdown(content);
    if (!highlight.trim() || typeof DOMParser === 'undefined') return html;
    const document = new DOMParser().parseFromString(html, 'text/html');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const content = node.textContent ?? '';
      const index = content.indexOf(highlight);
      if (index < 0 || !node.parentNode) continue;
      const before = content.slice(0, index);
      const match = content.slice(index, index + highlight.length);
      const after = content.slice(index + highlight.length);
      const fragment = document.createDocumentFragment();
      if (before) fragment.append(document.createTextNode(before));
      const marker = document.createElement('mark');
      marker.className = 'speaking-sentence';
      marker.textContent = match;
      fragment.append(marker);
      if (after) fragment.append(document.createTextNode(after));
      node.parentNode.replaceChild(fragment, node);
      break;
    }
    return DOMPurify.sanitize(document.body.innerHTML);
  }

  $effect(() => {
    const messageCount = messages.length;
    const activeSentence = speakingSentence;
    void messageCount;
    void tick().then(() =>
      chatThread?.scrollTo({ top: chatThread.scrollHeight, behavior: 'smooth' }),
    );
    if (activeSentence) {
      void tick().then(() =>
        chatThread
          ?.querySelector('.speaking-sentence')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
    }
  });
</script>

<div class="chat-thread" bind:this={chatThread} aria-live="polite" aria-label="Conversation">
  {#each messages.filter((message) => message.role !== 'status') as message (message.id)}
    <div class:chat-user={message.role === 'user'} class="chat-row">
      {#if message.role === 'user' && onUserMessageClick}
        <button
          class="chat-bubble chat-user-message"
          type="button"
          onclick={() => onUserMessageClick?.(message.id)}
        >
          {@html renderMessage(message.content)}
        </button>
      {:else}
        <div class="chat-bubble">{@html renderMessage(message.content, speakingSentence)}</div>
      {/if}
      {#if reviewMessageId === message.id}
        <div class="message-review-actions">
          <button type="button" onclick={() => onDeleteReview?.()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
            Delete
          </button>
          <button type="button" onclick={() => onContinueReview?.()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12 4 4L19 6" />
            </svg>
            Accept
          </button>
        </div>
      {/if}
    </div>
  {/each}
  {#if liveTranscript.trim()}
    <div class="chat-row chat-user">
      <div class="chat-bubble chat-user-message live-transcript">
        {@html renderMarkdown(liveTranscript)}
      </div>
    </div>
  {/if}
</div>

<style>
  .chat-thread {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    width: 100%;
    padding: 18px 8px;
    position: relative;
    z-index: 2;
    overflow-y: auto;
    scroll-behavior: smooth;
  }

  .chat-row {
    display: flex;
    justify-content: flex-start;
    width: 100%;
  }

  .chat-row.chat-user {
    justify-content: flex-end;
  }

  .chat-bubble {
    max-width: 80%;
    margin: 0;
    padding: 11px 14px;
    border: 1px solid #5b3e16;
    border-radius: 17px 17px 17px 4px;
    color: #f3cf82;
    background: #100b05;
    font-size: 14px;
    line-height: 1.45;
    white-space: normal;
    overflow-wrap: anywhere;
    box-shadow: 0 5px 16px #0008;
  }

  .chat-bubble :global(p) {
    margin: 0 0 8px;
  }

  .chat-bubble :global(p:last-child) {
    margin-bottom: 0;
  }

  .chat-bubble :global(ul),
  .chat-bubble :global(ol) {
    margin: 6px 0;
    padding-left: 20px;
  }

  .chat-bubble :global(code) {
    padding: 1px 4px;
    border-radius: 4px;
    background: #0006;
    font-size: 0.9em;
  }

  .chat-bubble :global(pre) {
    max-width: 100%;
    overflow-x: auto;
    padding: 8px;
    border-radius: 6px;
    background: #0008;
  }

  .chat-bubble :global(pre code) {
    padding: 0;
    background: transparent;
  }

  .chat-bubble :global(a) {
    color: #ffd477;
  }

  .chat-bubble :global(.speaking-sentence) {
    color: inherit;
    background: transparent;
    text-shadow:
      0 0 4px #f5c85f,
      0 0 9px #eeb64e99;
  }

  .chat-user .chat-bubble {
    border-color: #9a6a22;
    border-radius: 17px 17px 4px 17px;
    color: #fff0bd;
    background: #33200a;
  }

  .chat-user-message {
    width: auto;
    max-width: 80%;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .live-transcript {
    opacity: 0.8;
  }

  .message-review-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 5px;
  }

  .message-review-actions button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid #79551f;
    border-radius: 6px;
    color: #eeb64e;
    background: #160f06;
    cursor: pointer;
    margin-left: 6px;
  }

  .message-review-actions svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 2;
  }

  @media (min-width: 600px) {
    .chat-thread {
      padding-inline: 14px;
    }
  }
</style>
