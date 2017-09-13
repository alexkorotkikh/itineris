import * as Rx from 'rxjs';

import { EndpointInfo } from "./endpoints";


export class ServerManager {
    private endpoints: EndpointInfo[];

    updateEndpoints(changedEndpoints: EndpointInfo[]): Rx.Observable<string> {
        return Rx.Observable.create((observer: Rx.Observer<string>) => {
            changedEndpoints.forEach(changed => {
                this.endpoints = this.endpoints.filter(e => e.serviceName !== changed.serviceName);
                this.endpoints.push(changed);
            });
            observer.next("OK");
        });
    }
}