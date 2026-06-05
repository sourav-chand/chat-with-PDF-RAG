import { Component, signal } from '@angular/core';
import { UploadComponent } from './components/upload.component';
import { ChatComponent } from './components/chat.component';
import { ChatMessage } from './models/chat-message';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [UploadComponent, ChatComponent],
  template: `
    <div class="app">
      <header>
        <h1>Chat with PDF</h1>
        <p>Upload a PDF and ask questions about its content</p>
      </header>

      <app-upload (uploaded)="onUploaded()" />

      <app-chat
        [messages]="messages()"
        [isReady]="isReady()"
        [isAsking]="isAsking()"
        (messagesChange)="onMessagesChange($event)"
      />
    </div>
  `,
  styles: [`
    .app {
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 20px 60px;
    }
    header {
      text-align: center;
      margin-bottom: 32px;
    }
    header h1 {
      font-size: 28px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    header p {
      color: var(--text-dim);
      margin-top: 6px;
      font-size: 14px;
    }
  `]
})
export class App {
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly isReady = signal(false);
  protected readonly isAsking = signal(false);

  onUploaded(): void {
    this.isReady.set(true);
    this.messages.set([
      {
        id: Date.now(),
        role: 'assistant',
        content: 'Hi! Ask me anything about your PDF.',
      },
    ]);
  }

  onMessagesChange(updated: ChatMessage[]): void {
    this.isAsking.set(updated.some((m) => m.isTyping));
    this.messages.set(updated);
  }
}
