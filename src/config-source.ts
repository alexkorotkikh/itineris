import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';
import * as winston from 'winston';
import { EndPoint } from './endpoint';
import * as path from 'path';

export class ConfigSource {
  private etc: etcd.EtcdObservable;
  private logger: winston.LoggerInstance;

  constructor(etc: etcd.EtcdObservable, logger: winston.LoggerInstance) {
    this.etc = etc;
    this.logger = logger;
  }

  start(): etcd.ChangeWaiter {
    return this.etc.createChangeWaiter('endpoints', { recursive: true });
  }

  onNext(res: any): Rx.Observable<EndPoint[]> {
    return Rx.Observable.create((observer: Rx.Observer<EndPoint[]>) => {
      try {
        this.logger.info(JSON.stringify(res));
        let endpointsJson: any[];
        try {

        if (res.node.dir) {
          endpointsJson = res.node.nodes.map((n: any) => JSON.parse(n.value))
        } else if (res.action === 'delete') {
          const name = path.basename(res.node.key);
          endpointsJson = [{ name: name }]
        } else {
          endpointsJson = [JSON.parse(res.node.value)];
        }
        console.log(JSON.stringify(endpointsJson));
        } catch(e) {
          console.error(e);
        }
        const endpoints = endpointsJson.map(json => EndPoint.loadFrom(json, this.logger));
        observer.next(endpoints);
      } catch (e) {
        observer.error(e);
      }
    });
  }
}