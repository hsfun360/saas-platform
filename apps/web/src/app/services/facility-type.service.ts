import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

// The usage mode of a Facility Type (facility.constants USAGE_MODES, user
// decision 2026-10-24: exactly three).
export type FacilityUsageMode = 'slot' | 'entry' | 'issue';

export interface FacilityUsageModeOption extends MembershipStatusOption {
  key: FacilityUsageMode;
  hint?: string;
}

// GET /api/facility/meta - the vocabularies every slice-1 screen uses.
export interface FacilityMeta {
  usageModes: FacilityUsageModeOption[];
  dayScopes: MembershipStatusOption[];
  limits: { maxSlotsPerSet: number; slotMinutesMin: number; slotMinutesMax: number; maxClosureRangeDays: number; maxSessions: number };
}

// One row of facility.FacilityType (structure approved 2026-10-25): the kind
// of facility and its rules; the column group that applies follows usageMode.
export interface FacilityType {
  id: string;
  code: string;
  description: string;
  usageMode: FacilityUsageMode;
  iconUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  // slot mode
  maxParticipants: number | null;
  minParticipants: number;
  maxSlotsPerDayWeekday: number;
  maxSlotsPerDayWeekend: number;
  maxConsecutiveSlots: number;
  advanceBookingDays: number | null;
  // entry mode
  capacity: number | null;
  // issue mode
  trackUnits: boolean;
  maxIssuePerPatron: number;
  // opening hours (entry + issue), 'HH:MM' or null
  openTimeWeekday: string | null;
  closeTimeWeekday: string | null;
  openTimeWeekend: string | null;
  closeTimeWeekend: string | null;
  // guest policy
  guestsAllowed: boolean;
  memberGuestsAllowed: boolean;
  maxGuestsPerBooking: number | null;
  hostMustBePresent: boolean;
  // slice 2a: default fees (facility.TransactionType ids) + approval
  feeTransactionTypeId: string | null;
  guestFeeTransactionTypeId: string | null;
  requiresApproval: boolean;
  // slice 3: issue fee, due days, entry gate
  issueFeeTransactionTypeId: string | null;
  issueDueDays: number;
  entryRequiresBooking: boolean;
  // slice 4: no-show switches (under the Specification's master switch)
  noShowChargeEnabled: boolean;
  noShowStrikeEnabled: boolean;
  // listing counts
  unitCount: number;
  activeUnitCount: number;
  slotSetCount: number;
  canModify?: boolean;
}

export type FacilityTypePayload = Partial<Omit<FacilityType, 'id' | 'unitCount' | 'activeUnitCount' | 'slotSetCount' | 'canModify'>>;

// One generated slot of a slot set ('HH:MM' times).
export interface FacilityTypeSlot {
  id?: string;
  slotNumber: number;
  startTime: string;
  endTime: string;
  isFrontDesk: boolean;
  isActive: boolean;
}

// One slot definition of a slot-mode type, versioned by day scope + effective
// date; `slots` are generated from the header, then hand-adjusted.
export interface FacilityTypeSlotSet {
  id: string;
  facilityTypeId: string;
  description: string | null;
  dayScope: string; // 'all' | 'weekday' | 'weekend'
  effectiveDate: string; // 'YYYY-MM-DD'
  firstSlotTime: string; // 'HH:MM'
  lastSlotTime: string;
  slotMinutes: number;
  frontDeskFrom: string | null;
  isActive: boolean;
  slots: FacilityTypeSlot[];
}

export interface FacilitySlotSetHeader {
  description?: string | null;
  dayScope: string;
  effectiveDate: string;
  firstSlotTime: string;
  lastSlotTime: string;
  slotMinutes: number;
  frontDeskFrom?: string | null;
}

// Facility Types master (+ slot sets) for the active company. Reads pass on
// the Facilities and Closures menu grants too; writes need the Facility Types grant.
@Injectable({ providedIn: 'root' })
export class FacilityTypeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/facility-types`;

  meta(): Observable<FacilityMeta> {
    return this.http.get<FacilityMeta>(`${environment.apiUrl}/facility/meta`);
  }

  list(): Observable<FacilityType[]> {
    return this.http.get<FacilityType[]>(this.base);
  }

  create(payload: FacilityTypePayload): Observable<{ message: string; facilityType: FacilityType }> {
    return this.http.post<{ message: string; facilityType: FacilityType }>(this.base, payload);
  }

  update(id: string, payload: FacilityTypePayload): Observable<{ message: string; facilityType: FacilityType }> {
    return this.http.patch<{ message: string; facilityType: FacilityType }>(`${this.base}/${id}`, payload);
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }

  uploadIcon(file: File): Observable<{ message: string; url: string }> {
    const form = new FormData();
    form.append('icon', file);
    return this.http.post<{ message: string; url: string }>(`${this.base}/icon`, form);
  }

  // --- Slot sets of a slot-mode type ---

  slotSets(typeId: string): Observable<FacilityTypeSlotSet[]> {
    return this.http.get<FacilityTypeSlotSet[]>(`${this.base}/${typeId}/slot-sets`);
  }

  // The slots a header would generate (nothing saved).
  previewSlots(typeId: string, header: FacilitySlotSetHeader): Observable<{ slots: FacilityTypeSlot[] }> {
    return this.http.post<{ slots: FacilityTypeSlot[] }>(`${this.base}/${typeId}/slot-sets/preview`, header);
  }

  // Creates the header AND its generated slots in one go.
  createSlotSet(typeId: string, header: FacilitySlotSetHeader): Observable<{ message: string; set: FacilityTypeSlotSet }> {
    return this.http.post<{ message: string; set: FacilityTypeSlotSet }>(`${this.base}/${typeId}/slot-sets`, header);
  }

  // Header fields, isActive, and `regenerate: true` to rebuild the slots.
  updateSlotSet(typeId: string, setId: string, patch: Partial<FacilitySlotSetHeader> & { isActive?: boolean; regenerate?: boolean }): Observable<{ message: string; set: FacilityTypeSlotSet }> {
    return this.http.patch<{ message: string; set: FacilityTypeSlotSet }>(`${this.base}/${typeId}/slot-sets/${setId}`, patch);
  }

  saveSlots(typeId: string, setId: string, slots: FacilityTypeSlot[]): Observable<{ message: string; slots: FacilityTypeSlot[] }> {
    return this.http.put<{ message: string; slots: FacilityTypeSlot[] }>(`${this.base}/${typeId}/slot-sets/${setId}/slots`, { slots });
  }

  removeSlotSet(typeId: string, setId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${typeId}/slot-sets/${setId}`);
  }
}
