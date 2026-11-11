import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

// How a utility item is handed out: 'units' = numbered units issued and
// returned one by one (a locker), 'quantity' = pieces issued and counted
// back (towels), 'use' = a use recorded with nothing to return (a shower).
export type UtilityBehaviour = 'units' | 'quantity' | 'use';

// One row of facility.UtilityItem (slice 6a, structure approved 2026-11-11):
// what the Control Station hands out or lets a person use. NOT a facility -
// a facility is a place a person books or enters.
export interface FacilityUtilityItem {
  id: string;
  code: string;
  description: string;
  trackUnits: boolean;
  returnRequired: boolean;
  behaviour: UtilityBehaviour;
  stockQuantity: number | null;
  maxPerPerson: number;
  dueDays: number;
  feeTransactionTypeId: string | null;
  guestsAllowed: boolean;
  requiresEntry: boolean;
  iconUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  // Rollups for the listing.
  unitCount: number;
  unitsAvailable: number;
  outCount: number;
  canModify?: boolean;
}

export type FacilityUtilityItemPayload = Partial<Pick<FacilityUtilityItem,
  'code' | 'description' | 'trackUnits' | 'returnRequired' | 'stockQuantity' | 'maxPerPerson' | 'dueDays' | 'feeTransactionTypeId'
  | 'guestsAllowed' | 'requiresEntry' | 'iconUrl' | 'sortOrder' | 'isActive'>>;

// One numbered unit of an item that tracks its units (locker L014).
export interface FacilityUtilityUnit {
  id: string;
  utilityItemId: string;
  code: string;
  location: string | null;
  unitStatus: 'available' | 'issued' | 'out-of-service';
  currentIssueId: string | null;
  remarks: string | null;
  sortOrder: number;
  isActive: boolean;
}

export type FacilityUtilityUnitPayload = Partial<Pick<FacilityUtilityUnit, 'code' | 'location' | 'remarks' | 'sortOrder' | 'isActive'>>;

export interface UtilityFeeItemOption {
  id: string;
  transactionType: string;
  description: string;
  isActive: boolean;
}

export interface FacilityUtilityItemListing {
  items: FacilityUtilityItem[];
  feeItems: UtilityFeeItemOption[];
  unitStatuses: MembershipStatusOption[];
  limits: { maxGenerate: number };
}

// "Generate units": the codes a prefix and a number range would add.
export interface UtilityUnitGenerateRequest {
  prefix: string;
  from: number;
  to: number;
  pad?: number | null;
  location?: string | null;
}

export interface UtilityUnitGeneratePreview {
  codes: { code: string; exists: boolean }[];
  fresh: number;
  existing: number;
}

// Utility Items master (/facility/utility-items). Reads pass on the Control
// Station grant too; writes need the Utility Items grant.
@Injectable({ providedIn: 'root' })
export class FacilityUtilityItemService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/utility-items`;

  list(): Observable<FacilityUtilityItemListing> {
    return this.http.get<FacilityUtilityItemListing>(this.base);
  }

  create(payload: FacilityUtilityItemPayload): Observable<{ message: string; item: FacilityUtilityItem }> {
    return this.http.post<{ message: string; item: FacilityUtilityItem }>(this.base, payload);
  }

  update(id: string, payload: FacilityUtilityItemPayload): Observable<{ message: string; item: FacilityUtilityItem }> {
    return this.http.patch<{ message: string; item: FacilityUtilityItem }>(`${this.base}/${id}`, payload);
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }

  // --- the numbered units of one item ---

  units(itemId: string): Observable<FacilityUtilityUnit[]> {
    return this.http.get<FacilityUtilityUnit[]>(`${this.base}/${itemId}/units`);
  }

  createUnit(itemId: string, payload: FacilityUtilityUnitPayload): Observable<{ message: string; unit: FacilityUtilityUnit }> {
    return this.http.post<{ message: string; unit: FacilityUtilityUnit }>(`${this.base}/${itemId}/units`, payload);
  }

  updateUnit(itemId: string, unitId: string, payload: FacilityUtilityUnitPayload): Observable<{ message: string; unit: FacilityUtilityUnit }> {
    return this.http.patch<{ message: string; unit: FacilityUtilityUnit }>(`${this.base}/${itemId}/units/${unitId}`, payload);
  }

  removeUnit(itemId: string, unitId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${itemId}/units/${unitId}`);
  }

  // The codes the range would add, with the ones that already exist flagged.
  previewUnits(itemId: string, req: UtilityUnitGenerateRequest): Observable<UtilityUnitGeneratePreview> {
    return this.http.post<UtilityUnitGeneratePreview>(`${this.base}/${itemId}/units/generate`, { ...req, preview: true });
  }

  generateUnits(itemId: string, req: UtilityUnitGenerateRequest): Observable<{ message: string; added: number }> {
    return this.http.post<{ message: string; added: number }>(`${this.base}/${itemId}/units/generate`, { ...req, preview: false });
  }
}
