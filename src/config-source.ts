import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';
import * as winston from 'winston';
import { EndPoint } from './endpoint';

export class ConfigSource {
  private etc: etcd.EtcdObservable;
  private logger: winston.LoggerInstance;

  constructor(etc: etcd.EtcdObservable, logger: winston.LoggerInstance) {
    this.etc = etc;
    this.logger = logger;
  }

  start(): Rx.Observable<EndPoint> {
    return Rx.Observable.create((observer: Rx.Observer<EndPoint>) => {
      this.etc.createChangeWaiter('endpoints', { recursive: true })
        .subscribe((res) => {
          try {
            this.logger.info(JSON.stringify(res));
            const endPoint = EndPoint.loadFrom(res.node.value, this.logger);
            this.logger.info(res.isOk().toString());
            observer.next(endPoint);
          } catch (e) {
            observer.error(e);
          }
        })
    });
  }
}