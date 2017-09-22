import * as http from 'http';

import * as Rx from 'rxjs';
import * as winston from 'winston';

import { EndPoint } from './endpoint';
import { IncomingMessage } from 'http';
import { ServerResponse } from 'http';

export class ServerManager {
  private logger: winston.LoggerInstance;
  private endpoints: Map<string, EndPoint>;

  constructor(logger: winston.LoggerInstance) {
    this.logger = logger;
    this.endpoints = new Map;
  }

  updateEndpoints(endpoint: EndPoint): Rx.Observable<string> {
    return Rx.Observable.create((observer: Rx.Observer<string>) => {
      this.logger.info(JSON.stringify(endpoint));

      endpoint.nodes.forEach(node => {
        node.listBinds().forEach(bind => {
          if (this.endpoints.has(endpoint.name)) {
            // update happened, swap the server
          } else {
            const server = http.createServer(this.handler);
            server.listen(bind.port, bind.ip.to_string(), (err: any) => {
                if (err) {
                  observer.error(err);
                }
                observer.next(`server is listening on ${bind.ip.to_string()}:${bind.port}`);
              }
            );
          }

        })
      });

      observer.next('OK');
    });
  }

  private handler(req: IncomingMessage, res: ServerResponse) {
    this.logger.debug(`${req.method} ${req.url}`);
  }
}
