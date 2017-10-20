import { assert } from 'chai';
import * as etcd from 'promise-etcd';
import * as rq from 'request-promise';
import * as Rx from 'rxjs';
import * as Uuid from 'uuid';

import * as router from '../src/router';
import { Endpoint, IpPort } from '../src/endpoint';
import * as winston from 'winston';
import { IPAddress } from 'ipaddress';
import request = require('request');

const TIMEOUT = 2000;

describe('router', function (): void {
  this.timeout(TIMEOUT);

  const log: winston.LoggerInstance = new (winston.Logger)({
    transports: [new (winston.transports.Console)()]
  });

  before(async () => {
    let wc = etcd.Config.start([
      '--etcd-req-timeout', '50',
      '--etcd-url', 'http://localhost:2379'
    ]);
    console.log('etcd Cluster Booted...0');
    let etc = etcd.EtcdPromise.create(wc);
    console.log('etcd Cluster Booted...1');
    await etc.connect();
    console.log('etcd Cluster Booted...2');
    return Promise.resolve('done');
  });

  it('show version', (done) => {
    router.cli(['version']).subscribe((version) => {
      assert.equal(version, '0.1.0');
      done();
    });
  });

  it('reacts on adding and removing endpoints', function (done) {
    this.timeout(5000);

    let uuid = Uuid.v4().toString();

    function routerCli(args: string[]): Rx.Observable<string> {
      return router.cli(args.concat(['--etcd-cluster-id', uuid]));
    }

    function startRouter(): Rx.Observable<string> {
      return router.cli(['start']);
    }

    function addNewEndpoint(num: number): Rx.Observable<Endpoint> {
      const endpointName = 'testEndpoint' + num;
      const nodeName = 'testNode' + num;
      const ip = '127.0.0.1';
      const port = '808' + (num - 1);
      return Rx.Observable.create((observer: Rx.Observer<Endpoint>) => {
        routerCli([
          'endpoint', 'add',
          '--endpointName', endpointName,
        ]).subscribe(() => {
          routerCli([
            'endpoint', 'nodes', 'add',
            '--endpointName', endpointName,
            '--nodeName', nodeName,
          ]).subscribe(() => {
            routerCli([
              'endpoint', 'node', 'add',
              '--endpointName', endpointName,
              '--nodeName', nodeName,
              '--ip', ip,
              '--port', port
            ]).subscribe(() => {
              const endpoint = new Endpoint(endpointName, log);
              const node = endpoint.addNode(nodeName);
              node.addBind(new IpPort(IPAddress.parse(ip), parseInt(port), log));
              observer.next(endpoint)
            })
          })
        });
      });
    }

    function checkIsAccessible(endpoint: Endpoint): Rx.Observable<void> {
      return Rx.Observable.create((observer: Rx.Observer<void>) => {
        function ping(attempts: number) {
          const ipPort = endpoint.listNodes()[0].listBinds()[0];
          rq.get({
            uri: `http://${ipPort.toString()}/`,
            resolveWithFullResponse: true,
          }).then(response => {
            if (attempts > 0) {
              ping(attempts - 1);
            } else {
              assert.fail(response);
            }
          }).catch(err => {
            // rq treats HTTP 500 as exception
            assert.equal(err.statusCode, 500);
            observer.next(null);
          });
        }

        ping(10);
      });
    }

    function checkAddEndpoints(count: number): Rx.Observable<Endpoint[]> {
      return Rx.Observable.create((observer: Rx.Observer<Endpoint[]>) => {
        addNewEndpoint(count).subscribe(endpoint => {
          checkIsAccessible(endpoint).subscribe(() => {
            if (count - 1 > 0) {
              checkAddEndpoints(count - 1).subscribe(() => observer.next(null));
            } else {
              observer.next(null);
            }
          });
        });
      });
    }

    function checkRemoveEndpoints(count: number) {
      return Rx.Observable.create((observer: Rx.Observer<void>) => {
        routerCli(['endpoint', 'list', '--json']).subscribe((strList) => {
          const list = JSON.parse(strList).map((e: any) => Endpoint.loadFrom(e, log));
          assert.equal(list.length, count);
          list.forEach((endpoint: Endpoint) => {
            routerCli(['endpoint', 'remove', '--endpointName', endpoint.name]).subscribe(() => {
              const ipPort = endpoint.nodes[0].listBinds()[0];
              request.get({
                uri: `http://${ipPort.toString()}/`,
                timeout: 100,
              }).on('error', (err) => {
                console.log(err);
              }).on('complete', (resp) => {
              checkRemoveEndpoints(count - 1).subscribe(() => observer.next(null));
              })
            });
          });
        })
      });
    }

    let count = 10;
    startRouter().subscribe(() => {
      checkAddEndpoints(count).subscribe(() => {
        checkRemoveEndpoints(count).subscribe(() =>  {
          if (count === 1) done();
          else count--;
        });
      });
    });
  });
});

