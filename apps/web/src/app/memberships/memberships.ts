import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MembershipService } from '../services/membership.service';
import { SalutationService } from '../services/salutation.service';
import { TitleService } from '../services/title.service';
import { NationalityService } from '../services/nationality.service';
import { RaceService } from '../services/race.service';
import { IndustryTypeService } from '../services/industry-type.service';
import { CountryService } from '../services/country.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { MoneyInputDirective } from '../shared/money-input.directive';
import {
  Country,
  Member,
  Membership,
  MembershipListRow,
  MembershipMeta,
  MembershipOptions,
  MembershipStatusOption,
} from '../models/auth.models';

// Membership Management → Memberships (SRS 2.3 Phase 1).
// The contract list: individual memberships (one auto-created Member) and
// corporate memberships (nominee seats). A Members dialog manages the people -
// nominees under a corporate membership, dependents (spouse/son/daughter/ward)
// under an individual member or a nominee.
@Component({
  selector: 'app-memberships',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent, CanDirective, PhoneInputComponent, MoneyInputDirective],
  templateUrl: './memberships.html',
  styleUrls: ['../system-setup/system-setup.css', './memberships.css'],
})
export class MembershipsComponent implements OnInit {
  private readonly service = inject(MembershipService);
  private readonly salutationService = inject(SalutationService);
  private readonly titleService = inject(TitleService);
  private readonly nationalityService = inject(NationalityService);
  private readonly raceService = inject(RaceService);
  private readonly industryTypeService = inject(IndustryTypeService);
  private readonly countryService = inject(CountryService);
  private readonly fb = inject(FormBuilder);

  // Server-side paginated listing: `rows` holds only the loaded pages; `total`
  // and the class split come from server aggregates.
  readonly rows = signal<MembershipListRow[]>([]);
  readonly total = signal(0);
  readonly counts = signal<{ individual: number; corporate: number }>({ individual: 0, corporate: 0 });
  readonly meta = signal<MembershipMeta | null>(null);
  readonly options = signal<MembershipOptions | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  // Row whose full record is being fetched for the Edit dialog.
  readonly editLoadingId = signal<string | null>(null);

  // Reference-data pickers (subscriber lists + countries).
  readonly salutations = signal<{ salutationCode: string; description?: string | null }[]>([]);
  readonly titles = signal<{ titleCode: string; description?: string | null; countryCode?: string | null }[]>([]);
  readonly nationalities = signal<{ nationalityCode: string; description?: string | null }[]>([]);
  readonly races = signal<{ raceCode: string; description?: string | null }[]>([]);
  readonly industryTypes = signal<{ industryTypeCode: string; description?: string | null }[]>([]);
  readonly countries = signal<Country[]>([]);

  readonly search = signal('');
  readonly classFilter = signal(''); // '' | 'individual' | 'corporate'
  readonly statusFilter = signal(''); // MembershipStatus id or ''
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // Debounced server-side search (the list is paginated - never filter client-side).
  private readonly query$ = new Subject<void>();

