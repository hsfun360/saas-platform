import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SystemSetup } from './system-setup';

describe('SystemSetup', () => {
  let component: SystemSetup;
  let fixture: ComponentFixture<SystemSetup>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SystemSetup]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SystemSetup);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
