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

  public start(key: string): etcd.ChangeWaiter {
    return this.etc.createChangeWaiter(key, { recursive: true });
  }

  public onNext<T>(res: any, jsonToObject: (json: any, logger: winston.LoggerInstance) => T): Rx.Observable<T[]> {
    return Rx.Observable.create((observer: Rx.Observer<T[]>) => {
      try {
        let jsonArray: any[];
        if (res.node.dir) {
          jsonArray = res.node.nodes.map((n: any) => JSON.parse(n.value));
        } else if (res.action === 'delete') {
          const name = path.basename(res.node.key);
          jsonArray = [{ name: name }];
        } else {
          jsonArray = [JSON.parse(res.node.value)];
        }
        const objects = jsonArray.map(json => jsonToObject(json, this.logger));
        observer.next(objects);
      } catch (e) {
        console.log(e);
        observer.error(e);
      }
    });
  }
}
