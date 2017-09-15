import * as http from 'http';

import * as Rx from 'rxjs';
import * as winston from "winston";

import { EndpointInfo } from "./endpoints";


export class ServerManager {
    private logger: winston.LoggerInstance;

    constructor(logger: winston.LoggerInstance) {
        this.logger = logger;
    }

    updateEndpoints(endpoint: EndpointInfo): Rx.Observable<string> {
        return Rx.Observable.create((observer: Rx.Observer<string>) => {
            this.logger.info(JSON.stringify(endpoint));

            const server = http.createServer((req, res) => {
                this.logger.debug(`${req.method} ${req.url}`);
            });

            endpoint.nodeInfos.forEach(nodeInfo => {
                server.listen(nodeInfo.port);
            });

            observer.next("OK");
        });
    }
}