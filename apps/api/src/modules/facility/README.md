# facility (core product service)

Facility Management. Owns facility types (usage modes slot / entry / issue), the
physical units, slot sets, closures and the Facility Specification singleton
(slice 1, 2026-10-25); bookings, the Control Station, no-shows and classes
follow in slices 2-5. References `companyId` / `memberId` by UUID. Gateway
seam: `/api/facility`.

Spec: [`docs/systems/facility-management.md`](../../../docs/systems/facility-management.md).
Cross-service rules: [`docs/systems/README.md`](../../../docs/systems/README.md).
