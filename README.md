# Version Router
## Endpoints
## Targets
## Routers
### Router rule
Router rule is a javascript snippet that looks like a body of function with one argument `req` of type `http.IncomingMessage`
```typescript
return req.headers['X-Api-Version'] === 1 ? 'target-1' : 'target-default';
```
## Full Example
