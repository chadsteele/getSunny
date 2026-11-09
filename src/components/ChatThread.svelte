<script lang="ts">
  import { tick } from 'svelte';

  type ChatRole = 'user' | 'assistant' | 'status';
  type ChatMessage = { id: number; role: ChatRole; content: string };

  interface Props {
    messages: ChatMessage[];
    status: string;
    reviewMessageId?: number;
    onUserMessageClick?: (messageId: number) => void;
    onDeleteReview?: () => void;
    onContinueReview?: () => void;
  }

  let {
    messages,
    status,
    reviewMessageId,
    onUserMessageClick,
    onDeleteReview,
    onContinueReview,
  }: Props = $props();
  let chatThread: HTMLDivElement | undefined;

  $effect(() => {
    const messageCount = messages.length;
    void messageCount;
    void tick().then(() =>
      chatThread?.scrollTo({ top: chatThread.scrollHeight, behavior: 'smooth' }),
    );
  });
</script>

<div class="chat-thread" bind:this={chatThread} aria-live="polite" aria-label="Conversation">
  {#if messages.length === 0}
    <p class="chat-empty">Loading...<br />Ensure volume is turned up.</p>
  {/if}
  {#each messages as message (message.id)}
    <div
      class:chat-user={message.role === 'user'}
      class:chat-status={message.role === 'status'}
      class="chat-row"
    >
      {#if message.role === 'user' && onUserMessageClick}
        <button
          class="chat-bubble chat-user-message"
          type="button"
          onclick={() => onUserMessageClick?.(message.id)}
        >
          {message.content}
        </button>
      {:else}
        <p class="chat-bubble">{message.content}</p>
      {/if}
      {#if reviewMessageId === message.id}
        <div class="message-review-actions">
          <button type="button" onclick={() => onDeleteReview?.()}>❌ Delete</button>
          <button type="button" onclick={() => onContinueReview?.()}>👍 Accept</button>
        </div>
      {/if}
    </div>
  {/each}
  {#if status === 'thinking'}
    <div class="chat-row"><p class="chat-bubble chat-typing">Sunny is thinking...</p></div>
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
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    box-shadow: 0 5px 16px #0008;
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

  .message-review-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 5px;
  }

  .message-review-actions button {
    padding: 4px 8px;
    border: 1px solid #79551f;
    border-radius: 6px;
    color: #eeb64e;
    background: #160f06;
    cursor: pointer;
    margin-left:6px;
  }

  .chat-status .chat-bubble,
  .chat-typing {
    border-color: #4b3b24;
    color: #a98d5c;
    background: #080705;
    font-size: 12px;
    font-style: italic;
  }

  .chat-empty {
    margin: auto;
    color: #8e6e3a;
    font-size: 13px;
    text-align: center;
  }

  @media (min-width: 600px) {
    .chat-thread {
      padding-inline: 14px;
    }
  }
</style>
