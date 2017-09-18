import * as router from '../src/router';
import { EtcdDaemon } from '../src/etcd-daemon';
import { assert } from 'chai';

const TIMEOUT = 10000;

describe('router', function () {
    let etcd: EtcdDaemon;
    before('start etcd', () => {
        etcd = EtcdDaemon.start();
    });
    after('kill etcd', () => {
        etcd.kill();
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

    it('adds endpoint to etcd', function (done) {
        this.timeout(TIMEOUT);
        setTimeout(done, TIMEOUT);

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

            router.cli(['list-endpoints']).subscribe((list) => {
                const json = JSON.parse(list);

                const node = json.find((child: any) => child['key'] === '/HelloWorld/ClusterWorld/test-service');
                assert.isDefined(node);

                const value = node['value'];
                assert.isDefined(value);
                assert.equal(value, '{"nodes":{"test-service":{"ip":"127.0.0.1","port":8080}},"tls":{"cert":"test3","chain":"test3","key":"test3"}}');

                done();
            });
        });
    });

    it('deletes endpoint from etcd', function (done) {
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
