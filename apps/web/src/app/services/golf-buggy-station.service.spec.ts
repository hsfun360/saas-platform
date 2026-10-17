import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { GolfBuggyStationService } from './golf-buggy-station.service';
import { GolfBuggyService } from './golf-buggy.service';
import { GolfBuggyTypeService } from './golf-buggy-type.service';
import { environment } from '../../environments/environment';

// One test per endpoint shape (method, URL, payload keys) so a backend
// contract change fails here, not on the station screen.
describe('Golf buggy services', () => {
  let station: GolfBuggyStationService;
  let fleet: GolfBuggyService;
  let types: GolfBuggyTypeService;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    station = TestBed.inject(GolfBuggyStationService);
    fleet = TestBed.inject(GolfBuggyService);
    types = TestBed.inject(GolfBuggyTypeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the station day with the play date and an optional course', () => {
    station.day('2026-10-17').subscribe();
    const all = http.expectOne((r) => r.url === `${api}/golf/buggy-station/day`);
    expect(all.request.method).toBe('GET');
    expect(all.request.params.get('playDate')).toBe('2026-10-17');
    expect(all.request.params.has('courseId')).toBe(false);
    all.flush({ enabled: true, playDate: '2026-10-17', courses: [], flights: [], fleet: { active: 0, inDepot: 0, onCourse: 0, maintenance: 0 }, out: [] });

    station.day('2026-10-17', 'course-1').subscribe();
    const one = http.expectOne((r) => r.url === `${api}/golf/buggy-station/day`);
    expect(one.request.params.get('courseId')).toBe('course-1');
    one.flush({});
  });

  it('resolves a scanned code as a query parameter, never in the path', () => {
    station.resolve('https://club/golf/buggy-station?b=abc').subscribe();
    const req = http.expectOne((r) => r.url === `${api}/golf/buggy-station/resolve`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('code')).toBe('https://club/golf/buggy-station?b=abc');
    req.flush({ buggy: { id: 'b1', buggyNo: 'B-001', status: 'active', location: 'in-depot', buggyTypeId: 't1', buggyType: null }, openIssue: null });
  });

  it('issues a unit to the picked riders by buggy id', () => {
    station.issue({ buggy: { id: 'b1' }, playerIds: ['p1', 'p2'] }).subscribe();
    const req = http.expectOne(`${api}/golf/buggy-station/issue`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ buggy: { id: 'b1' }, playerIds: ['p1', 'p2'] });
    req.flush({ message: 'ok', issue: {}, warnings: [] });
  });

  it('returns and swaps by the outing id with the condition and reason', () => {
    station.returnBuggy({ issueId: 'i1', conditionIn: 'damaged', remarksIn: 'bent roof' }).subscribe();
    const ret = http.expectOne(`${api}/golf/buggy-station/return`);
    expect(ret.request.method).toBe('POST');
    expect(ret.request.body).toEqual({ issueId: 'i1', conditionIn: 'damaged', remarksIn: 'bent roof' });
    ret.flush({ message: 'ok', issue: {} });

    station.swap({ issueId: 'i1', newBuggy: { code: 'B-002' }, swapReason: 'Battery flat', swapHole: 7, conditionIn: 'fault', remarksIn: null }).subscribe();
    const swap = http.expectOne(`${api}/golf/buggy-station/swap`);
    expect(swap.request.method).toBe('POST');
    expect(swap.request.body.newBuggy).toEqual({ code: 'B-002' });
    expect(swap.request.body.swapReason).toBe('Battery flat');
    expect(swap.request.body.swapHole).toBe(7);
    swap.flush({ message: 'ok', issue: {}, swappedIssue: {} });
  });

  it('fleet register: create, retire with a reason, regenerate the QR, and fetch the label sheet as text', () => {
    fleet.create({ buggyNo: 'B-001', buggyTypeId: 't1', model: null, serialNo: null, purchaseDate: null, remarks: null }).subscribe();
    const create = http.expectOne(`${api}/golf/buggies`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body.buggyNo).toBe('B-001');
    create.flush({ message: 'ok', buggy: {} });

    fleet.retire('b1', 'Sold').subscribe();
    const retire = http.expectOne(`${api}/golf/buggies/b1/retire`);
    expect(retire.request.method).toBe('POST');
    expect(retire.request.body).toEqual({ reason: 'Sold' });
    retire.flush({ message: 'ok', buggy: {} });

    fleet.regenerateQr('b1').subscribe();
    const qr = http.expectOne(`${api}/golf/buggies/b1/regenerate-qr`);
    expect(qr.request.method).toBe('POST');
    qr.flush({ message: 'ok', buggy: {} });

    fleet.labelsHtml(['b1', 'b2']).subscribe();
    const labels = http.expectOne((r) => r.url === `${api}/golf/buggies/labels/html`);
    expect(labels.request.method).toBe('GET');
    expect(labels.request.responseType).toBe('text');
    expect(labels.request.params.get('ids')).toBe('b1,b2');
    labels.flush('<html></html>');
  });

  it('buggy types: list, update and toggle', () => {
    types.list().subscribe();
    const list = http.expectOne(`${api}/golf/buggy-types`);
    expect(list.request.method).toBe('GET');
    list.flush({ buggyTypes: [], minSeats: 1, maxSeats: 6 });

    types.update('t1', { code: '2SEAT', name: 'Two-seater', seats: 2, sortOrder: 100 }).subscribe();
    const update = http.expectOne(`${api}/golf/buggy-types/t1`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body.seats).toBe(2);
    update.flush({ message: 'ok', buggyType: {} });

    types.setActive('t1', false).subscribe();
    const toggle = http.expectOne(`${api}/golf/buggy-types/t1`);
    expect(toggle.request.method).toBe('PATCH');
    expect(toggle.request.body).toEqual({ isActive: false });
    toggle.flush({ message: 'ok', buggyType: {} });
  });
});
