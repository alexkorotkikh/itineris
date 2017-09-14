import * as Rx from 'rxjs';

import { EndpointInfo } from "./endpoints";
import * as winston from "winston";


export class ServerManager {
    private logger: winston.LoggerInstance;

    constructor(logger: winston.LoggerInstance) {
        this.logger = logger;
    }

    updateEndpoints(changedEndpoint: EndpointInfo): Rx.Observable<string> {
        return Rx.Observable.create((observer: Rx.Observer<string>) => {
            this.logger.info(changedEndpoint.toString());
            observer.next("OK");
        });
    }
}