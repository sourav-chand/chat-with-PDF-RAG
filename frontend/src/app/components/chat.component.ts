import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild, viewChildren, QueryList } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../services/api.service';
import { ChatMessage } from '../models/chat-message';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section>
      <h2>2. Chat</h2>
      <div class="chat-container" [class.active]="isReady()">
        <div class="chat-messages" #messagesContainer>
          @for (msg of messages(); track msg.id) {
            @if (msg.isTyping) {
              <div class="msg assistant">
                <div class="msg-body">
                  <div class="typing"><span></span><span></span><span></span></div>
                </div>
              </div>
            } @else {
              <div class="msg" [class.user]="msg.role === 'user'" [class.assistant]="msg.role === 'assistant'">
                <div class="msg-body">{{ msg.content }}</div>
              </div>
              @if (msg.role === 'assistant' && !msg.isError && msg.sourcesCount !== undefined) {
                <div class="msg-meta">Based on {{ msg.sourcesCount }} chunks from your PDF</div>
              } @else if (msg.role === 'user') {
                <div class="msg-meta user-meta"></div>
              }
            }
          }
        </div>

        <form class="chat-input" (submit)="onSubmit($event)">
          <input
            type="text"
            [(ngModel)]="question"
            name="question"
            placeholder="Ask a question about your PDF..."
            autocomplete="off"
            [disabled]="!isReady() || isAsking()"
            #questionInput
          />
          <button type="submit" class="btn" [disabled]="!isReady() || isAsking() || !question.trim()">Send</button>
        </form>
      </div>
    </section>
  `,
  styles: [`
    section {
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    h2 {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 14px;
    }
    .chat-container {
      opacity: 0.4;
      pointer-events: none;
      transition: opacity 0.3s;
    }
    .chat-container.active {
      opacity: 1;
      pointer-events: auto;
    }
    .chat-messages {
      height: 420px;
      overflow-y: auto;
      padding: 10px 4px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .chat-messages::-webkit-scrollbar {
      width: 6px;
    }
    .chat-messages::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 3px;
    }
    .msg {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 14px;
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    .msg.user {
      align-self: flex-end;
      background: var(--user-bubble);
      color: white;
      border-bottom-right-radius: 4px;
    }
    .msg.assistant {
      align-self: flex-start;
      background: var(--assistant-bubble);
      color: var(--text);
      border: 1px solid var(--border);
      border-bottom-left-radius: 4px;
    }
    .msg-meta {
      font-size: 11px;
      color: var(--text-dim);
      margin-top: -8px;
      align-self: flex-start;
      padding-left: 4px;
    }
    .msg-meta.user-meta {
      align-self: flex-end;
      padding-right: 4px;
    }
    .typing {
      display: inline-flex;
      gap: 4px;
      padding: 4px 0;
    }
    .typing span {
      width: 6px;
      height: 6px;
      background: var(--text-dim);
      border-radius: 50%;
      animation: bounce 1.2s infinite;
    }
    .typing span:nth-child(2) { animation-delay: 0.2s; }
    .typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-6px); opacity: 1; }
    }
    .chat-input {
      display: flex;
      gap: 8px;
      margin-top: 14px;
    }
    .chat-input input {
      flex: 1;
      background: var(--bg-elev-2);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
    }
    .chat-input input:focus {
      border-color: var(--accent);
    }
    .chat-input input:disabled {
      opacity: 0.5;
    }
    .btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover:not(:disabled) {
      background: var(--accent-hover);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class ChatComponent {
  private readonly api = inject(ApiService);
  private readonly messagesContainer = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');
  private readonly questionInput = viewChild<ElementRef<HTMLInputElement>>('questionInput');

  readonly messages = input<ChatMessage[]>([]);
  readonly isReady = input<boolean>(false);
  readonly isAsking = input<boolean>(false);

  readonly messagesChange = output<ChatMessage[]>();

  question = '';
  private nextId = 1;

  onSubmit(event: Event): void {
    event.preventDefault();
    const trimmed = this.question.trim();
    if (!trimmed || !this.isReady() || this.isAsking()) return;

    const userMsg: ChatMessage = {
      id: this.nextId++,
      role: 'user',
      content: trimmed,
    };
    const typingMsg: ChatMessage = {
      id: this.nextId++,
      role: 'assistant',
      content: '',
      isTyping: true,
    };

    this.messagesChange.emit([...this.messages(), userMsg, typingMsg]);
    this.question = '';

    this.api.ask(trimmed).subscribe({
      next: (res) => {
        const updated = this.messages().map((m) =>
          m.id === typingMsg.id
            ? { ...m, content: res.answer, isTyping: false, sourcesCount: res.sourcesCount }
            : m,
        );
        this.messagesChange.emit(updated);
      },
      error: (err: HttpErrorResponse) => {
        const message = err.error?.error || err.message || 'Failed to get answer';
        const updated = this.messages().map((m) =>
          m.id === typingMsg.id
            ? { ...m, content: `❌ ${message}`, isTyping: false, isError: true }
            : m,
        );
        this.messagesChange.emit(updated);
      },
    });
  }

  focusInput(): void {
    this.questionInput()?.nativeElement.focus();
  }

  scrollToBottom(): void {
    const el = this.messagesContainer()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}
