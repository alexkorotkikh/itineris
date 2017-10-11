import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';
import * as winston from 'winston';
import * as path from 'path';

export class ConfigSource {
  private etc: etcd.EtcdObservable;
  private logger: winston.LoggerInstance;

  constructor(etc: etcd.EtcdObservable, logger: winston.LoggerInstance) {
    this.etc = etc;
    this.logger = logger;
  }

  start(key: string): etcd.ChangeWaiter {
    return this.etc.createChangeWaiter(key, { recursive: true });
  }

  onNext<T>(res: any, jsonToObject: (json: any, logger: winston.LoggerInstance) => T): Rx.Observable<T[]> {
    return Rx.Observable.create((observer: Rx.Observer<T[]>) => {
      try {
        this.logger.info(JSON.stringify(res));
        let json: any[];
        if (res.node.dir) {
          json = res.node.nodes.map((n: any) => JSON.parse(n.value))
        } else if (res.action === 'delete') {
          const name = path.basename(res.node.key);
          json = [{ name: name }]
        } else {
          json = [JSON.parse(res.node.value)];
        }
        const objects = json.map(json => jsonToObject(json, this.logger));
        observer.next(objects);
      } catch (e) {
        console.log(e);
        observer.error(e);
      }
    });
  }
}