import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';
import * as Uuid from 'uuid';

import * as router from '../src/router';
import { assert } from "chai";
import { Endpoint } from "../src/endpoint";
import * as winston from "winston";

describe('endpoint cli', function () {
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
    console.log("Etcd loaded");
    return Promise.resolve('done');
  });

  const uuid = Uuid.v4.toString();

  function routerCli(args: string[]): Rx.Observable<string> {
    return router.cli(args.concat(['--etcd-cluster-id', uuid]));
  }

  function createEndpoint(name: string): Rx.Observable<string> {
    return routerCli(["endpoint", "add", "--endpointName", name]);
  }

  function listEndpoints(): Rx.Observable<Endpoint[]> {
    return Rx.Observable.create((observer: Rx.Observer<Endpoint[]>) => {
      routerCli(["endpoint", "list"]).subscribe((str) => {
        const objs = JSON.parse(str);
        const endpoints = objs.map((obj: any) => Endpoint.loadFrom(obj, log));
        observer.next(endpoints);
      })
    })
  }

  it("adds endpoint", function (done) {
    createEndpoint('test-add-endpoint').subscribe((str) => {
      assert.equal(str, 'endpoint was added');
      listEndpoints().subscribe((list) => {
        assert.equal(list.length, 1);
        assert.equal(list[0].name, 'test-add-endpoint');
        done();
      })
    })
  });

  it("removes endpoint", function (done) {
    createEndpoint('test-remove-endpoint').subscribe(() => {
      listEndpoints().subscribe((list) => {
        const length = list.length;
        routerCli(['endpoint', 'remove', '--endpointName', 'test-remove-endpoint']).subscribe((str) => {
          assert.equal(str, 'endpoint was removed');
          listEndpoints().subscribe((list) => {
            assert.equal(list.length, length - 1);
            done();
          });
        });
      });
    });
  });

  it("set TLS params", function (done) {
    createEndpoint('test-set-endpoint').subscribe(() => {
      routerCli([
        'endpoint', 'set',
        '--endpointName', 'test-set-endpoint',
        '--tls-key', './test/testfile',
        '--tls-cert', './test/testfile',
        '--tls-chain', './test/testfile'
      ]).subscribe((str) => {
        assert.equal(str, 'endpoint options were set');
        listEndpoints().subscribe((list) => {
          const endpoint = list.find(e => e.name === 'test-set-endpoint');
          assert.isDefined(endpoint.tls);
          assert.equal(endpoint.tls.tlsCert, 'test');
          assert.equal(endpoint.tls.tlsChain, 'test');
          assert.equal(endpoint.tls.tlsKey, 'test');
          done();
        });
      })
    });
  });

  it("unset TLS params", function (done) {
    createEndpoint('test-unset-endpoint').subscribe(() => {
      routerCli([
        'endpoint', 'set',
        '--endpointName', 'test-unset-endpoint',
        '--tls-key', './test/testfile',
        '--tls-cert', './test/testfile',
        '--tls-chain', './test/testfile'
      ]).subscribe(() => {
        routerCli([
          'endpoint', 'unset',
          '--endpointName', 'test-unset-endpoint',
        ]).subscribe((str) => {
          assert.equal(str, 'endpoint options were unset');
          listEndpoints().subscribe((list) => {
            const endpoint = list.find(e => e.name === 'test-unset-endpoint');
            assert.isDefined(endpoint.tls);
            assert.isNull(endpoint.tls.tlsCert);
            assert.isNull(endpoint.tls.tlsChain);
            assert.isNull(endpoint.tls.tlsKey);
            done();
          });
        });
      })
    });
  });

});