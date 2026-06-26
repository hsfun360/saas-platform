import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SetupPassword } from './setup-password';

describe('SetupPassword', () => {
  let component: SetupPassword;
  let fixture: ComponentFixture<SetupPassword>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupPassword]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SetupPassword);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
