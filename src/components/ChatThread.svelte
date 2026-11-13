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
    onAssistantMessageClick?: (message: string) => void;
    onDeleteReview?: () => void;
    onContinueReview?: () => void;
  }

  let {
    messages,
    liveTranscript = '',
    speakingSentence = '',
    reviewMessageId,
    onUserMessageClick,
    onAssistantMessageClick,
    onDeleteReview,
    onContinueReview,
  }: Props = $props();
  let chatThread: HTMLDivElement | undefined;
  const visibleMessages = $derived.by(() => {
    const chatMessages = messages.filter((message) => message.role !== 'status');
    return chatMessages.slice(-5);
  });

  function renderMarkdown(content: string) {
    return DOMPurify.sanitize(marked.parse(content, { async: false, breaks: true }));
  }

  function replayAssistantMessage(event: MouseEvent, content: string) {
    if (event.target instanceof HTMLElement && event.target.closest('a, button')) return;
    onAssistantMessageClick?.(content);
  }

  function replayAssistantMessageFromKeyboard(event: KeyboardEvent, content: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onAssistantMessageClick?.(content);
    }
  }

  function renderMessage(content: string, highlight = '') {
    const html = renderMarkdown(content);
    if (!highlight.trim() || typeof DOMParser === 'undefined') return html;
    const document = new DOMParser().parseFromString(html, 'text/html');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    const source = textNodes.map((node) => node.data).join('');
    const target = highlight.trim().replace(/\s+/g, ' ');
    const collapsedSource = source.replace(/\s+/g, ' ');
    const index = collapsedSource.toLocaleLowerCase().lastIndexOf(target.toLocaleLowerCase());
    if (index < 0) return DOMPurify.sanitize(document.body.innerHTML);

    const sourcePositions: number[] = [];
    let collapsedIndex = 0;
    let previousWasWhitespace = false;
    for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
      const isWhitespace = /\s/.test(source[sourceIndex]);
      if (isWhitespace && previousWasWhitespace) continue;
      sourcePositions[collapsedIndex] = sourceIndex;
      collapsedIndex += 1;
      previousWasWhitespace = isWhitespace;
    }

    const rawStart = sourcePositions[index];
    const rawEnd = sourcePositions[index + target.length - 1] + 1;
    const locate = (offset: number) => {
      let position = 0;
      for (const node of textNodes) {
        const nextPosition = position + node.data.length;
        if (offset <= nextPosition) return { node, offset: offset - position };
        position = nextPosition;
      }
      const lastNode = textNodes[textNodes.length - 1];
      return { node: lastNode, offset: lastNode.data.length };
    };
    const start = locate(rawStart);
    const end = locate(rawEnd);
    if (!start.node || !end.node) return DOMPurify.sanitize(document.body.innerHTML);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const marker = document.createElement('mark');
    marker.className = 'speaking-sentence';
    marker.append(range.extractContents());
    range.insertNode(marker);
    return DOMPurify.sanitize(document.body.innerHTML);
  }

  function containsHighlight(content: string, highlight: string) {
    const target = highlight.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (!target) return false;
    if (typeof DOMParser === 'undefined') {
      return content.replace(/\s+/g, ' ').toLocaleLowerCase().includes(target);
    }
    const document = new DOMParser().parseFromString(renderMarkdown(content), 'text/html');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const text: string[] = [];
    while (walker.nextNode()) text.push(walker.currentNode.textContent ?? '');
    return text.join('').replace(/\s+/g, ' ').toLocaleLowerCase().includes(target);
  }

  const highlightedMessageId = $derived.by(() => {
    if (!speakingSentence.trim()) return undefined;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'assistant' && containsHighlight(message.content, speakingSentence)) {
        return message.id;
      }
    }
    return undefined;
  });

  $effect(() => {
    const messageCount = messages.length;
    const activeSentence = speakingSentence;
    void messageCount;
    void tick().then(() =>
      chatThread?.scrollTo({ top: chatThread.scrollHeight, behavior: 'smooth' }),
    );
    if (activeSentence) {
      void tick().then(() =>
        [...(chatThread?.querySelectorAll('.speaking-sentence') ?? [])]
          .at(-1)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
    }
  });
</script>

<div class="chat-thread" bind:this={chatThread} aria-live="polite" aria-label="Conversation">
  {#each visibleMessages as message (message.id)}
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
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="chat-bubble"
          role={onAssistantMessageClick ? 'button' : undefined}
          tabindex={onAssistantMessageClick ? 0 : undefined}
          onclick={(event) => replayAssistantMessage(event, message.content)}
          onkeydown={(event) => replayAssistantMessageFromKeyboard(event, message.content)}
        >
          {@html renderMessage(
            message.content,
            message.id === highlightedMessageId ? speakingSentence : '',
          )}
        </div>
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

  .chat-row:not(.chat-user) .chat-bubble[role='button'] {
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
