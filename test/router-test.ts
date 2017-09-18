import * as router from '../src/router';
import { assert } from 'chai';
import * as etcd from 'promise-etcd';

const TIMEOUT = 2000;

describe('router', function (): void {
    this.timeout(TIMEOUT);

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

    it.only('adds endpoint to etcd', (done) => {

        router.cli([
            'add-endpoint',
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
                assert.deepEqual(value, {'nodes':
                    {'test-service': {'ip': '127.0.0.1', 'port': 8080}
                    },
                    'tls': {'cert': 'test3',
                            'chain': 'test3',
                            'key': 'test3'}
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
});
