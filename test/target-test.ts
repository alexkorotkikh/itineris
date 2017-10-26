import * as etcd from 'promise-etcd';
import * as Uuid from 'uuid';
import * as Rx from 'rxjs';
import { assert } from 'chai';
import * as winston from 'winston';

import * as router from '../src/router';
import { Target } from '../src/target-router';

describe('target cli', () => {
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
    console.log('Etcd loaded');
    return Promise.resolve('done');
  });

  const uuid = Uuid.v4.toString();

  function routerCli(args: string[]): Rx.Observable<string> {
    return router.cli(args.concat(['--etcd-cluster-id', uuid]));
  }

  function createTarget(targetName: string): Rx.Observable<string> {
    return routerCli(['target', 'add', '--targetName', targetName]);
  }

  function listTargets(): Rx.Observable<Target[]> {
    return Rx.Observable.create((observer: Rx.Observer<Target>) => {
      routerCli(['target', 'list']).subscribe((str) => {
        const list = JSON.parse(str);
        const targets = list.map((t: any) => Target.loadFrom(t, log));
        observer.next(targets);
      });
    });
  }

  function addHostToTarget(targetName: string, ip?: string, port?: string): Rx.Observable<string> {
    return routerCli([
      'target', 'hosts', 'add',
      '--targetName', targetName,
      '--ip', ip || '123.123.123.123',
      '--port', port || '12345',
    ]);
  }

  it('adds new target', (done) => {
    const targetName = 'add-target';
    createTarget(targetName).subscribe((str) => {
      assert.equal(str, 'target was added');
      listTargets().subscribe((list) => {
        const target = list.find(t => t.name === targetName);
        assert.isDefined(target);
        done();
      });
    });
  });

  it('doesn\'t adds target with duplicated name', (done) => {
    const targetName = 'add-duplicated-target';
    createTarget(targetName).subscribe(() => {
      createTarget(targetName).subscribe(console.error, (str) => {
        assert.equal(str, 'target already exists');
        listTargets().subscribe((list) => {
          const filtered = list.filter(t => t.name === targetName);
          assert.equal(filtered.length, 1);
          done();
        });
      });
    });
  });

  it('removes target', (done) => {
    const targetName = 'remove-target';
    createTarget(targetName).subscribe(() => {
      listTargets().subscribe((list) => {
        const len = list.length;
        routerCli(['target', 'remove', '--targetName', targetName]).subscribe((str) => {
          assert.equal(str, 'target was removed');
          listTargets().subscribe((newList) => {
            assert.equal(newList.length, len - 1);
            done();
          });
        });
      });
    });
  });

  it('sets target\'s metadata', (done) => {
    const targetName = 'set-target';
    createTarget(targetName).subscribe(() => {
      routerCli([
        'target', 'set',
        '--targetName', targetName,
        '--metadata', '{ "testKey": "testVal" }',
      ]).subscribe((str) => {
        assert.equal(str, 'target options were set');
        listTargets().subscribe((list) => {
          const target = list.find(t => t.name === targetName);
          assert.equal(target.metadata.testKey, 'testVal');
          done();
        });
      });
    });
  });

  it('doesn\'t set target\'s metadata if it\'s invalid', (done) => {
    const targetName = 'set-invalid-target';
    createTarget(targetName).subscribe(() => {
      routerCli([
        'target', 'set',
        '--targetName', targetName,
        '--metadata', 'invalid',
      ]).subscribe(console.error, (str) => {
        assert.equal(str, 'metadata is invalid');
        done();
      });
    });
  });

  it('unsets target\'s metadata', (done) => {
    const targetName = 'unset-target';
    createTarget(targetName).subscribe(() => {
      routerCli([
        'target', 'set',
        '--targetName', targetName,
        '--metadata', '{ "testKey": "testVal" }',
      ]).subscribe(() => {
        routerCli([
          'target', 'unset',
          '--targetName', targetName,
        ]).subscribe((str) => {
          assert.equal(str, 'target options were unset');
          listTargets().subscribe((list) => {
            const target = list.find(t => t.name === targetName);
            assert.deepEqual(target.metadata, {});
            done();
          });
        });
      });
    });
  });

  it('adds host to metadata', (done) => {
    const targetName = 'add-host-target';
    createTarget(targetName).subscribe(() => {
      addHostToTarget(targetName).subscribe((str) => {
        assert.equal(str, 'host was added to target');
        listTargets().subscribe((list) => {
          const target = list.find(t => t.name === targetName);
          assert.equal(target.hosts.length, 1);
          assert.equal(target.hosts[0].ip.to_s(), '123.123.123.123');
          assert.equal(target.hosts[0].port, 12345);
          done();
        });
      });
    });
  });

  it('doesn\'t add duplicated host', (done) => {
    const targetName = 'add-duplicated-host-target';
    createTarget(targetName).subscribe(() => {
      addHostToTarget(targetName).subscribe(() => {
        addHostToTarget(targetName).subscribe(console.error, (str) => {
          assert.equal(str, 'host already added');
          listTargets().subscribe((list) => {
            const target = list.find(t => t.name === targetName);
            assert.equal(target.hosts.length, 1);
            done();
          });
        });
      });
    });
  });

  it('doesn\'t add host with invalid ip or port', (done) => {
    const targetName = 'add-invalid-host-target';
    createTarget(targetName).subscribe(() => {
      addHostToTarget(targetName, '256.256.256.256').subscribe(console.error, (str) => {
        assert.equal(str, 'ip and/or port are not valid');
        addHostToTarget(targetName, '123.123.123.123', '77777').subscribe(console.error, (str2) => {
          assert.equal(str2, 'ip and/or port are not valid');
          listTargets().subscribe((list) => {
            const target = list.find(t => t.name === targetName);
            assert.equal(target.hosts.length, 0);
            done();
          });
        });
      });
    });
  });

  it('removes host', (done) => {
    const targetName = 'remove-host-target';
    createTarget(targetName).subscribe(() => {
      addHostToTarget(targetName).subscribe(() => {
        routerCli([
          'target', 'hosts', 'remove',
          '--targetName', targetName,
          '--ip', '123.123.123.123',
          '--port', '12345',
        ]).subscribe((str) => {
          listTargets().subscribe((list) => {
            const target = list.find(t => t.name === targetName);
            assert.equal(target.hosts.length, 0);
            done();
          });
        });
      });
    });
  });
});
