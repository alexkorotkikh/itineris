# Version Router
# Prerequisites
```bash
npm install -g ts-node
npm install -g typescript
```
## Endpoints
Endpoints are NodeJS server instances, bind to IP and port according to its configuration
```bash
ts-node src/router-ctl.ts endpoint add --endpointName local
ts-node src/router-ctl.ts endpoint nodes add --endpointName local --nodeName local-node
ts-node src/router-ctl.ts endpoint node add --endpointName local --nodeName local-node --ip 0.0.0.0 --port 1111
ts-node src/router-ctl.ts endpoint set --endpointName test --tls-key key.pem --tls-cert cert.pem 
```
## Targets
Targets are addresses where requests can be routed
```bash
ts-node src/router-ctl.ts target add --targetName test-target
ts-node src/router-ctl.ts target hosts add --targetName test-target --host localhost:1234
```
## Routers
```bash
ts-node src/router-ctl.ts route add --routeName test-route --endpointName test --order 1 --rule "
    return 'test-target';
"
```
To start router:
```bash
ts-node src/router-ctl.ts start
```
### Router rule
Router rule is a javascript snippet that looks like a body of function with one argument `req` of type `http.IncomingMessage`
```typescript
return req.headers['X-Api-Version'] === 1 ? 'target-1' : 'target-default';
```
