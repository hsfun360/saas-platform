export const environment = {
  production: false,
  // Same-origin: the app and the API share one host behind the myeasysoft.com
  // load balancer, which path-routes /api/* to login-api. In production this is
  // served from the same origin, so a relative base needs no host. For local
  // `ng serve`, proxy.conf.json forwards /api to the deployed API.
  apiUrl: '/api'
};
