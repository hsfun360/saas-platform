import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  output,
  signal,
  viewChild,
} from '@angular/core';
import jsQR from 'jsqr';

// Minimal typing of the Shape Detection API (Chrome / Android, Safari 17+);
// the TypeScript lib does not ship it yet.
interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

// The ONE camera QR reader (2026-10-17, buggy station): opens the rear camera,
// decodes QR codes from the live frame - with the browser's own
// BarcodeDetector where it exists, else with the bundled jsQR decoder on a
// canvas - and emits each code once (the same code is not re-emitted until a
// different one is seen or `reset()` is called). A keyboard-wedge scanner
// never needs this: it types the code into the focused input.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-qr-scanner',
  standalone: true,
  template: `
    <div class="qrs">
      <video #video class="qrs__video" playsinline muted autoplay aria-label="Camera preview for QR scanning"></video>
      @if (error()) {
        <p class="qrs__error" role="alert">{{ error() }}</p>
      } @else if (!ready()) {
        <p class="qrs__hint">Starting the camera…</p>
      } @else {
        <p class="qrs__hint">Point the camera at the buggy's QR label.</p>
      }
    </div>
  `,
  styles: [`
    .qrs { display: grid; gap: var(--space-sm); }
    .qrs__video { width: 100%; max-height: 50vh; background: var(--surface-sunken); border-radius: 8px; object-fit: cover; }
    .qrs__hint { margin: 0; font-size: var(--font-body-2); color: var(--text-secondary); }
    .qrs__error { margin: 0; font-size: var(--font-body-2); color: var(--danger-text); }
  `],
})
export class QrScannerComponent implements OnDestroy {
  readonly scanned = output<string>();
  readonly ready = signal(false);
  readonly error = signal('');

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private stream: MediaStream | null = null;
  private frame = 0;
  private lastCode = '';
  private detector: BarcodeDetectorLike | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private stopped = false;

  constructor() {
    afterNextRender(() => { void this.start(); });
  }

  // Forget the last code so the same label can be read again (e.g. after a
  // failed issue the operator fixes the slot and rescans).
  reset(): void {
    this.lastCode = '';
  }

  private async start(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.error.set('This browser has no camera access - type or scan the code into the box instead.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch {
      this.error.set('Camera not available or permission refused - type or scan the code into the box instead.');
      return;
    }
    if (this.stopped) { this.release(); return; }
    const video = this.video().nativeElement;
    video.srcObject = this.stream;
    try { await video.play(); } catch { /* autoplay refused: the user taps play */ }
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (Ctor) {
      try { this.detector = new Ctor({ formats: ['qr_code'] }); } catch { this.detector = null; }
    }
    this.ready.set(true);
    this.tick();
  }

  private tick(): void {
    if (this.stopped) return;
    this.frame = requestAnimationFrame(() => { void this.decode().finally(() => this.tick()); });
  }

  private async decode(): Promise<void> {
    const video = this.video().nativeElement;
    if (video.readyState < 2) return;
    let code = '';
    if (this.detector) {
      try {
        const found = await this.detector.detect(video);
        code = found.length ? found[0].rawValue : '';
      } catch {
        this.detector = null; // fall back to jsQR from the next frame
      }
    } else {
      if (!this.canvas) this.canvas = document.createElement('canvas');
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      this.canvas.width = w;
      this.canvas.height = h;
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const hit = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      code = hit ? hit.data : '';
    }
    if (code && code !== this.lastCode) {
      this.lastCode = code;
      this.scanned.emit(code);
    }
  }

  private release(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
  }

  ngOnDestroy(): void {
    this.stopped = true;
    this.release();
  }
}
