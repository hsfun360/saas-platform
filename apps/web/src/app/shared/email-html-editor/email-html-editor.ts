import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type { Editor, TinyMCE } from 'tinymce';
import { EmailTemplateVariable } from '../../models/auth.models';

// A WYSIWYG editor for Handlebars email bodies, bound as a ControlValueAccessor so it
// drops into a reactive form exactly like the old <textarea> (formControlName="bodyHtml").
//
// Self-hosted TinyMCE (GPL build served from /tinymce, no cloud, no API key). Declared
// merge variables render as non-editable {{chips}} inside the editor for discoverability,
// but the value read/written to the form is always plain Handlebars ({{token}}), so the
// server compiles it unchanged and "reset to default" / preview keep working.
//
// Upgrade seam: to move to the paid Merge Tags plugin later, swap `license_key: 'gpl'`
// for the commercial key + add `mergetags` to `plugins`, and replace the hand-built
// `mergevars` menu below. Nothing else changes.

const CHIP_CLASS = 'mce-var';

const CHIP_CSS = `.${CHIP_CLASS}{background:#eef2ff;color:#3730a3;padding:1px 6px;border-radius:4px;` +
  `font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em;white-space:nowrap;}` +
  `body{font-family:Arial,Helvetica,sans-serif;font-size:14px;}`;

let tinymceLoader: Promise<TinyMCE> | null = null;

/** Load the self-hosted TinyMCE script once, resolving with the global. */
function loadTinymce(): Promise<TinyMCE> {
  const existing = (window as unknown as { tinymce?: TinyMCE }).tinymce;
  if (existing) return Promise.resolve(existing);
  if (tinymceLoader) return tinymceLoader;
  tinymceLoader = new Promise<TinyMCE>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/tinymce/tinymce.min.js';
    script.referrerPolicy = 'origin';
    script.onload = () => {
      const t = (window as unknown as { tinymce?: TinyMCE }).tinymce;
      t ? resolve(t) : reject(new Error('TinyMCE loaded but the global was not found.'));
    };
    script.onerror = () => reject(new Error('Failed to load the TinyMCE script from /tinymce.'));
    document.head.appendChild(script);
  });
  return tinymceLoader;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Render one merge-variable chip (used by the toolbar menu and by raw -> chips). */
function chipElement(doc: Document, name: string): HTMLSpanElement {
  const span = doc.createElement('span');
  span.className = CHIP_CLASS;
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('data-var', name);
  span.textContent = `{{${name}}}`;
  return span;
}

/**
 * Wrap every declared {{variable}} that appears in *text* into a chip. Only text nodes
 * are touched, so tokens inside attributes (e.g. href="{{activationLink}}") are left
 * intact and never corrupted. Logic blocks ({{#if}}, {{/if}}) are not declared
 * variables, so they stay as plain, editable text.
 */
function rawToChips(raw: string, variables: readonly EmailTemplateVariable[]): string {
  if (!raw) return '';
  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = raw;
  const names = variables.map((v) => v.name).filter(Boolean);
  if (names.length) {
    const combined = new RegExp(`\\{\\{\\s*(${names.map(escapeForRegex).join('|')})\\s*\\}\\}`, 'g');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node as Text);
    for (const node of textNodes) {
      const text = node.nodeValue ?? '';
      combined.lastIndex = 0;
      if (!combined.test(text)) continue;
      combined.lastIndex = 0;
      const frag = doc.createDocumentFragment();
      let last = 0;
      for (let m = combined.exec(text); m; m = combined.exec(text)) {
        if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
        frag.appendChild(chipElement(doc, m[1]));
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
      node.parentNode?.replaceChild(frag, node);
    }
  }
  return doc.body.innerHTML;
}

/** Collapse chips back to literal {{token}} so the stored/compiled HTML is plain Handlebars. */
function chipsToRaw(html: string): string {
  if (!html) return '';
  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = html;
  doc.body.querySelectorAll(`span.${CHIP_CLASS}`).forEach((el) => {
    const name = (el.getAttribute('data-var') ?? el.textContent ?? '').replace(/[{}]/g, '').trim();
    el.replaceWith(doc.createTextNode(`{{${name}}}`));
  });
  return doc.body.innerHTML;
}

