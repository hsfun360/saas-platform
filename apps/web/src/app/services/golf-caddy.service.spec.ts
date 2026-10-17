import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { GolfCaddyService } from './golf-caddy.service';
import { GolfCaddyGradeService } from './golf-caddy-grade.service';
import { GolfCaddyGroupService } from './golf-caddy-group.service';
import { environment } from '../../environments/environment';

// One test per endpoint shape (method, URL, payload keys) so a backend
// contract change fails here, not on the screens.
describe('Golf caddy services', () => {
  let caddies: GolfCaddyService;
  let grades: GolfCaddyGradeService;
  let groups: GolfCaddyGroupService;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    caddies = TestBed.inject(GolfCaddyService);
    grades = TestBed.inject(GolfCaddyGradeService);
    groups = TestBed.inject(GolfCaddyGroupService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('register: create, status change with a reason, and the badge sheet as text', () => {
    caddies.create({
      caddyNo: 'C-001', name: 'Ali', caddyGradeId: 'g1', caddyGroupId: null, isLeader: false, staffNo: null, identityNo: null, gender: null,
      dateOfBirth: null, mobile: null, email: null, languages: null, nationalityCode: 'MAS', raceCode: null, photo: null, joinedDate: null, leftDate: null, remarks: null,
    }).subscribe();
    const create = http.expectOne(`${api}/golf/caddies`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body.caddyNo).toBe('C-001');
    expect(create.request.body.nationalityCode).toBe('MAS');
    create.flush({ message: 'ok', caddy: {} });

    caddies.setStatus('c1', 'blacklisted', 'Repeated complaints').subscribe();
    const status = http.expectOne(`${api}/golf/caddies/c1/status`);
    expect(status.request.method).toBe('PATCH');
    expect(status.request.body).toEqual({ status: 'blacklisted', reason: 'Repeated complaints' });
    status.flush({ message: 'ok', caddy: {} });

    caddies.badgesHtml(['c1']).subscribe();
    const badges = http.expectOne((r) => r.url === `${api}/golf/caddies/badges/html`);
    expect(badges.request.responseType).toBe('text');
    expect(badges.request.params.get('ids')).toBe('c1');
    badges.flush('<html></html>');
  });

  it('leave and notes hang off the caddy id', () => {
    caddies.createLeave('c1', { leaveType: 'sick', dateFrom: '2026-10-20', dateTo: '2026-10-21', remarks: null }).subscribe();
    const leave = http.expectOne(`${api}/golf/caddies/c1/leaves`);
    expect(leave.request.method).toBe('POST');
    expect(leave.request.body.leaveType).toBe('sick');
    leave.flush({ message: 'ok', leave: {} });

    caddies.removeLeave('c1', 'l1').subscribe();
    const del = http.expectOne(`${api}/golf/caddies/c1/leaves/l1`);
    expect(del.request.method).toBe('DELETE');
    del.flush({ message: 'ok' });

    caddies.updateNote('c1', 'n1', { kind: 'commendation', noteDate: '2026-10-17', points: 5, description: 'Praised by member', followUp: null }).subscribe();
    const note = http.expectOne(`${api}/golf/caddies/c1/notes/n1`);
    expect(note.request.method).toBe('PUT');
    expect(note.request.body.points).toBe(5);
    note.flush({ message: 'ok', note: {} });
  });

  it('grades and groups: update payload keys', () => {
    grades.update('g1', { code: 'GOLD', name: 'Gold caddy', playersPerCaddy: 2, sortOrder: 10 }).subscribe();
    const grade = http.expectOne(`${api}/golf/caddy-grades/g1`);
    expect(grade.request.method).toBe('PUT');
    expect(grade.request.body.playersPerCaddy).toBe(2);
    grade.flush({ message: 'ok', caddyGrade: {} });

    groups.create({ code: 'TEAM-A', name: 'Team A', maxCaddies: null, rotationOrder: 1 }).subscribe();
    const group = http.expectOne(`${api}/golf/caddy-groups`);
    expect(group.request.method).toBe('POST');
    expect(group.request.body.maxCaddies).toBeNull();
    group.flush({ message: 'ok', caddyGroup: {} });
  });
});
