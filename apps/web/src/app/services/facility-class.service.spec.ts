import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacilityClassService } from './facility-class.service';
import { FacilityVenueService } from './facility-venue.service';
import { FacilityInstructorService } from './facility-instructor.service';

describe('Facility class services', () => {
  let classes: FacilityClassService;
  let venues: FacilityVenueService;
  let instructors: FacilityInstructorService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    classes = TestBed.inject(FacilityClassService);
    venues = TestBed.inject(FacilityVenueService);
    instructors = TestBed.inject(FacilityInstructorService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists, creates, patches and deletes venues with the facility link', () => {
    venues.list().subscribe();
    expect(http.expectOne('/api/facility/venues').request.method).toBe('GET');

    venues.create({ code: 'LANES12', name: 'Pool lanes 1-2', facilityId: 'u1', capacity: 8 }).subscribe();
    const post = http.expectOne('/api/facility/venues');
    expect(post.request.method).toBe('POST');
    expect(post.request.body.facilityId).toBe('u1');

    venues.update('v1', { isActive: false }).subscribe();
    const patch = http.expectOne('/api/facility/venues/v1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ isActive: false });

    venues.remove('v1').subscribe();
    expect(http.expectOne('/api/facility/venues/v1').request.method).toBe('DELETE');
  });

  it('drives the instructor master and the photo upload', () => {
    instructors.list().subscribe();
    expect(http.expectOne('/api/facility/instructors').request.method).toBe('GET');

    instructors.create({ code: 'COACH1', name: 'Mei Ling' }).subscribe();
    expect(http.expectOne('/api/facility/instructors').request.method).toBe('POST');

    instructors.update('i1', { email: 'coach@example.com' }).subscribe();
    const patch = http.expectOne('/api/facility/instructors/i1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body.email).toBe('coach@example.com');

    instructors.uploadPhoto(new File(['x'], 'photo.png', { type: 'image/png' })).subscribe();
    const upload = http.expectOne('/api/facility/instructors/photo');
    expect(upload.request.body instanceof FormData).toBe(true);
    expect((upload.request.body as FormData).has('photo')).toBe(true);

    instructors.remove('i1').subscribe();
    expect(http.expectOne('/api/facility/instructors/i1').request.method).toBe('DELETE');
  });

  it('lists classes with the pickers and patches a class', () => {
    classes.list().subscribe();
    expect(http.expectOne('/api/facility/classes').request.method).toBe('GET');

    classes.create({ code: 'YOGA', description: 'Morning Yoga', enrolmentMode: 'session' }).subscribe();
    const post = http.expectOne('/api/facility/classes');
    expect(post.request.method).toBe('POST');
    expect(post.request.body.enrolmentMode).toBe('session');

    classes.update('c1', { capacity: 12 }).subscribe();
    const patch = http.expectOne('/api/facility/classes/c1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ capacity: 12 });

    classes.remove('c1').subscribe();
    expect(http.expectOne('/api/facility/classes/c1').request.method).toBe('DELETE');
  });

  it('previews, saves, re-plans, closes and cancels a schedule under its class', () => {
    const header = { name: 'Term 1', dateFrom: '2026-11-02', dateTo: '2026-12-18', weekdays: [1, 3], startTime: '10:00', endTime: '11:00', venueId: null, instructorId: null, capacity: null, skipClosures: true, skipPublicHolidays: true, termFeeNote: null, remarks: null };
    classes.schedules('c1').subscribe();
    expect(http.expectOne('/api/facility/classes/c1/schedules').request.method).toBe('GET');

    classes.previewSchedule('c1', { ...header, scheduleId: 's1' }).subscribe();
    const preview = http.expectOne('/api/facility/classes/c1/schedules/preview');
    expect(preview.request.method).toBe('POST');
    expect(preview.request.body.weekdays).toEqual([1, 3]);
    expect(preview.request.body.scheduleId).toBe('s1');

    classes.createSchedule('c1', header).subscribe();
    expect(http.expectOne('/api/facility/classes/c1/schedules').request.method).toBe('POST');

    classes.updateSchedule('c1', 's1', { dateTo: '2026-12-31' }).subscribe();
    const put = http.expectOne('/api/facility/classes/c1/schedules/s1');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ dateTo: '2026-12-31' });

    classes.closeSchedule('c1', 's1').subscribe();
    expect(http.expectOne('/api/facility/classes/c1/schedules/s1/close').request.method).toBe('POST');

    classes.cancelSchedule('c1', 's1', 'Instructor away').subscribe();
    const cancel = http.expectOne('/api/facility/classes/c1/schedules/s1/cancel');
    expect(cancel.request.body).toEqual({ reason: 'Instructor away' });
  });

  it('enrols a seat, reads the roster, marks attendance and holds the session', () => {
    classes.enrol({ classId: 'c1', sessionId: 'x1', memberNo: 'A1' }).subscribe();
    const enrol = http.expectOne('/api/facility/class-enrolments');
    expect(enrol.request.method).toBe('POST');
    expect(enrol.request.body).toEqual({ classId: 'c1', sessionId: 'x1', memberNo: 'A1' });
    enrol.flush({ message: 'enrolled', enrolmentId: 'e1', billId: null, warnings: [], standingWarning: null });

    classes.roster('x1').subscribe();
    expect(http.expectOne('/api/facility/class-sessions/x1/roster').request.method).toBe('GET');

    classes.markAttendance('x1', [{ attendanceId: 'a1', status: 'attended' }]).subscribe();
    const marks = http.expectOne('/api/facility/class-sessions/x1/attendance');
    expect(marks.request.method).toBe('PUT');
    expect(marks.request.body.marks[0].status).toBe('attended');

    classes.hold('x1', false).subscribe();
    const preview = http.expectOne('/api/facility/class-sessions/x1/hold');
    expect(preview.request.body).toEqual({ confirm: false });
    preview.flush({ preview: { unmarked: [], attended: 0, excused: 0, noShow: 0 } });

    classes.hold('x1', true).subscribe();
    expect(http.expectOne('/api/facility/class-sessions/x1/hold').request.body).toEqual({ confirm: true });
  });

  it('reads the timetable by range and filters, adds, moves and cancels a session', () => {
    classes.sessionsBetween('2026-11-02', '2026-11-08', { instructorId: 'i1', classId: null }).subscribe();
    const list = http.expectOne((r) => r.url === '/api/facility/class-sessions');
    expect(list.request.params.get('from')).toBe('2026-11-02');
    expect(list.request.params.get('to')).toBe('2026-11-08');
    expect(list.request.params.get('instructorId')).toBe('i1');
    expect(list.request.params.has('classId')).toBe(false);

    classes.createSession({ classId: 'c1', sessionDate: '2026-11-05', startTime: '18:00', endTime: '19:00' }).subscribe();
    const post = http.expectOne('/api/facility/class-sessions');
    expect(post.request.method).toBe('POST');
    expect(post.request.body.classId).toBe('c1');

    classes.updateSession('x1', { instructorId: 'i2' }).subscribe();
    const patch = http.expectOne('/api/facility/class-sessions/x1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ instructorId: 'i2' });

    classes.cancelSession('x1', 'Pool closed').subscribe();
    const cancel = http.expectOne('/api/facility/class-sessions/x1/cancel');
    expect(cancel.request.body).toEqual({ reason: 'Pool closed' });
  });
});
