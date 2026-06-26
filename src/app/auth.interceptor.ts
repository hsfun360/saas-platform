import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // 🌟 FIX 1: BYPASS THE INTERCEPTOR FOR AUTH ROUTES 🌟
  // If the request is going to /login or /google, let it pass through without attaching any stale tokens!
  if (req.url.includes('/auth/login') || req.url.includes('/auth/google')) {
    return next(req);
  }
  
  const router = inject(Router);
  const token = localStorage.getItem('token');

  let authReq = req;

  // 1. If we have a token, clone the request AND overwrite authReq
  if (token) {
    authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  // 2. Send the modified request to the backend
  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        console.warn('Unauthorized request - Logging out');
        localStorage.clear();
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};