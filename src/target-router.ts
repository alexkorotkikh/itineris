import * as http from 'http';
import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';

export class TargetRouter {
  private etc: etcd.EtcdObservable;
  private changeWaiter: etcd.ChangeWaiter;

  constructor(etc: etcd.EtcdObservable) {
    this.etc = etc;
    this.changeWaiter = etc.createChangeWaiter('targets');
  }

  route(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.findTarget(req).subscribe((apply: Apply) => {
      apply(req, res);
    })
  }

  private findTarget(req: http.IncomingMessage): Rx.Observable<Apply> {
    return Rx.Observable.create((observer: Rx.Observer<Apply>) => {
      observer.next((req2, res) => {
        res.statusCode = 500;
        res.write('500 Internal Server Error');
        res.end();
      });
    });
  }
}

interface Apply {
  (req: http.IncomingMessage, res: http.ServerResponse): void;
}