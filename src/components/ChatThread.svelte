<script lang="ts">
  import { tick } from 'svelte';

  type ChatRole = 'user' | 'assistant' | 'status';
  type ChatMessage = { id: number; role: ChatRole; content: string };

  interface Props {
    messages: ChatMessage[];
    status: string;
  }

  let { messages, status }: Props = $props();
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
      <p class="chat-bubble">{message.content}</p>
    </div>
  {/each}
  {#if status === 'thinking'}
    <div class="chat-row"><p class="chat-bubble chat-typing">Sunny is thinking...</p></div>
  {/if}
</div>
