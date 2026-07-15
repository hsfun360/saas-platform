import { Directive, TemplateRef, ViewContainerRef, inject, input, effect } from '@angular/core';
import { MenuAction, PermissionsService } from '../services/permissions.service';

// Structural permission gate: renders its host only when the current user's
// role allows the action on the CURRENT screen (resolved from the granted
// menus' action flags). UI-gating only — the backend's requireMenuAction
// middleware stays the authoritative check.
//
//   <button *appCan="'create'" class="btn btn--primary fab">New fee</button>
//   <button *appCan="'edit'" (click)="startEdit(row)">Edit</button>
//   <button *appCan="'delete'" (click)="onDelete(row)">Delete</button>
//
// The directive evaluates once per instantiation, which is per navigation for
// route-bound screens — permissions only change on login/role switch, so no
// live re-evaluation is needed.
@Directive({
  selector: '[appCan]',
  standalone: true,
})
export class CanDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly permissions = inject(PermissionsService);

  readonly appCan = input.required<MenuAction>();

  private rendered = false;

  constructor() {
    effect(() => {
      const allowed = this.permissions.can(this.appCan());
      if (allowed && !this.rendered) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.rendered = true;
      } else if (!allowed && this.rendered) {
        this.viewContainer.clear();
        this.rendered = false;
      }
    });
  }
}
