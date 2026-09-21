import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { SystemSetupComponent } from './system-setup';

describe('SystemSetupComponent', () => {
  let component: SystemSetupComponent;
  let fixture: ComponentFixture<SystemSetupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SystemSetupComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SystemSetupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
