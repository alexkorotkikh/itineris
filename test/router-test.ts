import { assert } from 'chai';
import * as etcd from 'promise-etcd';
import * as rq from 'request-promise';
import * as Rx from 'rxjs';
import * as Uuid from 'uuid';

import * as router from '../src/router';
import { EndPoint, IpPort } from '../src/endpoint';
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

  it('connects to etcd', (done) => {
    router.cli(['start']).subscribe((start) => {
      assert.equal(start, 'Router started');
      done();
    });
  });

  it('adds endpoint to etcd', (done) => {
    let uuid = Uuid.v4().toString();
    router.cli([
      'add-endpoint',
      '--etcd-cluster-id', uuid,
      '--service-name', 'test-service',
      '--node-name', 'test-node',
      '--ip', '127.0.0.1',
      '--port', '8080',
      '--tls-chain', 'test/testfile',
      '--tls-cert', 'test/testfile',
      '--tls-key', 'test/testfile',
    ]).subscribe((add) => {
      assert.equal(add, 'Endpoint was added');
      console.log('1111');

      router.cli(['list-endpoints']).subscribe((list) => {
          console.log('2222.0', list);
          const json = JSON.parse(list);
          console.log('2222.1', json);

          const node = json.find((child: any) => child['key'] === '/HelloWorld/ClusterWorld/test-service');
          console.log('2222.2');
          assert.isDefined(node);

          console.log('2222.3');
          const value = node['value'];
          assert.isDefined(value);
          console.log('2222.4');
          assert.deepEqual(value, {
            'nodes':
              {
                'test-service': { 'ip': '127.0.0.1', 'port': 8080 }
              },
            'tls': {
              'cert': 'test3',
              'chain': 'test3',
              'key': 'test3'
            }
          });
          console.log('2222.5');

          done();
        }, (e) => console.log('Error:', e),
        () => console.log('completed'));
    });
  });

  it('deletes endpoint from etcd', (done) => {
    router.cli([
      'add-endpoint',
      '--service-name', 'service-to-delete',
      '--node-name', 'test-node',
      '--ip', '127.0.0.1',
      '--port', '8080',
      '--tls-chain', 'test/testfile',
      '--tls-cert', 'test/testfile',
      '--tls-key', 'test/testfile',
    ]).subscribe(() => {
      router.cli([
        'delete-endpoint',
        '--service-name', 'service-to-delete',
      ]).subscribe(() => {
        router.cli(['list-endpoints']).subscribe(list => {
          const nodes = JSON.parse(list);
          assert.isTrue(
            nodes.every((node: any) => node['key'] !== '/HelloWorld/ClusterWorld/service-to-delete')
          );
          done();
        });
      });
    });
  });

  it.only('reacts on adding and removing endpoints', function (done) {
    this.timeout(5000);

    let uuid = Uuid.v4().toString();

    function routerCli(args: string[]): Rx.Observable<string> {
      return router.cli(args.concat(['--etcd-cluster-id', uuid]));
    }

    function startRouter(): Rx.Observable<string> {
      return router.cli(['start']);
    }

    function addNewEndpoint(num: number): Rx.Observable<EndPoint> {
      const endpointName = 'testEndpoint' + num;
      const nodeName = 'testNode' + num;
      const ip = '127.0.0.' + num;
      const port = '808' + (num - 1);
      return Rx.Observable.create((observer: Rx.Observer<EndPoint>) => {
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
              const endPoint = new EndPoint(endpointName, log);
              const node = endPoint.addNode(nodeName);
              node.addBind(new IpPort(IPAddress.parse(ip), parseInt(port), log));
              observer.next(endPoint)
            })
          })
        });
      });
    }

    function checkIsAccessible(endPoint: EndPoint): Rx.Observable<void> {
      return Rx.Observable.create((observer: Rx.Observer<void>) => {
        function ping(attempts: number) {
          const ipPort = endPoint.listNodes()[0].listBinds()[0];
          rq.get({
            uri: `http://${ipPort.ip.to_s()}:${ipPort.port}/`,
            resolveWithFullResponse: true,
          }).then(response => {
            assert.isBelow(response.statusCode, 500);
            observer.next(null);
          }).catch(err => {
            if (attempts > 0) {
              ping(attempts - 1);
            }
            else {
              console.log(err);
              assert.fail(err);
            }
          });
        }

        ping(10);
      });
    }

    function checkAddEndpoints(count: number): Rx.Observable<EndPoint[]> {
      return Rx.Observable.create((observer: Rx.Observer<EndPoint[]>) => {
        addNewEndpoint(count).subscribe(endPoint => {
          checkIsAccessible(endPoint).subscribe(() => {
            if (count - 1 > 0) {
              checkAddEndpoints(count - 1);
            } else {
              observer.next(null);
            }
          });
        });
      });
    }

    function checkRemoveEndpoints(count: number) {
      routerCli(['endpoint', 'list', '--json']).subscribe((strList) => {
        const list = JSON.parse(strList).map((e: any) => EndPoint.loadFrom(e, log));
        assert.equal(list.length, 1);
        list.forEach((endPoint: EndPoint) => {
          routerCli(['endpoint', 'remove', '--endpointName', endPoint.name]).subscribe(() => {
            const ipPort = endPoint.nodes[0].listBinds()[0];
            const req = request.get({
              uri: `http://${ipPort.ip.to_s()}:${ipPort.port}/`,
              timeout: 100,
            }).on('error', (err) => {
              console.log(err);
            }).on('complete', (resp) => {
              console.log(resp);
            })


            // .timeout(100)
            // .then(response => {
            //   console.log(response);
            //   assert.isAtMost(response.statusCode, 500);
            //   done();
            // })
            // .catch(bb.TimeoutError, err => {
            //   console.log(err);
            // });
          });
        })
      });
    }

    const count = 1;
    startRouter().subscribe(() => {
      checkAddEndpoints(count).subscribe(() => {
        checkRemoveEndpoints(count);
      });
    });
  });
});

