import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RegisterLead } from './register-lead';

describe('RegisterLead', () => {
  let component: RegisterLead;
  let fixture: ComponentFixture<RegisterLead>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterLead]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegisterLead);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