  constructor() {
    this.query$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => this.load(true));
  }

  // --- Membership dialog (add + edit share the form) ---
  readonly membershipOpen = signal(false);
  readonly membershipSaving = signal(false);
  readonly editMembership = signal<Membership | null>(null);
  readonly membershipForm = this.fb.nonNullable.group({
    membershipTypeId: ['', [Validators.required]],
    membershipNo: [''],
    membershipStatusId: [''],
    membershipFeeId: [''],
    joinDate: ['', [Validators.required]],
    billingDate: [''],
    creditFlag: [''],
    creditLimit: this.fb.control<number | null>(null),
    terms: this.fb.control<number | null>(null),
    statementMode: [''],
    sendReminders: [false],
    chargeInterest: [false],
    monthlyFee: [false],
    yearlyFee: [false],
    certificateNo: ['', [Validators.maxLength(255)]],
    applicationNo: ['', [Validators.maxLength(255)]],
    reference: ['', [Validators.maxLength(255)]],
    proposer: ['', [Validators.maxLength(255)]],
    salesCode: ['', [Validators.maxLength(255)]],
    followupSalesCode: ['', [Validators.maxLength(255)]],
    corporateName: ['', [Validators.maxLength(255)]],
    registrationNo: ['', [Validators.maxLength(255)]],
    taxNo: ['', [Validators.maxLength(255)]],
    contactPerson: ['', [Validators.maxLength(255)]],
    contactDesignation: ['', [Validators.maxLength(255)]],
    phone: [''],
    fax: [''],
    mobile: [''],
    email: ['', [Validators.email]],
    industryTypeCode: [''],
    address: ['', [Validators.maxLength(255)]],
    postcode: ['', [Validators.maxLength(20)]],
    state: ['', [Validators.maxLength(100)]],
    countryCode: [''],
    mailingSource: ['main'],
    mailingAddress: ['', [Validators.maxLength(255)]],
    mailingPostcode: ['', [Validators.maxLength(20)]],
    mailingState: ['', [Validators.maxLength(100)]],
    mailingCountryCode: [''],
    remarks: ['', [Validators.maxLength(2000)]],
  });

  // --- Person profile form (individual member on create; nominees, dependents,
  // member edits). One instance - the dialogs never open simultaneously. ---
  readonly memberForm = this.fb.nonNullable.group({
    salutationCode: [''],
    titleCode: [''],
    firstName: ['', [Validators.maxLength(255)]],
    middleName: ['', [Validators.maxLength(255)]],
    lastName: ['', [Validators.required, Validators.maxLength(255)]],
    nameOnCard: ['', [Validators.maxLength(255)]],
    localName: ['', [Validators.maxLength(255)]],
    gender: [''],
    birthDate: [''],
    identityNo: ['', [Validators.maxLength(100)]],
    nationalityCode: [''],
    raceCode: [''],
    maritalStatus: [''],
    maritalDate: [''],
    phone: [''],
    mobile: [''],
    fax: [''],
    email: ['', [Validators.email]],
    employerName: ['', [Validators.maxLength(255)]],
    designation: ['', [Validators.maxLength(255)]],
    industryTypeCode: [''],
    residentAddress: ['', [Validators.maxLength(255)]],
    residentPostcode: ['', [Validators.maxLength(20)]],
    residentState: ['', [Validators.maxLength(100)]],
    residentCountryCode: [''],
    mailingSource: ['resident'],
    mailingAddress: ['', [Validators.maxLength(255)]],
    mailingPostcode: ['', [Validators.maxLength(20)]],
    mailingState: ['', [Validators.maxLength(100)]],
    mailingCountryCode: [''],
    joinDate: [''],
    expiryDate: [''],
    creditLimit: this.fb.control<number | null>(null),
    remarks: ['', [Validators.maxLength(2000)]],
  });

  // Member number / kind / status - only rendered in the member dialog.
  readonly memberMetaForm = this.fb.nonNullable.group({
    memberNo: ['', [Validators.required, Validators.maxLength(30)]],
    dependentType: [''],
    memberStatusId: ['', [Validators.required]],
  });

  // Zoneless: templates read form values through signals (same pattern as the
  // Titles screen), so class-conditional sections react to typing.
  readonly msValue = toSignal(this.membershipForm.valueChanges, { initialValue: this.membershipForm.getRawValue() });
  readonly memberValue = toSignal(this.memberForm.valueChanges, { initialValue: this.memberForm.getRawValue() });
  readonly memberMetaValue = toSignal(this.memberMetaForm.valueChanges, { initialValue: this.memberMetaForm.getRawValue() });

  // --- Members dialog (the people under one membership) ---
  readonly membersOpen = signal(false);
  readonly membersLoading = signal(false);
  readonly activeMembership = signal<Membership | null>(null);

  // --- Member dialog (add nominee / add dependent / edit member) ---
  readonly memberDialogMode = signal<'nominee' | 'dependent' | 'edit' | null>(null);
  readonly memberSaving = signal(false);
  readonly editMember = signal<Member | null>(null);
  readonly dependentPrincipal = signal<Member | null>(null);

  readonly individualCount = computed(() => this.counts().individual);
  readonly corporateCount = computed(() => this.counts().corporate);
  readonly totalKnown = computed(() => this.counts().individual + this.counts().corporate);
  readonly hasMore = computed(() => this.rows().length < this.total());

  // The type picked in the (add) membership dialog decides the class + defaults.
  readonly selectedType = computed(() => {
    const id = this.msValue().membershipTypeId;
    return this.options()?.types.find((t) => t.id === id) || null;
  });

  // Add mode: the picked type's class. Edit mode: the record's class.
  readonly dialogClass = computed(() => {
    const editing = this.editMembership();
    if (editing) return editing.membershipClass;
    return this.selectedType()?.membershipClass || '';
  });

  readonly autoNumbering = computed(() => this.meta()?.numberingMode === 'auto');

  // Members-dialog tree: principals (individual member / nominees) with their
  // dependents nested.
  readonly memberTree = computed(() => {
    const members = this.activeMembership()?.members || [];
    return members
      .filter((m) => m.memberKind !== 'dependent')
      .map((p) => ({
        principal: p,
        dependents: members.filter((d) => d.principalMemberId === p.id),
      }));
  });

  readonly nomineeSeatText = computed(() => {
    const ms = this.activeMembership();
    if (!ms || ms.membershipClass !== 'corporate') return '';
    const type = this.options()?.types.find((t) => t.id === ms.membershipTypeId);
    const used = (ms.members || []).filter((m) => m.memberKind === 'nominee').length;
    return type?.noOfNominee != null ? `${used} of ${type.noOfNominee} nominee seats used` : `${used} nominee(s)`;
  });

  readonly nomineeSeatsFull = computed(() => {
    const ms = this.activeMembership();
    if (!ms || ms.membershipClass !== 'corporate') return true;
    const type = this.options()?.types.find((t) => t.id === ms.membershipTypeId);
    if (!type || type.noOfNominee == null) return false;
    return (ms.members || []).filter((m) => m.memberKind === 'nominee').length >= type.noOfNominee;
  });

  readonly membershipDialogTitle = computed(() => {
    const editing = this.editMembership();
    return editing ? `Edit — ${editing.membershipNo}` : 'New membership';
  });

  readonly memberDialogTitle = computed(() => {
    const mode = this.memberDialogMode();
    if (mode === 'nominee') return 'New nominee';
    if (mode === 'dependent') {
      const p = this.dependentPrincipal();
      return `New dependent — under ${p ? this.memberName(p) : ''}`;
    }
    const m = this.editMember();
    return m ? `Edit — ${this.memberName(m)}` : 'Edit member';
  });

  ngOnInit(): void {
    this.load();
    this.service.meta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.service.options().subscribe({ next: (o) => this.options.set(o), error: () => {} });
    this.salutationService.listActive().subscribe({ next: (l) => this.salutations.set(l), error: () => {} });
    this.titleService.listActive().subscribe({ next: (l) => this.titles.set(l), error: () => {} });
    this.nationalityService.listActive().subscribe({ next: (l) => this.nationalities.set(l), error: () => {} });
    this.raceService.listActive().subscribe({ next: (l) => this.races.set(l), error: () => {} });
    this.industryTypeService.listActive().subscribe({ next: (l) => this.industryTypes.set(l), error: () => {} });
    this.countryService.listActive().subscribe({ next: (l) => this.countries.set(l), error: () => {} });

    // The picked type drives class + defaults while adding.
    this.membershipForm.controls.membershipTypeId.valueChanges.subscribe((id) => {
      if (this.editMembership()) return;
      const type = this.options()?.types.find((t) => t.id === id);
      if (!type) return;
      this.membershipForm.patchValue({
        membershipStatusId: type.defaultMembershipStatusId || '',
        membershipFeeId: type.defaultMembershipFeeId || '',
        creditLimit: type.creditLimit ?? null,
      });
    });
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // --- Lookup helpers ---

  classLabel(key: string): string {
    return key === 'corporate' ? 'Corporate' : 'Individual';
  }

  typeCategory(id: string): string {
    return this.options()?.types.find((t) => t.id === id)?.category || '';
  }

  statusName(id: string): string {
    return this.options()?.statuses.find((s) => s.id === id)?.membershipStatus || '';
  }

  statusColor(id: string): string {
    return this.options()?.statuses.find((s) => s.id === id)?.statusColor || 'var(--text-muted)';
  }

  kindLabel(key: string): string {
    return this.optionLabel(this.meta()?.memberKinds, key);
  }

  dependentLabel(key: string | null | undefined): string {
    return key ? this.optionLabel(this.meta()?.dependentTypes, key) : '';
  }

  memberName(m: Member): string {
    return [m.firstName, m.lastName].filter(Boolean).join(' ') || m.memberNo;
  }

  expiryApplies(dependentType: string): boolean {
    return (this.meta()?.expiringDependentTypes || []).includes(dependentType);
  }

  private optionLabel(list: MembershipStatusOption[] | undefined, key: string): string {
    return list?.find((o) => o.key === key)?.label || key;
  }

  // reset=true replaces the list (new search/filter); reset=false appends the
  // next page ("Load more").
  load(reset = true): void {
    const offset = reset ? 0 : this.rows().length;
    if (reset) this.loading.set(true); else this.loadingMore.set(true);
    this.service.list({
      q: this.search().trim(),
      class: this.classFilter(),
      status: this.statusFilter(),
      offset,
    }).subscribe({
      next: (res) => {
        this.rows.set(reset ? res.memberships : [...this.rows(), ...res.memberships]);
        this.total.set(res.total);
        this.counts.set(res.counts);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load memberships.');
      },
    });
  }

  loadMore(): void {
    if (!this.loadingMore() && this.hasMore()) this.load(false);
  }

  onSearchInput(value: string): void {
    this.search.set(value);
    this.query$.next();
  }

  setClassFilter(cls: string): void {
    this.classFilter.set(cls);
    this.load(true);
  }

  setStatusFilter(statusId: string): void {
    this.statusFilter.set(statusId);
    this.load(true);
  }

  // --- Membership dialog ---

  openAdd(): void {
    this.clearMessages();
    this.editMembership.set(null);
    this.membershipForm.reset({
      membershipTypeId: '', membershipNo: '', membershipStatusId: '', membershipFeeId: '',
      joinDate: this.today(), billingDate: '', creditFlag: '', creditLimit: null, terms: null,
      statementMode: '', sendReminders: false, chargeInterest: false, monthlyFee: false, yearlyFee: false,
      certificateNo: '', applicationNo: '', reference: '', proposer: '', salesCode: '', followupSalesCode: '',
      corporateName: '', registrationNo: '', taxNo: '', contactPerson: '', contactDesignation: '',
      phone: '', fax: '', mobile: '', email: '', industryTypeCode: '',
      address: '', postcode: '', state: '', countryCode: '',
      mailingSource: 'main', mailingAddress: '', mailingPostcode: '', mailingState: '', mailingCountryCode: '',
      remarks: '',
    });
    this.resetMemberForm();
    this.membershipOpen.set(true);
  }

  // The list row is slim - fetch the full contract before opening the dialog.
  openEdit(row: MembershipListRow): void {
    this.clearMessages();
    this.editLoadingId.set(row.id);
    this.service.get(row.id).subscribe({
      next: (full) => {
        this.editLoadingId.set(null);
        this.populateEditForm(full);
      },
      error: (err) => {
        this.editLoadingId.set(null);
        this.errorMessage.set(err.error?.message || 'Failed to load the membership.');
      },
    });
  }

  private populateEditForm(ms: Membership): void {
    this.editMembership.set(ms);
    this.membershipForm.reset({
      membershipTypeId: ms.membershipTypeId,
      membershipNo: ms.membershipNo,
      membershipStatusId: ms.membershipStatusId,
      membershipFeeId: ms.membershipFeeId || '',
      joinDate: ms.joinDate,
      billingDate: ms.billingDate || '',
      creditFlag: ms.creditFlag || '',
      creditLimit: ms.creditLimit ?? null,
      terms: ms.terms ?? null,
      statementMode: ms.statementMode || '',
      sendReminders: ms.sendReminders,
      chargeInterest: ms.chargeInterest,
      monthlyFee: ms.monthlyFee,
      yearlyFee: ms.yearlyFee,
      certificateNo: ms.certificateNo || '',
      applicationNo: ms.applicationNo || '',
      reference: ms.reference || '',
      proposer: ms.proposer || '',
      salesCode: ms.salesCode || '',
      followupSalesCode: ms.followupSalesCode || '',
      corporateName: ms.corporateName || '',
      registrationNo: ms.registrationNo || '',
      taxNo: ms.taxNo || '',
      contactPerson: ms.contactPerson || '',
      contactDesignation: ms.contactDesignation || '',
      phone: ms.phone || '',
      fax: ms.fax || '',
      mobile: ms.mobile || '',
      email: ms.email || '',
      industryTypeCode: ms.industryTypeCode || '',
      address: ms.address || '',
      postcode: ms.postcode || '',
      state: ms.state || '',
      countryCode: ms.countryCode || '',
      mailingSource: ms.mailingSource || 'main',
      mailingAddress: ms.mailingAddress || '',
      mailingPostcode: ms.mailingPostcode || '',
      mailingState: ms.mailingState || '',
      mailingCountryCode: ms.mailingCountryCode || '',
      remarks: ms.remarks || '',
    });
    this.membershipOpen.set(true);
  }

  closeMembership(): void {
    this.membershipOpen.set(false);
  }

  onSaveMembership(): void {
    this.clearMessages();
    const editing = this.editMembership();
    const isIndividual = this.dialogClass() === 'individual';

    const invalidContract = this.membershipForm.invalid;
    const invalidPerson = !editing && isIndividual && this.memberForm.invalid;
    if (invalidContract || invalidPerson) {
      this.membershipForm.markAllAsTouched();
      if (!editing && isIndividual) this.memberForm.markAllAsTouched();
      return;
    }
    if (!editing && !this.dialogClass()) {
      this.errorMessage.set('Select a membership type first.');
      return;
    }
    if (!editing && !this.autoNumbering() && !this.membershipForm.getRawValue().membershipNo.trim()) {
      this.errorMessage.set('Membership number is required (no auto-numbering scheme is active).');
      this.membershipForm.controls.membershipNo.markAsTouched();
      return;
    }

    const f = this.membershipForm.getRawValue();
    const payload: Record<string, unknown> = { ...f };
    if (!editing && isIndividual) payload['member'] = this.memberForm.getRawValue();

    this.membershipSaving.set(true);
    const req$ = editing ? this.service.update(editing.id, payload) : this.service.create(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.membershipSaving.set(false);
        this.membershipOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the membership.');
        this.membershipSaving.set(false);
      },
    });
  }

  // --- Members dialog ---

  // Number shown in the dialog title while the full record loads.
  readonly membersTitleNo = signal('');
  private membersId = '';

  openMembers(row: MembershipListRow): void {
    this.clearMessages();
    this.membersTitleNo.set(row.membershipNo);
    this.membersId = row.id;
    this.activeMembership.set(null);
    this.membersOpen.set(true);
    this.reloadActiveMembership();
  }

  closeMembers(): void {
    this.membersOpen.set(false);
    this.activeMembership.set(null);
    this.membersId = '';
  }

  private reloadActiveMembership(): void {
    if (!this.membersId) return;
    this.membersLoading.set(true);
    this.service.get(this.membersId).subscribe({
      next: (full) => {
        this.activeMembership.set(full);
        this.membersLoading.set(false);
      },
      error: (err) => {
        this.membersLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load members.');
      },
    });
  }

  // --- Member dialog (nominee / dependent / edit) ---

  openAddNominee(): void {
    const ms = this.activeMembership();
    if (!ms) return;
    this.startMemberDialog('nominee', null, null);
    this.memberMetaForm.patchValue({ memberStatusId: ms.membershipStatusId });
    this.service.suggestMemberNo(ms.id, ms.membershipNo).subscribe({
      next: (r) => this.memberMetaForm.patchValue({ memberNo: r.memberNo }),
      error: () => {},
    });
  }

  openAddDependent(principal: Member): void {
    const ms = this.activeMembership();
    if (!ms) return;
    this.startMemberDialog('dependent', null, principal);
    this.memberMetaForm.patchValue({ memberStatusId: principal.memberStatusId, dependentType: 'spouse' });
    this.service.suggestMemberNo(ms.id, principal.memberNo).subscribe({
      next: (r) => this.memberMetaForm.patchValue({ memberNo: r.memberNo }),
      error: () => {},
    });
  }

  openEditMember(m: Member): void {
    this.startMemberDialog('edit', m, null);
    this.memberMetaForm.patchValue({
      memberNo: m.memberNo,
      dependentType: m.dependentType || '',
      memberStatusId: m.memberStatusId,
    });
    this.memberForm.patchValue({
      salutationCode: m.salutationCode || '',
      titleCode: m.titleCode || '',
      firstName: m.firstName || '',
      middleName: m.middleName || '',
      lastName: m.lastName,
      nameOnCard: m.nameOnCard || '',
      localName: m.localName || '',
      gender: m.gender || '',
      birthDate: m.birthDate || '',
      identityNo: m.identityNo || '',
      nationalityCode: m.nationalityCode || '',
      raceCode: m.raceCode || '',
      maritalStatus: m.maritalStatus || '',
      maritalDate: m.maritalDate || '',
      phone: m.phone || '',
      mobile: m.mobile || '',
      fax: m.fax || '',
      email: m.email || '',
      employerName: m.employerName || '',
      designation: m.designation || '',
      industryTypeCode: m.industryTypeCode || '',
      residentAddress: m.residentAddress || '',
      residentPostcode: m.residentPostcode || '',
      residentState: m.residentState || '',
      residentCountryCode: m.residentCountryCode || '',
      mailingSource: m.mailingSource || 'resident',
      mailingAddress: m.mailingAddress || '',
      mailingPostcode: m.mailingPostcode || '',
      mailingState: m.mailingState || '',
      mailingCountryCode: m.mailingCountryCode || '',
      joinDate: m.joinDate || '',
      expiryDate: m.expiryDate || '',
      creditLimit: m.creditLimit ?? null,
      remarks: m.remarks || '',
    });
    this.memberForm.markAsPristine();
    this.memberMetaForm.markAsPristine();
  }

  private startMemberDialog(mode: 'nominee' | 'dependent' | 'edit', member: Member | null, principal: Member | null): void {
    this.clearMessages();
    this.memberDialogMode.set(mode);
    this.editMember.set(member);
    this.dependentPrincipal.set(principal);
    if (mode !== 'edit') this.resetMemberForm();
  }

  private resetMemberForm(): void {
    this.memberForm.reset({
      salutationCode: '', titleCode: '', firstName: '', middleName: '', lastName: '',
      nameOnCard: '', localName: '', gender: '', birthDate: '', identityNo: '',
      nationalityCode: '', raceCode: '', maritalStatus: '', maritalDate: '',
      phone: '', mobile: '', fax: '', email: '', employerName: '', designation: '', industryTypeCode: '',
      residentAddress: '', residentPostcode: '', residentState: '', residentCountryCode: '',
      mailingSource: 'resident', mailingAddress: '', mailingPostcode: '', mailingState: '', mailingCountryCode: '',
      joinDate: '', expiryDate: '', creditLimit: null, remarks: '',
    });
    this.memberMetaForm.reset({ memberNo: '', dependentType: '', memberStatusId: '' });
  }

  closeMemberDialog(): void {
    this.memberDialogMode.set(null);
    this.editMember.set(null);
    this.dependentPrincipal.set(null);
  }

  onSaveMember(): void {
    this.clearMessages();
    const ms = this.activeMembership();
    const mode = this.memberDialogMode();
    if (!ms || !mode) return;

    if (this.memberForm.invalid || this.memberMetaForm.controls.memberNo.invalid) {
      this.memberForm.markAllAsTouched();
      this.memberMetaForm.markAllAsTouched();
      return;
    }
    const meta = this.memberMetaForm.getRawValue();
    if (mode === 'dependent' && !meta.dependentType) {
      this.errorMessage.set('Select the dependent type.');
      return;
    }

    const payload: Record<string, unknown> = {
      ...this.memberForm.getRawValue(),
      memberNo: meta.memberNo.trim(),
      memberStatusId: meta.memberStatusId,
      dependentType: meta.dependentType || null,
    };

    this.memberSaving.set(true);
    let req$;
    if (mode === 'nominee') {
      req$ = this.service.createNominee(ms.id, payload);
    } else if (mode === 'dependent') {
      const principal = this.dependentPrincipal();
      if (!principal) return;
      req$ = this.service.createDependent(ms.id, principal.id, payload);
    } else {
      const member = this.editMember();
      if (!member) return;
      req$ = this.service.updateMember(ms.id, member.id, payload);
    }
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.memberSaving.set(false);
        this.closeMemberDialog();
        this.reloadActiveMembership();
        this.load(); // counts on the list cards
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the member.');
        this.memberSaving.set(false);
      },
    });
  }

  clearSearch(): void {
    this.search.set('');
    this.load(true);
  }

  clearFilters(): void {
    this.search.set('');
    this.classFilter.set('');
    this.statusFilter.set('');
    this.load(true);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
