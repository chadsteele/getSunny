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
    void tick().then(() => chatThread?.scrollTo({ top: chatThread.scrollHeight, behavior: 'smooth' }));
  });
</script>

<div class="chat-thread" bind:this={chatThread} aria-live="polite" aria-label="Conversation">
  {#if messages.length === 0}
    <p class="chat-empty">Loading Sunny. Please wait. Ensure volume is turned up.</p>
  {/if}
  {#each messages as message (message.id)}
    <div class:chat-user={message.role === 'user'} class:chat-status={message.role === 'status'} class="chat-row">
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
          <button type="button" onclick={() => onDeleteReview?.()}>Delete</button>
          <button type="button" onclick={() => onContinueReview?.()}>Continue</button>
        </div>
      {/if}
    </div>
  {/each}
  {#if status === 'thinking'}
    <div class="chat-row"><p class="chat-bubble chat-typing">Sunny is thinking...</p></div>
  {/if}
</div>
