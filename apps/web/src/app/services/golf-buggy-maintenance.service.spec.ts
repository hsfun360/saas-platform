import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { GolfBuggyMaintenanceService } from './golf-buggy-maintenance.service';
import { environment } from '../../environments/environment';

// One test per endpoint shape (method, URL, payload keys) for the jobs and
// the damage register.
describe('GolfBuggyMaintenanceService', () => {
  let service: GolfBuggyMaintenanceService;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GolfBuggyMaintenanceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists jobs with only the filters given, opens a repair on several units and inspects with the checklist', () => {
    service.list({ status: 'open', kind: '', dateFrom: '2026-10-01' }).subscribe();
    const list = http.expectOne((r) => r.url === `${api}/golf/buggy-maintenance`);
    expect(list.request.params.get('status')).toBe('open');
    expect(list.request.params.has('kind')).toBe(false);
    expect(list.request.params.get('dateFrom')).toBe('2026-10-01');
    list.flush({});

    service.open({ buggyIds: ['b1', 'b2'], kind: 'repair', findings: 'Brakes soft' }).subscribe();
    const open = http.expectOne(`${api}/golf/buggy-maintenance`);
    expect(open.request.method).toBe('POST');
    expect(open.request.body).toEqual({ buggyIds: ['b1', 'b2'], kind: 'repair', findings: 'Brakes soft' });
    open.flush({ message: 'ok', jobs: [] });

    service.inspect({ items: [{ buggyId: 'b1', brakesOk: false, findings: 'Pads worn' }] }).subscribe();
    const inspect = http.expectOne(`${api}/golf/buggy-maintenance/inspect`);
    expect(inspect.request.body.items[0]).toEqual({ buggyId: 'b1', brakesOk: false, findings: 'Pads worn' });
    inspect.flush({ message: 'ok', passed: [], faulted: ['B-001'], skipped: [] });
  });

  it('completes and cancels a job, records, updates and resolves a damage', () => {
    service.complete('m1', { workDone: 'Pads replaced', cost: 120 }).subscribe();
    const done = http.expectOne(`${api}/golf/buggy-maintenance/m1/complete`);
    expect(done.request.body).toEqual({ workDone: 'Pads replaced', cost: 120 });
    done.flush({ message: 'ok', job: {} });

    service.cancel('m1').subscribe();
    expect(http.expectOne(`${api}/golf/buggy-maintenance/m1`).request.method).toBe('DELETE');

    service.recordDamage({ buggyId: 'b1', playDate: '2026-10-18', reasonType: 'player', description: 'Bent roof post', openRepair: true }).subscribe();
    const rec = http.expectOne(`${api}/golf/buggy-damages`);
    expect(rec.request.method).toBe('POST');
    expect(rec.request.body.openRepair).toBe(true);
    rec.flush({ message: 'ok', damage: {} });

    service.updateDamage('d1', { buggyId: 'b1', playDate: '2026-10-18', reasonType: 'staff', description: 'Bent roof post' }).subscribe();
    expect(http.expectOne(`${api}/golf/buggy-damages/d1`).request.method).toBe('PUT');

    service.resolveDamage('d1').subscribe();
    expect(http.expectOne(`${api}/golf/buggy-damages/d1/resolve`).request.method).toBe('POST');
  });
});
