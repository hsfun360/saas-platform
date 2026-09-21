import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { RegisterLeadComponent } from './register-lead';

describe('RegisterLeadComponent', () => {
  let component: RegisterLeadComponent;
  let fixture: ComponentFixture<RegisterLeadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterLeadComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterLeadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
