import { assert } from 'chai';
import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';
import * as Uuid from 'uuid';
import * as winston from 'winston';

import * as router from '../src/router';
import { Route } from '../src/router';

describe('route cli', () => {
  const log: winston.LoggerInstance = new (winston.Logger)({
    transports: [new (winston.transports.Console)()]
  });

  before(async () => {
    let wc = etcd.Config.start([
      '--etcd-req-timeout', '50',
      '--etcd-url', 'http://localhost:2379'
    ]);
    let etc = etcd.EtcdPromise.create(wc);
    await etc.connect();
    return Promise.resolve('done');
  });
  const uuid = Uuid.v4().toString();

  function routerCli(args: string[]): Rx.Observable<string> {
    return router.cli(args.concat(['--etcd-cluster-id', uuid]));
  }

  function createRoute(routeName: string): Rx.Observable<string> {
    return routerCli([
      'route', 'add',
      '--routeName', routeName,
      '--endpointName', 'test-endpoint',
      '--order', '1',
      '--rule', 'return "test-target"',
    ]);
  }

  function listRoutes(): Rx.Observable<Route[]> {
    return Rx.Observable.create((observer: Rx.Observer<Route[]>) => {
      routerCli(['route', 'list']).subscribe((list) => {
        const objList = JSON.parse(list);
        const routes = objList.map((o: any) => new Route(o.name, o.endpointName, o.order, o.rule, log));
        observer.next(routes);
      });
    });
  }

  it('adds new route', (done) => {
    const routeName = 'add-route';
    createRoute(routeName).subscribe((str) => {
      assert.equal(str, 'route was added');
      listRoutes().subscribe((list) => {
        const route = list.find(r => r.name === routeName);
        assert.isDefined(route);
        assert.equal(route.endpointName, 'test-endpoint');
        assert.equal(route.order, 1);
        assert.equal(route.rule, 'return "test-target"');
        done();
      });
    });
  });

  it('doesn\'t add duplicated route', (done) => {
    const routeName = 'add-duplicate-route';
    createRoute(routeName).subscribe(() => {
      createRoute(routeName).subscribe(console.error, (str) => {
        assert.equal(str, 'route already exists');
        listRoutes().subscribe((list) => {
          const routes = list.filter(r => r.name === routeName);
          assert.equal(routes.length, 1);
          done();
        });
      });
    });
  });

  it('removes route', (done) => {
    const routeName = 'remove-route';
    createRoute(routeName).subscribe(() => {
      routerCli(['route', 'remove', '--routeName', routeName]).subscribe((str) => {
        assert.equal(str, 'route was removed');
        listRoutes().subscribe((list) => {
          const routes = list.filter(r => r.name === routeName);
          assert.equal(routes.length, 0);
          done();
        });
      });
    });
  });

});
