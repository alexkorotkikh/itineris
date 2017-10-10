import * as http from 'http';
import * as https from 'https';

import * as Rx from 'rxjs';
import * as winston from 'winston';

import { Endpoint } from './endpoint';
import { TargetRouter } from './target-router';
import * as net from "net";

interface EndpointServers {
  endpoint: Endpoint;
  servers: net.Server[];
}

export class ServerManager {
  private logger: winston.LoggerInstance;
  private endpointsConfig: Map<string, EndpointServers>;
  private targetRouter: TargetRouter;

  constructor(logger: winston.LoggerInstance, targetRouter: TargetRouter) {
    this.logger = logger;
    this.endpointsConfig = new Map;
    this.targetRouter = targetRouter;
  }

  updateEndpoints(endpoints: Endpoint[]): Rx.Observable<string> {
    return Rx.Observable.create((observer: Rx.Observer<string>) => {
      endpoints.forEach(endpoint => {
        if (this.endpointsConfig.has(endpoint.name)) {
          const outdated = this.endpointsConfig.get(endpoint.name).endpoint;
          if (!endpoint.equals(outdated)) {
            this.shutDownEndpoint(outdated, observer);
            this.spinUpEndpoint(endpoint, observer);
          }
        } else {
          this.spinUpEndpoint(endpoint, observer);
        }
      });
      observer.next('OK');
    });
  }

  private shutDownEndpoint(endpoint: Endpoint, observer: Rx.Observer<string>) {
    const servers = this.endpointsConfig.get(endpoint.name).servers;
    servers.forEach(server => {
      if (server.listening) {
        const address = server.address();
        server.close(() => {
          observer.next(`${address.address}:${address.port} : server closed`)
        });
      }
    });
    this.endpointsConfig.delete(endpoint.name)
  }

  private spinUpEndpoint(endpoint: Endpoint, observer: Rx.Observer<string>) {
    const servers: net.Server[] = [];
    endpoint.nodes.forEach(node => {
      node.listBinds().forEach(bind => {
        const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
          this.logger.info(`${req.method} ${req.url}`);
          this.targetRouter.route(req, res, endpoint);
        };
        try {

          const tlsConfig = this.createTlsConfig(endpoint);
          console.log(tlsConfig.cert);
          const server = tlsConfig ?
            https.createServer(tlsConfig, handler) :
            http.createServer(handler);
          server.listen(bind.port, bind.ip.to_s(), (err: any) => {
            if (err) {
              observer.error(err);
            }
            observer.next(`server is listening on ${bind.ip.to_s()}:${bind.port}`);
          });
          servers.push(server);
        } catch (e) {
          console.log(e);
          observer.error(e);
        }
      });
    });
    this.endpointsConfig.set(endpoint.name, { endpoint: endpoint, servers: servers })
  }

  private createTlsConfig(endpoint: Endpoint) {
    return endpoint.tls && endpoint.tls.tlsKey && endpoint.tls.tlsCert && {
      key: endpoint.tls.tlsKey,
      cert: endpoint.tls.tlsCert,
      // ca: endpoint.tls.tlsChain,
    }
  }
}