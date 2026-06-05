import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-upload',
  standalone: true,
  template: `
    <section>
      <h2>1. Upload PDF</h2>
      <label
        class="drop-zone"
        [class.dragover]="isDragging()"
        (click)="onLabelClick($event)"
        (dragenter)="onDragEnter($event)"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
      >
        <div class="icon">📄</div>
        <p><strong>Click to choose</strong> or drag &amp; drop a PDF here</p>
        <input
          #fileInput
          type="file"
          accept="application/pdf"
          (change)="onFileSelected($event)"
        />
      </label>

      @if (selectedFile()) {
        <div class="file-info show">
          Selected: {{ selectedFile()!.name }} ({{ formatSize(selectedFile()!.size) }} MB)
        </div>
      }

      <button
        type="button"
        class="btn"
        [disabled]="!selectedFile() || isUploading()"
        (click)="onUpload()"
      >
        Upload &amp; Process
      </button>

      @if (status(); as s) {
        <div class="status show" [class.success]="s.type === 'success'" [class.error]="s.type === 'error'">
          @if (s.type === 'loading') {
            <span class="spinner"></span>
          }
          <span [innerHTML]="s.message"></span>
        </div>
      }
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
    .drop-zone {
      display: block;
      border: 2px dashed var(--border);
      border-radius: 10px;
      padding: 40px 20px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
    }
    .drop-zone:hover,
    .drop-zone.dragover {
      border-color: var(--accent);
      background: rgba(99, 102, 241, 0.05);
    }
    .drop-zone .icon {
      font-size: 36px;
      margin-bottom: 8px;
    }
    .drop-zone p {
      color: var(--text-dim);
      font-size: 14px;
    }
    .drop-zone input[type="file"] {
      display: none;
    }
    .file-info {
      margin-top: 14px;
      font-size: 13px;
      color: var(--text-dim);
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
      margin-top: 14px;
      transition: background 0.2s;
    }
    .btn:hover:not(:disabled) {
      background: var(--accent-hover);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .status {
      margin-top: 14px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
    }
    .status.success {
      background: rgba(34, 197, 94, 0.1);
      color: var(--success);
      border: 1px solid rgba(34, 197, 94, 0.25);
    }
    .status.error {
      background: rgba(239, 68, 68, 0.1);
      color: var(--danger);
      border: 1px solid rgba(239, 68, 68, 0.25);
    }
    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      vertical-align: middle;
      margin-right: 6px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class UploadComponent {
  private readonly api = inject(ApiService);
  private readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly selectedFile = signal<File | null>(null);
  readonly isUploading = signal(false);
  readonly isDragging = signal(false);
  readonly status = signal<{ type: 'loading' | 'success' | 'error'; message: string } | null>(null);

  readonly uploaded = output<number>();

  onLabelClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    this.fileInputRef()?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.handleFile(file);
  }

  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type === 'application/pdf') {
      this.handleFile(file);
    } else {
      this.status.set({ type: 'error', message: 'Please drop a PDF file.' });
    }
  }

  onUpload(): void {
    const file = this.selectedFile();
    if (!file || this.isUploading()) return;

    this.isUploading.set(true);
    this.status.set({ type: 'loading', message: 'Processing PDF &mdash; this may take a moment...' });

    this.api.uploadPdf(file).subscribe({
      next: (res) => {
        this.isUploading.set(false);
        this.status.set({
          type: 'success',
          message: `&#9989; PDF processed! ${res.chunksProcessed} chunks indexed.`,
        });
        this.uploaded.emit(res.chunksProcessed);
      },
      error: (err: HttpErrorResponse) => {
        this.isUploading.set(false);
        const message = err.error?.error || err.message || 'Upload failed';
        this.status.set({ type: 'error', message: `&#10060; ${message}` });
      },
    });
  }

  formatSize(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(2);
  }

  private handleFile(file: File): void {
    this.selectedFile.set(file);
    this.status.set(null);
  }
}