@Component({
  selector: 'app-email-html-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- TinyMCE replaces this textarea and hides it on init; don't pre-hide it here
         (a display:none target makes TinyMCE render the editor hidden too). -->
    <textarea #host class="ehe-host" aria-label="Email body HTML"></textarea>
    @if (loadingEditor()) {
      <div class="ehe-loading">
        <div class="spinner"></div>
        <span>Loading editor…</span>
      </div>
    }
    @if (failed()) {
      <div class="ehe-error" role="alert">The editor failed to load. Reload the page to try again.</div>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .ehe-loading { display: flex; align-items: center; gap: var(--space-sm, 8px); padding: var(--space-md, 16px);
        color: #64748b; font-size: 14px; border: 1px solid #e2e8f0; border-radius: 8px; }
      .ehe-loading .spinner { width: 18px; height: 18px; border: 2px solid #cbd5e1; border-top-color: #2563eb;
        border-radius: 50%; animation: ehe-spin 0.7s linear infinite; }
      .ehe-error { padding: var(--space-md, 16px); color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca;
        border-radius: 8px; font-size: 14px; }
      @keyframes ehe-spin { to { transform: rotate(360deg); } }
    `,
  ],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => EmailHtmlEditorComponent), multi: true },
  ],
})
export class EmailHtmlEditorComponent implements AfterViewInit, OnDestroy, ControlValueAccessor {
  /** The template's declared merge variables (shown in the "Insert variable" menu + as chips). */
  readonly variables = input<readonly EmailTemplateVariable[]>([]);

  private readonly host = viewChild.required<ElementRef<HTMLTextAreaElement>>('host');

  readonly loadingEditor = signal(true);
  readonly failed = signal(false);

  private editor: Editor | null = null;
  private ready = false;
  private applying = false; // suppress change events while we set content programmatically
  private pending = ''; // raw value buffered until the editor is ready
  private disabled = false;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  async ngAfterViewInit(): Promise<void> {
    let tinymce: TinyMCE;
    try {
      tinymce = await loadTinymce();
    } catch {
      this.loadingEditor.set(false);
      this.failed.set(true);
      return;
    }

    const variables = this.variables();
    await tinymce.init({
      target: this.host().nativeElement,
      base_url: '/tinymce',
      suffix: '.min',
      license_key: 'gpl',
      menubar: false,
      height: 480,
      branding: false,
      promotion: false,
      plugins: 'code link lists table autolink preview',
      toolbar: 'undo redo | blocks | bold italic forecolor | link | bullist numlist | mergevars | preview code',
      toolbar_mode: 'wrap',
      extended_valid_elements: `span[class|data-var|contenteditable|style]`,
      content_style: CHIP_CSS,
      setup: (editor) => {
        this.editor = editor;

        editor.ui.registry.addMenuButton('mergevars', {
          text: 'Insert variable',
          tooltip: 'Insert a merge variable',
          fetch: (callback) => {
            const items = variables.map((v) => ({
              type: 'menuitem' as const,
              text: `{{${v.name}}}`,
              onAction: () => {
                const doc = editor.getDoc();
                editor.insertContent(chipElement(doc, v.name).outerHTML + '&nbsp;');
              },
            }));
            callback(
              items.length
                ? items
                : [{ type: 'menuitem' as const, text: 'No variables for this template', enabled: false, onAction: () => {} }],
            );
          },
        });

        editor.on('init', () => {
          this.ready = true;
          this.loadingEditor.set(false);
          this.setEditorContent(this.pending);
          if (this.disabled) editor.mode.set('readonly');
        });

        editor.on('input change undo redo ExecCommand', () => this.emit());
        editor.on('blur', () => this.onTouched());
      },
    });
  }

  ngOnDestroy(): void {
    this.editor?.remove();
    this.editor = null;
  }

  // ---- ControlValueAccessor ----

  writeValue(value: string | null): void {
    this.pending = value ?? '';
    if (this.ready) this.setEditorContent(this.pending);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (this.ready && this.editor) this.editor.mode.set(isDisabled ? 'readonly' : 'design');
  }

  // ---- internals ----

  private setEditorContent(raw: string): void {
    if (!this.editor) return;
    this.applying = true;
    this.editor.setContent(rawToChips(raw, this.variables()));
    this.applying = false;
  }

  private emit(): void {
    if (this.applying || !this.editor) return;
    this.onChange(chipsToRaw(this.editor.getContent()));
  }
}
