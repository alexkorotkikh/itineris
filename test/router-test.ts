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
            assert.equal(version, '1.0');
            done();
        });
    });

    it('connects to etcd', (done) => {
        router.cli(['start']).subscribe((start) => {
            assert.equal(start, 'Router started');
            done();
        }, (error) => {
            assert.fail();
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

                const node = json[0]['nodes'][0]['nodes'][0];
                assert.equal(node['key'], '/HelloWorld/ClusterWorld/test-service/nodes/test-node');
                assert.equal(node['value'], '{"ip":"127.0.0.1","port":8080}');

                const tls = json[0]['nodes'][1];
                assert.equal(tls['key'], '/HelloWorld/ClusterWorld/test-service/tls');
                assert.equal(tls['nodes'].length, 3);

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
                router.cli(['list-endpoints']).subscribe((list) => {
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
