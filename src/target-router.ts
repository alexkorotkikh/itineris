import * as http from 'http';
import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';
import * as rq from 'request';
import * as url from 'url';

export class TargetRouter {
  private etc: etcd.EtcdObservable;
  private changeWaiter: etcd.ChangeWaiter;
  private routes: Route[];

  constructor(etc: etcd.EtcdObservable) {
    this.etc = etc;
    this.routes = [];
    this.changeWaiter = etc.createChangeWaiter('targets');
    this.changeWaiter.subscribe(this.updateRoutes);
  }

  route(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.findTarget(req).subscribe((apply: Apply) => {
      apply(req, res);
    })
  }

  private findTarget(req: http.IncomingMessage): Rx.Observable<Apply> {
    return Rx.Observable.create((observer: Rx.Observer<Apply>) => {
      this.getRoute(req, observer) || this.internalError(observer);
    });
  }

  private getRoute(req: http.IncomingMessage, observer: Rx.Observer<Apply>) {
    const route = this.routes.find(route => route.isApplicable(req));
    observer.next((request, response) => {
      request
        .pipe(rq({ qs: url.parse(request.url).query, uri: route.url.toString() }))
        .pipe(response);
    });
  }

  private internalError(observer: Rx.Observer<Apply>) {
    observer.next((req, res) => {
      res.statusCode = 500;
      res.write('500 Internal Server Error');
      res.end();
    });
  }

  private updateRoutes() {
  }
}

interface Route {
  url: URL;

  isApplicable(req: http.IncomingMessage): boolean;
}

interface Apply {
  (req: http.IncomingMessage, res: http.ServerResponse): void;
}